import type { NextApiRequest, NextApiResponse } from "next";
import { buildExpiredSessionCookie } from "@/utils/session";

type LogoutResponse = {
  success: boolean;
  message: string;
};

export default function handler(req: NextApiRequest, res: NextApiResponse<LogoutResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", buildExpiredSessionCookie());
  return res.status(200).json({ success: true, message: "ログアウトしました。" });
}
