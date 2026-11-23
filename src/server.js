require('dotenv').config();
const http = require('node:http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const app = require('./app');
const { loadEnv } = require('./config/env');
const { connectDatabase } = require('./config/database');
const User = require('./models/User');
const Enrollment = require('./models/Enrollment');
const appEvents = require('./events/appEvents');

async function start() {
  loadEnv();
  await connectDatabase();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN?.split(',') || true } });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      if (payload.type !== 'access') return next(new Error('Invalid access token'));
      const user = await User.findById(payload.sub);
      if (!user || !user.active) return next(new Error('Account unavailable'));
      socket.user = user;
      next();
    } catch { next(new Error('Invalid or expired access token')); }
  });
  io.on('connection', async (socket) => {
    socket.join(`user:${socket.user.id}`);
    if (socket.user.role === 'student') {
      const sections = await Enrollment.find({ student: socket.user.id, status: 'enrolled' }).distinct('section');
      sections.forEach((id) => socket.join(`section:${id}`));
    } else if (socket.user.role === 'faculty') {
      const Section = require('./models/Section');
      const sections = await Section.find({ faculty: socket.user.id }).distinct('_id');
      sections.forEach((id) => socket.join(`section:${id}`));
    }
  });
  appEvents.on('announcement:created', (announcement) => {
    if (announcement.scope === 'campus') io.emit('announcement:new', announcement);
    else io.to(`section:${announcement.section.id}`).emit('announcement:new', announcement);
  });
  appEvents.on('announcement:updated', (announcement) => {
    if (announcement.scope === 'campus') io.emit('announcement:updated', announcement);
    else io.to(`section:${announcement.section.id}`).emit('announcement:updated', announcement);
  });
  appEvents.on('announcement:archived', (announcement) => {
    const payload = { id: announcement.id };
    if (announcement.scope === 'campus') io.emit('announcement:archived', payload);
    else io.to(`section:${announcement.section}`).emit('announcement:archived', payload);
  });
  appEvents.on('attendance:marked', (event) => io.to(`section:${event.section}`).emit('attendance:updated', { sessionDate: event.sessionDate, count: event.count }));
  const port = Number(process.env.PORT) || 4000;
  server.listen(port, () => console.log(`✓ Campus API listening at http://localhost:${port}`));
  const shutdown = async () => { server.close(); await require('mongoose').disconnect(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => { console.error('✗ Startup failed:', err.message); process.exit(1); });
