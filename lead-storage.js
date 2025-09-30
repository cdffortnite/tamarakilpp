(function () {
    const storageKey = 'tk_prospect_entries';

    const hasLocalStorage = (() => {
        if (typeof window === 'undefined' || !('localStorage' in window)) {
            return false;
        }

        try {
            const testKey = '__tk_storage_test__';
            window.localStorage.setItem(testKey, testKey);
            window.localStorage.removeItem(testKey);
            return true;
        } catch (error) {
            console.warn(
                'Armazenamento local indisponível. Os contatos não serão armazenados automaticamente.',
                error
            );
            return false;
        }
    })();

    const getPhoneDigits = (value = '') => value.replace(/\D/g, '');

    const splitName = (value = '') => {
        const clean = value.trim().replace(/\s+/g, ' ');

        if (!clean) {
            return { firstName: '', lastName: '' };
        }

        const parts = clean.split(' ');
        const firstName = parts.shift() || '';
        const lastName = parts.join(' ');
        return { firstName, lastName };
    };

    const formatPhoneForMeta = (digits = '') => {
        if (!digits) {
            return '';
        }

        const normalized = digits.replace(/^0+/, '');

        if (!normalized) {
            return '';
        }

        if (normalized.startsWith('55') && normalized.length >= 12) {
            return `+${normalized}`;
        }

        if (normalized.length === 10 || normalized.length === 11) {
            return `+55${normalized}`;
        }

        return `+${normalized}`;
    };

    const normalizeInstagramHandle = (value = '') => {
        const clean = value.trim();

        if (!clean) {
            return '';
        }

        const sanitized = clean.replace(/^@+/, '');
        return sanitized ? `@${sanitized}` : '';
    };

    const loadStoredEntries = () => {
        if (!hasLocalStorage) {
            return [];
        }

        try {
            const stored = window.localStorage.getItem(storageKey);

            if (!stored) {
                return [];
            }

            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('Não foi possível ler os contatos armazenados.', error);
            return [];
        }
    };

    const persistEntries = (entries) => {
        if (!hasLocalStorage) {
            return;
        }

        try {
            window.localStorage.setItem(storageKey, JSON.stringify(entries));
        } catch (error) {
            console.error('Não foi possível salvar os contatos localmente.', error);
        }
    };

    const registerLead = ({ name = '', phone = '', email = '', instagram = '' } = {}) => {
        if (!hasLocalStorage) {
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();
        const phoneDigits = getPhoneDigits(phone);
        const formattedPhone = formatPhoneForMeta(phoneDigits);

        if (!normalizedEmail && !formattedPhone) {
            return;
        }

        const { firstName, lastName } = splitName(name);
        const instagramHandle = normalizeInstagramHandle(instagram);
        const existingEntries = loadStoredEntries();
        const newEntry = {
            email: normalizedEmail,
            phone: formattedPhone,
            fn: firstName,
            ln: lastName,
            extern_id: normalizedEmail || formattedPhone || instagramHandle,
            instagram: instagramHandle,
            captured_at: new Date().toISOString(),
        };
        const existingIndex = existingEntries.findIndex(
            (entry) =>
                (normalizedEmail && entry.email === normalizedEmail) ||
                (formattedPhone && entry.phone === formattedPhone)
        );

        if (existingIndex >= 0) {
            existingEntries[existingIndex] = { ...existingEntries[existingIndex], ...newEntry };
        } else {
            existingEntries.push(newEntry);
        }

        persistEntries(existingEntries);
    };

    const escapeCsvValue = (value = '') => {
        if (value === null || value === undefined) {
            return '';
        }

        const stringValue = String(value).replace(/\r?\n|\r/g, ' ').trim();

        if (/[",]/.test(stringValue)) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
    };

    const buildCsvContent = (entries) => {
        const columns = [
            { key: 'email', label: 'EMAIL' },
            { key: 'phone', label: 'PHONE' },
            { key: 'fn', label: 'FN' },
            { key: 'ln', label: 'LN' },
            { key: 'extern_id', label: 'EXTERN_ID' },
            { key: 'instagram', label: 'INSTAGRAM' },
            { key: 'captured_at', label: 'CAPTURED_AT' },
        ];
        const header = columns.map(({ label }) => label).join(',');
        const rows = (entries || []).map((entry) =>
            columns.map(({ key }) => escapeCsvValue(entry[key] ?? '')).join(',')
        );

        return [header, ...rows].join('\r\n');
    };

    const downloadCsvFile = (content, { prefix = 'contatos-tamara' } = {}) => {
        if (!content) {
            return;
        }

        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().split('T')[0];
        link.href = url;
        link.download = `${prefix}-${timestamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    window.tkLeadStorage = {
        storageKey,
        hasLocalStorage,
        getPhoneDigits,
        splitName,
        formatPhoneForMeta,
        normalizeInstagramHandle,
        loadStoredEntries,
        persistEntries,
        registerLead,
        escapeCsvValue,
        buildCsvContent,
        downloadCsvFile,
    };
})();
