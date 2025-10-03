(function () {
    const API_PATH = '/api/leads';

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

        return API_PATH;
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

        const response = await fetch(endpoint, options);

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

    const registerLead = async ({ name = '', phone = '', email = '', instagram = '' } = {}) => {
        const payload = {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            instagram: normalizeInstagramHandle(instagram),
        };

        await request(API_BASE, { method: 'POST', body: payload });
    };

    const fetchLeads = async () => {
        const data = await request(API_BASE, { method: 'GET' });

        if (!data || !Array.isArray(data.leads)) {
            return [];
        }

        return data.leads;
    };

    const downloadLeadsCsv = () => {
        const url = `${API_BASE}.csv?timestamp=${Date.now()}`;
        const link = document.createElement('a');
        link.href = url;
        link.download = 'leads.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    window.tkLeadStorage = {
        apiBase: API_BASE,
        getPhoneDigits,
        registerLead,
        fetchLeads,
        downloadLeadsCsv,
    };
})();
