# ソースコードレビュー結果（2026-08-09 時点）

対象ブランチ: `docs/repo-cleanup`（HEAD: `f7af162`）

`src/` 配下の全ページ・API ルート・ユーティリティ・コンポーネント、`scripts/insert-to-db.ts`、スキーマ DDL、各種設定ファイルを通読し、[contributing.md](contributing.md) の規約と [.claude/factcheck.md](../.claude/factcheck.md) に照らしてレビューした記録である。

規約面（`any` 不使用・`@/` エイリアス・Tailwind のみ・日本語コメント・`.js` は設定ファイルのみ）は**アプリ本体では概ね遵守されていた**。以下は、それとは別に見つかった実害のある問題をまとめたものである。

| 深刻度 | 件数 | 概要 |
|---|---:|---|
| 🔴 重大 | 3 | RLS 未設定、認可の不在、招待メール API の野ざらし |
| 🟠 高 | 5 | 1000件上限による表示欠落、全件 SSR、毎レンダー全件ソート |
| 🟡 中 | 9 | フィルタのロジック不具合、投入スクリプトの ID 採番 |
| 🟢 低 | 10前後 | 重複コード、デッドコード、a11y、ドキュメント不整合 |

---

## 🔴 重大

### C-1. RLS が一切設定されていない

- スキーマ定義 `docs/sql/create_game_tables.sql` に `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` が**1行も無い**（リポジトリ全体を検索して0件）。なお `docs/sql/` は `.gitignore` で追跡対象外のローカル専用フォルダのため、リンクではなくパスのみを記載する
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` は [supabase.ts](../src/utils/supabase.ts#L4) 経由でパスワード設定画面・パスワード再設定画面が import しており、**クライアントバンドルに同梱される＝公開情報**である
- RLS が無効なら、この公開キーだけで `M_USER` の `password_hash` を `select` でき、`update` も通る

> **要確認**: Supabase の SQL Editor で作成したテーブルは RLS が自動有効化されない。ただしダッシュボード側で個別に有効化されている可能性があるため、**実際の RLS 状態を Supabase ダッシュボードで確認すること**。DDL に記述が無いという事実のみが確認済みである。

### C-2. 認証は成立しているが、認可がどこにも存在しない

- [login.ts](../src/pages/api/auth/login.ts#L61) — bcrypt 照合後、**トークンも Cookie も発行せず**ユーザー情報を JSON で返すのみ
- [index.tsx](../src/pages/index.tsx#L38) — クライアントが `sessionStorage.setItem("user", ...)` するだけ
- [ranking.tsx](../src/pages/ranking.tsx#L112) とゲーム詳細ページの `getServerSideProps` に認可チェックが無く、`middleware.ts` も存在しない → **未ログインでも全ページ・全データに直接アクセスできる**
- ログアウト（[ranking.tsx](../src/pages/ranking.tsx#L216)）は `router.push("/")` のみで `sessionStorage` を消していない

### C-3. 招待メール送信 API が誰でも叩ける

- [register.tsx](../src/pages/register.tsx#L69) はボタンを `disabled={true}` にしているが、**API 側は素通し**である
- [register.ts](../src/pages/api/auth/register.ts#L29) が `supabaseAdmin.auth.admin.inviteUserByEmail()` を実行する。認証もレート制限も無く、任意のアドレスへ招待メールを無制限に送れる（メール爆撃・送信ドメイン評判の毀損）

---

## 🟠 高

### H-1. 表示データが暗黙に 1000 件で打ち切られている

- [game-mapper.ts](../src/utils/game-mapper.ts#L64) の `fetchGames()` は `limit` / `range` 無しの全件 select である
- Supabase の Data API はデフォルトで**最大 1000 行**しか返さない（出典: <https://supabase.com/docs/reference/javascript/limit>）
- `sql/insert_transaction_data_*.sql` の規模（約2万件）に対し、**ランキング・検索は上位1000件しか対象になっていない**。エラーも警告も出ないため気づけない

### H-2. 全件を SSR して `__NEXT_DATA__` に埋め込んでいる

- `getServerSideProps` が毎リクエストで全ゲームを取得し props に載せる。ページネーション（`PAGE_SIZE = 20`）は**クライアント側の `slice` のみ**である
- H-1 を解消して2万件返すようにすると、そのままでは HTML が数十MB規模になる。サーバー側ページングへの移行が前提となる

### H-3. 毎レンダーで全件ソート・集合構築が走る

- [ranking.tsx](../src/pages/ranking.tsx#L125) の `sorted` / `allGenres`、同 [198行目](../src/pages/ranking.tsx#L198) の `filteredRanking` が `useMemo` 無しのトップレベル計算である（`useMemo` はリポジトリ全体で0件）
- 検索ボックスの**1文字入力ごと**に全件の `sort` + `flatMap` + `new Set` が実行される

### H-4. Supabase のエラーを握り潰している

- [game-mapper.ts](../src/utils/game-mapper.ts#L62) の `fetchGames` / `fetchGameById` が `{ data }` のみ destructure し、`error` を捨てている
- DB 障害・権限エラー時に**「0件」として正常ページが描画される**。障害が沈黙する

### H-5. パスワード更新が 0 行更新でも「成功」を返す

- [reset-password.ts](../src/pages/api/auth/reset-password.ts#L43) — `M_USER` に該当行が無くても `update` はエラーにならない
- Supabase Auth 側にのみ存在するユーザーには「パスワードを更新しました」と表示されるが、`login.ts` は `M_USER` を引くため**ログインできない**

---

## 🟡 中（ロジック不具合）

| # | 箇所 | 内容 |
|---|---|---|
| M-1 | [ranking.tsx](../src/pages/ranking.tsx#L38) | `playTime` が `"不明"` のとき `parseInt("不")` が `NaN` になる。NaN との比較は全て false のため、**play_time が null のゲームが全ての時間フィルタを通過する** |
| M-2 | [ranking.tsx](../src/pages/ranking.tsx#L63) | 超重量級の条件が `max < 120` のため、**120分ちょうどのゲームが「重量級(61〜120分)」と「超重量級(120分以上)」の両方**に出る |
| M-3 | [game-mapper.ts](../src/utils/game-mapper.ts#L41) | `complexity_average` が null のとき `?? 0` により**一律「初心者向け」**に分類される。データ欠損と「本当に易しい」が区別できない |
| M-4 | [ranking.tsx](../src/pages/ranking.tsx#L125) | UI は「評価数・スコアをもとに集計」と表示するが、実装は `rating` 降順で `votes` は同点時のタイブレークのみである。**評価数が極端に少ない高評価ゲームが上位を占める**（ベイズ平均のような重み付け補正が無い）。文言か実装のどちらかを合わせる必要がある |
| M-5 | [reset-password.tsx](../src/pages/reset-password.tsx#L16) | `onAuthStateChange` を **unsubscribe していない**（[set-password.tsx](../src/pages/set-password.tsx#L43) はしている）。さらに `PASSWORD_RECOVERY` イベントのみ待つため、**リロードすると永久に「リセットリンクを確認中...」**のままになる |
| M-6 | [forgot-password.ts](../src/pages/api/auth/forgot-password.ts#L33) | 未登録メールに 404 と「登録されていません」を返すため、**メールアドレスの列挙が可能**である。`login.ts` は正しく同一メッセージにしており方針が不統一 |
| M-7 | [insert-to-db.ts](../scripts/insert-to-db.ts#L125) | `description_ja` と `short_description_ja` に**同じ値**を入れている → 詳細画面の「ゲーム紹介」が一覧カードの短文と同じになる |
| M-8 | [insert-to-db.ts](../scripts/insert-to-db.ts#L166) | `kindIdMap` / `genreIdMap` を**ローカル採番（`i+1`）**で作っており、DB の SERIAL id と一致する保証が無い。しかも `insertGameGenre`（[65行目](../scripts/insert-to-db.ts#L65)）は `sort()` せず `main()` は `sort()` する。**順序がずれるとジャンルタグが全件誤表示**になる。なお両関数は `main()` から呼ばれておらずデッドコードである |
| M-9 | [insert-to-db.ts](../scripts/insert-to-db.ts#L132) | チャンク失敗を `console.error` するだけで処理を継続し、**exit code 0 で終了**する。部分投入に気づけない |

---

## 🟢 低（保守性・規約・UX）

- **重複コード** — `StarRating` が [GameCard.tsx](../src/components/GameCard.tsx#L10) とゲーム詳細ページにほぼ同一実装で存在する。`parseCSV` は `scripts/` の6ファイル中5ファイルにコピペされている（`;` 区切りの split でクォート非対応）
- **デッドコード** — [generate-game-sql.ts](../scripts/generate-game-sql.ts) は `generate-sql.ts` とほぼ重複で、npm スクリプトに未登録、かつ**出力先ファイルが同一**である。[games.json](../src/data/games.json) はどこからも import されていない
- **環境変数** — `NEXT_PUBLIC_SITE_URL` が [register.ts](../src/pages/api/auth/register.ts#L26) と [forgot-password.ts](../src/pages/api/auth/forgot-password.ts#L40) で使われているが `.env.example` に記載が無い。未設定だと本番から `http://localhost:3000` へのリンク入りメールが送信される
- **ドキュメント不整合** — [development-setup.md](development-setup.md) は `cp .env.example .env` と案内しているが、Next.js も npm スクリプト（`--env-file=.env.local`）も読むのは `.env.local` である。同ドキュメント末尾の `npm test` は `package.json` に存在しない
- **アクセシビリティ** — 全フォームの `<label>` に `htmlFor` / `id` の紐付けが無い。`autoComplete` 属性も未設定である
- **SEO・メタ情報** — `next/head` がリポジトリ全体で0件のため、全ページ `<title>` が未設定である。`next/image` も0件で生の `<img>` を使用している
- **パスワードポリシー** — [password-policy.ts](../src/utils/password-policy.ts#L6) の記号セットが `!@#$*-_?` に限定されており、`%` や `&` しか含まないパスワードが弾かれる
- **入力検証** — 全 API ルートが `req.body as { ... }` のキャストのみで、実行時バリデーションが無い。レート制限も無いためログインのブルートフォースが可能である
- **パスワードの二重管理** — Supabase Auth と `M_USER.password_hash` の2箇所に存在し、片方だけ更新されうる（H-5 の根本原因）

---

## 改修方針

### 今回の対象外（課題として記録し、実装しない）

**認証基盤の一本化**（Supabase Auth と `M_USER.password_hash` の二重管理の解消）は、ユーザー判断により今回の改修範囲から除外する。H-5 の根本原因でもあるため、**H-5 は対症療法（0行更新の検査）にとどめる**。

C-2（認可の導入）は当初この除外に含めていたが、後にユーザーの指示で実装範囲へ戻した。**既存のログイン方式（`M_USER` + bcrypt）は変えず、その上に httpOnly Cookie による自前セッションを載せる**方針としたため、二重管理の解消とは独立して対応できている。

C-1（RLS）の作業も認証基盤とは独立している。ページのデータ取得はサーバー側で service role クライアントを使っており（[game-mapper.ts](../src/utils/game-mapper.ts#L1)）、service role は RLS をバイパスするため、**anon 向けポリシーを作らなくても画面は現状どおり動作する**。

### 🔴 重大の対応状況

| ID | 状態 | 対応内容 |
|---|---|---|
| C-1 | DDL は作成済み・**DB への適用は未実施** | 4テーブルへの `ENABLE ROW LEVEL SECURITY` を `docs/sql/enable_rls.sql` に用意した。ポリシーは意図的に0件（service role のみ到達可能）。**Supabase の SQL Editor での実行が別途必要**。`docs/sql/` はローカル専用フォルダのため、このファイルは版管理されず各自の作業環境にのみ存在する（[db/migrate.md](../.claude/commands/db/migrate.md) の運用に従う） |
| C-2 | 対応済み | [session.ts](../src/utils/session.ts) を新設し、ログイン成功時に HMAC-SHA256 署名付きの httpOnly Cookie を発行。ランキング画面・ゲーム詳細画面の `getServerSideProps` で検証し、未ログインはログイン画面へリダイレクトする。ログアウトは専用 API で Cookie を破棄する。署名鍵は環境変数 `SESSION_SECRET`（[development-setup.md](development-setup.md#session_secret必須) 参照） |
| C-3 | 対応済み | [register.ts](../src/pages/api/auth/register.ts) をリクエストボディの読み取り前に 403 で打ち切るようにした。登録再開時は許可リストまたはレート制限の導入が前提 |

### フェーズ構成

| フェーズ | ブランチ | 内容 |
|---|---|---|
| 1 | `fix/security-rls` | RLS の DDL 追記（C-1）、招待メール API の 403 化（C-3）、メールアドレス列挙対策（M-6） |
| 2 | `fix/game-fetch-pagination` | `range()` によるサーバー側ページングと DB 側フィルタ（H-1・H-2）、`error` の握り潰し解消（H-4）、`useMemo` 化（H-3）、ランキング順序と UI 文言の一致（M-4） |
| 3 | `fix/filter-and-mapping-bugs` | `Game` 型を数値フィールド保持に変更（M-1 の根治）、時間フィルタの境界修正（M-2）、complexity が null の場合の扱い（M-3）、0行更新の検査（H-5）と unsubscribe（M-5） |
| 4 | `refactor/scripts-cleanup` | 投入スクリプトの ID 採番修正（M-7・M-8・M-9）、`parseCSV` の共通化、デッドコード削除、`StarRating` の切り出し |
| 5 | — | `.env.example` とドキュメントの整合、`next/head`、アクセシビリティ、README の同期 |

### フェーズ2の設計方針

`game-mapper.ts` に `fetchGamesPage({ page, pageSize, filters, sort })` を新設し、人数・時間・難易度・ジャンルの絞り込みを DB 側の条件に移す。ジャンルの選択肢は `M_GAME_GENRE` を1回取得して供給し、全ゲームの `flatMap` をやめる。難易度は `complexity_average` の範囲条件として DB に投げる。

### フェーズ3の設計方針

M-1 の根本原因は、`"3〜5人"` や `"60分"` のような**整形済み文字列を再度パースしている**点にある。`Game` 型を `minPlayers` / `maxPlayers` / `playTimeMinutes`（いずれも `number | null`）を保持する形に変更し、表示用の文字列はレンダリング時に組み立てる。

---

## 検証方法

各フェーズ完了時に以下を確認する。

1. `/check`（ドキュメント検査 → lint → 型検査 → ビルド）が通ること
2. `npm run dev` で手動確認
   - **フェーズ1** — 招待メール API に POST すると 403 が返る。パスワード再設定フォームに未登録アドレスを入れても登録済みと同じメッセージが返る。ランキング画面・ゲーム詳細画面が従来どおり表示される（RLS 有効化で service role 経由の取得が壊れていないこと）
   - **フェーズ2** — ランキングの総件数が 1000 件を超えて表示される。**修正前に 1000 件で頭打ちになることを先に確認**しておくと差分がはっきりする。最終ページまでページ送りできる。検索文字の入力時に体感の引っかかりが無い
   - **フェーズ3** — play_time が null のゲームが時間フィルタで除外される。120分のゲームが「重量級」のみに出る。complexity_average が null のゲームが難易度フィルタに出ない。`M_USER` に行が無いユーザーでパスワード再設定すると、成功メッセージではなくエラーになる
   - **フェーズ4** — `npm run seed:insert` をテスト用の小さい CSV で実行し、`T_GAME.game_domain_id` が `M_GAME_GENRE.id` と実際に一致することを SQL で突き合わせる
3. RLS は Supabase ダッシュボードで各テーブルの有効状態を確認し、あわせて **anon キーで `M_USER` を select して 0件またはエラーになる**ことを確認する

> 自動テスト基盤（Jest・Vitest 等）は未導入である。フェーズ3のフィルタ・マッピングのロジックは純関数であるため、テスト基盤の導入とあわせてユニットテストを書く価値が高い。
