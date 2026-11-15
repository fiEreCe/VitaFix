const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const { AppError, publicError } = require('../utils/appError');

const PAGE_MARKER_RE = /--\s*\d+\s*of\s*\d+\s*--/g;
const MEANINGFUL_CHAR_RE = /[㐀-䶿一-鿿A-Za-z0-9]/g;

/**
 * PDF 提取结果是否包含有效正文。
 * pdf-parse 对空 PDF 可能只返回 “-- 1 of 1 --” 这类分页标记，trim() 无法识别。
 */
function hasMeaningfulText(text, minChars = 10) {
  if (typeof text !== 'string') return false;
  const withoutPageMarkers = text.replace(PAGE_MARKER_RE, '');
  const matches = withoutPageMarkers.match(MEANINGFUL_CHAR_RE);
  return Boolean(matches && matches.length >= minChars);
}

function hasPdfSignature(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length > 0
    && buffer.subarray(0, 1024).toString('latin1').includes('%PDF-');
}

function hasZipSignature(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 4
    && buffer[0] === 0x50
    && buffer[1] === 0x4b;
}

function isEncryptedPdfError(error) {
  return error?.name === 'PasswordException'
    || /password|encrypted/i.test(String(error?.message || ''));
}

function isCorruptPdfError(error) {
  return error?.name === 'InvalidPDFException'
    || /invalid pdf/i.test(String(error?.message || ''));
}

function isCorruptDocxError(error) {
  return /zip|end of central directory|corrupt|invalid signature|central directory/i
    .test(String(error?.message || ''));
}

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
    const extLower = String(ext || '').toLowerCase();

    switch (extLower) {
      case '.pdf':
        return this._parsePDF(buffer);
      case '.docx':
        return this._parseDOCX(buffer);
      case '.txt':
        return this._parseTXT(buffer);
      default:
        throw publicError(
          'RESUME_FILE_TYPE_UNSUPPORTED',
          '不支持的文件格式，请上传 PDF、DOCX 或 TXT 文件',
          { status: 400 },
        );
    }
  }

  /**
   * 解析 PDF
   */
  async _parsePDF(buffer) {
    if (!hasPdfSignature(buffer)) {
      throw publicError('RESUME_FILE_CORRUPTED', '文件不是有效的 PDF，请重新导出后上传', { status: 400 });
    }

    try {
      // pdf-parse v2 要求 Uint8Array，Buffer 需显式转换
      const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const parser = new PDFParse(uint8Array);
      const result = await parser.getText();
      const text = result?.text || '';

      if (!hasMeaningfulText(text)) {
        throw publicError(
          'RESUME_PDF_NO_TEXT',
          'PDF 中未提取到有效文字，可能是扫描版或图片型 PDF；当前暂不支持 OCR，请上传文字版 PDF',
          { status: 400 },
        );
      }

      return text;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isEncryptedPdfError(error)) {
        throw publicError('RESUME_FILE_ENCRYPTED', 'PDF 已加密，请上传未加密的简历文件', { status: 400 });
      }
      if (isCorruptPdfError(error)) {
        throw publicError('RESUME_FILE_CORRUPTED', 'PDF 文件损坏或无法解析，请重新导出后上传', { status: 400 });
      }
      // 未识别的解析器异常按服务端故障处理
      throw error;
    }
  }

  /**
   * 解析 DOCX
   */
  async _parseDOCX(buffer) {
    if (!hasZipSignature(buffer)) {
      throw publicError('RESUME_FILE_CORRUPTED', '文件不是有效的 DOCX，请重新导出后上传', { status: 400 });
    }

    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value || '';
      if (!text.trim()) {
        throw publicError('RESUME_TEXT_EMPTY', 'DOCX 中未提取到文字，请上传包含文字的简历文件', { status: 400 });
      }
      return text;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isCorruptDocxError(error)) {
        throw publicError('RESUME_FILE_CORRUPTED', 'DOCX 文件损坏或无法解析，请重新导出后上传', { status: 400 });
      }
      // 未识别的解析器异常按服务端故障处理
      throw error;
    }
  }

  /**
   * 解析 TXT（UTF-8）
   */
  _parseTXT(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw publicError('RESUME_TEXT_EMPTY', 'TXT 文件内容为空，请上传包含文字的简历文件', { status: 400 });
    }

    const text = buffer.toString('utf-8');
    if (!text.trim()) {
      throw publicError('RESUME_TEXT_EMPTY', 'TXT 文件内容为空，请上传包含文字的简历文件', { status: 400 });
    }

    return text;
  }
}

const fileParser = new FileParser();
fileParser.FileParser = FileParser;
fileParser.hasMeaningfulText = hasMeaningfulText;
fileParser.hasPdfSignature = hasPdfSignature;
fileParser.hasZipSignature = hasZipSignature;
fileParser.isEncryptedPdfError = isEncryptedPdfError;
fileParser.isCorruptPdfError = isCorruptPdfError;
fileParser.isCorruptDocxError = isCorruptDocxError;

module.exports = fileParser;
