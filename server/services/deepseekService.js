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

  /** 并发控制：同时最多 2 个请求 */
  static maxConcurrent = 2;
  static activeRequests = 0;
  static requestQueue = [];

  /**
   * 等待直到并发槽位可用
   */
  async _acquireSlot() {
    if (DeepSeekService.activeRequests < DeepSeekService.maxConcurrent) {
      DeepSeekService.activeRequests++;
      return;
    }
    return new Promise((resolve) => {
      DeepSeekService.requestQueue.push(resolve);
    });
  }

  _releaseSlot() {
    if (DeepSeekService.requestQueue.length > 0) {
      const next = DeepSeekService.requestQueue.shift();
      next();
    } else {
      DeepSeekService.activeRequests--;
    }
  }

  /**
   * 判断错误是否可重试
   */
  _isRetryable(error) {
    if (!error.response) return true; // 网络超时/断连
    const status = error.response.status;
    return status >= 500 || status === 429; // 服务端错误或限流
  }

  /**
   * 调用 DeepSeek 聊天补全 API（带重试 + 并发控制）
   * @param {string} prompt - 提示词
   * @param {Object} options - 可选参数
   * @param {number} retries - 重试次数
   * @returns {Promise<string>} - 返回文本内容
   */
  async chat(prompt, options = {}, retries = 2) {
    // 等待并发槽位
    await this._acquireSlot();

    const {
      model = config.deepseek.model,
      temperature = 0.1,
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
      if (retries > 0 && this._isRetryable(error)) {
        const delay = 1000 * (3 - retries + 1); // 1s, 2s
        console.log(`DeepSeek API 失败，${delay}ms 后重试（剩余 ${retries - 1} 次）`);
        await new Promise((r) => setTimeout(r, delay));
        return this.chat(prompt, options, retries - 1);
      }

      if (error.response) {
        console.error('DeepSeek API error:', {
          status: error.response.status,
          data: error.response.data,
        });
        throw new Error(`DeepSeek API 请求失败: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`DeepSeek API 请求失败: ${error.message}`);
    } finally {
      this._releaseSlot();
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
