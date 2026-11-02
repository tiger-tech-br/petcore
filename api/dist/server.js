import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, sendError } from './core.js';
import authRoutes from './authRoutes.js';
import dataRoutes from './dataRoutes.js';
import calendarRoutes from './calendarRoutes.js';
import fileRoutes from './fileRoutes.js';
import crmRoutes from './crmRoutes.js';
import { createOriginGuard } from './originGuard.js';
export function createApp() {
    const app = express();
    const prod = process.env.NODE_ENV === 'production';
    if (prod)
        app.set('trust proxy', 1);
    app.disable('x-powered-by');
    app.use(helmet({ contentSecurityPolicy: prod ? undefined : false }));
    app.use(express.json({ limit: '100kb' }));
    const PgStore = connectPgSimple(session);
    app.use(session({ name: 'petcore.sid', store: new PgStore({ pool, createTableIfMissing: true }),
        secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, rolling: true,
        cookie: { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 8 * 60 * 60 * 1000, path: '/' } }));
    app.use('/api', createOriginGuard(process.env.APP_ORIGIN, process.env.APP_ALLOWED_ORIGINS));
    app.get('/api/health', async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true, database: true }); });
    app.use('/api/auth', authRoutes);
    app.use('/api/crm', crmRoutes);
    app.use('/api', dataRoutes);
    app.use('/api', calendarRoutes);
    app.use('/api', fileRoutes);
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
    if (prod) {
        const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
        app.use(express.static(dist));
        app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    }
    app.use(sendError);
    return app;
}
if (process.env.NODE_ENV !== 'test') {
    const port = Number(process.env.PORT || 4000);
    const server = createApp().listen(port, () => console.log(`PetCore API disponível na porta ${port}`));
    process.on('SIGTERM', () => server.close(() => pool.end()));
}
