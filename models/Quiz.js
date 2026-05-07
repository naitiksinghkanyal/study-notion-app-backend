/**
 * Quiz Model
 * Standalone quiz documents referenced by lessons
 */

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  type: {
    type: String,
    enum: ['multiple_choice', 'true_false', 'short_answer'],
    default: 'multiple_choice',
  },
  options: [
    {
      text: { type: String, required: true },
      isCorrect: { type: Boolean, default: false },
    },
  ],
  // For short_answer questions
  correctAnswer: { type: String, default: '' },
  explanation: { type: String, default: '' }, // Shown after answering
  points: { type: Number, default: 1 },
  order: { type: Number, default: 0 },
});

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    questions: [questionSchema],
    timeLimit: { type: Number, default: 0 },    // 0 = no limit, in minutes
    passingScore: { type: Number, default: 70 }, // Percentage to pass
    attemptsAllowed: { type: Number, default: 3 },
    shuffleQuestions: { type: Boolean, default: false },
    showAnswers: { type: Boolean, default: true }, // Show correct answers after submission
  },
  { timestamps: true }
);

// ── Quiz Attempt / Result Schema ─────────────────────────────────────────────
const quizResultSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    answers: [
      {
        question: { type: mongoose.Schema.Types.ObjectId },
        selectedOption: { type: mongoose.Schema.Types.ObjectId },
        textAnswer: { type: String },
        isCorrect: { type: Boolean },
        pointsEarned: { type: Number, default: 0 },
      },
    ],
    score: { type: Number, default: 0 },         // Percentage
    totalPoints: { type: Number, default: 0 },
    earnedPoints: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    timeTaken: { type: Number, default: 0 },     // in seconds
    attemptNumber: { type: Number, default: 1 },
  },
  { timestamps: true }
);

quizResultSchema.index({ quiz: 1, student: 1 });

module.exports = {
  Quiz: mongoose.model('Quiz', quizSchema),
  QuizResult: mongoose.model('QuizResult', quizResultSchema),
};
