const mongoose = require('mongoose');
const Announcement = require('../models/Announcement');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const { success, asyncHandler } = require('../utils/api');
const appEvents = require('../events/appEvents');

const listAnnouncements = asyncHandler(async (req, res) => {
  let sectionIds = [];
  if (req.user.role === 'student') sectionIds = await Enrollment.find({ student: req.user.id, status: 'enrolled' }).distinct('section');
  if (req.user.role === 'faculty') sectionIds = await Section.find({ faculty: req.user.id, active: true }).distinct('_id');
  const filter = req.user.role === 'student'
    ? { active: { $ne: false }, $or: [{ scope: 'campus' }, { scope: 'section', section: { $in: sectionIds } }] }
    : req.user.role === 'faculty'
      ? { active: { $ne: false }, $or: [{ scope: 'campus' }, { scope: 'section', section: { $in: sectionIds } }] }
      : { active: { $ne: false } };
  const items = await Announcement.find(filter).populate('author', 'name role').populate({ path: 'section', populate: { path: 'course', select: 'code title' } }).sort({ createdAt: -1 }).limit(100);
  success(res, items, 'Announcements retrieved');
});

const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, scope, section: sectionId } = req.body;
  if (!title || !body || !['campus', 'section'].includes(scope)) return res.status(400).json({ success: false, message: 'Title, body and a valid scope are required' });
  if (req.user.role === 'faculty' && scope !== 'section') return res.status(403).json({ success: false, message: 'Faculty can publish announcements to their assigned sections' });
  if (scope === 'section') {
    const section = await Section.findById(sectionId);
    if (!section) return res.status(400).json({ success: false, message: 'A valid section is required' });
    if (req.user.role === 'faculty' && section.faculty.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'You can only post to your assigned sections' });
  }
  const announcement = await Announcement.create({ title, body, scope, section: scope === 'section' ? sectionId : null, author: req.user.id });
  const populated = await announcement.populate(['author', { path: 'section', populate: { path: 'course', select: 'code title' } }]);
  appEvents.emit('announcement:created', populated);
  success(res, populated, 'Announcement published', 201);
});

const canAccess = async (user, announcement) => {
  if (user.role === 'admin' || announcement.scope === 'campus') return true;
  if (user.role === 'faculty') return Section.exists({ _id: announcement.section, faculty: user.id, active: true });
  return Enrollment.exists({ section: announcement.section, student: user.id, status: 'enrolled' });
};

const getAnnouncement = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid announcement identifier' });
  const item = await Announcement.findOne({ _id: req.params.id, active: { $ne: false } }).populate('author', 'name role').populate({ path: 'section', populate: { path: 'course', select: 'code title' } });
  if (!item || !await canAccess(req.user, item)) return res.status(404).json({ success: false, message: 'Announcement not found' });
  success(res, item, 'Announcement retrieved');
});

const updateAnnouncement = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid announcement identifier' });
  const unknown = Object.keys(req.body).find((key) => !['title', 'body'].includes(key));
  if (unknown) return res.status(400).json({ success: false, message: `Unknown or restricted field: ${unknown}` });
  if (!Object.keys(req.body).length) return res.status(400).json({ success: false, message: 'Provide a title or body to update' });
  const item = await Announcement.findOne({ _id: req.params.id, active: { $ne: false } });
  if (!item) return res.status(404).json({ success: false, message: 'Announcement not found' });
  if (req.user.role !== 'admin' && (item.author.toString() !== req.user.id || !await canAccess(req.user, item))) return res.status(403).json({ success: false, message: 'You can only edit your own announcements while you have access to their audience' });
  Object.assign(item, req.body);
  await item.save();
  const populated = await item.populate(['author', { path: 'section', populate: { path: 'course', select: 'code title' } }]);
  appEvents.emit('announcement:updated', populated);
  success(res, populated, 'Announcement updated');
});

const archiveAnnouncement = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid announcement identifier' });
  const item = await Announcement.findOne({ _id: req.params.id, active: { $ne: false } });
  if (!item) return res.status(404).json({ success: false, message: 'Announcement not found' });
  if (req.user.role !== 'admin' && (item.author.toString() !== req.user.id || !await canAccess(req.user, item))) return res.status(403).json({ success: false, message: 'You can only archive your own announcements while you have access to their audience' });
  item.active = false;
  await item.save();
  appEvents.emit('announcement:archived', item);
  success(res, { id: item.id }, 'Announcement archived');
});

module.exports = { listAnnouncements, createAnnouncement, getAnnouncement, updateAnnouncement, archiveAnnouncement };
