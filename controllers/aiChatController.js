/**
 * aiChatController.js
 * Feature 1: AI-Based Instant Doubt-Solving Chatbox
 * 
 * POST /api/ai-chat/ask     — Send a question, get AI answer
 * GET  /api/ai-chat/history — Get chat history for a course session
 * DELETE /api/ai-chat/clear — Clear session history
 * 
 * Libraries: mongoose (already installed), node-fetch (built into Node 18+)
 */

const ChatHistory = require('../models/ChatHistory');
const { AppError } = require('../middleware/errorHandler');
const rateLimit    = require('express-rate-limit');

// ── Rate limiter for AI chat (20 questions per 10 min per user) ──────────────
const chatRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { success: false, message: 'Too many questions. Please wait a moment.' },
});

// ── Call Gemini API ───────────────────────────────────────────────────────────
const callGemini = async (messages) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-key-here') {
    throw new AppError('AI service not configured. Add GEMINI_API_KEY to .env', 503);
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Convert our message history to Gemini format
  const contents = messages.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature:     0.7,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Gemini error:', err);
    throw new AppError('AI service error. Please try again.', 502);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
};

// ── Build system prompt with course context ───────────────────────────────────
const buildSystemPrompt = ({ courseTitle, lessonTitle, lessonType, courseCategory }) => `
You are an expert learning assistant for EduPlatform, an online learning platform.
The student is currently enrolled in a course and needs help understanding the material.

COURSE CONTEXT:
- Course: "${courseTitle || 'Unknown Course'}"
- Category: "${courseCategory || 'General'}"
- Current Lesson: "${lessonTitle || 'Unknown Lesson'}"
- Lesson Type: ${lessonType || 'video'}

YOUR ROLE:
- Answer questions clearly and concisely
- Relate answers specifically to the course context when possible
- Provide step-by-step explanations when needed
- Give practical examples that a student would understand
- Use simple language, avoid unnecessary jargon
- If you give code examples, format them clearly
- Be encouraging and supportive

RESPONSE FORMAT:
- Start with a direct answer
- Follow with explanation if needed
- Add an example if it helps clarity
- Keep responses focused and not overly long (2-4 paragraphs max unless more detail is genuinely needed)

Remember: You are helping a student learn, not writing a textbook. Be like a helpful tutor.
`.trim();

// ── POST /api/ai-chat/ask ─────────────────────────────────────────────────────
exports.askQuestion = [
  chatRateLimiter,
  async (req, res, next) => {
    try {
      const {
        question, courseId, courseTitle, lessonTitle,
        lessonType, courseCategory, sessionId,
      } = req.body;

      if (!question?.trim()) return next(new AppError('Question is required.', 400));
      if (!courseId)         return next(new AppError('courseId is required.', 400));

      const userId  = req.user._id;
      const session = sessionId || `${userId}_${courseId}`;

      // Load existing conversation history (last 10 exchanges = 20 messages)
      let chatDoc = await ChatHistory.findOne({ session });
      const history = chatDoc?.messages?.slice(-20) || [];

      // Build the full prompt messages array:
      // [system context as first user msg, ...history, new question]
      const systemPrompt = buildSystemPrompt({ courseTitle, lessonTitle, lessonType, courseCategory });

      const messages = [
        // Inject system context as a leading user message (Gemini doesn't have system role)
        { role: 'user',      content: systemPrompt },
        { role: 'assistant', content: 'Understood! I\'m ready to help with your questions about this course.' },
        // Previous conversation
        ...history,
        // New question
        { role: 'user', content: question.trim() },
      ];

      // Call AI
      const answer = await callGemini(messages);

      // Save to history
      const newMessages = [
        ...history,
        { role: 'user',      content: question.trim(), timestamp: new Date() },
        { role: 'assistant', content: answer,           timestamp: new Date() },
      ];

      if (chatDoc) {
        chatDoc.messages    = newMessages;
        chatDoc.lastUpdated = new Date();
        await chatDoc.save();
      } else {
        await ChatHistory.create({
          session,
          userId,
          courseId,
          messages: newMessages,
        });
      }

      res.json({
        success: true,
        data: { answer, session },
      });
    } catch (error) {
      next(error);
    }
  },
];

// ── GET /api/ai-chat/history ──────────────────────────────────────────────────
exports.getHistory = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!courseId) return next(new AppError('courseId is required.', 400));

    const session = `${req.user._id}_${courseId}`;
    const chatDoc = await ChatHistory.findOne({ session });

    res.json({
      success: true,
      data: { messages: chatDoc?.messages || [], session },
    });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/ai-chat/clear ─────────────────────────────────────────────────
exports.clearHistory = async (req, res, next) => {
  try {
    const { courseId } = req.body;
    const session = `${req.user._id}_${courseId}`;
    await ChatHistory.deleteOne({ session });
    res.json({ success: true, message: 'Chat history cleared.' });
  } catch (error) {
    next(error);
  }
};