const path = require('path');
const Resume = require('../models/Resume');
const resumeParser = require('../services/resumeParser');
const fileParser = require('../services/fileParser');
const { AppError, publicError, sendError } = require('../utils/appError');

exports.create = async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || !String(rawText).trim()) {
      return sendError(res, publicError('RESUME_TEXT_REQUIRED', '简历文本不能为空', { status: 400 }));
    }

    // AI自动解析简历板块
    let parsed;
    try {
      parsed = await resumeParser.parse(rawText);
    } catch (error) {
      console.error('简历解析失败:', error);
      if (error instanceof AppError) return sendError(res, error);
      return sendError(res, publicError(
        'RESUME_AI_UNAVAILABLE',
        '简历 AI 解析失败，请稍后重试',
        { status: 503, retryable: true },
      ));
    }

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
  const requestId = req.requestId
    || `resume_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  req.requestId = requestId;
  if (res.locals) res.locals.requestId = res.locals.requestId || requestId;

  try {
    if (!req.file) {
      console.log(`[简历上传 ${requestId}] 未收到文件`);
      return sendError(res, publicError('RESUME_FILE_REQUIRED', '请上传简历文件', { status: 400 }));
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.docx', '.txt'];

    if (!allowedExts.includes(ext)) {
      console.log(`[简历上传 ${requestId}] 类型不支持 ext=${ext} size=${req.file.size}`);
      return sendError(res, publicError(
        'RESUME_FILE_TYPE_UNSUPPORTED',
        `不支持的文件格式 ${ext}，请上传 PDF、DOCX 或 TXT 文件`,
        { status: 400 },
      ));
    }

    console.log(`[简历上传 ${requestId}] 收到文件 ext=${ext} size=${req.file.size}`);

    // 1. 从文件中提取文本
    const rawText = await fileParser.extractText(req.file.buffer, ext);
    console.log(`[简历上传 ${requestId}] 文件解析完成 textLength=${rawText.length}`);

    // 2. AI解析简历板块
    console.log(`[简历上传 ${requestId}] AI 解析开始`);
    let parsed;
    try {
      parsed = await resumeParser.parse(rawText);
      console.log(`[简历上传 ${requestId}] AI 解析完成`);
    } catch (error) {
      console.error(`[简历上传 ${requestId}] AI 解析失败`, error);
      if (error instanceof AppError) return sendError(res, error);
      return sendError(res, publicError(
        'RESUME_AI_UNAVAILABLE',
        '简历 AI 解析失败，请稍后重试',
        { status: 503, retryable: true },
      ));
    }

    // 3. 保存
    const resume = new Resume({ userId: req.userId, rawText, parsed });
    await resume.save();
    console.log(`[简历上传 ${requestId}] 保存完成 id=${resume._id}`);

    res.status(201).json({
      id: resume._id,
      rawText,
      parsed,
      fileName: req.file.originalname,
      requestId,
    });
  } catch (error) {
    console.error(`[简历上传 ${requestId}] 失败`, error);
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
