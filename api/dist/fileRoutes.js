import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool, auth, permit, tenant, ensure } from './core.js';
const router = Router();
router.use(auth, permit('pets'));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
function store() {
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT, bucket = process.env.OBJECT_STORAGE_BUCKET, key = process.env.OBJECT_STORAGE_ACCESS_KEY, secret = process.env.OBJECT_STORAGE_SECRET_KEY;
    ensure(endpoint && bucket && key && secret, 503, 'Armazenamento em nuvem não configurado. Configure as variáveis OBJECT_STORAGE_* no servidor.');
    const client = new S3Client({ region: process.env.OBJECT_STORAGE_REGION || 'auto', endpoint, forcePathStyle: true,
        credentials: { accessKeyId: key, secretAccessKey: secret } });
    return { client, bucket };
}
function kind(buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
        return { mime: 'image/jpeg', ext: 'jpg' };
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return { mime: 'image/png', ext: 'png' };
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
        return { mime: 'image/webp', ext: 'webp' };
    return null;
}
router.post('/pets/:id/photo', upload.single('photo'), async (req, res) => {
    const c = tenant(req), id = z.uuid().parse(req.params.id);
    ensure(req.file, 422, 'Escolha uma imagem JPEG, PNG ou WebP até 5 MB.');
    const type = kind(req.file.buffer);
    ensure(type, 422, 'Formato inválido. Envie JPEG, PNG ou WebP.');
    const prev = await pool.query('SELECT photo_key FROM pets WHERE tenant_id=$1 AND id=$2', [c, id]);
    ensure(prev.rowCount, 404, 'Pet não encontrado.');
    const { client, bucket } = store(), key = `tenants/${c}/pets/${id}/${randomUUID()}.${type.ext}`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: req.file.buffer, ContentType: type.mime }));
    try {
        await pool.query('UPDATE pets SET photo_key=$3 WHERE tenant_id=$1 AND id=$2', [c, id, key]);
    }
    catch (e) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => { });
        throw e;
    }
    if (prev.rows[0].photo_key)
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: prev.rows[0].photo_key })).catch(err => console.error('Erro removendo foto anterior', err));
    res.status(201).json({ ok: true });
});
router.get('/pets/:id/photo-url', async (req, res) => {
    const c = tenant(req), id = z.uuid().parse(req.params.id);
    const row = await pool.query('SELECT photo_key FROM pets WHERE tenant_id=$1 AND id=$2', [c, id]);
    ensure(row.rowCount, 404, 'Pet não encontrado.');
    ensure(row.rows[0].photo_key, 404, 'Pet sem foto.');
    const { client, bucket } = store();
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: row.rows[0].photo_key }), { expiresIn: 900 });
    res.json({ url, expiresInSeconds: 900 });
});
export default router;
