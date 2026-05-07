/**
 * roadmapController.js
 * Feature 3: AI Career Roadmap Generator
 * 
 * POST /api/roadmap/generate — Generate a career roadmap from a goal string
 * GET  /api/roadmap/history  — Get user's saved roadmaps
 * POST /api/roadmap/save     — Save a generated roadmap
 * DELETE /api/roadmap/:id    — Delete a saved roadmap
 */

const Roadmap     = require('../models/Roadmap');
const { AppError} = require('../middleware/errorHandler');

// ── POST /api/roadmap/generate ────────────────────────────────────────────────
exports.generateRoadmap = async (req, res, next) => {
  try {
    const { goal, currentLevel, timeframe } = req.body;
    if (!goal?.trim()) return next(new AppError('Goal is required.', 400));

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-key-here') {
      return next(new AppError('AI service not configured. Add GEMINI_API_KEY to .env', 503));
    }

    // ── Prompt engineering for structured consistent output ──────────────────
    const prompt = `You are a world-class career coach and technical mentor.
A student has the following career goal: "${goal.trim()}"
Current level: ${currentLevel || 'complete beginner'}
Desired timeframe: ${timeframe || 'no specific timeframe'}

Generate a detailed, actionable career roadmap. 
Respond ONLY with a valid JSON object — no markdown, no backticks, no explanation.

Use EXACTLY this format:
{
  "title": "Roadmap title (e.g. 'Your Path to Becoming a Software Developer')",
  "summary": "2-3 sentence overview of the journey",
  "estimatedTime": "e.g. 12-18 months",
  "phases": [
    {
      "phase": 1,
      "title": "Phase title (e.g. 'Foundation')",
      "duration": "e.g. 1-2 months",
      "description": "What this phase focuses on",
      "skills": ["skill1", "skill2", "skill3"],
      "projects": ["project1", "project2"],
      "tools": ["tool1", "tool2"],
      "resources": ["resource1", "resource2"],
      "milestone": "What achievement marks completion of this phase"
    }
  ],
  "tips": ["tip1", "tip2", "tip3"],
  "careerOutcomes": ["outcome1", "outcome2", "outcome3"]
}

Rules:
- Create 4-6 phases from beginner to job-ready/advanced
- Keep phases realistic and achievable
- Skills should be specific and actionable
- Projects should be concrete portfolio-worthy ideas
- Tools should be industry-standard and relevant
- Return ONLY the JSON — nothing else`;

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini roadmap error:', err);
      return next(new AppError('AI service error. Please try again.', 502));
    }

    const aiData  = await response.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON — strip accidental markdown fences
    let roadmap;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      roadmap = JSON.parse(cleaned);
    } catch {
      console.error('Roadmap parse error:', rawText.slice(0, 500));
      return next(new AppError('AI returned invalid format. Please try again.', 500));
    }

    res.json({ success: true, data: { roadmap, goal: goal.trim() } });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/roadmap/save ────────────────────────────────────────────────────
exports.saveRoadmap = async (req, res, next) => {
  try {
    const { goal, roadmap } = req.body;
    if (!roadmap) return next(new AppError('Roadmap data is required.', 400));

    const saved = await Roadmap.create({
      user:    req.user._id,
      goal:    goal || roadmap.title,
      roadmap,
    });

    res.status(201).json({ success: true, data: { roadmap: saved } });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/roadmap/history ──────────────────────────────────────────────────
exports.getRoadmaps = async (req, res, next) => {
  try {
    const roadmaps = await Roadmap.find({ user: req.user._id })
      .select('goal createdAt roadmap.title roadmap.estimatedTime')
      .sort('-createdAt')
      .limit(10);

    res.json({ success: true, data: { roadmaps } });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/roadmap/:id ───────────────────────────────────────────────────
exports.deleteRoadmap = async (req, res, next) => {
  try {
    const r = await Roadmap.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!r) return next(new AppError('Roadmap not found.', 404));
    res.json({ success: true, message: 'Roadmap deleted.' });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/roadmap/:id ──────────────────────────────────────────────────────
exports.getRoadmap = async (req, res, next) => {
  try {
    const r = await Roadmap.findOne({ _id: req.params.id, user: req.user._id });
    if (!r) return next(new AppError('Roadmap not found.', 404));
    res.json({ success: true, data: { roadmap: r } });
  } catch (error) {
    next(error);
  }
};