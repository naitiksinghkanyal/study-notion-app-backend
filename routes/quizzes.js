const express   = require('express');
const router    = express.Router();
const protect   = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const {
  createQuiz,
  getQuiz,
  submitQuiz,
  getQuizResults,
  getAllResults,
  aiGenerateQuiz,
  aiSaveQuiz,
  getMyResults,
} = require('../controllers/quizController');

// AI routes — instructor/admin only
router.post('/ai-generate', protect, roleCheck('instructor', 'admin'), aiGenerateQuiz);
router.post('/ai-save',     protect, roleCheck('instructor', 'admin'), aiSaveQuiz);

// Student: all my quiz results (must be before /:id)
router.get('/my-results', protect, getMyResults);

// Standard routes
router.post('/',    protect, roleCheck('instructor', 'admin'), createQuiz);
router.get('/:id',  protect, getQuiz);
router.post('/:id/submit',      protect, roleCheck('student'), submitQuiz);
router.get('/:id/results',      protect, getQuizResults);
router.get('/:id/all-results',  protect, roleCheck('instructor', 'admin'), getAllResults);

module.exports = router;