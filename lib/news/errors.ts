/**
 * Maps the exact error strings raised by the news RPCs (create_news /
 * update_news / delete_news / get_admin_news / get_admin_news_item /
 * get_public_news / get_public_news_item — see supabase/migrations/
 * 20261108010000_news_public_list.sql through 20261108070000_news_admin_
 * delete.sql) to a stable application error code and HTTP status.
 * Postgres/PostgREST's raw error text is never forwarded to the client for
 * anything not in this table — unrecognized errors fall back to a generic
 * 500.
 *
 * Same approach as lib/events/errors.ts / lib/song-images/errors.ts: the
 * DB's own exception text is reused verbatim as the application's error code.
 */
const DB_ERROR_STATUS: Record<string, number> = {
  NEWS_MANAGEMENT_NOT_AUTHORIZED: 403,
  INVALID_NEWS_TITLE: 400,
  INVALID_NEWS_CONTENT: 400,
  INVALID_NEWS_SOURCE_URL: 400,
  INVALID_NEWS_PUBLISHED_AT: 400,
  INVALID_NEWS_VERSION: 400,
  NEWS_NOT_FOUND: 404,
  NEWS_CONFLICT: 409,
  // get_admin_news() / get_public_news() list query params.
  INVALID_NEWS_STATUS_FILTER: 400,
  INVALID_NEWS_CURSOR: 400,
};

export type MappedNewsDbError = { code: string; status: number };

/**
 * `message` is whatever the Supabase client's `error.message` contains for a
 * failed `rpc()` call. Known news error strings are matched exactly (no
 * substring/fuzzy matching — these RPCs never wrap the exception text in
 * extra prose).
 */
export function mapNewsDbError(message: string | undefined | null): MappedNewsDbError {
  if (message && Object.prototype.hasOwnProperty.call(DB_ERROR_STATUS, message)) {
    return { code: message, status: DB_ERROR_STATUS[message] };
  }

  return { code: "NEWS_OPERATION_FAILED", status: 500 };
}
