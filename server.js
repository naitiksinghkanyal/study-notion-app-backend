/**
 * EduPlatform — Main Server Entry Point
 * Production-safe: won't crash on missing optional env vars
 */

require('dotenv').config();
const express   = require('express');
const http      = require('http');
const path      = require('path');
const { Server } = require('socket.io');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// ── Validate critical env vars before starting ────────────────────────────────
const REQUIRED = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n   ${missing.join('\n   ')}`);
  console.error('\nAdd these in Railway → Variables tab, then redeploy.\n');
  process.exit(1);
}

// ── Connect DB ────────────────────────────────────────────────────────────────
connectDB();

const app        = express();
const httpServer = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────────
const allowedOrigin = process.env.CLIENT_URL || '*';
const io = new Server(httpServer, {
  cors: { origin: allowedOrigin, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
  transports: ['websocket', 'polling'],
});
app.set('io', io);

// Load socket handler safely
try {
  const chatHandler = require('./socket/chatHandler');
  chatHandler(io);
} catch (err) {
  console.warn('Socket chat handler not loaded:', err.message);
}

// ── Security & logging ────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Accept requests from CLIENT_URL, or any vercel/render domain, or all in dev
const corsOptions = {
  origin: (origin, callback) => {
    // Allow no-origin requests (Postman, mobile, server-to-server)
    if (!origin) return callback(null, true);

    const clientUrl = process.env.CLIENT_URL || '';

    // Always allow if explicitly matched
    if (clientUrl && origin === clientUrl) return callback(null, true);

    // Allow all vercel.app and onrender.com domains (safe for this project)
    if (
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com') ||
      origin === 'http://localhost:5173' ||
      origin === 'http://localhost:3000'
    ) {
      return callback(null, true);
    }

    // Allow all in development
    if (process.env.NODE_ENV !== 'production') return callback(null, true);

    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
// Handle preflight requests for all routes
app.options('*', cors(corsOptions));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Static uploads ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Body parsing ──────────────────────────────────────────────────────────────
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

// ── Load routes safely ────────────────────────────────────────────────────────
const loadRoute = (path, mountAt) => {
  try {
    app.use(mountAt, require(path));
  } catch (err) {
    console.error(`❌ Failed to load route ${mountAt}:`, err.message);
  }
};

loadRoute('./routes/auth',        '/api/auth');
loadRoute('./routes/courses',     '/api/courses');
loadRoute('./routes/users',       '/api/users');
loadRoute('./routes/enrollments', '/api/enrollments');
loadRoute('./routes/quizzes',     '/api/quizzes');
loadRoute('./routes/analytics',   '/api/analytics');
loadRoute('./routes/payments',    '/api/payments');
loadRoute('./routes/aiChat',      '/api/ai-chat');
loadRoute('./routes/streak',      '/api/streak');
loadRoute('./routes/roadmap',     '/api/roadmap');

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success:   true,
    message:   'EduPlatform API running 🚀',
    timestamp: new Date(),
    env:       process.env.NODE_ENV || 'development',
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health: http://localhost:${PORT}/api/health\n`);
});

module.exports = { app, io };