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

  // 新規登録を一時停止中。認証もレート制限も無いまま招待メール送信APIを
  // 誰でも呼べる状態だったため、リクエストボディを読む前に打ち切る。
  // 再開する際は、許可リストまたはレート制限を導入してからこの return を外すこと。
  return res.status(403).json({
    success: false,
    message: "現在、新規登録を受け付けていません。",
  });

  // eslint-disable-next-line no-unreachable -- 登録再開時に戻せるよう既存ロジックを残している
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
    // 到達不能コードでは TypeScript の型の絞り込みが効かず error が
    // Error | null のままになるため、?. で null を許容しておく
    if (error?.message.includes("already been registered")) {
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
