(function () {
    const resolveApiBase = () => {
        if (typeof window !== 'undefined' && window.tkLeadApiBase) {
            return `${String(window.tkLeadApiBase).replace(/\/$/, '')}/api/leads`;
        }

        const { location, document } = window;

        if (document) {
            const meta = document.querySelector('meta[name="tk:api-base"]');

            if (meta && meta.content) {
                return `${meta.content.replace(/\/$/, '')}/api/leads`;
            }
        }

        if (!location) {
            return '/api/leads';
        }

        const { origin, protocol, hostname, port } = location;
        const normalizedProtocol = protocol && protocol !== ':' ? protocol : 'http:';
        const normalizedHost = hostname || 'localhost';
        const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0'];

        if (origin && origin !== 'null') {
            const isLocalHost = LOCAL_HOSTNAMES.includes(normalizedHost);
            const preferredPort = port || '';

            if (isLocalHost && preferredPort && preferredPort !== '3000') {
                return `${normalizedProtocol}//${normalizedHost}:3000/api/leads`;
            }

            return `${origin.replace(/\/$/, '')}/api/leads`;
        }

        if (LOCAL_HOSTNAMES.includes(normalizedHost)) {
            return `${normalizedProtocol}//${normalizedHost}:3000/api/leads`;
        }

        return `${normalizedProtocol}//${normalizedHost}${port ? `:${port}` : ''}/api/leads`;
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
        getPhoneDigits,
        registerLead,
        fetchLeads,
        downloadLeadsCsv,
    };
})();
