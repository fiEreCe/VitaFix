const AgentSession = require('../models/AgentSession');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');
const tools = require('../services/agent/agentToolService');

function createAgentSessionController({ orchestrator, loadInputs } = {}) {
  const repository = {
    create: async (value) => new AgentSession(value).save(),
    get: async (id, userId) => AgentSession.findOne({ _id: id, ...(userId ? { userId } : {}) }),
    save: async (value) => value.save(),
  };
  const app = orchestrator || new AgentOrchestrator({ repository, tools });
  const getInputs = loadInputs || (async (jdId, resumeId) => {
    const [jd, resume] = await Promise.all([JD.findById(jdId), Resume.findById(resumeId)]);
    if (!jd || !resume) throw new Error('INPUT_NOT_FOUND');
    return { jdText: jd.rawText, resumeText: resume.rawText };
  });
  const fail = (res, error) => res.status(error.message === 'AGENT_SESSION_NOT_FOUND' ? 404 : 400).json({ error: { code: error.message, message: '操作未完成，请检查输入后重试', retryable: true } });
  const ensureOwned = async (req) => { if (!await repository.get(req.params.id, req.userId)) throw new Error('AGENT_SESSION_NOT_FOUND'); };
  const command = (fn) => async (req, res) => { try { await ensureOwned(req); res.json(await fn(req)); } catch (error) { fail(res, error); } };

  return {
    async create(req, res) { try { const { jdId, resumeId } = req.body || {}; if (!jdId || !resumeId) throw new Error('INPUT_REQUIRED'); const input = await getInputs(jdId, resumeId); const session = await app.createSession({ userId: req.userId, jdId, resumeId, ...input }); res.status(201).json({ id: session.id || session._id.toString(), state: session.state }); } catch (error) { fail(res, error); } },
    async get(req, res) { const session = await repository.get(req.params.id, req.userId); return session ? res.json(session) : res.status(404).json({ error: { code: 'AGENT_SESSION_NOT_FOUND' } }); },
    start: command((req) => app.startAnalysis(req.params.id)),
    selectTask: command((req) => app.selectTask(req.params.id, req.params.taskId)),
    answer: command((req) => { if (!req.body?.answer?.trim()) throw new Error('ANSWER_REQUIRED'); return app.submitAnswer(req.params.id, req.params.taskId, req.body.answer.trim()); }),
    reviewFact: command((req) => app.reviewFact(req.params.id, req.params.taskId, req.params.factId, req.body?.decision, req.body?.fact)),
    generate: command((req) => app.generateCandidate(req.params.id, req.params.taskId)),
    retry: command((req) => app.retryCurrentStep(req.params.id, req.params.taskId)),
    decide: command((req) => app.decide(req.params.id, req.params.taskId, req.body)),
    returnControl: command((req) => app.chooseReturnControl(req.params.id, req.params.taskId, req.body?.action, req.body?.text)),
    handoff: command((req) => app.getHandoff(req.params.id)),
  };
}

module.exports = { createAgentSessionController };
module.exports.default = createAgentSessionController();
