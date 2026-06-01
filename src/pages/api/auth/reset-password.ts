import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { supabase } from "@/utils/supabase";
import { supabaseAdmin } from "@/utils/supabase-admin";
import { validatePassword } from "@/utils/password-policy";

type ResetPasswordResponse = {
  success: boolean;
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResetPasswordResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { password } = req.body as { password: string };

  const policyError = validatePassword(password ?? "");
  if (policyError) {
    return res.status(400).json({ success: false, message: policyError });
  }

  // クッキーからセッションを取得してメールアドレスを特定
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ success: false, message: "認証情報がありません。" });
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);

  if (userError || !user?.email) {
    return res.status(401).json({ success: false, message: "セッションが無効です。" });
  }

  // M_USER テーブルのパスワードハッシュを更新
  const passwordHash = await bcrypt.hash(password, 10);
  const { error: dbError } = await supabaseAdmin
    .from("M_USER")
    .update({ password_hash: passwordHash })
    .eq("email", user.email);

  if (dbError) {
    return res.status(500).json({
      success: false,
      message: "パスワードの更新に失敗しました。",
    });
  }

  return res.status(200).json({ success: true, message: "パスワードを更新しました。" });
}
