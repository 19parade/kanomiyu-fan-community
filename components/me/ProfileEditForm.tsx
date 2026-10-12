"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { countBioCodePoints, MAX_BIO_LENGTH, normalizeBio, validateNormalizedBio } from "@/lib/profile/bio";
import { getTodayLocalISODate, validateFanSince } from "@/lib/profile/fanSince";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

// Mirrors public.profiles' existing profiles_display_name_signup_check
// (supabase/migrations/20260920120721_signup_db_foundation.sql) exactly —
// a client-side pre-check only, same relationship signup-form.tsx has to
// that same constraint. Unlike bio, display_name allows no LF at all.
const DISPLAY_NAME_MAX_LENGTH = 30;
const FORBIDDEN_DISPLAY_NAME_CHARS = /[\u0001-\u001F\u007F]/;

function normalizeDisplayName(value: string): string {
  return value.replace(/^[ 　]+|[ 　]+$/g, "");
}

function validateDisplayName(normalized: string): string | null {
  if (normalized.length < 1 || normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    return `表示名は1〜${DISPLAY_NAME_MAX_LENGTH}文字で入力してください。`;
  }
  if (FORBIDDEN_DISPLAY_NAME_CHARS.test(normalized)) {
    return "表示名に使用できない文字が含まれています（改行は使用できません）。";
  }
  return null;
}

type OwnProfile = {
  username: string;
  display_name: string;
  bio: string | null;
  fan_since: string | null;
};

type FieldErrors = Partial<{ displayName: string; bio: string; fanSince: string }>;

/**
 * F4-C2: inline view/edit toggle for /me. Only display_name/bio/fan_since
 * are ever editable here — username/role/status/email/avatar_url/consent
 * fields are shown as read-only context (or not shown at all in edit
 * mode) and are never part of the update payload.
 *
 * Saves go straight from the browser to Supabase via
 * createSupabaseBrowserClient() (anon/publishable key only — same trust
 * model as login-form.tsx/signup-form.tsx): profiles_update_own's RLS
 * (id = auth.uid() AND is_active_user()) and the column-level GRANT
 * (display_name/avatar_url/bio/fan_since only) are the actual enforcement
 * boundary, not this component. On success, router.refresh() re-fetches
 * app/me/page.tsx's Server Component data — this component never trusts
 * its own optimistic view of what was saved.
 */
export function ProfileEditForm({
  userId,
  profile,
  email,
}: {
  userId: string;
  profile: OwnProfile;
  email: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [justSaved, setJustSaved] = useState(false);

  const [displayNameInput, setDisplayNameInput] = useState(profile.display_name);
  const [bioInput, setBioInput] = useState(profile.bio ?? "");
  const [fanSinceInput, setFanSinceInput] = useState(profile.fan_since ?? "");

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const bioCodePointCount = countBioCodePoints(normalizeBio(bioInput));

  function enterEditMode() {
    setDisplayNameInput(profile.display_name);
    setBioInput(profile.bio ?? "");
    setFanSinceInput(profile.fan_since ?? "");
    setFieldErrors({});
    setFormError(null);
    setJustSaved(false);
    setMode("edit");
  }

  function cancelEdit() {
    // Discard all in-progress edits — no network call. Values revert to
    // the last-saved props (profile.*), not whatever was typed.
    setDisplayNameInput(profile.display_name);
    setBioInput(profile.bio ?? "");
    setFanSinceInput(profile.fan_since ?? "");
    setFieldErrors({});
    setFormError(null);
    setMode("view");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const normalizedDisplayName = normalizeDisplayName(displayNameInput);
    const normalizedBio = normalizeBio(bioInput);
    const fanSinceResult = validateFanSince(fanSinceInput);

    const errors: FieldErrors = {};
    const displayNameError = validateDisplayName(normalizedDisplayName);
    if (displayNameError) {
      errors.displayName = displayNameError;
    }
    const bioError = validateNormalizedBio(normalizedBio);
    if (bioError) {
      errors.bio = bioError;
    }
    if (fanSinceResult.error) {
      errors.fanSince = fanSinceResult.error;
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setPending(true);

    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (clientError) {
      console.error("profile edit: failed to create Supabase browser client", clientError);
      setFormError("保存できませんでした。しばらくしてから再度お試しください。");
      setPending(false);
      return;
    }

    // Explicit 3-key object literal — never a spread of form/component
    // state, so no extra field (role/status/username/etc.) can ever reach
    // this call even by accident. The column-level GRANT on
    // public.profiles only permits authenticated to UPDATE
    // display_name/avatar_url/bio/fan_since in the first place (F4-C
    // design report), so any attempt to include another column would be
    // rejected by the DB wholesale — this literal is defense-in-depth on
    // top of that, not the only safeguard.
    const payload = {
      display_name: normalizedDisplayName,
      bio: normalizedBio,
      fan_since: fanSinceResult.value,
    };

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", userId)
        .select("id");

      if (error) {
        console.error("profile edit: update failed", error.code, error.message);
        const message =
          error.code === "23514"
            ? "入力内容をご確認ください（文字数や形式が正しくない可能性があります）。"
            : "保存できませんでした。しばらくしてから再度お試しください。";
        setFormError(message);
        setPending(false);
        return;
      }

      // A successful request with zero affected rows is NOT success: RLS
      // (profiles_update_own's USING clause) silently excludes any row
      // that doesn't satisfy `id = auth.uid() AND is_active_user()` —
      // e.g. the account was suspended/banned in the moments between
      // loading this form and submitting it. Supabase/PostgREST returns
      // this as an empty `data` array with no `error`, so checking only
      // `!error` would wrongly report success here.
      if (!data || data.length === 0) {
        setFormError("保存できませんでした。アカウントの状態をご確認いただくか、しばらくしてから再度お試しください。");
        setPending(false);
        return;
      }

      setPending(false);
      setJustSaved(true);
      setMode("view");
      // Re-fetch app/me/page.tsx's Server Component data from the DB —
      // this component never assumes the payload it sent is what actually
      // got stored (the DB-side CHECK/trigger logic is the source of
      // truth for the displayed values).
      router.refresh();
    } catch (fetchError) {
      console.error("profile edit: request threw", fetchError);
      setFormError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
    }
  }

  const avatarLabel = mode === "edit" ? (normalizeDisplayName(displayNameInput) || profile.display_name) : profile.display_name;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-accent/20 text-lg font-bold text-brand">
            {avatarLabel.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold">{mode === "edit" ? normalizeDisplayName(displayNameInput) || "（未入力）" : profile.display_name}</p>
            <p className="truncate text-sm text-muted">@{profile.username}</p>
          </div>
        </div>
        {mode === "view" ? (
          <button type="button" onClick={enterEditMode} className={buttonClassName("secondary", "w-full sm:w-auto")}>
            プロフィールを編集
          </button>
        ) : null}
      </div>

      {justSaved && mode === "view" ? (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          保存しました。
        </p>
      ) : null}

      {mode === "view" ? (
        <dl className="mt-6 flex flex-col gap-4 border-t border-border pt-6 text-sm">
          {email ? (
            <div>
              <dt className="font-bold text-muted">メールアドレス</dt>
              <dd className="mt-1">{email}</dd>
            </div>
          ) : null}
          {profile.bio ? (
            <div>
              <dt className="font-bold text-muted">自己紹介</dt>
              <dd className="mt-1 whitespace-pre-wrap">{profile.bio}</dd>
            </div>
          ) : null}
          {profile.fan_since ? (
            <div>
              <dt className="font-bold text-muted">ファン歴</dt>
              <dd className="mt-1">{profile.fan_since}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4 border-t border-border pt-6">
          <div>
            <label htmlFor="profile-display-name" className="block text-sm font-bold">
              表示名
            </label>
            <input
              id="profile-display-name"
              type="text"
              required
              disabled={pending}
              value={displayNameInput}
              onChange={(event) => setDisplayNameInput(event.target.value)}
              className={INPUT_CLASS}
            />
            {fieldErrors.displayName ? (
              <p role="alert" className="mt-1 text-sm text-rose-600">
                {fieldErrors.displayName}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="profile-bio" className="block text-sm font-bold">
              自己紹介
            </label>
            <textarea
              id="profile-bio"
              rows={5}
              disabled={pending}
              value={bioInput}
              onChange={(event) => setBioInput(event.target.value)}
              className={INPUT_CLASS}
            />
            <p className={`mt-1 text-right text-xs ${bioCodePointCount > MAX_BIO_LENGTH ? "text-rose-600" : "text-muted"}`}>
              {bioCodePointCount}/{MAX_BIO_LENGTH}文字
            </p>
            {fieldErrors.bio ? (
              <p role="alert" className="mt-1 text-sm text-rose-600">
                {fieldErrors.bio}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="profile-fan-since" className="block text-sm font-bold">
              ファン歴
            </label>
            <input
              id="profile-fan-since"
              type="date"
              disabled={pending}
              value={fanSinceInput}
              max={getTodayLocalISODate()}
              onChange={(event) => setFanSinceInput(event.target.value)}
              className={INPUT_CLASS}
            />
            {fieldErrors.fanSince ? (
              <p role="alert" className="mt-1 text-sm text-rose-600">
                {fieldErrors.fanSince}
              </p>
            ) : null}
          </div>

          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            自己紹介・ファン歴は、ログインしていない方を含め、誰でも閲覧できます。住所・電話番号・学校名などの個人情報は入力しないでください。
          </p>

          {formError ? (
            <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {formError}
            </p>
          ) : null}

          <div className="flex gap-3">
            <button type="submit" disabled={pending} className={buttonClassName("primary", "flex-1")}>
              {pending ? "保存中..." : "保存"}
            </button>
            <button type="button" onClick={cancelEdit} disabled={pending} className={buttonClassName("secondary", "flex-1")}>
              キャンセル
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
