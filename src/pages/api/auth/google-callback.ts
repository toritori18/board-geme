import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/utils/supabase";
import { supabaseAdmin } from "@/utils/supabase-admin";

type GoogleCallbackResponse = {
  success: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GoogleCallbackResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false });
  }

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ success: false });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email) {
    return res.status(401).json({ success: false });
  }

  // M_USER に未登録の場合のみ挿入
  const { data: existing } = await supabaseAdmin
    .from("M_USER")
    .select("id")
    .eq("email", user.email)
    .single();

  if (!existing) {
    const userName = (user.user_metadata?.full_name as string | undefined)
      ?? user.email.split("@")[0];

    await supabaseAdmin.from("M_USER").insert({
      email: user.email,
      user_name: userName,
      password_hash: "",
    });
  }

  return res.status(200).json({ success: true });
}
