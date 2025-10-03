<?php
$CSV_FILE = __DIR__ . '/leads.csv';
$CSV_HEADERS = ['name', 'email', 'phone', 'instagram', 'captured_at'];

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET,POST,OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Expose-Headers: Content-Disposition');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    header('Content-Length: 0');
    exit;
}

function ensure_csv_file($path, $headers)
{
    if (!file_exists($path)) {
        $headerLine = implode(',', array_map('strtoupper', $headers));
        file_put_contents($path, $headerLine . "\n", LOCK_EX);
    }
}

function detect_delimiter($headerLine, $firstDataLine)
{
    $commaCount = substr_count($headerLine, ',') + substr_count($firstDataLine, ',');
    $semicolonCount = substr_count($headerLine, ';') + substr_count($firstDataLine, ';');

    if ($semicolonCount > $commaCount) {
        return ';';
    }

    if ($commaCount > 0) {
        return ',';
    }

    if ($semicolonCount > 0) {
        return ';';
    }

    return ',';
}

function normalize_header_name($value)
{
    $base = strtolower(trim((string) $value));
    $normalized = $base;

    if (function_exists('iconv')) {
        $transliterated = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $base);

        if ($transliterated !== false) {
            $normalized = $transliterated;
        }
    }

    $normalized = preg_replace('/[^a-z0-9]+/i', '_', $normalized);
    return trim($normalized, '_');
}

function resolve_header_key($value)
{
    $normalized = normalize_header_name($value);

    $map = [
        'name' => ['name', 'nome'],
        'email' => ['email'],
        'phone' => ['phone', 'telefone', 'telefone_whatsapp', 'telefone_whats'],
        'instagram' => ['instagram', 'instagram_', 'instagram_handle'],
        'captured_at' => ['captured_at', 'data_registro', 'data_de_registro', 'registrado_em', 'capturado_em'],
    ];

    foreach ($map as $key => $aliases) {
        if (in_array($normalized, $aliases, true)) {
            return $key;
        }
    }

    return null;
}

function read_leads_from_csv($path, $headers)
{
    if (!file_exists($path)) {
        return [];
    }

    $content = file_get_contents($path);

    if ($content === false) {
        throw new RuntimeException('Não foi possível ler o arquivo de leads.');
    }

    $content = trim($content);

    if ($content === '') {
        return [];
    }

    $lines = preg_split('/\r\n|\r|\n/', $content);

    if (count($lines) <= 1) {
        return [];
    }

    $rawHeader = array_shift($lines);
    $rawHeader = preg_replace('/^\xEF\xBB\xBF/', '', $rawHeader);
    $firstDataLine = $lines[0] ?? '';
    $delimiter = detect_delimiter($rawHeader, $firstDataLine);
    $headerColumns = str_getcsv($rawHeader, $delimiter);
    $headerMap = array_map('resolve_header_key', $headerColumns);
    $rows = [];

    foreach ($lines as $line) {
        if (!is_string($line) || trim($line) === '') {
            continue;
        }

        $values = str_getcsv($line, $delimiter);
        $entry = [];

        foreach ($headerMap as $index => $key) {
            if (!$key) {
                continue;
            }

            $entry[$key] = $values[$index] ?? '';
        }

        foreach ($headers as $header) {
            if (!array_key_exists($header, $entry)) {
                $entry[$header] = '';
            }
        }

        $rows[] = $entry;
    }

    return $rows;
}

function write_leads_to_csv($path, $headers, $leads)
{
    $lines = [];
    $lines[] = implode(',', array_map('strtoupper', $headers));

    foreach ($leads as $lead) {
        $row = [];

        foreach ($headers as $header) {
            $value = isset($lead[$header]) ? (string) $lead[$header] : '';
            $value = preg_replace("/(\r\n|\r|\n)/", ' ', $value);

            if (strpos($value, '"') !== false || strpos($value, ',') !== false) {
                $value = '"' . str_replace('"', '""', $value) . '"';
            }

            $row[] = $value;
        }

        $lines[] = implode(',', $row);
    }

    $payload = implode("\n", $lines) . "\n";

    if (file_put_contents($path, $payload, LOCK_EX) === false) {
        throw new RuntimeException('Não foi possível atualizar o arquivo de leads.');
    }
}

function get_phone_digits($value)
{
    return preg_replace('/\D+/', '', $value ?? '');
}

function normalize_instagram($value)
{
    $trimmed = trim($value ?? '');

    if ($trimmed === '') {
        return '';
    }

    $sanitized = preg_replace('/^@+/', '', $trimmed);
    return $sanitized !== '' ? '@' . $sanitized : '';
}

function normalize_input($input)
{
    $name = isset($input['name']) ? $input['name'] : (isset($input['nome']) ? $input['nome'] : '');
    $email = isset($input['email']) ? $input['email'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : (isset($input['telefone']) ? $input['telefone'] : '');
    $instagram = isset($input['instagram']) ? $input['instagram'] : '';

    $name = trim((string) $name);
    $email = strtolower(trim((string) $email));
    $phone = trim((string) $phone);
    $instagramHandle = normalize_instagram($instagram);

    $phoneDigits = get_phone_digits($phone);

    if ($email === '' && $phoneDigits === '') {
        throw new InvalidArgumentException('Informe pelo menos e-mail ou telefone.');
    }

    return [
        'name' => $name,
        'email' => $email,
        'phone' => $phone,
        'instagram' => $instagramHandle,
    ];
}

ensure_csv_file($CSV_FILE, $CSV_HEADERS);

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : '';
        $download = isset($_GET['download']) ? strtolower(trim($_GET['download'])) : '';

        if ($format === 'csv' || $download === '1' || $download === 'true') {
            header('Content-Type: text/csv; charset=UTF-8');
            header('Content-Disposition: attachment; filename="leads.csv"');
            header('Cache-Control: no-store');
            readfile($CSV_FILE);
            exit;
        }

        $leads = read_leads_from_csv($CSV_FILE, $CSV_HEADERS);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo json_encode(['leads' => $leads], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        header('Allow: GET, POST, OPTIONS');
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo json_encode(['success' => false, 'message' => 'Método não permitido.']);
        exit;
    }

    $rawBody = file_get_contents('php://input');
    $input = json_decode($rawBody, true);

    if (!is_array($input)) {
        throw new InvalidArgumentException('Dados inválidos.');
    }

    $lead = normalize_input($input);
    $leads = read_leads_from_csv($CSV_FILE, $CSV_HEADERS);
    $timestamp = gmdate('c');
    $phoneDigits = get_phone_digits($lead['phone']);
    $updated = false;

    foreach ($leads as &$existing) {
        $existingPhoneDigits = get_phone_digits($existing['phone']);

        if (
            ($lead['email'] !== '' && strtolower($existing['email']) === $lead['email']) ||
            ($phoneDigits !== '' && $existingPhoneDigits === $phoneDigits)
        ) {
            $existing['name'] = $lead['name'];
            $existing['email'] = $lead['email'];
            $existing['phone'] = $lead['phone'];
            $existing['instagram'] = $lead['instagram'];
            $existing['captured_at'] = $timestamp;
            $updated = true;
            break;
        }
    }

    unset($existing);

    if (!$updated) {
        $lead['captured_at'] = $timestamp;
        $leads[] = $lead;
    }

    write_leads_to_csv($CSV_FILE, $CSV_HEADERS, $leads);

    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
    http_response_code(201);
    echo json_encode(['success' => true]);
} catch (InvalidArgumentException $exception) {
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => $exception->getMessage()]);
} catch (Throwable $exception) {
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erro interno ao salvar o contato.']);
}
