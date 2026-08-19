import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/utils/supabase";
import { supabaseAdmin } from "@/utils/supabase-admin";
import {
  consumeAttempt,
  getClientIp,
  hashEmailForRateLimit,
  FORGOT_PASSWORD_EMAIL_RULE,
  FORGOT_PASSWORD_IP_RULE,
} from "@/utils/rate-limit";

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

  // パスワードリセットメール送信を一時停止中。メール送信数の上限（メール配信の割り当て超過）に
  // 達したため、リクエストボディを読む前に打ち切る。
  // 再開する際は、上限が解消され次第この return を外すこと。
  return res.status(403).json({
    success: false,
    message: "現在、パスワードリセットを受け付けていません。",
  });

  // eslint-disable-next-line no-unreachable -- 再開時に戻せるよう既存ロジックを残している
  const { email } = req.body as { email: string };

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "メールアドレスを入力してください。",
    });
  }

  // M_USER の存在確認より前にカウンタを消費する。登録済みのときだけ数えると、
  // 429 が返るかどうかでアドレスの登録有無が外部から判別できてしまい、
  // このAPIが下で明示的に守っている「登録の有無を判別させない」方針が崩れるため。
  const emailKey = `forgot:email:${hashEmailForRateLimit(email)}`;
  const ipKey = `forgot:ip:${getClientIp(req)}`;
  const [emailLimit, ipLimit] = await Promise.all([
    consumeAttempt(emailKey, FORGOT_PASSWORD_EMAIL_RULE),
    consumeAttempt(ipKey, FORGOT_PASSWORD_IP_RULE),
  ]);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    const retryAfterSeconds = Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      message: "試行回数が多すぎます。しばらく経ってから再度お試しください。",
    });
  }

  // maybeSingle()は0件のとき data: null / error: null を返すため、
  // 「未登録」の場合と「本当のDB障害」を区別できる（.single()だと0件もエラーになり、
  // errorを見ないと両者が区別できず、DB障害時も「未登録」と同じ経路でメールを送らず
  // 成功を返してしまう）。
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("M_USER")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    // ここで500を返しても「登録の有無をレスポンスから判別させない」方針（下記コメント）は
    // 崩れない。DB障害はアドレスがM_USERに存在するかどうかとは無関係に発生するため、
    // 500が返ったこと自体が登録有無の手がかりにはならない。
    return res.status(500).json({
      success: false,
      message: "処理中にエラーが発生しました。しばらく経ってから再度お試しください。",
    });
  }

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
