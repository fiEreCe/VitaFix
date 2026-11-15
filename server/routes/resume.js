const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const { publicError, sendError } = require('../utils/appError');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 最大20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.txt'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      const error = new Error('仅支持 PDF、DOCX、TXT 格式');
      error.code = 'RESUME_FILE_TYPE_UNSUPPORTED';
      cb(error);
    }
  },
});

// requestId 必须在 multer 之前生成，才能覆盖格式/大小等上传阶段错误
function requestIdMiddleware(req, res, next) {
  const requestId = `resume_${crypto.randomUUID()}`;
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

router.post('/', resumeController.create);

// multer 错误处理（Express 5 不自动捕获 multer 错误）
router.post('/upload', requestIdMiddleware, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, publicError('RESUME_FILE_TOO_LARGE', '文件大小不能超过20MB', { status: 400 }));
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return sendError(res, publicError(
        'RESUME_FILE_UNEXPECTED',
        '上传字段不正确，请重新选择文件',
        { status: 400 },
      ));
    }

    if (err.code === 'RESUME_FILE_TYPE_UNSUPPORTED') {
      return sendError(res, publicError(
        'RESUME_FILE_TYPE_UNSUPPORTED',
        err.message,
        { status: 400 },
      ));
    }

    console.error(`[简历上传 ${req.requestId}] Multer 错误`, err);
    return sendError(res, err);
  });
}, resumeController.upload);

router.put('/:id', resumeController.update);
router.get('/:id', resumeController.getById);

module.exports = router;
