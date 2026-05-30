import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/utils/supabase-admin";

type MUser = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
};

type LoginResponse = {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LoginResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "メールアドレスとパスワードを入力してください。",
    });
  }

  const { data: user, error } = await supabaseAdmin
    .from("M_USER")
    .select("id, email, name, password_hash")
    .eq("email", email)
    .single<MUser>();

  if (error || !user) {
    return res.status(401).json({
      success: false,
      message: "メールアドレスまたはパスワードが正しくありません。",
    });
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: "メールアドレスまたはパスワードが正しくありません。",
    });
  }

  return res.status(200).json({
    success: true,
    message: "ログイン成功",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
}
