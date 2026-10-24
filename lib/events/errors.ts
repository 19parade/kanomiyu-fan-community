/**
 * Maps the exact error strings raised by the events admin RPCs
 * (create_event / update_event / set_event_status / get_admin_events /
 * get_admin_event — see supabase/migrations/20260927210000_events_admin_list.sql
 * through 20261024000000_events_schedule_and_official_link.sql) to a stable
 * application error code and HTTP status. Postgres/PostgREST's raw error
 * text is never forwarded to the client for anything not in this table —
 * unrecognized errors fall back to a generic 500.
 *
 * These codes are the DB's own contract, reused verbatim as the
 * application's error codes rather than re-encoded into a second taxonomy
 * (same approach as lib/song-images/errors.ts).
 */
const DB_ERROR_STATUS: Record<string, number> = {
  EVENT_MANAGEMENT_NOT_AUTHORIZED: 403,
  INVALID_EVENT_TITLE: 400,
  INVALID_EVENT_VENUE: 400,
  INVALID_EVENT_DATE: 400,
  INVALID_EVENT_DESCRIPTION: 400,
  INVALID_EVENT_TICKET_URL: 400,
  INVALID_EVENT_IMAGE_KEY: 400,
  INVALID_EVENT_DOORS_TIME: 400,
  INVALID_EVENT_START_TIME: 400,
  INVALID_EVENT_OFFICIAL_URL: 400,
  INVALID_EVENT_VERSION: 400,
  EVENT_NOT_FOUND: 404,
  EVENT_CONFLICT: 409,
  // get_admin_events() list query params.
  EVENT_SEARCH_TOO_LONG: 400,
  INVALID_EVENT_STATUS_FILTER: 400,
  INVALID_EVENT_CURSOR: 400,
  // set_event_status().
  INVALID_EVENT_STATUS: 400,
  INVALID_EVENT_TRANSITION: 400,
  // set_my_event_participation() (LIVE機能 Phase 2. PROJECT_SPEC.md 6.6).
  EVENT_PARTICIPATION_NOT_AUTHORIZED: 403,
  INVALID_PARTICIPATION_STATUS: 400,
  INVALID_PARTICIPATION_VISIBILITY: 400,
  EVENT_NOT_AVAILABLE_FOR_PARTICIPATION: 409,
  EVENT_NOT_AVAILABLE_FOR_ATTENDANCE: 409,
  INVALID_PARTICIPATION_TRANSITION: 409,
};

export type MappedEventDbError = { code: string; status: number };

/**
 * `message` is whatever the Supabase client's `error.message` contains for a
 * failed `rpc()` call. Known events error strings are matched exactly (no
 * substring/fuzzy matching — these RPCs never wrap the exception text in
 * extra prose).
 */
export function mapEventDbError(message: string | undefined | null): MappedEventDbError {
  if (message && Object.prototype.hasOwnProperty.call(DB_ERROR_STATUS, message)) {
    return { code: message, status: DB_ERROR_STATUS[message] };
  }

  return { code: "EVENT_OPERATION_FAILED", status: 500 };
}
