const AgentSession = require('../models/AgentSession');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');
const tools = require('../services/agent/agentToolService');
const { sendError } = require('../utils/appError');

async function loadOwnedInputs(jdId, resumeId, userId) {
  const [jd, resume] = await Promise.all([
    JD.findOne({ _id: jdId, userId }),
    Resume.findOne({ _id: resumeId, userId }),
  ]);
  if (!jd || !resume) throw new Error('INPUT_NOT_FOUND');
  return { jdText: jd.rawText, resumeText: resume.rawText };
}

function createAgentSessionRepository() {
  const persistedFields = [
    'state', 'currentStep', 'currentTaskId', 'inputSnapshot', 'requirements',
    'resumeFacts', 'matches', 'tasks', 'transitions', 'handoff',
  ];
  const persistedChanges = (value) => Object.fromEntries(persistedFields.map((key) => [key, value[key]]));
  return {
    create: async (value) => new AgentSession(value).save(),
    get: async (id, userId) => AgentSession.findOne({ _id: id, userId }),
    save: async (value, userId) => AgentSession.findOneAndUpdate(
      { _id: value._id || value.id, userId },
      { $set: persistedChanges(value) },
      { new: true, runValidators: true },
    ),
    claimAnalysis: async (id, userId, { fromStates, activeStates, to, event, recoveryEvent, toolName, at, token, expiresAt }) => AgentSession.findOneAndUpdate(
      {
        _id: id,
        userId,
        $or: [
          { state: { $in: fromStates } },
          {
            state: { $in: activeStates },
            $or: [
              { analysisClaimExpiresAt: { $exists: false } },
              { analysisClaimExpiresAt: null },
              { analysisClaimExpiresAt: { $lte: new Date(at) } },
            ],
          },
        ],
      },
      [{
        $set: {
          state: to,
          analysisClaimToken: token,
          analysisClaimExpiresAt: expiresAt,
          transitions: {
            $concatArrays: [
              { $ifNull: ['$transitions', []] },
              [{
                from: '$state',
                to,
                event: { $cond: [{ $in: ['$state', activeStates] }, recoveryEvent, event] },
                toolName,
                at,
              }],
            ],
          },
        },
      }],
      { new: true },
    ),
    async saveAnalysis(value, userId, token, { clearClaim = false } = {}) {
      const updated = await AgentSession.findOneAndUpdate(
        { _id: value._id || value.id, userId, analysisClaimToken: token },
        {
          $set: {
            state: value.state,
            currentStep: value.currentStep,
            inputSnapshot: value.inputSnapshot,
            requirements: value.requirements,
            resumeFacts: value.resumeFacts,
            matches: value.matches,
            tasks: value.tasks,
            transitions: value.transitions,
          },
          ...(clearClaim ? { $unset: { analysisClaimToken: 1, analysisClaimExpiresAt: 1 } } : {}),
        },
        { new: true, runValidators: true },
      );
      if (!updated) throw new Error('AGENT_ANALYSIS_CLAIM_LOST');
      return updated;
    },
    renewAnalysisClaim: async (id, userId, token, expiresAt) => AgentSession.findOneAndUpdate(
      { _id: id, userId, analysisClaimToken: token },
      { $set: { analysisClaimExpiresAt: expiresAt } },
      { new: true },
    ),
  };
}

function createAgentSessionController({ orchestrator, loadInputs } = {}) {
  const repository = createAgentSessionRepository();
  const app = orchestrator || new AgentOrchestrator({ repository, tools });
  const getInputs = loadInputs || loadOwnedInputs;
  const ensureOwned = async (req) => { if (!await repository.get(req.params.id, req.userId)) throw new Error('AGENT_SESSION_NOT_FOUND'); };
  const command = (fn) => async (req, res) => { try { await ensureOwned(req); res.json(await fn(req)); } catch (error) { sendError(res, error); } };

  return {
    async create(req, res) { try { const { jdId, resumeId } = req.body || {}; if (!jdId || !resumeId) throw new Error('INPUT_REQUIRED'); const input = await getInputs(jdId, resumeId, req.userId); const session = await app.createSession({ userId: req.userId, jdId, resumeId, ...input }); res.status(201).json({ id: session.id || session._id.toString(), state: session.state }); } catch (error) { sendError(res, error); } },
    async get(req, res) { try { const session = await repository.get(req.params.id, req.userId); if (!session) throw new Error('AGENT_SESSION_NOT_FOUND'); return res.json(session); } catch (error) { return sendError(res, error); } },
    start: command((req) => app.startAnalysis(req.params.id, req.userId)),
    selectTask: command((req) => app.selectTask(req.params.id, req.userId, req.params.taskId)),
    answer: command((req) => { if (!req.body?.answer?.trim()) throw new Error('ANSWER_REQUIRED'); return app.submitAnswer(req.params.id, req.userId, req.params.taskId, req.body.answer.trim()); }),
    reviewFact: command((req) => app.reviewFact(req.params.id, req.userId, req.params.taskId, req.params.factId, req.body?.decision, req.body?.fact)),
    generate: command((req) => app.generateCandidate(req.params.id, req.userId, req.params.taskId)),
    retry: command((req) => app.retryCurrentStep(req.params.id, req.userId, req.params.taskId)),
    validateModification: command((req) => { if (!req.body?.text?.trim()) throw new Error('TEXT_REQUIRED'); return app.validateModification(req.params.id, req.userId, req.params.taskId, req.body.text); }),
    completeWithRisk: command((req) => app.completeWithRisk(req.params.id, req.userId, req.params.taskId)),
    decide: command((req) => app.decide(req.params.id, req.userId, req.params.taskId, req.body)),
    returnControl: command((req) => app.chooseReturnControl(req.params.id, req.userId, req.params.taskId, req.body?.action, req.body?.text)),
    handoff: command((req) => app.getHandoff(req.params.id, req.userId)),
  };
}

module.exports = { createAgentSessionController, createAgentSessionRepository, loadOwnedInputs };
module.exports.default = createAgentSessionController();
