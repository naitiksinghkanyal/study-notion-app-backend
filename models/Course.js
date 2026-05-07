/**
 * Course Model
 * Hierarchical: Course → Sections → Lessons
 */

const mongoose = require('mongoose');

// ── Lesson Sub-schema ────────────────────────────────────────────────────────
const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: {
    type: String,
    enum: ['video', 'text', 'quiz'],
    default: 'video',
  },
  // Video lesson
  videoUrl: { type: String, default: '' },          // Cloudinary URL
  videoPublicId: { type: String, default: '' },     // Cloudinary public_id (for deletion)
  videoDuration: { type: Number, default: 0 },      // in seconds
  // Text lesson
  content: { type: String, default: '' },           // Rich text / Markdown
  // Reference to Quiz (if type === 'quiz')
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
  // Order within section
  order: { type: Number, default: 0 },
  isFree: { type: Boolean, default: false },        // Preview lesson
  resources: [
    {
      title: String,
      url: String,
    },
  ],
}, { timestamps: true });

// ── Section Sub-schema ───────────────────────────────────────────────────────
const sectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  order: { type: Number, default: 0 },
  lessons: [lessonSchema],
}, { timestamps: true });

// ── Course Schema ────────────────────────────────────────────────────────────
const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Course title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Course description is required'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    shortDescription: {
      type: String,
      maxlength: [200, 'Short description cannot exceed 200 characters'],
    },
    thumbnail: {
      type: String,
      default: '',
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Web Development', 'Mobile Development', 'Data Science',
        'Machine Learning', 'Design', 'Business', 'Marketing',
        'Photography', 'Music', 'Health & Fitness', 'Other',
      ],
    },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      default: 'Beginner',
    },
    language: { type: String, default: 'English' },
    price: {
      type: Number,
      default: 0,
      min: [0, 'Price cannot be negative'],
    },
    isFree: { type: Boolean, default: false },
    sections: [sectionSchema],
    tags: [{ type: String, trim: true }],
    requirements: [{ type: String }],    // What students need before taking
    objectives: [{ type: String }],      // What students will learn
    // Status workflow: draft → pending_review → published | rejected
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'published', 'rejected'],
      default: 'draft',
    },
    rejectionReason: { type: String, default: '' },
    // Analytics
    enrollmentCount: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalDuration: { type: Number, default: 0 }, // in seconds
    totalLessons: { type: Number, default: 0 },
    // Stripe product
    stripeProductId: { type: String, default: '' },
    stripePriceId: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Pre-save: Generate slug from title ───────────────────────────────────────
courseSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
  // Calculate totals from sections
  let totalLessons = 0;
  let totalDuration = 0;
  this.sections.forEach((section) => {
    section.lessons.forEach((lesson) => {
      totalLessons++;
      totalDuration += lesson.videoDuration || 0;
    });
  });
  this.totalLessons = totalLessons;
  this.totalDuration = totalDuration;
  next();
});

// ── Index for search ─────────────────────────────────────────────────────────
courseSchema.index({ title: 'text', description: 'text', tags: 'text' });
courseSchema.index({ status: 1, category: 1 });
courseSchema.index({ instructor: 1 });

module.exports = mongoose.model('Course', courseSchema);
