"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LinkState = "checking" | "ready" | "invalid";

function passwordError(password: string, confirmation: string) {
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "رمز جدید باید حداقل ۸ نویسه و شامل حرف بزرگ، حرف کوچک و عدد باشد.";
  }
  if (password !== confirmation) return "تکرار رمز عبور با رمز جدید یکسان نیست.";
  return null;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    async function initializeRecoverySession() {
      if (!client) return setLinkState("invalid");
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      let error: Error | null = null;

      if (code) {
        const result = await client.auth.exchangeCodeForSession(code);
        error = result.error;
      } else if (tokenHash) {
        const result = await client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        error = result.error;
      } else if (hash.get("access_token") && hash.get("refresh_token")) {
        const result = await client.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! });
        error = result.error;
      } else {
        const result = await client.auth.getSession();
        if (!result.data.session) error = new Error("missing recovery session");
      }

      if (!active) return;
      if (error) {
        setMessage("این لینک بازیابی معتبر نیست یا زمان آن گذشته است.");
        setLinkState("invalid");
        return;
      }
      window.history.replaceState({}, "", "/reset-password");
      setLinkState("ready");
    }
    initializeRecoverySession();
    return () => { active = false; };
  }, [client]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || linkState !== "ready") return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmPassword") ?? "");
    const validationError = passwordError(password, confirmation);
    if (validationError) return setMessage(validationError);
    setPending(true);
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      setPending(false);
      setMessage("تغییر رمز عبور ناموفق بود. یک لینک بازیابی تازه درخواست کنید.");
      return;
    }
    await client.auth.signOut();
    router.replace("/login?reset=success");
  }

  if (linkState === "checking") return <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />در حال بررسی لینک بازیابی...</div>;
  if (linkState === "invalid") return <div className="space-y-4"><div role="alert" className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm leading-7 text-red-100">{message}</div><Link href="/forgot-password" className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">درخواست لینک جدید</Link></div>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm"><span className="mb-1.5 flex items-center gap-2 text-muted-foreground"><LockKeyhole className="h-4 w-4" />رمز عبور جدید</span><input name="password" type="password" autoComplete="new-password" dir="ltr" className={inputClass} required /></label>
      <label className="block text-sm"><span className="mb-1.5 block text-muted-foreground">تکرار رمز عبور جدید</span><input name="confirmPassword" type="password" autoComplete="new-password" dir="ltr" className={inputClass} required /></label>
      {message ? <div role="alert" className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs leading-6 text-red-100">{message}</div> : null}
      <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{pending ? "در حال تغییر رمز..." : "ثبت رمز عبور جدید"}</button>
    </form>
  );
}

const inputClass = "h-11 w-full rounded-md border border-[#2f3d58] bg-[#0d1522] px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
