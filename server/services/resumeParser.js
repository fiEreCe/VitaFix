const deepseekService = require('./deepseekService');
const { RESUME_PARSE_PROMPT } = require('../utils/promptTemplates');
const { publicError } = require('../utils/appError');

const EMPTY_RESULT_ERROR = () => publicError(
  'RESUME_AI_EMPTY_RESULT',
  '未能从简历中识别出有效内容，请检查文件或稍后重试',
  { status: 503, retryable: true },
);

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
      throw publicError('RESUME_TEXT_EMPTY', '简历文本不能为空', { status: 400 });
    }

    const prompt = RESUME_PARSE_PROMPT(rawText);
    // 推理模型的 reasoning_tokens 也计入 max_tokens；默认 4096 会在部分简历上被推理耗尽，
    // 导致 content 为空或 JSON 被截断（实测 16384 可完整返回）。
    // rejectTruncated：即使截断后的内容恰好是合法 JSON，也不能作为完整结果使用。
    const parsed = await deepseekService.chatJSON(prompt, {
      maxTokens: 16384,
      rejectTruncated: true,
    });

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw EMPTY_RESULT_ERROR();
    }

    const personalInfo = parsed.personalInfo || {};
    const education = Array.isArray(parsed.education) ? parsed.education : [];
    const experience = Array.isArray(parsed.experience) ? parsed.experience : [];
    const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
    const certifications = Array.isArray(parsed.certifications) ? parsed.certifications : [];

    const hasPersonalInfo = ['name', 'phone', 'email']
      .some((key) => typeof personalInfo[key] === 'string' && personalInfo[key].trim().length > 0);
    const hasContent = hasPersonalInfo
      || education.length > 0
      || experience.length > 0
      || projects.length > 0
      || skills.length > 0
      || certifications.length > 0;

    if (!hasContent) {
      throw EMPTY_RESULT_ERROR();
    }

    return {
      personalInfo,
      education,
      experience,
      projects,
      skills,
      certifications,
    };
  }
}

module.exports = new ResumeParser();
