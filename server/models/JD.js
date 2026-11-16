const mongoose = require('mongoose');

const jdSchema = new mongoose.Schema({
  retentionVersion: { type: Number, default: 0 },
  userId: { type: String, index: true },
  rawText: { type: String, required: true },
  parsed: {
    company: { type: String, default: '' },
    position: { type: String, default: '' },
    requirements: [{ type: String }],
    skills: [{ type: String }],
    experience: { type: String, default: '' },
    education: { type: String, default: '' },
    responsibilities: [{ type: String }],
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('JD', jdSchema);
