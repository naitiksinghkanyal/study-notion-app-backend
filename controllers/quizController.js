/**
 * Quiz Controller
 * Create quizzes, submit answers, get results
 */

const { Quiz, QuizResult } = require('../models/Quiz');
const { Enrollment } = require('../models/Enrollment');
const { AppError } = require('../middleware/errorHandler');

// ── POST /api/quizzes — Instructor: Create quiz ───────────────────────────────
exports.createQuiz = async (req, res, next) => {
  try {
    const { title, description, courseId, questions, timeLimit, passingScore, attemptsAllowed, shuffleQuestions, showAnswers } = req.body;

    const quiz = await Quiz.create({
      title,
      description,
      course: courseId,
      instructor: req.user._id,
      questions,
      timeLimit: timeLimit || 0,
      passingScore: passingScore || 70,
      attemptsAllowed: attemptsAllowed || 0, // 0 = unlimited
      shuffleQuestions: shuffleQuestions || false,
      showAnswers: showAnswers !== false,
    });

    res.status(201).json({ success: true, data: { quiz } });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/quizzes/:id — Get quiz (student: without answers) ────────────────
exports.getQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return next(new AppError('Quiz not found.', 404));

    // Check enrollment
    const enrollment = await Enrollment.findOne({ student: req.user._id, course: quiz.course });
    if (!enrollment && req.user.role === 'student') {
      return next(new AppError('Not enrolled in this course.', 403));
    }

    // Count prior attempts
    const attemptCount = await QuizResult.countDocuments({ quiz: quiz._id, student: req.user._id });
    // No attempt limit — students can retake quizzes unlimited times

    // Strip correct answers for students
    const quizData = quiz.toObject();
    if (req.user.role === 'student') {
      quizData.questions = quizData.questions.map((q) => ({
        ...q,
        options: q.options.map(({ text, _id }) => ({ text, _id })), // Remove isCorrect
        correctAnswer: undefined,
      }));
    }

    res.json({ success: true, data: { quiz: quizData, attemptCount } });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/quizzes/:id/submit — Student: Submit quiz answers ───────────────
exports.submitQuiz = async (req, res, next) => {
  try {
    const { answers, timeTaken } = req.body;
    // answers: [{ questionId, selectedOptionId?, textAnswer? }]

    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return next(new AppError('Quiz not found.', 404));

    // Check attempt limit
    const attemptCount = await QuizResult.countDocuments({ quiz: quiz._id, student: req.user._id });
    // No attempt limit — students can retake unlimited times

    // Grade answers
    let totalPoints = 0;
    let earnedPoints = 0;
    const gradedAnswers = answers.map((ans) => {
      const question = quiz.questions.id(ans.questionId);
      if (!question) return null;

      totalPoints += question.points;
      let isCorrect = false;

      if (question.type === 'multiple_choice' || question.type === 'true_false') {
        const selectedOption = question.options.id(ans.selectedOptionId);
        isCorrect = selectedOption ? selectedOption.isCorrect : false;
      } else if (question.type === 'short_answer') {
        isCorrect = ans.textAnswer?.toLowerCase().trim() === question.correctAnswer?.toLowerCase().trim();
      }

      if (isCorrect) earnedPoints += question.points;

      return {
        question: question._id,
        selectedOption: ans.selectedOptionId,
        textAnswer: ans.textAnswer,
        isCorrect,
        pointsEarned: isCorrect ? question.points : 0,
      };
    }).filter(Boolean);

    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;

    const result = await QuizResult.create({
      quiz: quiz._id,
      student: req.user._id,
      course: quiz.course,
      answers: gradedAnswers,
      score,
      totalPoints,
      earnedPoints,
      passed,
      timeTaken: timeTaken || 0,
      attemptNumber: attemptCount + 1,
    });

    // If showAnswers, populate the correct answers in response
    let quizWithAnswers = null;
    if (quiz.showAnswers) {
      quizWithAnswers = quiz.toObject();
    }

    res.json({
      success: true,
      data: { result, passed, score, quiz: quizWithAnswers },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/quizzes/:id/results — Get student's results for a quiz ───────────
exports.getQuizResults = async (req, res, next) => {
  try {
    const results = await QuizResult.find({
      quiz: req.params.id,
      student: req.user._id,
    }).sort('-createdAt');

    res.json({ success: true, data: { results } });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/quizzes/:id/all-results — Instructor: All student results ─────────
exports.getAllResults = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return next(new AppError('Quiz not found.', 404));

    if (quiz.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return next(new AppError('Not authorized.', 403));
    }

    const results = await QuizResult.find({ quiz: req.params.id })
      .populate('student', 'name email avatar')
      .sort('-createdAt');

    const stats = {
      totalAttempts: results.length,
      passRate: results.length ? Math.round((results.filter((r) => r.passed).length / results.length) * 100) : 0,
      avgScore: results.length ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length) : 0,
    };

    res.json({ success: true, data: { results, stats } });
  } catch (error) {
    next(error);
  }
};


// ── POST /api/quizzes/ai-generate — AI Quiz Generator ────────────────────────
// Uses Anthropic API to generate quiz questions from course title + context
exports.aiGenerateQuiz = async (req, res, next) => {
  try {
    const { courseTitle, courseDescription, difficulty, questionCount, courseId } = req.body;

    if (!courseTitle) return next(new AppError('Course title is required.', 400));

    const count = Math.min(Math.max(parseInt(questionCount) || 5, 3), 15);
    const level = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';

    // ── Build the prompt (same for all providers) ────────────────────────────
    const prompt = `You are an expert educator creating a quiz for an online course.

Course Title: "${courseTitle}"
${courseDescription ? `Course Description: "${courseDescription}"` : ''}
Difficulty Level: ${level}
Number of Questions: ${count}

Generate exactly ${count} multiple-choice quiz questions for this course.
Each question must have exactly 4 options with only ONE correct answer.

Respond with ONLY a valid JSON array. No markdown, no explanation, no code blocks.
Use this exact format:
[
  {
    "questionText": "Question text here?",
    "options": [
      { "text": "Option A", "isCorrect": false },
      { "text": "Option B", "isCorrect": true },
      { "text": "Option C", "isCorrect": false },
      { "text": "Option D", "isCorrect": false }
    ],
    "explanation": "Brief explanation of why the correct answer is right.",
    "points": 1
  }
]

Rules:
- Questions must be relevant to "${courseTitle}"
- For ${level} difficulty: ${level === 'easy' ? 'basic concepts and definitions' : level === 'medium' ? 'applied knowledge and understanding' : 'advanced concepts, edge cases, and synthesis'}
- Make wrong options plausible but clearly incorrect
- Vary question styles (what, why, how, which, when)
- Return ONLY the JSON array`;

    // ── Detect which AI provider to use ──────────────────────────────────────
    let rawText = '';

    const hasGemini    = process.env.GEMINI_API_KEY    && process.env.GEMINI_API_KEY    !== 'your-gemini-key';
    const hasAnthropic = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'sk-ant-your-key-here';
    const hasOpenAI    = process.env.OPENAI_API_KEY    && process.env.OPENAI_API_KEY    !== 'your-openai-key';

    if (hasGemini) {
      // ── Google Gemini ───────────────────────────────────────────────────
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:     0.7,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Gemini API error:', err);
        return next(new AppError('Gemini API error. Check your GEMINI_API_KEY.', 502));
      }

      const data = await response.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (hasAnthropic) {
      // ── Anthropic Claude ────────────────────────────────────────────────
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Anthropic API error:', err);
        return next(new AppError('Anthropic API error. Check your ANTHROPIC_API_KEY.', 502));
      }

      const data = await response.json();
      rawText = data.content?.[0]?.text || '';

    } else if (hasOpenAI) {
      // ── OpenAI / any OpenAI-compatible API ──────────────────────────────
      const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      const response = await fetch(`${baseURL}/chat/completions`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model:       process.env.OPENAI_MODEL || 'gpt-4o-mini',
          max_tokens:  4096,
          temperature: 0.7,
          messages:    [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('OpenAI API error:', err);
        return next(new AppError('OpenAI API error. Check your OPENAI_API_KEY.', 502));
      }

      const data = await response.json();
      rawText = data.choices?.[0]?.message?.content || '';

    } else {
      return next(new AppError(
        'No AI provider configured. Add GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY to your .env file.',
        503
      ));
    }

    // Parse JSON — strip any accidental markdown fences
    let questions;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      questions = JSON.parse(cleaned);
      if (!Array.isArray(questions)) throw new Error('Not an array');
    } catch (parseErr) {
      console.error('AI response parse error:', rawText);
      return next(new AppError('AI returned invalid JSON. Please try again.', 500));
    }

    // Validate and normalise each question
    const sanitized = questions.map((q, i) => {
      if (!q.questionText || !Array.isArray(q.options)) {
        throw new AppError(`Question ${i + 1} is malformed.`, 500);
      }
      // Ensure exactly one correct answer
      const correctCount = q.options.filter(o => o.isCorrect).length;
      if (correctCount !== 1) {
        // Force first option to be correct if AI made a mistake
        q.options = q.options.map((o, idx) => ({ ...o, isCorrect: idx === 0 }));
      }
      return {
        questionText: q.questionText,
        type:         'multiple_choice',
        options:      q.options.slice(0, 4).map(o => ({ text: o.text, isCorrect: !!o.isCorrect })),
        explanation:  q.explanation || '',
        points:       q.points || 1,
      };
    });

    res.json({
      success: true,
      data: {
        questions: sanitized,
        meta: { courseTitle, difficulty: level, count: sanitized.length },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/quizzes/ai-save — Save AI quiz + auto-create Quiz section ─────────
exports.aiSaveQuiz = async (req, res, next) => {
  try {
    const { title, description, courseId, questions, timeLimit, passingScore, attemptsAllowed } = req.body;

    if (!courseId)          return next(new AppError('courseId is required.', 400));
    if (!questions?.length) return next(new AppError('questions array is required.', 400));

    // 1. Find the course and verify ownership
    const Course = require('../models/Course');
    const course = await Course.findById(courseId);
    if (!course) return next(new AppError('Course not found.', 404));
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return next(new AppError('Not authorized.', 403));
    }

    // 2. Create the Quiz document
    const quizTitle = title || 'AI Generated Quiz';
    const quiz = await Quiz.create({
      title:            quizTitle,
      description:      description || 'Quiz generated by AI based on course content.',
      course:           courseId,
      instructor:       req.user._id,
      questions,
      timeLimit:        timeLimit        || 0,
      passingScore:     passingScore     || 70,
      attemptsAllowed:  attemptsAllowed  || 0, // 0 = unlimited
      shuffleQuestions: true,
      showAnswers:      true,
    });

    // 3. Auto-create a new "Quizzes" section at the end of the course
    //    (or reuse existing one if already named "Quizzes")
    let quizSection = course.sections.find(
      s => s.title.toLowerCase() === 'quizzes' || s.title.toLowerCase() === 'quiz'
    );

    if (!quizSection) {
      // Add a fresh section called "Quizzes" at the end
      course.sections.push({
        title:       'Quizzes',
        description: 'Auto-generated quizzes for this course',
        order:       course.sections.length,
        lessons:     [],
      });
      // sections.push() doesn't return the doc — grab it by position
      quizSection = course.sections[course.sections.length - 1];
    }

    // 4. Add quiz lesson into the section
    quizSection.lessons.push({
      title:       quizTitle,
      description: `${questions.length} questions · AI generated`,
      type:        'quiz',
      quiz:        quiz._id,
      isFree:      false,
      order:       quizSection.lessons.length,
    });

    await course.save();

    res.status(201).json({
      success: true,
      message: `Quiz saved and added to the "Quizzes" section.`,
      data: { quiz, course },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/quizzes/my-results — Student: all quiz results across all courses ──
exports.getMyResults = async (req, res, next) => {
  try {
    const results = await QuizResult.find({ student: req.user._id })
      .populate('quiz',   'title passingScore')
      .populate('course', 'title thumbnail')
      .sort('-createdAt')
      ;

    // For each quiz keep only the latest attempt
    const seen    = new Set();
    const latest  = [];
    for (const r of results) {
      const qid = r.quiz?._id?.toString();
      if (!qid || seen.has(qid)) continue;
      seen.add(qid);
      latest.push(r);
    }

    res.json({ success: true, data: { results: latest } });
  } catch (error) {
    next(error);
  }
};