const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema({
  rawText: { type: String, required: true },
  parsed: {
    // 个人信息（可选）
    personalInfo: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    // 教育背景
    education: [{
      school: { type: String },
      major: { type: String },
      degree: { type: String },
      period: { type: String },
      description: { type: String },
    }],
    // 工作经历
    experience: [{
      company: { type: String },
      position: { type: String },
      period: { type: String },
      description: { type: String },
      highlights: [{ type: String }],
    }],
    // 项目经历
    projects: [{
      name: { type: String },
      role: { type: String },
      period: { type: String },
      description: { type: String },
      highlights: [{ type: String }],
    }],
    // 技能
    skills: [{ type: String }],
    // 证书/语言
    certifications: [{ type: String }],
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Resume', resumeSchema);
