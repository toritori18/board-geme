# ソースコードレビュー結果（2026-08-09 時点）

対象ブランチ: `docs/repo-cleanup`（HEAD: `f7af162`）

`src/` 配下の全ページ・API ルート・ユーティリティ・コンポーネント、`scripts/insert-to-db.ts`、スキーマ DDL、各種設定ファイルを通読し、[contributing.md](contributing.md) の規約と [.claude/factcheck.md](../.claude/factcheck.md) に照らしてレビューした記録である。

規約面（`any` 不使用・`@/` エイリアス・Tailwind のみ・日本語コメント・`.js` は設定ファイルのみ）は**アプリ本体では概ね遵守されていた**。以下は、それとは別に見つかった実害のある問題をまとめたものである。

| 深刻度 | 件数 | 概要 | 対応状況（2026-08-09 時点） |
|---|---:|---|---|
| 🔴 重大 | 3 | RLS 未設定、認可の不在、招待メール API の野ざらし | **3件すべて対応済み** |
| 🟠 高 | 5 | 1000件上限による表示欠落、全件 SSR、毎レンダー全件ソート | **5件すべて対応済み**（H-3 は計算自体の削除による実質解消） |
| 🟡 中 | 9 | フィルタのロジック不具合、投入スクリプトの ID 採番 | **9件すべて対応済み** |
| 🟢 低 | 10前後 | 重複コード、デッドコード、a11y、ドキュメント不整合 | 未着手 |

各項目の実施日とコミットは、以下の該当箇所に記載している。

---

## 🔴 重大

### C-1. RLS が一切設定されていない

- スキーマ定義 [create_game_tables.sql](sql/create_game_tables.sql) に `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` が**1行も無い**（リポジトリ全体を検索して0件）。なおレビュー時点では `docs/sql/` 全体が `.gitignore` で追跡対象外だったが、`532c41e` で DDL のみ追跡対象に変更した
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

> **解消済み（2026-08-09、`ed4e3e4`）** — `fetchGames()` を廃し、[fetchGamesPage()](../src/utils/game-mapper.ts#L103) が `.range(from, to)` でページ範囲を明示して取得する形に変更した。総件数は `select(..., { count: "exact" })` で別途受け取るため、1000行上限に依存しない。実データでの全件数は 20,327 件である。

### H-2. 全件を SSR して `__NEXT_DATA__` に埋め込んでいる

- `getServerSideProps` が毎リクエストで全ゲームを取得し props に載せる。ページネーション（`PAGE_SIZE = 20`）は**クライアント側の `slice` のみ**である
- H-1 を解消して2万件返すようにすると、そのままでは HTML が数十MB規模になる。サーバー側ページングへの移行が前提となる

> **解消済み（2026-08-09、`ed4e3e4`）** — `getServerSideProps` が `fetchGamesPage()` で1ページ分（`PAGE_SIZE = 20`）のみ取得するようになり、`__NEXT_DATA__` に載るのも同じ20件分だけになった。絞り込み・並び替え・キーワード検索はすべて DB 側の条件に移してある。

### H-3. 毎レンダーで全件ソート・集合構築が走る

- [ranking.tsx](../src/pages/ranking.tsx#L125) の `sorted` / `allGenres`、同 [198行目](../src/pages/ranking.tsx#L198) の `filteredRanking` が `useMemo` 無しのトップレベル計算である（`useMemo` はリポジトリ全体で0件）
- 検索ボックスの**1文字入力ごと**に全件の `sort` + `flatMap` + `new Set` が実行される

> **解消済み（2026-08-09、`ed4e3e4`）** — サーバー側ページングへ移行した際、指摘の3つの計算（`sorted` / `allGenres` / `filteredRanking`）が `ranking.tsx` から削除され、並び替え・絞り込みは `game-mapper.ts` の `fetchGamesPage()`（`getServerSideProps` 内でリクエストごとに1回）へ移った。現在の `ranking.tsx` にトップレベルの重い計算は無いため、`useMemo` の導入自体が不要になっている。なお `useMemo` がリポジトリ全体で0件である事実は変わらない。

### H-4. Supabase のエラーを握り潰している

- [game-mapper.ts](../src/utils/game-mapper.ts#L62) の `fetchGames` / `fetchGameById` が `{ data }` のみ destructure し、`error` を捨てている
- DB 障害・権限エラー時に**「0件」として正常ページが描画される**。障害が沈黙する

> **解消済み（2026-08-09、`ed4e3e4`）** — [buildGenreMap()](../src/utils/game-mapper.ts#L40)・[fetchGamesPage()](../src/utils/game-mapper.ts#L197)・[fetchGameById()](../src/utils/game-mapper.ts#L220) の3箇所で `error` を受け取り `throw` するようにした。`fetchGameById` は `.single()` ではなく `.maybeSingle()` を使い、「該当行が無い」と「DB 障害」を区別している。

### H-5. パスワード更新が 0 行更新でも「成功」を返す

- [reset-password.ts](../src/pages/api/auth/reset-password.ts#L43) — `M_USER` に該当行が無くても `update` はエラーにならない
- Supabase Auth 側にのみ存在するユーザーには「パスワードを更新しました」と表示されるが、`login.ts` は `M_USER` を引くため**ログインできない**

> **解消済み（2026-08-09、`cb9c21e`）** — [reset-password.ts:59](../src/pages/api/auth/reset-password.ts#L59) で `update` に `.select("id")` を付けて更新行を受け取り、0件なら 404「アカウントが見つかりませんでした。」を返す。ただしこれは**対症療法**であり、根本原因（Supabase Auth と `M_USER.password_hash` の二重管理）はユーザー判断により対象外のままである。

---

## 🟡 中（ロジック不具合）

| # | 箇所 | 内容 |
|---|---|---|
| M-1 | [ranking.tsx](../src/pages/ranking.tsx#L38) | **✅ 解消済み** — `playTime` が `"不明"` のとき `parseInt("不")` が `NaN` になる。NaN との比較は全て false のため、**play_time が null のゲームが全ての時間フィルタを通過する** |
| M-2 | [ranking.tsx](../src/pages/ranking.tsx#L63) | **✅ 解消済み** — 超重量級の条件が `max < 120` のため、**120分ちょうどのゲームが「重量級(61〜120分)」と「超重量級(120分以上)」の両方**に出る |
| M-3 | [game-mapper.ts](../src/utils/game-mapper.ts#L41) | **✅ 解消済み** — `complexity_average` が null のとき `?? 0` により**一律「初心者向け」**に分類される。データ欠損と「本当に易しい」が区別できない |
| M-4 | [ranking.tsx](../src/pages/ranking.tsx#L125) | **✅ 解消済み** — UI は「評価数・スコアをもとに集計」と表示するが、実装は `rating` 降順で `votes` は同点時のタイブレークのみである。**評価数が極端に少ない高評価ゲームが上位を占める**（ベイズ平均のような重み付け補正が無い）。文言か実装のどちらかを合わせる必要がある |
| M-5 | [reset-password.tsx](../src/pages/reset-password.tsx#L16) | **✅ 解消済み** — `onAuthStateChange` を **unsubscribe していない**（[set-password.tsx](../src/pages/set-password.tsx#L43) はしている）。さらに `PASSWORD_RECOVERY` イベントのみ待つため、**リロードすると永久に「リセットリンクを確認中...」**のままになる |
| M-6 | [forgot-password.ts](../src/pages/api/auth/forgot-password.ts#L33) | **✅ 解消済み** — 未登録メールに 404 と「登録されていません」を返すため、**メールアドレスの列挙が可能**である。`login.ts` は正しく同一メッセージにしており方針が不統一 |
| M-7 | [insert-to-db.ts](../scripts/insert-to-db.ts#L125) | **✅ 解消済み** — `description_ja` と `short_description_ja` に**同じ値**を入れている → 詳細画面の「ゲーム紹介」が一覧カードの短文と同じになる |
| M-8 | [insert-to-db.ts](../scripts/insert-to-db.ts#L166) | **✅ 解消済み** — `kindIdMap` / `genreIdMap` を**ローカル採番（`i+1`）**で作っており、DB の SERIAL id と一致する保証が無い。しかも `insertGameGenre`（[65行目](../scripts/insert-to-db.ts#L65)）は `sort()` せず `main()` は `sort()` する。**順序がずれるとジャンルタグが全件誤表示**になる。なお両関数は `main()` から呼ばれておらずデッドコードである |
| M-9 | [insert-to-db.ts](../scripts/insert-to-db.ts#L132) | **✅ 解消済み** — チャンク失敗を `console.error` するだけで処理を継続し、**exit code 0 で終了**する。部分投入に気づけない |

### M-1・M-2 の対応状況（2026-08-09）

指摘された不具合は**フェーズ2（`ed4e3e4`）で副次的に解消済み**である。サーバー側ページングへの移行に伴い `ranking.tsx` のクライアント側フィルタ判定が丸ごと削除され、絞り込みが [game-mapper.ts](../src/utils/game-mapper.ts#L132) の DB クエリへ移った結果、

- **M-1** — `src/` から `parseInt` が消滅した。`play_time` が NULL の行は `lte`/`gte` の比較結果が SQL 上 NULL となり、WHERE 句から自然に除外される（三値論理）
- **M-2** — 区間が `<=30` / `31〜60` / `61〜120` / `>120` となり、重複もギャップも無くなった。120分ちょうどは「重量級」にのみ該当する

ただし、この移行の際に**表示側とフィルタ側の整合が取り切れておらず、派生した実害が2点残っていた**。これらは本ブランチ（`fix/play-time-filter-consistency`）で対応した。

| # | 内容 | 対応 |
|---|---|---|
| ① | UI ラベルが `"超重量級(120分以上)"` だが実装は `gt("play_time", 120)` = 120分より長い。ラベルの数値と実際の下限が食い違い、120分のゲームがこの区分に出てこない | ラベルを `"超重量級(120分超)"` に変更し、実装に合わせた。実装を `gte 120` にすると重量級の `lte 120` と重複し M-2 が再発するため、文言側を合わせている |
| ② | `mapRow` の `row.play_time ? ... : "不明"` が **truthy 判定**のため `0` を「不明」と表示する一方、フィルタの `lte("play_time", 30)` は `0` を通す。「軽量級」で絞ると「不明」表示のカードが並ぶ | 表示側を `row.play_time != null && row.play_time > 0` に改めて意図を明示し、フィルタ側の軽量級に `gte("play_time", 1)` を足して両者を揃えた |

#### 実データによる裏付け（2026-08-09 時点・`T_GAME` 全 20,327 件）

service role で `count=exact` を用いて件数を実測した結果、以下が判明した。

| 条件 | 件数 |
|---|---:|
| `play_time IS NULL` | **0** |
| `play_time = 0` | **554** |
| `play_time = 120`（M-2 の境界） | **1,616** |
| `play_time = 121` | **0**（120分超の最小値は125分） |

- **M-1 の前提は実データと異なっていた** — NULL は1件も存在せず、「不明」表示の正体はすべて `play_time = 0` の554件である。したがって修正②は防御的措置ではなく、**「軽量級(～30分)」の結果 8,628件のうち554件が「不明」表示だった**という実害の解消にあたる（修正後は 8,074件）
- **区分の網羅性** — 修正後の4区分は 8,074 + 5,827 + 3,520 + 2,352 = 19,773 となり、全件 20,327 から `play_time = 0` の554件を引いた数と一致する。重複もギャップも無い
- **ラベルを「121分〜」ではなく「120分超」とした理由** — `play_time = 121` は0件で、120分超の最小値は125分である。実在しない境界値を UI に出さないため、実装 `gt(120)` と同義の「120分超」を採った

> なお、この実測の過程で `gte.100&lte.130` の範囲クエリが**ちょうど1000件で頭打ち**になることを確認した。H-1 が指摘した PostgREST の1000行上限が実データで再現した形である（アプリ本体はフェーズ2で `range()` へ移行済みのため影響しない）。

> **据え置き** — フェーズ3の設計方針が示す根治（`Game` 型を `playTime: string` から `playTimeMinutes: number \| null` へ変更し、表示用文字列をレンダリング時に組み立てる）は**未実施**である。整形済み文字列を後段で再パースするアンチパターンを型で封じる予防的リファクタリングとして価値は残っているが、実害のあるバグは上記①②で解消したため今回は見送った。

### M-3・M-4・M-5 の対応状況（2026-08-09）

3件とも `fix/filter-and-mapping-bugs` ブランチで対応した。

| # | 対応内容 |
|---|---|
| M-3 | [mapRow()](../src/utils/game-mapper.ts#L83) の `Number(row.complexity_average ?? 0)` をやめ、`null` と `0` を「不明」として扱うようにした。あわせて絞り込み側の初心者向け条件を `.or("...lt.2.0,...is.null")` から `.gt("complexity_average", 0).lt("complexity_average", 2.0)` に変更し、表示とフィルタの意味論を揃えた |
| M-4 | ランキングタブの並びを `rating_average` 降順から **`bgg_rank` 昇順**へ変更した（[ranking.tsx](../src/pages/ranking.tsx#L100)）。あわせて見出し下の文言を「評価数・スコアをもとに集計」から「BoardGameGeek 公表のランキング順」に改めた |
| M-5 | [reset-password.tsx](../src/pages/reset-password.tsx#L16) の `useEffect` を書き換え、`INITIAL_SESSION` と `getSession()` の2経路を追加した。`ready` の真偽値を `status`（`checking` / `ready` / `invalid`）に置き換え、セッションを確立できない場合は案内を表示する。`subscription.unsubscribe()` も追加した |

#### M-3 の実データによる裏付け（2026-08-09 時点・`T_GAME` 全 20,327 件）

| 条件 | 件数 |
|---|---:|
| `complexity_average IS NULL` | **0** |
| `complexity_average = 0` | **426** |
| 初心者向け（修正前 `lt 2.0` または `is null`） | 10,209 |
| **初心者向け（修正後 `0 < c < 2.0`）** | **9,783** |
| 中級者向け（`2.0 <= c <= 3.5`・変更なし） | 9,078 |
| 上級者向け（`c > 3.5`・変更なし） | 1,040 |

- **M-1 と同じ構図である** — レビューは「`null` のとき `?? 0`」と書いたが NULL は1件も存在せず、欠損の実体は `0` の426件だった。`?? 0` は一度も発火していない一方、指摘された実害（欠損が「初心者向け」に混ざる）はそのまま起きていた
- **`0` はスケール外＝欠損** — 0 より大きい最小値は `1`、最大値は `5` で値域は 1〜5。`0` はこの範囲の外にある
- **区分の網羅性** — 9,783 + 9,078 + 1,040 = 19,901 は全件 20,327 から `0` の426件を引いた数と一致する。重複もギャップも無い
- 難易度フィルタ未選択時は、`0` の426件も従来どおり一覧に出る（下限条件が無条件に効いていないこと）

#### M-4 の実測

`rating_average` 降順では、上位が評価数30〜80件のマイナーゲームで占拠されていた。

| 順位 | 修正前（`rating_average` 降順） | 修正後（`bgg_rank` 昇順） |
|---:|---|---|
| 1 | Erune（★9.58 / 31票） | Gloomhaven（★8.79 / 42,055票） |
| 2 | DEFCON 1（★9.54 / 57票） | Pandemic Legacy: Season 1（★8.61 / 41,643票） |
| 3 | Star Trek: Alliance（★9.46 / 54票） | Brass: Birmingham（★8.66 / 19,217票） |

`T_GAME.bgg_rank` は `data/bgg_dataset.csv` の `BGG Rank` 列に由来し、20,327件すべてに値が入っている（NULL 0件）。投入元のスクリプトは特定できていない（詳細は[投入経路の調査結果](#投入経路の調査結果2026-08-09)を参照）。

文言を「BoardGameGeek 公表のランキング順」としたのは、「集計」だと自前で算出しているように読めるためである。BGG が順位をどの式で算出しているかは一次資料で未確認のため、[.claude/factcheck.md](../.claude/factcheck.md) に従い、確認できている事実のみを記載している。

#### M-5 の原因（`@supabase/auth-js` 2.106.2 のソースで確認）

- `_initialize()` は URL に認証情報がある場合のみセッションを復元し、その直後に `PASSWORD_RECOVERY` を通知する。implicit フロー（`flowType` の既定値）では処理後に `window.location.hash = ''` で URL を掃除するため、**リロード後はこの通知が発生しない**。セッション自体は localStorage に残っているが、修正前のコードはそれを読みに行っていなかった
- `onAuthStateChange` は購読登録時に `initializePromise` を待ってから、その購読者へ `INITIAL_SESSION`（セッションが無ければ `null`）を必ず通知する
- `getSession()` も冒頭で `initializePromise` を await するため、URL のトークン処理が完了してから結果が返る（レース無し）。したがって `getSession()` が空を返せば「リンクが無効・期限切れ」と断定してよい

> **unsubscribe（M-5 の指摘後半）について** — この画面への入口はメールのリンク（＝必ずフルロード）のみで、アプリ内から[パスワード再設定画面](../src/pages/reset-password.tsx)へのリンクは無い。`supabase` は [supabase.ts](../src/utils/supabase.ts#L6) のモジュールトップレベルのシングルトンで、フルロードのたびに購読リストが空に戻る。そのため購読が積み上がる経路が実質存在せず、**単独では観測可能な実害は無い**。上記の `useEffect` を書き換えるついでに [set-password.tsx](../src/pages/set-password.tsx#L43) と実装を揃えた、という位置づけである。なお React 18 は unmount 後の `setState` に警告を出さないため（`react-dom` 18.3.1 の development ビルドに該当の警告文字列が存在しないことを確認）、コンソールでの検出もできない

#### 本対応で生じた残課題

| 課題 | 内容 |
|---|---|
| `GameSort` の `"rating"` 分岐 | M-4 で `sort` に `"rank"` しか渡らなくなったため、[game-mapper.ts](../src/utils/game-mapper.ts#L186) の `"rating"` 側がデッドコードになった。挙動を戻せる状態を保つため今回は残している。削除はフェーズ4のデッドコード整理で扱う |
| `Game.difficulty` が未描画 | `mapRow()` が算出する難易度ラベルは、[GameCard.tsx](../src/components/GameCard.tsx) にもゲーム詳細ページにも表示されていない。そのため M-3 の修正で利用者から見える変化は**絞り込み結果の件数のみ**で、「不明」の文字列が画面に出ることは無い。難易度を表示するかどうかは別課題 |

### M-6・M-7・M-8・M-9 の対応状況（2026-08-09）

4件とも `fix/filter-and-mapping-bugs` ブランチで対応した。性質が2つに分かれる。

- **M-6** — 認証 API の情報漏洩。**現に本番で踏める**問題
- **M-7・M-8・M-9** — 投入スクリプトの不具合。**現データは別経路で入っているため、いま壊れているものは無い**。次に `npm run seed:insert` を実行した瞬間に顕在化する

| # | 対応内容 |
|---|---|
| M-6 | [forgot-password.ts](../src/pages/api/auth/forgot-password.ts#L33) で、未登録メールにも**成功時と完全に同一のレスポンス**（200 / `success: true` / 同一メッセージ）を返すようにした。存在確認クエリはメール送信の要否判断のために残しており、メールが実際に送られるのは登録済みの場合のみ |
| M-7 | [insert-to-db.ts](../scripts/insert-to-db.ts#L125) と [generate-sql.ts](../scripts/generate-sql.ts#L155) の両方で `description_ja` への短文の複製をやめ、`NULL` を入れるようにした。あわせて [mapRow()](../src/utils/game-mapper.ts#L91) に `description_ja \|\| short_description_ja` のフォールバックを入れ、[games/[id].tsx](../src/pages/games/[id].tsx#L113) は表示する文が無ければ「ゲーム紹介」セクションごと出さないようにした |
| M-8 | [main()](../scripts/insert-to-db.ts#L169) のローカル採番（`i + 1`）を廃し、デッドコードだった `insertGameKind` / `insertGameGenre` を呼んで **DB が採番した実 ID** を受け取るようにした |
| M-9 | `insertGames()` が `failedChunks` を返すようにし、失敗があれば `main()` が `process.exit(1)` する。`main().catch(console.error)` も exit code 1 を立てる形に変更した |

#### 投入経路の調査結果（2026-08-09）

```
data/bgg_dataset.csv (20,327件)
    ├─ seed:submit / seed:collect（Anthropic Batch API）
    │     → data/batch-results.json (10,343件) / mechanics-translations.json
    ↓
    ├─ generate-sql.ts   → INSERT 文を出力 → Supabase SQL Editor に貼る  ← 現データはこちら
    └─ insert-to-db.ts   → Supabase に直接 upsert                        ← M-7〜M-9 の対象
```

- **M-8 は現データの不整合ではなく潜在バグである** — `docs/sql/insert_master_data.sql` は id を明示して INSERT し `setval` でシーケンスを合わせているため、番号がずれようがない。実際 `M_GAME_GENRE.id` は名前ソート順の 1〜8 で、Gloomhaven（`id=174430`）の `game_domain_id = [6,7]` は CSV の `Strategy Games, Thematic Games` と一致する
- **生成元スクリプトの版はリポジトリに残っていない** — 現物3ファイル（いずれも `Generated: 2026-05-31T04:55:34.365Z`）はマスタ／トランザクションに分割されているが、`generate-sql.ts` も `generate-game-sql.ts` も出力は `insert_game_data.sql` 1本で、ヘッダー文言も一致しない。`npm run seed:generate-sql` を叩いても現物は再現しない
- **再生成した SQL を流しても既存行は更新されない** — T_GAME 側は全41チャンクが `ON CONFLICT (id) DO NOTHING` である

#### 長文説明というデータは存在しない（M-7 の前提）

- `data/batch-results.json` のフィールドは `name_ja` と `short_description_ja`（プロンプトで「30〜50文字」指定）の**2つだけ**で、長文説明は一度も生成されていない
- `T_GAME.description_ja` は **9,985件が空文字**（全 20,327 件の49%）、NULL は0件、残り 10,342 件は `short_description_ja` と完全に同一
- つまり詳細ページの「ゲーム紹介」は、**半数で空欄、残り半数で一覧カードと同じ文**が出ていた。本対応で空欄のセクションは出なくなる

> **既存データへの適用が必要** — 既存の 10,342 件には複製が残ったままである。`docs/sql/update_description_ja.sql`（`UPDATE public."T_GAME" SET description_ja = NULL;`）を用意した。**Supabase の SQL Editor での実行は未実施**。失われる情報は無く（中身は `short_description_ja` と同一）、`mapRow()` のフォールバックにより実行前後で表示は変わらない。

> **`insert-to-db.ts` の実行に DELETE は不要** — マスタへの upsert は `rows` に id を含めず `game_kind_name` / `game_genre_name`（`UNIQUE`）で照合するため、既存 id を維持したまま `*_name_ja` を更新する。`T_GAME` も `id`（CSV の BGG ID）で衝突して UPDATE される。逆に**マスタを DELETE してはならない** — シーケンスは巻き戻らず（`setval(..., 8)` 済み）再 INSERT で 9 以降が振られる。`game_domain_id` は `INTEGER[]` で外部キー制約が無いため DB はエラーを出さず、[buildGenreMap()](../src/utils/game-mapper.ts#L34) の `genreMap.get(id) ?? ""` が空文字を返して**全ゲームのジャンルタグが黙って消える**。

#### 本対応で残した課題

| 課題 | 内容 |
|---|---|
| 長文説明の生成 | 用意するには [submit-batch.ts](../scripts/submit-batch.ts#L22) のプロンプトに `description_ja` を追加し、`max_tokens: 200` を引き上げ、`DescriptionResult` 型を3フィールドにしたうえで Batch API を再実行（20,327件・費用と数時間〜24時間）し、再投入する必要がある |
| タイミング攻撃（M-6 の残り火） | 登録済みの場合だけ `resetPasswordForEmail`（外部通信）を通るため、応答時間の差から存在を推測する余地は残る |
| `main().catch(console.error)` の波及 | 同じ形が [submit-batch.ts](../scripts/submit-batch.ts#L97) と [collect-batch.ts](../scripts/collect-batch.ts#L146) にもある。レビューの指摘は `insert-to-db.ts` のみだったため対象を広げていない |

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
| C-1 | **対応済み**（2026-08-09、DDL 作成 + DB へ適用） | 4テーブルへの `ENABLE ROW LEVEL SECURITY` を `docs/sql/enable_rls.sql` に用意し、Supabase の SQL Editor で実行済み。ポリシーは意図的に0件とし、service role のみ到達可能な状態にしている（[db/migrate.md](../.claude/commands/db/migrate.md) の運用に従う）。適用後の実測は下記のとおり |
| C-2 | 対応済み（2026-08-09、`f71234b`） | [session.ts](../src/utils/session.ts) を新設し、ログイン成功時に HMAC-SHA256 署名付きの httpOnly Cookie を発行。ランキング画面・ゲーム詳細画面の `getServerSideProps` で検証し、未ログインはログイン画面へリダイレクトする。ログアウトは専用 API で Cookie を破棄する。署名鍵は環境変数 `SESSION_SECRET`（[development-setup.md](development-setup.md#session_secret必須) 参照） |
| C-3 | 対応済み（2026-08-09、`cb9c21e`） | [register.ts](../src/pages/api/auth/register.ts) をリクエストボディの読み取り前に 403 で打ち切るようにした。登録再開時は許可リストまたはレート制限の導入が前提 |

#### C-1 適用後の実測（2026-08-09）

anon キー（`NEXT_PUBLIC_SUPABASE_ANON_KEY`）で4テーブルに `select` を投げた結果、**すべて HTTP 401 `permission denied for table` で拒否された**。レビューが C-1 で懸念した「公開キーだけで `M_USER.password_hash` を読める」状態は解消している。

ただし、このエラーの出方には注意が必要である。

- `permission denied for table` は **RLS ではなくテーブル権限（GRANT）による拒否**である。RLS で行が絞られる場合は HTTP 200 で0件が返るため、メッセージが異なる
- つまりこの実測が直接証明しているのは「anon ロールにテーブル権限が無い」ことであり、**RLS の有効化そのものを裏付けるものではない**。両者は独立した防御層であり、現状はその二層が重なっている状態と解釈できる
- RLS の有効/無効は PostgREST 経由では確認できない（`pg_catalog` が公開スキーマに含まれないため）。確定させるには `docs/sql/enable_rls.sql` 末尾のコメントにある `pg_tables.rowsecurity` の検証クエリを SQL Editor で実行し、4テーブルすべてが `true` であることを確認する

### フェーズ構成

当初の計画（下表の「内容」列）に対し、実際の実装は `fix/critical-and-high-issues` ブランチに統合され、PR #4（`9972a62`）でマージされた。**計画したブランチ名とは異なる**点に注意。

| フェーズ | 計画ブランチ | 内容 | 状態 |
|---|---|---|---|
| 1 | `fix/security-rls` | RLS の DDL 追記（C-1）、招待メール API の 403 化（C-3）、メールアドレス列挙対策（M-6） | **完了**（C-1・C-3 は `cb9c21e` ほか。M-6 は `fix/filter-and-mapping-bugs` で対応） |
| 2 | `fix/game-fetch-pagination` | `range()` によるサーバー側ページングと DB 側フィルタ（H-1・H-2）、`error` の握り潰し解消（H-4）、`useMemo` 化（H-3）、ランキング順序と UI 文言の一致（M-4） | **完了**（H-1・H-2・H-4 は `ed4e3e4`。H-3 は計算自体の削除により実質解消。M-4 は `fix/filter-and-mapping-bugs` で対応） |
| — | （計画外） | httpOnly Cookie による自前セッションと画面の認可（C-2） | 完了（`f71234b`） |
| 3 | `fix/filter-and-mapping-bugs` | complexity が null の場合の扱い（M-3）、0行更新の検査（H-5）と unsubscribe（M-5） | **完了**（H-5 は `cb9c21e`。M-3・M-5 は `fix/filter-and-mapping-bugs` で対応。詳細は[上記の対応状況](#m-3m-4m-5-の対応状況2026-08-09)を参照）。M-1・M-2 はフェーズ2で解消済みのため対象外 |
| 3.5 | `fix/play-time-filter-consistency` | フェーズ2で残った時間フィルタの表示・文言の不整合（M-1・M-2 の派生①②）。詳細は[上記の対応状況](#m-1m-2-の対応状況2026-08-09)を参照 | 完了 |
| 4 | `refactor/scripts-cleanup` | 投入スクリプトの ID 採番修正（M-7・M-8・M-9）、`parseCSV` の共通化、デッドコード削除、`StarRating` の切り出し | **一部**（M-7・M-8・M-9 は `fix/filter-and-mapping-bugs` で完了。**`parseCSV` の共通化・デッドコード削除・`StarRating` の切り出しは未着手**） |
| 5 | — | `.env.example` とドキュメントの整合、`next/head`、アクセシビリティ、README の同期 | 未着手 |

> フェーズ1の M-6 とフェーズ2の M-4 は当初の実装時に漏れていたが、いずれも `fix/filter-and-mapping-bugs` で回収した。🟡中はこれで9件すべて対応済みとなり、残るのは 🟢低とフェーズ4・5 の保守性項目のみである。

### フェーズ2の設計方針

`game-mapper.ts` に `fetchGamesPage({ page, pageSize, filters, sort })` を新設し、人数・時間・難易度・ジャンルの絞り込みを DB 側の条件に移す。ジャンルの選択肢は `M_GAME_GENRE` を1回取得して供給し、全ゲームの `flatMap` をやめる。難易度は `complexity_average` の範囲条件として DB に投げる。

### フェーズ3の設計方針

M-1 の根本原因は、`"3〜5人"` や `"60分"` のような**整形済み文字列を再度パースしている**点にあった。`Game` 型を `minPlayers` / `maxPlayers` / `playTimeMinutes`（いずれも `number | null`）を保持する形に変更し、表示用の文字列はレンダリング時に組み立てる、というのが当初の方針である。

ただしフェーズ2で絞り込みが DB 側へ移り、再パースを行うコードそのものが消えたため、**この型変更は実害の解消ではなく再発防止の位置づけに変わった**（現在 `Game.playTime` を参照しているのは [GameCard.tsx](../src/components/GameCard.tsx#L54) と [games/[id].tsx](../src/pages/games/[id].tsx#L105) の表示2箇所のみで、フィルタ処理は DB カラム `play_time` を直接見ている）。優先度を下げ、今回は実施しない。

---

## 検証方法

各フェーズ完了時に以下を確認する。

1. `/check`（ドキュメント検査 → lint → 型検査 → ビルド）が通ること
2. `npm run dev` で手動確認
   - **フェーズ1** — 招待メール API に POST すると 403 が返る。パスワード再設定フォームに未登録アドレスを入れても登録済みと同じメッセージが返る。ランキング画面・ゲーム詳細画面が従来どおり表示される（RLS 有効化で service role 経由の取得が壊れていないこと）
   - **フェーズ2** — ランキングの総件数が 1000 件を超えて表示される。**修正前に 1000 件で頭打ちになることを先に確認**しておくと差分がはっきりする。最終ページまでページ送りできる。検索文字の入力時に体感の引っかかりが無い
   - **フェーズ3** — 難易度「初心者向け」の総件数が 10,209件から **9,783件**に減る（`complexity_average = 0` の426件が外れる）。難易度フィルタ未選択時はその426件も従来どおり出る。ランキングタブの1位が Gloomhaven になり、見出し下が「BoardGameGeek 公表のランキング順」になっている。**パスワード再設定画面をリロードしてもフォームが表示され続ける**（修正前は「リセットリンクを確認中...」で止まる）。メールのリンクを経由せず[パスワード再設定画面](../src/pages/reset-password.tsx)に直接アクセスすると、「リンクが無効か期限切れ」の案内と再送導線が出る。`M_USER` に行が無いユーザーでパスワード再設定すると、成功メッセージではなくエラーになる
   - **フェーズ3.5** — 「超重量級(120分超)」で絞ると所要時間が**すべて120分より長い**（実データ上の最小は125分）。120分のゲームは「重量級」にのみ出る。「軽量級(～30分)」で絞ると**「不明」表示のカードが1件も出ず**、総件数が 8,628件から 8,074件に減る。一方、時間フィルタ未選択時には「不明」のゲーム554件が従来どおり一覧に出る（下限条件が無条件に効いていないこと）
   - **フェーズ4** — 詳細ページで、説明文があるゲーム（例: Gloomhaven `id=174430`）は「ゲーム紹介」が従来どおり出て、説明文が無いゲーム（9,985件のいずれか）は**見出しごと消えている**。`docs/sql/update_description_ja.sql` を実行後も表示が変わらないこと（`UPDATE 20327` が返り、`description_ja is not null` が0件になる）

     投入スクリプトの検証は**本番データに対しては行わない**。テスト用の小さい CSV と空のテーブル（または別プロジェクト）を用意し、`npm run seed:insert` の実行後に次を確認する。

     ```sql
     -- game_domain_id の各要素が M_GAME_GENRE.id に実在すること（0 になること）
     select count(*) from "T_GAME" g
     where exists (
       select 1 from unnest(g.game_domain_id) as did
       where did not in (select id from "M_GAME_GENRE")
     );
     ```

     あわせて、`M_GAME_GENRE` に行が入ること（修正前は投入されない）、`description_ja` が NULL で入ること、意図的にチャンクを失敗させると exit code が **1** になること（修正前は 0）を確認する。**本番 DB に対して `seed:insert` を試してはならない** — マスタの扱いを誤るとジャンルタグが全件ずれるため
3. RLS は Supabase ダッシュボードで各テーブルの有効状態を確認し、あわせて **anon キーで `M_USER` を select して 0件またはエラーになる**ことを確認する
   - anon キーからの到達不可は**実測済み**（4テーブルとも HTTP 401）。ただしそれは GRANT による拒否であり RLS の有効化を意味しないため、`pg_tables.rowsecurity` が4テーブルとも `true` であることの確認は別途必要である。詳細は[C-1 適用後の実測](#c-1-適用後の実測2026-08-09)を参照

> 自動テスト基盤（Jest・Vitest 等）は未導入である。フェーズ3のフィルタ・マッピングのロジックは純関数であるため、テスト基盤の導入とあわせてユニットテストを書く価値が高い。
