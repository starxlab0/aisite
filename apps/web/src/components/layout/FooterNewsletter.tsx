"use client";

import { FormEvent, useState } from "react";
import { track } from "@/lib/analytics/events";
import { getLocalizedCopy } from "@/lib/site/copy";
import type { SupportedLocaleKey } from "@/lib/site/locale-routing";

type Props = {
  brandName: string;
  localeKey: SupportedLocaleKey;
};

export function FooterNewsletter({ brandName, localeKey }: Props) {
  const copy = getLocalizedCopy(localeKey).newsletter;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus("error");
      setMessage(copy.emptyEmail);
      return;
    }

    setStatus("submitting");
    setMessage(null);

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          source: "footer",
          placement: "site_footer",
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        setStatus("error");
        setMessage(copy.submitError);
        return;
      }

      track("subscribe_newsletter", {
        targetType: "site",
        targetId: "newsletter",
        placement: "site_footer",
      });
      setStatus("success");
      setMessage(copy.submitSuccess(brandName));
      setEmail("");
    } catch {
      setStatus("error");
      setMessage(copy.submitError);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:max-w-md">
      <p className="text-sm font-medium text-zinc-900">{copy.title}</p>
      <p className="mt-1 text-sm text-zinc-600">
        {copy.description}
      </p>
      <form className="mt-3 flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 flex-1 rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-900"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {status === "submitting" ? copy.submitPending : copy.submitIdle}
        </button>
      </form>
      {message ? (
        <p className={`mt-2 text-xs ${status === "success" ? "text-emerald-700" : "text-red-600"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
