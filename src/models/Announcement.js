const mongoose = require('mongoose');
module.exports = mongoose.model('Announcement', new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  scope: { type: String, enum: ['campus', 'section'], required: true },
  section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  active: { type: Boolean, default: true, index: true }
}, { timestamps: true }).index({ scope: 1, section: 1, createdAt: -1 }));
