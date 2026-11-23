const mongoose = require('mongoose');
module.exports = mongoose.model('Section', new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  term: { type: String, required: true, trim: true },
  sectionCode: { type: String, required: true, uppercase: true, trim: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  capacity: { type: Number, min: 1, max: 500, default: 40, validate: { validator: Number.isInteger, message: 'Capacity must be a whole number' } },
  active: { type: Boolean, default: true }
}, { timestamps: true }).index({ course: 1, term: 1, sectionCode: 1 }, { unique: true }));
