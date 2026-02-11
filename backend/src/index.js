import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { WebSocketServer } from 'ws';
import { PrismaClient, AccountStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import multer from 'multer';

const prisma = new PrismaClient();

const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const QR_TTL_SECONDS = Number(process.env.QR_TTL_SECONDS || 180);
const SMARTKEY_BIND_TTL_SECONDS = Number(process.env.SMARTKEY_BIND_TTL_SECONDS || 300);
const SMARTKEY_LOGIN_TTL_SECONDS = Number(process.env.SMARTKEY_LOGIN_TTL_SECONDS || 180);
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 50);
const MAX_FILE_SIZE = MAX_FILE_MB * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: MAX_FILE_SIZE } });

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));

function signJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function fileUrl(id) {
  return `/files/${id}`;
}


function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') return res.status(403).json({ error: 'admin_only' });
  return next();
}

async function ensureActiveUser(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw Object.assign(new Error('no_user'), { code: 401 });
  if (u.status === AccountStatus.BLOCKED) throw Object.assign(new Error('blocked'), { code: 403 });
  if (u.status === AccountStatus.FROZEN) throw Object.assign(new Error('frozen'), { code: 403 });
  return u;
}

// ===== Auth =====
app.post('/auth/register', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(8).max(128),
    displayName: z.string().min(1).max(64).optional(),
    inviteCode: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request', details: parsed.error.flatten() });

  const { username, password, displayName, inviteCode } = parsed.data;

  const userCount = await prisma.user.count();
  if (userCount > 0) {
    if (!inviteCode) return res.status(400).json({ error: 'invite_required' });
    const code = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
    if (!code) return res.status(400).json({ error: 'invite_invalid' });
    if (code.expiresAt < new Date()) return res.status(400).json({ error: 'invite_expired' });
    if (code.uses >= code.maxUses) return res.status(400).json({ error: 'invite_exhausted' });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: 'username_taken' });

  const passwordHash = await bcrypt.hash(password, 12);

  const role = userCount === 0 ? UserRole.ADMIN : UserRole.USER;

  const user = await prisma.user.create({
    data: { username, displayName, passwordHash, role },
    select: { id: true, username: true, displayName: true, role: true, status: true, avatarFileId: true },
  });

  if (userCount > 0) {
    await prisma.inviteCode.update({
      where: { code: inviteCode },
      data: { uses: { increment: 1 } },
    });
  }

  const token = signJwt({ sub: user.id, username: user.username, role: user.role });
  const avatarUrl = user.avatarFileId ? fileUrl(user.avatarFileId) : null;
  return res.json({ token, user: { ...user, avatarUrl } });
});

app.post('/auth/login', async (req, res) => {
  const schema = z.object({
    username: z.string(),
    password: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  if (user.status !== AccountStatus.ACTIVE) return res.status(403).json({ error: `status_${user.status.toLowerCase()}` });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  const token = signJwt({ sub: user.id, username: user.username, role: user.role });
  const avatarUrl = user.avatarFileId ? fileUrl(user.avatarFileId) : null;
  return res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, status: user.status, avatarUrl } });
});

app.get('/me', authMiddleware, async (req, res) => {
  try {
    const u = await ensureActiveUser(req.user.sub);
    const avatarUrl = u.avatarFileId ? fileUrl(u.avatarFileId) : null;
    return res.json({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, status: u.status, avatarUrl });
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.message || 'error' });
  }
});

// ===== QR Login =====
// Desktop (not logged in): ask for QR token
app.post('/auth/qr/request-login', async (req, res) => {
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);
  await prisma.qrLogin.create({ data: { token, expiresAt } });
  return res.json({ qrToken: token, expiresAt: expiresAt.toISOString() });
});

// Mobile (logged in): approve QR token
app.post('/auth/qr/approve', authMiddleware, async (req, res) => {
  const schema = z.object({ qrToken: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  const { qrToken } = parsed.data;
  const qr = await prisma.qrLogin.findUnique({ where: { token: qrToken } });
  if (!qr) return res.status(404).json({ error: 'qr_not_found' });
  if (qr.expiresAt < new Date()) {
    await prisma.qrLogin.update({ where: { token: qrToken }, data: { status: 'EXPIRED' } });
    return res.status(400).json({ error: 'qr_expired' });
  }
  if (qr.status === 'APPROVED' && qr.issuedJwt) return res.json({ ok: true });

  const u = await ensureActiveUser(req.user.sub);
  const issuedJwt = signJwt({ sub: u.id, username: u.username, role: u.role });

  await prisma.qrLogin.update({
    where: { token: qrToken },
    data: { status: 'APPROVED', approvedByUserId: u.id, issuedJwt },
  });

  return res.json({ ok: true });
});

// Desktop polling
app.get('/auth/qr/status', async (req, res) => {
  const qrToken = String(req.query.qrToken || '');
  if (!qrToken) return res.status(400).json({ error: 'missing_qrToken' });

  const qr = await prisma.qrLogin.findUnique({ where: { token: qrToken } });
  if (!qr) return res.status(404).json({ error: 'qr_not_found' });
  if (qr.expiresAt < new Date() && qr.status !== 'APPROVED') {
    await prisma.qrLogin.update({ where: { token: qrToken }, data: { status: 'EXPIRED' } });
    return res.json({ status: 'EXPIRED' });
  }
  if (qr.status === 'APPROVED') return res.json({ status: 'APPROVED', token: qr.issuedJwt });
  return res.json({ status: 'PENDING' });
});

// ===== Smart Key =====
app.post('/auth/smartkey/bind-request', authMiddleware, async (req, res) => {
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + SMARTKEY_BIND_TTL_SECONDS * 1000);
  await prisma.smartKeyBind.create({ data: { token, userId: req.user.sub, expiresAt } });
  return res.json({ token, expiresAt: expiresAt.toISOString() });
});

app.post('/auth/smartkey/bind', async (req, res) => {
  const schema = z.object({
    token: z.string().min(10),
    secretHash: z.string().min(32),
    deviceName: z.string().max(64).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  const { token, secretHash, deviceName } = parsed.data;
  const bind = await prisma.smartKeyBind.findUnique({ where: { token } });
  if (!bind) return res.status(404).json({ error: 'bind_not_found' });
  if (bind.expiresAt < new Date()) {
    await prisma.smartKeyBind.delete({ where: { token } }).catch(() => {});
    return res.status(400).json({ error: 'bind_expired' });
  }

  let key
  try {
    key = await prisma.smartKey.create({
      data: { userId: bind.userId, secretHash, deviceName },
      select: { id: true, deviceName: true, createdAt: true },
    });
  } catch {
    return res.status(409).json({ error: 'key_exists' });
  }
  await prisma.smartKeyBind.delete({ where: { token } }).catch(() => {});
  return res.json({ ok: true, key });
});

app.get('/auth/smartkey/list', authMiddleware, async (req, res) => {
  const keys = await prisma.smartKey.findMany({
    where: { userId: req.user.sub },
    orderBy: { createdAt: 'desc' },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
  });
  return res.json({ keys });
});

app.post('/auth/smartkey/revoke', authMiddleware, async (req, res) => {
  const schema = z.object({ id: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const key = await prisma.smartKey.findFirst({ where: { id: parsed.data.id, userId: req.user.sub } });
  if (!key) return res.status(404).json({ error: 'key_not_found' });
  await prisma.smartKey.delete({ where: { id: key.id } });
  return res.json({ ok: true });
});

app.post('/auth/smartkey/login-request', async (req, res) => {
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + SMARTKEY_LOGIN_TTL_SECONDS * 1000);
  await prisma.smartKeyLogin.create({ data: { token, expiresAt } });
  return res.json({ token, expiresAt: expiresAt.toISOString() });
});

app.post('/auth/smartkey/approve', async (req, res) => {
  const schema = z.object({
    token: z.string().min(10),
    secretHash: z.string().min(32),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  const { token, secretHash } = parsed.data;
  const login = await prisma.smartKeyLogin.findUnique({ where: { token } });
  if (!login) return res.status(404).json({ error: 'login_not_found' });
  if (login.expiresAt < new Date()) {
    await prisma.smartKeyLogin.update({ where: { token }, data: { status: 'EXPIRED' } });
    return res.status(400).json({ error: 'login_expired' });
  }
  if (login.status === 'APPROVED' && login.issuedJwt) return res.json({ ok: true });

  const key = await prisma.smartKey.findFirst({ where: { secretHash } });
  if (!key) return res.status(403).json({ error: 'invalid_key' });

  const u = await ensureActiveUser(key.userId);
  const issuedJwt = signJwt({ sub: u.id, username: u.username, role: u.role });

  await prisma.smartKeyLogin.update({
    where: { token },
    data: { status: 'APPROVED', approvedByUserId: u.id, approvedByKeyId: key.id, issuedJwt },
  });
  await prisma.smartKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return res.json({ ok: true });
});

app.get('/auth/smartkey/status', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).json({ error: 'missing_token' });
  const login = await prisma.smartKeyLogin.findUnique({ where: { token } });
  if (!login) return res.status(404).json({ error: 'login_not_found' });
  if (login.expiresAt < new Date() && login.status !== 'APPROVED') {
    await prisma.smartKeyLogin.update({ where: { token }, data: { status: 'EXPIRED' } });
    return res.json({ status: 'EXPIRED' });
  }
  if (login.status === 'APPROVED') return res.json({ status: 'APPROVED', token: login.issuedJwt });
  return res.json({ status: 'PENDING' });
});

// ===== User search =====
app.get('/users/lookup', authMiddleware, async (req, res) => {
  await ensureActiveUser(req.user.sub);
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'missing_q' });

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: q }, { id: q }] },
    select: { id: true, username: true, displayName: true, status: true, avatarFileId: true },
  });
  if (!user) return res.status(404).json({ error: 'not_found' });
  const avatarUrl = user.avatarFileId ? fileUrl(user.avatarFileId) : null;
  return res.json({ user: { ...user, avatarUrl } });
});

// Upload avatar (stored on server, not E2E)
app.post('/users/me/avatar', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const u = await ensureActiveUser(req.user.sub);
  const mime = req.file.mimetype || 'application/octet-stream';
  if (!mime.startsWith('image/')) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'avatar_must_be_image' });
  }

  const file = await prisma.fileAsset.create({
    data: {
      ownerUserId: u.id,
      kind: 'AVATAR',
      originalName: req.file.originalname,
      mime,
      size: req.file.size,
      storagePath: req.file.path,
    }
  });

  await prisma.user.update({ where: { id: u.id }, data: { avatarFileId: file.id } });

  return res.json({ ok: true, avatarUrl: fileUrl(file.id) });
});

// Upload encrypted files for messages
app.post('/files/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const u = await ensureActiveUser(req.user.sub);
  const schema = z.object({
    recipientUserId: z.string().min(10),
    kind: z.enum(['MESSAGE']),
    originalName: z.string().max(256).optional(),
    mime: z.string().max(128).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'bad_request' });
  }

  const body = parsed.data;
  const file = await prisma.fileAsset.create({
    data: {
      ownerUserId: u.id,
      recipientUserId: body.recipientUserId,
      kind: 'MESSAGE',
      originalName: body.originalName || req.file.originalname,
      mime: body.mime || req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      storagePath: req.file.path,
    }
  });

  return res.json({ file: { id: file.id, size: file.size, url: fileUrl(file.id) } });
});

// Download file (encrypted for MESSAGE files)
app.get('/files/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  const file = await prisma.fileAsset.findUnique({ where: { id } });
  if (!file) return res.status(404).json({ error: 'file_not_found' });

  const userId = req.user?.sub;
  if (file.kind === 'MESSAGE') {
    if (file.ownerUserId !== userId && file.recipientUserId !== userId) {
      return res.status(403).json({ error: 'forbidden' });
    }
  }

  const abs = path.resolve(file.storagePath);
  const mime = file.mime || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  const name = file.originalName ? file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_') : `${file.id}.bin`;
  const disposition = file.kind === 'AVATAR' ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename="${name}"`);
  return res.sendFile(abs);
});

// ===== Devices =====
app.post('/devices', authMiddleware, async (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(64) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  const u = await ensureActiveUser(req.user.sub);
  const device = await prisma.device.create({
    data: { userId: u.id, name: parsed.data.name },
    select: { id: true, name: true, createdAt: true },
  });
  return res.json({ device });
});

app.get('/devices', authMiddleware, async (req, res) => {
  const u = await ensureActiveUser(req.user.sub);
  const devices = await prisma.device.findMany({
    where: { userId: u.id },
    select: { id: true, name: true, createdAt: true, lastSeenAt: true, identityKeyPub: true },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ devices });
});

// Upload device keys (Signal materials)
app.post('/devices/:deviceId/keys', authMiddleware, async (req, res) => {
  const schema = z.object({
    registrationId: z.number().int().min(1),
    identityKeyPub: z.string().min(10),
    signedPreKey: z.object({
      id: z.number().int().min(1),
      pubKey: z.string().min(10),
      signature: z.string().min(10),
    }),
    oneTimePreKeys: z.array(z.object({
      id: z.number().int().min(1),
      pubKey: z.string().min(10),
    })).max(500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request', details: parsed.error.flatten() });

  const u = await ensureActiveUser(req.user.sub);
  const deviceId = req.params.deviceId;

  const device = await prisma.device.findFirst({ where: { id: deviceId, userId: u.id } });
  if (!device) return res.status(404).json({ error: 'device_not_found' });

  const { registrationId, identityKeyPub, signedPreKey, oneTimePreKeys } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.device.update({
      where: { id: deviceId },
      data: {
        registrationId,
        identityKeyPub,
        signedPreKeyId: signedPreKey.id,
        signedPreKeyPub: signedPreKey.pubKey,
        signedPreKeySig: signedPreKey.signature,
        lastSeenAt: new Date(),
      },
    });

    for (const pk of oneTimePreKeys) {
      await tx.oneTimePreKey.upsert({
        where: { deviceId_keyId: { deviceId, keyId: pk.id } },
        create: { deviceId, keyId: pk.id, pubKey: pk.pubKey },
        update: { pubKey: pk.pubKey },
      });
    }
  });

  return res.json({ ok: true });
});

// Fetch device list for user
app.get('/users/:userId/devices', authMiddleware, async (req, res) => {
  await ensureActiveUser(req.user.sub);
  const userId = req.params.userId;
  const devices = await prisma.device.findMany({
    where: { userId },
    select: { id: true, name: true, createdAt: true, identityKeyPub: true },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ devices });
});

// Fetch prekey bundle for a specific recipient device (pops one one-time prekey if available)
app.get('/keys/bundle', authMiddleware, async (req, res) => {
  await ensureActiveUser(req.user.sub);
  const userId = String(req.query.userId || '');
  const deviceId = String(req.query.deviceId || '');
  if (!userId || !deviceId) return res.status(400).json({ error: 'missing_params' });

  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select: {
      id: true,
      registrationId: true,
      identityKeyPub: true,
      signedPreKeyId: true,
      signedPreKeyPub: true,
      signedPreKeySig: true,
    }
  });
  if (!device || !device.identityKeyPub || !device.registrationId || !device.signedPreKeyId || !device.signedPreKeyPub || !device.signedPreKeySig) {
    return res.status(404).json({ error: 'device_keys_missing' });
  }

  const otpk = await prisma.oneTimePreKey.findFirst({
    where: { deviceId, usedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  if (otpk) {
    await prisma.oneTimePreKey.update({ where: { id: otpk.id }, data: { usedAt: new Date() } });
  }

  return res.json({
    bundle: {
      deviceId: device.id,
      registrationId: device.registrationId,
      identityKeyPub: device.identityKeyPub,
      signedPreKey: { id: device.signedPreKeyId, pubKey: device.signedPreKeyPub, signature: device.signedPreKeySig },
      oneTimePreKey: otpk ? { id: otpk.keyId, pubKey: otpk.pubKey } : null,
    }
  });
});

// ===== Messaging =====
app.post('/messages/send', authMiddleware, async (req, res) => {
  const schema = z.object({
    senderDeviceId: z.string().min(10),
    recipientUserId: z.string().min(10),
    envelopes: z.array(z.object({
      recipientDeviceId: z.string().min(10),
      ciphertext: z.string().min(10),
    })).min(1).max(50),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request', details: parsed.error.flatten() });

  const senderUser = await ensureActiveUser(req.user.sub);
  const { senderDeviceId, recipientUserId, envelopes } = parsed.data;

  const senderDevice = await prisma.device.findFirst({ where: { id: senderDeviceId, userId: senderUser.id } });
  if (!senderDevice) return res.status(404).json({ error: 'sender_device_not_found' });

  const recipient = await prisma.user.findUnique({ where: { id: recipientUserId } });
  if (!recipient) return res.status(404).json({ error: 'recipient_not_found' });
  if (recipient.status !== AccountStatus.ACTIVE) return res.status(403).json({ error: 'recipient_unavailable' });

  // Verify recipient devices belong to recipient
  const recipientDeviceIds = envelopes.map(e => e.recipientDeviceId);
  const validCount = await prisma.device.count({ where: { id: { in: recipientDeviceIds }, userId: recipientUserId } });
  if (validCount !== recipientDeviceIds.length) return res.status(400).json({ error: 'invalid_recipient_device' });

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const env of envelopes) {
      rows.push(await tx.messageEnvelope.create({
        data: {
          senderUserId: senderUser.id,
          senderDeviceId,
          recipientUserId,
          recipientDeviceId: env.recipientDeviceId,
          ciphertext: env.ciphertext,
        }
      }));
    }
    return rows;
  });

  // notify via ws
  for (const env of created) notifyDevice(env.recipientDeviceId);

  return res.json({ ok: true, count: created.length });
});

app.get('/messages/pending', authMiddleware, async (req, res) => {
  const schema = z.object({
    deviceId: z.string().min(10),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  const u = await ensureActiveUser(req.user.sub);
  const { deviceId, limit } = parsed.data;

  const device = await prisma.device.findFirst({ where: { id: deviceId, userId: u.id } });
  if (!device) return res.status(404).json({ error: 'device_not_found' });

  const msgs = await prisma.messageEnvelope.findMany({
    where: { recipientDeviceId: deviceId, deliveredAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      senderUserId: true,
      senderDeviceId: true,
      recipientUserId: true,
      recipientDeviceId: true,
      ciphertext: true,
      createdAt: true,
    }
  });

  // mark delivered
  const ids = msgs.map(m => m.id);
  if (ids.length) {
    await prisma.messageEnvelope.updateMany({
      where: { id: { in: ids } },
      data: { deliveredAt: new Date() },
    });
  }

  await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });

  return res.json({ messages: msgs });
});

// ===== Admin =====
app.get('/admin/users', authMiddleware, adminOnly, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim(); // ACTIVE/FROZEN/BLOCKED or empty
  const where = {};
  if (q) where.OR = [{ username: { contains: q, mode: 'insensitive' } }, { id: { contains: q } }];
  if (status && ['ACTIVE', 'FROZEN', 'BLOCKED'].includes(status)) where.status = status;

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: { id: true, username: true, displayName: true, role: true, status: true, createdAt: true },
    take: 200,
  });
  return res.json({ users });
});

app.post('/admin/users/:id/status', authMiddleware, adminOnly, async (req, res) => {
  const schema = z.object({ status: z.enum(['ACTIVE', 'FROZEN', 'BLOCKED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const userId = req.params.id;
  const u = await prisma.user.update({ where: { id: userId }, data: { status: parsed.data.status }, select: { id: true, status: true } });
  return res.json({ user: u });
});

app.post('/admin/users/:id/password', authMiddleware, adminOnly, async (req, res) => {
  const schema = z.object({ newPassword: z.string().min(8).max(128) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const userId = req.params.id;
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return res.json({ ok: true });
});

app.post('/admin/invites', authMiddleware, adminOnly, async (req, res) => {
  const schema = z.object({
    ttlHours: z.number().int().min(1).max(24*365).default(Number(process.env.INVITE_DEFAULT_TTL_HOURS || 168)),
    maxUses: z.number().int().min(1).max(1000).default(1),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  const code = nanoid(10);
  const expiresAt = new Date(Date.now() + parsed.data.ttlHours * 3600 * 1000);

  const invite = await prisma.inviteCode.create({
    data: { code, expiresAt, maxUses: parsed.data.maxUses },
  });
  return res.json({ invite });
});

app.get('/admin/invites', authMiddleware, adminOnly, async (req, res) => {
  const invites = await prisma.inviteCode.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  return res.json({ invites });
});

// ===== Error handling =====
app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large' });
  console.error(err);
  return res.status(500).json({ error: 'server_error' });
});

// ===== WebSocket notify =====
const server = app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ noServer: true });

/**
 * Map: deviceId -> Set<ws>
 */
const deviceSockets = new Map();

function notifyDevice(deviceId) {
  const set = deviceSockets.get(deviceId);
  if (!set) return;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'notify', deviceId }));
    }
  }
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') return socket.destroy();

  const token = url.searchParams.get('token');
  const deviceId = url.searchParams.get('deviceId');
  if (!token || !deviceId) return socket.destroy();

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return socket.destroy();
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.user = decoded;
    ws.deviceId = deviceId;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', async (ws) => {
  try {
    const userId = ws.user?.sub;
    if (!userId) return ws.close();

    const device = await prisma.device.findFirst({ where: { id: ws.deviceId, userId } });
    if (!device) return ws.close();

    const set = deviceSockets.get(ws.deviceId) || new Set();
    set.add(ws);
    deviceSockets.set(ws.deviceId, set);

    ws.on('close', () => {
      const s = deviceSockets.get(ws.deviceId);
      if (s) {
        s.delete(ws);
        if (s.size === 0) deviceSockets.delete(ws.deviceId);
      }
    });

    ws.send(JSON.stringify({ type: 'hello', deviceId: ws.deviceId }));
  } catch {
    try { ws.close(); } catch {}
  }
});
