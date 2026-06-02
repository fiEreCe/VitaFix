const path = require('path');
const Resume = require('../models/Resume');
const resumeParser = require('../services/resumeParser');
const fileParser = require('../services/fileParser');

exports.create = async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) {
      return res.status(400).json({ error: '简历文本不能为空' });
    }

    // AI自动解析简历板块
    const parsed = await resumeParser.parse(rawText);

    const resume = new Resume({ rawText, parsed });
    await resume.save();

    res.status(201).json({ id: resume._id, parsed });
  } catch (error) {
    console.error('简历解析失败:', error);
    res.status(500).json({ error: '简历解析失败: ' + error.message });
  }
};

/**
 * 上传简历文件 → 提取文字 → AI解析板块
 */
exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传简历文件' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.docx', '.doc', '.txt'];

    if (!allowedExts.includes(ext)) {
      return res.status(400).json({
        error: `不支持的文件格式 ${ext}，请上传 PDF、DOCX 或 TXT 文件`,
      });
    }

    // 1. 从文件中提取文本
    const rawText = await fileParser.extractText(req.file.buffer, ext);

    // 2. AI解析简历板块
    const parsed = await resumeParser.parse(rawText);

    // 3. 保存
    const resume = new Resume({ rawText, parsed });
    await resume.save();

    res.status(201).json({
      id: resume._id,
      rawText,
      parsed,
      fileName: req.file.originalname,
    });
  } catch (error) {
    console.error('简历上传解析失败:', error);
    res.status(500).json({ error: '简历解析失败: ' + error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { parsed } = req.body;
    const resume = await Resume.findByIdAndUpdate(
      req.params.id,
      { parsed, updatedAt: new Date() },
      { new: true }
    );
    if (!resume) {
      return res.status(404).json({ error: '简历不存在' });
    }
    res.json(resume);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) {
      return res.status(404).json({ error: '简历不存在' });
    }
    res.json(resume);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
