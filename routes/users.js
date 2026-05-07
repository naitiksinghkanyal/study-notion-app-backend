const express   = require('express');
const router    = express.Router();
const protect   = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { uploadImage } = require('../middleware/upload');
const {
  getProfile, updateProfile, changePassword,
  getAllUsers, toggleUserStatus, changeUserRole, deleteUser,
} = require('../controllers/userController');

// Spread helper (same pattern as courses.js)
const img = (field) => {
  const m = uploadImage.single(field);
  return Array.isArray(m) ? m : [m];
};

// Profile
router.get('/profile', protect, getProfile);
router.put('/profile',  protect, ...img('avatar'), updateProfile);
router.put('/password', protect, changePassword);

// Admin
router.get('/',              protect, roleCheck('admin'), getAllUsers);
router.patch('/:id/status',  protect, roleCheck('admin'), toggleUserStatus);
router.patch('/:id/role',    protect, roleCheck('admin'), changeUserRole);
router.delete('/:id',        protect, roleCheck('admin'), deleteUser);

module.exports = router;