/**
 * F5-D4b: maps the exact error strings raised by public.process_report()
 * (supabase/migrations/20260927150000_process_report_rpc.sql — 5 codes
 * only, per PROJECT_SPEC.md 6.7) to a stable application error code and
 * HTTP status. Mirrors lib/song-images/errors.ts's established pattern:
 * the DB's own exception string is reused verbatim as the application
 * error code, never re-encoded into a second taxonomy. Unrecognized
 * messages fall back to a generic 500 — Postgres/PostgREST's raw error
 * text is never forwarded to the client for anything not in this table.
 */
const DB_ERROR_STATUS: Record<string, number> = {
  REPORT_PROCESSING_NOT_AUTHORIZED: 403,
  INVALID_REPORT_STATUS: 400,
  REPORT_PROCESSING_NOTE_TOO_LONG: 400,
  REPORT_NOT_AVAILABLE: 404,
  INVALID_REPORT_TRANSITION: 409,
};

export type MappedReportDbError = { code: string; status: number };

export function mapProcessReportDbError(message: string | undefined | null): MappedReportDbError {
  if (message && Object.prototype.hasOwnProperty.call(DB_ERROR_STATUS, message)) {
    return { code: message, status: DB_ERROR_STATUS[message] };
  }

  return { code: "REPORT_PROCESSING_FAILED", status: 500 };
}
