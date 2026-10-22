import type { APIRoute } from 'astro';
import site from '../data/site.json';

// Приёмник форм на хостинге (Beget, Россия): письмо уходит владельцу прямо с сервера сайта,
// без сторонних сервисов, поэтому данные покупателей не покидают Россию (152-ФЗ).
// Собирается вместе с сайтом, адрес получателя берётся из настроек и в браузер не попадает.
// Код совместим с PHP 5.6: на хостинге может стоять старая версия.
export const GET: APIRoute = ({ site: siteUrl }) => {
  const host = new URL(siteUrl ?? 'https://kama-filtr.ru').host;
  const php = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const body = String.raw`<?php
// Сгенерировано src/pages/send.php.ts. Править настройки сайта, а не этот файл.
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

$TO = ${php(site.email)};
$HOST = ${php(host)};
$SHOP = ${php(site.name)};

function answer($code, $ok, $error) {
  http_response_code($code);
  echo json_encode($ok ? array('ok' => true) : array('ok' => false, 'error' => $error));
  exit;
}
function clean($s, $max) {
  return mb_substr(trim(str_replace("\r", '', (string)$s)), 0, $max, 'UTF-8');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') answer(405, false, 'method');

// принимаем только со своего сайта
$from = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : (isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '');
$fromHost = parse_url($from, PHP_URL_HOST);
if ($fromHost !== $HOST && $fromHost !== 'www.' . $HOST) answer(403, false, 'origin');

// не больше 5 писем за 10 минут с одного адреса
$dir = sys_get_temp_dir() . '/kf-send';
if (!is_dir($dir)) @mkdir($dir, 0700);
$file = $dir . '/' . md5(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
$now = time();
$hits = array();
if (is_file($file)) {
  foreach (explode(',', (string)@file_get_contents($file)) as $t) {
    if ((int)$t > $now - 600) $hits[] = (int)$t;
  }
}
if (count($hits) >= 5) answer(429, false, 'rate');
$hits[] = $now;
@file_put_contents($file, implode(',', $hits));

$data = json_decode((string)file_get_contents('php://input', false, null, 0, 65536), true);
if (!is_array($data) || !isset($data['fields']) || !is_array($data['fields'])) answer(400, false, 'bad');
// ловушка для ботов: скрытое поле заполняют только они, отвечаем «успешно» и ничего не шлём
if (!empty($data['website'])) answer(200, true, '');

$subject = preg_replace('/\s+/u', ' ', clean(isset($data['subject']) ? $data['subject'] : 'Заявка с сайта', 150));
$lines = array();
$n = 0;
foreach ($data['fields'] as $key => $value) {
  if (++$n > 40) break;
  $value = clean($value, 5000);
  if ($value === '') continue;
  $key = preg_replace('/\s+/u', ' ', clean($key, 100));
  $lines[] = strpos($value, "\n") !== false ? $key . ":\n" . $value : $key . ': ' . $value;
}
if (!$lines) answer(400, false, 'empty');

$headers = array(
  'From: =?UTF-8?B?' . base64_encode('Сайт ' . $SHOP) . '?= <noreply@' . $HOST . '>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: 8bit',
);
$reply = isset($data['replyTo']) ? filter_var($data['replyTo'], FILTER_VALIDATE_EMAIL) : false;
if ($reply) $headers[] = 'Reply-To: ' . $reply;

$sent = mail($TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', implode("\n\n", $lines) . "\n", implode("\r\n", $headers), '-f noreply@' . $HOST);
if (!$sent) answer(500, false, 'mail');
answer(200, true, '');
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
