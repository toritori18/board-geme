-- 認証エンドポイントのレート制限用テーブル・関数の作成 + RLS の有効化
-- Supabase の SQL Editor で実行してください
--
-- ホスティングは Vercel（サーバーレス）であり、インスタンスごとにメモリが
-- 独立しているため、インメモリの Map ではレート制限が実効性を持たない。
-- このテーブルと RPC 関数（consume_auth_attempt / reset_auth_attempt）に
-- カウンタを一元管理させ、src/utils/rate-limit.ts からのみ呼び出す。
--
-- CREATE TABLE IF NOT EXISTS・CREATE OR REPLACE FUNCTION・
-- ALTER TABLE ENABLE ROW LEVEL SECURITY はいずれも冪等な操作であり、
-- このファイルは何度実行しても安全である
-- （REVOKE も、対象の権限が既に無い場合は NOTICE が出るだけでエラーにはならない）。

-- T_AUTH_ATTEMPT: ログイン・パスワードリセットの試行回数カウンタ
-- attempt_key はエンドポイント種別・キー種別（ip/email）・値を連結した識別子
-- （例: "login:ip:203.0.113.1"）。メールアドレスは平文で保存せず、
-- アプリ側（src/utils/rate-limit.ts）で小文字化のうえ SHA-256 ハッシュ化してから
-- 渡す。このテーブルに平文のメールアドレス一覧を溜めないための措置。
CREATE TABLE IF NOT EXISTS public."T_AUTH_ATTEMPT" (
  attempt_key   TEXT        PRIMARY KEY,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER     NOT NULL DEFAULT 0
);

-- ============================================================
-- RLS（Row Level Security）の有効化
-- ============================================================

-- 背景:
-- NEXT_PUBLIC_SUPABASE_ANON_KEY はクライアントバンドルに含まれる公開情報であり、
-- RLS が無効な状態では anon キーだけでこのテーブルを select / update できてしまう。
-- RLS を有効化し、anon キーからの到達を塞ぐ（create_game_tables.sql と同じ方針）。
-- なお Supabase の SQL Editor で作成したテーブルは RLS が自動有効化されない。

-- 意図的にポリシーは1つも作成しない（create_game_tables.sql と同じ方針）。
-- アプリからのアクセスは下記の RPC 関数経由のみであり、その呼び出しは
-- service role クライアント（src/utils/supabase-admin.ts）からのみ行う。
-- service role は RLS を常にバイパスするため、ポリシー未作成のままで機能する。
ALTER TABLE public."T_AUTH_ATTEMPT" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- consume_auth_attempt: 試行回数を1つ消費し、上限判定を返す
-- ============================================================
--
-- アプリ側で read → 判定 → write の3段階に分けると、ほぼ同時に届いた複数
-- リクエストが同じカウント値を読み、どちらも「まだ上限未満」と判定して
-- 両方通してしまう競合が起きる。INSERT ... ON CONFLICT DO UPDATE で
-- 読み取りと更新を1文にまとめることで、行ロックにより同時実行でも
-- 直列に処理されるようにする。
--
-- 窓（window_start から p_window_seconds 秒間）が期限切れであれば
-- window_start を今に切り直し、カウントを1から数え直す。
-- 期限内であればカウントをインクリメントするだけに留める。
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

-- PostgreSQL は新規関数の EXECUTE 権限を既定で PUBLIC に与える。
-- そのままだと anon キーからも RPC を叩けてしまい、カウンタを故意に消費して
-- 他人（あるいは無関係なIP）をロックアウトする攻撃が成立するため、
-- PUBLIC・anon・authenticated から明示的に剥奪する。
--
-- 剥奪した直後に service_role へ明示的に GRANT する。
-- 既存の Supabase プロジェクトでは public スキーマの新規関数に対して
-- anon / authenticated / service_role へ EXECUTE が既定で自動付与されるが
-- （https://supabase.com/docs/guides/api/securing-your-api）、
-- Supabase はこの自動付与を廃止する方向に変更しており、2026年5月30日以降に
-- 作成される新規プロジェクトでは opt-out が既定になる
-- （https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically）。
-- 後者の環境では service_role への明示付与が無く、EXECUTE は PUBLIC 経由でしか
-- 得られていないため、REVOKE ... FROM PUBLIC だけを実行するとアプリ自身
-- （service role クライアント経由の呼び出し）まで締め出してしまう。
-- しかも src/utils/rate-limit.ts の呼び出し側は RPC 失敗時に fail-open
-- （通す）設計のため、この締め出しはエラーにならず、レート制限が無音のまま
-- 効かなくなるだけという最悪の壊れ方をする。既定の権限付与に依存せず、
-- どちらの環境でも成立するよう明示的に GRANT しておく。
REVOKE EXECUTE ON FUNCTION public.consume_auth_attempt(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_attempt(TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================================
-- reset_auth_attempt: カウンタをリセットする
-- ============================================================
--
-- ログイン成功時に呼び出す。打ち間違いが数回続いた後に正しいパスワードで
-- ログインできた正規ユーザーが、その後の別の試行で締め出されないようにするため。
CREATE OR REPLACE FUNCTION public.reset_auth_attempt(p_key TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM public."T_AUTH_ATTEMPT" WHERE attempt_key = p_key;
$$;

-- consume_auth_attempt と同じ理由（上記コメント参照）で、
-- PUBLIC・anon・authenticated から剥奪したうえで service_role へ明示的に GRANT する。
REVOKE EXECUTE ON FUNCTION public.reset_auth_attempt(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_auth_attempt(TEXT) TO service_role;

-- ============================================================
-- 運用: 古い行の削除
-- ============================================================
--
-- 期限切れの行が残っていても consume_auth_attempt が窓を切り直すため
-- レート制限の判定自体には影響しないが、放置するとテーブルが肥大化する。
-- 定期的に（手動または cron で）以下を実行して古い行を削除すること。
--
-- DELETE FROM public."T_AUTH_ATTEMPT" WHERE window_start < NOW() - INTERVAL '1 day';
