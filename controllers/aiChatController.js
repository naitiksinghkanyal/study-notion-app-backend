/**
 * aiChatController.js
 * Feature 1: AI-Based Instant Doubt-Solving Chatbox
 * Production-safe: never crashes the server, graceful fallbacks everywhere
 */

const { AppError } = require('../middleware/errorHandler');
const rateLimit    = require('express-rate-limit');

// ── Rate limiter: 20 questions per 10 min per user ────────────────────────────
const chatRateLimiter = rateLimit({
  windowMs:    10 * 60 * 1000,
  max:         20,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message:     { success: false, message: 'Too many questions. Please wait a moment.' },
});

// ── Safely load ChatHistory model ─────────────────────────────────────────────
let ChatHistory = null;
try {
  ChatHistory = require('../models/ChatHistory');
} catch (err) {
  console.warn('⚠️  ChatHistory model not found — chat history disabled:', err.message);
}

// ── Call Gemini API ───────────────────────────────────────────────────────────
const callGemini = async (messages) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your-gemini-key-here' || apiKey.trim() === '') {
    throw new AppError(
      'AI tutor is not configured. Please add GEMINI_API_KEY to your environment variables.',
      503
    );
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Convert to Gemini format — must alternate user/model roles
  // Gemini does not support system role, so we inject context as first user msg
  const contents = [];
  for (const msg of messages) {
    contents.push({
      role:  msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  let response;
  try {
    response = await fetch(url, {
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
  } catch (fetchErr) {
    console.error('Gemini fetch error:', fetchErr.message);
    throw new AppError('Could not reach AI service. Check your internet connection.', 503);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown error');
    console.error('Gemini API error:', response.status, errText);

    if (response.status === 400) throw new AppError('Invalid request to AI service.', 400);
    if (response.status === 403) throw new AppError('Invalid GEMINI_API_KEY. Check your API key.', 503);
    if (response.status === 429) throw new AppError('AI service rate limit hit. Please wait a moment.', 429);

    throw new AppError('AI service error. Please try again later.', 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new AppError('AI returned an unexpected response. Please try again.', 500);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error('Gemini empty response:', JSON.stringify(data));
    throw new AppError('AI returned an empty response. Please try again.', 500);
  }

  return text;
};

// ── Build system prompt ───────────────────────────────────────────────────────
const buildSystemPrompt = ({ courseTitle, lessonTitle, lessonType, courseCategory }) => `
You are an expert AI tutor for EduPlatform, an online learning platform.
The student is currently enrolled in a course and needs help.

COURSE CONTEXT:
- Course: "${courseTitle || 'Unknown Course'}"
- Category: "${courseCategory || 'General'}"
- Current Lesson: "${lessonTitle || 'Unknown Lesson'}"
- Lesson Type: ${lessonType || 'video'}

YOUR ROLE:
- Answer questions clearly and concisely related to the course
- Provide step-by-step explanations when needed
- Give practical examples that help understanding
- Be encouraging and supportive
- Keep responses focused (2-4 paragraphs max unless more detail is needed)
- Format code clearly if providing code examples

Always be helpful, accurate, and relate answers to the course context when possible.
`.trim();

// ── POST /api/ai-chat/ask ─────────────────────────────────────────────────────
exports.askQuestion = [
  chatRateLimiter,
  async (req, res, next) => {
    try {
      // 1. Validate API key early
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'your-gemini-key-here' || apiKey.trim() === '') {
        return res.status(503).json({
          success: false,
          message: 'AI tutor is not configured. Add GEMINI_API_KEY to your Render environment variables.',
        });
      }

      // 2. Validate input
      const {
        question, courseId, courseTitle, lessonTitle,
        lessonType, courseCategory, sessionId,
      } = req.body;

      if (!question?.trim()) {
        return res.status(400).json({ success: false, message: 'Question is required.' });
      }

      const userId  = req.user._id.toString();
      const session = sessionId || `${userId}_${courseId || 'general'}`;

      // 3. Load chat history (safely — history is a nice-to-have, not critical)
      let history = [];
      let chatDoc = null;

      if (ChatHistory && courseId) {
        try {
          chatDoc = await ChatHistory.findOne({ session });
          history = chatDoc?.messages?.slice(-20) || [];
        } catch (dbErr) {
          console.warn('Could not load chat history:', dbErr.message);
          history = [];
        }
      }

      // 4. Build message array for Gemini
      const systemPrompt = buildSystemPrompt({ courseTitle, lessonTitle, lessonType, courseCategory });

      // Gemini needs alternating user/model messages
      // We inject system context as first user message with a model acknowledgement
      const messages = [
        { role: 'user',      content: systemPrompt },
        { role: 'assistant', content: "Got it! I'm ready to help with questions about this course." },
        ...history,
        { role: 'user',      content: question.trim() },
      ];

      // 5. Call AI
      const answer = await callGemini(messages);

      // 6. Save to history (non-critical)
      if (ChatHistory && courseId) {
        try {
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
        } catch (saveErr) {
          console.warn('Could not save chat history (non-critical):', saveErr.message);
        }
      }

      // 7. Respond
      res.json({ success: true, data: { answer, session } });

    } catch (error) {
      // If it's our own AppError, pass to error handler
      if (error.statusCode) return next(error);

      // Unexpected error — log and return 500
      console.error('AI chat unexpected error:', error.message);
      next(new AppError('Unexpected error in AI tutor. Please try again.', 500));
    }
  },
];

// ── GET /api/ai-chat/history ──────────────────────────────────────────────────
exports.getHistory = async (req, res, next) => {
  try {
    if (!ChatHistory) {
      return res.json({ success: true, data: { messages: [], session: null } });
    }

    const { courseId } = req.query;
    if (!courseId) {
      return res.json({ success: true, data: { messages: [], session: null } });
    }

    const session = `${req.user._id}_${courseId}`;
    const chatDoc = await ChatHistory.findOne({ session }).catch(() => null);

    res.json({
      success: true,
      data: { messages: chatDoc?.messages || [], session },
    });
  } catch (error) {
    // Never crash — just return empty history
    res.json({ success: true, data: { messages: [], session: null } });
  }
};

// ── DELETE /api/ai-chat/clear ─────────────────────────────────────────────────
exports.clearHistory = async (req, res, next) => {
  try {
    if (ChatHistory) {
      const { courseId } = req.body;
      const session = `${req.user._id}_${courseId}`;
      await ChatHistory.deleteOne({ session }).catch(() => {});
    }
    res.json({ success: true, message: 'Chat history cleared.' });
  } catch (error) {
    res.json({ success: true, message: 'Chat cleared.' });
  }
};