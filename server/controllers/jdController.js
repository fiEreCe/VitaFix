const JD = require('../models/JD');
const jdParser = require('../services/jdParser');
const ocrService = require('../services/ocrService');
const ocrTextCleaner = require('../services/ocrTextCleaner');
const { publicError, sendError } = require('../utils/appError');

exports.create = async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) {
      return sendError(res, publicError('JD_TEXT_REQUIRED', 'JD 文本不能为空'));
    }

    // AI解析JD
    const parsed = await jdParser.parse(rawText);

    const jd = new JD({ userId: req.userId, rawText, parsed });
    await jd.save();

    res.status(201).json({ id: jd._id, parsed });
  } catch (error) {
    console.error('JD解析失败:', error);
    sendError(res, error);
  }
};

/**
 * OCR 识别 - 上传图片 → 只提取文字，不解析JD
 * 用户确认文字后再调 create 接口解析
 */
exports.ocr = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, publicError('IMAGE_REQUIRED', '请上传图片'));
    }

    const imageBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    if (!mimeType.startsWith('image/')) {
      return sendError(res, publicError('INVALID_IMAGE_TYPE', '仅支持图片格式（JPG/PNG）'));
    }

    // 1. OCR 提取原始文字
    const rawOcrText = await ocrService.extractText(imageBuffer, mimeType);
    if (!rawOcrText || rawOcrText.trim().length === 0) {
      return sendError(res, publicError('OCR_TEXT_NOT_FOUND', '未从图片中识别出文字，请确认图片清晰'));
    }

    // 2. 独立后处理：去网页 UI、修中文空格、恢复段落（不改写岗位内容）
    const { text: rawText, stats } = ocrTextCleaner.cleanOcrText(rawOcrText);
    if (!rawText) {
      return sendError(res, publicError('OCR_TEXT_NOT_FOUND', '未从图片中识别出有效的岗位文字，请确认图片清晰'));
    }

    console.log(
      `[OCR] 原始 ${stats.originalLength} 字符 / 清洗后 ${stats.cleanedLength} 字符，`
      + `移除 UI 行 ${stats.removedUiLines}，合并续行 ${stats.mergedLines}`,
    );

    // 保留原始识别结果供排查，前端展示清洗后的 rawText
    res.json({ rawText, rawOcrText, cleanup: stats });
  } catch (error) {
    console.error('OCR识别失败:', error);
    sendError(res, error);
  }
};

exports.getById = async (req, res) => {
  try {
    const jd = await JD.findOne({ _id: req.params.id, userId: req.userId });
    if (!jd) {
      return sendError(res, publicError('JD_NOT_FOUND', 'JD 不存在或无权访问', { status: 404 }));
    }
    res.json(jd);
  } catch (error) {
    sendError(res, error);
  }
};
