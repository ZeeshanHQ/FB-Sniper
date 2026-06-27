import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const APP_ID       = process.env.META_APP_ID!;
const APP_SECRET   = process.env.META_APP_SECRET!;
const SUPABASE_URL = "https://rqpslulmmzlxnfkpphpg.supabase.co";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(request: NextRequest) {
  const { access_token: shortToken, user_id: userId } = await request.json();

  if (!shortToken || !userId) {
    return NextResponse.json({ success: false, error: "missing_params" }, { status: 400 });
  }

  try {
    // ── Exchange short-lived → long-lived (~60 days) ─────────────────────────
    const longRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}` +
      `&client_secret=${APP_SECRET}` +
      `&fb_exchange_token=${shortToken}`
    );
    const longData = await longRes.json();

    if (longData.error) {
      console.error("[exchange-token] long-lived error:", longData.error);
      return NextResponse.json({ success: false, error: "exchange_failed", details: longData.error.message });
    }

    const finalToken = longData.access_token ?? shortToken;
    const expiresIn  = longData.expires_in   ?? 5183944; // 60-day fallback

    // ── Fetch Meta user info ──────────────────────────────────────────────────
    const meRes  = await fetch(`https://graph.facebook.com/me?fields=id,name&access_token=${finalToken}`);
    const meData = await meRes.json();

    // ── Save to Supabase (service key bypasses RLS) ───────────────────────────
    // Strategy: one row per user — update if a row already exists, insert only on first connect.
    const supabase  = createClient(SUPABASE_URL, SERVICE_KEY);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const tokenPayload = {
      access_token: finalToken,
      token_type:   "long_lived",
      expires_at:   expiresAt,
      scopes:       ["email", "public_profile", "pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement"],
      meta_user_id: meData.id ?? null,
      is_active:    true,
    };

    // Check if this specific Facebook account is already connected
    const { data: existing } = await supabase
      .from("meta_tokens")
      .select("id")
      .eq("user_id", userId)
      .eq("meta_user_id", meData.id)
      .maybeSingle();

    if (existing?.id) {
      // Update existing row for this specific Facebook account
      await supabase.from("meta_tokens").update(tokenPayload).eq("id", existing.id);
    } else {
      // Check limit before inserting
      const { count } = await supabase
        .from("meta_tokens")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      if (count !== null && count >= 5) {
        return NextResponse.json({ success: false, error: "account_limit_reached" }, { status: 403 });
      }

      await supabase.from("meta_tokens").insert({ user_id: userId, ...tokenPayload });
    }

    return NextResponse.json({ success: true, meta_name: meData.name ?? null });
  } catch (err: any) {
    console.error("[exchange-token] error:", err);
    return NextResponse.json({ success: false, error: "server_error", details: err?.message || String(err) }, { status: 500 });
  }
}
