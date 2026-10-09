/**
 * JWT Authentication Middleware
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'march-eoi-dev-secret-change-in-production-2026';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'يجب تسجيل الدخول للوصول إلى هذا المورد',
      code: 'UNAUTHORIZED',
    });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'انتهت صلاحية الجلسة أو الرمز غير صالح. يرجى تسجيل الدخول مجدداً',
      code: 'INVALID_TOKEN',
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء',
        code: 'FORBIDDEN',
      });
    }
    next();
  };
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { authenticate, requireRole, signToken, JWT_SECRET };
