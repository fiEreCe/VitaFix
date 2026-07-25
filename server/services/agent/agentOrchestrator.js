const crypto = require('crypto');
const { calculateSufficiency } = require('../../domain/agent/policy');
const { inspectUserEdit } = require('../../domain/agent/guardrails');
const { evaluateCandidate } = require('./pf002Evaluator');
const { validate } = require('./modificationValidator');

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
    const session = await this._get(id);
    this._transition(session, null, 'parsing', 'ANALYSIS_STARTED');
    const [jd, resume] = await Promise.all([
      this.tools.parseJD(session.inputSnapshot.jdText), this.tools.parseResume(session.inputSnapshot.resumeText),
    ]);
    session.requirements = jd.requirements;
    session.resumeFacts = resume.facts;
    this._transition(session, null, 'matching', 'INPUT_PARSED');
    const matchResult = await this.tools.matchEvidence({ requirements: jd.requirements, facts: resume.facts });
    session.matches = matchResult.matches;
    session.tasks = matchResult.matches.map((match, index) => ({
      id: `task-${index + 1}`, requirementId: match.requirementId, factIds: match.factIds || [],
      gapType: match.gapType, priority: match.priority || 0, state: 'pending', effectiveRounds: 0,
      clarificationUsed: false, confirmedFacts: [], candidate: null, recommended: false,
    })).sort((a, b) => b.priority - a.priority);
    if (session.tasks[0]) session.tasks[0].recommended = true;
    this._transition(session, null, 'evidence_ready', 'TASKS_CREATED');
    return this.repository.save(session);
  }

  async selectTask(id, taskId) {
    const session = await this._get(id); const task = this._task(session, taskId);
    task.state = 'assessing_evidence'; session.currentTaskId = taskId;
    const facts = this._factsForTask(session, task);
    task.sufficiency = facts.length ? calculateSufficiency(facts[0]) : 'insufficient';
    task.state = task.sufficiency === 'insufficient' ? 'questioning' : 'generating';
    this._transition(session, task, task.state, 'TASK_SELECTED');
    session.state = 'task_in_progress';
    return this.repository.save(session);
  }

  async generateCandidate(id, taskId) {
    const session = await this._get(id); const task = this._task(session, taskId);
    const facts = this._factsForTask(session, task).filter((fact) => ['confirmed', 'corrected'].includes(fact.confirmation));
    task.sufficiency = facts.length ? calculateSufficiency(facts[0]) : 'insufficient';
    if (task.sufficiency === 'insufficient') { task.state = 'questioning'; return this.repository.save(session); }
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
    task.state = ['passed', 'warning'].includes(verification.status) ? 'awaiting_user_decision' : verification.status === 'unavailable' ? 'verification_failed' : 'generation_failed';
    this._transition(session, task, task.state, 'CANDIDATE_GENERATED', 'draftRevision');
    return this.repository.save(session);
  }

  async submitAnswer(id, taskId, answer) {
    const session = await this._get(id); const task = this._task(session, taskId);
    if (task.effectiveRounds >= 3) { task.state = 'return_control'; return this.repository.save(session); }
    if (['不记得', '无法证明'].includes(answer)) { task.effectiveRounds += 1; task.state = task.effectiveRounds >= 3 ? 'return_control' : 'questioning'; return this.repository.save(session); }
    if (answer === '没有做过') { task.state = 'capability_gap'; task.gapType = 'capability'; return this.repository.save(session); }
    const fact = { id: `fact-${session.resumeFacts.length + 1}`, sourceText: answer, action: answer, context: '', contribution: '', method: '', result: '', quantity: '', confirmation: 'pending_confirmation' };
    session.resumeFacts.push(fact); task.factIds.push(fact.id); task.effectiveRounds += 1; task.pendingFactId = fact.id; task.state = 'awaiting_fact_confirmation';
    this._transition(session, task, task.state, 'ANSWER_SUBMITTED');
    return this.repository.save(session);
  }

  async reviewFact(id, taskId, factId, decision, factPatch = {}) {
    const session = await this._get(id); const task = this._task(session, taskId); const fact = session.resumeFacts.find((item) => item.id === factId);
    if (!fact) throw new Error('AGENT_FACT_NOT_FOUND');
    if (decision === 'correct') Object.assign(fact, factPatch, { confirmation: 'corrected' });
    else if (decision === 'confirm') fact.confirmation = 'confirmed';
    else if (decision === 'reject') fact.confirmation = 'rejected';
    else throw new Error('INVALID_FACT_DECISION');
    task.state = decision === 'reject' ? 'questioning' : 'generating';
    this._transition(session, task, task.state, 'FACT_REVIEWED');
    return this.repository.save(session);
  }

  async decide(id, taskId, decision) {
    const session = await this._get(id); const task = this._task(session, taskId);
    if (decision.type === 'user_edited') {
      task.validationBaseline = task.validationBaseline || task.candidate?.text || this._factsForTask(session, task).map((fact) => fact.sourceText).join('\n');
      task.candidate = { text: decision.text, contentSource: 'user_edited', verification: inspectUserEdit(decision.text, this._factsForTask(session, task)) };
      task.state = 'user_edited';
    } else {
      if (!['accepted', 'rejected', 'skipped'].includes(decision.type)) throw new Error('INVALID_DECISION');
      if (decision.type === 'accepted' && (task.state !== 'awaiting_user_decision' || !['passed', 'warning'].includes(task.candidate?.verification?.status))) throw new Error('CANDIDATE_NOT_ADOPTABLE');
      task.state = decision.type;
    }
    if (!['accepted', 'rejected', 'skipped', 'user_edited'].includes(task.state)) throw new Error('INVALID_DECISION');
    if (['accepted', 'user_edited'].includes(task.state)) {
      session.handoff = { taskId, originalText: this._factsForTask(session, task).map((fact) => fact.sourceText).join('\n'), finalText: task.candidate?.text || '', factRefs: task.candidate?.factRefs || task.factIds, contentSource: task.candidate?.contentSource || 'ai_generated', verificationStatus: task.candidate?.verification?.status || 'unavailable', riskAcknowledged: Boolean(decision.riskAcknowledged) };
      session.state = 'ready_for_reevaluation';
    }
    this._transition(session, task, task.state, 'USER_DECISION');
    return this.repository.save(session);
  }

  async chooseReturnControl(id, taskId, action, text = '') {
    const session = await this._get(id); const task = this._task(session, taskId);
    if (action === 'continue') { task.state = 'questioning'; task.effectiveRounds = 0; }
    else if (action === 'skip') task.state = 'skipped';
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
    task.state = record.safetyStatus === 'blocked' ? 'completed_with_risk' : 'ready_for_reevaluation';
    this._transition(session, task, task.state, 'MODIFICATION_VALIDATED', 'evaluateModification');
    return this.repository.save(session);
  }

  async retryCurrentStep(id, taskId) {
    const session = await this._get(id); const task = this._task(session, taskId);
    if (!['generation_failed', 'verification_failed'].includes(task.state)) throw new Error('TASK_NOT_RETRYABLE');
    if ((task.retryCount || 0) >= 3) throw new Error('TASK_RETRY_LIMIT_REACHED');
    task.retryCount = (task.retryCount || 0) + 1;
    task.state = 'generating';
    this._transition(session, task, task.state, 'RETRY_REQUESTED');
    await this.repository.save(session);
    return this.generateCandidate(id, taskId);
  }

  async _get(id) { const value = await this.repository.get(id); if (!value) throw new Error('AGENT_SESSION_NOT_FOUND'); return value; }
  _task(session, id) { const task = session.tasks.find((item) => item.id === id); if (!task) throw new Error('AGENT_TASK_NOT_FOUND'); return task; }
  _factsForTask(session, task) { return session.resumeFacts.filter((fact) => task.factIds.includes(fact.id)); }
  _transition(session, task, to, event, toolName = '') { session.transitions.push({ from: task ? task.state : session.state, to, event, toolName, at: new Date().toISOString() }); }
}

module.exports = { AgentOrchestrator };
