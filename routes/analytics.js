const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { getAdminAnalytics, getInstructorAnalytics } = require('../controllers/analyticsController');

router.get('/admin', protect, roleCheck('admin'), getAdminAnalytics);
router.get('/instructor', protect, roleCheck('instructor', 'admin'), getInstructorAnalytics);

module.exports = router;
