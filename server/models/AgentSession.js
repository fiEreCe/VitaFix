const mongoose = require('mongoose');
const { SESSION_STATES, TASK_STATES, FACT_CONFIRMATIONS } = require('../domain/agent/contracts');

const factSchema = new mongoose.Schema({
  id: String, sourceText: String, action: String, context: String, contribution: String,
  method: String, result: String, quantity: String, quantityType: { type: String, enum: ['exact', 'estimated', 'unconfirmed'] }, confirmation: { type: String, enum: FACT_CONFIRMATIONS },
}, { _id: false });
const taskSchema = new mongoose.Schema({
  id: String, requirementId: String, factIds: [String], gapType: String, priority: Number,
  state: { type: String, enum: TASK_STATES }, effectiveRounds: Number, clarificationUsed: Boolean,
  confirmedFacts: [factSchema], candidate: mongoose.Schema.Types.Mixed, recommended: Boolean, sufficiency: String, retryCount: Number, repairAttempts: Number, evaluationRetryAttempts: Number, validationRecords: [mongoose.Schema.Types.Mixed], validationBaseline: String, currentText: String,
  pendingFactId: String, pendingBaseFactId: String, currentQuestion: String, questionTarget: String,
  pendingAnswer: String, lastAnswerAssessment: mongoose.Schema.Types.Mixed, initialText: String,
  riskAcknowledged: { type: Boolean, default: false },
}, { _id: false });
const transitionSchema = new mongoose.Schema({ from: String, to: String, event: String, toolName: String, at: String }, { _id: false });
const schema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, jdId: { type: mongoose.Schema.Types.ObjectId, ref: 'JD' },
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume' }, state: { type: String, enum: SESSION_STATES, default: 'draft' },
  currentStep: String, currentTaskId: String, inputSnapshot: mongoose.Schema.Types.Mixed,
  analysisClaimToken: String, analysisClaimExpiresAt: Date,
  requirements: [mongoose.Schema.Types.Mixed], resumeFacts: [factSchema], matches: [mongoose.Schema.Types.Mixed],
  tasks: [taskSchema], transitions: [transitionSchema], handoff: mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), expires: 0 },
}, { timestamps: true });
module.exports = mongoose.model('AgentSession', schema);
