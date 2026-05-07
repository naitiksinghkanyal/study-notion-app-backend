const express = require('express');
const router  = express.Router();
const protect   = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { uploadImage, uploadVideo } = require('../middleware/upload');
const {
  getCourses, getCourse, createCourse, updateCourse, deleteCourse,
  addSection, addLesson, submitForReview, approveCourse, getInstructorCourses,
  deleteLesson, deleteSection, updateLesson,
} = require('../controllers/courseController');

// ── Optional auth ─────────────────────────────────────────────────────────────
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  const jwt  = require('jsonwebtoken');
  const User = require('../models/User');
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, async (err, decoded) => {
    if (!err && decoded) {
      try { req.user = await User.findById(decoded.id).select('-password -refreshToken'); } catch {}
    }
    next();
  });
};

// Spread helper — local mode returns array, Cloudinary mode returns single fn
const img = (field) => { const m = uploadImage.single(field); return Array.isArray(m) ? m : [m]; };
const vid = (field) => { const m = uploadVideo.single(field); return Array.isArray(m) ? m : [m]; };

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/', optionalAuth, getCourses);
router.get('/instructor/my', protect, roleCheck('instructor', 'admin'), getInstructorCourses);
router.get('/:id', optionalAuth, getCourse);

// ── Course CRUD ───────────────────────────────────────────────────────────────
router.post('/',     protect, roleCheck('instructor', 'admin'), ...img('thumbnail'), createCourse);
router.put('/:id',   protect, roleCheck('instructor', 'admin'), ...img('thumbnail'), updateCourse);
router.delete('/:id',protect, roleCheck('instructor', 'admin'), deleteCourse);

// ── Sections ──────────────────────────────────────────────────────────────────
router.post(  '/:id/sections',                protect, roleCheck('instructor', 'admin'), addSection);
router.delete('/:id/sections/:sectionId',     protect, roleCheck('instructor', 'admin'), deleteSection);

// ── Lessons ───────────────────────────────────────────────────────────────────
router.post(  '/:id/sections/:sectionId/lessons',                protect, roleCheck('instructor', 'admin'), ...vid('video'), addLesson);
router.put(   '/:id/sections/:sectionId/lessons/:lessonId',      protect, roleCheck('instructor', 'admin'), ...vid('video'), updateLesson);
router.delete('/:id/sections/:sectionId/lessons/:lessonId',      protect, roleCheck('instructor', 'admin'), deleteLesson);

// ── Workflow ──────────────────────────────────────────────────────────────────
router.patch('/:id/submit',  protect, roleCheck('instructor'), submitForReview);
router.patch('/:id/approve', protect, roleCheck('admin'),      approveCourse);

module.exports = router;