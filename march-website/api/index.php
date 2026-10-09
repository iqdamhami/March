<?php
/**
 * MARCH EOI API – نقطة الدخول
 * أمثلة:
 *   /api/index.php?r=health
 *   /api/index.php?r=auth/login
 * مع rewrite: /api/health
 */
require __DIR__ . '/bootstrap.php';

$r = $_GET['r'] ?? '';
if ($r === '' && !empty($_SERVER['PATH_INFO'])) {
  $r = ltrim($_SERVER['PATH_INFO'], '/');
}
// دعم /api/index.php/auth/login
if ($r === '' && isset($_SERVER['REQUEST_URI'])) {
  if (preg_match('#/api/(?:index\.php/)?(.+)$#', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '', $m)) {
    $r = $m[1];
  }
}
$r = trim($r, '/');
$method = $_SERVER['REQUEST_METHOD'];

try {
  // -------- health --------
  if ($r === 'health' && $method === 'GET') {
    db()->query('SELECT 1');
    respond(200, [
      'success' => true,
      'service' => 'MARCH EOI API (PHP/MySQL)',
      'time' => date('c'),
    ]);
  }

  // -------- auth/register --------
  if ($r === 'auth/register' && $method === 'POST') {
    $b = json_body();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    $full_name = trim((string)($b['full_name'] ?? ''));
    $phone = trim((string)($b['phone'] ?? '')) ?: null;
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8 || mb_strlen($full_name) < 3) {
      respond(400, ['success' => false, 'error' => 'مدخلات غير صالحة', 'code' => 'VALIDATION_ERROR']);
    }
    $st = db()->prepare('SELECT id FROM users WHERE email = ?');
    $st->execute([$email]);
    if ($st->fetch()) {
      respond(409, ['success' => false, 'error' => 'هذا البريد الإلكتروني مسجّل مسبقاً', 'code' => 'EMAIL_EXISTS']);
    }
    $id = uuid();
    $hash = password_hash($password, PASSWORD_DEFAULT);
    db()->prepare(
      'INSERT INTO users (id, email, password_hash, full_name, phone, role, approval_status, is_active)
       VALUES (?,?,?,?,?,?,?,0)'
    )->execute([$id, $email, $hash, $full_name, $phone, 'researcher', 'pending']);

    $adminEmail = $CONFIG['security']['admin_email'] ?? null;
    if ($adminEmail) {
      send_mail(
        $adminEmail,
        'طلب تسجيل جديد – MARCH',
        '<p>طلب تسجيل جديد من: <strong>' . htmlspecialchars($full_name) . '</strong> (' . htmlspecialchars($email) . ')</p>'
      );
    }
    respond(201, [
      'success' => true,
      'message' => 'تم إرسال طلب إنشاء الحساب. بانتظار موافقة الإدارة.',
      'data' => [
        'user' => [
          'id' => $id,
          'email' => $email,
          'full_name' => $full_name,
          'role' => 'researcher',
          'approval_status' => 'pending',
        ],
        'pending_approval' => true,
        'token' => null,
      ],
    ]);
  }

  // -------- auth/login --------
  if ($r === 'auth/login' && $method === 'POST') {
    $b = json_body();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    $st = db()->prepare('SELECT * FROM users WHERE email = ?');
    $st->execute([$email]);
    $user = $st->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
      respond(401, ['success' => false, 'error' => 'البريد الإلكتروني أو كلمة المرور غير صحيحة', 'code' => 'INVALID_CREDENTIALS']);
    }
    if ($user['approval_status'] === 'pending') {
      respond(403, ['success' => false, 'error' => 'حسابك بانتظار موافقة الإدارة.', 'code' => 'PENDING_APPROVAL']);
    }
    if ($user['approval_status'] === 'rejected') {
      respond(403, ['success' => false, 'error' => 'تم رفض طلب إنشاء هذا الحساب.', 'code' => 'ACCOUNT_REJECTED']);
    }
    if (!(int)$user['is_active'] && $user['role'] !== 'admin') {
      respond(403, ['success' => false, 'error' => 'هذا الحساب معطّل.', 'code' => 'ACCOUNT_DISABLED']);
    }
    db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$user['id']]);
    $sessionUser = [
      'id' => $user['id'],
      'email' => $user['email'],
      'full_name' => $user['full_name'],
      'role' => $user['role'],
    ];
    $_SESSION['user'] = $sessionUser;
    // توكن شكلي للتوافق مع الواجهة (الجلسة هي الأساس)
    $token = 'sess.' . base64_encode(json_encode($sessionUser + ['exp' => time() + 604800]));
    respond(200, [
      'success' => true,
      'message' => 'تم تسجيل الدخول بنجاح',
      'data' => ['user' => $sessionUser, 'token' => $token],
    ]);
  }

  // -------- auth/me --------
  if ($r === 'auth/me' && $method === 'GET') {
    $u = require_login();
    $st = db()->prepare('SELECT id, email, full_name, role, approval_status, created_at FROM users WHERE id = ?');
    $st->execute([$u['id']]);
    $row = $st->fetch();
    if (!$row) respond(404, ['success' => false, 'error' => 'غير موجود', 'code' => 'NOT_FOUND']);
    respond(200, ['success' => true, 'data' => ['user' => $row]]);
  }

  // -------- auth/logout --------
  if ($r === 'auth/logout' && $method === 'POST') {
    $_SESSION = [];
    session_destroy();
    respond(200, ['success' => true, 'message' => 'تم تسجيل الخروج']);
  }

  // -------- eoi --------
  if ($r === 'eoi' && $method === 'POST') {
    $u = require_login();
    $b = json_body();
    $title = trim((string)($b['project_title'] ?? ''));
    $summary = trim((string)($b['summary'] ?? ''));
    $axis = (string)($b['axis_code'] ?? '');
    $inst = trim((string)($b['institution_name'] ?? ''));
    $country = trim((string)($b['country'] ?? ''));
    if (mb_strlen($title) < 10 || mb_strlen($summary) < 200 || !in_array($axis, ['axis1', 'axis2'], true) || $inst === '' || $country === '') {
      respond(400, ['success' => false, 'error' => 'تحقق من حقول الطلب', 'code' => 'VALIDATION_ERROR']);
    }
    $pdo = db();
    $pdo->beginTransaction();
    $pdo->prepare("UPDATE meta SET meta_value = meta_value + 1 WHERE meta_key = 'eoi_seq'")->execute();
    $seq = (int)$pdo->query("SELECT meta_value FROM meta WHERE meta_key = 'eoi_seq'")->fetchColumn();
    $ref = sprintf('MARCH-EOI-%s-%04d', date('Y'), $seq);
    $id = uuid();
    $submit = !empty($b['submit']);
    $pdo->prepare(
      'INSERT INTO eoi_applications
       (id, reference_number, user_id, institution_name, country, city, axis_code, project_title, summary, estimated_budget, climate_relevance, status, submitted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
      $id, $ref, $u['id'], $inst, $country, $b['city'] ?? null, $axis, $title, $summary,
      $b['estimated_budget'] ?? null, $b['climate_relevance'] ?? null,
      $submit ? 'submitted' : 'draft',
      $submit ? date('Y-m-d H:i:s') : null,
    ]);
    $pdo->commit();
    respond(201, [
      'success' => true,
      'message' => $submit ? 'تم تقديم الطلب بنجاح' : 'تم حفظ المسودة',
      'data' => ['id' => $id, 'reference_number' => $ref, 'status' => $submit ? 'submitted' : 'draft', 'created_at' => date('c')],
    ]);
  }

  if ($r === 'eoi/my' && $method === 'GET') {
    $u = require_login();
    $st = db()->prepare('SELECT * FROM eoi_applications WHERE user_id = ? ORDER BY created_at DESC');
    $st->execute([$u['id']]);
    $apps = $st->fetchAll();
    foreach ($apps as &$a) {
      $a['axis_title'] = $a['axis_code'] === 'axis1'
        ? 'تكنولوجيا المعلومات ودمج بيانات الصحة والمناخ'
        : 'استدامة عمليات الرعاية الصحية بيئياً';
    }
    respond(200, ['success' => true, 'data' => ['applications' => $apps]]);
  }

  // -------- contact --------
  if ($r === 'contact' && $method === 'POST') {
    $b = json_body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $subject = trim((string)($b['subject'] ?? ''));
    $message = trim((string)($b['message'] ?? ''));
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $subject === '' || mb_strlen($message) < 5) {
      respond(400, ['success' => false, 'error' => 'حقول ناقصة', 'code' => 'VALIDATION_ERROR']);
    }
    $id = uuid();
    $uid = null;
    $st = db()->prepare('SELECT id FROM users WHERE email = ?');
    $st->execute([$email]);
    if ($row = $st->fetch()) $uid = $row['id'];
    db()->prepare(
      'INSERT INTO contact_inquiries (id, name, email, institution, subject, message, user_id, status)
       VALUES (?,?,?,?,?,?,?,?)'
    )->execute([$id, $name, $email, $b['institution'] ?? null, $subject, $message, $uid, 'new']);

    $adminEmail = $CONFIG['security']['admin_email'] ?? null;
    if ($adminEmail) {
      send_mail($adminEmail, 'استفسار جديد – MARCH: ' . $subject,
        '<p>من: ' . htmlspecialchars($name) . ' &lt;' . htmlspecialchars($email) . '&gt;</p><p>' . nl2br(htmlspecialchars($message)) . '</p>');
    }
    respond(201, [
      'success' => true,
      'message' => 'تم إرسال استفسارك. ستظهر ردود الإدارة في حسابك عند استخدام نفس البريد.',
      'data' => ['id' => $id],
    ]);
  }

  if ($r === 'contact/my' && $method === 'GET') {
    $u = require_login();
    $st = db()->prepare('SELECT * FROM contact_inquiries WHERE email = ? OR user_id = ? ORDER BY created_at DESC');
    $st->execute([$u['email'], $u['id']]);
    respond(200, ['success' => true, 'data' => ['inquiries' => $st->fetchAll()]]);
  }

  // -------- admin/users --------
  if ($r === 'admin/users' && $method === 'GET') {
    require_admin();
    $status = $_GET['approval_status'] ?? 'all';
    if ($status && $status !== 'all') {
      $st = db()->prepare('SELECT id, email, full_name, phone, role, approval_status, is_active, created_at, last_login_at FROM users WHERE role != ? AND approval_status = ? ORDER BY created_at DESC');
      $st->execute(['admin', $status]);
    } else {
      $st = db()->prepare('SELECT id, email, full_name, phone, role, approval_status, is_active, created_at, last_login_at FROM users WHERE role != ? ORDER BY created_at DESC');
      $st->execute(['admin']);
    }
    respond(200, ['success' => true, 'data' => ['users' => $st->fetchAll()]]);
  }

  if (preg_match('#^admin/users/([^/]+)/approval$#', $r, $m) && $method === 'PATCH') {
    require_admin();
    $b = json_body();
    $status = $b['status'] ?? '';
    if (!in_array($status, ['approved', 'rejected'], true)) {
      respond(400, ['success' => false, 'error' => 'حالة غير صالحة', 'code' => 'VALIDATION_ERROR']);
    }
    $active = $status === 'approved' ? 1 : 0;
    $st = db()->prepare('UPDATE users SET approval_status = ?, is_active = ? WHERE id = ? AND role != ?');
    $st->execute([$status, $active, $m[1], 'admin']);
    if (!$st->rowCount()) respond(404, ['success' => false, 'error' => 'غير موجود', 'code' => 'NOT_FOUND']);
    $u = db()->prepare('SELECT email, full_name FROM users WHERE id = ?');
    $u->execute([$m[1]]);
    $row = $u->fetch();
    if ($row && $status === 'approved') {
      send_mail($row['email'], 'تمت الموافقة على حسابك – MARCH',
        '<p>مرحباً ' . htmlspecialchars($row['full_name']) . '،</p><p>تمت الموافقة على حسابك في منصة MARCH. يمكنك تسجيل الدخول الآن.</p>');
    } elseif ($row && $status === 'rejected') {
      send_mail($row['email'], 'بخصوص طلب التسجيل – MARCH',
        '<p>مرحباً ' . htmlspecialchars($row['full_name']) . '،</p><p>نأسف لإبلاغك بأنه لم تتم الموافقة على طلب التسجيل حالياً.</p>');
    }
    respond(200, [
      'success' => true,
      'message' => $status === 'approved' ? 'تمت الموافقة على الحساب' : 'تم رفض الحساب',
      'data' => ['user' => ['id' => $m[1], 'approval_status' => $status]],
    ]);
  }

  if (preg_match('#^admin/users/([^/]+)/password$#', $r, $m) && $method === 'POST') {
    require_admin();
    $b = json_body();
    $next = (string)($b['new_password'] ?? '');
    if (strlen($next) < 8) respond(400, ['success' => false, 'error' => 'كلمة المرور يجب 8 أحرف على الأقل', 'code' => 'VALIDATION_ERROR']);
    $hash = password_hash($next, PASSWORD_DEFAULT);
    $st = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $st->execute([$hash, $m[1]]);
    if (!$st->rowCount()) respond(404, ['success' => false, 'error' => 'غير موجود', 'code' => 'NOT_FOUND']);
    respond(200, ['success' => true, 'message' => 'تم تحديث كلمة مرور المستخدم']);
  }

  // -------- admin password (own) --------
  if ($r === 'admin/password' && $method === 'POST') {
    $admin = require_admin();
    $b = json_body();
    $cur = (string)($b['current_password'] ?? '');
    $next = (string)($b['new_password'] ?? '');
    if (strlen($next) < 8) respond(400, ['success' => false, 'error' => 'كلمة المرور الجديدة يجب 8 أحرف على الأقل', 'code' => 'VALIDATION_ERROR']);
    $st = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $st->execute([$admin['id']]);
    $row = $st->fetch();
    if (!$row || !password_verify($cur, $row['password_hash'])) {
      respond(400, ['success' => false, 'error' => 'كلمة المرور الحالية غير صحيحة', 'code' => 'INVALID_PASSWORD']);
    }
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($next, PASSWORD_DEFAULT), $admin['id']]);
    respond(200, ['success' => true, 'message' => 'تم تغيير كلمة مرور المسؤول بنجاح']);
  }

  // -------- admin/eoi --------
  if ($r === 'admin/eoi' && $method === 'GET') {
    require_admin();
    $sql = 'SELECT e.*, u.full_name AS applicant_name, u.email AS applicant_email
            FROM eoi_applications e JOIN users u ON e.user_id = u.id
            ORDER BY e.created_at DESC';
    $apps = db()->query($sql)->fetchAll();
    foreach ($apps as &$a) {
      $a['axis_title'] = $a['axis_code'] === 'axis1'
        ? 'تكنولوجيا المعلومات ودمج بيانات الصحة والمناخ'
        : 'استدامة عمليات الرعاية الصحية بيئياً';
    }
    respond(200, ['success' => true, 'data' => ['applications' => $apps]]);
  }

  if (preg_match('#^admin/eoi/([^/]+)/status$#', $r, $m) && $method === 'PATCH') {
    require_admin();
    $b = json_body();
    $status = $b['status'] ?? '';
    $allowed = ['under_review', 'shortlisted', 'rejected', 'invited_full', 'submitted'];
    if (!in_array($status, $allowed, true)) {
      respond(400, ['success' => false, 'error' => 'حالة غير صالحة', 'code' => 'VALIDATION_ERROR']);
    }
    $st = db()->prepare('UPDATE eoi_applications SET status = ?, reviewer_notes = COALESCE(?, reviewer_notes) WHERE id = ?');
    $st->execute([$status, $b['reviewer_notes'] ?? null, $m[1]]);
    if (!$st->rowCount()) respond(404, ['success' => false, 'error' => 'غير موجود', 'code' => 'NOT_FOUND']);
    respond(200, ['success' => true, 'message' => 'تم تحديث حالة الطلب', 'data' => ['application' => ['id' => $m[1], 'status' => $status]]]);
  }

  if (preg_match('#^admin/eoi/([^/]+)$#', $r, $m) && $method === 'DELETE') {
    require_admin();
    $st = db()->prepare('DELETE FROM eoi_applications WHERE id = ?');
    $st->execute([$m[1]]);
    if (!$st->rowCount()) respond(404, ['success' => false, 'error' => 'غير موجود', 'code' => 'NOT_FOUND']);
    respond(200, ['success' => true, 'message' => 'تم حذف الطلب']);
  }

  // -------- admin/inquiries --------
  if ($r === 'admin/inquiries' && $method === 'GET') {
    require_admin();
    $rows = db()->query('SELECT * FROM contact_inquiries ORDER BY created_at DESC')->fetchAll();
    respond(200, ['success' => true, 'data' => ['inquiries' => $rows]]);
  }

  if (preg_match('#^admin/inquiries/([^/]+)/reply$#', $r, $m) && $method === 'POST') {
    require_admin();
    $b = json_body();
    $reply = trim((string)($b['reply'] ?? ''));
    if (mb_strlen($reply) < 2) respond(400, ['success' => false, 'error' => 'الرد مطلوب', 'code' => 'VALIDATION_ERROR']);
    $st = db()->prepare('SELECT * FROM contact_inquiries WHERE id = ?');
    $st->execute([$m[1]]);
    $inq = $st->fetch();
    if (!$inq) respond(404, ['success' => false, 'error' => 'غير موجود', 'code' => 'NOT_FOUND']);
    db()->prepare('UPDATE contact_inquiries SET admin_reply = ?, replied_at = NOW(), status = ? WHERE id = ?')
      ->execute([$reply, 'replied', $m[1]]);
    send_mail(
      $inq['email'],
      'رد على استفسارك – MARCH: ' . $inq['subject'],
      '<p>مرحباً ' . htmlspecialchars($inq['name']) . '،</p><p>رد الإدارة:</p><p>' . nl2br(htmlspecialchars($reply)) . '</p>'
    );
    $inq['admin_reply'] = $reply;
    $inq['status'] = 'replied';
    respond(200, [
      'success' => true,
      'message' => 'تم حفظ الرد وإرسال إشعار بالبريد إن أمكن',
      'data' => ['inquiry' => $inq],
    ]);
  }

  // weather stub
  if (str_starts_with($r, 'weather/')) {
    respond(200, [
      'success' => true,
      'data' => [
        'location' => ['key' => 'amman', 'name_ar' => 'عمّان'],
        'weather' => ['temp' => 24, 'humidity' => 45, 'condition' => 'صافي'],
        'source' => 'demo',
      ],
    ]);
  }

  respond(404, ['success' => false, 'error' => 'المسار غير موجود', 'code' => 'NOT_FOUND']);
} catch (Throwable $e) {
  $debug = !empty($CONFIG['app']['debug']);
  respond(500, [
    'success' => false,
    'error' => $debug ? $e->getMessage() : 'خطأ داخلي في الخادم',
    'code' => 'SERVER_ERROR',
  ]);
}
