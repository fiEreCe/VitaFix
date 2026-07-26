const mongoose = require('mongoose');

const supplementSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
  items: [{
    type: { type: String, enum: ['实习', '项目', '竞赛', '志愿者', '其他'] },
    title: { type: String, required: true },
    description: { type: String },
    period: { type: String },
    includedInResume: { type: Boolean, default: false },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

supplementSchema.pre('save', function () {
  this.updatedAt = new Date();
});

supplementSchema.index(
  { userId: 1, resumeId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'string' } } },
);

module.exports = mongoose.model('Supplement', supplementSchema);
