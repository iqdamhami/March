<?php
/**
 * انسخ هذا الملف إلى config.php وعدّل القيم حسب سيرفرك
 * cp api/config.example.php api/config.php
 */
return [
  'db' => [
    'host' => '127.0.0.1',
    'port' => 3306,
    'name' => 'march_eoi',
    'user' => 'march_user',
    'pass' => 'CHANGE_ME',
    'charset' => 'utf8mb4',
  ],
  'app' => [
    'name' => 'MARCH EOI',
    'base_url' => 'https://your-domain.com', // بدون / في النهاية
    'session_name' => 'MARCHSESSID',
    'debug' => false,
  ],
  'smtp' => [
    'enabled' => true,
    'host' => 'smtp.your-domain.com',
    'port' => 587,
    'encryption' => 'tls', // tls | ssl | none
    'username' => 'noreply@your-domain.com',
    'password' => 'CHANGE_ME',
    'from_email' => 'noreply@your-domain.com',
    'from_name' => 'MARCH Platform',
  ],
  'security' => [
    'admin_email' => 'admin@march.local',
    'admin_password' => 'Admin@MARCH2026', // غيّرها بعد أول دخول
    'setup_key' => 'CHANGE_SETUP_KEY',
  ],
];
