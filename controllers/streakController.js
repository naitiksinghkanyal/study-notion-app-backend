/**
 * streakController.js
 * Feature 2: Daily Login Streak System
 * 
 * Called automatically on every login via updateStreak()
 * GET /api/streak — Get current user's streak data
 */

const User = require('../models/User');

/**
 * updateStreak — call this inside the login controller after successful auth
 * Handles timezone properly using UTC date comparison.
 * 
 * Logic:
 *   - Same UTC day as lastLoginDate → no change (already logged in today)
 *   - Consecutive day (yesterday) → increment streak
 *   - Missed a day or more → reset streak to 1
 */
const updateStreak = async (userId) => {
  try {
    const user = await User.findById(userId).select('+streak +longestStreak +lastLoginDate');
    if (!user) return;

    const now       = new Date();
    const todayUTC  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate) : null;

    if (lastLogin) {
      const lastUTC  = new Date(Date.UTC(lastLogin.getUTCFullYear(), lastLogin.getUTCMonth(), lastLogin.getUTCDate()));
      const diffDays = Math.round((todayUTC - lastUTC) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Already logged in today — no change
        return;
      } else if (diffDays === 1) {
        // Consecutive day — increment
        user.streak = (user.streak || 0) + 1;
      } else {
        // Missed a day — reset
        user.streak = 1;
      }
    } else {
      // First ever login
      user.streak = 1;
    }

    // Update longest streak record
    if (!user.longestStreak || user.streak > user.longestStreak) {
      user.longestStreak = user.streak;
    }

    user.lastLoginDate = todayUTC;
    await user.save({ validateBeforeSave: false });
  } catch (err) {
    // Non-critical — don't break login if streak update fails
    console.error('Streak update error:', err.message);
  }
};

// ── GET /api/streak ───────────────────────────────────────────────────────────
const getStreak = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('streak longestStreak lastLoginDate name');

    const streak        = user.streak        || 0;
    const longestStreak = user.longestStreak  || 0;
    const lastLogin     = user.lastLoginDate;

    // Calculate if streak is active today
    const now      = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let isActiveToday = false;

    if (lastLogin) {
      const lastUTC  = new Date(Date.UTC(lastLogin.getUTCFullYear(), lastLogin.getUTCMonth(), lastLogin.getUTCDate()));
      const diffDays = Math.round((todayUTC - lastUTC) / (1000 * 60 * 60 * 24));
      isActiveToday  = diffDays === 0;
    }

    res.json({
      success: true,
      data: { streak, longestStreak, lastLoginDate: lastLogin, isActiveToday },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { updateStreak, getStreak };