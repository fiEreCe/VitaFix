const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * 文件解析服务 - 从简历文件（PDF/DOCX/TXT）中提取文字
 */
class FileParser {
  /**
   * 从文件中提取文本
   * @param {Buffer} buffer - 文件二进制数据
   * @param {string} ext - 文件扩展名（.pdf / .docx / .txt）
   * @returns {Promise<string>} 提取出的纯文本
   */
  async extractText(buffer, ext) {
    const extLower = ext.toLowerCase();

    switch (extLower) {
      case '.pdf':
        return this._parsePDF(buffer);
      case '.docx':
        return this._parseDOCX(buffer);
      case '.txt':
        return buffer.toString('utf-8');
      case '.doc':
        throw new Error('不支持 .doc 格式（老版Word），请先转换为 .docx 或 PDF');
      default:
        throw new Error(`不支持的文件格式 ${ext}，请上传 PDF、DOCX 或 TXT`);
    }
  }

  /**
   * 解析 PDF
   */
  async _parsePDF(buffer) {
    // pdf-parse v2 要求 Uint8Array，Buffer 需显式转换
    const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const parser = new PDFParse(uint8Array);
    const result = await parser.getText();
    const text = result?.text || '';
    if (!text.trim()) {
      throw new Error('PDF 中未提取到文字，可能是扫描件，请使用文字版 PDF');
    }
    return text;
  }

  /**
   * 解析 DOCX
   */
  async _parseDOCX(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || '';
    if (!text.trim()) {
      throw new Error('DOCX 中未提取到文字');
    }
    return text;
  }
}

module.exports = new FileParser();
