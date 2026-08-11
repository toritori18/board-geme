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

  // 有効な Supabase Auth トークンを持っているだけでは「招待されたユーザー」であることの
  // 証明にならない（メールサインアップ等のセルフサインアップ経路が Supabase 側で開いていると、
  // 招待されていない人でもトークンを取得できてしまう）。M_USER は招待時にのみ行を作るため、
  // 該当行が無ければ招待経由ではないと判断し、ここで行を新規作成せず 403 で拒否する。
  // maybeSingle() は0件のとき data: null / error: null を返すため、
  // 「招待されていない」場合と「本当のDB障害」を区別できる（.single()だと0件もエラーになる）。
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("M_USER")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (existingError) {
    return res.status(500).json({ success: false, message: "パスワードの設定に失敗しました。" });
  }

  if (!existing) {
    return res.status(403).json({ success: false, message: "招待されていないため設定できません。" });
  }

  // 403判定より前で実行すると、招待されていないリクエストでも毎回 bcrypt の
  // コストがかかりCPUを焼く踏み台になるため、判定を通過した後に実行する。
  const passwordHash = await bcrypt.hash(password, 10);

  // 対症療法: 根本原因は Supabase Auth と M_USER.password_hash の二重管理であり、
  // その解消は今回の対象外。ここでは「ログインは M_USER.password_hash を見て行われる」
  // という事実に合わせ、M_USER を先に更新する。もし Auth 側の更新（このあと実行）が
  // 失敗しても、ログインに使う側は既に新パスワードになっているため、利用者は新しい
  // パスワードでログインできる。招待直後で Auth 側にまだパスワードが無い状態でも、
  // M_USER さえ更新されていればログインできるため、失敗の向きは同じく安全側に倒れる。
  const { error: updateError } = await supabaseAdmin
    .from("M_USER")
    .update({ password_hash: passwordHash })
    .eq("email", user.email);

  if (updateError) {
    return res.status(500).json({ success: false, message: "パスワードの設定に失敗しました。" });
  }

  // Supabase Auth 側のパスワードも設定する。ここで渡す user.id は
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
    console.error("Supabase Auth側のパスワード設定に失敗しました:", authUpdateError);
  }

  return res.status(200).json({ success: true, message: "パスワードを設定しました。" });
}
