/**
 * ChatHistory.js — MongoDB model for AI chat conversations
 * 
 * Schema design:
 * - One document per user+course session
 * - Messages stored as array (capped to last 50 to control storage)
 * - TTL index auto-deletes sessions older than 30 days
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false }); // no _id per message to save space

const chatHistorySchema = new mongoose.Schema({
  // Unique session key: userId_courseId
  session: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
  },
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  courseId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Course',
    required: true,
  },
  // Capped at 50 messages in the controller (last 50 kept)
  messages: [messageSchema],
  lastUpdated: {
    type:    Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Auto-delete sessions older than 30 days
chatHistorySchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);