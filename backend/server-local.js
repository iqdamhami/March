/**
 * MARCH EOI API — خادم محلي بدون مكتبات خارجية
 * التشغيل: node server-local.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'march-local-dev-secret-2026';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@march.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@MARCH2026';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير المنصة';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'march-data.json');

function uuid() { return crypto.randomUUID(); }
function defaultData() {
  return {
    users: [], institutions: [], eoi_applications: [], contact_inquiries: [],
    research_axes: [
      { id: 1, code: 'axis1', title_ar: 'تطبيق وتقييم تكنولوجيا المعلومات لدمج بيانات الصحة والمناخ' },
      { id: 2, code: 'axis2', title_ar: 'الممارسات والأساليب لجعل عمليات الرعاية الصحية أكثر استدامة بيئياً' },
    ],
    meta: { eoi_seq: 0 },
  };
}
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData(), null, 2));
}
function read() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { const d = defaultData(); write(d); return d; }
}
function write(data) { ensureData(); fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return s + ':' + hash;
}
function verifyPassword(password, stored) {
  const parts = String(stored).split(':');
  if (parts.length < 2) return false;
  const s = parts[0], hash = parts.slice(1).join(':');
  const h = crypto.scryptSync(password, s, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(h, 'hex')); }
  catch { return false; }
}
function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(Object.assign({}, payload, { exp: Date.now() + 7 * 86400000 }))).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}
function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
  if (parts[2] !== expected) throw new Error('bad sig');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (payload.exp && Date.now() > payload.exp) throw new Error('expired');
  return payload;
}
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(body);
}
function readBody(req) {
  return new Promise(function (resolve, reject) {
    var data = '';
    req.on('data', function (c) { data += c; if (data.length > 1e6) { reject(new Error('large')); req.destroy(); } });
    req.on('end', function () {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
  });
}
function getAuth(req) {
  var h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return verifyToken(h.slice(7)); } catch (e) { return null; }
}
function ensureAdmin() {
  var data = read();
  var existing = data.users.find(function (u) { return u.email === ADMIN_EMAIL; });
  var password_hash = hashPassword(ADMIN_PASSWORD);
  if (existing) {
    existing.password_hash = password_hash;
    existing.role = 'admin';
    existing.approval_status = 'approved';
    existing.is_active = true;
    existing.full_name = ADMIN_NAME;
  } else {
    data.users.push({
      id: uuid(), email: ADMIN_EMAIL, password_hash: password_hash, full_name: ADMIN_NAME,
      phone: null, role: 'admin', approval_status: 'approved', is_active: true,
      created_at: new Date().toISOString(), last_login_at: null,
    });
  }
  write(data);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    return res.end();
  }
  var url = new URL(req.url, 'http://localhost:' + PORT);
  var p = url.pathname;
  var method = req.method;
  try {
    if (method === 'GET' && p === '/api/health') {
      return send(res, 200, { success: true, service: 'MARCH EOI API (local)', mode: 'json-file', time: new Date().toISOString() });
    }
    if (method === 'POST' && p === '/api/auth/register') {
      var body = await readBody(req);
      var email = String(body.email || '').toLowerCase().trim();
      var password = String(body.password || '');
      var full_name = String(body.full_name || '').trim();
      if (!email.includes('@') || password.length < 8 || full_name.length < 3) {
        return send(res, 400, { success: false, error: 'مدخلات غير صالحة', code: 'VALIDATION_ERROR' });
      }
      var data = read();
      if (data.users.some(function (u) { return u.email === email; })) {
        return send(res, 409, { success: false, error: 'هذا البريد الإلكتروني مسجّل مسبقاً', code: 'EMAIL_EXISTS' });
      }
      var user = {
        id: uuid(), email: email, password_hash: hashPassword(password), full_name: full_name,
        phone: body.phone || null, role: 'researcher', approval_status: 'pending', is_active: false,
        created_at: new Date().toISOString(), last_login_at: null,
      };
      data.users.push(user); write(data);
      return send(res, 201, {
        success: true,
        message: 'تم إرسال طلب إنشاء الحساب. بانتظار موافقة الإدارة قبل تسجيل الدخول.',
        data: { user: { id: user.id, email: email, full_name: full_name, role: 'researcher', approval_status: 'pending' }, pending_approval: true, token: null },
      });
    }
    if (method === 'POST' && p === '/api/auth/login') {
      var body = await readBody(req);
      var email = String(body.email || '').toLowerCase().trim();
      var password = String(body.password || '');
      var data = read();
      var user = data.users.find(function (u) { return u.email === email; });
      if (!user || !verifyPassword(password, user.password_hash)) {
        return send(res, 401, { success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', code: 'INVALID_CREDENTIALS' });
      }
      if (user.approval_status === 'pending') return send(res, 403, { success: false, error: 'حسابك بانتظار موافقة الإدارة.', code: 'PENDING_APPROVAL' });
      if (user.approval_status === 'rejected') return send(res, 403, { success: false, error: 'تم رفض طلب إنشاء هذا الحساب.', code: 'ACCOUNT_REJECTED' });
      if (!user.is_active) return send(res, 403, { success: false, error: 'هذا الحساب معطّل.', code: 'ACCOUNT_DISABLED' });
      user.last_login_at = new Date().toISOString(); write(data);
      var token = signToken({ id: user.id, email: user.email, role: user.role });
      return send(res, 200, {
        success: true, message: 'تم تسجيل الدخول بنجاح',
        data: { user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }, token: token },
      });
    }
    if (method === 'GET' && p === '/api/auth/me') {
      var auth = getAuth(req);
      if (!auth) return send(res, 401, { success: false, error: 'يجب تسجيل الدخول', code: 'UNAUTHORIZED' });
      var data = read();
      var user = data.users.find(function (u) { return u.id === auth.id; });
      if (!user) return send(res, 404, { success: false, error: 'غير موجود', code: 'NOT_FOUND' });
      return send(res, 200, { success: true, data: { user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, approval_status: user.approval_status } } });
    }
    if (method === 'POST' && p === '/api/eoi') {
      var auth = getAuth(req);
      if (!auth) return send(res, 401, { success: false, error: 'يجب تسجيل الدخول', code: 'UNAUTHORIZED' });
      var body = await readBody(req);
      if (!body.project_title || body.project_title.length < 10) return send(res, 400, { success: false, error: 'عنوان المشروع قصير', code: 'VALIDATION_ERROR' });
      if (!body.summary || body.summary.length < 200) return send(res, 400, { success: false, error: 'الملخص يجب 200 حرف على الأقل', code: 'VALIDATION_ERROR' });
      if (body.axis_code !== 'axis1' && body.axis_code !== 'axis2') return send(res, 400, { success: false, error: 'محور غير صالح', code: 'VALIDATION_ERROR' });
      var data = read();
      var inst = data.institutions.find(function (i) { return i.name_ar === body.institution_name && i.country === body.country; });
      if (!inst) { inst = { id: uuid(), name_ar: body.institution_name, country: body.country, city: body.city || null }; data.institutions.push(inst); }
      var axis = data.research_axes.find(function (a) { return a.code === body.axis_code; });
      data.meta.eoi_seq = (data.meta.eoi_seq || 0) + 1;
      var ref = 'MARCH-EOI-' + new Date().getFullYear() + '-' + String(data.meta.eoi_seq).padStart(4, '0');
      var row = {
        id: uuid(), reference_number: ref, user_id: auth.id, institution_id: inst.id, axis_id: axis.id, axis_code: body.axis_code,
        project_title: body.project_title, summary: body.summary, estimated_budget: body.estimated_budget || null,
        climate_relevance: body.climate_relevance || null, status: body.submit ? 'submitted' : 'draft',
        submitted_at: body.submit ? new Date().toISOString() : null, created_at: new Date().toISOString(),
      };
      data.eoi_applications.push(row); write(data);
      return send(res, 201, { success: true, message: body.submit ? 'تم تقديم الطلب بنجاح' : 'تم حفظ المسودة', data: { id: row.id, reference_number: ref, status: row.status, created_at: row.created_at } });
    }
    if (method === 'GET' && p === '/api/eoi/my') {
      var auth = getAuth(req);
      if (!auth) return send(res, 401, { success: false, error: 'يجب تسجيل الدخول', code: 'UNAUTHORIZED' });
      var data = read();
      var apps = data.eoi_applications.filter(function (e) { return e.user_id === auth.id; }).map(function (e) {
        var inst = data.institutions.find(function (i) { return i.id === e.institution_id; });
        var axis = data.research_axes.find(function (a) { return a.id === e.axis_id; });
        return { id: e.id, reference_number: e.reference_number, project_title: e.project_title, status: e.status, estimated_budget: e.estimated_budget, submitted_at: e.submitted_at, created_at: e.created_at, axis_code: axis && axis.code, axis_title: axis && axis.title_ar, institution_name: inst && inst.name_ar };
      });
      return send(res, 200, { success: true, data: { applications: apps } });
    }
    if (method === 'POST' && p === '/api/contact') {
      var body = await readBody(req);
      if (!body.name || !body.email || !body.subject || !body.message) return send(res, 400, { success: false, error: 'حقول ناقصة', code: 'VALIDATION_ERROR' });
      var data = read();
      var u = data.users.find(function (x) { return x.email === String(body.email).toLowerCase(); });
      var row = { id: uuid(), name: body.name, email: String(body.email).toLowerCase(), institution: body.institution || null, subject: body.subject, message: body.message, user_id: u && u.id || null, status: 'new', admin_reply: null, replied_at: null, created_at: new Date().toISOString() };
      data.contact_inquiries.push(row); write(data);
      return send(res, 201, { success: true, message: 'تم إرسال الاستفسار', data: { id: row.id } });
    }
    if (method === 'GET' && p === '/api/contact/my') {
      var auth = getAuth(req);
      if (!auth) return send(res, 401, { success: false, error: 'يجب تسجيل الدخول', code: 'UNAUTHORIZED' });
      var data = read();
      var list = data.contact_inquiries.filter(function (m) { return m.email === auth.email || m.user_id === auth.id; });
      return send(res, 200, { success: true, data: { inquiries: list } });
    }
    if (method === 'GET' && p === '/api/admin/users') {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      var data = read();
      var users = data.users.filter(function (u) { return u.role !== 'admin'; }).map(function (u) {
        return { id: u.id, email: u.email, full_name: u.full_name, phone: u.phone, role: u.role, approval_status: u.approval_status, is_active: u.is_active, created_at: u.created_at, last_login_at: u.last_login_at };
      });
      var st = url.searchParams.get('approval_status');
      if (st && st !== 'all') users = users.filter(function (u) { return u.approval_status === st; });
      return send(res, 200, { success: true, data: { users: users } });
    }
    var userApproval = p.match(/^\/api\/admin\/users\/([^/]+)\/approval$/);
    if (method === 'PATCH' && userApproval) {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      var body = await readBody(req);
      if (body.status !== 'approved' && body.status !== 'rejected') return send(res, 400, { success: false, error: 'حالة غير صالحة', code: 'VALIDATION_ERROR' });
      var data = read();
      var user = data.users.find(function (u) { return u.id === userApproval[1] && u.role !== 'admin'; });
      if (!user) return send(res, 404, { success: false, error: 'غير موجود', code: 'NOT_FOUND' });
      user.approval_status = body.status; user.is_active = body.status === 'approved'; write(data);
      return send(res, 200, { success: true, message: body.status === 'approved' ? 'تمت الموافقة' : 'تم الرفض', data: { user: { id: user.id, email: user.email, approval_status: user.approval_status } } });
    }
    if (method === 'GET' && p === '/api/admin/eoi') {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      var data = read();
      var apps = data.eoi_applications.map(function (e) {
        var u = data.users.find(function (x) { return x.id === e.user_id; });
        var inst = data.institutions.find(function (i) { return i.id === e.institution_id; });
        var axis = data.research_axes.find(function (a) { return a.id === e.axis_id; });
        return Object.assign({}, e, { applicant_name: u && u.full_name, applicant_email: u && u.email, institution_name: inst && inst.name_ar, country: inst && inst.country, axis_title: axis && axis.title_ar });
      });
      return send(res, 200, { success: true, data: { applications: apps } });
    }
    var eoiStatus = p.match(/^\/api\/admin\/eoi\/([^/]+)\/status$/);
    if (method === 'PATCH' && eoiStatus) {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      var body = await readBody(req);
      var data = read();
      var e = data.eoi_applications.find(function (x) { return x.id === eoiStatus[1]; });
      if (!e) return send(res, 404, { success: false, error: 'غير موجود', code: 'NOT_FOUND' });
      e.status = body.status; if (body.reviewer_notes != null) e.reviewer_notes = body.reviewer_notes; write(data);
      return send(res, 200, { success: true, message: 'تم التحديث', data: { application: { id: e.id, status: e.status, reference_number: e.reference_number } } });
    }
    var eoiDel = p.match(/^\/api\/admin\/eoi\/([^/]+)$/);
    if (method === 'DELETE' && eoiDel) {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      var data = read();
      var idx = data.eoi_applications.findIndex(function (x) { return x.id === eoiDel[1]; });
      if (idx < 0) return send(res, 404, { success: false, error: 'غير موجود', code: 'NOT_FOUND' });
      var removed = data.eoi_applications.splice(idx, 1)[0]; write(data);
      return send(res, 200, { success: true, message: 'تم الحذف', data: removed });
    }
    if (method === 'GET' && p === '/api/admin/inquiries') {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      return send(res, 200, { success: true, data: { inquiries: read().contact_inquiries } });
    }
    var replyMatch = p.match(/^\/api\/admin\/inquiries\/([^/]+)\/reply$/);
    if (method === 'POST' && replyMatch) {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      var body = await readBody(req);
      if (!body.reply || String(body.reply).length < 2) return send(res, 400, { success: false, error: 'الرد مطلوب', code: 'VALIDATION_ERROR' });
      var data = read();
      var m = data.contact_inquiries.find(function (x) { return x.id === replyMatch[1]; });
      if (!m) return send(res, 404, { success: false, error: 'غير موجود', code: 'NOT_FOUND' });
      m.admin_reply = body.reply; m.replied_at = new Date().toISOString(); m.status = 'replied'; write(data);
      return send(res, 200, { success: true, message: 'تم حفظ الرد', data: { inquiry: m } });
    }
    if (method === 'GET' && p.indexOf('/api/weather/') === 0) {
      return send(res, 200, { success: true, data: { location: { key: 'amman', name_ar: 'عمّان' }, weather: { temp: 24, humidity: 45, condition: 'صافي', wind: 12, feels: 23 }, source: 'demo' } });
    }
    // Admin: change own password
    if (method === 'POST' && p === '/api/admin/password') {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      var body = await readBody(req);
      var current = String(body.current_password || '');
      var next = String(body.new_password || '');
      if (next.length < 8) return send(res, 400, { success: false, error: 'كلمة المرور الجديدة يجب 8 أحرف على الأقل', code: 'VALIDATION_ERROR' });
      var data = read();
      var user = data.users.find(function (u) { return u.id === auth.id; });
      if (!user || !verifyPassword(current, user.password_hash)) {
        return send(res, 400, { success: false, error: 'كلمة المرور الحالية غير صحيحة', code: 'INVALID_PASSWORD' });
      }
      user.password_hash = hashPassword(next);
      write(data);
      return send(res, 200, { success: true, message: 'تم تغيير كلمة مرور المسؤول بنجاح' });
    }

    // Admin: set password for any user
    var setPass = p.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
    if (method === 'POST' && setPass) {
      var auth = getAuth(req);
      if (!auth || auth.role !== 'admin') return send(res, 403, { success: false, error: 'ممنوع', code: 'FORBIDDEN' });
      var body = await readBody(req);
      var next = String(body.new_password || '');
      if (next.length < 8) return send(res, 400, { success: false, error: 'كلمة المرور يجب 8 أحرف على الأقل', code: 'VALIDATION_ERROR' });
      var data = read();
      var user = data.users.find(function (u) { return u.id === setPass[1]; });
      if (!user) return send(res, 404, { success: false, error: 'غير موجود', code: 'NOT_FOUND' });
      user.password_hash = hashPassword(next);
      write(data);
      return send(res, 200, { success: true, message: 'تم تحديث كلمة مرور المستخدم' });
    }

    return send(res, 404, { success: false, error: 'المسار غير موجود', code: 'NOT_FOUND' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { success: false, error: 'خطأ داخلي', code: 'SERVER_ERROR' });
  }
}

ensureAdmin();
http.createServer(handler).listen(PORT, function () {
  console.log('');
  console.log('========================================');
  console.log('  MARCH EOI API — جاهز');
  console.log('  http://localhost:' + PORT);
  console.log('  فحص: http://localhost:' + PORT + '/api/health');
  console.log('  Admin: ' + ADMIN_EMAIL);
  console.log('  Pass:  ' + ADMIN_PASSWORD);
  console.log('========================================');
  console.log('');
});
