import { createClient } from "@supabase/supabase-js";

// サービスロールキーを使うクライアント（APIルート専用・クライアントサイドに公開しない）
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
