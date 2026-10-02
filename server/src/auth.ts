import crypto from "node:crypto";
import { getSetting, setSetting, deleteSetting } from "./db.js";
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const sessions = new Map<string, number>();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

export function hasAdmin(): boolean {
  return getSetting("admin_password") !== null;
}

export function setAdminPassword(password: string) {
  setSetting("admin_password", hashPassword(password));
}

export function login(password: string): string | null {
  const stored = getSetting("admin_password");
  if (!stored || !verifyPassword(password, stored)) return null;
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now());
  return token;
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  const ts = sessions.get(token);
  if (!ts) return false;
  if (Date.now() - ts > SESSION_TTL) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now()); // sliding expiry
  return true;
}

export function verifySetupToken(token: string | undefined): boolean {
  const expected = process.env.STAFFUP_SETUP_TOKEN;
  if (!expected) return true; // no token configured
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function logout(token: string | undefined) {
  if (token) sessions.delete(token);
}

export { deleteSetting };