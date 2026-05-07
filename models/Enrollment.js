/**
 * Enrollment Model — tracks which students are enrolled in which courses
 * Progress Model — tracks lesson completion per enrollment
 */

const mongoose = require('mongoose');

// ── Enrollment ────────────────────────────────────────────────────────────────
const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    // Payment
    paymentStatus: {
      type: String,
      enum: ['free', 'paid', 'pending', 'refunded'],
      default: 'free',
    },
    paymentIntentId: { type: String, default: '' }, // Stripe payment intent
    amountPaid: { type: Number, default: 0 },
    // Progress summary (updated as student completes lessons)
    completedLessons: [{ type: mongoose.Schema.Types.ObjectId }], // lesson._id refs
    progress: { type: Number, default: 0 },   // Percentage (0-100)
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    // Certificate
    certificateIssued: { type: Boolean, default: false },
    certificateUrl: { type: String, default: '' },
    // Last accessed
    lastAccessedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Prevent duplicate enrollments
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

// ── Progress (detailed — per-lesson watch position) ───────────────────────────
const progressSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, required: true },   // lesson._id (embedded)
    section: { type: mongoose.Schema.Types.ObjectId, required: true },  // section._id (embedded)
    isCompleted: { type: Boolean, default: false },
    watchPosition: { type: Number, default: 0 }, // seconds watched
    completedAt: { type: Date },
  },
  { timestamps: true }
);

progressSchema.index({ student: 1, course: 1, lesson: 1 }, { unique: true });

module.exports = {
  Enrollment: mongoose.model('Enrollment', enrollmentSchema),
  Progress: mongoose.model('Progress', progressSchema),
};
