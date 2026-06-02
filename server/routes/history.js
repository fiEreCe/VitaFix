const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

router.get('/', historyController.list);
router.put('/:id/name', historyController.updateName);
router.delete('/:id', historyController.remove);

module.exports = router;
