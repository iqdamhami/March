/**
 * AuthAPI + مخزن محلي (يعمل بدون خادم)
 * يحاول الاتصال بـ localhost:4000 أولاً، وإن فشل يستخدم localStorage
 */
const API_BASE = window.MARCH_API_BASE || 'http://localhost:4000/api';
const LS_KEY = 'march_db_v1';
const ADMIN_EMAIL = 'admin@march.local';
const ADMIN_PASSWORD = 'Admin@MARCH2026';

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function defaultDb() {
  return {
    users: [
      {
        id: 'admin-default',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        full_name: 'مدير المنصة',
        phone: null,
        role: 'admin',
        approval_status: 'approved',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ],
    eoi: [],
    inquiries: [],
    eoi_seq: 0,
  };
}

const LocalDB = {
  read() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        const d = defaultDb();
        this.write(d);
        return d;
      }
      const d = JSON.parse(raw);
      if (!d.users) d.users = [];
      if (!d.eoi) d.eoi = [];
      if (!d.inquiries) d.inquiries = [];
      // ضمان وجود الأدمن
      if (!d.users.some((u) => u.email === ADMIN_EMAIL)) {
        d.users.push({
          id: 'admin-default',
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          full_name: 'مدير المنصة',
          role: 'admin',
          approval_status: 'approved',
          is_active: true,
          created_at: new Date().toISOString(),
        });
        this.write(d);
      }
      return d;
    } catch {
      const d = defaultDb();
      this.write(d);
      return d;
    }
  },
  write(d) {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  },
};

/** تنفيذ الطلب محلياً عند فشل الشبكة */
function localRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let body = {};
  if (options.body) {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = {};
    }
  }
  const token = localStorage.getItem('march_token');
  let session = null;
  try {
    session = token ? JSON.parse(atob(token.split('.')[1] || '')) : null;
  } catch {
    session = null;
  }

  const db = LocalDB.read();

  // ---- Auth register ----
  if (path === '/auth/register' && method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    if (db.users.some((u) => u.email === email)) {
      const err = new Error('هذا البريد الإلكتروني مسجّل مسبقاً');
      err.code = 'EMAIL_EXISTS';
      throw err;
    }
    if (!body.password || body.password.length < 8) {
      const err = new Error('كلمة المرور قصيرة');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const user = {
      id: uid(),
      email,
      password: body.password,
      full_name: body.full_name,
      phone: body.phone || null,
      role: 'researcher',
      approval_status: 'pending',
      is_active: false,
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    LocalDB.write(db);
    return {
      success: true,
      message: 'تم إرسال طلب إنشاء الحساب. بانتظار موافقة الإدارة (وضع محلي).',
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          approval_status: 'pending',
        },
        pending_approval: true,
        token: null,
      },
      _mode: 'local',
    };
  }

  // ---- Auth login ----
  if (path === '/auth/login' && method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    const user = db.users.find((u) => u.email === email && u.password === body.password);
    if (!user) {
      const err = new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }
    if (user.approval_status === 'pending') {
      const err = new Error('حسابك بانتظار موافقة الإدارة.');
      err.code = 'PENDING_APPROVAL';
      throw err;
    }
    if (user.approval_status === 'rejected') {
      const err = new Error('تم رفض طلب إنشاء هذا الحساب.');
      err.code = 'ACCOUNT_REJECTED';
      throw err;
    }
    if (!user.is_active && user.role !== 'admin') {
      const err = new Error('هذا الحساب معطّل.');
      err.code = 'ACCOUNT_DISABLED';
      throw err;
    }
    const payload = { id: user.id, email: user.email, role: user.role, exp: Date.now() + 7 * 86400000 };
    const fakeToken = 'local.' + btoa(JSON.stringify(payload)) + '.sig';
    return {
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      data: {
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
        token: fakeToken,
      },
      _mode: 'local',
    };
  }

  // ---- Me ----
  if (path === '/auth/me' && method === 'GET') {
    if (!session) {
      const err = new Error('يجب تسجيل الدخول');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    const user = db.users.find((u) => u.id === session.id);
    if (!user) {
      const err = new Error('غير موجود');
      err.code = 'NOT_FOUND';
      throw err;
    }
    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          approval_status: user.approval_status,
        },
      },
      _mode: 'local',
    };
  }

  // ---- EOI ----
  if (path === '/eoi' && method === 'POST') {
    if (!session) {
      const err = new Error('يجب تسجيل الدخول');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    if (!body.summary || body.summary.length < 200) {
      const err = new Error('الملخص يجب 200 حرف على الأقل');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    db.eoi_seq = (db.eoi_seq || 0) + 1;
    const ref = 'MARCH-EOI-' + new Date().getFullYear() + '-' + String(db.eoi_seq).padStart(4, '0');
    const row = {
      id: uid(),
      reference_number: ref,
      user_id: session.id,
      applicant_email: session.email,
      institution_name: body.institution_name,
      country: body.country,
      city: body.city,
      axis_code: body.axis_code,
      axis_title:
        body.axis_code === 'axis1'
          ? 'تكنولوجيا المعلومات ودمج بيانات الصحة والمناخ'
          : 'استدامة عمليات الرعاية الصحية بيئياً',
      project_title: body.project_title,
      summary: body.summary,
      estimated_budget: body.estimated_budget,
      climate_relevance: body.climate_relevance,
      status: body.submit ? 'submitted' : 'draft',
      submitted_at: body.submit ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
    };
    db.eoi.push(row);
    LocalDB.write(db);
    return {
      success: true,
      message: body.submit ? 'تم تقديم الطلب بنجاح' : 'تم حفظ المسودة',
      data: { id: row.id, reference_number: ref, status: row.status, created_at: row.created_at },
      _mode: 'local',
    };
  }

  if (path === '/eoi/my' && method === 'GET') {
    if (!session) {
      const err = new Error('يجب تسجيل الدخول');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    const apps = db.eoi.filter((e) => e.user_id === session.id);
    return { success: true, data: { applications: apps }, _mode: 'local' };
  }

  // ---- Contact ----
  if (path === '/contact' && method === 'POST') {
    const row = {
      id: uid(),
      name: body.name,
      email: String(body.email || '').toLowerCase(),
      institution: body.institution,
      subject: body.subject,
      message: body.message,
      status: 'new',
      admin_reply: null,
      replied_at: null,
      created_at: new Date().toISOString(),
    };
    db.inquiries.push(row);
    LocalDB.write(db);
    return { success: true, message: 'تم إرسال الاستفسار', data: { id: row.id }, _mode: 'local' };
  }

  if (path === '/contact/my' && method === 'GET') {
    if (!session) {
      const err = new Error('يجب تسجيل الدخول');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    const list = db.inquiries.filter((m) => m.email === session.email);
    return { success: true, data: { inquiries: list }, _mode: 'local' };
  }

  // ---- Admin ----
  function requireAdmin() {
    if (!session || session.role !== 'admin') {
      const err = new Error('صلاحيات المسؤول مطلوبة');
      err.code = 'FORBIDDEN';
      throw err;
    }
  }

  if (path.startsWith('/admin/users') && method === 'GET') {
    requireAdmin();
    let users = db.users.filter((u) => u.role !== 'admin').map(({ password, ...r }) => r);
    const q = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(q);
    const st = params.get('approval_status');
    if (st && st !== 'all') users = users.filter((u) => u.approval_status === st);
    return { success: true, data: { users }, _mode: 'local' };
  }

  const approvalMatch = path.match(/^\/admin\/users\/([^/]+)\/approval$/);
  if (approvalMatch && method === 'PATCH') {
    requireAdmin();
    const user = db.users.find((u) => u.id === approvalMatch[1] && u.role !== 'admin');
    if (!user) {
      const err = new Error('غير موجود');
      err.code = 'NOT_FOUND';
      throw err;
    }
    user.approval_status = body.status;
    user.is_active = body.status === 'approved';
    LocalDB.write(db);
    return {
      success: true,
      message: body.status === 'approved' ? 'تمت الموافقة' : 'تم الرفض',
      data: { user: { id: user.id, email: user.email, approval_status: user.approval_status } },
      _mode: 'local',
    };
  }

  if (path === '/admin/eoi' && method === 'GET') {
    requireAdmin();
    const apps = db.eoi.map((e) => {
      const u = db.users.find((x) => x.id === e.user_id);
      return {
        ...e,
        applicant_name: u?.full_name || e.applicant_name,
        applicant_email: u?.email || e.applicant_email,
      };
    });
    return { success: true, data: { applications: apps }, _mode: 'local' };
  }

  const eoiStatus = path.match(/^\/admin\/eoi\/([^/]+)\/status$/);
  if (eoiStatus && method === 'PATCH') {
    requireAdmin();
    const e = db.eoi.find((x) => x.id === eoiStatus[1]);
    if (!e) {
      const err = new Error('غير موجود');
      err.code = 'NOT_FOUND';
      throw err;
    }
    e.status = body.status;
    LocalDB.write(db);
    return {
      success: true,
      message: 'تم التحديث',
      data: { application: { id: e.id, status: e.status, reference_number: e.reference_number } },
      _mode: 'local',
    };
  }

  const eoiDel = path.match(/^\/admin\/eoi\/([^/]+)$/);
  if (eoiDel && method === 'DELETE') {
    requireAdmin();
    const idx = db.eoi.findIndex((x) => x.id === eoiDel[1]);
    if (idx < 0) {
      const err = new Error('غير موجود');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const removed = db.eoi.splice(idx, 1)[0];
    LocalDB.write(db);
    return { success: true, message: 'تم الحذف', data: removed, _mode: 'local' };
  }

  if (path === '/admin/inquiries' && method === 'GET') {
    requireAdmin();
    return { success: true, data: { inquiries: db.inquiries }, _mode: 'local' };
  }

  const replyMatch = path.match(/^\/admin\/inquiries\/([^/]+)\/reply$/);
  if (replyMatch && method === 'POST') {
    requireAdmin();
    const m = db.inquiries.find((x) => x.id === replyMatch[1]);
    if (!m) {
      const err = new Error('غير موجود');
      err.code = 'NOT_FOUND';
      throw err;
    }
    m.admin_reply = body.reply;
    m.replied_at = new Date().toISOString();
    m.status = 'replied';
    LocalDB.write(db);
    return { success: true, message: 'تم حفظ الرد', data: { inquiry: m }, _mode: 'local' };
  }


  // ---- Admin change own password ----
  if (path === '/admin/password' && method === 'POST') {
    requireAdmin();
    const current = String(body.current_password || '');
    const next = String(body.new_password || '');
    if (next.length < 8) {
      const err = new Error('كلمة المرور الجديدة يجب 8 أحرف على الأقل');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const admin = db.users.find((u) => u.id === session.id);
    if (!admin || admin.password !== current) {
      const err = new Error('كلمة المرور الحالية غير صحيحة');
      err.code = 'INVALID_PASSWORD';
      throw err;
    }
    admin.password = next;
    LocalDB.write(db);
    return { success: true, message: 'تم تغيير كلمة مرور المسؤول بنجاح', _mode: 'local' };
  }

  const setPassMatch = path.match(/^\/admin\/users\/([^/]+)\/password$/);
  if (setPassMatch && method === 'POST') {
    requireAdmin();
    const next = String(body.new_password || '');
    if (next.length < 8) {
      const err = new Error('كلمة المرور يجب 8 أحرف على الأقل');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const target = db.users.find((u) => u.id === setPassMatch[1]);
    if (!target) {
      const err = new Error('غير موجود');
      err.code = 'NOT_FOUND';
      throw err;
    }
    target.password = next;
    LocalDB.write(db);
    return { success: true, message: 'تم تحديث كلمة مرور المستخدم', _mode: 'local' };
  }

  // Weather demo
  if (path.startsWith('/weather/')) {
    return {
      success: true,
      data: {
        location: { key: 'amman', name_ar: 'عمّان' },
        weather: { temp: 24, humidity: 45, condition: 'صافي', wind: 12, feels: 23 },
        source: 'local-demo',
      },
      _mode: 'local',
    };
  }

  const err = new Error('مسار غير مدعوم في الوضع المحلي: ' + path);
  err.code = 'NOT_FOUND';
  throw err;
}

const AuthAPI = {
  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const token = localStorage.getItem('march_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // محاولة الخادم أولاً (مهلة قصيرة)
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 2500) : null;
      const res = await fetch(API_BASE + path, {
        ...options,
        headers,
        signal: controller ? controller.signal : undefined,
      });
      if (timer) clearTimeout(timer);

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('استجابة غير صالحة من الخادم');
      }
      if (!res.ok) {
        const err = new Error(data.error || 'حدث خطأ');
        err.code = data.code;
        err.details = data.details;
        err.response = data;
        throw err;
      }
      data._mode = 'server';
      return data;
    } catch (networkOrHttpErr) {
      // أخطاء التحقق من الخادم (400/401...) لا نعيد توجيهها للمحلي إن وصلت استجابة
      if (networkOrHttpErr.code && networkOrHttpErr.code !== 'NETWORK_ERROR') {
        throw networkOrHttpErr;
      }
      // فشل الشبكة / الخادم متوقف → الوضع المحلي
      try {
        return localRequest(path, options);
      } catch (localErr) {
        throw localErr;
      }
    }
  },

  async register(payload) {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
  },
  async login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  async me() {
    return this.request('/auth/me');
  },
  saveSession(token, user) {
    localStorage.setItem('march_token', token);
    localStorage.setItem('march_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('march_token');
    localStorage.removeItem('march_user');
  },
  getUser() {
    try {
      return JSON.parse(localStorage.getItem('march_user'));
    } catch {
      return null;
    }
  },
  isLoggedIn() {
    return !!localStorage.getItem('march_token');
  },
  logout() {
    this.clearSession();
    window.location.href = 'login.html';
  },
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  },
};

const WeatherAPI = {
  async getLocations() {
    return AuthAPI.request('/weather/locations');
  },
  async getCurrent(locationKey) {
    return AuthAPI.request('/weather/current/' + locationKey);
  },
  async getWidgetConfig() {
    return AuthAPI.request('/weather/widget-config');
  },
};

const EoiAPI = {
  async submit(payload) {
    return AuthAPI.request('/eoi', { method: 'POST', body: JSON.stringify(payload) });
  },
  async myApplications() {
    return AuthAPI.request('/eoi/my');
  },
  async getOne(id) {
    return AuthAPI.request('/eoi/' + id);
  },
};

const AdminAPI = {
  async users(approval_status) {
    const q = approval_status ? '?approval_status=' + encodeURIComponent(approval_status) : '';
    return AuthAPI.request('/admin/users' + q);
  },
  async setUserApproval(id, status) {
    return AuthAPI.request('/admin/users/' + id + '/approval', {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
  async listEoi() {
    return AuthAPI.request('/admin/eoi');
  },
  async setEoiStatus(id, status, reviewer_notes) {
    return AuthAPI.request('/admin/eoi/' + id + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status, reviewer_notes }),
    });
  },
  async deleteEoi(id) {
    return AuthAPI.request('/admin/eoi/' + id, { method: 'DELETE' });
  },
  async listInquiries() {
    return AuthAPI.request('/admin/inquiries');
  },

  async changeOwnPassword(current_password, new_password) {
    return AuthAPI.request('/admin/password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    });
  },
  async setUserPassword(id, new_password) {
    return AuthAPI.request('/admin/users/' + id + '/password', {
      method: 'POST',
      body: JSON.stringify({ new_password }),
    });
  },
  async replyInquiry(id, reply) {
    return AuthAPI.request('/admin/inquiries/' + id + '/reply', {
      method: 'POST',
      body: JSON.stringify({ reply }),
    });
  },
};

const ContactAPI = {
  async send(payload) {
    return AuthAPI.request('/contact', { method: 'POST', body: JSON.stringify(payload) });
  },
  async myInquiries() {
    return AuthAPI.request('/contact/my');
  },
};

// تهيئة مخزن الأدمن محلياً عند تحميل الصفحة
try {
  LocalDB.read();
} catch (e) {
  /* ignore */
}
