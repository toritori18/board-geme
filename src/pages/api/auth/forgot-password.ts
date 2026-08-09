import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/utils/supabase";
import { supabaseAdmin } from "@/utils/supabase-admin";

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

  const { data: existing } = await supabaseAdmin
    .from("M_USER")
    .select("id")
    .eq("email", email)
    .single();

  // 登録の有無をレスポンスから判別できると、任意のアドレスが登録済みかを
  // 外部から総当たりで確認できてしまう（login.ts と同じ方針）。
  // 未登録の場合はメールを送らないが、返す内容は成功時と完全に同一にする。
  const successMessage = "パスワードリセットのメールを送信しました。メールをご確認ください。";

  if (!existing) {
    return res.status(200).json({ success: true, message: successMessage });
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

  return res.status(200).json({ success: true, message: successMessage });
}
