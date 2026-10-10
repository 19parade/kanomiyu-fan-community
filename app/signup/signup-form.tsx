"use client";

import { useState, type FormEvent } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Mirrors public.handle_new_user()'s own validation exactly (see
// supabase/migrations/20260920120721_signup_db_foundation.sql) — a
// client-side pre-check only. The trigger remains the sole authority; a
// value that passes here can still be rejected server-side (and this app
// never assumes otherwise).
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_]{2,19}$/;
// UX-only shape check (not RFC 5322) — Supabase Auth's own server-side
// validation (mapped via `email_address_invalid` below) remains the real
// authority on what counts as a valid email.
const EMAIL_SHAPE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "moderator",
  "mod",
  "official",
  "staff",
  "support",
  "system",
  "root",
  "kanomiyu",
  "kano_miyu",
]);
const DISPLAY_NAME_MAX_LENGTH = 30;
// Supabase Auth's project-level minimum (observed in the Auth > Providers >
// Email settings during an earlier phase) — a UX hint only; Auth itself is
// the authoritative enforcement point, not this constant.
const PASSWORD_MIN_LENGTH = 6;

/**
 * Trigger error codes this form can receive back from signUp() when
 * public.handle_new_user() raises inside the same transaction as the
 * auth.users insert (confirmed empirically this phase — see the F1 report's
 * "エラーハンドリング" section for exactly what the client actually
 * receives, since GoTrue does not always forward the raw trigger exception
 * text verbatim).
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Supabase Auth's own error codes (@supabase/auth-js's ErrorCode union,
  // confirmed from node_modules/@supabase/auth-js/dist/module/lib/
  // error-codes.d.ts — not guessed). These come through with a real `code`.
  weak_password: `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`,
  email_address_invalid: "メールアドレスの形式を確認してください。",
  validation_failed: "入力内容を確認してください。",
  over_email_send_rate_limit: "しばらく時間をおいてから再度お試しください。",
  over_request_rate_limit: "しばらく時間をおいてから再度お試しください。",
  signup_disabled: "現在会員登録を受け付けていません。",
  // Empirically confirmed this phase (real signUp() calls against this
  // project): when public.handle_new_user() raises inside the AFTER INSERT
  // trigger — for ANY reason (reserved username, bad format, duplicate
  // username, etc.) — GoTrue does NOT forward the raw SIGNUP_* exception
  // text to the client. Every case instead comes back as `code: undefined`,
  // `status: 500`, `message: "Database error saving new user"`. The
  // SIGNUP_* keys below are therefore dead code against the current
  // Supabase/GoTrue behavior — kept only as defensive forward-compatibility
  // in case that ever changes, and never relied upon. See the F1 report's
  // "エラーハンドリング" section.
  SIGNUP_INVALID_USERNAME: "ユーザー名を確認してください（半角英小文字・数字・アンダースコアで3〜20文字、先頭は英小文字か数字）。",
  SIGNUP_RESERVED_USERNAME: "このユーザー名は使用できません。別のユーザー名を入力してください。",
  SIGNUP_INVALID_DISPLAY_NAME: "表示名を確認してください（1〜30文字、前後に空白を含めないでください）。",
  SIGNUP_POLICY_CONSENT_REQUIRED: "利用規約とプライバシーポリシーへの同意が必要です。",
  SIGNUP_INVALID_METADATA: "入力内容を確認してください。",
  SIGNUP_POLICY_CONFIG_ERROR: "現在会員登録を受け付けできません。しばらくしてから再度お試しください。",
  // The actual generic wrapper message GoTrue returns for any trigger
  // failure. Since this form's own client-side validation already matches
  // handle_new_user()'s username/display_name rules before calling
  // signUp(), the most likely real-world cause of a user still hitting this
  // after passing that pre-check is a duplicate username (the one
  // constraint client-side code cannot check in advance) — phrased as a
  // possibility, not asserted as fact, since the DB truly does not
  // distinguish the reason at this layer.
  "Database error saving new user":
    "登録できませんでした。入力したユーザー名が既に使用されている可能性があります。別のユーザー名でお試しください。",
};
const GENERIC_ERROR_MESSAGE = "登録できませんでした。しばらくしてから再度お試しください。";
const NETWORK_ERROR_MESSAGE = "通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。";

type FieldErrors = Partial<{
  email: string;
  password: string;
  confirmPassword: string;
  username: string;
  displayName: string;
  consent: string;
}>;

function normalizeUsername(value: string): string {
  return value.trim();
}

function normalizeDisplayName(value: string): string {
  // Trims half-width (U+0020) and full-width (U+3000) space only —
  // mirrors handle_new_user()'s own btrim() call exactly.
  return value.replace(/^[ 　]+|[ 　]+$/g, "");
}

/**
 * General member signup form (F1). Submits directly to Supabase Auth's own
 * `signUp()` via the browser client (anon/publishable key only — never
 * service_role). The only metadata sent is `username` / `display_name` /
 * `policy_consent`: public.handle_new_user() (unchanged) reads exactly
 * these three keys and nothing else — `role`, `status`, `terms_version`,
 * and `privacy_policy_version` are never read from client-supplied
 * metadata at all (confirmed by re-reading the trigger's source this
 * phase), so there is no path by which this form could request a
 * privileged role/status even if it tried to.
 *
 * Two separate checkboxes are shown (利用規約 / プライバシーポリシー) to
 * match PROJECT_SPEC's field list, but the DB contract only has one
 * combined signal (`policy_consent: boolean`) — both must be checked
 * before that single flag is sent as `true`.
 */
export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};

    if (email.trim() === "") {
      errors.email = "メールアドレスを入力してください。";
    } else if (!EMAIL_SHAPE_PATTERN.test(email.trim())) {
      errors.email = "メールアドレスの形式を確認してください。";
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.password = `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`;
    }

    if (confirmPassword !== password) {
      errors.confirmPassword = "パスワードが一致しません。";
    }

    const normalizedUsername = normalizeUsername(username);
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      errors.username = "ユーザー名は半角英小文字・数字・アンダースコアで3〜20文字、先頭は英小文字か数字にしてください。";
    } else if (RESERVED_USERNAMES.has(normalizedUsername)) {
      errors.username = "このユーザー名は使用できません。別のユーザー名を入力してください。";
    }

    const normalizedDisplayName = normalizeDisplayName(displayName);
    if (normalizedDisplayName.length < 1 || normalizedDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
      errors.displayName = `表示名は1〜${DISPLAY_NAME_MAX_LENGTH}文字で入力してください。`;
    }

    if (!agreeTerms || !agreePrivacy) {
      errors.consent = "利用規約とプライバシーポリシーの両方に同意してください。";
    }

    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validate();
    setFieldErrors(errors);
    setError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setPending(true);

    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (clientError) {
      console.error("signup: failed to create Supabase browser client", clientError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
      return;
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: normalizeUsername(username),
            display_name: normalizeDisplayName(displayName),
            policy_consent: true,
          },
        },
      });

      if (signUpError) {
        console.error("signup: signUp() returned an error", signUpError.code, signUpError.status, signUpError.message);
        const mapped =
          (signUpError.code && ERROR_MESSAGES[signUpError.code]) ??
          ERROR_MESSAGES[signUpError.message];
        setError(mapped ?? GENERIC_ERROR_MESSAGE);
        setPending(false);
        return;
      }

      // Anti-enumeration (F1 §9): Supabase Auth returns a 200 with an empty
      // `identities` array, not an error, when the email is already
      // registered — this form shows the exact same success message in
      // both cases, so an attacker learns nothing from the response.
      void data;

      setSuccess(true);
      setPending(false);
    } catch (fetchError) {
      console.error("signup: request failed", fetchError);
      setError(NETWORK_ERROR_MESSAGE);
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="mt-6" role="status" aria-live="polite">
        <p>
          ご登録ありがとうございます。確認メールを送信しましたので、メール内のリンクから登録を完了してください。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium">
          メールアドレス
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {fieldErrors.email ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium">
          パスワード
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="signup-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            disabled={pending}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border px-3 py-2"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={pending}
            className="shrink-0 rounded border px-2 py-2 text-xs"
            aria-pressed={showPassword}
          >
            {showPassword ? "隠す" : "表示"}
          </button>
        </div>
        {fieldErrors.password ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="signup-confirm-password" className="block text-sm font-medium">
          パスワード（確認）
        </label>
        <input
          id="signup-confirm-password"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          disabled={pending}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {fieldErrors.confirmPassword ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {fieldErrors.confirmPassword}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="signup-username" className="block text-sm font-medium">
          ユーザー名
        </label>
        <input
          id="signup-username"
          name="username"
          type="text"
          autoComplete="off"
          required
          disabled={pending}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        <p className="mt-1 text-xs text-gray-500">
          半角英小文字・数字・アンダースコアのみ、3〜20文字。登録後は変更できません。今後提供予定のプロフィール機能（準備中）で使われる場合があります。
        </p>
        {fieldErrors.username ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {fieldErrors.username}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="signup-display-name" className="block text-sm font-medium">
          表示名
        </label>
        <input
          id="signup-display-name"
          name="displayName"
          type="text"
          autoComplete="off"
          required
          disabled={pending}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        {fieldErrors.displayName ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {fieldErrors.displayName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreeTerms}
            disabled={pending}
            onChange={(event) => setAgreeTerms(event.target.checked)}
            className="mt-1"
          />
          <a href="/terms" target="_blank" rel="noreferrer" className="text-blue-600 underline">
            利用規約
          </a>
          に同意します
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreePrivacy}
            disabled={pending}
            onChange={(event) => setAgreePrivacy(event.target.checked)}
            className="mt-1"
          />
          <a href="/privacy" target="_blank" rel="noreferrer" className="text-blue-600 underline">
            プライバシーポリシー
          </a>
          に同意します
        </label>
        {fieldErrors.consent ? (
          <p role="alert" className="text-sm text-red-600">
            {fieldErrors.consent}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
      >
        {pending ? "登録中..." : "会員登録"}
      </button>
    </form>
  );
}
