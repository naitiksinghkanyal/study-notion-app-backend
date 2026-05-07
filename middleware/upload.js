/**
 * Upload Middleware
 * - Uses local disk storage by default (works with zero config)
 * - Switches to Cloudinary automatically when env vars are set
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Cloudinary check ──────────────────────────────────────────────────────────
const useCloudinary =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY    &&
  process.env.CLOUDINARY_API_SECRET &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name';

// ── Create local upload dirs ──────────────────────────────────────────────────
const uploadsRoot = path.join(__dirname, '..', 'uploads');
['images', 'videos'].forEach((sub) => {
  const dir = path.join(uploadsRoot, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Local disk storage ────────────────────────────────────────────────────────
const diskStorage = multer.diskStorage({
  destination(req, file, cb) {
    const sub = file.mimetype.startsWith('video/') ? 'videos' : 'images';
    cb(null, path.join(uploadsRoot, sub));
  },
  filename(req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});

// Middleware that rewrites req.file.path to a URL the frontend can use
function attachLocalUrl(req, res, next) {
  if (req.file) {
    const sub = req.file.mimetype.startsWith('video/') ? 'videos' : 'images';
    req.file.path = `/uploads/${sub}/${req.file.filename}`;
  }
  next();
}

// Image file filter
function imageFilter(req, file, cb) {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed (jpg, png, webp)'), false);
}

// Video file filter
function videoFilter(req, file, cb) {
  const allowed = [
    'video/mp4',
    'video/quicktime',     // .mov
    'video/x-msvideo',    // .avi
    'video/x-matroska',   // .mkv
    'video/webm',
    'video/mpeg',
    'video/ogg',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Video type not allowed: ${file.mimetype}. Use mp4, mov, webm, avi or mkv.`), false);
}

// ── Cloudinary storage ────────────────────────────────────────────────────────
let cloudinaryUploaders;

if (useCloudinary) {
  try {
    const cloudinary          = require('../config/cloudinary');
    const { CloudinaryStorage } = require('multer-storage-cloudinary');

    const imageStorage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder:          'eduplatform/images',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation:  [{ width: 1280, height: 720, crop: 'limit', quality: 'auto' }],
      },
    });

    const videoStorage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder:          'eduplatform/videos',
        resource_type:   'video',
        allowed_formats: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
      },
    });

    cloudinaryUploaders = {
      image: multer({ storage: imageStorage, limits: { fileSize: 5   * 1024 * 1024 }, fileFilter: imageFilter }),
      video: multer({ storage: videoStorage, limits: { fileSize: 500 * 1024 * 1024 }, fileFilter: videoFilter }),
    };
    console.log('📦 Upload storage: Cloudinary');
  } catch (err) {
    console.warn('⚠️  Cloudinary init failed, falling back to local disk:', err.message);
  }
}

if (!cloudinaryUploaders) {
  console.log('📁 Upload storage: local disk  →  backend/uploads/');
}

// ── Exported helpers ──────────────────────────────────────────────────────────
// These look the same to the route layer regardless of storage backend.

// uploadImage.single('fieldname')  →  works in route as a single middleware
// uploadVideo.single('fieldname')  →  same

const uploadImage = cloudinaryUploaders
  ? cloudinaryUploaders.image
  : {
      single: (field) => [
        multer({
          storage:    diskStorage,
          limits:     { fileSize: 5 * 1024 * 1024 },
          fileFilter: imageFilter,
        }).single(field),
        attachLocalUrl,
      ],
    };

const uploadVideo = cloudinaryUploaders
  ? cloudinaryUploaders.video
  : {
      single: (field) => [
        multer({
          storage:    diskStorage,
          // 500 MB limit for local video — multer handles this, NOT express body parser
          limits:     { fileSize: 500 * 1024 * 1024 },
          fileFilter: videoFilter,
        }).single(field),
        attachLocalUrl,
      ],
    };

module.exports = { uploadImage, uploadVideo, useCloudinary: !!cloudinaryUploaders };