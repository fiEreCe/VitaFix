const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, default: '未命名分析' },
  jdId: { type: mongoose.Schema.Types.ObjectId, ref: 'JD', required: true },
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
  supplementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplement', default: null },

  // 分析结果
  analysis: {
    overallScore: { type: Number, default: 0 },
    overallGrade: { type: String, default: '' },
    summary: { type: String, default: '' },

    // 六大维度
    dimensions: [{
      key: { type: String },
      name: { type: String },
      score: { type: Number },
      detail: { type: String },
      matchedItems: [{
        item: { type: String },
        relevance: { type: String },
      }],
      gapItems: [{
        item: { type: String },
        suggestion: { type: String },
      }],
    }],

    // JD需求逐项匹配清单
    requirementChecklist: [{
      requirement: { type: String },
      status: { type: String, enum: ['matched', 'partial', 'unmatched'] },
      matchedSections: [{
        sectionType: { type: String },  // experience | education | project | skill
        sectionIndex: { type: Number },
        label: { type: String },
        evidence: { type: String },
      }],
      suggestion: { type: String },
    }],

    // 简历各板块分析（结构化思维链）
    sectionAnalysis: [{
      sectionType: { type: String },  // experience | education | project | skill
      sectionIndex: { type: Number },
      label: { type: String },
      matchScore: { type: Number },
      originalText: { type: String },

      // 结构化分析
      jdExpectations: { type: String },   // JD对该板块的核心要求
      resumeSummary: { type: String },    // 简历该板块的实际情况

      // 逐项比对（含通用/垂直分类）
      comparisons: [{
        item: { type: String },          // 比对要点名称
        category: { type: String, enum: ['通用', '垂直'] },  // 通用能力/垂直领域能力
        jdRequirement: { type: String }, // JD侧要求
        resumeResponse: { type: String }, // 简历侧事实
        status: { type: String, enum: ['matched', 'partial', 'unmatched'] },
        analysis: { type: String },       // 推理过程
        // 行业壁垒与知识易学度评估
        barrier: { type: String },    // 进入该领域的门槛（low/medium/high）
        barrierReason: { type: String },  // 壁垒原因
        learnability: { type: String }, // 知识易学度（low/medium/high）
        learnabilityReason: { type: String }, // 易学度原因
        advice: { type: String },         // 综合建议
      }],

      // 优劣分析（按类别拆分）
      '通用优势': [{ type: String }],
      '通用差距': [{ type: String }],
      '垂直优势': [{ type: String }],
      '垂直差距': [{ type: String }],

      // 改进建议
      suggestions: [{ type: String }],

      // 向后兼容
      matchedRequirements: [{ type: String }],
    }],
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  errorMessage: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

analysisSchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('Analysis', analysisSchema);
