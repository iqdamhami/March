<?php
/**
 * MARCH EOI API – bootstrap (PDO + session + mail helpers)
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
  http_response_code(500);
  echo json_encode([
    'success' => false,
    'error' => 'أنشئ api/config.php من config.example.php',
    'code' => 'NO_CONFIG',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$CONFIG = require $configPath;

// CORS – نفس النطاق عادة؛ يُسمح بأصل إضافي إن لزم
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$base = rtrim($CONFIG['app']['base_url'] ?? '', '/');
if ($origin && ($origin === $base || ($CONFIG['app']['debug'] ?? false))) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Access-Control-Allow-Credentials: true');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

session_name($CONFIG['app']['session_name'] ?? 'MARCHSESSID');
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
  'httponly' => true,
  'samesite' => 'Lax',
]);
session_start();

function db(): PDO {
  static $pdo = null;
  global $CONFIG;
  if ($pdo instanceof PDO) return $pdo;
  $c = $CONFIG['db'];
  $dsn = sprintf(
    'mysql:host=%s;port=%d;dbname=%s;charset=%s',
    $c['host'],
    (int)($c['port'] ?? 3306),
    $c['name'],
    $c['charset'] ?? 'utf8mb4'
  );
  $pdo = new PDO($dsn, $c['user'], $c['pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $pdo;
}

function json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function respond(int $code, array $payload): void {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

function uuid(): string {
  $d = random_bytes(16);
  $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
  $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

function current_user(): ?array {
  return $_SESSION['user'] ?? null;
}

function require_login(): array {
  $u = current_user();
  if (!$u) respond(401, ['success' => false, 'error' => 'يجب تسجيل الدخول', 'code' => 'UNAUTHORIZED']);
  return $u;
}

function require_admin(): array {
  $u = require_login();
  if (($u['role'] ?? '') !== 'admin') {
    respond(403, ['success' => false, 'error' => 'صلاحيات المسؤول مطلوبة', 'code' => 'FORBIDDEN']);
  }
  return $u;
}

function send_mail(string $to, string $subject, string $bodyHtml): bool {
  global $CONFIG;
  $smtp = $CONFIG['smtp'] ?? [];
  $from = $smtp['from_email'] ?? 'noreply@localhost';
  $fromName = $smtp['from_name'] ?? 'MARCH';
  $headers = [
    'MIME-Version: 1.0',
    'Content-type: text/html; charset=utf-8',
    'From: ' . sprintf('%s <%s>', $fromName, $from),
  ];
  if (empty($smtp['enabled'])) {
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $bodyHtml, implode("\r\n", $headers));
  }
  // محاولة SMTP بسيطة عبر mail() إن لم تتوفر مكتبة؛ يمكن لاحقاً PHPMailer
  // كثير من الاستضافات تمرّر عبر sendmail المرتبط بـ SMTP
  return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $bodyHtml, implode("\r\n", $headers));
}
