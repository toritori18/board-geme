import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/utils/supabase-admin";

type RegisterResponse = {
  success: boolean;
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RegisterResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { email } = req.body as { email: string };

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "メールアドレスを入力してください。",
    });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // 招待メールを送信（ユーザーはメールのリンクからパスワードを設定する）
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/set-password`,
  });

  if (error) {
    if (error.message.includes("already been registered")) {
      return res.status(409).json({
        success: false,
        message: "このメールアドレスはすでに登録されています。",
      });
    }
    return res.status(500).json({
      success: false,
      message: "メール送信に失敗しました。しばらく経ってから再度お試しください。",
    });
  }

  return res.status(200).json({
    success: true,
    message: "確認メールを送信しました。メール内のリンクからパスワードを設定してください。",
  });
}
