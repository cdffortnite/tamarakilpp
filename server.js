const http = require('http');
const { promises: fs, constants: fsConstants } = require('fs');
const path = require('path');
const { URL } = require('url');

const HOST = '0.0.0.0';
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT_DIR = __dirname;
const CSV_FILE = path.join(ROOT_DIR, 'leads.csv');
const CSV_HEADERS = ['name', 'email', 'phone', 'instagram', 'captured_at'];

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.jfif': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
};

const ensureCsvFile = async () => {
    try {
        await fs.access(CSV_FILE, fsConstants.F_OK);
    } catch (error) {
        const headerLine = CSV_HEADERS.map((header) => header.toUpperCase()).join(',');
        await fs.writeFile(CSV_FILE, `${headerLine}\n`, 'utf8');
    }
};

const readRequestBody = (req) =>
    new Promise((resolve, reject) => {
        const chunks = [];

        req.on('data', (chunk) => {
            chunks.push(chunk);
        });

        req.on('end', () => {
            try {
                const data = Buffer.concat(chunks).toString('utf8');
                resolve(data);
            } catch (error) {
                reject(error);
            }
        });

        req.on('error', reject);
    });

const parseJsonBody = async (req) => {
    const rawBody = await readRequestBody(req);

    if (!rawBody) {
        return {};
    }

    try {
        return JSON.parse(rawBody);
    } catch (error) {
        const parsingError = new Error('Invalid JSON body.');
        parsingError.statusCode = 400;
        throw parsingError;
    }
};

const escapeCsvValue = (value = '') => {
    if (value === null || value === undefined) {
        return '';
    }

    const normalized = String(value).replace(/\r?\n|\r/g, ' ').trim();

    if (/[",]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }

    return normalized;
};

const parseCsvLine = (line = '') => {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === '"') {
            const nextChar = line[index + 1];

            if (insideQuotes && nextChar === '"') {
                current += '"';
                index += 1;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result.map((value) => value.trim());
};

const readLeadsFromCsv = async () => {
    try {
        const content = await fs.readFile(CSV_FILE, 'utf8');
        const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

        if (lines.length <= 1) {
            return [];
        }

        const [, ...rows] = lines;

        return rows.map((line) => {
            const values = parseCsvLine(line);
            const entry = {};

            CSV_HEADERS.forEach((key, index) => {
                entry[key] = values[index] ?? '';
            });

            return entry;
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }

        throw error;
    }
};

const writeLeadsToCsv = async (leads) => {
    const headerLine = CSV_HEADERS.map((header) => header.toUpperCase()).join(',');
    const rows = leads.map((lead) =>
        CSV_HEADERS.map((header) => escapeCsvValue(lead[header] ?? '')).join(',')
    );
    const content = [headerLine, ...rows].join('\n');
    await fs.writeFile(CSV_FILE, `${content}\n`, 'utf8');
};

const getPhoneDigits = (value = '') => value.replace(/\D/g, '');

const normalizeInstagramHandle = (value = '') => {
    const trimmed = value.trim();

    if (!trimmed) {
        return '';
    }

    const sanitized = trimmed.replace(/^@+/, '');
    return sanitized ? `@${sanitized}` : '';
};

const normalizeLead = ({ name = '', email = '', phone = '', instagram = '' } = {}) => {
    const trimmedName = name.toString().trim();
    const trimmedEmail = email.toString().trim().toLowerCase();
    const trimmedPhone = phone.toString().trim();
    const instagramHandle = normalizeInstagramHandle(instagram.toString());
    const phoneDigits = getPhoneDigits(trimmedPhone);

    if (!trimmedEmail && !phoneDigits) {
        const error = new Error('Informe pelo menos e-mail ou telefone.');
        error.statusCode = 400;
        throw error;
    }

    return {
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        instagram: instagramHandle,
    };
};

const upsertLead = async (payload) => {
    const normalizedLead = normalizeLead(payload);
    const leads = await readLeadsFromCsv();
    const phoneDigits = getPhoneDigits(normalizedLead.phone);
    const existingIndex = leads.findIndex((entry) => {
        const entryPhoneDigits = getPhoneDigits(entry.phone);
        return (
            (normalizedLead.email && entry.email && entry.email.toLowerCase() === normalizedLead.email) ||
            (phoneDigits && entryPhoneDigits && entryPhoneDigits === phoneDigits)
        );
    });
    const timestamp = new Date().toISOString();

    if (existingIndex >= 0) {
        leads[existingIndex] = {
            ...leads[existingIndex],
            ...normalizedLead,
            captured_at: timestamp,
        };
    } else {
        leads.push({ ...normalizedLead, captured_at: timestamp });
    }

    await writeLeadsToCsv(leads);
    return normalizedLead;
};

const buildCorsHeaders = (req, additionalHeaders = {}) => {
    const originHeader = req.headers.origin;
    const allowOrigin = originHeader && originHeader !== 'null' ? originHeader : '*';
    const requestedHeaders = req.headers['access-control-request-headers'];

    return {
        Vary: 'Origin',
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': requestedHeaders || 'Accept, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Expose-Headers': 'Content-Disposition',
        ...additionalHeaders,
    };
};

const sendOptions = (req, res) => {
    const headers = buildCorsHeaders(req, {
        'Content-Length': '0',
        'Cache-Control': 'no-store',
    });

    res.writeHead(204, headers);
    res.end();
};

const sendJson = (req, res, statusCode, data) => {
    const payload = JSON.stringify(data);
    res.writeHead(statusCode, buildCorsHeaders(req, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-store',
    }));
    res.end(payload);
};

const sendText = (req, res, statusCode, message) => {
    const payload = message;
    res.writeHead(statusCode, buildCorsHeaders(req, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-store',
    }));
    res.end(payload);
};

const serveStaticFile = async (res, filePath) => {
    try {
        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': content.length,
        });
        res.end(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Arquivo não encontrado.');
            return;
        }

        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Erro interno ao carregar o arquivo.');
    }
};

const handleApiRequest = async (req, res, url) => {
    if (!url.pathname.startsWith('/api/')) {
        return false;
    }

    if (req.method === 'OPTIONS') {
        sendOptions(req, res);
        return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/leads') {
        try {
            const body = await parseJsonBody(req);
            await upsertLead(body);
            sendJson(req, res, 201, { success: true });
        } catch (error) {
            console.error('Erro ao registrar lead:', error);
            const status = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
            sendJson(req, res, status, { success: false, message: error.message || 'Erro interno ao salvar o contato.' });
        }

        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/leads') {
        try {
            const leads = await readLeadsFromCsv();
            sendJson(req, res, 200, { leads });
        } catch (error) {
            console.error('Erro ao ler leads:', error);
            sendJson(req, res, 500, { success: false, message: 'Erro ao carregar os contatos.' });
        }

        return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/leads.csv') {
        try {
            await ensureCsvFile();
            const content = await fs.readFile(CSV_FILE);
            res.writeHead(200, buildCorsHeaders(req, {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Length': content.length,
                'Content-Disposition': 'attachment; filename="leads.csv"',
                'Cache-Control': 'no-store',
            }));
            res.end(content);
        } catch (error) {
            console.error('Erro ao enviar CSV:', error);
            sendText(req, res, 500, 'Erro ao gerar o arquivo CSV.');
        }

        return true;
    }

    return false;
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (await handleApiRequest(req, res, url)) {
        return;
    }

    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/') {
        pathname = '/index.html';
    }

    const filePath = path.join(ROOT_DIR, pathname);

    if (!filePath.startsWith(ROOT_DIR)) {
        sendText(req, res, 403, 'Acesso negado.');
        return;
    }

    await serveStaticFile(res, filePath);
});

ensureCsvFile()
    .then(() => {
        server.listen(PORT, HOST, () => {
            console.log(`Servidor iniciado em http://${HOST}:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Não foi possível preparar o arquivo CSV:', error);
        process.exit(1);
    });
