/**
 * Analytics Controller
 * Platform-wide stats (admin) + instructor-specific stats
 */

const User = require('../models/User');
const Course = require('../models/Course');
const { Enrollment } = require('../models/Enrollment');
const { QuizResult } = require('../models/Quiz');
const { AppError } = require('../middleware/errorHandler');

// ── GET /api/analytics/admin — Admin: Platform overview ──────────────────────
exports.getAdminAnalytics = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalStudents,
      totalInstructors,
      totalCourses,
      publishedCourses,
      pendingCourses,
      totalEnrollments,
      recentUsers,
      topCourses,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'instructor' }),
      Course.countDocuments(),
      Course.countDocuments({ status: 'published' }),
      Course.countDocuments({ status: 'pending_review' }),
      Enrollment.countDocuments(),
      User.find().sort('-createdAt').limit(5).select('name email role createdAt avatar'),
      Course.find({ status: 'published' })
        .sort('-enrollmentCount')
        .limit(5)
        .select('title thumbnail enrollmentCount rating instructor')
        .populate('instructor', 'name'),
    ]);

    // Enrollments by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const enrollmentsByMonth = await Enrollment.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // New users by month
    const usersByMonth = await User.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers, totalStudents, totalInstructors,
          totalCourses, publishedCourses, pendingCourses,
          totalEnrollments,
        },
        recentUsers,
        topCourses,
        charts: { enrollmentsByMonth, usersByMonth },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/analytics/instructor — Instructor: My course stats ───────────────
exports.getInstructorAnalytics = async (req, res, next) => {
  try {
    const courses = await Course.find({ instructor: req.user._id }).select('_id title enrollmentCount rating totalLessons status');
    const courseIds = courses.map((c) => c._id);

    const [totalEnrollments, totalRevenue, recentEnrollments] = await Promise.all([
      Enrollment.countDocuments({ course: { $in: courseIds } }),
      Enrollment.aggregate([
        { $match: { course: { $in: courseIds }, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } },
      ]),
      Enrollment.find({ course: { $in: courseIds } })
        .populate('student', 'name avatar email')
        .populate('course', 'title')
        .sort('-createdAt')
        .limit(10),
    ]);

    // Per-course breakdown
    const courseBreakdown = await Enrollment.aggregate([
      { $match: { course: { $in: courseIds } } },
      { $group: { _id: '$course', enrollments: { $sum: 1 }, avgProgress: { $avg: '$progress' } } },
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalCourses: courses.length,
          totalEnrollments,
          totalRevenue: totalRevenue[0]?.total || 0,
        },
        courses,
        courseBreakdown,
        recentEnrollments,
      },
    });
  } catch (error) {
    next(error);
  }
};
