import 'server-only';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';
import { z } from 'zod';
import { readObject, writeObject, ConflictError } from './storage';
import { HttpError } from './http';

const derive = promisify(scrypt);
const authKey = 'cms/owner.sealed';
const cookieName = 'chaika_owner';
const lifetime = 8 * 60 * 60;
const windowMs = 15 * 60 * 1000;
const authSchema = z.object({
  purpose: z.literal('owner-record'), passwordHash: z.string(), version: z.string(),
  attempts: z.number().int().nonnegative(), windowStart: z.number(),
  sessions: z.array(z.object({ id: z.string(), expires: z.number() })),
});
type AuthState = z.infer<typeof authSchema>;
type Session = { purpose: 'owner-session'; id: string; version: string; expires: number };
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Session secret is not configured');
  return value;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
async function matches(password: string, encoded: string) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) throw new Error('Invalid password configuration');
  const [salt, hash] = encoded.split(':');
  return timingSafeEqual(await derive(password, salt, 64) as Buffer, Buffer.from(hash, 'hex'));
}
async function readAuth() {
  const stored = await readObject(authKey);
  if (stored) {
    const data = await unsealData<unknown>(stored.body, { password: secret(), ttl: 0 });
    return { state: authSchema.parse(data), etag: stored.etag };
  }
  const passwordHash = process.env.OWNER_PASSWORD_HASH;
  if (!passwordHash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) throw new Error('Owner password is not configured');
  secret();
  return { state: { purpose: 'owner-record', passwordHash, version: 'initial', attempts: 0, windowStart: Date.now(), sessions: [] } as AuthState, etag: null };
}
async function mutateAuth(update: (current: AuthState) => AuthState) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readAuth();
    const next = update(current.state);
    const body = await sealData(next, { password: secret(), ttl: 0 });
    try { await writeObject(authKey, body, { expected: current.etag, type: 'application/octet-stream' }); return next; }
    catch (error) { if (!(error instanceof ConflictError) || attempt === 4) throw error; }
  }
  throw new ConflictError();
}
async function reservePasswordAttempt() {
  return mutateAuth((state) => {
    const reset = Date.now() - state.windowStart >= windowMs;
    const attempts = reset ? 0 : state.attempts;
    if (attempts >= 8) throw new HttpError(429, 'Слишком много попыток. Подождите 15 минут и попробуйте снова.');
    return { ...state, attempts: attempts + 1, windowStart: reset ? Date.now() : state.windowStart };
  });
}
async function setSession(session: Session | null) {
  const jar = await cookies();
  jar.set(cookieName, session ? await sealData(session, { password: secret(), ttl: lifetime }) : '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: session ? lifetime : 0,
  });
}
function newSession(version: string): Session { return { purpose: 'owner-session', id: randomUUID(), version, expires: Date.now() + lifetime * 1000 }; }
function assertActive(state: AuthState, session: Session) {
  if (state.version !== session.version || session.expires <= Date.now() || !state.sessions.some((entry) => entry.id === session.id && entry.expires > Date.now())) throw new HttpError(401, 'Войдите в админку заново');
}
export async function requireOwner() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) throw new HttpError(401, 'Войдите по паролю владельца');
  const session = await unsealData<Session>(value, { password: secret(), ttl: lifetime });
  if (session.purpose !== 'owner-session') throw new HttpError(401, 'Войдите в админку заново');
  assertActive((await readAuth()).state, session);
  return session;
}
const passwordInput = z.string().min(1).max(128);
export async function login(input: unknown) {
  const { password } = z.object({ password: passwordInput }).strict().parse(input);
  const attempted = await reservePasswordAttempt();
  if (!await matches(password, attempted.passwordHash)) throw new HttpError(401, 'Неверный пароль');
  const session = newSession(attempted.version);
  await mutateAuth((state) => {
    if (state.passwordHash !== attempted.passwordHash) throw new HttpError(401, 'Пароль изменён. Войдите заново.');
    return { ...state, attempts: 0, sessions: [...state.sessions.filter((entry) => entry.expires > Date.now()).slice(-4), { id: session.id, expires: session.expires }] };
  });
  await setSession(session);
}
export async function logout() {
  const session = await requireOwner();
  await mutateAuth((state) => ({ ...state, sessions: state.sessions.filter((entry) => entry.id !== session.id) }));
  await setSession(null);
}
export async function changePassword(input: unknown) {
  const session = await requireOwner();
  const data = z.object({ currentPassword: passwordInput, newPassword: z.string().min(12, 'Новый пароль — минимум 12 символов').max(128) }).strict().parse(input);
  const attempted = await reservePasswordAttempt();
  if (!await matches(data.currentPassword, attempted.passwordHash)) throw new HttpError(400, 'Текущий пароль неверный');
  const passwordHash = await hashPassword(data.newPassword);
  const nextSession = newSession(randomUUID());
  await mutateAuth((state) => {
    assertActive(state, session);
    if (state.passwordHash !== attempted.passwordHash) throw new ConflictError();
    return { ...state, passwordHash, version: nextSession.version, attempts: 0, sessions: [{ id: nextSession.id, expires: nextSession.expires }] };
  });
  await setSession(nextSession);
}
