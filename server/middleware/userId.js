/**
 * 用户标识中间件
 * 从请求头 X-User-Id 中提取用户ID，挂载到 req.userId
 * 如果没有提供，返回 400 错误
 */
function userIdMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'];

  if (!userId || userId.trim().length === 0) {
    return res.status(400).json({ error: '缺少用户标识 (X-User-Id)' });
  }

  req.userId = userId.trim();
  next();
}

module.exports = userIdMiddleware;
