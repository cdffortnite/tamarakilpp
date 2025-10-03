<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

$input = json_decode(file_get_contents("php://input"), true);

if (!$input || !isset($input["nome"]) || !isset($input["telefone"]) || !isset($input["email"])) {
    http_response_code(400);
    echo json_encode(["error" => "Dados inválidos"]);
    exit;
}

$nome = trim($input["nome"]);
$telefone = trim($input["telefone"]);
$email = trim($input["email"]);
$instagram = isset($input["instagram"]) ? trim($input["instagram"]) : "";

$arquivo = __DIR__ . "/leads.csv";

if (!file_exists($arquivo)) {
    $cabecalho = ["NAME", "EMAIL", "PHONE", "INSTAGRAM", "CAPTURED_AT"];
    $fp = fopen($arquivo, "w");
    fputcsv($fp, $cabecalho);
    fclose($fp);
}

$fp = fopen($arquivo, "a");
fputcsv($fp, [$nome, $email, $telefone, $instagram, date("c")]);
fclose($fp);

http_response_code(201);
echo json_encode(["success" => true, "message" => "Lead registrado com sucesso"]);
