const crypto = require('crypto');
const { calculateSufficiency } = require('../../domain/agent/policy');
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

class AgentOrchestrator {
  constructor({ repository, tools }) {
    this.repository = repository;
    this.tools = tools;
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

  async startAnalysis(id) {
    const claimedAt = new Date();
    const session = await this.repository.claimAnalysis(id, {
      fromStates: [...ANALYSIS_STARTABLE_STATES],
      activeStates: [...ANALYSIS_ACTIVE_STATES],
      to: 'parsing',
      event: 'ANALYSIS_STARTED',
      recoveryEvent: 'ANALYSIS_RECOVERED',
      toolName: '',
      at: claimedAt.toISOString(),
      token: crypto.randomUUID(),
      expiresAt: new Date(claimedAt.getTime() + ANALYSIS_LEASE_MS),
    });
    if (!session) {
      const current = await this._get(id);
      if (ANALYSIS_ACTIVE_STATES.has(current.state) || ANALYSIS_FINISHED_STATES.has(current.state)) return current;
      throw new Error('AGENT_ANALYSIS_NOT_STARTABLE');
    }
    const claimToken = session.analysisClaimToken;
    let jd;
    let resume;
    try {
      [jd, resume] = await Promise.all([
        this.tools.parseJD(session.inputSnapshot.jdText), this.tools.parseResume(session.inputSnapshot.resumeText),
      ]);
    } catch (error) {
      this._transition(session, null, 'parsing_failed', 'INPUT_PARSE_FAILED');
      await this.repository.saveAnalysis(session, claimToken, { clearClaim: true });
      throw error;
    }
    session.requirements = jd.requirements;
    session.resumeFacts = resume.facts;
    this._transition(session, null, 'matching', 'INPUT_PARSED');
    let matchResult;
    try {
      matchResult = await this.tools.matchEvidence({ requirements: jd.requirements, facts: resume.facts });
    } catch (error) {
      this._transition(session, null, 'matching_failed', 'EVIDENCE_MATCH_FAILED');
      await this.repository.saveAnalysis(session, claimToken, { clearClaim: true });
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
    return this.repository.saveAnalysis(session, claimToken, { clearClaim: true });
  }

  async selectTask(id, taskId) {
    const session = await this._get(id); const task = this._task(session, taskId);
    session.currentTaskId = taskId;
    const facts = this._factsForTask(session, task);
    task.sufficiency = facts.length ? calculateSufficiency(facts[0]) : 'insufficient';
    this._transition(session, task, task.sufficiency === 'insufficient' ? 'questioning' : 'generating', 'TASK_SELECTED');
    this._transition(session, null, 'task_in_progress', 'TASK_SELECTED');
    return this.repository.save(session);
  }

  async generateCandidate(id, taskId) {
    const session = await this._get(id); const task = this._task(session, taskId);
    const facts = this._factsForTask(session, task).filter((fact) => ['confirmed', 'corrected'].includes(fact.confirmation));
    task.sufficiency = facts.length ? calculateSufficiency(facts[0]) : 'insufficient';
    if (task.sufficiency === 'insufficient') {
      this._transition(session, task, 'questioning', 'INSUFFICIENT_EVIDENCE');
      return this.repository.save(session);
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
    if (verification.status === 'unavailable') {
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
    return this.repository.save(session);
  }

  async submitAnswer(id, taskId, answer) {
    const session = await this._get(id); const task = this._task(session, taskId);
    if (task.effectiveRounds >= 3) {
      this._transition(session, task, 'return_control', 'QUESTION_LIMIT_REACHED');
      return this.repository.save(session);
    }
    if (['不记得', '无法证明'].includes(answer)) {
      task.effectiveRounds += 1;
      this._transition(session, task, task.effectiveRounds >= 3 ? 'return_control' : 'questioning', 'ANSWER_SUBMITTED');
      return this.repository.save(session);
    }
    if (answer === '没有做过') {
      task.gapType = 'capability';
      this._transition(session, task, 'capability_gap', 'ANSWER_SUBMITTED');
      return this.repository.save(session);
    }
    const fact = { id: `fact-${session.resumeFacts.length + 1}`, sourceText: answer, action: answer, context: '', contribution: '', method: '', result: '', quantity: '', confirmation: 'pending_confirmation' };
    session.resumeFacts.push(fact); task.factIds.push(fact.id); task.effectiveRounds += 1; task.pendingFactId = fact.id;
    this._transition(session, task, 'awaiting_fact_confirmation', 'ANSWER_SUBMITTED');
    return this.repository.save(session);
  }

  async reviewFact(id, taskId, factId, decision, factPatch = {}) {
    const session = await this._get(id); const task = this._task(session, taskId); const fact = session.resumeFacts.find((item) => item.id === factId);
    if (!fact) throw new Error('AGENT_FACT_NOT_FOUND');
    if (decision === 'correct') Object.assign(fact, factPatch, { confirmation: 'corrected' });
    else if (decision === 'confirm') fact.confirmation = 'confirmed';
    else if (decision === 'reject') fact.confirmation = 'rejected';
    else throw new Error('INVALID_FACT_DECISION');
    this._transition(session, task, decision === 'reject' ? 'questioning' : 'generating', 'FACT_REVIEWED');
    return this.repository.save(session);
  }

  async decide(id, taskId, decision) {
    const session = await this._get(id); const task = this._task(session, taskId);
    let nextState;
    if (decision.type === 'user_edited') {
      task.validationBaseline = task.validationBaseline || task.candidate?.text || this._factsForTask(session, task).map((fact) => fact.sourceText).join('\n');
      task.candidate = { text: decision.text, contentSource: 'user_edited', verification: inspectUserEdit(decision.text, this._factsForTask(session, task)) };
      nextState = 'user_edited';
    } else {
      if (!['accepted', 'rejected', 'skipped'].includes(decision.type)) throw new Error('INVALID_DECISION');
      if (decision.type === 'accepted' && (task.state !== 'awaiting_user_decision' || !['passed', 'warning'].includes(task.candidate?.verification?.status))) throw new Error('CANDIDATE_NOT_ADOPTABLE');
      nextState = decision.type;
    }
    if (!['accepted', 'rejected', 'skipped', 'user_edited'].includes(nextState)) throw new Error('INVALID_DECISION');
    this._transition(session, task, nextState, 'USER_DECISION');
    if (['accepted', 'user_edited'].includes(nextState)) {
      session.handoff = { taskId, originalText: this._factsForTask(session, task).map((fact) => fact.sourceText).join('\n'), finalText: task.candidate?.text || '', factRefs: task.candidate?.factRefs || task.factIds, contentSource: task.candidate?.contentSource || 'ai_generated', verificationStatus: task.candidate?.verification?.status || 'unavailable', riskAcknowledged: Boolean(decision.riskAcknowledged) };
      this._transition(session, null, 'ready_for_reevaluation', 'USER_DECISION');
    }
    return this.repository.save(session);
  }

  async chooseReturnControl(id, taskId, action, text = '') {
    const session = await this._get(id); const task = this._task(session, taskId);
    if (action === 'continue') { task.effectiveRounds = 0; this._transition(session, task, 'questioning', 'RETURN_CONTROL_CHOSEN'); }
    else if (action === 'skip') this._transition(session, task, 'skipped', 'RETURN_CONTROL_CHOSEN');
    else if (action === 'manual_edit') return this.decide(id, taskId, { type: 'user_edited', text, riskAcknowledged: true });
    else if (action === 'conservative') return this.generateCandidate(id, taskId);
    else throw new Error('INVALID_RETURN_CONTROL_ACTION');
    return this.repository.save(session);
  }

  async getHandoff(id) { const session = await this._get(id); return session.handoff || null; }

  async validateModification(id, taskId, currentText) {
    const session = await this._get(id); const task = this._task(session, taskId);
    const baselineText = task.validationBaseline || task.candidate?.text || this._factsForTask(session, task).map((fact) => fact.sourceText).join('\n');
    const record = validate({ baselineText, currentText, facts: this._factsForTask(session, task), factRefs: task.candidate?.factRefs || task.factIds, semanticJudge: this.tools.evaluateModification });
    task.validationRecords = [...(task.validationRecords || []), record]; task.validationBaseline = currentText; task.currentText = currentText;
    this._transition(session, task, record.safetyStatus === 'blocked' ? 'user_edited' : 'ready_for_reevaluation', 'MODIFICATION_VALIDATED', 'evaluateModification');
    return this.repository.save(session);
  }

  async completeWithRisk(id, taskId) {
    const session = await this._get(id); const task = this._task(session, taskId); const latest = task.validationRecords?.at(-1);
    if (latest?.safetyStatus !== 'blocked') throw new Error('RISK_ACKNOWLEDGEMENT_NOT_AVAILABLE');
    this._transition(session, task, 'completed_with_risk', 'RISK_ACKNOWLEDGED');
    return this.repository.save(session);
  }

  async retryCurrentStep(id, taskId) {
    const session = await this._get(id); const task = this._task(session, taskId);
    if (!['generation_failed', 'verification_failed'].includes(task.state)) throw new Error('TASK_NOT_RETRYABLE');
    if ((task.retryCount || 0) >= 3) throw new Error('TASK_RETRY_LIMIT_REACHED');
    task.retryCount = (task.retryCount || 0) + 1;
    this._transition(session, task, 'generating', 'RETRY_REQUESTED');
    await this.repository.save(session);
    return this.generateCandidate(id, taskId);
  }

  async _get(id) { const value = await this.repository.get(id); if (!value) throw new Error('AGENT_SESSION_NOT_FOUND'); return value; }
  _task(session, id) { const task = session.tasks.find((item) => item.id === id); if (!task) throw new Error('AGENT_TASK_NOT_FOUND'); return task; }
  _factsForTask(session, task) { return session.resumeFacts.filter((fact) => task.factIds.includes(fact.id)); }
  _transition(session, task, to, event, toolName = '') {
    const target = task || session;
    const from = target.state;
    target.state = to;
    session.transitions.push({ from, to, event, toolName, at: new Date().toISOString() });
  }
}

module.exports = { AgentOrchestrator };
