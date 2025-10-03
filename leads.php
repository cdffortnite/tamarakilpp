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

$nome = $input["nome"];
$telefone = $input["telefone"];
$email = $input["email"];
$instagram = isset($input["instagram"]) ? $input["instagram"] : "";

$arquivo = __DIR__ . "/leads.csv";

if (!file_exists($arquivo)) {
    $cabecalho = ["Nome", "Telefone", "Email", "Instagram", "Data Registro"];
    $fp = fopen($arquivo, "w");
    fputcsv($fp, $cabecalho, ";");
    fclose($fp);
}

$fp = fopen($arquivo, "a");
fputcsv($fp, [$nome, $telefone, $email, $instagram, date("Y-m-d H:i:s")], ";");
fclose($fp);

http_response_code(201);
echo json_encode(["success" => true, "message" => "Lead registrado com sucesso"]);
