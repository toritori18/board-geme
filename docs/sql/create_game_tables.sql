-- ボードゲーム関連テーブル作成 + RLS の有効化
-- Supabase の SQL Editor で実行してください
-- 実行順序: M_USER → M_GAME_KIND → M_GAME_GENRE → T_GAME → RLS の有効化
--
-- テーブル作成と RLS の有効化を1ファイルにまとめている。
-- 分けておくと新しい環境を作る際に RLS の適用を忘れ、公開キー（anon）で
-- M_USER.password_hash が読める状態のまま運用してしまうため。
-- CREATE TABLE IF NOT EXISTS も ENABLE ROW LEVEL SECURITY も冪等な操作であり、
-- このファイルは何度実行しても安全である。

-- M_USER: ユーザーマスタ
-- Supabase Auth で認証後、bcrypt ハッシュを password_hash に保存
CREATE TABLE IF NOT EXISTS public."M_USER" (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT        UNIQUE NOT NULL,
  user_name     TEXT        NOT NULL,
  password_hash TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- M_GAME_KIND: ゲーム種類マスタ
CREATE TABLE IF NOT EXISTS public."M_GAME_KIND" (
  id                SERIAL PRIMARY KEY,
  game_kind_name    TEXT NOT NULL UNIQUE,
  game_kind_name_ja TEXT
);

-- M_GAME_GENRE: ゲームジャンルマスタ
CREATE TABLE IF NOT EXISTS public."M_GAME_GENRE" (
  id                 SERIAL PRIMARY KEY,
  game_genre_name    TEXT NOT NULL UNIQUE,
  game_genre_name_ja TEXT
);

-- T_GAME: ゲームトランザクション
CREATE TABLE IF NOT EXISTS public."T_GAME" (
  id                  INTEGER PRIMARY KEY,
  game_name           TEXT        NOT NULL,
  game_name_ja        TEXT,
  year_published      INTEGER,
  min_players         INTEGER,
  max_players         INTEGER,
  play_time           INTEGER,
  min_age             INTEGER,
  users_rated         INTEGER,
  rating_average      NUMERIC(5, 2),
  bgg_rank            INTEGER,
  complexity_average  NUMERIC(4, 2),
  description_ja      TEXT,
  short_description_ja TEXT,
  game_type_id        INTEGER[],
  game_domain_id      INTEGER[],
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- RLS（Row Level Security）の有効化
-- ============================================================

-- 背景:
-- NEXT_PUBLIC_SUPABASE_ANON_KEY はクライアントバンドルに含まれる公開情報であり、
-- RLS が無効な状態では anon キーだけで M_USER.password_hash を含む全テーブルを
-- select / update できてしまう。RLS を有効化し、anon キーからの到達を塞ぐ。
-- なお Supabase の SQL Editor で作成したテーブルは RLS が自動有効化されない。

-- 意図的にポリシーは1つも作成しない。
-- アプリのデータ取得・更新は src/utils/supabase-admin.ts の service role クライアントが
-- サーバー側でのみ行っており、service role は RLS を常にバイパスする。
-- そのため anon 向けポリシーが無くても画面の挙動は現状どおりで、
-- ポリシー未作成のままにすることで anon キーからのアクセスを完全に遮断できる。
-- 将来 anon（クライアントサイド）から直接アクセスする要件が生じた場合のみ、
-- 必要最小限の CREATE POLICY を個別に追加すること。

ALTER TABLE public."M_USER" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."M_GAME_KIND" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."M_GAME_GENRE" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."T_GAME" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 検証用クエリ（RLS が有効化されているかを確認する）
-- ============================================================
--
-- 下のクエリはコメントアウトしてあるため、このファイルをそのまま実行しても走らない。
-- 確認したいときは SELECT 文だけを別途コピーして実行すること。
--
-- テーブル名が大文字混じりのため、tablename の比較では二重引用符ではなく
-- 単一引用符で囲んだ文字列リテラルとして指定すること（識別子ではなく値の比較のため）。
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('M_USER', 'M_GAME_KIND', 'M_GAME_GENRE', 'T_GAME');
--
-- rowsecurity が全行 true になっていれば有効化は成功している。
--
-- anon キーで各テーブルを select して HTTP 401 になることも併せて確認するとよい。
-- ただし `permission denied for table` は RLS ではなくテーブル権限（GRANT）による拒否であり、
-- RLS の有効化を裏付けるものではない。両者は独立した防御層であるため、
-- 上の pg_tables による確認と2つセットで行うこと。
