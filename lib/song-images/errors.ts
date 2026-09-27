/**
 * Maps the exact error strings raised by the Songs admin RPCs
 * (create_song / update_song — see supabase/migrations/20260928110000_
 * songs_admin_create.sql and 20260928120000_songs_admin_update.sql) to a
 * stable application error code and HTTP status. Postgres/PostgREST's raw
 * error text is never forwarded to the client for anything not in this
 * table — unrecognized errors fall back to a generic 500.
 *
 * These codes are the DB's own contract, reused verbatim as the
 * application's error codes rather than re-encoded into a second taxonomy.
 */
const DB_ERROR_STATUS: Record<string, number> = {
  SONG_MANAGEMENT_NOT_AUTHORIZED: 403,
  INVALID_SONG_TITLE: 400,
  INVALID_SONG_DESCRIPTION: 400,
  INVALID_SONG_COVER_IMAGE_KEY: 400,
  INVALID_SONG_RELEASE_DATE: 400,
  INVALID_SONG_VERSION: 400,
  SONG_NOT_FOUND: 404,
  SONG_VERSION_CONFLICT: 409,
  // get_admin_songs() (A2, GET /api/admin/music) — see
  // supabase/migrations/20260928090000_songs_admin_list.sql.
  SONG_SEARCH_TOO_LONG: 400,
  INVALID_SONG_STATUS_FILTER: 400,
  INVALID_SONG_CURSOR: 400,
};

export type MappedSongDbError = { code: string; status: number };

/**
 * `message` is whatever the Supabase client's `error.message` contains for
 * a failed `rpc()` call. Known Songs error strings are matched exactly
 * (no substring/fuzzy matching — these RPCs never wrap the exception text
 * in extra prose).
 */
export function mapSongDbError(message: string | undefined | null): MappedSongDbError {
  if (message && Object.prototype.hasOwnProperty.call(DB_ERROR_STATUS, message)) {
    return { code: message, status: DB_ERROR_STATUS[message] };
  }

  return { code: "SONG_OPERATION_FAILED", status: 500 };
}
