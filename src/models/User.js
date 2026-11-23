const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true, match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'] },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['admin', 'faculty', 'student'], default: 'student', required: true },
  studentId: { type: String, trim: true, sparse: true, unique: true },
  department: { type: String, trim: true, maxlength: 100 },
  refreshTokens: { type: [String], select: false, default: [] },
  active: { type: Boolean, default: true }
}, { timestamps: true, toJSON: { virtuals: true, transform: (_, ret) => { delete ret.password; delete ret.refreshTokens; delete ret.__v; return ret; } } });

userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword = function comparePassword(candidate) { return bcrypt.compare(candidate, this.password); };

module.exports = mongoose.model('User', userSchema);
