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

  // 対症療法: 根本原因は Supabase Auth と M_USER.password_hash の二重管理であり、
  // その解消は今回の対象外。ここでは「ログインは M_USER.password_hash を見て行われる」
  // という事実に合わせ、M_USER を先に更新する。もし Auth 側の更新（このあと実行）が
  // 失敗しても、ログインに使う側は既に新パスワードになっているため、利用者は新しい
  // パスワードでログインできる。逆順（Auth を先に更新）だと、M_USER 側の更新に
  // 失敗したときに画面は「失敗」と出るのに旧パスワードが有効なまま残ってしまう。
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

  // Supabase Auth 側のパスワードも更新する。ここで渡す user.id は
  // getUser() が返す Supabase Auth 側の UUID であり、M_USER.id
  // （gen_random_uuid() で採番される別のUUID）とは異なるので注意。
  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password,
  });

  if (authUpdateError) {
    // ここが失敗しても M_USER 側は既に更新済みで、ログインは新パスワードで
    // 通るため利用者の目的は達成されている。失敗を画面に出して再試行を促すと
    // 「新パスワードでログインできる」という実態と表示が食い違うため、200を返し
    // 障害はサーバーログにのみ残す。
    console.error("Supabase Auth側のパスワード更新に失敗しました:", authUpdateError);
  }

  return res.status(200).json({ success: true, message: "パスワードを更新しました。" });
}
