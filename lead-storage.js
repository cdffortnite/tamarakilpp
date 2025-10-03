(function () {
    const API_PATH = '/api/leads';
    const FALLBACK_ENDPOINTS = ['./leads.php', '/leads.php', '/api/leads', '/leads'];
    let cachedRegisterEndpoint = null;

    const normalizeUrl = (value) => {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();

        if (!trimmed) {
            return null;
        }

        try {
            if (typeof window !== 'undefined' && window.location) {
                const url = new URL(trimmed, window.location.href);
                return url.toString().replace(/\/$/, '');
            }

            const url = new URL(trimmed);
            return url.toString().replace(/\/$/, '');
        } catch (error) {
            return null;
        }
    };

    const normalizeApiBase = (value) => {
        const normalized = normalizeUrl(value);

        if (!normalized) {
            return null;
        }

        if (normalized.endsWith(API_PATH)) {
            return normalized;
        }

        return `${normalized}${API_PATH}`;
    };

    const getMetaContent = (name) => {
        if (typeof document === 'undefined') {
            return '';
        }

        const element = document.querySelector(`meta[name="${name}"]`);

        if (!element || typeof element.content !== 'string') {
            return '';
        }

        return element.content.trim();
    };

    const getDatasetOverride = () => {
        if (typeof document === 'undefined') {
            return null;
        }

        const candidates = [];

        if (document.currentScript && document.currentScript.dataset) {
            candidates.push(document.currentScript.dataset.tkLeadsApiBase);
            candidates.push(document.currentScript.dataset.tkLeadsApiOrigin);
        }

        const fallbackScript = document.querySelector('script[data-tk-leads-api-base], script[data-tk-leads-api-origin]');

        if (fallbackScript && fallbackScript.dataset) {
            candidates.push(fallbackScript.dataset.tkLeadsApiBase);
            candidates.push(fallbackScript.dataset.tkLeadsApiOrigin);
        }

        for (const value of candidates) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }

        return null;
    };

    const getWindowOverride = () => {
        if (typeof window === 'undefined') {
            return null;
        }

        const { tkLeadsApiBase, tkLeadsApiOrigin, TK_LEADS_API_BASE, TK_LEADS_API_ORIGIN } = window;
        const override =
            (typeof tkLeadsApiBase === 'string' && tkLeadsApiBase.trim()) ||
            (typeof TK_LEADS_API_BASE === 'string' && TK_LEADS_API_BASE.trim()) ||
            (typeof tkLeadsApiOrigin === 'string' && tkLeadsApiOrigin.trim()) ||
            (typeof TK_LEADS_API_ORIGIN === 'string' && TK_LEADS_API_ORIGIN.trim());

        return override ? override.trim() : null;
    };

    const resolveApiBase = () => {
        const explicitOverride = getWindowOverride() || getDatasetOverride();

        if (explicitOverride) {
            const normalized = normalizeApiBase(explicitOverride);

            if (normalized) {
                return normalized;
            }
        }

        const metaBase = getMetaContent('tk:leads-api-base');

        if (metaBase) {
            const normalized = normalizeApiBase(metaBase);

            if (normalized) {
                return normalized;
            }
        }

        const metaOrigin = getMetaContent('tk:leads-api-origin');

        if (metaOrigin) {
            const normalized = normalizeApiBase(metaOrigin);

            if (normalized) {
                return normalized;
            }
        }

        if (typeof window !== 'undefined' && window.location) {
            const normalized = normalizeApiBase(window.location.origin);

            if (normalized) {
                return normalized;
            }
        }

        return './leads.php';
    };

    const API_BASE = resolveApiBase();

    const getPhoneDigits = (value = '') => value.replace(/\D/g, '');

    const normalizeInstagramHandle = (value = '') => {
        const clean = value.trim();

        if (!clean) {
            return '';
        }

        const sanitized = clean.replace(/^@+/, '');
        return sanitized ? `@${sanitized}` : '';
    };

    const request = async (endpoint, { method = 'GET', body, headers } = {}) => {
        const options = {
            method,
            headers: {
                Accept: 'application/json',
                ...headers,
            },
        };

        if (body !== undefined) {
            options.body = JSON.stringify(body);
            options.headers['Content-Type'] = 'application/json';
        }

        let response;

        try {
            response = await fetch(endpoint, options);
        } catch (networkError) {
            const error = new Error(
                'Não foi possível se conectar ao servidor. Verifique sua conexão e tente novamente.'
            );
            error.status = 0;
            error.endpoint = endpoint;
            error.cause = networkError;
            throw error;
        }

        if (!response.ok) {
            let errorMessage = 'Erro desconhecido ao comunicar com o servidor.';

            try {
                const payload = await response.json();

                if (payload && typeof payload.message === 'string') {
                    errorMessage = payload.message;
                }
            } catch (error) {
                // Ignora erro ao tentar ler o corpo como JSON.
            }

            const error = new Error(errorMessage);
            error.status = response.status;
            throw error;
        }

        const contentType = response.headers.get('Content-Type') || '';

        if (contentType.includes('application/json')) {
            return response.json();
        }

        return null;
    };

    const collectEndpointCandidates = ({ includeCached = false } = {}) => {
        const endpoints = [];
        const seen = new Set();

        const appendCandidate = (value) => {
            if (typeof value !== 'string') {
                return;
            }

            const trimmed = value.trim();

            if (!trimmed || seen.has(trimmed)) {
                return;
            }

            seen.add(trimmed);
            endpoints.push(trimmed);
        };

        appendCandidate('./leads.php');

        if (includeCached && cachedRegisterEndpoint) {
            appendCandidate(cachedRegisterEndpoint);
        }

        appendCandidate(API_BASE);
        FALLBACK_ENDPOINTS.forEach(appendCandidate);

        if (typeof window !== 'undefined' && window.location && window.location.origin) {
            FALLBACK_ENDPOINTS.forEach((path) => {
                if (path.startsWith('http://') || path.startsWith('https://')) {
                    appendCandidate(path);
                    return;
                }

                const normalizedPath = path.startsWith('/') ? path : `/${path}`;
                appendCandidate(`${window.location.origin}${normalizedPath}`);
            });
        }

        return endpoints;
    };

    const sendLeadRequest = async (endpoint, payload) => {
        const options = {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        };

        let response;

        try {
            response = await fetch(endpoint, options);
        } catch (networkError) {
            const error = new Error(
                'Não foi possível se conectar ao servidor. Verifique sua conexão e tente novamente.'
            );
            error.status = 0;
            error.endpoint = endpoint;
            error.cause = networkError;
            throw error;
        }

        const { status } = response;
        const contentType = response.headers.get('Content-Type') || '';
        let responseBody = null;

        if (contentType.includes('application/json')) {
            try {
                responseBody = await response.json();
            } catch (parseError) {
                console.warn('[tkLeadStorage] Não foi possível interpretar o JSON de resposta.', parseError);
            }
        } else if (contentType.includes('text/')) {
            try {
                responseBody = await response.text();
            } catch (parseError) {
                console.warn('[tkLeadStorage] Não foi possível ler a resposta do servidor.', parseError);
            }
        }

        if (!response.ok) {
            let message = '';

            if (responseBody && typeof responseBody === 'object') {
                if (typeof responseBody.message === 'string' && responseBody.message.trim()) {
                    message = responseBody.message.trim();
                } else if (typeof responseBody.error === 'string' && responseBody.error.trim()) {
                    message = responseBody.error.trim();
                }
            } else if (typeof responseBody === 'string' && responseBody.trim()) {
                message = responseBody.trim();
            }

            if (!message) {
                if (status === 404) {
                    message = 'Serviço não encontrado.';
                } else if (status === 500) {
                    message = 'Erro interno no servidor.';
                } else if (status === 0) {
                    message = 'Não foi possível estabelecer comunicação com o servidor.';
                } else {
                    message = 'Erro ao enviar os dados.';
                }
            }

            const error = new Error(message);
            error.status = status;
            error.endpoint = endpoint;
            error.response = responseBody;
            throw error;
        }

        return { status, body: responseBody };
    };

    const getFriendlyErrorMessage = (status, fallbackMessage = '') => {
        if (fallbackMessage && fallbackMessage !== 'Erro desconhecido ao comunicar com o servidor.') {
            return fallbackMessage;
        }

        switch (status) {
            case 0:
                return 'Não foi possível se conectar ao servidor. Verifique sua conexão e tente novamente.';
            case 400:
            case 422:
                return 'Verifique os dados informados e tente novamente.';
            case 401:
            case 403:
                return 'Seu acesso não foi autorizado. Tente novamente mais tarde.';
            case 404:
                return 'Não encontramos o serviço de cadastro. Tente novamente em instantes.';
            case 500:
            case 502:
            case 503:
            case 504:
                return 'Estamos enfrentando instabilidades. Tente novamente em alguns minutos.';
            default:
                return 'Não foi possível enviar suas informações. Tente novamente em instantes.';
        }
    };

    const resolveDefaultForm = () => {
        if (typeof document === 'undefined') {
            return null;
        }

        return (
            document.querySelector('form[data-lead-form]') ||
            document.getElementById('email-capture-form') ||
            null
        );
    };

    const resolveMessageElement = (formElement) => {
        if (typeof document === 'undefined') {
            return null;
        }

        if (formElement) {
            const scoped =
                formElement.querySelector('[data-lead-message]') ||
                formElement.querySelector('.error-message');

            if (scoped) {
                return scoped;
            }
        }

        return (
            document.querySelector('[data-lead-message]') ||
            document.querySelector('.error-message') ||
            null
        );
    };

    const registerLead = async (
        { name = '', phone = '', email = '', instagram = '' } = {},
        {
            formElement: providedForm,
            messageElement: providedMessage,
            redirectUrl: providedRedirectUrl,
            onSuccess,
        } = {}
    ) => {
        const formElement = providedForm || resolveDefaultForm();
        const messageElement = providedMessage || resolveMessageElement(formElement);
        const redirectUrl =
            providedRedirectUrl ||
            (formElement && formElement.dataset && formElement.dataset.redirectUrl
                ? formElement.dataset.redirectUrl
                : '');

        const setMessage = (type, text) => {
            if (!messageElement) {
                return;
            }

            const safeText = typeof text === 'string' ? text : '';
            messageElement.textContent = safeText;

            if (messageElement.dataset) {
                messageElement.dataset.state = type;
            }

            if (messageElement.classList) {
                messageElement.classList.remove('is-error', 'is-success', 'is-info');

                if (type === 'error') {
                    messageElement.classList.add('is-error');
                } else if (type === 'success') {
                    messageElement.classList.add('is-success');
                } else if (type === 'info') {
                    messageElement.classList.add('is-info');
                }
            }
        };

        const payload = {
            nome: name.trim(),
            telefone: phone.trim(),
            email: email.trim(),
        };

        const instagramHandle = normalizeInstagramHandle(instagram);

        if (instagramHandle) {
            payload.instagram = instagramHandle;
        }

        setMessage('info', 'Enviando seus dados...');

        const attempts = [];
        const endpointsToTry = collectEndpointCandidates({ includeCached: true });

        for (const endpoint of endpointsToTry) {
            try {
                console.info(`[tkLeadStorage] Enviando lead para ${endpoint}`);
                const { status, body } = await sendLeadRequest(endpoint, payload);

                cachedRegisterEndpoint = endpoint;
                const serverMessage =
                    body && typeof body === 'object' && typeof body.message === 'string'
                        ? body.message.trim()
                        : '';

                setMessage(
                    'success',
                    serverMessage || 'Tudo certo! Vamos te direcionar para a próxima etapa.'
                );

                if (formElement && typeof formElement.reset === 'function') {
                    formElement.reset();

                    const invalidFields = formElement.querySelectorAll('[aria-invalid="true"]');
                    invalidFields.forEach((field) => field.setAttribute('aria-invalid', 'false'));
                }

                if (typeof onSuccess === 'function') {
                    try {
                        await onSuccess({ endpoint, status, response: body });
                    } catch (callbackError) {
                        console.error(
                            '[tkLeadStorage] Erro ao executar ação após o envio dos dados.',
                            callbackError
                        );
                    }
                }

                if (redirectUrl) {
                    setTimeout(() => {
                        try {
                            window.location.assign(redirectUrl);
                        } catch (navigationError) {
                            console.error(
                                '[tkLeadStorage] Não foi possível redirecionar automaticamente.',
                                navigationError
                            );
                        }
                    }, 150);
                }

                return { endpoint, status };
            } catch (error) {
                attempts.push({ endpoint, error });
                const status = typeof error === 'object' && error ? error.status : undefined;
                const message = error && typeof error.message === 'string' ? error.message : '';

                if (status === 404) {
                    console.warn(
                        `[tkLeadStorage] Endpoint ${endpoint} retornou 404. Tentando próximo endereço disponível.`
                    );
                    continue;
                }

                const friendlyMessage = getFriendlyErrorMessage(status, message);
                setMessage('error', friendlyMessage);
                console.error(
                    `[tkLeadStorage] Erro ao registrar o contato na rota ${endpoint}.`,
                    error
                );
                throw error;
            }
        }

        const lastAttempt = attempts[attempts.length - 1];
        const fallbackStatus = lastAttempt && lastAttempt.error ? lastAttempt.error.status : undefined;
        const fallbackMessage =
            lastAttempt && lastAttempt.error && lastAttempt.error.message
                ? lastAttempt.error.message
                : '';
        const friendlyMessage = getFriendlyErrorMessage(fallbackStatus, fallbackMessage);
        setMessage('error', friendlyMessage);

        const finalError = new Error('Não foi possível encontrar uma rota válida para salvar o contato.');
        finalError.attempts = attempts;
        throw finalError;
    };

    const fetchLeads = async () => {
        const attempts = [];
        const endpoints = collectEndpointCandidates({ includeCached: true });

        for (const endpoint of endpoints) {
            try {
                const data = await request(endpoint, { method: 'GET' });

                if (data && Array.isArray(data.leads)) {
                    return data.leads;
                }

                if (data && Array.isArray(data)) {
                    return data;
                }

                throw new Error('Resposta inválida do servidor.');
            } catch (error) {
                attempts.push({ endpoint, error });

                const status = error && typeof error === 'object' ? error.status : undefined;

                if (status === 404) {
                    console.warn(
                        `[tkLeadStorage] Endpoint ${endpoint} retornou 404 ao carregar leads. Tentando próximo endereço.`
                    );
                    continue;
                }

                console.error(
                    `[tkLeadStorage] Erro ao carregar leads utilizando a rota ${endpoint}.`,
                    error
                );
            }
        }

        const finalError = new Error('Não foi possível carregar os contatos.');
        finalError.attempts = attempts;
        throw finalError;
    };

    const buildCsvDownloadUrls = (endpoint) => {
        const urls = [];
        const seen = new Set();
        const base = endpoint.split('#')[0];
        const [withoutQuery, query = ''] = base.split('?');
        const normalized = withoutQuery.replace(/\/$/, '');

        const withTimestamp = (url) => {
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}timestamp=${Date.now()}`;
        };

        const appendUrl = (value) => {
            if (!value || seen.has(value)) {
                return;
            }

            seen.add(value);
            urls.push(withTimestamp(value));
        };

        if (normalized.endsWith('.csv')) {
            appendUrl(`${normalized}${query ? `?${query}` : ''}`);
        } else {
            appendUrl(`${normalized}.csv`);

            if (normalized.endsWith('.php')) {
                appendUrl(`${normalized}?format=csv`);
                appendUrl(`${normalized}?download=1`);
            }
        }

        return urls;
    };

    const downloadLeadsCsv = async () => {
        const endpoints = collectEndpointCandidates({ includeCached: true });
        const attempts = [];

        for (const endpoint of endpoints) {
            const candidates = buildCsvDownloadUrls(endpoint);

            for (const candidate of candidates) {
                try {
                    const response = await fetch(candidate, {
                        method: 'GET',
                        headers: {
                            Accept: 'text/csv, */*',
                        },
                    });

                    if (!response.ok) {
                        const error = new Error('Não foi possível baixar o arquivo CSV.');
                        error.status = response.status;
                        throw error;
                    }

                    const blob = await response.blob();

                    if (!blob || blob.size === 0) {
                        throw new Error('O arquivo CSV recebido está vazio.');
                    }

                    const disposition = response.headers.get('Content-Disposition') || '';
                    const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
                    const decodedFilename = filenameMatch
                        ? decodeURIComponent(filenameMatch[1] || filenameMatch[2] || 'leads.csv')
                        : 'leads.csv';

                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = decodedFilename || 'leads.csv';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                    }, 2000);

                    return { endpoint: candidate, size: blob.size };
                } catch (error) {
                    attempts.push({ endpoint: candidate, error });

                    const status = error && typeof error === 'object' ? error.status : undefined;

                    if (status === 404) {
                        console.warn(
                            `[tkLeadStorage] CSV não encontrado em ${candidate}. Tentando próximo endereço disponível.`
                        );
                        continue;
                    }

                    console.error(
                        `[tkLeadStorage] Erro ao baixar o CSV de ${candidate}.`,
                        error
                    );
                }
            }
        }

        const finalError = new Error('Não foi possível localizar uma fonte de download do CSV.');
        finalError.attempts = attempts;
        throw finalError;
    };

    window.tkLeadStorage = {
        apiBase: API_BASE,
        getPhoneDigits,
        registerLead,
        fetchLeads,
        downloadLeadsCsv,
    };
})();
