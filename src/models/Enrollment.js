const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  status: { type: String, enum: ['enrolled', 'withdrawn'], default: 'enrolled' },
  enrolledAt: { type: Date, default: Date.now }
}, { timestamps: true });
schema.index({ student: 1, section: 1 }, { unique: true });
module.exports = mongoose.model('Enrollment', schema);
