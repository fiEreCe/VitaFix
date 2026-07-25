const express = require('express');
const { default: controller } = require('../controllers/agentSessionController');
const router = express.Router();
router.post('/', controller.create); router.get('/:id', controller.get); router.post('/:id/start', controller.start);
router.post('/:id/tasks/:taskId/select', controller.selectTask); router.post('/:id/tasks/:taskId/generate', controller.generate); router.post('/:id/tasks/:taskId/decision', controller.decide);
router.post('/:id/tasks/:taskId/answers', controller.answer); router.patch('/:id/tasks/:taskId/facts/:factId', controller.reviewFact);
module.exports = router;
