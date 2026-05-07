/**
 * User Controller
 * Profile management + Admin user management
 */

const User = require('../models/User');
const { Enrollment } = require('../models/Enrollment');
const Course = require('../models/Course');
const { AppError } = require('../middleware/errorHandler');

// ── GET /api/users/profile — Get own profile ──────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('coursesCreated', 'title thumbnail status enrollmentCount');
    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};

// ── PUT /api/users/profile — Update own profile ───────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, bio } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = bio;
    if (req.file) updates.avatar = req.file.path; // Cloudinary URL

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};

// ── PUT /api/users/password — Change password ─────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return next(new AppError('Current and new password are required.', 400));
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return next(new AppError('Current password is incorrect.', 401));
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/users — Admin: List all users ───────────────────────────────────
exports.getAllUsers = async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (role) query.role = role;
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-refreshToken')
      .sort('-createdAt')
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({
      success: true,
      data: {
        users,
        pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/users/:id/status — Admin: Activate/deactivate user ─────────────
exports.toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found.', 404));
    if (user.role === 'admin') return next(new AppError('Cannot modify admin accounts.', 403));

    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'}.`,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/users/:id/role — Admin: Change user role ──────────────────────
exports.changeUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['student', 'instructor', 'admin'].includes(role)) {
      return next(new AppError('Invalid role.', 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );
    if (!user) return next(new AppError('User not found.', 404));

    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/users/:id — Admin: Delete user ───────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found.', 404));
    if (user.role === 'admin') return next(new AppError('Cannot delete admin accounts.', 403));

    await user.deleteOne();
    res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    next(error);
  }
};
