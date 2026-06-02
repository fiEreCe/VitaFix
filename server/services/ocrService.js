const Tesseract = require('tesseract.js');

/**
 * OCR 服务 - 图片文字识别
 * 使用 Tesseract.js 本地引擎，支持中英文混合识别
 */
class OcrService {
  constructor() {
    this.worker = null;
  }

  /**
   * 获取或创建 Tesseract worker
   */
  async getWorker() {
    if (!this.worker) {
      console.log('正在初始化 OCR 引擎（首次会下载语言包）...');
      this.worker = await Tesseract.createWorker('chi_sim+eng', 1, {
        logger: (m) => {
          if (m.status === 'loading tesseract core') console.log('加载 OCR 核心...');
          if (m.status === 'initializing tesseract') console.log('初始化中...');
          if (m.status === 'loading language traineddata') console.log(`下载语言包... ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`);
          if (m.status === 'initializing api') console.log('启动 OCR API...');
        },
      });
      console.log('OCR 引擎就绪');
    }
    return this.worker;
  }

  /**
   * 从图片中提取文字
   * @param {Buffer} imageBuffer - 图片二进制数据
   * @param {string} mimeType - 图片类型 (image/png, image/jpeg)
   * @returns {Promise<string>} 提取出的文本
   */
  async extractText(imageBuffer, mimeType = 'image/png') {
    const worker = await this.getWorker();

    const { data } = await worker.recognize(imageBuffer);

    const text = data.text.trim();
    if (!text) {
      throw new Error('未能从图片中识别出文字，请确认图片清晰且包含文字');
    }

    return text;
  }

  /**
   * 释放 worker 资源（服务关闭时调用）
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

module.exports = new OcrService();
