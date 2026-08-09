# セットアップガイド

## 必要環境

- Node.js 18以上
- npm 9以上

## インストール

```bash
git clone <リポジトリURL>
cd board-geme
npm install
```

## 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` を編集して必要な値を設定してください。Next.js の開発サーバーと `seed:*` の npm スクリプト（`--env-file=.env.local`）が実際に読むのはこのファイルです。`.gitignore` で除外されているためコミットされません。

### SESSION_SECRET（必須）

ログイン時に発行する httpOnly Cookie のセッショントークンを HMAC-SHA256 で署名するための鍵です。
[src/utils/session.ts](../src/utils/session.ts) が `process.env.SESSION_SECRET` を参照します。

弱い既定値へフォールバックしない設計にしているため、**未設定だとログインが 500 になり、ログイン後の画面もすべてログイン画面へリダイレクトされます。**

値は推測されないランダムな文字列にしてください。次のコマンドで生成できます。

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

生成した値を `.env.local` に追記します。

```
SESSION_SECRET=<生成したランダム文字列>
```

> 鍵を変更すると、発行済みのセッションはすべて無効になり再ログインが必要になります。

### NEXT_PUBLIC_SITE_URL

招待メール・パスワードリセットメールに埋め込むリンクのベース URL です。
[register.ts](../src/pages/api/auth/register.ts) と [forgot-password.ts](../src/pages/api/auth/forgot-password.ts) が参照します。

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**未設定のときは `http://localhost:3000` にフォールバックします。** ローカル開発では問題になりませんが、本番環境で未設定のままだと、利用者に届くメールのリンク先が `http://localhost:3000` になり再設定が完了できません。**Vercel の環境変数に本番ドメインを必ず設定してください。**

## Git フックの登録

push 前の機密情報チェック（`.claude/hooks/pre-push`）を有効にするため、クローン後に必ず実行してください。

```bash
git config core.hooksPath .claude/hooks
```

> `/git:init` コマンドを実行した場合は自動で登録されます。

## 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開いてください。

## ビルド

```bash
npm run build
```

## テスト

自動テストのフレームワーク（Jest・Vitest 等）は未導入で、`package.json` に `test` スクリプトはありません。
`/test` コマンドもその旨を報告するだけです。

プッシュ前の総点検には `/check`（ドキュメント参照先検査 → lint → 型検査 → 本番ビルド）を使ってください。
