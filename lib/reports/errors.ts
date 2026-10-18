/**
 * F5-D4a: public.create_report() の正式なエラーコード8種類（PROJECT_SPEC.md
 * 6.7「create_report()の正式なエラーコードは次の8種類のみ」）を日本語の
 * UI文言へマッピングする。supabase-js の RPC エラーは `error.message` に
 * raise exception のメッセージ文字列がそのまま入る（PostgREST + plpgsql
 * raise exception の既知の挙動 — F5フェーズ全体で一貫して確認済み）。
 *
 * REPORT_TARGET_NOT_AVAILABLE は「不存在 / hidden / deleted / block」を
 * 意図的に区別しない設計（create_report() 自身の doc comment 参照）ため、
 * ここでも理由を一切推測せず同じ曖昧なメッセージのみを返す。
 */
const REPORT_ERROR_MESSAGES: Record<string, string> = {
  REPORT_NOT_AUTHORIZED: "通報できませんでした。ログイン状態をご確認のうえ、再度お試しください。",
  INVALID_REPORT_TARGET_TYPE: "通報できませんでした。しばらくしてから再度お試しください。",
  INVALID_REPORT_REASON: "通報理由を選択してください。",
  REPORT_DETAIL_TOO_LONG: "詳細は2000文字以内で入力してください。",
  REPORT_TARGET_NOT_AVAILABLE: "この投稿またはコメントは現在通報できません。",
  SELF_REPORT_NOT_ALLOWED: "自分自身の投稿・コメントは通報できません。",
  REPORT_ALREADY_EXISTS: "この対象は既に通報済みです。",
  REPORT_RATE_LIMITED: "通報が多く送信されています。しばらく時間をおいて再度お試しください。",
};

const DEFAULT_MESSAGE = "通報できませんでした。しばらくしてから再度お試しください。";

export function reportErrorMessage(rawMessage: string | undefined | null): string {
  if (!rawMessage) {
    return DEFAULT_MESSAGE;
  }
  return REPORT_ERROR_MESSAGES[rawMessage] ?? DEFAULT_MESSAGE;
}
