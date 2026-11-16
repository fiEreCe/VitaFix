const mongoose = require('mongoose');
const { SESSION_STATES, TASK_STATES, FACT_CONFIRMATIONS } = require('../domain/agent/contracts');

const factSchema = new mongoose.Schema({
  id: String, sourceText: String, action: String, context: String, contribution: String,
  method: String, result: String, quantity: String, quantityType: { type: String, enum: ['exact', 'estimated', 'unconfirmed'] }, confirmation: { type: String, enum: FACT_CONFIRMATIONS },
  // 用户确认来源：新会话显式记录；历史会话缺少该字段时按“来源未记录”展示，不做批量改写。
  confirmationSource: { type: String, enum: ['auto', 'user'] },
  // 补充/追问事实基于哪条已有事实生成，用于确认时做任务局部替换。
  baseFactId: String,
  // 修正后事实指向的原事实，原事实记录保持不变。
  originalFactId: String,
  source: { type: String, enum: ['resume', 'supplement'] },
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
schema.index({ userId: 1, updatedAt: -1 });
module.exports = mongoose.model('AgentSession', schema);
