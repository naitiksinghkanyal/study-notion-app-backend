const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { enrollCourse, getMyEnrollments, getEnrollment, updateProgress } = require('../controllers/enrollmentController');

router.post('/:courseId', protect, enrollCourse);
router.get('/my', protect, getMyEnrollments);
router.get('/:courseId', protect, getEnrollment);
router.post('/:courseId/progress', protect, updateProgress);

module.exports = router;
