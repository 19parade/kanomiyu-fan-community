"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { buttonClassName } from "@/components/ui/Button";

type ParticipationValue = "going" | "attended" | "cancelled";

const STATUS_LABEL: Record<ParticipationValue, string> = {
  going: "参加予定",
  attended: "参加済み",
  cancelled: "キャンセル済み",
};

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "ログインしてください。",
  FORBIDDEN: "この操作はできません。",
  EVENT_PARTICIPATION_NOT_AUTHORIZED: "この操作はできません。",
  INVALID_PARTICIPATION_STATUS: "選択内容を確認してください。",
  EVENT_NOT_AVAILABLE_FOR_PARTICIPATION: "このLIVEには参加登録できません。",
  EVENT_NOT_AVAILABLE_FOR_ATTENDANCE: "開催前は「参加済み」を選択できません。",
  INVALID_PARTICIPATION_TRANSITION: "その状態には変更できません。",
};
const GENERIC_ERROR_MESSAGE = "操作できませんでした。しばらくしてから再度お試しください。";
const NETWORK_ERROR_MESSAGE = "通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。";

/**
 * LIVE機能 Phase 2: /live/[id]'s own-participation widget. Mirrors
 * components/feed/LikeButton.tsx's shape (Client Component, double-submit
 * guard via a ref, optimistic-on-success state update, inline error text)
 * but talks to app/api/live/[id]/participation/route.ts (a thin wrapper
 * around set_my_event_participation()) rather than the table directly,
 * since that RPC — not a raw insert/delete — is the only write boundary for
 * event_participants (PROJECT_SPEC.md 6.6).
 *
 * PROJECT_SPEC.md 6.6 has no fourth "unregistered" status value and no
 * physical DELETE — a row simply not existing yet is this component's only
 * "未選択" state, and the DB's one way to undo an existing registration is
 * status='cancelled'. So the 「未選択（登録解除）」option the PM asked for is
 * implemented as: no row yet → shown as 未選択 (nothing to press to reach
 * it, it's just the starting state); an existing row → the only "undo"
 * action offered is the cancel button, which sets status='cancelled'. This
 * is a deliberate scope decision, not a bug — see this phase's report.
 */
export function ParticipationStatus({
  eventId,
  eventStatus,
  eventDate,
  initialParticipation,
  isLoggedIn,
  participantCount,
}: {
  eventId: string;
  eventStatus: "public" | "cancelled";
  eventDate: string;
  initialParticipation: { status: ParticipationValue } | null;
  isLoggedIn: boolean;
  // get_event_participant_count() RPC の結果（status='going'の全件数、
  // visibilityは問わない — PM方針2026-10-28）。ページ表示時点のスナップ
  // ショットで、この場で参加予定にしても即座には増減しない（再読み込みで
  // 反映される）。
  participantCount: number;
}) {
  const [participation, setParticipation] = useState(initialParticipation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  // Date.now() is impure, so it must not be called directly in the render
  // body (react-hooks/purity) — compute it once via a lazy useState
  // initializer instead (reactivity isn't needed: a page left open across
  // the event's start time can simply be reloaded). Hooks must run
  // unconditionally, so this sits above the isLoggedIn early return even
  // though the logged-out branch never reads it.
  //
  // Also doubles as "has this LIVE already ended" (same event_date < now()
  // boundary app/live/(list)/page.tsx uses to split 開催予定/開催終了 — see
  // that page's own query) per PM方針2026-10-31: once ended, 「参加予定に
  // する」is hidden (only 参加済みにする remains) and the headline count
  // switches from 参加予定 to 参加者.
  const [canAttend] = useState(() => new Date(eventDate).getTime() <= Date.now());

  if (!isLoggedIn) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">参加ステータス</h2>
          <span className="text-sm text-muted">
            {canAttend ? "参加者" : "参加予定"}：{participantCount}名
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">
          <Link href={`/login?next=/live/${eventId}`} className="font-bold text-brand underline-offset-2 hover:underline">
            ログイン
          </Link>
          すると、参加表明ができます。
        </p>
      </section>
    );
  }

  const currentLabel = participation ? STATUS_LABEL[participation.status] : "未選択";
  const hasActiveRegistration = participation !== null && participation.status !== "cancelled";

  async function updateStatus(newStatus: ParticipationValue) {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/live/${eventId}/participation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_status: newStatus }),
      });

      if (!response.ok) {
        let code = "EVENT_OPERATION_FAILED";
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) {
            code = body.error;
          }
        } catch {
          // no-op: fall back to the generic code below.
        }
        setError(ERROR_MESSAGES[code] ?? GENERIC_ERROR_MESSAGE);
        setPending(false);
        submittingRef.current = false;
        return;
      }

      const result = (await response.json()) as { status: ParticipationValue };
      setParticipation({ status: result.status });
      setPending(false);
      submittingRef.current = false;
    } catch (fetchError) {
      console.error("participation status: request threw", fetchError);
      setError(NETWORK_ERROR_MESSAGE);
      setPending(false);
      submittingRef.current = false;
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">参加ステータス</h2>
        <span className="text-sm text-muted">
          {canAttend ? "参加者" : "参加予定"}：{participantCount}名
        </span>
      </div>

      {eventStatus === "cancelled" ? (
        <>
          <p className="mt-2 text-sm text-muted">このLIVEは中止されました。</p>
          {participation === null ? (
            <p className="mt-3 text-sm text-muted">このLIVEへの新規の参加登録はできません。</p>
          ) : participation.status === "cancelled" ? (
            <p className="mt-3 text-sm text-muted">参加登録はキャンセル済みです。</p>
          ) : (
            <>
              <p className="mt-3 text-sm">現在の状態: {currentLabel}</p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void updateStatus("cancelled")}
                  disabled={pending}
                  className={buttonClassName("secondary", "px-4 py-2 text-sm")}
                >
                  {pending ? "処理中..." : "キャンセルする"}
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm">現在の状態: {currentLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!canAttend ? (
              <button
                type="button"
                onClick={() => void updateStatus("going")}
                disabled={pending}
                aria-pressed={participation?.status === "going"}
                className={buttonClassName(participation?.status === "going" ? "primary" : "secondary", "px-4 py-2 text-sm")}
              >
                参加予定にする
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void updateStatus("attended")}
              disabled={pending || !canAttend}
              aria-pressed={participation?.status === "attended"}
              title={canAttend ? undefined : "開催後に選択できます"}
              className={buttonClassName(participation?.status === "attended" ? "primary" : "secondary", "px-4 py-2 text-sm")}
            >
              参加済みにする
            </button>
            {hasActiveRegistration ? (
              <button
                type="button"
                onClick={() => void updateStatus("cancelled")}
                disabled={pending}
                className={buttonClassName("ghost", "px-4 py-2 text-sm")}
              >
                キャンセルする
              </button>
            ) : null}
          </div>
          {!canAttend ? <p className="mt-2 text-xs text-muted">「参加済み」は開催後に選択できます。</p> : null}
        </>
      )}

      {error ? (
        <p role="alert" aria-live="polite" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
