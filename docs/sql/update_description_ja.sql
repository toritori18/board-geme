-- M-7: description_ja を NULL に揃える
-- description_ja は長文説明用のカラムだが、長文は一度も生成されておらず
-- short_description_ja の複製が入っている
-- （実データ: 20,327件中 10,342件がテキスト、9,985件が空文字、NULL は0件）。
-- 投入スクリプト側で複製をやめたのに合わせ、既存行も NULL に揃える。
-- 表示は mapRow() のフォールバック（description_ja || short_description_ja）により変わらない。
-- Supabase の SQL Editor で実行してください。

UPDATE public."T_GAME" SET description_ja = NULL;

-- 実行後の確認
-- select count(*) from "T_GAME" where description_ja is not null;  -- 0 になること
-- select count(*) from "T_GAME" where short_description_ja <> '';  -- 10,342 のまま変わらないこと
