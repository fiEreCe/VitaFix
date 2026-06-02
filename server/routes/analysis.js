const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');

router.post('/', analysisController.create);
router.get('/:id', analysisController.getById);
router.get('/:id/status', analysisController.getStatus);
router.post('/:id/reevaluate-section', analysisController.reevaluateSection);

module.exports = router;
