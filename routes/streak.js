const express  = require('express');
const router   = express.Router();
const protect  = require('../middleware/auth');
const { getStreak } = require('../controllers/streakController');

router.get('/', protect, getStreak);

module.exports = router;