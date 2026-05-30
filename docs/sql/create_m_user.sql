-- M_USER テーブル作成
-- Supabase の SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS public."M_USER" (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email        TEXT        UNIQUE NOT NULL,
  password_hash TEXT       NOT NULL,
  name         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- テスト用ユーザーの挿入例
-- パスワード "password123" を bcrypt でハッシュ化した値を使用
-- 実際の hash は下記コマンドで生成: node -e "const b=require('bcryptjs');b.hash('password123',10).then(console.log)"
--
-- INSERT INTO public."M_USER" (email, password_hash, name)
-- VALUES ('test@example.com', '<bcrypt_hash_here>', 'テストユーザー');
