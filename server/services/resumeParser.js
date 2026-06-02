const deepseekService = require('./deepseekService');
const { RESUME_PARSE_PROMPT } = require('../utils/promptTemplates');

/**
 * 简历解析服务 - 调用AI自动识别简历板块
 */
class ResumeParser {
  /**
   * 解析简历文本
   * @param {string} rawText - 原始简历文本
   * @returns {Promise<Object>} 解析后的结构化数据
   */
  async parse(rawText) {
    if (!rawText || rawText.trim().length === 0) {
      throw new Error('简历文本不能为空');
    }

    const prompt = RESUME_PARSE_PROMPT(rawText);
    const parsed = await deepseekService.chatJSON(prompt);

    return {
      personalInfo: parsed.personalInfo || {},
      education: parsed.education || [],
      experience: parsed.experience || [],
      projects: parsed.projects || [],
      skills: parsed.skills || [],
      certifications: parsed.certifications || [],
    };
  }
}

module.exports = new ResumeParser();
