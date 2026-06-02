const express = require('express');
const multer = require('multer');
const router = express.Router();
const jdController = require('../controllers/jdController');

// multer 配置 - 内存存储（不写磁盘）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 最大10MB
});

router.post('/', jdController.create);
router.post('/ocr', upload.single('image'), jdController.ocr);
router.get('/:id', jdController.getById);

module.exports = router;
