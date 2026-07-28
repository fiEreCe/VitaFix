const crypto = require('crypto');
const {
  applyAnswerQuality,
  calculateSufficiency,
  mergeFacts,
  nextInsufficientAction,
} = require('../../domain/agent/policy');
const { inspectUserEdit } = require('../../domain/agent/guardrails');
const { evaluateCandidate } = require('./pf002Evaluator');
const { validate } = require('./modificationValidator');

const ANALYSIS_STARTABLE_STATES = new Set(['draft', 'parsing_failed', 'matching_failed']);
const ANALYSIS_ACTIVE_STATES = new Set(['parsing', 'matching']);
const ANALYSIS_FINISHED_STATES = new Set([
  'evidence_ready', 'task_in_progress', 'ready_for_reevaluation',
  'completed', 'cancelled', 'expired',
]);
const ANALYSIS_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_SCHEDULER = {
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  clearInterval: (timer) => clearInterval(timer),
};

class AgentOrchestrator {
  constructor(options) {
    const { repository, tools } = options;
    this.repository = repository;
    this.tools = tools;
    this.analysisLeaseMs = options.analysisLeaseMs ?? ANALYSIS_LEASE_MS;
    this.analysisHeartbeatMs = options.analysisHeartbeatMs ?? Math.floor(this.analysisLeaseMs / 3);
    this.clock = options.clock || (() => new Date());
    this.scheduler = options.scheduler || DEFAULT_SCHEDULER;
  }

  async createSession({ userId, jdText, resumeText, jdId = null, resumeId = null }) {
    const session = {
      id: crypto.randomUUID(), userId, jdId, resumeId,
      state: 'draft', currentStep: 'input_confirmation',
      inputSnapshot: { jdText, resumeText, frozenAt: new Date().toISOString() },
      requirements: [], resumeFacts: [], matches: [], tasks: [], transitions: [],
    };
    return this.repository.create(session);
  }

  async startAnalysis(id, userId) {
    const claimedAt = this.clock();
    const session = await this.repository.claimAnalysis(id, userId, {
      fromStates: [...ANALYSIS_STARTABLE_STATES],
      activeStates: [...ANALYSIS_ACTIVE_STATES],
      to: 'parsing',
      event: 'ANALYSIS_STARTED',
      recoveryEvent: 'ANALYSIS_RECOVERED',
      toolName: '',
      at: claimedAt.toISOString(),
      token: crypto.randomUUID(),
      expiresAt: new Date(claimedAt.getTime() + this.analysisLeaseMs),
    });
    if (!session) {
      const current = await this._get(id, userId);
      if (ANALYSIS_ACTIVE_STATES.has(current.state) || ANALYSIS_FINISHED_STATES.has(current.state)) return current;
      throw new Error('AGENT_ANALYSIS_NOT_STARTABLE');
    }
    const claimToken = session.analysisClaimToken;
    const heartbeat = this._startAnalysisHeartbeat(id, userId, claimToken);
    try {
      await heartbeat.assertOwned();
      let jd;
      let resume;
      try {
        [jd, resume] = await Promise.all([
          this.tools.parseJD(session.inputSnapshot.jdText), this.tools.parseResume(session.inputSnapshot.resumeText),
        ]);
      } catch (error) {
        this._transition(session, null, 'parsing_failed', 'INPUT_PARSE_FAILED');
        await heartbeat.assertOwned(true);
        await this.repository.saveAnalysis(session, userId, claimToken, { clearClaim: true });
        throw error;
      }
      session.requirements = jd.requirements;
      session.resumeFacts = resume.facts;
      await heartbeat.assertOwned(true);
      this._transition(session, null, 'matching', 'INPUT_PARSED');
      let matchResult;
      try {
        matchResult = await this.tools.matchEvidence({ requirements: jd.requirements, facts: resume.facts });
      } catch (error) {
        this._transition(session, null, 'matching_failed', 'EVIDENCE_MATCH_FAILED');
        await heartbeat.assertOwned(true);
        await this.repository.saveAnalysis(session, userId, claimToken, { clearClaim: true });
        throw error;
      }
      session.matches = matchResult.matches;
      session.tasks = matchResult.matches.map((match, index) => ({
        id: `task-${index + 1}`, requirementId: match.requirementId, factIds: match.factIds || [],
        gapType: match.gapType, priority: match.priority || 0, state: 'pending', effectiveRounds: 0,
        clarificationUsed: false, confirmedFacts: [], candidate: null, recommended: false,
      })).sort((a, b) => b.priority - a.priority);
      if (session.tasks[0]) session.tasks[0].recommended = true;
      this._transition(session, null, 'evidence_ready', 'TASKS_CREATED');
      await heartbeat.assertOwned(true);
      return this.repository.saveAnalysis(session, userId, claimToken, { clearClaim: true });
    } finally {
      await heartbeat.stop();
    }
  }

  async selectTask(id, userId, taskId) {
    const session = await this._get(id, userId); const task = this._task(session, taskId);
    session.currentTaskId = taskId;
    const facts = this._confirmedFactsForTask(session, task);
    task.sufficiency = facts.length ? calculateSufficiency(mergeFacts(facts)) : 'insufficient';
    if (task.sufficiency === 'insufficient') {
      task.currentQuestion = task.currentQuestion || this._fallbackQuestion();
      task.questionTarget = task.questionTarget || 'action';
    }
    this._transition(session, task, task.sufficiency === 'insufficient' ? 'questioning' : 'generating', 'TASK_SELECTED');
    this._transition(session, null, 'task_in_progress', 'TASK_SELECTED');
    return this.repository.save(session, userId);
  }

  async generateCandidate(id, userId, taskId) {
    const session = await this._get(id, userId); const task = this._task(session, taskId);
    const facts = this._confirmedFactsForTask(session, task);
    task.sufficiency = facts.length ? calculateSufficiency(mergeFacts(facts)) : 'insufficient';
    if (task.sufficiency === 'insufficient') {
      this._transition(session, task, 'questioning', 'INSUFFICIENT_EVIDENCE');
      return this.repository.save(session, userId);
    }
    const requirement = session.requirements.find((item) => item.id === task.requirementId);
    const draft = async () => {
      try { return await this.tools.draftRevision({ requirement, facts, sufficiency: task.sufficiency }); }
      catch (error) { return { text: '', factRefs: [], generationError: error.message }; }
    };
    const audit = async (value) => {
      try { return this.tools.verifyRevision ? await this.tools.verifyRevision({ candidate: value, facts, requirement }) : evaluateCandidate(value, facts); }
      catch (error) { return { status: 'unavailable', findings: [{ type: 'evaluation_unavailable', message: error.message }] }; }
    };
    let candidate = await draft();
    let verification = await audit(candidate);
    task.evaluationRetryAttempts = 0;
    const semanticAuditUnavailable = () => verification.findings?.some(
      (finding) => finding.type === 'semantic_audit_unavailable',
    );
    if (verification.status === 'unavailable' && !semanticAuditUnavailable()) {
      task.evaluationRetryAttempts = 1;
      candidate = await draft();
      verification = await audit(candidate);
    }
    task.repairAttempts = 0;
    if (verification.status === 'blocked' && typeof this.tools.repairRevision === 'function') {
      task.repairAttempts = 1;
      try {
        candidate = await this.tools.repairRevision({ requirement, facts, candidate, findings: verification.findings, sufficiency: task.sufficiency });
        verification = await audit(candidate);
      } catch (error) {
        verification = { status: 'unavailable', findings: [{ type: 'repair_unavailable', message: error.message }] };
      }
    }
    task.candidate = { ...candidate, verification, contentSource: 'ai_generated' };
    const nextState = ['passed', 'warning'].includes(verification.status) ? 'awaiting_user_decision' : verification.status === 'unavailable' ? 'verification_failed' : 'generation_failed';
    this._transition(session, task, nextState, 'CANDIDATE_GENERATED', 'draftRevision');
    return this.repository.save(session, userId);
  }

  async submitAnswer(id, userId, taskId, answer) {
    const session = await this._get(id, userId); const task = this._task(session, taskId);
    if (task.effectiveRounds >= 3) {
      this._transition(session, task, 'return_control', 'QUESTION_LIMIT_REACHED');
      return this.repository.save(session, userId);
    }
    if (['不记得', '无法证明'].includes(answer)) {
      task.effectiveRounds += 1;
      task.lastAnswerAssessment = {
        quality: 'unknown',
        factPatch: {},
        missingFields: [task.questionTarget || 'action'],
        questionHint: task.currentQuestion || this._fallbackQuestion(),
      };
      task.currentQuestion = this._nextQuestion(task.lastAnswerAssessment);
      this._transition(session, task, task.effectiveRounds >= 3 ? 'return_control' : 'questioning', 'ANSWER_SUBMITTED');
      return this.repository.save(session, userId);
    }
    if (answer === '没有做过') {
      task.gapType = 'capability';
      this._transition(session, task, 'capability_gap', 'ANSWER_SUBMITTED');
      return this.repository.save(session, userId);
    }

    let assessment;
    try {
      assessment = await this.tools.assessAnswer({
        requirement: session.requirements.find((item) => item.id === task.requirementId),
        confirmedFact: mergeFacts(this._confirmedFactsForTask(session, task)),
        question: task.currentQuestion || this._fallbackQuestion(),
        answer,
      });
    } catch (error) {
      task.pendingAnswer = answer;
      task.lastAnswerAssessment = {
        quality: 'unknown',
        factPatch: {},
        missingFields: [],
        questionHint: task.currentQuestion || this._fallbackQuestion(),
        error: error.message,
      };
      this._transition(session, task, 'question_failed', 'ANSWER_ASSESSMENT_FAILED', 'assessAnswer');
      return this.repository.save(session, userId);
    }

    task.pendingAnswer = '';
    task.lastAnswerAssessment = assessment;
    const turn = applyAnswerQuality(task, assessment.quality);
    task.effectiveRounds = turn.effectiveRounds;
    task.clarificationUsed = Boolean(turn.clarificationUsed);
    task.currentQuestion = this._nextQuestion(assessment);
    task.questionTarget = assessment.missingFields?.[0] || '';

    if (assessment.quality === 'off_topic') {
      this._transition(
        session,
        task,
        turn.next === 'return_control' ? 'return_control' : 'questioning',
        'ANSWER_ASSESSED',
        'assessAnswer',
      );
      return this.repository.save(session, userId);
    }
    if (assessment.quality === 'not_done') {
      task.gapType = 'capability';
      this._transition(session, task, 'capability_gap', 'ANSWER_ASSESSED', 'assessAnswer');
      return this.repository.save(session, userId);
    }
    if (['unknown', 'contradictory'].includes(assessment.quality)) {
      const nextState = task.effectiveRounds >= 3 ? 'return_control' : 'questioning';
      this._transition(session, task, nextState, 'ANSWER_ASSESSED', 'assessAnswer');
      return this.repository.save(session, userId);
    }

    const confirmedFacts = this._confirmedFactsForTask(session, task);
    const baseFact = confirmedFacts.at(-1);
    const merged = { ...mergeFacts(confirmedFacts), ...this._nonEmptyPatch(assessment.factPatch) };
    const fact = {
      id: `fact-${session.resumeFacts.length + 1}`,
      sourceText: [baseFact?.sourceText, answer].filter(Boolean).join('\n'),
      action: '', context: '', contribution: '', method: '', result: '', quantity: '',
      quantityType: 'exact',
      ...merged,
      confirmation: 'pending_confirmation',
    };
    session.resumeFacts.push(fact);
    task.factIds.push(fact.id);
    task.pendingFactId = fact.id;
    task.pendingBaseFactId = baseFact?.id || '';
    this._transition(session, task, 'awaiting_fact_confirmation', 'ANSWER_SUBMITTED');
    return this.repository.save(session, userId);
  }

  async reviewFact(id, userId, taskId, factId, decision, factPatch = {}) {
    const session = await this._get(id, userId); const task = this._task(session, taskId); const fact = session.resumeFacts.find((item) => item.id === factId);
    if (!fact) throw new Error('AGENT_FACT_NOT_FOUND');
    if (decision === 'correct') Object.assign(fact, factPatch, { confirmation: 'corrected' });
    else if (decision === 'confirm') fact.confirmation = 'confirmed';
    else if (decision === 'reject') fact.confirmation = 'rejected';
    else throw new Error('INVALID_FACT_DECISION');

    if (decision === 'reject') {
      task.factIds = task.factIds.filter((id) => id !== fact.id);
    } else if (task.pendingBaseFactId) {
      const baseFact = session.resumeFacts.find((item) => item.id === task.pendingBaseFactId);
      if (baseFact) baseFact.confirmation = 'rejected';
      task.factIds = task.factIds.filter((id) => id !== task.pendingBaseFactId);
    }

    task.pendingFactId = '';
    task.pendingBaseFactId = '';
    const confirmedFacts = this._confirmedFactsForTask(session, task);
    task.sufficiency = confirmedFacts.length
      ? calculateSufficiency(mergeFacts(confirmedFacts))
      : 'insufficient';
    const action = decision === 'reject'
      ? 'question'
      : nextInsufficientAction({
        effectiveRounds: task.effectiveRounds,
        sufficiency: task.sufficiency,
      });
    const nextState = action === 'generate'
      ? 'generating'
      : action === 'return_control' ? 'return_control' : 'questioning';
    if (task.sufficiency !== 'insufficient') task.gapType = 'expression';
    if (nextState === 'questioning') {
      task.currentQuestion = this._nextQuestion(task.lastAnswerAssessment);
    } else if (nextState === 'generating') {
      task.currentQuestion = '';
      task.questionTarget = '';
    }
    this._transition(session, task, nextState, 'FACT_REVIEWED');
    return this.repository.save(session, userId);
  }

  async decide(id, userId, taskId, decision) {
    const session = await this._get(id, userId); const task = this._task(session, taskId);
    let nextState;
    if (decision.type === 'user_edited') {
      const originalText = this._factsForTask(session, task).map((fact) => fact.sourceText).join('\n');
      const previousText = task.currentText || task.candidate?.text || originalText;
      const inspection = inspectUserEdit(decision.text, this._factsForTask(session, task));
      task.initialText = task.initialText || originalText;
      task.validationBaseline = previousText;
      task.currentText = decision.text;
      task.riskAcknowledged = false;
      task.candidate = {
        ...(task.candidate || {}),
        text: decision.text,
        factRefs: task.candidate?.factRefs || task.factIds,
        contentSource: 'user_edited',
        verification: {
          ...inspection,
          status: 'unverified_user_content',
        },
      };
      nextState = 'user_edited';
    } else {
      if (!['accepted', 'rejected', 'skipped'].includes(decision.type)) throw new Error('INVALID_DECISION');
      if (decision.type === 'accepted' && (task.state !== 'awaiting_user_decision' || !['passed', 'warning'].includes(task.candidate?.verification?.status))) throw new Error('CANDIDATE_NOT_ADOPTABLE');
      nextState = decision.type;
    }
    if (!['accepted', 'rejected', 'skipped', 'user_edited'].includes(nextState)) throw new Error('INVALID_DECISION');
    if (nextState === 'accepted') {
      task.currentText = task.candidate?.text || '';
      task.riskAcknowledged = false;
    }
    this._transition(session, task, nextState, 'USER_DECISION');
    if (['accepted', 'user_edited'].includes(nextState)) {
      const verificationStatus = nextState === 'user_edited'
        ? 'unverified_user_content'
        : task.candidate?.verification?.status || 'unavailable';
      session.handoff = this._buildHandoff(session, task, {
        finalText: task.candidate?.text || '',
        verificationStatus,
        contentSource: task.candidate?.contentSource || 'ai_generated',
      });
      this._transition(
        session,
        null,
        nextState === 'accepted' ? 'ready_for_reevaluation' : 'task_in_progress',
        'USER_DECISION',
      );
    }
    return this.repository.save(session, userId);
  }

  async chooseReturnControl(id, userId, taskId, action, text = '') {
    const session = await this._get(id, userId); const task = this._task(session, taskId);
    if (action === 'continue') { task.effectiveRounds = 0; this._transition(session, task, 'questioning', 'RETURN_CONTROL_CHOSEN'); }
    else if (action === 'skip') this._transition(session, task, 'skipped', 'RETURN_CONTROL_CHOSEN');
    else if (action === 'manual_edit') return this.decide(id, userId, taskId, { type: 'user_edited', text, riskAcknowledged: true });
    else if (action === 'conservative') return this.generateCandidate(id, userId, taskId);
    else throw new Error('INVALID_RETURN_CONTROL_ACTION');
    return this.repository.save(session, userId);
  }

  async getHandoff(id, userId) { const session = await this._get(id, userId); return session.handoff || null; }

  async validateModification(id, userId, taskId, currentText) {
    const session = await this._get(id, userId); const task = this._task(session, taskId);
    const baselineText = task.validationBaseline || task.candidate?.text || this._factsForTask(session, task).map((fact) => fact.sourceText).join('\n');
    const facts = this._confirmedFactsForTask(session, task);
    const factRefs = task.candidate?.factRefs || task.factIds;
    const requirement = session.requirements.find((item) => item.id === task.requirementId);
    const record = await validate({
      baselineText,
      currentText,
      facts,
      factRefs,
      requirement,
      semanticJudge: typeof this.tools.evaluateModification === 'function'
        ? (input) => this.tools.evaluateModification(input)
        : undefined,
    });
    task.validationRecords = [...(task.validationRecords || []), record];
    task.currentText = currentText;
    task.riskAcknowledged = false;
    task.candidate = {
      ...(task.candidate || {}),
      text: currentText,
      factRefs,
      contentSource: 'user_edited',
      verification: {
        status: record.safetyStatus,
        findings: record.remainingIssues,
        evaluationVersion: record.evaluationVersion,
      },
    };
    if (record.safetyStatus !== 'unavailable') task.validationBaseline = currentText;
    const verified = ['passed', 'warning'].includes(record.safetyStatus);
    this._transition(session, task, verified ? 'ready_for_reevaluation' : 'user_edited', 'MODIFICATION_VALIDATED', 'evaluateModification');
    this._transition(session, null, verified ? 'ready_for_reevaluation' : 'task_in_progress', 'MODIFICATION_VALIDATED', 'evaluateModification');
    session.handoff = this._buildHandoff(session, task, {
      finalText: currentText,
      verificationStatus: record.safetyStatus,
      contentSource: 'user_edited',
    });
    return this.repository.save(session, userId);
  }

  async completeWithRisk(id, userId, taskId) {
    const session = await this._get(id, userId); const task = this._task(session, taskId); const latest = task.validationRecords?.at(-1);
    if (latest?.safetyStatus !== 'blocked') throw new Error('RISK_ACKNOWLEDGEMENT_NOT_AVAILABLE');
    task.riskAcknowledged = true;
    const finalText = task.currentText || task.candidate?.text || '';
    session.handoff = this._buildHandoff(session, task, {
      finalText,
      verificationStatus: 'blocked',
      riskAcknowledged: true,
      contentSource: 'user_edited',
    });
    this._transition(session, task, 'completed_with_risk', 'RISK_ACKNOWLEDGED');
    this._transition(session, null, 'ready_for_reevaluation', 'RISK_ACKNOWLEDGED');
    return this.repository.save(session, userId);
  }

  async retryCurrentStep(id, userId, taskId) {
    const session = await this._get(id, userId); const task = this._task(session, taskId);
    if (!['question_failed', 'generation_failed', 'verification_failed'].includes(task.state)) throw new Error('TASK_NOT_RETRYABLE');
    if ((task.retryCount || 0) >= 3) throw new Error('TASK_RETRY_LIMIT_REACHED');
    task.retryCount = (task.retryCount || 0) + 1;
    if (task.state === 'question_failed') {
      const pendingAnswer = task.pendingAnswer;
      if (!pendingAnswer) throw new Error('ANSWER_RETRY_NOT_AVAILABLE');
      this._transition(session, task, 'questioning', 'RETRY_REQUESTED');
      await this.repository.save(session, userId);
      return this.submitAnswer(id, userId, taskId, pendingAnswer);
    }
    if (
      task.state === 'verification_failed'
      && task.candidate?.verification?.findings?.some(
        (finding) => finding.type === 'semantic_audit_unavailable',
      )
    ) {
      return this._retryCandidateVerification(session, task, userId);
    }
    this._transition(session, task, 'generating', 'RETRY_REQUESTED');
    await this.repository.save(session, userId);
    return this.generateCandidate(id, userId, taskId);
  }

  async _get(id, userId) { const value = await this.repository.get(id, userId); if (!value) throw new Error('AGENT_SESSION_NOT_FOUND'); return value; }
  _task(session, id) { const task = session.tasks.find((item) => item.id === id); if (!task) throw new Error('AGENT_TASK_NOT_FOUND'); return task; }
  _factsForTask(session, task) { return session.resumeFacts.filter((fact) => task.factIds.includes(fact.id)); }
  _confirmedFactsForTask(session, task) {
    return this._factsForTask(session, task)
      .filter((fact) => ['confirmed', 'corrected'].includes(fact.confirmation));
  }
  _fallbackQuestion() {
    return '请补充你本人具体做了什么、服务对象，以及使用的方法或产出。';
  }
  _nextQuestion(assessment = {}) {
    if (assessment.questionHint) return assessment.questionHint;
    const field = assessment.missingFields?.[0];
    return ({
      action: '你具体做了什么？',
      context: '这项工作服务于什么场景或对象？',
      contribution: '其中由你本人负责的部分是什么？',
      method: '你使用了什么方法？',
      result: '最终形成了什么结果或产出？',
    })[field] || this._fallbackQuestion();
  }
  _nonEmptyPatch(value = {}) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => (
      item !== undefined && item !== null && item !== ''
    )));
  }
  _buildHandoff(session, task, {
    finalText,
    verificationStatus,
    riskAcknowledged = false,
    contentSource = 'user_edited',
  }) {
    return {
      taskId: task.id,
      originalText: task.initialText
        || this._factsForTask(session, task).map((fact) => fact.sourceText).join('\n'),
      finalText,
      factRefs: task.candidate?.factRefs || task.factIds,
      contentSource,
      verificationStatus,
      riskAcknowledged,
    };
  }
  async _retryCandidateVerification(session, task, userId) {
    const facts = this._confirmedFactsForTask(session, task);
    const requirement = session.requirements.find((item) => item.id === task.requirementId);
    const { verification: _previous, contentSource: _source, ...candidate } = task.candidate;
    let verification;
    try {
      verification = this.tools.verifyRevision
        ? await this.tools.verifyRevision({ candidate, facts, requirement })
        : evaluateCandidate(candidate, facts);
    } catch (error) {
      verification = {
        status: 'unavailable',
        findings: [{ type: 'semantic_audit_unavailable', message: error.message }],
        factRefs: candidate.factRefs || [],
      };
    }
    task.candidate.verification = verification;
    const nextState = ['passed', 'warning'].includes(verification.status)
      ? 'awaiting_user_decision'
      : verification.status === 'unavailable' ? 'verification_failed' : 'generation_failed';
    this._transition(session, task, nextState, 'CANDIDATE_REVERIFIED', 'verifyRevision');
    return this.repository.save(session, userId);
  }
  _startAnalysisHeartbeat(id, userId, token) {
    let stopped = false;
    let claimLost = false;
    let renewal = null;
    const renew = () => {
      if (stopped || claimLost || renewal) return renewal || Promise.resolve();
      const expiresAt = new Date(this.clock().getTime() + this.analysisLeaseMs);
      renewal = Promise.resolve()
        .then(() => this.repository.renewAnalysisClaim(id, userId, token, expiresAt))
        .then((value) => { if (!value) claimLost = true; })
        .catch(() => { claimLost = true; })
        .finally(() => { renewal = null; });
      return renewal;
    };
    const timer = this.scheduler.setInterval(() => { void renew(); }, this.analysisHeartbeatMs);
    return {
      assertOwned: async (renewNow = false) => {
        if (renewNow) await renew();
        else if (renewal) await renewal;
        if (claimLost) throw new Error('AGENT_ANALYSIS_CLAIM_LOST');
      },
      stop: async () => {
        stopped = true;
        this.scheduler.clearInterval(timer);
        if (renewal) await renewal;
      },
    };
  }
  _transition(session, task, to, event, toolName = '') {
    const target = task || session;
    const from = target.state;
    target.state = to;
    session.transitions.push({ from, to, event, toolName, at: new Date().toISOString() });
  }
}

module.exports = { AgentOrchestrator };
