function success(res, data, message = 'Request completed', status = 200, meta) {
  return res.status(status).json({ success: true, message, data, ...(meta ? { meta } : {}) });
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { success, asyncHandler };
