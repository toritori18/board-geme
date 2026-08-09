/**
 * クライアントから呼び出すログアウト用ヘルパー。
 * サーバー専用の `@/utils/session`（Node の `crypto` に依存）とは
 * クライアントバンドル混入を避けるため必ず別ファイルにする。
 */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // ネットワークエラー等でCookie破棄に失敗しても、呼び出し元でログイン画面へ遷移させる
  }
}
