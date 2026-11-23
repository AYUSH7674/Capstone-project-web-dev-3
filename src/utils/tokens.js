const jwt = require('jsonwebtoken');

const accessToken = (user) => jwt.sign(
  { sub: user.id, role: user.role, type: 'access' },
  process.env.JWT_ACCESS_SECRET,
  { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
);

const refreshToken = (user) => jwt.sign(
  { sub: user.id, type: 'refresh' },
  process.env.JWT_REFRESH_SECRET,
  { expiresIn: process.env.REFRESH_TOKEN_TTL || '7d' }
);

module.exports = { accessToken, refreshToken };
