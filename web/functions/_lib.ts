export interface Env {
  DB: D1Database;
  ADMIN_KEY: string;
  OWNER_KEY: string;
  REGISTER_PASSCODE: string;
  BACKEND_TOKEN: string;
  SA_EMAIL: string;
  GH_TOKEN: string;
  GH_REPO: string;
  GH_WORKFLOW: string;
}

export type Role = 'owner' | 'admin' | null;

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  });
}

export function extractDriveFolderId(url: string): string | null {
  if (!url) return null;
  const t = url.trim();
  const m1 = t.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = t.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t)) return t;
  return null;
}

export function extractSheetId(url: string): string | null {
  if (!url) return null;
  const t = url.trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(t)) return t;
  return null;
}

export function safeEq(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function getRole(req: Request, env: Env): Role {
  const headerKey = req.headers.get('x-admin-key') || '';
  if (env.OWNER_KEY && safeEq(headerKey, env.OWNER_KEY)) return 'owner';
  if (safeEq(headerKey, env.ADMIN_KEY)) {
    // when OWNER_KEY isn't configured, ADMIN_KEY implicitly becomes owner-level
    return env.OWNER_KEY ? 'admin' : 'owner';
  }
  return null;
}

export function isAdmin(req: Request, env: Env): boolean {
  return getRole(req, env) !== null;
}

export function isOwner(req: Request, env: Env): boolean {
  return getRole(req, env) === 'owner';
}

export function isBackend(req: Request, env: Env): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return safeEq(token, env.BACKEND_TOKEN);
}
