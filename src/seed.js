require('dotenv').config();
const { loadEnv } = require('./config/env');
const { connectDatabase } = require('./config/database');
const User = require('./models/User');

async function seed() {
  loadEnv();
  await connectDatabase();
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@campus.local';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set SEED_ADMIN_PASSWORD (at least 8 characters) in .env before seeding');
  const existing = await User.findOne({ email });
  if (existing) throw new Error(`An account already exists for ${email}; seed stopped without changing data`);
  await User.create({ name: 'Campus Administrator', email, password, role: 'admin', department: 'Administration' });
  console.log(`✓ Admin account created for ${email}`);
  await require('mongoose').disconnect();
}
seed().catch(async (err) => { console.error('✗ Seed failed:', err.message); await require('mongoose').disconnect(); process.exit(1); });
