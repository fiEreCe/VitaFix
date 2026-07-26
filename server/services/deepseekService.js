const axios = require('axios');
const config = require('../config');

class DeepSeekService {
  constructor({ client, delay } = {}) {
    this.client = client || axios.create({
      baseURL: config.deepseek.apiUrl,
      headers: {
        Authorization: `Bearer ${config.deepseek.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });
    this.delay = delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  static maxConcurrent = 2;
  static activeRequests = 0;
  static requestQueue = [];

  async _acquireSlot() {
    if (DeepSeekService.activeRequests < DeepSeekService.maxConcurrent) {
      DeepSeekService.activeRequests += 1;
      return;
    }
    await new Promise((resolve) => DeepSeekService.requestQueue.push(resolve));
  }

  _releaseSlot() {
    const next = DeepSeekService.requestQueue.shift();
    if (next) next();
    else DeepSeekService.activeRequests -= 1;
  }

  _isRetryable(error) {
    if (!error.response) return true;
    return error.response.status >= 500 || error.response.status === 429;
  }

  _buildPayload(prompt, options) {
    return {
      model: options.model || config.deepseek.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens || 4096,
    };
  }

  _publicError(error) {
    return new Error(error.response
      ? `DeepSeek API 请求失败: ${error.response.status}`
      : `DeepSeek API 请求失败: ${error.message}`);
  }

  async chat(prompt, options = {}, retries = 2) {
    await this._acquireSlot();
    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const response = await this.client.post('/chat/completions', this._buildPayload(prompt, options));
          return response.data.choices[0].message.content.trim();
        } catch (error) {
          if (attempt === retries || !this._isRetryable(error)) throw this._publicError(error);
          await this.delay(1000 * (attempt + 1));
        }
      }
    } finally {
      this._releaseSlot();
    }
  }

  async chatJSON(prompt, options = {}) {
    const text = await this.chat(prompt, options);
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
      return JSON.parse((jsonMatch ? jsonMatch[1] || jsonMatch[0] : text).trim());
    } catch (error) {
      console.error('Failed to parse AI response as JSON:', { errorName: error.name, responseLength: text.length });
      throw new Error('AI 返回结果解析失败，请重试');
    }
  }

  async vision(base64Image, mimeType = 'image/png', prompt = '请提取图片中的文字') {
    try {
      const response = await this.client.post('/chat/completions', {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ] }],
        temperature: 0.1,
        max_tokens: 4096,
      });
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      throw this._publicError(error);
    }
  }
}

const deepseekService = new DeepSeekService();
module.exports = deepseekService;
module.exports.DeepSeekService = DeepSeekService;
