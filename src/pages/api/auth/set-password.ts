import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { supabase } from "@/utils/supabase";
import { supabaseAdmin } from "@/utils/supabase-admin";
import { validatePassword } from "@/utils/password-policy";

type SetPasswordResponse = {
  success: boolean;
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetPasswordResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ success: false, message: "認証情報がありません。" });
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.email) {
    return res.status(401).json({ success: false, message: "セッションが無効です。" });
  }

  const { password } = req.body as { password: string };
  const policyError = validatePassword(password ?? "");
  if (policyError) {
    return res.status(400).json({ success: false, message: policyError });
  }

  const userName = (user.user_metadata?.user_name as string | undefined)
    ?? user.email.split("@")[0];

  const passwordHash = await bcrypt.hash(password, 10);

  // M_USER に未登録であれば挿入、登録済みであればパスワードハッシュを更新
  const { data: existing } = await supabaseAdmin
    .from("M_USER")
    .select("id")
    .eq("email", user.email)
    .single();

  if (existing) {
    await supabaseAdmin
      .from("M_USER")
      .update({ password_hash: passwordHash })
      .eq("email", user.email);
  } else {
    const { error: dbError } = await supabaseAdmin.from("M_USER").insert({
      email: user.email,
      user_name: userName,
      password_hash: passwordHash,
    });

    if (dbError) {
      return res.status(500).json({ success: false, message: "アカウントの作成に失敗しました。" });
    }
  }

  return res.status(200).json({ success: true, message: "アカウントを作成しました。" });
}
