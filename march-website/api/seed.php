<?php
/**
 * تهيئة حساب المسؤول مرة واحدة
 * من المتصفح: /api/seed.php?key=SETUP_KEY
 * أو: php api/seed.php
 * احذف هذا الملف بعد الاستخدام في الإنتاج
 */
require __DIR__ . '/bootstrap.php';

$key = $_GET['key'] ?? ($argv[1] ?? '');
$expected = $CONFIG['security']['setup_key'] ?? '';
if (PHP_SAPI !== 'cli' && ($expected === '' || $expected === 'CHANGE_SETUP_KEY' || !hash_equals($expected, $key))) {
  respond(403, ['success' => false, 'error' => 'مفتاح الإعداد غير صالح', 'code' => 'FORBIDDEN']);
}

$email = $CONFIG['security']['admin_email'] ?? 'admin@march.local';
$pass = $CONFIG['security']['admin_password'] ?? 'Admin@MARCH2026';
$name = 'مدير المنصة';

$st = db()->prepare('SELECT id FROM users WHERE email = ?');
$st->execute([$email]);
$hash = password_hash($pass, PASSWORD_DEFAULT);

if ($row = $st->fetch()) {
  db()->prepare(
    'UPDATE users SET password_hash=?, full_name=?, role=?, approval_status=?, is_active=1 WHERE id=?'
  )->execute([$hash, $name, 'admin', 'approved', $row['id']]);
  $msg = 'تم تحديث حساب المسؤول';
} else {
  db()->prepare(
    'INSERT INTO users (id, email, password_hash, full_name, role, approval_status, is_active)
     VALUES (?,?,?,?,?,?,1)'
  )->execute([uuid(), $email, $hash, $name, 'admin', 'approved']);
  $msg = 'تم إنشاء حساب المسؤول';
}

respond(200, [
  'success' => true,
  'message' => $msg,
  'data' => ['email' => $email, 'password' => $pass],
]);
