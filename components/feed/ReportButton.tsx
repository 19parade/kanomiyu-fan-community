"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { reportErrorMessage } from "@/lib/reports/errors";
import { REPORT_DETAIL_MAX_LENGTH, REPORT_REASONS } from "@/lib/reports/reasons";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const TEXTAREA_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

/**
 * F5-D4a: report button + inline form for a post or comment, shared by
 * app/feed/[id]/page.tsx (post) and components/feed/CommentItem.tsx
 * (comment). public.create_report() is the sole authorization boundary —
 * this component never assumes success, never shows any other member's
 * report state, and never implies admin action has happened (PM's explicit
 * "通報が送信されたことと、管理者が対応したことを混同する文言は使わない"
 * requirement: the success message only confirms submission, never
 * resolution).
 *
 * Not rendered for the target's own author (callers pass isOwner-filtered
 * JSX) — self-reporting is also independently rejected by create_report()
 * (SELF_REPORT_NOT_ALLOWED), this is only a UX convenience, never the real
 * boundary. Tampering with targetId client-side cannot bypass anything:
 * create_report() re-derives reporter_id from auth.uid() and re-validates
 * the target's visibility/ownership/block state itself.
 */
export function ReportButton({
  targetType,
  targetId,
  canReport,
  isLoggedOut,
}: {
  targetType: "post" | "comment";
  targetId: string;
  canReport: boolean;
  isLoggedOut: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "form" | "submitted">("idle");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same synchronous-guard reasoning as components/feed/CommentForm.tsx /
  // components/feed/LikeButton.tsx: `pending` state alone cannot prevent
  // several rapid submits in the same tick.
  const submittingRef = useRef(false);

  const detailCodePointCount = Array.from(detail).length;
  const detailOverLimit = detailCodePointCount > REPORT_DETAIL_MAX_LENGTH;

  if (isLoggedOut) {
    return (
      <Link href="/login" className="text-xs font-bold text-muted hover:text-brand hover:underline">
        ログインして通報する
      </Link>
    );
  }

  if (!canReport) {
    return null;
  }

  if (mode === "submitted") {
    return <p className="text-xs text-muted">通報を受け付けました</p>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setError(null);

    if (!reason) {
      setError("通報理由を選択してください。");
      submittingRef.current = false;
      return;
    }
    if (detailOverLimit) {
      setError("詳細は2000文字以内で入力してください。");
      submittingRef.current = false;
      return;
    }

    setPending(true);

    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (clientError) {
      console.error("report button: failed to create Supabase browser client", clientError);
      setError("通報できませんでした。しばらくしてから再度お試しください。");
      setPending(false);
      submittingRef.current = false;
      return;
    }

    try {
      // detail is optional: an empty/whitespace-only textarea is sent as
      // null rather than an empty string, matching create_report()'s own
      // trim-to-null normalization (reports_detail_length_check rejects a
      // bare empty string but allows NULL) — this is defense-in-depth, not
      // a replacement for the RPC's own normalization.
      const trimmedDetail = detail.trim();
      const { error: rpcError } = await supabase.rpc("create_report", {
        target_type: targetType,
        target_id: targetId,
        reason,
        detail: trimmedDetail.length > 0 ? trimmedDetail : null,
      });

      if (rpcError) {
        console.error("report button: create_report failed", rpcError.message);
        setError(reportErrorMessage(rpcError.message));
        setPending(false);
        submittingRef.current = false;
        return;
      }

      // Success: the RPC returned the new reports.id (not used here — this
      // UI never displays or links to the report record itself). Moves to
      // a terminal "submitted" state so this session cannot submit a
      // second report for the same target; a reload hitting
      // REPORT_ALREADY_EXISTS is the DB-level backstop, not this state.
      setMode("submitted");
      setPending(false);
    } catch (fetchError) {
      console.error("report button: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

  if (mode === "idle") {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode("form");
        }}
        className="text-xs font-bold text-muted hover:text-rose-700 hover:underline"
      >
        通報
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 rounded-xl border border-border bg-surface px-3 py-3"
      aria-label={targetType === "post" ? "投稿を通報" : "コメントを通報"}
    >
      <p className="text-xs font-bold">通報する</p>

      <label className="mt-2 block text-xs font-bold">
        理由
        <select
          required
          disabled={pending}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          <option value="" disabled>
            選択してください
          </option>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-2 block text-xs font-bold">
        詳細（任意）
        <textarea
          rows={3}
          disabled={pending}
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          className={TEXTAREA_CLASS}
          placeholder="具体的な内容があればご記入ください"
        />
      </label>
      <p className={`text-right text-xs ${detailOverLimit ? "text-rose-600" : "text-muted"}`}>
        {detailCodePointCount}/{REPORT_DETAIL_MAX_LENGTH}文字
      </p>

      {error ? (
        <p role="alert" aria-live="polite" className="mt-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClassName("primary", "px-4 py-1.5 text-xs")}>
          {pending ? "送信中..." : "通報する"}
        </button>
        <button
          type="button"
          onClick={() => {
            submittingRef.current = false;
            setError(null);
            setReason("");
            setDetail("");
            setMode("idle");
          }}
          disabled={pending}
          className={buttonClassName("ghost", "px-4 py-1.5 text-xs")}
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
