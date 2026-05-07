/**
 * Auth Routes — complete file, replace backend/routes/auth.js
 */

const express = require('express');
const router  = express.Router();
const protect = require('../middleware/auth');
const {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');

router.post('/register',               register);
router.post('/login',                  login);
router.post('/refresh',                refreshToken);
router.post('/logout',   protect,      logout);
router.get ('/me',       protect,      getMe);
router.post('/forgot-password',        forgotPassword);
router.post('/reset-password/:token',  resetPassword);

module.exports = router;