/**
 * Enrollment Controller
 * Enroll, track progress, mark lessons complete
 */

const { Enrollment, Progress } = require('../models/Enrollment');
const Course = require('../models/Course');
const { AppError } = require('../middleware/errorHandler');

// ── POST /api/enrollments/:courseId — Student: Enroll in a course ─────────────
exports.enrollCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return next(new AppError('Course not found.', 404));
    if (course.status !== 'published') return next(new AppError('Course is not available.', 400));

    // Prevent duplicate enrollment
    const existing = await Enrollment.findOne({
      student: req.user._id,
      course: course._id,
    });
    if (existing) return next(new AppError('Already enrolled in this course.', 409));

    // Paid courses must go through payment route
    if (!course.isFree && course.price > 0) {
      return next(new AppError('This is a paid course. Please complete payment first.', 402));
    }

    const enrollment = await Enrollment.create({
      student: req.user._id,
      course: course._id,
      paymentStatus: 'free',
    });

    // Increment enrollment counter
    await Course.findByIdAndUpdate(course._id, { $inc: { enrollmentCount: 1 } });

    res.status(201).json({ success: true, data: { enrollment } });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/enrollments/my — Student: Get my enrollments ────────────────────
exports.getMyEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ student: req.user._id })
      .populate({
        path: 'course',
        select: 'title thumbnail instructor category level totalLessons totalDuration rating',
        populate: { path: 'instructor', select: 'name avatar' },
      })
      .sort('-lastAccessedAt');

    res.json({ success: true, data: { enrollments } });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/enrollments/:courseId — Check enrollment + get progress ──────────
exports.getEnrollment = async (req, res, next) => {
  try {
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: req.params.courseId,
    });

    if (!enrollment) return next(new AppError('Not enrolled in this course.', 404));

    const progress = await Progress.find({
      student: req.user._id,
      course: req.params.courseId,
    });

    res.json({ success: true, data: { enrollment, progress } });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/enrollments/:courseId/progress — Mark lesson complete ───────────
exports.updateProgress = async (req, res, next) => {
  try {
    const { lessonId, sectionId, watchPosition, isCompleted } = req.body;

    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: req.params.courseId,
    });
    if (!enrollment) return next(new AppError('Not enrolled in this course.', 404));

    // Upsert progress record for this lesson
    const progress = await Progress.findOneAndUpdate(
      { student: req.user._id, course: req.params.courseId, lesson: lessonId },
      {
        section: sectionId,
        watchPosition: watchPosition || 0,
        isCompleted: isCompleted || false,
        ...(isCompleted ? { completedAt: new Date() } : {}),
      },
      { upsert: true, new: true }
    );

    // Recalculate overall enrollment progress
    if (isCompleted && !enrollment.completedLessons.includes(lessonId)) {
      enrollment.completedLessons.push(lessonId);
    }

    const course = await Course.findById(req.params.courseId).select('totalLessons');
    const progressPercent = course.totalLessons
      ? Math.round((enrollment.completedLessons.length / course.totalLessons) * 100)
      : 0;

    enrollment.progress = progressPercent;
    enrollment.lastAccessedAt = new Date();
    if (progressPercent === 100) {
      enrollment.isCompleted = true;
      enrollment.completedAt = new Date();
    }
    await enrollment.save();

    res.json({ success: true, data: { progress, enrollment } });
  } catch (error) {
    next(error);
  }
};
