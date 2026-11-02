const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function configuredOrigin(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('Configure APP_ORIGIN e APP_ALLOWED_ORIGINS com origens HTTP ou HTTPS válidas.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname.includes('*') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('As origens permitidas devem conter apenas protocolo, endereço e porta, sem credenciais ou caminhos.');
    }
    return url.origin;
}
export function createOriginGuard(appOrigin = '', additionalOrigins = '') {
    const allowedOrigins = new Set([appOrigin, ...additionalOrigins.split(',')].map(value => value.trim()).filter(Boolean).map(configuredOrigin));
    return (req, res, next) => {
        if (writeMethods.has(req.method)) {
            if (req.header('X-PetCore-Request') !== '1') {
                res.status(403).json({ error: 'Cabeçalho de segurança obrigatório.' });
                return;
            }
            const origin = req.get('Origin');
            if (origin && !allowedOrigins.has(origin)) {
                res.status(403).json({ error: 'Origem não permitida.' });
                return;
            }
        }
        next();
    };
}
