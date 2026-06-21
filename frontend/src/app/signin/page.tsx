"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function resolveAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already been registered"))
    return "This email is already registered with email & password. Sign in below — then link Google from Settings.";
  if (lower.includes("email not confirmed"))
    return "Please verify your email before signing in.";
  if (lower.includes("invalid login") || lower.includes("invalid credentials"))
    return "Incorrect email or password.";
  if (lower === "auth_callback_failed")
    return "Google sign-in failed. Make sure Google is enabled in your Supabase project and the redirect URL is whitelisted.";
  return raw; // show the actual error so we know what's happening
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      setError(resolveAuthError(decodeURIComponent(authError)));
      // Remove query param so refresh doesn't re-show the error
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Check 2FA before entering dashboard (with timeout to prevent delays)
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      );
      
      const statusPromise = fetch(`${apiBase}/api/auth/2fa-status/${data.user.id}`)
        .then(r => r.json());
      
      const status = await Promise.race([statusPromise, timeoutPromise]);
      
      if (status && status.two_fa_enabled) {
        router.push("/2fa-challenge");
        return;
      }
    } catch {
      // If 2FA check fails or times out, proceed to dashboard
      console.log('2FA check failed or timed out, proceeding to dashboard');
    }

    router.push("/dashboard");
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen font-sans" style={{ fontFamily: "Interdisplay, Arial, sans-serif" }}>

      {/* Left Panel — Dark / Brand */}
      <div
        className="hidden lg:flex lg:w-1/2 bg-gray-900 flex-col justify-between p-8 lg:p-12 relative overflow-hidden"
      >
        {/* Background decoration */}
        <div
          className="absolute top-0 right-0 w-96 h-96 rounded-full bg-blue-600/10"
          style={{
            top: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-blue-500/10"
          style={{
            bottom: "-80px",
            left: "-80px",
            width: "300px",
            height: "300px",
            background: "radial-gradient(circle, rgba(64,106,228,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <div>
          <Image src="/logo-new-white.png" alt="Astraventa" width={160} height={40} className="h-10 w-auto object-contain object-left" />
        </div>

        {/* Hero text */}
        <div className="relative z-2">
          <div
            className="inline-flex items-center gap-2 bg-blue-600/15 border border-blue-600/30 rounded-full px-4 py-1.5 mb-6"
          >
            <div
              className="w-1.5 h-1.5 rounded-full bg-green-500"
            />
            <span className="text-gray-300 text-sm font-medium">
              FB Sniper — Elite Automation
            </span>
          </div>

          <h1
            className="font-bricolage font-semibold text-4xl lg:text-5xl leading-tight tracking-tight text-white mb-5"
          >
            Automate Facebook.
            <br />
            <span className="text-blue-500">Dominate</span> the feed.
          </h1>

          <p
            className="text-gray-400 text-lg leading-relaxed font-medium m-0 max-w-md"
          >
            Connect your Meta account, define your targets, and let the Sniper Engine handle the rest. Precision automation for elite operators.
          </p>
        </div>

        {/* Bottom stats */}
        <div
          className="flex gap-8 lg:gap-10 border-t border-white/10 pt-8 relative z-2"
        >
          {[
            { number: "60-day", label: "Token lifetime" },
            { number: "100%", label: "Isolated data" },
            { number: "∞", label: "Scale" },
          ].map((stat) => (
            <div key={stat.label}>
              <div
                className="font-bricolage font-bold text-2xl text-white leading-none mb-1"
              >
                {stat.number}
              </div>
              <div className="text-gray-500 text-sm font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel — Form */}
      <div
        className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 bg-white"
      >
        <div className="w-full max-w-sm sm:max-w-md">

          {/* Mobile logo */}
          <div
            className="flex lg:hidden mb-8"
          >
            <Image
              src="/logo-new.png"
              alt="Astraventa"
              width={140}
              height={36}
              className="h-9 w-auto object-contain object-left"
            />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2
              className="font-bricolage font-semibold text-2xl sm:text-3xl leading-tight tracking-tight text-gray-900 mb-2"
            >
              Welcome back
            </h2>
            <p className="text-gray-600 text-base font-medium m-0">
              Sign in to your Sniper dashboard
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div
              className="rounded-lg bg-red-50/80 border border-red-200/50 text-red-700 p-3 sm:p-4 text-sm font-medium mb-5"
            >
              {error}
            </div>
          )}

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="sniper-btn-outline mb-6"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div
            className="flex items-center gap-4 mb-6"
          >
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-500 text-sm font-medium">
              or continue with email
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Form */}
          <form onSubmit={handleSignIn}>
            <div className="mb-4">
              <label
                className="block text-gray-900 text-sm font-semibold mb-2"
              >
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="sniper-input"
              />
            </div>

            <div className="mb-3">
              <div className="flex justify-between items-center mb-2">
                <label
                  className="text-gray-900 text-sm font-semibold"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-blue-600 text-sm font-semibold hover:text-blue-700 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="sniper-input"
              />
            </div>

            <div className="mb-8 mt-6">
              <button
                type="submit"
                disabled={loading}
                className="sniper-btn w-full"
                style={{ opacity: loading ? 0.6 : 1 }}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </form>

          {/* Sign up link */}
          <p
            className="text-center text-gray-600 text-sm font-medium m-0"
          >
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-gray-900 font-bold hover:text-gray-700 transition-colors"
            >
              Create one free
            </Link>
          </p>

          {/* Terms link */}
          <p
            className="text-center text-gray-500 text-sm font-medium mt-4 mb-0"
          >
            By signing in, you agree to our{" "}
            <Link
              href="/terms"
              className="text-blue-600 font-semibold hover:text-blue-700 transition-colors"
            >
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
