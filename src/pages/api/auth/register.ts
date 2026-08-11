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

  // set-password.ts は M_USER に該当行が無いユーザーを「招待されていない」と判断して
  // 403 で拒否する（招待制の回避経路を塞ぐための措置）。そのため招待メール送信の成功後に
  // ここで M_USER の行を先に作っておかないと、登録再開時に招待されたユーザー自身が
  // set-password で弾かれ、誰もパスワードを設定できなくなる。
  // 招待の成否が確定する前に行を作ると、招待に失敗した場合に孤児行が残るため、
  // 必ず inviteUserByEmail の成功後に insert する。
  const { error: dbError } = await supabaseAdmin.from("M_USER").insert({
    email,
    user_name: email.split("@")[0],
    password_hash: null,
  });

  if (dbError) {
    // 招待メールは既に送信済みのため、失敗をユーザーに隠して確認メールを送った体で
    // 返すと set-password が永遠に 403 を返し続ける事態に気付けない。ログに残したうえで
    // 500 を返し、招待メール自体は再送不要であることを運用側が把握できるようにする。
    console.error("M_USER への招待行作成に失敗しました:", dbError);
    return res.status(500).json({
      success: false,
      message: "登録処理に失敗しました。しばらく経ってから再度お試しください。",
    });
  }

  return res.status(200).json({
    success: true,
    message: "確認メールを送信しました。メール内のリンクからパスワードを設定してください。",
  });
}
