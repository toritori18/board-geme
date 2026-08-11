import crypto from "crypto";
import type { NextApiRequest } from "next";
import { supabaseAdmin } from "@/utils/supabase-admin";

/**
 * ログイン・パスワードリセットの試行回数を制限するユーティリティ。
 *
 * ホスティングは Vercel（サーバーレス）であり、インスタンスごとにメモリが
 * 独立しているため、インメモリの Map ではレート制限が実効性を持たない。
 * Supabase の T_AUTH_ATTEMPT テーブルと RPC 関数（consume_auth_attempt /
 * reset_auth_attempt。docs/sql/create_auth_attempt_table.sql 参照）に
 * カウンタを一元管理させる。
 */

export type RateLimitRule = {
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

// 以下の閾値は出典のあるものではなく、このプロジェクトの初期値である。
// 何らかの規格・仕様に基づく値ではなく、運用状況を見ながら調整する前提で置いている。
export const LOGIN_EMAIL_RULE: RateLimitRule = { limit: 5, windowSeconds: 15 * 60 };
export const LOGIN_IP_RULE: RateLimitRule = { limit: 20, windowSeconds: 15 * 60 };
export const FORGOT_PASSWORD_EMAIL_RULE: RateLimitRule = { limit: 3, windowSeconds: 60 * 60 };
export const FORGOT_PASSWORD_IP_RULE: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };

/**
 * リクエスト元のIPアドレスを取得する。
 *
 * Vercel は x-forwarded-for にクライアントの公開IPを設定し、なりすまし防止のため
 * 外部（クライアントやプロキシ）から送られてきた値を上書きする
 * （https://vercel.com/docs/headers/request-headers）。そのためこのヘッダの値は
 * レート制限のキーとして信頼してよい。
 * ローカル開発ではこのヘッダが付かないため、ソケットのアドレスにフォールバックする。
 */
export function getClientIp(req: NextApiRequest): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = firstValue?.split(",")[0]?.trim();
  return ip || req.socket.remoteAddress || "unknown";
}

/**
 * メールアドレスをレート制限のキーに使う際のハッシュ化。
 * T_AUTH_ATTEMPT に平文のメールアドレス一覧を溜めないよう、
 * 小文字化してから SHA-256 でハッシュ化する。
 */
export function hashEmailForRateLimit(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

type ConsumeAuthAttemptRow = {
  allowed: boolean;
  retry_after_seconds: number;
};

/**
 * 指定したキーの試行回数を1つ消費し、上限に達しているかを判定する。
 *
 * RPC 自体が失敗した場合（DB接続障害等）は fail-open（通す）とし、
 * console.error に記録する。src/utils/session.ts の認可判定が fail-closed
 * なのとは逆方向だが、これは認可の可否を判定するロジックではなく攻撃緩和策であり、
 * DB の一時的な障害がそのままログイン・パスワードリセットの全面停止に化けるほうが
 * 利用者への実害が大きいため、意図的に逆方向にしている。
 */
export async function consumeAttempt(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc("consume_auth_attempt", {
    p_key: key,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    console.error("レート制限カウンタの更新に失敗しました:", error);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // consume_auth_attempt は RETURNS TABLE の関数のため、1行しか返らない場合でも
  // supabase-js の rpc() は常に配列を返す。Database の型定義（generated types）を
  // 導入していないプロジェクトのため、戻り値の形が保証されている前提でキャストする。
  const rows = data as ConsumeAuthAttemptRow[] | null;
  const row = rows?.[0];
  if (!row) {
    console.error("レート制限カウンタの応答が空でした。");
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
}

/**
 * 指定したキーの試行回数カウンタを消す。
 * ログイン成功時に呼び、打ち間違いが続いた正規ユーザーがその後の操作で
 * 締め出されないようにする。RPC が失敗してもログイン自体は継続してよいため、
 * ここでも fail-open とし console.error に記録するのみに留める。
 */
export async function resetAttempt(key: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("reset_auth_attempt", { p_key: key });
  if (error) {
    console.error("レート制限カウンタのリセットに失敗しました:", error);
  }
}
