<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

$csvFile = __DIR__ . '/leads.csv';
$csvHeaders = ['NAME', 'EMAIL', 'PHONE', 'INSTAGRAM', 'CAPTURED_AT'];

$requestMethod = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$acceptHeader = $_SERVER['HTTP_ACCEPT'] ?? '';

$sendJson = static function (int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
};

$ensureCsvFile = static function () use ($csvFile, $csvHeaders): void {
    if (file_exists($csvFile)) {
        return;
    }

    $handle = fopen($csvFile, 'wb');

    if ($handle === false) {
        throw new RuntimeException('Não foi possível preparar o arquivo de contatos.');
    }

    fputcsv($handle, $csvHeaders);
    fclose($handle);
};

$normalizeHeaderName = static function (string $value): string {
    $normalized = strtolower(trim($value));

    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $normalized);
        if ($converted !== false) {
            $normalized = $converted;
        }
    }

    $normalized = preg_replace('/[^a-z0-9]+/i', '_', $normalized);
    return trim($normalized, '_');
};

$resolveHeaderKey = static function (string $value) use ($normalizeHeaderName): ?string {
    $normalized = $normalizeHeaderName($value);

    if (in_array($normalized, ['name', 'nome'], true)) {
        return 'name';
    }

    if ($normalized === 'email') {
        return 'email';
    }

    if (in_array($normalized, ['phone', 'telefone', 'telefone_whatsapp', 'telefone_whats'], true)) {
        return 'phone';
    }

    if (in_array($normalized, ['instagram', 'instagram_', 'instagram_handle'], true)) {
        return 'instagram';
    }

    if (
        in_array(
            $normalized,
            ['captured_at', 'data_registro', 'data_de_registro', 'registrado_em', 'capturado_em'],
            true
        )
    ) {
        return 'captured_at';
    }

    return null;
};

$detectDelimiter = static function (string $headerLine, array $rows): string {
    $firstRow = $rows[0] ?? '';
    $commaCount = substr_count($headerLine, ',') + substr_count($firstRow, ',');
    $semicolonCount = substr_count($headerLine, ';') + substr_count($firstRow, ';');

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
};

$parseCsv = static function () use (
    $csvFile,
    $ensureCsvFile,
    $detectDelimiter,
    $resolveHeaderKey
) {
    $ensureCsvFile();

    if (!is_readable($csvFile)) {
        throw new RuntimeException('Não foi possível abrir o arquivo de contatos.');
    }

    $content = file_get_contents($csvFile);

    if ($content === false) {
        throw new RuntimeException('Não foi possível ler o arquivo de contatos.');
    }

    $lines = preg_split('/\r\n|\n|\r/', $content) ?: [];
    $lines = array_values(array_filter($lines, static fn ($line) => trim((string) $line) !== ''));

    if (count($lines) <= 1) {
        return [];
    }

    $header = array_shift($lines);
    $delimiter = $detectDelimiter($header, $lines);
    $headerColumns = str_getcsv($header, $delimiter, '"', '\\');
    $headerMap = array_map($resolveHeaderKey, $headerColumns);

    $entries = [];

    foreach ($lines as $line) {
        $values = str_getcsv($line, $delimiter, '"', '\\');
        $entry = ['name' => '', 'email' => '', 'phone' => '', 'instagram' => '', 'captured_at' => ''];

        foreach ($headerMap as $index => $key) {
            if ($key === null) {
                continue;
            }

            $entry[$key] = $values[$index] ?? '';
        }

        $entries[] = $entry;
    }

    return $entries;
};

$sendCsv = static function () use ($csvFile, $ensureCsvFile): void {
    $ensureCsvFile();

    if (!is_readable($csvFile)) {
        throw new RuntimeException('Não foi possível abrir o arquivo de contatos.');
    }

    $size = filesize($csvFile);

    if ($size === false) {
        throw new RuntimeException('Não foi possível preparar o download do CSV.');
    }

    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="leads.csv"');
    header('Content-Length: ' . $size);
    header('Cache-Control: no-store');

    $handle = fopen($csvFile, 'rb');

    if ($handle === false) {
        throw new RuntimeException('Não foi possível enviar o arquivo CSV.');
    }

    fpassthru($handle);
    fclose($handle);
};

if ($requestMethod === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$wantsCsv = false;

if (preg_match('/\.csv(\?.*)?$/i', $requestUri)) {
    $wantsCsv = true;
}

if (isset($_GET['format']) && strtolower((string) $_GET['format']) === 'csv') {
    $wantsCsv = true;
}

if (isset($_GET['download'])) {
    $wantsCsv = true;
}

if (!$wantsCsv && strpos($acceptHeader, 'text/csv') !== false && $requestMethod === 'GET') {
    $wantsCsv = true;
}

try {
    if ($requestMethod === 'GET') {
        if ($wantsCsv) {
            $sendCsv();
            exit;
        }

        $entries = $parseCsv();
        $sendJson(200, ['leads' => $entries]);
        exit;
    }

    if ($requestMethod !== 'POST') {
        $sendJson(405, ['success' => false, 'message' => 'Método não permitido.']);
        exit;
    }

    $ensureCsvFile();

    $rawBody = file_get_contents('php://input') ?: '';

    $input = json_decode($rawBody, true);

    if (!is_array($input)) {
        $sendJson(400, ['success' => false, 'message' => 'Corpo da requisição inválido.']);
        exit;
    }

    $nome = isset($input['nome']) ? trim((string) $input['nome']) : '';
    $telefone = isset($input['telefone']) ? trim((string) $input['telefone']) : '';
    $email = isset($input['email']) ? trim((string) $input['email']) : '';
    $instagram = isset($input['instagram']) ? trim((string) $input['instagram']) : '';

    if ($nome === '' || $telefone === '' || $email === '') {
        $sendJson(400, ['success' => false, 'message' => 'Dados inválidos.']);
        exit;
    }

    $handle = fopen($csvFile, 'ab');

    if ($handle === false) {
        throw new RuntimeException('Não foi possível registrar o contato.');
    }

    fputcsv($handle, [$nome, $email, $telefone, $instagram, date('c')]);
    fclose($handle);

    $sendJson(201, ['success' => true, 'message' => 'Lead registrado com sucesso']);
} catch (Throwable $error) {
    if ($wantsCsv) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Erro ao gerar o arquivo CSV.';
        exit;
    }

    $sendJson(500, [
        'success' => false,
        'message' => $error->getMessage() ?: 'Erro interno ao processar a requisição.',
    ]);
}
