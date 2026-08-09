import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import { supabase } from "@/utils/supabase";
import { validatePassword, PASSWORD_POLICY_DESCRIPTION } from "@/utils/password-policy";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");

  useEffect(() => {
    // Supabase がURLのトークンを処理してセッションを確立するのを待つ。
    // PASSWORD_RECOVERY はURLにトークンが載った初回アクセス時にしか発火せず、
    // リロード後は発火しない。購読時に必ず届く INITIAL_SESSION と
    // getSession() の2経路を足して、リロードでも復帰できるようにする。
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")
      ) {
        setStatus("ready");
      }
    });

    const init = async () => {
      // PKCE flow: リダイレクト時に ?code= が付与される場合は明示的に交換する
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          setStatus("ready");
          return;
        }
      }
      // getSession() は内部で初期化（URLのトークン処理）の完了を待つため、
      // ここで session が無ければリンクが無効・期限切れと判断してよい
      const { data: { session } } = await supabase.auth.getSession();
      // PASSWORD_RECOVERY を先に受け取っていた場合に invalid へ引き戻さない
      setStatus((prev) => (session ? "ready" : prev === "ready" ? prev : "invalid"));
    };

    init();

    return () => subscription.unsubscribe();
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

  if (status === "checking") {
    return (
      <>
        <Head>
          <title>パスワード再設定 | ボードゲームランキング</title>
        </Head>
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
      </>
    );
  }

  if (status === "invalid") {
    return (
      <>
        <Head>
          <title>パスワード再設定 | ボードゲームランキング</title>
        </Head>
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-gray-500 text-sm">
              リセットリンクが無効か、有効期限が切れています。
            </p>
            <Link
              href="/forgot-password"
              className="text-indigo-500 hover:underline text-xs mt-4 block"
            >
              パスワード再設定をやり直す
            </Link>
            <Link href="/" className="text-indigo-500 hover:underline text-xs mt-2 block">
              ログインに戻る
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>パスワード再設定 | ボードゲームランキング</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src="/img/boardgemeTop.png" alt="ボードゲームランキング" className="w-16 h-16 mb-4 rounded-2xl shadow-lg object-cover" />
            <h1 className="text-2xl font-bold text-gray-900">新しいパスワードの設定</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">{PASSWORD_POLICY_DESCRIPTION}</p>
              <div>
                <label htmlFor="reset-password-new" className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード</label>
                <input
                  id="reset-password-new"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="例: Password1!"
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                />
              </div>

              <div>
                <label htmlFor="reset-password-confirm" className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（確認）</label>
                <input
                  id="reset-password-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="もう一度入力"
                  autoComplete="new-password"
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
    </>
  );
}
