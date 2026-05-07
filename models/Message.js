/**
 * Message Model — for real-time course chat rooms via Socket.io
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
      trim: true,
    },
    // Optional: reply to another message
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ course: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
