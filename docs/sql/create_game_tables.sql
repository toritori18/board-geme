-- ボードゲーム関連テーブル + RLS。Supabase の SQL Editor で実行する。
-- 実行順序: M_USER → M_GAME_KIND → M_GAME_GENRE → T_GAME → RLS の有効化
-- テーブル作成と RLS を1ファイルにまとめている。分けると新しい環境で RLS の適用を忘れ、
-- anon キーで M_USER.password_hash が読める状態のまま運用してしまうため。各文は冪等。

-- M_USER: ユーザーマスタ。Supabase Auth で認証後、bcrypt ハッシュを password_hash に保存
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

-- === RLS の有効化 ===
-- anon キーはクライアントバンドルに含まれる公開情報のため、RLS 無効だと M_USER.password_hash を
-- 含む全テーブルが素通しになる。Supabase の SQL Editor で作成したテーブルは自動有効化されない。
-- ポリシーは意図的に作成しない。データ取得・更新はサーバー側の service role クライアント
-- （src/utils/supabase-admin.ts）のみが行い、service role は常に RLS をバイパスするため
-- 画面の挙動は変わらない。anon から直接アクセスする要件が生じたときだけ、
-- 必要最小限の CREATE POLICY を個別に追加すること。
ALTER TABLE public."M_USER" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."M_GAME_KIND" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."M_GAME_GENRE" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."T_GAME" ENABLE ROW LEVEL SECURITY;

-- === 検証: RLS が有効か確認する（コメントのままなので実行されない） ===
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('M_USER', 'M_GAME_KIND', 'M_GAME_GENRE', 'T_GAME');
--
-- 全行 rowsecurity = true なら成功。tablename は識別子ではなく値の比較のため単一引用符で囲む。
-- 併せて anon キーでの select が 401 になることも確認する。ただし `permission denied for table`
-- はテーブル権限（GRANT）による拒否で RLS の裏付けにはならないため、上の pg_tables と2つセットで見る。
