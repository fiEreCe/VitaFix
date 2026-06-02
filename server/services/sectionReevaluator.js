const deepseekService = require('./deepseekService');
const { REEVALUATE_SECTION_PROMPT } = require('../utils/promptTemplates');

/**
 * 单板块重评估服务
 * 用户修改某段简历文字后，重新评估该板块与JD的匹配度
 */
class SectionReevaluator {
  /**
   * 重新评估单个板块
   * @param {Object} jdParsed - JD解析结果
   * @param {Object} originalSection - 原板块分析数据
   * @param {string} revisedText - 用户修改后的文本
   * @returns {Promise<Object>} 更新后的板块分析
   */
  async reevaluate(jdParsed, originalSection, revisedText) {
    const prompt = REEVALUATE_SECTION_PROMPT(jdParsed, originalSection, revisedText);
    const result = await deepseekService.chatJSON(prompt, {
      temperature: 0.15,
      maxTokens: 4096,
    });

    // 校验并返回
    const clampScore = (score) => Math.max(0, Math.min(100, Math.round(score)));

    const comparisons = (result.comparisons || []).map((c) => ({
      ...c,
      item: c.item || '',
      category: ['通用', '垂直'].includes(c.category) ? c.category : '通用',
      jdRequirement: c.jdRequirement || '',
      resumeResponse: c.resumeResponse || '',
      status: ['matched', 'partial', 'unmatched'].includes(c.status) ? c.status : 'unmatched',
      analysis: c.analysis || '',
      barrier: ['low', 'medium', 'high'].includes(c.barrier) ? c.barrier : '',
      learnability: ['low', 'medium', 'high'].includes(c.learnability) ? c.learnability : '',
    }));

    return {
      matchScore: clampScore(result.matchScore),
      comparisons,
      '通用优势': result['通用优势'] || [],
      '通用差距': result['通用差距'] || [],
      '垂直优势': result['垂直优势'] || [],
      '垂直差距': result['垂直差距'] || [],
      suggestions: result.suggestions || [],
    };
  }
}

module.exports = new SectionReevaluator();
