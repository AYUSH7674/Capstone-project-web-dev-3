const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const { success, asyncHandler } = require('../utils/api');

const pageArgs = (query) => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(query.limit) || 20))
});
const isId = (value) => mongoose.isValidObjectId(value);
const hasUnknown = (body, allowed) => Object.keys(body).find((key) => !allowed.includes(key));
const invalid = (res, message) => res.status(400).json({ success: false, message });
const missing = (res, resource) => res.status(404).json({ success: false, message: `${resource} not found` });
const populatedSection = (query) => query.populate('course', 'code title credits').populate('faculty', 'name email department');

const listUsers = asyncHandler(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const filter = { active: true };
  if (['admin', 'faculty', 'student'].includes(req.query.role)) filter.role = req.query.role;
  const [users, total] = await Promise.all([
    User.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(filter)
  ]);
  success(res, users, 'Users retrieved', 200, { page, limit, total, pages: Math.ceil(total / limit) });
});

const getUser = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid user identifier');
  const user = await User.findOne({ _id: req.params.id, active: true });
  if (!user) return missing(res, 'User');
  success(res, { user }, 'User retrieved');
});

const createUser = asyncHandler(async (req, res) => {
  const allowed = ['name', 'email', 'password', 'role', 'studentId', 'department'];
  const unknown = hasUnknown(req.body, allowed);
  if (unknown) return invalid(res, `Unknown field: ${unknown}`);
  const { name, email, password, role, studentId, department } = req.body;
  if (!name || !email || !password || !['faculty', 'student'].includes(role)) return invalid(res, 'Name, email, password and a faculty/student role are required');
  if (password.length < 8) return invalid(res, 'Password must contain at least 8 characters');
  if (role === 'student' && !studentId) return invalid(res, 'Student ID is required for student accounts');
  const user = await User.create({ name, email, password, role, studentId, department });
  success(res, { user }, 'User created', 201);
});

const updateUser = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid user identifier');
  const allowed = ['name', 'email', 'studentId', 'department'];
  const unknown = hasUnknown(req.body, allowed);
  if (unknown) return invalid(res, `Unknown or restricted field: ${unknown}`);
  if (!Object.keys(req.body).length) return invalid(res, 'Provide at least one field to update');
  const current = await User.findOne({ _id: req.params.id, active: true, role: { $ne: 'admin' } });
  if (!current) return missing(res, 'User');
  if (current.role === 'student' && !current.studentId && !req.body.studentId) return invalid(res, 'Student ID is required for student accounts');
  const user = await User.findOneAndUpdate({ _id: req.params.id, active: true, role: { $ne: 'admin' } }, req.body, { new: true, runValidators: true });
  if (!user) return missing(res, 'User');
  success(res, { user }, 'User updated');
});

const deactivateUser = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid user identifier');
  const facultySection = await Section.exists({ faculty: req.params.id, active: true });
  const target = await User.findOne({ _id: req.params.id, active: true, role: { $ne: 'admin' } }).select('role');
  if (!target) return missing(res, 'User');
  if (target.role === 'faculty' && facultySection) return res.status(409).json({ success: false, message: 'Reassign this faculty member’s active sections before deactivation' });
  if (target.role === 'student' && await Enrollment.exists({ student: req.params.id, status: 'enrolled' })) return res.status(409).json({ success: false, message: 'Withdraw the student from active sections before deactivation' });
  const user = await User.findOneAndUpdate({ _id: req.params.id, active: true, role: { $ne: 'admin' } }, { active: false }, { new: true });
  success(res, { user }, 'User deactivated');
});

const listCourses = asyncHandler(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const filter = { active: true };
  if (req.query.department) filter.department = req.query.department;
  const [courses, total] = await Promise.all([
    Course.find(filter).sort({ code: 1 }).skip((page - 1) * limit).limit(limit), Course.countDocuments(filter)
  ]);
  success(res, courses, 'Courses retrieved', 200, { page, limit, total, pages: Math.ceil(total / limit) });
});

const getCourse = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid course identifier');
  const course = await Course.findOne({ _id: req.params.id, active: true });
  if (!course) return missing(res, 'Course');
  success(res, course, 'Course retrieved');
});

const createCourse = asyncHandler(async (req, res) => {
  const allowed = ['code', 'title', 'description', 'credits', 'department'];
  const unknown = hasUnknown(req.body, allowed);
  if (unknown) return invalid(res, `Unknown field: ${unknown}`);
  const course = await Course.create(req.body);
  success(res, course, 'Course created', 201);
});

const updateCourse = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid course identifier');
  const allowed = ['code', 'title', 'description', 'credits', 'department'];
  const unknown = hasUnknown(req.body, allowed);
  if (unknown) return invalid(res, `Unknown or restricted field: ${unknown}`);
  if (!Object.keys(req.body).length) return invalid(res, 'Provide at least one field to update');
  const course = await Course.findOneAndUpdate({ _id: req.params.id, active: true }, req.body, { new: true, runValidators: true });
  if (!course) return missing(res, 'Course');
  success(res, course, 'Course updated');
});

const deactivateCourse = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid course identifier');
  const activeSection = await Section.exists({ course: req.params.id, active: true });
  if (activeSection) return res.status(409).json({ success: false, message: 'Deactivate the course sections before archiving this course' });
  const course = await Course.findOneAndUpdate({ _id: req.params.id, active: true }, { active: false }, { new: true });
  if (!course) return missing(res, 'Course');
  success(res, course, 'Course archived');
});

const listSections = asyncHandler(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const filter = { active: true };
  if (req.query.course) {
    if (!isId(req.query.course)) return invalid(res, 'Invalid course identifier');
    filter.course = req.query.course;
  }
  if (req.user.role === 'faculty') filter.faculty = req.user.id;
  if (req.user.role === 'student') {
    const enrolledIds = await Enrollment.find({ student: req.user.id, status: 'enrolled' }).distinct('section');
    filter._id = { $in: enrolledIds };
  }
  const [sections, total] = await Promise.all([
    populatedSection(Section.find(filter)).sort({ term: -1, sectionCode: 1 }).skip((page - 1) * limit).limit(limit), Section.countDocuments(filter)
  ]);
  success(res, sections, 'Sections retrieved', 200, { page, limit, total, pages: Math.ceil(total / limit) });
});

const getSection = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid section identifier');
  const section = await Section.findOne({ _id: req.params.id, active: true }).populate('course', 'code title credits').populate('faculty', 'name email department');
  if (!section) return missing(res, 'Section');
  if (req.user.role === 'faculty' && section.faculty.id !== req.user.id) return res.status(403).json({ success: false, message: 'You can only view your assigned sections' });
  if (req.user.role === 'student' && !await Enrollment.exists({ section: section.id, student: req.user.id, status: 'enrolled' })) return res.status(403).json({ success: false, message: 'You are not enrolled in this section' });
  success(res, section, 'Section retrieved');
});

const createSection = asyncHandler(async (req, res) => {
  const allowed = ['course', 'term', 'sectionCode', 'faculty', 'capacity'];
  const unknown = hasUnknown(req.body, allowed);
  if (unknown) return invalid(res, `Unknown field: ${unknown}`);
  const { course, term, sectionCode, faculty, capacity } = req.body;
  if (!course || !term || !sectionCode || !faculty) return invalid(res, 'Course, term, section code and faculty are required');
  if (!isId(course) || !isId(faculty)) return invalid(res, 'Course and faculty must be valid identifiers');
  const [courseRecord, instructor] = await Promise.all([
    Course.findOne({ _id: course, active: true }), User.findOne({ _id: faculty, role: 'faculty', active: true })
  ]);
  if (!courseRecord) return invalid(res, 'A valid active course is required');
  if (!instructor) return invalid(res, 'A valid active faculty account is required');
  const section = await Section.create({ course, term, sectionCode, faculty, capacity });
  success(res, await section.populate(['course', 'faculty']), 'Section created', 201);
});

const updateSection = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid section identifier');
  const allowed = ['term', 'sectionCode', 'faculty', 'capacity'];
  const unknown = hasUnknown(req.body, allowed);
  if (unknown) return invalid(res, `Unknown or restricted field: ${unknown}`);
  if (!Object.keys(req.body).length) return invalid(res, 'Provide at least one field to update');
  if (req.body.faculty) {
    if (!isId(req.body.faculty) || !await User.exists({ _id: req.body.faculty, role: 'faculty', active: true })) return invalid(res, 'A valid active faculty account is required');
  }
  const section = await Section.findOneAndUpdate({ _id: req.params.id, active: true }, req.body, { new: true, runValidators: true }).populate('course', 'code title credits').populate('faculty', 'name email department');
  if (!section) return missing(res, 'Section');
  success(res, section, 'Section updated');
});

const deactivateSection = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid section identifier');
  const hasEnrolledStudents = await Enrollment.exists({ section: req.params.id, status: 'enrolled' });
  if (hasEnrolledStudents) return res.status(409).json({ success: false, message: 'Withdraw enrolled students before deactivating this section' });
  const section = await Section.findOneAndUpdate({ _id: req.params.id, active: true }, { active: false }, { new: true });
  if (!section) return missing(res, 'Section');
  success(res, section, 'Section deactivated');
});

const enrollStudent = asyncHandler(async (req, res) => {
  const allowed = ['student', 'section'];
  const unknown = hasUnknown(req.body, allowed);
  if (unknown) return invalid(res, `Unknown field: ${unknown}`);
  const { student: studentId, section: sectionId } = req.body;
  if (!isId(studentId) || !isId(sectionId)) return invalid(res, 'Valid student and section identifiers are required');
  const [student, section, existing] = await Promise.all([
    User.findOne({ _id: studentId, role: 'student', active: true }),
    Section.findOne({ _id: sectionId, active: true }),
    Enrollment.findOne({ student: studentId, section: sectionId })
  ]);
  if (!student || !section) return invalid(res, 'Choose a valid active student and section');
  if (existing?.status === 'enrolled') return res.status(409).json({ success: false, message: 'Student is already enrolled in this section' });
  const count = await Enrollment.countDocuments({ section: sectionId, status: 'enrolled' });
  if (count >= section.capacity) return res.status(409).json({ success: false, message: 'Section has reached capacity' });
  const enrollment = existing
    ? await Enrollment.findByIdAndUpdate(existing.id, { status: 'enrolled', enrolledAt: new Date() }, { new: true })
    : await Enrollment.create({ student: student.id, section: section.id });
  success(res, await enrollment.populate([{ path: 'student', select: 'name email studentId' }, { path: 'section', populate: { path: 'course', select: 'code title' } }]), 'Student enrolled', existing ? 200 : 201);
});

const listEnrollments = asyncHandler(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const filter = { status: 'enrolled' };
  if (req.user.role === 'student') filter.student = req.user.id;
  else if (req.user.role === 'faculty') {
    if (!req.query.section || !isId(req.query.section)) return invalid(res, 'Faculty must provide a valid section identifier');
    if (!await Section.exists({ _id: req.query.section, faculty: req.user.id, active: true })) return res.status(403).json({ success: false, message: 'You can only view enrolments for your assigned sections' });
    filter.section = req.query.section;
  } else {
    if (req.query.section) {
      if (!isId(req.query.section)) return invalid(res, 'Invalid section identifier');
      filter.section = req.query.section;
    }
  }
  const [records, total] = await Promise.all([
    Enrollment.find(filter).populate('student', 'name email studentId').populate({ path: 'section', populate: { path: 'course', select: 'code title' } })
      .sort({ enrolledAt: -1 }).skip((page - 1) * limit).limit(limit), Enrollment.countDocuments(filter)
  ]);
  success(res, records, 'Enrolments retrieved', 200, { page, limit, total, pages: Math.ceil(total / limit) });
});

const withdrawEnrollment = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return invalid(res, 'Invalid enrolment identifier');
  const enrollment = await Enrollment.findOneAndUpdate({ _id: req.params.id, status: 'enrolled' }, { status: 'withdrawn' }, { new: true })
    .populate('student', 'name email studentId').populate('section', 'term sectionCode');
  if (!enrollment) return missing(res, 'Active enrolment');
  success(res, enrollment, 'Student withdrawn from section');
});

const enrollmentCounts = async () => Enrollment.aggregate([
  { $match: { status: 'enrolled' } },
  { $group: { _id: '$section', enrolledCount: { $sum: 1 } } },
  { $lookup: { from: 'sections', localField: '_id', foreignField: '_id', as: 'section' } },
  { $unwind: '$section' },
  { $project: { _id: 0, sectionId: '$section._id', sectionCode: '$section.sectionCode', term: '$section.term', capacity: '$section.capacity', enrolledCount: 1 } },
  { $sort: { term: -1, sectionCode: 1 } }
]);

const getEnrollmentCounts = asyncHandler(async (req, res) => {
  const report = await enrollmentCounts();
  success(res, report, 'Section enrolment report generated');
});

module.exports = {
  listUsers, getUser, createUser, updateUser, deactivateUser,
  listCourses, getCourse, createCourse, updateCourse, deactivateCourse,
  listSections, getSection, createSection, updateSection, deactivateSection,
  enrollStudent, listEnrollments, withdrawEnrollment, getEnrollmentCounts
};
