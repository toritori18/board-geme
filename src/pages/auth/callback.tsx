import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/utils/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          // M_USER にレコードが存在しない場合は作成する
          await fetch("/api/auth/google-callback", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
            },
          });

          // セッション情報をセッションストレージに保存（既存ログインとの互換性）
          sessionStorage.setItem("user", JSON.stringify({
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name ?? session.user.email?.split("@")[0] ?? "",
          }));

          subscription.unsubscribe();
          router.push("/ranking");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
      <p className="text-gray-500 text-sm">認証処理中...</p>
    </div>
  );
}
