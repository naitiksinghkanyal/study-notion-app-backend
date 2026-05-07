/**
 * EduPlatform — Main Server Entry Point
 * Updated with: AI Chat, Streak, and Career Roadmap routes
 */

require('dotenv').config();
const express  = require('express');
const http     = require('http');
const path     = require('path');
const { Server } = require('socket.io');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const chatHandler  = require('./socket/chatHandler');

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes       = require('./routes/auth');
const courseRoutes     = require('./routes/courses');
const userRoutes       = require('./routes/users');
const enrollmentRoutes = require('./routes/enrollments');
const quizRoutes       = require('./routes/quizzes');
const analyticsRoutes  = require('./routes/analytics');
const paymentRoutes    = require('./routes/payments');
// Feature routes
const aiChatRoutes     = require('./routes/aiChat');
const streakRoutes     = require('./routes/streak');
const roadmapRoutes    = require('./routes/roadmap');

connectDB();

const app        = express();
const httpServer = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8,
});
app.set('io', io);
chatHandler(io);

// ── Security & logging ────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan('dev'));

// ── Static file serving for local uploads ────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Body parsing ──────────────────────────────────────────────────────────────
// Skip for multipart (multer handles it) and Stripe webhook (needs raw body)
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.startsWith('multipart/form-data')) return next();
  if (req.originalUrl === '/api/payments/webhook') return next();
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.startsWith('multipart/form-data')) return next();
  express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});

// ── Rate limiter ──────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: (req) => req.path.includes('/lessons') || req.path.includes('/profile'),
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/courses',     courseRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/quizzes',     quizRoutes);
app.use('/api/analytics',   analyticsRoutes);
app.use('/api/payments',    paymentRoutes);

// Feature routes
app.use('/api/ai-chat',     aiChatRoutes);   // Feature 1: AI Doubt Solver
app.use('/api/streak',      streakRoutes);   // Feature 2: Login Streak
app.use('/api/roadmap',     roadmapRoutes);  // Feature 3: Career Roadmap

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success:   true,
    message:   'EduPlatform API running 🚀',
    timestamp: new Date(),
    features:  ['AI Chat', 'Streak', 'Career Roadmap'],
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 EduPlatform server running on http://localhost:${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✨ Features: AI Chat · Login Streak · Career Roadmap\n`);
});

module.exports = { app, io };