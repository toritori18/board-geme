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
  // 対症療法: 根本原因は Supabase Auth と M_USER.password_hash の二重管理であり、
  // その解消は今回の対象外。ここでは M_USER に該当行が無いケース（Supabase Auth
  // 側にのみ存在するユーザー）を検出できるよう、更新件数を確認するにとどめる。
  const passwordHash = await bcrypt.hash(password, 10);
  const { data: updatedRows, error: dbError } = await supabaseAdmin
    .from("M_USER")
    .update({ password_hash: passwordHash })
    .eq("email", user.email)
    .select("id");

  if (dbError) {
    return res.status(500).json({
      success: false,
      message: "パスワードの更新に失敗しました。",
    });
  }

  if (!updatedRows || updatedRows.length === 0) {
    return res.status(404).json({
      success: false,
      message: "アカウントが見つかりませんでした。",
    });
  }

  return res.status(200).json({ success: true, message: "パスワードを更新しました。" });
}
