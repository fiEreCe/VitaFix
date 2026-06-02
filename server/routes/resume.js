const express = require('express');
const multer = require('multer');
const router = express.Router();
const resumeController = require('../controllers/resumeController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 最大20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 PDF、DOCX、TXT 格式'));
    }
  },
});

router.post('/', resumeController.create);

// multer 错误处理（Express 5 不自动捕获 multer 错误）
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小不能超过20MB' });
      }
      return res.status(400).json({ error: err.message || '文件上传失败' });
    }
    next();
  });
}, resumeController.upload);

router.put('/:id', resumeController.update);
router.get('/:id', resumeController.getById);

module.exports = router;
