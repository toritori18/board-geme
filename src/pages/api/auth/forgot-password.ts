import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/utils/supabase";

type ForgotPasswordResponse = {
  success: boolean;
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ForgotPasswordResponse>
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

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/reset-password`,
  });

  if (error) {
    return res.status(500).json({
      success: false,
      message: "メール送信に失敗しました。しばらく経ってから再度お試しください。",
    });
  }

  // メールアドレスが存在しない場合も同じメッセージを返す（セキュリティ上の理由）
  return res.status(200).json({
    success: true,
    message: "パスワードリセットのメールを送信しました。メールをご確認ください。",
  });
}
