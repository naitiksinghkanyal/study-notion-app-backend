const express  = require('express');
const router   = express.Router();
const protect  = require('../middleware/auth');
const { askQuestion, getHistory, clearHistory } = require('../controllers/aiChatController');

router.post  ('/ask',     protect, askQuestion);
router.get   ('/history', protect, getHistory);
router.delete('/clear',   protect, clearHistory);

module.exports = router;