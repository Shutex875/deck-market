import { createHash, randomBytes } from 'node:crypto';
import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../services/passwords';

const cookieName = 'bastdecks_session';
const sessionDuration = 14 * 24 * 60 * 60 * 1000;
const username = z.string().max(128)
  .transform(value => value.normalize('NFKC').trim().toLowerCase())
  .pipe(z.string().min(3).max(32).regex(/^[\p{L}\p{N}_.-]+$/u));
const password = z.string().min(8).max(128);
const credentials = z.object({ username, password });
const profileUpdate = z.object({
  username: username.optional(),
  currentPassword: password,
  newPassword: password.optional(),
});
const publicUser = { id: true, username: true, isAdmin: true } as const;

function sessionUser(user: { id: string; username: string; isAdmin: boolean }) {
  const isOwner = user.id === process.env.CATALOG_OWNER_ID;
  return { id: user.id, username: user.username, isOwner, canManageCatalog: isOwner || user.isAdmin === true };
}

export const requireCatalogOwner: RequestHandler = (_req, res, next) => {
  if (res.locals.user?.canManageCatalog !== true) {
    return res.status(403).json({ error: 'Требуются права администратора' });
  }
  next();
};

function hasPrismaCode(error: unknown, code: string) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}

function tokenHash(req: Request): string | undefined {
  const token = req.headers.cookie?.match(/(?:^|;\s*)bastdecks_session=([0-9a-f]{64})(?:;|$)/)?.[1];
  return token ? createHash('sha256').update(token).digest('hex') : undefined;
}

function newSession() {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + sessionDuration),
    },
  };
}

function cookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure || process.env.COOKIE_SECURE === 'true',
    path: '/api',
  };
}

const protectAuthAttempts = (): RequestHandler => {
  const period = 10 * 60 * 1000;
  let nextCleanup = 0;
  const attempts = new Map<string, { count: number; reset: number }>();
  return (req, res, next) => {
    const now = Date.now();
    if (now >= nextCleanup) {
      for (const [ip, attempt] of attempts) if (attempt.reset <= now) attempts.delete(ip);
      nextCleanup = now + period;
    }
    const key = req.ip ?? 'unknown';
    const attempt = attempts.get(key);
    if (attempt && attempt.reset > now) {
      if (attempt.count >= 25) {
        res.setHeader('Retry-After', Math.ceil((attempt.reset - now) / 1000));
        return res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' });
      }
      attempt.count++;
    } else {
      attempts.set(key, { count: 1, reset: now + period });
    }
    next();
  };
};

export const protectApi: RequestHandler = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-BastDecks-Request') !== '1') {
    return res.status(403).json({ error: 'Request verification failed' });
  }
  next();
};

export function requireSession(prisma: PrismaClient): RequestHandler {
  return async (req, res, next) => {
    const hash = tokenHash(req);
    const session = hash && await prisma.session.findUnique({
      where: { tokenHash: hash },
      select: { expiresAt: true, user: { select: publicUser } },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      res.setHeader('X-BastDecks-Session', 'expired');
      return res.status(401).json({ error: 'Войдите в систему' });
    }
    res.locals.user = sessionUser(session.user);
    next();
  };
}

export function userId(res: Response): string {
  const id = res.locals.user?.id;
  if (typeof id !== 'string' || !id) throw new Error('Authenticated user is missing');
  return id;
}

export function createAuthRouter(prisma: PrismaClient): Router {
  const router = Router();
  const limit = protectAuthAttempts();
  const sessionRequired = requireSession(prisma);

  router.post('/register', limit, async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Логин: 3–32 символа. Пароль: 8–128 символов.' });
    }
    const { username, password } = parsed.data;
    const session = newSession();
    try {
      const user = await prisma.user.create({
        data: {
          username,
          passwordHash: await hashPassword(password),
          sessions: { create: session.data },
        },
        select: publicUser,
      });
      res.cookie(cookieName, session.token, { ...cookieOptions(req), maxAge: sessionDuration });
      return res.status(201).json(sessionUser(user));
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Этот логин уже занят' });
      }
      throw error;
    }
  });

  router.post('/login', limit, async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    const invalid = { error: 'Неверный логин или пароль' };
    if (!parsed.success) return res.status(401).json(invalid);

    const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (!await verifyPassword(parsed.data.password, user?.passwordHash) || !user) {
      return res.status(401).json(invalid);
    }
    const session = newSession();
    const previous = tokenHash(req);
    try {
      await prisma.user.update({
        where: { id: user.id, username: user.username, passwordHash: user.passwordHash },
        data: { sessions: {
          deleteMany: { OR: [{ expiresAt: { lte: new Date() } }, ...(previous ? [{ tokenHash: previous }] : [])] },
          create: session.data,
        } },
        select: { id: true },
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2025')) return res.status(401).json(invalid);
      throw error;
    }
    res.cookie(cookieName, session.token, { ...cookieOptions(req), maxAge: sessionDuration });
    res.json(sessionUser(user));
  });

  router.get('/me', sessionRequired, (_req, res) => res.json(res.locals.user));
  router.patch('/me', sessionRequired, limit, async (req, res) => {
    const parsed = profileUpdate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Проверьте логин и пароль. Логин: 3–32 символа, пароль: 8–128 символов.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId(res) },
      select: { ...publicUser, passwordHash: true },
    });
    const { currentPassword, newPassword } = parsed.data;
    if (!await verifyPassword(currentPassword, user?.passwordHash) || !user) {
      return res.status(403).json({ error: 'Неверный текущий пароль' });
    }

    const nextUsername = parsed.data.username ?? user.username;
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'Новый пароль должен отличаться от текущего' });
    }
    if (nextUsername === user.username && !newPassword) {
      return res.json(sessionUser(user));
    }

    const session = newPassword ? newSession() : undefined;
    try {
      const updated = await prisma.user.update({
        where: { id: user.id, username: user.username, passwordHash: user.passwordHash },
        data: {
          username: nextUsername,
          ...(newPassword && session ? {
            passwordHash: await hashPassword(newPassword),
            sessions: {
              deleteMany: { tokenHash: { not: session.data.tokenHash } },
              create: session.data,
            },
          } : {}),
        },
        select: publicUser,
      });
      if (session) res.cookie(cookieName, session.token, { ...cookieOptions(req), maxAge: sessionDuration });
      res.json(sessionUser(updated));
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        return res.status(409).json({ error: 'Этот логин уже занят' });
      }
      if (hasPrismaCode(error, 'P2025')) {
        return res.status(409).json({ error: 'Профиль уже изменился. Обновите страницу и попробуйте снова.' });
      }
      throw error;
    }
  });
  router.post('/logout', async (req, res) => {
    const hash = tokenHash(req);
    if (hash) await prisma.session.deleteMany({ where: { tokenHash: hash } });
    res.clearCookie(cookieName, cookieOptions(req)).sendStatus(204);
  });

  return router;
}
