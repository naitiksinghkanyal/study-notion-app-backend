/**
 * Course Controller
 * CRUD, search, section/lesson management, admin approval
 */

const Course = require('../models/Course');
const { Enrollment } = require('../models/Enrollment');
const { AppError } = require('../middleware/errorHandler');

// ── GET /api/courses — admin sees all statuses, public sees only published ────
exports.getCourses = async (req, res, next) => {
  try {
    const {
      search, category, level, minPrice, maxPrice,
      sort = '-createdAt', page = 1, limit = 50,
      status,
    } = req.query;

    const isAdmin = req.user?.role === 'admin';
    const query = {};

    if (isAdmin) {
      // Admin: filter by status tab if provided, otherwise show everything
      if (status) query.status = status;
      // no status param = show all (pending, published, rejected, draft)
    } else {
      // Everyone else: only published
      query.status = 'published';
    }

    if (search) query.$text = { $search: search };
    if (category) query.category = category;
    if (level) query.level = level;
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) query.price.$gte = Number(minPrice);
      if (maxPrice !== undefined) query.price.$lte = Number(maxPrice);
    }

    const total = await Course.countDocuments(query);
    const courses = await Course.find(query)
      .populate('instructor', 'name avatar bio')
      .select('-sections')
      .sort(sort)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({
      success: true,
      data: {
        courses,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
          limit: Number(limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/courses/:id ──────────────────────────────────────────────────────
exports.getCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('instructor', 'name avatar bio coursesCreated');
    if (!course) return next(new AppError('Course not found.', 404));

    let isEnrolled = false;
    if (req.user) {
      const enrollment = await Enrollment.findOne({ student: req.user._id, course: course._id });
      isEnrolled = !!enrollment;
    }

    const sanitizedSections = course.sections.map((section) => ({
      ...section.toObject(),
      lessons: section.lessons.map((lesson) => ({
        ...lesson.toObject(),
        videoUrl: isEnrolled || lesson.isFree ? lesson.videoUrl : '',
        content:  isEnrolled || lesson.isFree ? lesson.content  : '',
      })),
    }));

    res.json({
      success: true,
      data: { course: { ...course.toObject(), sections: sanitizedSections }, isEnrolled },
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/courses ─────────────────────────────────────────────────────────
exports.createCourse = async (req, res, next) => {
  try {
    const { title, description, shortDescription, category, level, price, language, tags, requirements, objectives } = req.body;
    const course = await Course.create({
      title, description, shortDescription, category, level,
      price: Number(price) || 0,
      isFree: !price || Number(price) === 0,
      language,
      tags: tags ? JSON.parse(tags) : [],
      requirements: requirements ? JSON.parse(requirements) : [],
      objectives: objectives ? JSON.parse(objectives) : [],
      instructor: req.user._id,
      thumbnail: req.file ? req.file.path : '',
      status: 'draft',
    });
    res.status(201).json({ success: true, data: { course } });
  } catch (error) {
    next(error);
  }
};

// ── PUT /api/courses/:id ──────────────────────────────────────────────────────
exports.updateCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return next(new AppError('Not authorized.', 403));

    const updates = { ...req.body };
    if (updates.tags) updates.tags = JSON.parse(updates.tags);
    if (updates.requirements) updates.requirements = JSON.parse(updates.requirements);
    if (updates.objectives) updates.objectives = JSON.parse(updates.objectives);
    if (req.file) updates.thumbnail = req.file.path;
    if (updates.price !== undefined) updates.isFree = Number(updates.price) === 0;

    const updated = await Course.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: { course: updated } });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/courses/:id ───────────────────────────────────────────────────
exports.deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return next(new AppError('Not authorized.', 403));
    await course.deleteOne();
    res.json({ success: true, message: 'Course deleted.' });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/courses/:id/sections ───────────────────────────────────────────
exports.addSection = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));
    if (course.instructor.toString() !== req.user._id.toString())
      return next(new AppError('Not authorized.', 403));
    const { title, description } = req.body;
    course.sections.push({ title, description, order: course.sections.length });
    await course.save();
    res.status(201).json({ success: true, data: { course } });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/courses/:id/sections/:sectionId/lessons ────────────────────────
exports.addLesson = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));
    if (course.instructor.toString() !== req.user._id.toString())
      return next(new AppError('Not authorized.', 403));
    const section = course.sections.id(req.params.sectionId);
    if (!section) return next(new AppError('Section not found.', 404));
    const { title, description, type, content, isFree } = req.body;
    const lesson = { title, description, type: type || 'video', content: content || '', isFree: isFree === 'true', order: section.lessons.length };
    if (req.file) { lesson.videoUrl = req.file.path; lesson.videoPublicId = req.file.filename; if (req.file.duration) lesson.videoDuration = Math.floor(req.file.duration); }
    section.lessons.push(lesson);
    await course.save();
    res.status(201).json({ success: true, data: { course } });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/courses/:id/submit ────────────────────────────────────────────
exports.submitForReview = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));
    if (course.instructor.toString() !== req.user._id.toString())
      return next(new AppError('Not authorized.', 403));
    if (course.sections.length === 0)
      return next(new AppError('Add at least one section before submitting.', 400));
    course.status = 'pending_review';
    await course.save();
    res.json({ success: true, message: 'Course submitted for review.' });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/courses/:id/approve — Admin only ───────────────────────────────
exports.approveCourse = async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));
    if (action === 'approve') {
      course.status = 'published';
      course.rejectionReason = '';
    } else if (action === 'reject') {
      course.status = 'rejected';
      course.rejectionReason = reason || 'Course did not meet our standards.';
    } else {
      return next(new AppError('Action must be "approve" or "reject".', 400));
    }
    await course.save();
    res.json({ success: true, message: `Course ${action}d.`, data: { course } });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/courses/instructor/my ───────────────────────────────────────────
exports.getInstructorCourses = async (req, res, next) => {
  try {
    const courses = await Course.find({ instructor: req.user._id }).select('-sections').sort('-createdAt');
    res.json({ success: true, data: { courses } });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/courses/:id/sections/:sectionId/lessons/:lessonId ─────────────
exports.deleteLesson = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return next(new AppError('Not authorized.', 403));

    const section = course.sections.id(req.params.sectionId);
    if (!section) return next(new AppError('Section not found.', 404));

    const lesson = section.lessons.id(req.params.lessonId);
    if (!lesson) return next(new AppError('Lesson not found.', 404));

    // Delete local file if it exists on disk
    if (lesson.videoPublicId && !lesson.videoUrl.startsWith('http')) {
      const path = require('path');
      const fs   = require('fs');
      const filePath = path.join(__dirname, '..', 'uploads', 'videos', lesson.videoPublicId);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      }
    }

    // Delete from Cloudinary if it was uploaded there
    if (lesson.videoPublicId && lesson.videoUrl.startsWith('http') && lesson.videoUrl.includes('cloudinary')) {
      try {
        const cloudinary = require('../config/cloudinary');
        await cloudinary.uploader.destroy(lesson.videoPublicId, { resource_type: 'video' });
      } catch (e) {
        console.warn('Cloudinary delete failed (non-fatal):', e.message);
      }
    }

    section.lessons.pull({ _id: req.params.lessonId });
    await course.save();

    res.json({ success: true, message: 'Lesson deleted.', data: { course } });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/courses/:id/sections/:sectionId ───────────────────────────────
exports.deleteSection = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return next(new AppError('Not authorized.', 403));

    const section = course.sections.id(req.params.sectionId);
    if (!section) return next(new AppError('Section not found.', 404));

    course.sections.pull({ _id: req.params.sectionId });
    await course.save();

    res.json({ success: true, message: 'Section deleted.', data: { course } });
  } catch (error) {
    next(error);
  }
};

// ── PUT /api/courses/:id/sections/:sectionId/lessons/:lessonId ────────────────
// Update lesson title, description, content, isFree — or replace video
exports.updateLesson = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(new AppError('Course not found.', 404));

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return next(new AppError('Not authorized.', 403));

    const section = course.sections.id(req.params.sectionId);
    if (!section) return next(new AppError('Section not found.', 404));

    const lesson = section.lessons.id(req.params.lessonId);
    if (!lesson) return next(new AppError('Lesson not found.', 404));

    // Update text fields
    if (req.body.title       !== undefined) lesson.title       = req.body.title;
    if (req.body.description !== undefined) lesson.description = req.body.description;
    if (req.body.content     !== undefined) lesson.content     = req.body.content;
    if (req.body.isFree      !== undefined) lesson.isFree      = req.body.isFree === 'true' || req.body.isFree === true;

    // Replace video if a new file was uploaded
    if (req.file) {
      lesson.videoUrl      = req.file.path;
      lesson.videoPublicId = req.file.filename || req.file.public_id || '';
    }

    await course.save();
    res.json({ success: true, message: 'Lesson updated.', data: { course } });
  } catch (error) {
    next(error);
  }
};