const axios = require('axios');
const config = require('../config');

/**
 * DeepSeek API 调用封装
 */
class DeepSeekService {
  constructor() {
    this.client = axios.create({
      baseURL: config.deepseek.apiUrl,
      headers: {
        'Authorization': `Bearer ${config.deepseek.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000, // 2分钟超时
    });
  }

  /**
   * 调用 DeepSeek 聊天补全 API
   * @param {string} prompt - 提示词
   * @param {Object} options - 可选参数
   * @returns {Promise<string>} - 返回文本内容
   */
  async chat(prompt, options = {}) {
    const {
      model = 'deepseek-chat',
      temperature = 0.1,  // 低温度确保结构化输出
      maxTokens = 4096,
    } = options;

    try {
      const response = await this.client.post('/chat/completions', {
        model,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.data.choices[0].message.content.trim();
      return content;
    } catch (error) {
      if (error.response) {
        console.error('DeepSeek API error:', {
          status: error.response.status,
          data: error.response.data,
        });
        throw new Error(`DeepSeek API 请求失败: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`DeepSeek API 请求失败: ${error.message}`);
    }
  }

  /**
   * 调用 DeepSeek 并尝试解析 JSON 输出
   * @param {string} prompt - 提示词
   * @param {Object} options - 可选参数
   * @returns {Promise<Object>} - 解析后的 JSON 对象
   */
  async chatJSON(prompt, options = {}) {
    const text = await this.chat(prompt, options);
    try {
      // 尝试从返回文本中提取 JSON（处理可能被 markdown 包裹的情况）
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
      return JSON.parse(jsonStr.trim());
    } catch (error) {
      console.error('Failed to parse AI response as JSON:', text);
      throw new Error('AI 返回结果解析失败，请重试');
    }
  }

  /**
   * 图片识别 - 将图片发送给 DeepSeek 视觉模型，提取文字
   * @param {string} base64Image - 图片的 base64 编码（不含 data:image 前缀）
   * @param {string} mimeType - 图片 MIME 类型，如 image/png
   * @param {string} prompt - 识别提示词
   * @returns {Promise<string>} - 识别出的文本
   */
  async vision(base64Image, mimeType = 'image/png', prompt = '请提取这张图片中的所有文字内容') {
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    try {
      const response = await this.client.post('/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      });

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      if (error.response) {
        console.error('DeepSeek Vision API error:', {
          status: error.response.status,
          data: error.response.data,
        });
        throw new Error(`图片识别失败: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`图片识别失败: ${error.message}`);
    }
  }
}

module.exports = new DeepSeekService();
