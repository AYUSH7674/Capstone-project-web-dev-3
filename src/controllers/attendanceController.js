const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Section = require('../models/Section');
const { success, asyncHandler } = require('../utils/api');
const appEvents = require('../events/appEvents');

const markAttendance = asyncHandler(async (req, res) => {
  const { section: sectionId, sessionDate, records } = req.body;
  if (!sectionId || !sessionDate || !Array.isArray(records) || !records.length) return res.status(400).json({ success: false, message: 'Section, session date and a non-empty records array are required' });
  if (!mongoose.isValidObjectId(sectionId)) return res.status(400).json({ success: false, message: 'Invalid section identifier' });
  if (records.length > 500) return res.status(400).json({ success: false, message: 'Submit no more than 500 attendance records at a time' });
  const section = await Section.findOne({ _id: sectionId, active: true });
  if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
  if (req.user.role === 'faculty' && section.faculty.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'You can only mark attendance for your assigned sections' });
  const enrolled = new Set((await Enrollment.find({ section: sectionId, status: 'enrolled' }).distinct('student')).map(String));
  const allowed = new Set(['present', 'absent', 'late']);
  const seen = new Set();
  for (const record of records) {
    if (!record || Object.keys(record).some((key) => !['student', 'status', 'note'].includes(key))) return res.status(400).json({ success: false, message: 'Each record may contain only student, status and note fields' });
    if (!mongoose.isValidObjectId(record.student) || !enrolled.has(String(record.student)) || !allowed.has(record.status)) return res.status(400).json({ success: false, message: 'Every record must belong to an enrolled student and use present, absent or late status' });
    if (seen.has(String(record.student))) return res.status(400).json({ success: false, message: 'A student can appear only once in an attendance submission' });
    if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 250)) return res.status(400).json({ success: false, message: 'Attendance notes must be text no longer than 250 characters' });
    seen.add(String(record.student));
  }
  const date = new Date(sessionDate);
  if (Number.isNaN(date.getTime())) return res.status(400).json({ success: false, message: 'Session date is invalid' });
  date.setUTCHours(0, 0, 0, 0);
  const operations = records.map(({ student, status, note }) => ({
    updateOne: { filter: { student, section: sectionId, sessionDate: date }, update: { $set: { status, note, markedBy: req.user.id } }, upsert: true }
  }));
  const result = await Attendance.bulkWrite(operations);
  appEvents.emit('attendance:marked', { section: sectionId, sessionDate: date, count: records.length, markedBy: req.user.id });
  success(res, { created: result.upsertedCount, updated: result.modifiedCount, submitted: records.length }, 'Attendance saved');
});

const myAttendance = asyncHandler(async (req, res) => {
  const records = await Attendance.find({ student: req.user.id })
    .populate({ path: 'section', populate: { path: 'course', select: 'code title' } }).sort({ sessionDate: -1 });
  success(res, records, 'Attendance retrieved');
});

const listSectionAttendance = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.sectionId)) return res.status(400).json({ success: false, message: 'Invalid section identifier' });
  const section = await Section.findOne({ _id: req.params.sectionId, active: true });
  if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
  if (req.user.role === 'faculty' && section.faculty.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'You can only view attendance for your assigned sections' });
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = { section: section.id };
  if (req.query.date) {
    const date = new Date(req.query.date);
    if (Number.isNaN(date.getTime())) return res.status(400).json({ success: false, message: 'Attendance date is invalid' });
    date.setUTCHours(0, 0, 0, 0);
    filter.sessionDate = date;
  }
  const [records, total] = await Promise.all([
    Attendance.find(filter).populate('student', 'name studentId').populate('markedBy', 'name role')
      .sort({ sessionDate: -1, student: 1 }).skip((page - 1) * limit).limit(limit),
    Attendance.countDocuments(filter)
  ]);
  success(res, records, 'Section attendance retrieved', 200, { page, limit, total, pages: Math.ceil(total / limit) });
});

const correctAttendance = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid attendance identifier' });
  const allowedFields = ['status', 'note'];
  const unknown = Object.keys(req.body).find((key) => !allowedFields.includes(key));
  if (unknown) return res.status(400).json({ success: false, message: `Unknown or restricted field: ${unknown}` });
  if (!Object.keys(req.body).length) return res.status(400).json({ success: false, message: 'Provide a status or note to correct' });
  if (req.body.status && !['present', 'absent', 'late'].includes(req.body.status)) return res.status(400).json({ success: false, message: 'Status must be present, absent or late' });
  if (req.body.note !== undefined && (typeof req.body.note !== 'string' || req.body.note.length > 250)) return res.status(400).json({ success: false, message: 'Attendance notes must be text no longer than 250 characters' });
  const record = await Attendance.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Attendance record not found' });
  if (req.user.role === 'faculty') {
    const section = await Section.findById(record.section);
    if (!section || section.faculty.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'You can only correct attendance for your assigned sections' });
  }
  Object.assign(record, req.body, { markedBy: req.user.id });
  await record.save();
  appEvents.emit('attendance:marked', { section: record.section, sessionDate: record.sessionDate, count: 1, markedBy: req.user.id });
  success(res, record, 'Attendance corrected');
});

const report = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.sectionId)) return res.status(400).json({ success: false, message: 'Invalid section identifier' });
  const pipeline = [
    { $match: { section: new mongoose.Types.ObjectId(req.params.sectionId) } },
    { $group: { _id: '$student', totalClasses: { $sum: 1 }, attended: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } } } },
    { $addFields: { percentage: { $multiply: [{ $divide: ['$attended', '$totalClasses'] }, 100] } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'student' } },
    { $unwind: '$student' },
    { $project: { _id: 0, studentId: '$student._id', name: '$student.name', studentNumber: '$student.studentId', totalClasses: 1, attended: 1, percentage: { $round: ['$percentage', 1] } } },
    { $sort: { percentage: 1, name: 1 } }
  ];
  const section = await Section.findById(req.params.sectionId);
  if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
  if (req.user.role === 'faculty' && section.faculty.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'You can only view reports for your assigned sections' });
  const results = await Attendance.aggregate(pipeline);
  const threshold = Math.max(0, Math.min(100, Number(process.env.ATTENDANCE_THRESHOLD) || 75));
  success(res, { threshold, studentsBelowThreshold: results.filter((row) => row.percentage < threshold), summary: results }, 'Attendance report generated');
});

module.exports = { markAttendance, myAttendance, listSectionAttendance, correctAttendance, report };
