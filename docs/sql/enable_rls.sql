-- RLS（Row Level Security）の有効化
-- Supabase の SQL Editor で実行してください
-- 対象: create_game_tables.sql で作成した M_USER / M_GAME_KIND / M_GAME_GENRE / T_GAME の4テーブル

-- 背景:
-- NEXT_PUBLIC_SUPABASE_ANON_KEY はクライアントバンドルに含まれる公開情報であり、
-- RLS が無効な状態では anon キーだけで M_USER.password_hash を含む全テーブルを
-- select / update できてしまう。まず RLS を有効化し、anon キーからの到達を塞ぐ。

-- 意図的にポリシーは1つも作成しない。
-- アプリのデータ取得・更新は src/utils/supabase-admin.ts の service role クライアントが
-- サーバー側でのみ行っており、service role は RLS を常にバイパスする。
-- そのため anon 向けポリシーが無くても画面の挙動は現状どおりで、
-- ポリシー未作成のままにすることで anon キーからのアクセスを完全に遮断できる。
-- 将来 anon（クライアントサイド）から直接アクセスする要件が生じた場合のみ、
-- 必要最小限の CREATE POLICY を個別に追加すること。

-- ENABLE ROW LEVEL SECURITY は既に有効な場合に再実行してもエラーにならない冪等な操作である。
-- そのため、このファイルは何度実行しても安全である。

ALTER TABLE public."M_USER" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."M_GAME_KIND" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."M_GAME_GENRE" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."T_GAME" ENABLE ROW LEVEL SECURITY;

-- 検証用クエリ（RLS が有効化されているかを確認する）
-- テーブル名が大文字混じりのため、tablename の比較では二重引用符ではなく
-- 単一引用符で囲んだ文字列リテラルとして指定すること（識別子ではなく値の比較のため）。
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('M_USER', 'M_GAME_KIND', 'M_GAME_GENRE', 'T_GAME');
--
-- rowsecurity が全行 true になっていれば有効化は成功している。
