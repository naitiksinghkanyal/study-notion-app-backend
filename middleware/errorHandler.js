/**
 * Global Error Handler
 */

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    message = `Resource not found with id: ${err.value}`;
    statusCode = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
    statusCode = 409;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map((e) => e.message).join('. ');
    statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError')  { message = 'Invalid token.';  statusCode = 401; }
  if (err.name === 'TokenExpiredError')  { message = 'Token expired.';  statusCode = 401; }

  // ── Multer errors ──────────────────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    message    = 'File is too large. Maximum size: videos 500 MB, images 5 MB.';
    statusCode = 413;
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    message    = `Unexpected field: ${err.field}. Check your form field name.`;
    statusCode = 400;
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    message    = 'Too many files uploaded at once.';
    statusCode = 400;
  }

  // Generic multer error
  if (err.name === 'MulterError') {
    message    = `Upload error: ${err.message}`;
    statusCode = 400;
  }

  // Express body-parser too-large (413)
  if (err.type === 'entity.too.large') {
    message    = 'Request body too large.';
    statusCode = 413;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[Error] ${statusCode} — ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack } : {}),
  });
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = errorHandler;
module.exports.AppError = AppError;