const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { accessToken, refreshToken } = require('../utils/tokens');
const { success, asyncHandler } = require('../utils/api');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
  const user = await User.findOne({ email: email.toLowerCase(), active: true }).select('+password +refreshTokens');
  if (!user || !(await user.comparePassword(password))) return res.status(401).json({ success: false, message: 'Email or password is incorrect' });
  const refresh = refreshToken(user);
  user.refreshTokens.push(digest(refresh));
  await user.save();
  success(res, { user, accessToken: accessToken(user), refreshToken: refresh }, 'Signed in');
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken;
  if (!token) return res.status(401).json({ success: false, message: 'Refresh token required' });
  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  if (payload.type !== 'refresh') return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  const user = await User.findById(payload.sub).select('+refreshTokens');
  const tokenHash = digest(token);
  if (!user || !user.active || !user.refreshTokens.includes(tokenHash)) return res.status(401).json({ success: false, message: 'Refresh token is no longer valid' });
  user.refreshTokens = user.refreshTokens.filter((item) => item !== tokenHash);
  const nextRefresh = refreshToken(user);
  user.refreshTokens.push(digest(nextRefresh));
  await user.save();
  success(res, { accessToken: accessToken(user), refreshToken: nextRefresh }, 'Session refreshed');
});

const logout = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken;
  if (token) await User.findByIdAndUpdate(req.user.id, { $pull: { refreshTokens: digest(token) } });
  success(res, null, 'Signed out');
});

const me = asyncHandler(async (req, res) => success(res, { user: req.user }));

const updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'department'];
  const unknown = Object.keys(req.body).find((key) => !allowed.includes(key));
  if (unknown) return res.status(400).json({ success: false, message: `Unknown or restricted field: ${unknown}` });
  if (!Object.keys(req.body).length) return res.status(400).json({ success: false, message: 'Provide at least one field to update' });
  const user = await User.findByIdAndUpdate(req.user.id, req.body, { new: true, runValidators: true });
  success(res, { user }, 'Profile updated');
});
module.exports = { login, refresh, logout, me, updateMe };
