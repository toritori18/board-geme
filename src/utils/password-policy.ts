const RULES = [
  { test: (p: string) => p.length >= 8,        message: "8文字以上で入力してください。" },
  { test: (p: string) => /[A-Z]/.test(p),      message: "大文字（A〜Z）を1文字以上含めてください。" },
  { test: (p: string) => /[a-z]/.test(p),      message: "小文字（a〜z）を1文字以上含めてください。" },
  { test: (p: string) => /[0-9]/.test(p),      message: "数字（0〜9）を1文字以上含めてください。" },
  // 記号を列挙すると、列挙にない記号（%, &, +, = など）だけを含む
  // 有効なパスワードまで弾いてしまうため、「英数字以外」で判定する（空白は記号として数えない）
  { test: (p: string) => /[^A-Za-z0-9\s]/.test(p), message: "記号（英数字以外の文字）を1文字以上含めてください。" },
];

export const PASSWORD_POLICY_DESCRIPTION =
  "8文字以上・大文字・小文字・数字・記号（英数字以外の文字）をそれぞれ1文字以上含めてください。";

/** バリデーションエラーメッセージを返す。問題なければ null を返す。 */
export function validatePassword(password: string): string | null {
  for (const rule of RULES) {
    if (!rule.test(password)) return rule.message;
  }
  return null;
}
