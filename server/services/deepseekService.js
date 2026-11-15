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
    if (error.code === 'AI_RESPONSE_TRUNCATED') return false;
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
    const wrapped = new Error(error.response
      ? `DeepSeek API 请求失败: ${error.response.status}`
      : `DeepSeek API 请求失败: ${error.message}`);
    // 保留诊断信息，调用方需要区分截断、非法 JSON、超时和契约失败。
    for (const key of ['code', 'finishReason', 'usage', 'model', 'contentLength', 'durationMs']) {
      if (error[key] !== undefined) wrapped[key] = error[key];
    }
    return wrapped;
  }

  async chat(prompt, options = {}, retries = 2) {
    await this._acquireSlot();
    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const startedAt = Date.now();
          const payload = this._buildPayload(prompt, options);
          const response = await this.client.post('/chat/completions', payload);
          const durationMs = Date.now() - startedAt;
          const choice = response.data?.choices?.[0];
          const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
          const text = content.trim();
          const finishReason = choice?.finish_reason;

          // 结构化 JSON 被截断时不能作为有效结果使用
          if (options.rejectTruncated && finishReason === 'length') {
            console.error('[DeepSeek] 返回内容被截断', {
              model: payload.model,
              providerRequestId: response.data?.id,
              finishReason,
              maxTokens: payload.max_tokens,
              promptChars: prompt.length,
              contentLength: content.length,
              durationMs,
              messageKeys: choice?.message ? Object.keys(choice.message) : [],
              usage: response.data?.usage,
            });
            const error = new Error('AI 返回内容被截断');
            error.code = 'AI_RESPONSE_TRUNCATED';
            error.finishReason = finishReason;
            error.usage = response.data?.usage;
            error.model = payload.model;
            error.contentLength = content.length;
            error.durationMs = durationMs;
            throw error;
          }

          // 只记录元数据，不记录提示词/简历正文
          if (!text) {
            console.error('[DeepSeek] 返回空内容', {
              model: payload.model,
              providerRequestId: response.data?.id,
              finishReason,
              maxTokens: payload.max_tokens,
              promptChars: prompt.length,
              contentLength: content.length,
              durationMs,
              messageKeys: choice?.message ? Object.keys(choice.message) : [],
              usage: response.data?.usage,
            });
          }

          return text;
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
      const wrapped = new Error('AI 返回结果解析失败，请重试');
      wrapped.code = text ? 'AI_RESPONSE_INVALID_JSON' : 'AI_RESPONSE_EMPTY';
      throw wrapped;
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
