const path = require('path');
const fs = require('fs');
const deepseekService = require('./deepseekService');
const { MATCH_ANALYSIS_PROMPT } = require('../utils/promptTemplates');

/**
 * 匹配分析服务 - 核心引擎
 * 分析JD与简历的匹配程度
 */
class MatchAnalyzer {
  constructor() {
    this._synonyms = null;
  }

  /**
   * 加载技能同义词表
   */
  _loadSynonyms() {
    if (this._synonyms) return this._synonyms;
    try {
      const filePath = path.join(__dirname, '../data/skill-synonyms.json');
      const raw = fs.readFileSync(filePath, 'utf-8');
      this._synonyms = JSON.parse(raw);
    } catch {
      console.warn('技能同义词表加载失败，使用空表');
      this._synonyms = {};
    }
    return this._synonyms;
  }

  /**
   * 将同义词表格式化为提示词中可读的文本
   */
  _formatSynonymsForPrompt() {
    const synonyms = this._loadSynonyms();
    const entries = Object.entries(synonyms).filter(([key]) => !key.startsWith('_'));
    // 只取前 30 组最常见的同义词，避免提示词过长
    const top = entries.slice(0, 30);
    return top.map(([canonical, aliases]) => {
      return `${canonical} = ${aliases.join(', ')}`;
    }).join('\n');
  }

  /**
   * 执行匹配分析
   * @param {Object} jdParsed - JD解析结果
   * @param {Object} resumeParsed - 简历解析结果
   * @param {Array} supplements - 补充信息（可选）
   * @returns {Promise<Object>} 分析结果
   */
  async analyze(jdParsed, resumeParsed, supplements = []) {
    const skillSynonyms = this._formatSynonymsForPrompt();
    const prompt = MATCH_ANALYSIS_PROMPT(jdParsed, resumeParsed, supplements, skillSynonyms);
    const result = await deepseekService.chatJSON(prompt, {
      temperature: 0.15, // 稍降温度，提高一致性
      maxTokens: 8192,   // 分析结果较长，需要更多token
    });

    // 校验并修正结果
    return this._validate(result);
  }

  /**
   * 校验并修正分析结果，确保数据合理性
   */
  _validate(result) {
    // 确保分数在 0-100 范围内
    const clampScore = (score) => Math.max(0, Math.min(100, Math.round(score)));

    // 1. 修正 overallScore
    const rawScore = result.overallScore;
    const clampedScore = clampScore(rawScore);
    const computedGrade = this._determineGrade(clampedScore);

    // 2. 如果 LLM 返回的等级与分数不符，以分数为准
    if (result.overallGrade !== computedGrade) {
      console.log(`等级修正: "${result.overallGrade}" → "${computedGrade}"（分数 ${rawScore} → ${clampedScore}）`);
    }

    // 3. 校验各维度分数
    const dimensions = (result.dimensions || []).map((d) => ({
      ...d,
      score: clampScore(d.score),
      matchedItems: d.matchedItems || [],
      gapItems: d.gapItems || [],
    }));

    // 4. 维度间一致性检查：如果有维度异常偏离平均分 >40，打日志（不修正，仅告警）
    if (dimensions.length > 0) {
      const avgScore = dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
      dimensions.forEach((d) => {
        if (Math.abs(d.score - avgScore) > 40) {
          console.warn(`维度分数异常: ${d.name}(${d.score}) 偏离均值(${Math.round(avgScore)})超过40分`);
        }
      });
    }

    // 5. 计算实际维度平均分，如果与 overallScore 差异 >15，用平均分替代
    const dimAvg = dimensions.length > 0
      ? Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)
      : clampedScore;
    const finalScore = Math.abs(clampedScore - dimAvg) > 15 ? dimAvg : clampedScore;

    if (finalScore !== clampedScore) {
      console.log(`整体分数修正: ${clampedScore} → ${finalScore}（维度平均分 ${dimAvg}，差异过大）`);
    }

    // 6. 确保 requirementChecklist 每个项有合法 status
    const requirementChecklist = (result.requirementChecklist || []).map((item) => ({
      ...item,
      status: ['matched', 'partial', 'unmatched'].includes(item.status) ? item.status : 'unmatched',
      matchedSections: item.matchedSections || [],
      suggestion: item.suggestion || '',
    }));

    // 7. 确保 sectionAnalysis 完整（含新结构化字段）
    const sectionAnalysis = (result.sectionAnalysis || []).map((s) => ({
      ...s,
      matchScore: clampScore(s.matchScore),
      matchedRequirements: s.matchedRequirements || [],
      suggestions: s.suggestions || [],

      // 新结构化字段
      jdExpectations: s.jdExpectations || '',
      resumeSummary: s.resumeSummary || '',
      comparisons: (s.comparisons || []).map((c) => ({
        ...c,
        item: c.item || '',
        category: ['通用', '垂直'].includes(c.category) ? c.category : '通用',
        jdRequirement: c.jdRequirement || '',
        resumeResponse: c.resumeResponse || '',
        status: ['matched', 'partial', 'unmatched'].includes(c.status) ? c.status : 'unmatched',
        analysis: c.analysis || '',
        barrier: ['low', 'medium', 'high'].includes(c.barrier) ? c.barrier : '',
        learnability: ['low', 'medium', 'high'].includes(c.learnability) ? c.learnability : '',
      })),
      '通用优势': s['通用优势'] || [],
      '通用差距': s['通用差距'] || [],
      '垂直优势': s['垂直优势'] || [],
      '垂直差距': s['垂直差距'] || [],
    }));

    return {
      overallScore: finalScore,
      overallGrade: this._determineGrade(finalScore),
      summary: result.summary || '',
      dimensions,
      requirementChecklist,
      sectionAnalysis,
    };
  }

  /**
   * 根据分数确定等级
   */
  _determineGrade(score) {
    if (score >= 90) return '优秀';
    if (score >= 75) return '良好';
    if (score >= 60) return '一般';
    return '待提升';
  }
}

module.exports = new MatchAnalyzer();
