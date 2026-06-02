const express = require('express');
const router = express.Router();
const supplementController = require('../controllers/supplementController');

router.post('/', supplementController.upsert);
router.get('/:resumeId', supplementController.getByResumeId);

module.exports = router;
