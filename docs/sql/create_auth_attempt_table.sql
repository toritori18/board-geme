-- 認証エンドポイントのレート制限用テーブル・関数 + RLS。Supabase の SQL Editor で実行する。
-- Vercel（サーバーレス）はインスタンスごとにメモリが独立するためインメモリの Map では
-- レート制限が効かない。カウンタを DB に一元化し、src/utils/rate-limit.ts からのみ呼び出す。
-- 各文は冪等なので何度実行しても安全（REVOKE も対象権限が無ければ NOTICE が出るだけ）。

-- T_AUTH_ATTEMPT: ログイン・パスワードリセットの試行回数カウンタ。
-- attempt_key の例は "login:ip:203.0.113.1"。平文のメールアドレスを溜めないよう、
-- アプリ側で小文字化のうえ SHA-256 ハッシュ化した値を渡す。
CREATE TABLE IF NOT EXISTS public."T_AUTH_ATTEMPT" (
  attempt_key   TEXT        PRIMARY KEY,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER     NOT NULL DEFAULT 0
);

-- === RLS の有効化 ===
-- anon キーはクライアントバンドルに含まれる公開情報のため、RLS 無効だと素通しになる。
-- Supabase の SQL Editor で作成したテーブルは RLS が自動有効化されない点に注意。
-- ポリシーは意図的に作成しない。アクセスは下記 RPC 経由のみで、呼び出すのは service role
-- クライアント（src/utils/supabase-admin.ts）であり、service role は常に RLS をバイパスする。
ALTER TABLE public."T_AUTH_ATTEMPT" ENABLE ROW LEVEL SECURITY;

-- === consume_auth_attempt: 試行回数を1つ消費し、上限判定を返す ===
-- read → 判定 → write に分けると、同時到着したリクエストが同じ値を読んで両方通る競合が起きる。
-- INSERT ... ON CONFLICT DO UPDATE で1文にまとめ、行ロックにより直列化する。
-- 窓（window_start から p_window_seconds 秒）が期限切れなら切り直して1から数え直す。
CREATE OR REPLACE FUNCTION public.consume_auth_attempt(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  INSERT INTO public."T_AUTH_ATTEMPT" AS t (attempt_key, window_start, attempt_count)
  VALUES (p_key, NOW(), 1)
  ON CONFLICT (attempt_key) DO UPDATE
    SET
      window_start = CASE
        WHEN t.window_start < NOW() - make_interval(secs => p_window_seconds)
          THEN NOW()
        ELSE t.window_start
      END,
      attempt_count = CASE
        WHEN t.window_start < NOW() - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE t.attempt_count + 1
      END
  RETURNING window_start, attempt_count INTO v_window_start, v_count;

  allowed := v_count <= p_limit;
  retry_after_seconds := GREATEST(
    0,
    p_window_seconds - EXTRACT(EPOCH FROM (NOW() - v_window_start))::INTEGER
  );

  RETURN NEXT;
END;
$$;

-- PostgreSQL は新規関数の EXECUTE を既定で PUBLIC に与えるため、そのままだと anon キーから
-- RPC を叩いてカウンタを故意に消費し、他人をロックアウトできてしまう。よって剥奪する。
-- 同時に service_role へ明示 GRANT する。Supabase は新規関数への自動付与を廃止する方向で、
-- 2026-05-30 以降に作成される新規プロジェクトでは opt-out が既定になる。その環境では
-- EXECUTE を PUBLIC 経由でしか得ておらず、REVOKE だけを実行するとアプリ自身が締め出される。
-- しかも rate-limit.ts は RPC 失敗時に fail-open のため、レート制限が無音で効かなくなる。
-- https://supabase.com/docs/guides/api/securing-your-api
-- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
REVOKE EXECUTE ON FUNCTION public.consume_auth_attempt(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_attempt(TEXT, INTEGER, INTEGER) TO service_role;

-- === reset_auth_attempt: カウンタをリセットする ===
-- ログイン成功時に呼ぶ。打ち間違いが数回続いた正規ユーザーが、その後の試行で
-- 締め出されないようにするため。
CREATE OR REPLACE FUNCTION public.reset_auth_attempt(p_key TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM public."T_AUTH_ATTEMPT" WHERE attempt_key = p_key;
$$;

-- consume_auth_attempt と同じ理由で、剥奪したうえで service_role へ明示 GRANT する。
REVOKE EXECUTE ON FUNCTION public.reset_auth_attempt(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_auth_attempt(TEXT) TO service_role;

-- === 運用: 古い行の削除 ===
-- 期限切れの行が残っても consume_auth_attempt が窓を切り直すため判定には影響しないが、
-- 放置するとテーブルが肥大化する。定期的に（手動または cron で）以下を実行する。
-- DELETE FROM public."T_AUTH_ATTEMPT" WHERE window_start < NOW() - INTERVAL '1 day';
