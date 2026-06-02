import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "@/utils/supabase";
import { validatePassword, PASSWORD_POLICY_DESCRIPTION } from "@/utils/password-policy";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase がURLハッシュのトークンを処理してセッションを確立するのを待つ
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password || !confirm) {
      setError("すべての項目を入力してください。");
      return;
    }
    if (password !== confirm) {
      setError("パスワードが一致しません。");
      return;
    }
    const policyError = validatePassword(password);
    if (policyError) {
      setError(policyError);
      return;
    }

    setLoading(true);

    // Supabase Auth のパスワードを更新
    const { error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      setError("パスワードの更新に失敗しました。リセットメールを再度お送りください。");
      setLoading(false);
      return;
    }

    // M_USER テーブルのパスワードハッシュも更新（セッショントークンをヘッダーで渡す）
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ password }),
    });
    const data = await res.json() as { success: boolean };

    setLoading(false);

    if (!data.success) {
      setError("パスワードの更新に失敗しました。");
      return;
    }

    setSuccess("パスワードを更新しました。ログインページに移動します。");
    setTimeout(() => router.push("/"), 2000);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-500 text-sm">リセットリンクを確認中...</p>
          <p className="text-xs text-gray-400 mt-2">
            このページにはメールのリンクからアクセスしてください。
          </p>
          <Link href="/" className="text-indigo-500 hover:underline text-xs mt-4 block">
            ログインに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/boardgemeTop.png" alt="ボードゲームランキング" className="w-16 h-16 mb-4 rounded-2xl shadow-lg object-cover" />
          <h1 className="text-2xl font-bold text-gray-900">新しいパスワードの設定</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">{PASSWORD_POLICY_DESCRIPTION}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="例: Password1!"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（確認）</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="もう一度入力"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            {success && (
              <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg transition text-sm"
            >
              {loading ? "更新中..." : "パスワードを更新"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
