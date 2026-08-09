import { useState, FormEvent } from "react";
import Link from "next/link";
import Head from "next/head";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email) {
      setError("メールアドレスを入力してください。");
      return;
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { success: boolean; message: string };

    if (!data.success) {
      setError(data.message);
      return;
    }

    setSuccess(data.message);
  };

  return (
    <>
      <Head>
        <title>新規登録 | ボードゲームランキング</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <img src="/img/boardgemeTop.png" alt="ボードゲームランキング" className="w-full h-48 object-cover" />
            <div className="px-8 pt-6 pb-2">
              <h1 className="text-xl font-bold text-gray-900">ボードゲームランキング</h1>
              <p className="text-xs text-gray-500 mt-1">新規アカウントを作成する</p>
            </div>
            <div className="px-8 pt-4 pb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-6">会員登録</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  autoComplete="email"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              {success && (
                <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">{success}</p>
              )}

              {/* 登録停止中 */}
              <button
                type="submit"
                disabled={true}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg transition text-sm"
              >
                現在登録を受け付けていません
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-6">
              すでにアカウントをお持ちの方は
              <Link href="/" className="text-indigo-500 hover:underline ml-1">
                ログイン
              </Link>
            </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
