const crypto = require('crypto');
const { calculateSufficiency } = require('../../domain/agent/policy');
const { verifyCandidate, inspectUserEdit } = require('../../domain/agent/guardrails');

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
    const candidate = await this.tools.draftRevision({ requirement, facts, sufficiency: task.sufficiency });
    const verification = verifyCandidate(candidate, facts);
    task.candidate = { ...candidate, verification, contentSource: 'ai_generated' };
    task.state = verification.status === 'passed' ? 'awaiting_user_decision' : 'generation_failed';
    this._transition(session, task, task.state, 'CANDIDATE_GENERATED', 'draftRevision');
    return this.repository.save(session);
  }

  async submitAnswer(id, taskId, answer) {
    const session = await this._get(id); const task = this._task(session, taskId);
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
      task.candidate = { text: decision.text, contentSource: 'user_edited', verification: inspectUserEdit(decision.text, this._factsForTask(session, task)) };
      task.state = 'user_edited';
    } else task.state = decision.type;
    this._transition(session, task, task.state, 'USER_DECISION');
    return this.repository.save(session);
  }

  async _get(id) { const value = await this.repository.get(id); if (!value) throw new Error('AGENT_SESSION_NOT_FOUND'); return value; }
  _task(session, id) { const task = session.tasks.find((item) => item.id === id); if (!task) throw new Error('AGENT_TASK_NOT_FOUND'); return task; }
  _factsForTask(session, task) { return session.resumeFacts.filter((fact) => task.factIds.includes(fact.id)); }
  _transition(session, task, to, event, toolName = '') { session.transitions.push({ from: task ? task.state : session.state, to, event, toolName, at: new Date().toISOString() }); }
}

module.exports = { AgentOrchestrator };
