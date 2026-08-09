import crypto from "crypto";

/**
 * サーバー専用のセッションユーティリティ。
 *
 * 認証基盤（Supabase Auth と M_USER.password_hash の二重管理）の刷新は対象外。
 * 既存の M_USER + bcrypt によるログインの結果を、httpOnly Cookie 上に
 * HMAC-SHA256 署名付きトークンとして載せるだけの自前セッション実装。
 *
 * このファイルは Node.js の `crypto` に依存するため、クライアントコンポーネント
 * から import しないこと（クライアントバンドルに `crypto` が混入する）。
 */

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export const SESSION_COOKIE_NAME = "session";

// セッションの有効期限（秒）: 7日
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = SessionUser & { exp: number };

function getSecret(): string | undefined {
  return process.env.SESSION_SECRET;
}

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

/**
 * 署名を定数時間で比較する。
 * 長さが異なると timingSafeEqual が例外を投げるため、先に長さで判定する。
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.email === "string" &&
    typeof record.name === "string" &&
    typeof record.exp === "number"
  );
}

function buildCookieAttributes(): string[] {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") {
    attrs.push("Secure");
  }
  return attrs;
}

/**
 * セッショントークンを発行する。
 * SESSION_SECRET が未設定の場合は例外を投げる（弱い既定値へのフォールバックはしない）。
 */
export function createSessionToken(user: SessionUser): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET が設定されていません。");
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload: SessionPayload = { ...user, exp };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(body, secret);
  return `${body}.${signature}`;
}

/** ログイン用の Set-Cookie ヘッダ値を組み立てる。 */
export function buildSessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    ...buildCookieAttributes(),
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ].join("; ");
}

/** セッションを破棄するための Set-Cookie ヘッダ値を組み立てる。 */
export function buildExpiredSessionCookie(): string {
  return [`${SESSION_COOKIE_NAME}=`, ...buildCookieAttributes(), "Max-Age=0"].join("; ");
}

/**
 * リクエストの Cookie からセッションユーザーを取得する。
 * 鍵未設定・署名不一致・期限切れ・JSON破損など検証に失敗した場合は、
 * 例外を投げず必ず null（未ログイン扱い）を返す（fail-closed）。
 */
export function getSessionUser(req: {
  cookies: Partial<Record<string, string>>;
}): SessionUser | null {
  const secret = getSecret();
  if (!secret) return null;

  const token = req.cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expectedSignature = sign(body, secret);
  if (!safeCompare(signature, expectedSignature)) return null;

  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const payload: unknown = JSON.parse(json);
    if (!isSessionPayload(payload)) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { id: payload.id, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}
