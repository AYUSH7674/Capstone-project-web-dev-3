function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  if (err.name === 'ValidationError') { status = 400; message = Object.values(err.errors).map((item) => item.message).join(', '); }
  if (err.name === 'CastError') { status = 400; message = 'Invalid resource identifier'; }
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Request body contains invalid JSON'; }
  if (err.code === 11000) { status = 409; message = `A record with this ${Object.keys(err.keyValue || {})[0] || 'value'} already exists`; }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') { status = 401; message = 'Invalid or expired token'; }
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, message, ...(process.env.NODE_ENV === 'development' && status >= 500 ? { detail: err.message } : {}) });
}

module.exports = { notFound, errorHandler };
