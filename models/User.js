/**
 * User Model — Updated
 * Added streak fields: streak, longestStreak, lastLoginDate
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Name is required'],
      trim:      true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select:    false, // Never returned in queries by default
    },
    role: {
      type:    String,
      enum:    ['student', 'instructor', 'admin'],
      default: 'student',
    },
    avatar: {
      type:    String,
      default: '',
    },
    bio: {
      type:      String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default:   '',
    },
    // Instructor-specific
    coursesCreated: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],

    isActive: {
      type:    Boolean,
      default: true,
    },
    isEmailVerified: {
      type:    Boolean,
      default: false,
    },
    refreshToken: {
      type:   String,
      select: false,
    },
    stripeCustomerId: {
      type:    String,
      default: '',
    },

    // ── Password reset fields ─────────────────────────────────────────────────
    resetPasswordToken:  String,
    resetPasswordExpire: Date,

    // ── Feature 2: Login Streak fields ────────────────────────────────────────
    // select: false keeps them out of normal queries for performance
    streak: {
      type:    Number,
      default: 0,
      select:  false,
    },
    longestStreak: {
      type:    Number,
      default: 0,
      select:  false,
    },
    lastLoginDate: {
      type:    Date,
      default: null,
      select:  false,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// ── Pre-save: hash password whenever it changes ───────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance method: compare entered password with stored hash ────────────────
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ── Virtual: profile avatar URL ──────────────────────────────────────────────
userSchema.virtual('profileUrl').get(function () {
  return (
    this.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(this.name)}&background=6366f1&color=fff`
  );
});

module.exports = mongoose.model('User', userSchema);