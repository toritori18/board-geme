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
cp .env.example .env
```

`.env` を編集して必要な値を設定してください。

## 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開いてください。

## ビルド

```bash
npm run build
```

## テスト

```bash
npm test
```
