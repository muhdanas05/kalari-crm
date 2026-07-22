"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Wordmark } from "@/components/brand/Wordmark";
import { AlertTriangle, Loader2 } from "@/components/icons";
import { signIn, type LoginState } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(signIn, {
    error: null,
  });

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Wordmark className="scale-110" />
        <p className="text-[13px] font-medium text-ink-mid">
          Sign in to your workspace
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-6 shadow-floating">
        <input type="hidden" name="next" value={next ?? "/dashboard"} />

        <div className="flex flex-col gap-4">
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="admin@demo.com"
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
          />

          {state.error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-alert/8 px-3 py-2.5 text-[12.5px] font-medium text-alert"
            >
              <AlertTriangle size={14} className="mt-px shrink-0" />
              {state.error}
            </p>
          )}

          <SubmitButton />
        </div>
      </div>

      {/* §3.20: no self-signup. Say so, so nobody hunts for the link. */}
      <p className="text-center text-[12px] text-ink-faint">
        Accounts are created by your administrator.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
  placeholder,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-line bg-paper px-3.5 text-[14px] font-medium text-ink outline-none transition-colors placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
      />
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending && <Loader2 size={15} className="animate-spin" />}
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
