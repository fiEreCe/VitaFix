const deepseekService = require('./deepseekService');
const { JD_PARSE_PROMPT } = require('../utils/promptTemplates');

/**
 * JD解析服务 - 调用AI解析JD文本
 */
class JDParser {
  /**
   * 解析JD文本
   * @param {string} rawText - 原始JD文本
   * @returns {Promise<Object>} 解析后的结构化数据
   */
  async parse(rawText) {
    if (!rawText || rawText.trim().length === 0) {
      throw new Error('JD文本不能为空');
    }

    const prompt = JD_PARSE_PROMPT(rawText);
    const parsed = await deepseekService.chatJSON(prompt);

    return {
      company: parsed.company || '',
      position: parsed.position || '',
      skills: parsed.skills || [],
      experience: parsed.experience || '',
      education: parsed.education || '',
      requirements: parsed.requirements || [],
      responsibilities: parsed.responsibilities || [],
    };
  }
}

module.exports = new JDParser();
