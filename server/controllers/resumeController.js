const path = require('path');
const Resume = require('../models/Resume');
const resumeParser = require('../services/resumeParser');
const fileParser = require('../services/fileParser');
const { publicError, sendError } = require('../utils/appError');

exports.create = async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) {
      return sendError(res, publicError('RESUME_TEXT_REQUIRED', '简历文本不能为空'));
    }

    // AI自动解析简历板块
    const parsed = await resumeParser.parse(rawText);

    const resume = new Resume({ userId: req.userId, rawText, parsed });
    await resume.save();

    res.status(201).json({ id: resume._id, parsed });
  } catch (error) {
    console.error('简历解析失败:', error);
    sendError(res, error);
  }
};

/**
 * 上传简历文件 → 提取文字 → AI解析板块
 */
exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, publicError('RESUME_FILE_REQUIRED', '请上传简历文件'));
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.docx', '.doc', '.txt'];

    if (!allowedExts.includes(ext)) {
      return sendError(res, publicError(
        'INVALID_RESUME_FILE_TYPE',
        `不支持的文件格式 ${ext}，请上传 PDF、DOCX 或 TXT 文件`,
      ));
    }

    // 1. 从文件中提取文本
    const rawText = await fileParser.extractText(req.file.buffer, ext);

    // 2. AI解析简历板块
    const parsed = await resumeParser.parse(rawText);

    // 3. 保存
    const resume = new Resume({ userId: req.userId, rawText, parsed });
    await resume.save();

    res.status(201).json({
      id: resume._id,
      rawText,
      parsed,
      fileName: req.file.originalname,
    });
  } catch (error) {
    console.error('简历上传解析失败:', error);
    sendError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const { parsed } = req.body;
    const resume = await Resume.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { parsed, updatedAt: new Date() },
      { new: true }
    );
    if (!resume) {
      return sendError(res, publicError('RESUME_NOT_FOUND', '简历不存在或无权访问', { status: 404 }));
    }
    res.json(resume);
  } catch (error) {
    sendError(res, error);
  }
};

exports.getById = async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.userId });
    if (!resume) {
      return sendError(res, publicError('RESUME_NOT_FOUND', '简历不存在或无权访问', { status: 404 }));
    }
    res.json(resume);
  } catch (error) {
    sendError(res, error);
  }
};
