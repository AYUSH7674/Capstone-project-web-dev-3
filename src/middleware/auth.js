const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { asyncHandler } = require('../utils/api');

const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  if (payload.type !== 'access') return res.status(401).json({ success: false, message: 'Invalid access token' });
  const user = await User.findById(payload.sub);
  if (!user || !user.active) return res.status(401).json({ success: false, message: 'Account unavailable' });
  req.user = user;
  next();
});

const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
  next();
};

module.exports = { authenticate, allowRoles };
