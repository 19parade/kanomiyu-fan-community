/**
 * F5-D4c: maps the exact error strings raised by public.moderate_post() /
 * public.moderate_comment() (supabase/migrations/20260926180000_moderation_rpcs.sql
 * — 4 codes, identical set for both functions) to a stable application
 * error code and HTTP status. Mirrors lib/admin/reports/errors.ts's
 * established pattern: the DB's own exception string is reused verbatim,
 * never re-encoded into a second taxonomy.
 */
const DB_ERROR_STATUS: Record<string, number> = {
  MODERATION_NOT_AUTHORIZED: 403,
  INVALID_MODERATION_TRANSITION: 409,
  MODERATION_REASON_TOO_LONG: 400,
  MODERATION_TARGET_NOT_AVAILABLE: 404,
};

export type MappedModerationDbError = { code: string; status: number };

export function mapModerationDbError(message: string | undefined | null): MappedModerationDbError {
  if (message && Object.prototype.hasOwnProperty.call(DB_ERROR_STATUS, message)) {
    return { code: message, status: DB_ERROR_STATUS[message] };
  }

  return { code: "MODERATION_FAILED", status: 500 };
}
