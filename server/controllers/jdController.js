const JD = require('../models/JD');
const jdParser = require('../services/jdParser');
const ocrService = require('../services/ocrService');

exports.create = async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) {
      return res.status(400).json({ error: 'JD文本不能为空' });
    }

    // AI解析JD
    const parsed = await jdParser.parse(rawText);

    const jd = new JD({ rawText, parsed });
    await jd.save();

    res.status(201).json({ id: jd._id, parsed });
  } catch (error) {
    console.error('JD解析失败:', error);
    res.status(500).json({ error: 'JD解析失败: ' + error.message });
  }
};

/**
 * OCR 识别 - 上传图片 → 只提取文字，不解析JD
 * 用户确认文字后再调 create 接口解析
 */
exports.ocr = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片' });
    }

    const imageBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({ error: '仅支持图片格式（JPG/PNG）' });
    }

    // 仅 OCR 提取文字
    const rawText = await ocrService.extractText(imageBuffer, mimeType);
    if (!rawText || rawText.trim().length === 0) {
      return res.status(400).json({ error: '未从图片中识别出文字，请确认图片清晰' });
    }

    res.json({ rawText });
  } catch (error) {
    console.error('OCR识别失败:', error);
    res.status(500).json({ error: 'OCR识别失败: ' + error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const jd = await JD.findById(req.params.id);
    if (!jd) {
      return res.status(404).json({ error: 'JD不存在' });
    }
    res.json(jd);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
