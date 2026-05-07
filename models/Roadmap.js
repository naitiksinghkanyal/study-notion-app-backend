/**
 * Roadmap.js — MongoDB model for saved career roadmaps
 */

const mongoose = require('mongoose');

const roadmapSchema = new mongoose.Schema({
  user: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  goal: {
    type:     String,
    required: true,
    trim:     true,
  },
  // Full AI-generated roadmap JSON stored as mixed type
  roadmap: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Roadmap', roadmapSchema);