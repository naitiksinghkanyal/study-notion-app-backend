/**
 * Auth Controller — Complete
 * Includes: register, login (+ streak update), refresh, logout, getMe,
 *           forgotPassword, resetPassword
 */

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const { generateTokens } = require('../utils/generateToken');
const { AppError }       = require('../middleware/errorHandler');
const sendEmail          = require('../utils/sendEmail');

// ── POST /api/auth/register ──────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return next(new AppError('Name, email, and password are required.', 400));
    }

    // Prevent self-assigning admin role through registration
    const assignedRole = role === 'instructor' ? 'instructor' : 'student';

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new AppError('Email is already registered.', 409));
    }

    // Password hashed by pre-save hook in User model
    const user = await User.create({ name, email, password, role: assignedRole });

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: {
        user: {
          _id:    user._id,
          name:   user.name,
          email:  user.email,
          role:   user.role,
          avatar: user.avatar,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/login ─────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Email and password are required.', 400));
    }

    // Fetch with password (select: false by default in schema)
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return next(new AppError('Invalid email or password.', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact support.', 403));
    }

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // ── Feature 2: Update login streak (fire and forget — never blocks login) ──
    const { updateStreak } = require('./streakController');
    updateStreak(user._id).catch(err =>
      console.warn('Streak update failed (non-critical):', err.message)
    );

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          _id:    user._id,
          name:   user.name,
          email:  user.email,
          role:   user.role,
          avatar: user.avatar,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/refresh ───────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return next(new AppError('Refresh token is required.', 400));
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return next(new AppError('Invalid or expired refresh token.', 401));
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      return next(new AppError('Refresh token mismatch. Please log in again.', 401));
    }

    // Token rotation — issue both new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id, user.role);
    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/logout ────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Email is required.', 400));

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always respond the same — don't reveal whether email exists
    if (!user) {
      return res.json({
        success: true,
        message: 'If that email is registered, a reset link has been sent.',
      });
    }

    // Generate plain token (sent in email) and store its hash (in DB)
    const resetToken  = crypto.randomBytes(32).toString('hex');
    const tokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken  = tokenHashed;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

    await sendEmail({
      to:      user.email,
      subject: 'Reset your EduPlatform password',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px;">
          <h2 style="color:#1a1a2e;margin-bottom:8px;">Reset your password</h2>
          <p style="color:#555;margin-bottom:24px;">
            Hi ${user.name}, we received a request to reset your EduPlatform password.
            Click the button below. This link expires in <strong>15 minutes</strong>.
          </p>
          <a href="${resetUrl}"
             style="display:inline-block;background:#6366f1;color:white;font-weight:bold;
                    padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;">
            Reset Password
          </a>
          <p style="color:#999;font-size:12px;margin-top:24px;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
          <p style="color:#bbb;font-size:11px;">
            Or copy this link:<br>
            <a href="${resetUrl}" style="color:#6366f1;word-break:break-all;">${resetUrl}</a>
          </p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: 'If that email is registered, a reset link has been sent.',
    });
  } catch (error) {
    // If anything fails, clear the token so user can try again
    try {
      const user = await User.findOne({ email: req.body.email });
      if (user) {
        user.resetPasswordToken  = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
      }
    } catch { /* ignore cleanup error */ }
    next(error);
  }
};

// ── POST /api/auth/reset-password/:token ─────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    const { token }    = req.params;

    if (!password)           return next(new AppError('New password is required.', 400));
    if (password.length < 6) return next(new AppError('Password must be at least 6 characters.', 400));

    // Hash the incoming token and look it up
    const tokenHashed = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken:  tokenHashed,
      resetPasswordExpire: { $gt: Date.now() }, // not expired
    });

    if (!user) {
      return next(new AppError('Password reset link is invalid or has expired.', 400));
    }

    // Set new password (hashed by pre-save hook)
    user.password            = password;
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshToken        = undefined; // invalidate all existing sessions
    await user.save();

    // Log user in immediately with fresh tokens
    const { accessToken, refreshToken } = generateTokens(user._id, user.role);
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Password reset successful.',
      data: {
        user:  { _id: user._id, name: user.name, email: user.email, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};