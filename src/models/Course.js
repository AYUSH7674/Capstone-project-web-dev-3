const mongoose = require('mongoose');
module.exports = mongoose.model('Course', new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true, unique: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000 },
  credits: { type: Number, required: true, min: 1, max: 6, validate: { validator: Number.isInteger, message: 'Credits must be a whole number' } },
  department: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true }));
