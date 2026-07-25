const AgentSession = require('../models/AgentSession');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');
const tools = require('../services/agent/agentToolService');

function createAgentSessionController({ orchestrator, loadInputs } = {}) {
  const repository = { create: async (value) => new AgentSession(value).save(), get: async (id, userId) => AgentSession.findOne({ _id: id, ...(userId ? { userId } : {}) }), save: async (value) => value.save() };
  const app = orchestrator || new AgentOrchestrator({ repository, tools });
  const getInputs = loadInputs || (async (jdId, resumeId) => {
    const [jd, resume] = await Promise.all([JD.findById(jdId), Resume.findById(resumeId)]);
    if (!jd || !resume) throw new Error('INPUT_NOT_FOUND');
    return { jdText: jd.rawText, resumeText: resume.rawText };
  });
  const fail = (res, error) => res.status(error.message === 'AGENT_SESSION_NOT_FOUND' ? 404 : 400).json({ error: { code: error.message, message: '操作未完成，请检查输入后重试', retryable: true } });
  return {
    async create(req, res) { try { const { jdId, resumeId } = req.body || {}; if (!jdId || !resumeId) throw new Error('INPUT_REQUIRED'); const input = await getInputs(jdId, resumeId); const session = await app.createSession({ userId: req.userId, jdId, resumeId, ...input }); res.status(201).json({ id: session.id || session._id.toString(), state: session.state }); } catch (error) { fail(res, error); } },
    async get(req, res) { const session = await repository.get(req.params.id, req.userId); return session ? res.json(session) : res.status(404).json({ error: { code: 'AGENT_SESSION_NOT_FOUND' } }); },
    async start(req, res) { try { res.json(await app.startAnalysis(req.params.id)); } catch (error) { fail(res, error); } },
    async selectTask(req, res) { try { res.json(await app.selectTask(req.params.id, req.params.taskId)); } catch (error) { fail(res, error); } },
    async generate(req, res) { try { res.json(await app.generateCandidate(req.params.id, req.params.taskId)); } catch (error) { fail(res, error); } },
    async decide(req, res) { try { res.json(await app.decide(req.params.id, req.params.taskId, req.body)); } catch (error) { fail(res, error); } },
  };
}
module.exports = { createAgentSessionController };
module.exports.default = createAgentSessionController();
