"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

// Resolve dark mode for conditional assets
const getResolvedDark = () => {
  if (typeof window === "undefined") return false;
  const theme = document.documentElement.getAttribute("data-theme");
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  return theme === "dark" || (theme === "system" && mq.matches);
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // Fire the request but always show success — never reveal whether
    // the email is registered or expose backend errors (security + UX).
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      await fetch(`${apiBase}/api/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Network error — still show "check inbox" so user experience is clean.
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  function handleContinue() {
    router.push(`/reset-password?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="flex min-h-screen font-sans" style={{ fontFamily: "Interdisplay, Arial, sans-serif" }}>

      {/* ── Left Panel ── */}
      <div
        className="hidden lg:flex lg:w-1/2 bg-gray-900 flex-col justify-between p-8 lg:p-12 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-blue-600/10" style={{ top: "-100px", right: "-100px", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-blue-500/10" style={{ bottom: "-80px", left: "-80px", width: "300px", height: "300px", background: "radial-gradient(circle, rgba(64,106,228,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

        <Image src="/logo-new-white.png" alt="Astraventa" width={160} height={40} className="h-10 w-auto object-contain object-left" />

        <div className="relative z-2">
          <div className="inline-flex items-center gap-2 bg-blue-600/15 border border-blue-600/30 rounded-full px-4 py-1.5 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-gray-300 text-sm font-medium">FB Sniper — Elite Automation</span>
          </div>
          <h1 className="font-bricolage font-semibold text-4xl lg:text-5xl leading-tight tracking-tight text-white mb-5">
            Secure access,<br /><span className="text-blue-500">zero</span> compromise.
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed font-medium m-0 max-w-md">
            We&apos;ll send a 6-digit code to your inbox. Use it to set a fresh password and get back in.
          </p>
        </div>

        <div className="flex gap-8 lg:gap-10 border-t border-white/10 pt-8 relative z-2">
          {[{ number: "60-day", label: "Token lifetime" }, { number: "100%", label: "Isolated data" }, { number: "∞", label: "Scale" }].map((s) => (
            <div key={s.label}>
              <div className="font-bricolage font-bold text-2xl text-white leading-none mb-1">{s.number}</div>
              <div className="text-gray-500 text-sm font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 bg-white">
        <div className="w-full max-w-sm sm:max-w-md">

          {/* Mobile logo */}
          <div className="flex lg:hidden mb-8">
              <Image src={getResolvedDark() ? "/logo-new-white.png" : "/logo-new.png"} alt="Astraventa" width={140} height={36} className="h-9 w-auto object-contain object-left" />
            </div>

          {!sent ? (
            <>
              <div style={{ marginBottom: "2.5rem" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "0.75rem", backgroundColor: "#f0f4ff", border: "1px solid #dde5ed", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, fontSize: "2rem", lineHeight: "1.2em", letterSpacing: "-1px", color: "#1d1d1d", margin: "0 0 0.625rem 0" }}>
                  Forgot password?
                </h2>
                <p style={{ color: "#4d585f", fontSize: "1rem", fontWeight: 500, margin: 0, lineHeight: "1.5em" }}>
                  Enter your email and we&apos;ll send you a 6-digit reset code.
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", color: "#1d1d1d", fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.5rem" }}>Email address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="sniper-input" />
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <button type="submit" disabled={loading} className="sniper-btn" style={{ opacity: loading ? 0.6 : 1 }}>
                    {loading ? "Sending…" : "Send reset code"}
                  </button>
                </div>
              </form>

              <p style={{ textAlign: "center", color: "#4d585f", fontSize: "0.9375rem", fontWeight: 500, margin: 0 }}>
                Remembered it?{" "}
                <Link href="/signin" style={{ color: "#1d1d1d", fontWeight: 700, textDecoration: "none" }}>Back to sign in</Link>
              </p>
            </>
          ) : (
            /* ── Sent state ── */
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>

              <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, fontSize: "1.75rem", letterSpacing: "-0.75px", color: "#1d1d1d", margin: "0 0 0.75rem 0" }}>
                Check your inbox
              </h2>
              <p style={{ color: "#4d585f", fontSize: "1rem", fontWeight: 500, margin: "0 0 0.375rem 0", lineHeight: "1.6em" }}>
                We sent a 6-digit code to
              </p>
              <p style={{ color: "#1d1d1d", fontWeight: 700, fontSize: "1rem", margin: "0 0 2rem 0" }}>
                {email}
              </p>

              <button onClick={handleContinue} className="sniper-btn" style={{ marginBottom: "1.5rem" }}>
                Enter reset code →
              </button>

              <div style={{ backgroundColor: "#f5f7fa", borderRadius: "0.75rem", border: "1px solid #edf1f4", padding: "1rem 1.25rem", marginBottom: "1.5rem", textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#4d585f", lineHeight: "1.6em" }}>
                  <strong style={{ color: "#1d1d1d" }}>Didn&apos;t receive it?</strong> Check your spam folder, or{" "}
                  <button type="button" onClick={() => { setSent(false); }} style={{ background: "none", border: "none", color: "#3b82f6", fontWeight: 600, cursor: "pointer", padding: 0, fontSize: "0.875rem", fontFamily: "Interdisplay, Arial, sans-serif" }}>
                    try another email
                  </button>.
                </p>
              </div>

              <Link href="/signin" style={{ display: "block", textAlign: "center", color: "#4d585f", fontWeight: 500, fontSize: "0.9375rem", textDecoration: "none" }}>
                ← Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
