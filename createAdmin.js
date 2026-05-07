/**
 * createAdmin.js — Run this ONCE to create your admin account
 * 
 * Usage:
 *   cd backend
 *   node createAdmin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── Your admin credentials — change these ─────────────────────────────────────
const ADMIN_NAME     = 'Naitik Singh Kanyal';
const ADMIN_EMAIL    = 'naitiksinghkanyal@gmail.com';
const ADMIN_PASSWORD = 'Admin1234!';
// ─────────────────────────────────────────────────────────────────────────────

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB...');

    // Use the User model directly
    const User = require('./models/User');

    // Check if admin already exists
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log(`\n⚠️  An account with ${ADMIN_EMAIL} already exists.`);
      console.log(`   Role: ${existing.role}`);

      if (existing.role !== 'admin') {
        // Promote to admin
        existing.role = 'admin';
        await existing.save({ validateBeforeSave: false });
        console.log('   ✅ Promoted to admin!');
      } else {
        console.log('   ✅ Already an admin. Nothing to do.');
      }

      process.exit(0);
    }

    // Create the admin user
    const admin = await User.create({
      name:     ADMIN_NAME,
      email:    ADMIN_EMAIL,
      password: ADMIN_PASSWORD,   // hashed automatically by User model pre-save hook
      role:     'admin',
      isActive: true,
    });

    console.log('\n✅ Admin account created successfully!');
    console.log('─────────────────────────────────────');
    console.log(`   Name:     ${admin.name}`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   Role:     ${admin.role}`);
    console.log('─────────────────────────────────────');
    console.log('\n👉 Go to http://localhost:5173/login and sign in!');
    console.log('   Then visit /admin/dashboard to manage courses & users.\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();