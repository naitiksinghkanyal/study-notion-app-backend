/**
 * createAdmin.js — Create admin account from environment variables
 * 
 * Usage:
 *   cd backend
 *   node createAdmin.js
 * 
 * Set these in your .env file before running:
 *   ADMIN_EMAIL=your@email.com
 *   ADMIN_PASSWORD=YourStrongPassword123!
 *   ADMIN_NAME=Admin
 */

require('dotenv').config();
const mongoose = require('mongoose');

// ── Read from env — no hardcoded credentials ──────────────────────────────────
const ADMIN_NAME     = process.env.ADMIN_NAME     || 'Admin';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ── Validate before connecting ────────────────────────────────────────────────
if (!ADMIN_EMAIL) {
  console.error('❌ ADMIN_EMAIL is not set in your .env file');
  console.error('   Add: ADMIN_EMAIL=your@email.com');
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.error('❌ ADMIN_PASSWORD is not set in your .env file');
  console.error('   Add: ADMIN_PASSWORD=YourStrongPassword123!');
  process.exit(1);
}

if (ADMIN_PASSWORD.length < 8) {
  console.error('❌ ADMIN_PASSWORD must be at least 8 characters');
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  console.error('❌ MONGO_URI is not set in your .env file');
  process.exit(1);
}

// ── Run ───────────────────────────────────────────────────────────────────────
const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('./models/User');

    const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });

    if (existing) {
      console.log(`\n⚠️  Account already exists: ${ADMIN_EMAIL}`);
      console.log(`   Current role: ${existing.role}`);

      if (existing.role !== 'admin') {
        existing.role = 'admin';
        await existing.save({ validateBeforeSave: false });
        console.log('   ✅ Promoted to admin!');
      } else {
        console.log('   ✅ Already an admin. Nothing to do.');
      }
    } else {
      await User.create({
        name:     ADMIN_NAME,
        email:    ADMIN_EMAIL.toLowerCase(),
        password: ADMIN_PASSWORD,
        role:     'admin',
        isActive: true,
      });

      console.log('\n✅ Admin account created!');
      console.log('─────────────────────────────────');
      console.log(`   Name:  ${ADMIN_NAME}`);
      console.log(`   Email: ${ADMIN_EMAIL}`);
      console.log(`   Role:  admin`);
      console.log('─────────────────────────────────');
      console.log('\n👉 Login at your app URL\n');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();