-- ボードゲーム関連テーブル作成
-- Supabase の SQL Editor で実行してください
-- 実行順序: M_USER → M_GAME_KIND → M_GAME_GENRE → T_GAME

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
