"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Target, Users, Globe, Clock, BarChart3,
  Key, Settings, LogOut, Bell, ChevronDown, TrendingUp,
  Activity, CheckCircle2, Zap, ArrowUpRight,
  FileText, AlertCircle, PanelLeftClose, PanelLeftOpen,
  Sun, Moon, Monitor, Plus, Send, Link2, Calendar,
  XCircle, TrendingDown, Trash2, Play, Hash, ChevronLeft, ChevronRight, ThumbsUp, MessageSquare, User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Theme = "light" | "dark" | "system";
type NotifItem = { id: string; type: string; title: string; body: string; read: boolean; created_at: string };

const TWO_FA_TTL = 12 * 60 * 60 * 1000; // 12 hours — verified once per device per half-day
const TWO_FA_KEY = "2fa_verified_at";
function is2FAVerified()   { const t = localStorage.getItem(TWO_FA_KEY); return !!t && Date.now() - parseInt(t) < TWO_FA_TTL; }
function clear2FAVerified(){ localStorage.removeItem(TWO_FA_KEY); }

const NAV_SECTIONS = [
  {
    title: "Main",
    items: [
      { icon: LayoutDashboard, label: "Overview" },
      { icon: Target,          label: "Sniper" },
      { icon: Users,           label: "Groups" },
      { icon: Globe,           label: "Pages" },
      { icon: Clock,           label: "Post Queue" },
      { icon: BarChart3,       label: "Analytics" },
    ],
  },
  {
    title: "Account",
    items: [
      { icon: Key,      label: "Facebook Accounts" },
      { icon: Settings, label: "Settings" },
    ],
  },
];

const STATS = [
  { label: "Actions Today",   value: "—",  sub: "No data yet",       icon: Zap,          color: "#3b82f6" },
  { label: "Success Rate",    value: "—",  sub: "No actions logged",  icon: TrendingUp,   color: "#10b981" },
  { label: "Active Tokens",   value: "0",  sub: "Connect Meta",       icon: Key,          color: "#f59e0b" },
  { label: "Groups Tracked",  value: "0",  sub: "None added yet",     icon: Users,        color: "#8b5cf6" },
];

const SETUP_STEPS = [
  { label: "Create account",        done: true  },
  { label: "Verify email via OTP",  done: true  },
  { label: "Connect Facebook Accounts",    done: false },
  { label: "Add target groups",     done: false },
  { label: "Launch first campaign", done: false },
];

const QUICK_ACTIONS = [
  { icon: Key,    label: "Connect Facebook Accounts",    color: "#f59e0b" },
  { icon: Target, label: "New Sniper Campaign",   color: "#3b82f6" },
  { icon: Users,  label: "Manage Groups",         color: "#8b5cf6" },
  { icon: FileText, label: "Create Post Draft",   color: "#10b981" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser]           = useState<{ id: string; email: string; user_metadata?: { full_name?: string; avatar_url?: string; picture?: string } } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [activeNav, setActiveNav] = useState("Overview");
  const [collapsed, setCollapsed]           = useState(false);
  const [dropdown, setDropdown]             = useState(false);
  const [theme, setTheme]                   = useState<Theme>("system");
  const [resolvedDark, setResolvedDark]     = useState(false);
  const [showSniperForm, setShowSniperForm] = useState(false);
  const [showPageForm, setShowPageForm]     = useState(false);
  const [queueFilter, setQueueFilter]       = useState<"all"|"pending"|"sent"|"failed">("all");
  const [metaToken, setMetaToken]           = useState("");
  const [tokenVerifying, setTokenVerifying] = useState(false);
  const [tokenSaved, setTokenSaved]         = useState(false);
  const [metaConnected, setMetaConnected]   = useState(false);
  const [metaError, setMetaError]           = useState("");
  const [notifCampaign, setNotifCampaign]   = useState(true);
  const [notifFailed, setNotifFailed]       = useState(true);
  const [notifWeekly, setNotifWeekly]       = useState(false);
  const [fbReady, setFbReady]               = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [targetAccountToken, setTargetAccountToken] = useState<string | null>(null);
  
  // Derived variables for backward compatibility in the rest of the file
  const activeToken = targetAccountToken || (connectedAccounts.length > 0 ? connectedAccounts[0].access_token : null);
  const fbPages = connectedAccounts.find(a => a.access_token === activeToken)?.pages || [];
  const pagesLoading = accountsLoading;
  const [groups, setGroups]                 = useState<{id:string;name:string;url:string;validation_status?:string;privacy?:string;is_member?:boolean;can_post?:boolean;requires_approval?:boolean;session_id?:string}[]>([]);
  // ── FB Session state ──
  const [fbSessions, setFbSessions]         = useState<{id:string;fb_account_name:string|null;fb_account_id:string|null;status:string;last_validated_at:string|null}[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [connectingSession, setConnectingSession] = useState(false);
  const [sessionConnectError, setSessionConnectError] = useState<string|null>(null);
  // ── Add-group form state ──
  const [showAddGroupForm, setShowAddGroupForm] = useState(false);
  const [addGroupUrl, setAddGroupUrl]         = useState("");
  const [addGroupName, setAddGroupName]       = useState("");
  const [addGroupSession, setAddGroupSession] = useState("");
  const [addGroupLoading, setAddGroupLoading] = useState(false);
  const [addGroupResult, setAddGroupResult]   = useState<{ok:boolean;msg:string;data?:Record<string,unknown>}|null>(null);
  // ── Auto-fetch joined groups state ──
  const [fetchingGroups, setFetchingGroups]   = useState(false);
  const [fetchGroupsError, setFetchGroupsError] = useState<string|null>(null);
  const [showConnectInstructions, setShowConnectInstructions] = useState(false);
  const [copiedUserId, setCopiedUserId]         = useState(false);
  // ── noVNC live login modal ──
  const [loginModal, setLoginModal]             = useState<{token:string;novncUrl:string}|null>(null);
  const [loginPollStatus, setLoginPollStatus]   = useState<"waiting"|"done"|"error"|null>(null);
  const [campaignCount, setCampaignCount]   = useState(0);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [showCalendar, setShowCalendar]     = useState(false);
  const [scheduleDate, setScheduleDate]     = useState<Date | null>(null);
  const [calViewDate, setCalViewDate]       = useState(new Date());
  const [scheduleHour, setScheduleHour]     = useState("12");
  const [scheduleMinute, setScheduleMinute] = useState("00");
  const [scheduleAmPm, setScheduleAmPm]     = useState<"AM"|"PM">("AM");
  const [activityLog, setActivityLog]       = useState<{action:string;target:string;status:string;time:string}[]>([]);
  const [groupName, setGroupName]           = useState("");
  const [groupUrl, setGroupUrl]             = useState("");
  const [campaignType, setCampaignType]     = useState("Post to group/page");
  const [mediaMode, setMediaMode]           = useState<"url"|"file">("url");
  const [mediaUrl, setMediaUrl]             = useState("");
  const [mediaFile, setMediaFile]           = useState<File | null>(null);
  const [isUploading, setIsUploading]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl]       = useState<string | null>(null);
  const [postContent, setPostContent]       = useState("");
  const [frequency, setFrequency]           = useState<"once"|"daily">("once");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [autoReply, setAutoReply]           = useState("");
  const [firstComment, setFirstComment]     = useState("");
  const [commentDelayMode, setCommentDelayMode] = useState<"Now"|"15m"|"30m"|"1hr"|"Custom">("Now");
  const [commentDelayCustom, setCommentDelayCustom] = useState("15");
  const [launchError, setLaunchError]       = useState("");

  // ── Settings state ──────────────────────────────────────────────────────────
  const [settingName, setSettingName]           = useState("");
  const [settingNameSaving, setSettingNameSaving] = useState(false);
  const [settingNameMsg, setSettingNameMsg]     = useState<{ok:boolean;text:string}|null>(null);

  const [settingEmailNew, setSettingEmailNew]   = useState("");
  const [settingEmailOtp, setSettingEmailOtp]   = useState("");
  const [settingEmailStep, setSettingEmailStep] = useState<"idle"|"otp"|"done">("idle");
  const [settingEmailLoading, setSettingEmailLoading] = useState(false);
  const [settingEmailError, setSettingEmailError]     = useState<string|null>(null);

  const [settingOldPass, setSettingOldPass]     = useState("");
  const [settingNewPass, setSettingNewPass]     = useState("");
  const [settingConfPass, setSettingConfPass]   = useState("");
  const [settingPassLoading, setSettingPassLoading] = useState(false);
  const [settingPassMsg, setSettingPassMsg]     = useState<{ok:boolean;text:string}|null>(null);

  const [twoFaEnabled, setTwoFaEnabled]         = useState(false);
  const [twoFaStep, setTwoFaStep]               = useState<"idle"|"setup"|"disable">("idle");
  const [twoFaSecret, setTwoFaSecret]           = useState("");
  const [twoFaQrData, setTwoFaQrData]           = useState("");
  const [twoFaCode, setTwoFaCode]               = useState("");
  const [twoFaLoading, setTwoFaLoading]         = useState(false);
  const [twoFaError, setTwoFaError]             = useState<string|null>(null);
  const [campaigns, setCampaigns]           = useState<any[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [analyticsLogs, setAnalyticsLogs]   = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading]       = useState(false);
  const [googleLinked, setGoogleLinked]         = useState(false);
  const [linkingGoogle, setLinkingGoogle]       = useState(false);
  const [notifications, setNotifications]       = useState<NotifItem[]>([]);
  const [notifOpen, setNotifOpen]               = useState(false);
  const [notifShowAll, setNotifShowAll]         = useState(false);
  const dropdownRef                         = useRef<HTMLDivElement>(null);
  const notifRef                            = useRef<HTMLDivElement>(null);
  // Refs so real-time callback reads latest pref without stale closure
  const notifCampaignRef                    = useRef(true);
  const notifFailedRef                      = useRef(true);

  // ── Load Facebook JS SDK ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const initFB = () => {
      (window as any).FB.init({ appId: "859277567200360", cookie: false, xfbml: false, version: "v20.0" });
      setFbReady(true);
    };
    if ((window as any).FB) { initFB(); return; }
    (window as any).fbAsyncInit = initFB;
    if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true; s.defer = true;
      document.body.appendChild(s);
    }
  }, []);

  // Handle bfcache restores (browser back button) — page is frozen with loading=true
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && loading) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [loading]);

  useEffect(() => {
    const saved = localStorage.getItem("sniper_theme") as Theme | null;
    if (saved) setTheme(saved);

    // Safety net: if getSession hangs (network issue, Supabase cold start), bail after 8 s
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
      router.push("/signin");
    }, 8000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(loadingTimeout);
      if (!session) { router.push("/signin"); return; }
      const u = session.user;
      setUser(u as any);
      setSettingName(u.user_metadata?.full_name || u.email?.split("@")[0] || "");
      setLoading(false);
      // Check if Google is already linked to this account
      const providers: string[] = (u as any)?.app_metadata?.providers ?? [];
      setGoogleLinked(providers.includes("google"));

      // Load 2FA status — if enabled and not verified this session, gate access
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      fetch(`${apiBase}/api/auth/2fa-status/${u.id}`)
        .then(r => r.json())
        .then(d => {
          if (d.two_fa_enabled) {
            setTwoFaEnabled(true);
            if (!is2FAVerified()) {
              router.replace("/2fa-challenge");
            }
          }
        })
        .catch(() => {});

      // Load campaign count from DB (automation_posts table)
      supabase.from("automation_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.id)
        .then(({ count }) => {
          if (count != null && count > 0) setCampaignCount(count);
        });
      // Fallback: also check localStorage
      try {
        const cc = localStorage.getItem(`sniper_campaigns_${u.id}`);
        if (cc) { const n = parseInt(cc, 10) || 0; setCampaignCount(prev => Math.max(prev, n)); }
      } catch {}

      // Load groups from Supabase
      supabase.from("target_groups")
        .select("id,name,url,validation_status,privacy,is_member,can_post,requires_approval,session_id")
        .eq("user_id", u.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .then(({ data: gData }) => { if (gData) setGroups(gData); });

      // Load recent activity from sniper_logs
      supabase.from("sniper_logs")
        .select("action_type, target_type, status, metadata, created_at")
        .eq("user_id", u.id)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data: logs }) => {
          if (logs) setActivityLog(logs.map((l: any) => ({
            action: l.action_type,
            target: l.metadata?.target ?? l.target_type ?? "",
            status: l.status,
            time:   l.created_at,
          })));
        });

      // Load active tokens from DB
      supabase.from("meta_tokens")
        .select("access_token, expires_at, meta_user_id, id")
        .eq("user_id", u.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .then(({ data: toks }) => {
          if (toks && toks.length > 0) {
            setTokenSaved(true);
            const initialAccounts = toks.map((t: any) => ({
              access_token: t.access_token,
              expires_at: t.expires_at,
              meta_user_id: t.meta_user_id,
              db_id: t.id,
              name: "",
              picture: "",
              pages: []
            }));
            setConnectedAccounts(initialAccounts);
            setTargetAccountToken(initialAccounts[0].access_token);
          }
        });

      // Handle OAuth redirect params (needs u.id for localStorage)
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("meta_connected");
      const nav       = params.get("activeNav");
      const err       = params.get("meta_error");
      if (connected === "true") {
        setTokenSaved(true); setMetaConnected(true);
        const entry = { action: "Connected Meta Account", target: "Facebook", status: "success", time: new Date().toISOString() };
        setActivityLog(prev => [entry, ...prev].slice(0, 50));
        supabase.from("sniper_logs").insert({
          user_id: u.id, action_type: "Connected Meta Account",
          target_type: "manual", status: "success", metadata: { target: "Facebook" },
        }).then(null, () => {});
      }
      if (err) setMetaError(decodeURIComponent(err));
      if (nav) setActiveNav(decodeURIComponent(nav));
      if (connected || err || nav) window.history.replaceState({}, "", "/dashboard");
    }).catch(() => {
      clearTimeout(loadingTimeout);
      setLoading(false);
      router.push("/signin");
    });
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const root = document.documentElement;
    const mq   = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      root.setAttribute("data-theme", dark ? "dark" : "light");
      root.style.colorScheme = dark ? "dark" : "light";
      setResolvedDark(dark);
    };
    apply();
    mq.addEventListener("change", apply);
    localStorage.setItem("sniper_theme", theme);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep notification pref refs in sync so real-time callback avoids stale closure
  useEffect(() => { notifCampaignRef.current = notifCampaign; }, [notifCampaign]);
  useEffect(() => { notifFailedRef.current   = notifFailed;   }, [notifFailed]);

  // Real-time notification subscription — runs once user is loaded
  useEffect(() => {
    if (!user?.id) return;

    // Load preference flags from localStorage
    const sc = localStorage.getItem("notif_campaign");
    const sf = localStorage.getItem("notif_failed");
    if (sc !== null) { const v = sc === "1"; setNotifCampaign(v); notifCampaignRef.current = v; }
    if (sf !== null) { const v = sf === "1"; setNotifFailed(v);   notifFailedRef.current   = v; }

    // Load last 30 notifications
    supabase.from("notifications")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => { if (data) setNotifications(data); });

    // Subscribe to new rows in real-time
    const channel = supabase.channel(`notif_${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const notif = payload.new as NotifItem;
        setNotifications(prev => [notif, ...prev.slice(0, 49)]);
        // Fire browser notification if permission granted and pref enabled
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const wantIt = notif.type === "campaign_completed"
            ? notifCampaignRef.current
            : notif.type === "action_failed"
              ? notifFailedRef.current
              : false;
          if (wantIt) {
            new Notification(notif.title, { body: notif.body, icon: "/favicon.ico" });
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Meta user info and pages for all connected accounts
  useEffect(() => {
    if (connectedAccounts.length === 0) return;
    const fetchDetails = async () => {
      let changed = false;
      setAccountsLoading(true);
      const updated = await Promise.all(connectedAccounts.map(async (acc) => {
        if (acc.name && acc.pages && acc.pages.length > 0) return acc;
        let name = acc.name, picture = acc.picture, pages = acc.pages || [];
        try {
          const meRes = await fetch(`https://graph.facebook.com/v20.0/me?fields=name,picture.width(200).height(200)&access_token=${acc.access_token}`);
          const d = await meRes.json();
          if (d.name) { name = d.name; changed = true; }
          if (d.picture?.data?.url) { picture = d.picture.data.url; changed = true; }
        } catch {}
        try {
          const pgRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,category,fan_count,picture&access_token=${acc.access_token}`);
          const d = await pgRes.json();
          if (d.data) { pages = d.data; changed = true; }
        } catch {}
        return { ...acc, name, picture, pages };
      }));
      setAccountsLoading(false);
      if (changed) setConnectedAccounts(updated);
    };
    fetchDetails();
  }, [connectedAccounts]);

  // Load campaigns from Supabase when Sniper, Post Queue, or Analytics view is active
  useEffect(() => {
    if ((activeNav !== "Sniper" && activeNav !== "Post Queue" && activeNav !== "Analytics") || !user?.id) return;
    const fetchCampaigns = (showLoader = false) => {
      if (showLoader) setCampaignsLoading(true);
      Promise.resolve(
        supabase.from("automation_posts")
          .select("id, content, target_groups, target_pages, status, scheduled_at, metadata, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
      )
        .then(({ data }) => setCampaigns(data ?? []))
        .finally(() => setCampaignsLoading(false));
    };
    fetchCampaigns(true);
    const interval = setInterval(() => fetchCampaigns(false), 30_000);
    return () => clearInterval(interval);
  }, [activeNav, user?.id]);

  // Load sniper_logs for Analytics view (last 30 days)
  useEffect(() => {
    if (activeNav !== "Analytics" || !user?.id) return;
    setAnalyticsLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    Promise.resolve(
      supabase.from("sniper_logs")
        .select("id, action_type, status, created_at, metadata")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
    )
      .then(({ data }) => setAnalyticsLogs(data ?? []))
      .finally(() => setAnalyticsLoading(false));
  }, [activeNav, user?.id]);

  // Load FB sessions + groups when Groups nav is active
  useEffect(() => {
    if (activeNav !== "Groups" || !user?.id) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    setSessionsLoading(true);
    fetch(`${apiBase}/api/fb/sessions?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.success) setFbSessions(d.sessions || []); })
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
    supabase.from("target_groups")
      .select("id,name,url,validation_status,privacy,is_member,can_post,requires_approval,session_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setGroups(data); });
  }, [activeNav, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pages are now fetched concurrently alongside user info.

  async function handleLogout() {
    clear2FAVerified();
    await supabase.auth.signOut();
    router.push("/signin");
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  async function markAllRead() {
    if (!user?.id) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function markNotifRead(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function handleNotifToggle(
    key: "notif_campaign" | "notif_failed",
    currentVal: boolean,
    setter: (v: boolean) => void,
  ) {
    const newVal = !currentVal;
    setter(newVal);
    localStorage.setItem(key, newVal ? "1" : "0");
    if (newVal && typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  async function handleDeleteAccount() {
    if (!user?.id || deleteConfirmText !== "DELETE") return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) throw new Error("Failed");
      clear2FAVerified();
      await supabase.auth.signOut();
      router.push("/signin");
    } catch {
      setDeleteLoading(false);
    }
  }

  async function uploadMediaFile(file: File) {
    if (!user?.id) return;
    if (!file.type.startsWith("image/")) { console.warn("Only images are allowed."); return; }
    setIsUploading(true); setUploadProgress(0); setUploadedUrl(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${Date.now()}_${safeName}`;
    const { data, error } = await supabase.storage.from("campaign-media").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      // @ts-ignore – onUploadProgress is supported in storage-js v2.5+
      onUploadProgress: ({ loaded, total }: { loaded: number; total: number }) => {
        setUploadProgress(Math.round((loaded / total) * 100));
      },
    });
    setIsUploading(false);
    if (error) { console.error("Storage upload error:", error); return; }
    const { data: urlData } = supabase.storage.from("campaign-media").getPublicUrl(path);
    setUploadedUrl(urlData.publicUrl);
    setUploadProgress(100);
  }

  function logActivity(action: string, target: string, status: "success" | "pending" | "failed") {
    if (!user?.id) return;
    const entry = { action, target, status, time: new Date().toISOString() };
    setActivityLog(prev => [entry, ...prev].slice(0, 50));
    supabase.from("sniper_logs").insert({
      user_id: user.id, action_type: action,
      target_type: "manual", status, metadata: { target },
    }).then(null, () => {});
  }

  function handleConnectMeta() {
    const SCOPE = "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement";

    // FB.login requires HTTPS — fall back to redirect on plain HTTP (dev without HTTPS)
    if (window.location.protocol === "http:") {
      const redirectUri = `${window.location.origin}/api/auth/callback`;
      window.location.href =
        `https://www.facebook.com/v20.0/dialog/oauth` +
        `?client_id=859277567200360` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(SCOPE)}` +
        `&response_type=code` +
        `&state=${encodeURIComponent(user?.id ?? "")}`;
      return;
    }

    // HTTPS — use popup (no page navigation)
    const FB = (window as any).FB;
    if (!FB) { setMetaError("Facebook SDK is still loading — please try again in a moment."); return; }

    FB.login(
      (response: any) => {
        if (response.authResponse) {
          setTokenVerifying(true);
          setActiveNav("Facebook Accounts");
          fetch("/api/auth/exchange-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: response.authResponse.accessToken, user_id: user?.id }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.success) {
                setTokenSaved(true); setMetaConnected(true);
                logActivity("Connected Meta Account", "Facebook", "success");
                // Reload the long-lived token into state so Pages section works immediately
                if (user?.id) {
                  supabase.from("meta_tokens").select("access_token, expires_at, meta_user_id, id").eq("user_id", user.id).eq("is_active", true)
                    .order("created_at", { ascending: false })
                    .then(({ data: toks }) => {
                      if (toks && toks.length > 0) {
                        const newAccounts = toks.map((t: any) => ({
                          access_token: t.access_token,
                          expires_at: t.expires_at,
                          meta_user_id: t.meta_user_id,
                          db_id: t.id,
                          name: "",
                          picture: "",
                          pages: []
                        }));
                        setConnectedAccounts(newAccounts);
                        setTargetAccountToken(newAccounts[0].access_token);
                      }
                    });
                }
              } else { setMetaError(data.error ?? "exchange_failed"); }
            })
            .catch(() => setMetaError("network_error"))
            .finally(() => setTokenVerifying(false));
        }
      },
      { scope: SCOPE, auth_type: "rerequest" }
    );
  }

  const SW = collapsed ? "64px" : "220px";

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f0f13 0%, #13131a 50%, #0a0a12 100%)", fontFamily: "Interdisplay, Arial, sans-serif", position: "relative", overflow: "hidden" }}>

        {/* Ambient glow blobs */}
        <div style={{ position: "absolute", top: "20%", left: "30%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none", animation: "drift1 8s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "25%", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none", animation: "drift2 10s ease-in-out infinite" }} />

        <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>

          {/* Orbital ring system */}
          <div style={{ position: "relative", width: "88px", height: "88px", margin: "0 auto 2rem" }}>

            {/* Outer ring — clockwise blue→purple gradient */}
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(from 0deg, #3b82f6, #8b5cf6, transparent 70%)", animation: "spin 2s linear infinite" }}>
              <div style={{ position: "absolute", inset: "2px", borderRadius: "50%", background: "#0f0f13" }} />
            </div>

            {/* Middle ring — counter-clockwise teal */}
            <div style={{ position: "absolute", inset: "12px", borderRadius: "50%", background: "conic-gradient(from 180deg, #10b981, #3b82f6, transparent 65%)", animation: "spin-rev 3s linear infinite" }}>
              <div style={{ position: "absolute", inset: "2px", borderRadius: "50%", background: "#0f0f13" }} />
            </div>

            {/* Inner glowing core */}
            <div style={{ position: "absolute", inset: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", boxShadow: "0 0 20px rgba(59,130,246,0.5), 0 0 40px rgba(139,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#fff", letterSpacing: "-0.5px" }}>A</span>
            </div>
          </div>

          {/* Staggered pulse dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: "7px", marginBottom: "1.25rem" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: i === 0 ? "#3b82f6" : i === 1 ? "#8b5cf6" : "#10b981", animation: `dotPulse 1.5s ease-in-out ${i * 0.25}s infinite` }} />
            ))}
          </div>

          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.8125rem", fontWeight: 500, margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>Loading workspace</p>
        </div>

        <style>{`
          @keyframes spin      { to { transform: rotate(360deg);  } }
          @keyframes spin-rev  { to { transform: rotate(-360deg); } }
          @keyframes dotPulse  {
            0%, 80%, 100% { transform: scale(0.55); opacity: 0.35; }
            40%            { transform: scale(1);    opacity: 1; }
          }
          @keyframes drift1 {
            0%, 100% { transform: translate(0, 0);       }
            50%       { transform: translate(30px, -20px); }
          }
          @keyframes drift2 {
            0%, 100% { transform: translate(0, 0);        }
            50%       { transform: translate(-25px, 15px); }
          }
        `}</style>
      </div>
    );
  }

  const fullName   = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const firstName  = fullName.split(" ")[0];
  const email      = user?.email || "";
  const initial    = fullName.charAt(0).toUpperCase();
  const avatarUrl  = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const setupSteps = [
    { label: "Create account",        done: true },
    { label: "Verify email via OTP",  done: true },
    { label: "Connect Facebook Accounts",    done: tokenSaved },
    { label: "Add target groups",     done: groups.length > 0 },
    { label: "Launch first campaign", done: campaignCount > 0 || campaigns.length > 0 },
  ];
  const doneCount  = setupSteps.filter((s) => s.done).length;
  const progress   = Math.round((doneCount / setupSteps.length) * 100);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "var(--bg)", fontFamily: "Interdisplay, Arial, sans-serif" }}>

      {/* ─────────────────────── SIDEBAR ─────────────────────── */}
      <aside style={{
        width: SW, flexShrink: 0,
        backgroundColor: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, height: "100vh",
        zIndex: 50,
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
      }}>

        {/* Logo — dark mode uses white variant */}
        <div style={{ padding: "0 1.125rem", height: "56px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", flexShrink: 0, overflow: "hidden", boxSizing: "border-box" }}>
          {collapsed ? (
            <Image src="/astraventa_logo_bg.png" alt="Astraventa" width={28} height={28} style={{ objectFit: "contain", flexShrink: 0 }} />
          ) : (
            <Image src={resolvedDark ? "/logo-new-white.png" : "/logo-new.png"} alt="Astraventa" width={140} height={35} style={{ objectFit: "contain", objectPosition: "left", flexShrink: 0 }} />
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "0.75rem 0.625rem", overflowY: "auto", overflowX: "hidden" }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} style={{ marginBottom: "0.25rem" }}>
              {/* Section label — hidden when collapsed */}
              <p style={{
                fontSize: "0.5625rem", fontWeight: 600, color: "var(--text-3)",
                letterSpacing: "0.07em", textTransform: "uppercase",
                padding: "0.625rem 0.5rem 0.375rem", margin: 0,
                whiteSpace: "nowrap",
                opacity: collapsed ? 0 : 1,
                transition: "opacity 0.12s ease",
              }}>
                {section.title}
              </p>
              {section.items.map(({ icon: Icon, label }) => {
                const isActive = activeNav === label;
                return (
                  <button
                    key={label}
                    onClick={() => setActiveNav(label)}
                    title={collapsed ? label : undefined}
                    style={{
                      display: "flex", alignItems: "center",
                      gap: collapsed ? 0 : "0.5rem",
                      justifyContent: collapsed ? "center" : "flex-start",
                      width: "100%",
                      padding: collapsed ? "0.5625rem 0" : "0.5rem 0.625rem",
                      borderRadius: "0.4375rem", border: "none",
                      backgroundColor: isActive ? (resolvedDark ? "rgba(59,130,246,0.12)" : "#f0f4ff") : "transparent",
                      color: isActive ? "#3b82f6" : "var(--text-2)",
                      fontSize: "0.8125rem", fontWeight: isActive ? 600 : 500,
                      fontFamily: "Interdisplay, Arial, sans-serif",
                      cursor: "pointer", textAlign: "left", marginBottom: "1px",
                      transition: "background-color 0.12s ease, color 0.12s ease",
                      minWidth: 0,
                    }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = "var(--hover-bg)"; e.currentTarget.style.color = "var(--text-1)"; } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-2)"; } }}
                  >
                    <Icon size={15} strokeWidth={isActive ? 2.5 : 2} style={{ flexShrink: 0 }} />
                    <span style={{
                      whiteSpace: "nowrap", overflow: "hidden",
                      maxWidth: collapsed ? "0px" : "160px",
                      opacity: collapsed ? 0 : 1,
                      transition: "max-width 0.18s ease, opacity 0.12s ease",
                    }}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div style={{ padding: "0.75rem 0.625rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: collapsed ? "center" : "flex-end" }}>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              width: "30px", height: "30px", borderRadius: "0.4375rem",
              border: "1px solid var(--border)", backgroundColor: "var(--surface)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-2)",
              transition: "background-color 0.12s ease, color 0.12s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--hover-bg)"; e.currentTarget.style.color = "var(--text-1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--surface)"; e.currentTarget.style.color = "var(--text-2)"; }}
          >
            {collapsed
              ? <PanelLeftOpen size={14} strokeWidth={2} />
              : <PanelLeftClose size={14} strokeWidth={2} />
            }
          </button>
        </div>
      </aside>

      {/* ─────────────────────── MAIN ─────────────────────── */}
      <main style={{ flex: 1, marginLeft: SW, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", transition: "margin-left 0.22s cubic-bezier(0.4,0,0.2,1)" }}>

        {/* Top bar */}
        <header style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "0 1.75rem", height: "56px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 40 }}>
          <div>
            <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-1)", margin: 0, letterSpacing: "-0.2px" }}>
              {activeNav}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            {/* Bell + notification dropdown */}
            {(() => {
              const unread = notifications.filter(n => !n.read).length;
              const shown  = notifShowAll ? notifications : notifications.slice(0, 5);
              const extra  = notifications.length - 5;
              return (
                <div ref={notifRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => { setNotifOpen(o => !o); setNotifShowAll(false); }}
                    style={{ width: "34px", height: "34px", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)", position: "relative" }}
                  >
                    <Bell size={15} strokeWidth={2} />
                    {unread > 0 && (
                      <span style={{ position: "absolute", top: "-5px", right: "-5px", minWidth: "16px", height: "16px", borderRadius: "8px", backgroundColor: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid var(--surface)", lineHeight: 1 }}>
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: "360px", maxHeight: "480px", borderRadius: "0.875rem", backgroundColor: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden", display: "flex", flexDirection: "column" }}>

                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem 0.75rem", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-1)" }}>Notifications</span>
                        {unread > 0 && (
                          <button onClick={markAllRead} style={{ fontSize: "0.75rem", fontWeight: 600, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                            Mark all read
                          </button>
                        )}
                      </div>

                      {/* List */}
                      <div style={{ overflowY: "auto", flex: 1 }}>
                        {notifications.length === 0 ? (
                          <div style={{ padding: "2.5rem 1rem", textAlign: "center" }}>
                            <Bell size={28} style={{ color: "var(--text-3)", marginBottom: "0.5rem" }} />
                            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)", fontWeight: 500 }}>All caught up</p>
                            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--text-3)" }}>No notifications yet</p>
                          </div>
                        ) : (
                          shown.map((n) => (
                            <div
                              key={n.id}
                              onClick={() => markNotifRead(n.id)}
                              style={{ display: "flex", gap: "0.75rem", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", cursor: "pointer", backgroundColor: n.read ? "transparent" : (resolvedDark ? "rgba(59,130,246,0.05)" : "rgba(59,130,246,0.04)"), transition: "background-color 0.12s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--hover-bg)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = n.read ? "transparent" : (resolvedDark ? "rgba(59,130,246,0.05)" : "rgba(59,130,246,0.04)"); }}
                            >
                              {/* Icon */}
                              <div style={{ width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: n.type === "campaign_completed" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }}>
                                {n.type === "campaign_completed"
                                  ? <CheckCircle2 size={15} style={{ color: "#10b981" }} />
                                  : <AlertCircle  size={15} style={{ color: "#ef4444" }} />
                                }
                              </div>
                              {/* Text */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.125rem" }}>
                                  <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</p>
                                  {!n.read && <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#3b82f6", flexShrink: 0, marginLeft: "0.5rem" }} />}
                                </div>
                                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)", lineHeight: "1.4em", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.body}</p>
                                <p style={{ margin: "0.25rem 0 0", fontSize: "0.6875rem", color: "var(--text-3)" }}>{timeAgo(n.created_at)}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Show more */}
                      {!notifShowAll && extra > 0 && (
                        <button
                          onClick={() => setNotifShowAll(true)}
                          style={{ padding: "0.75rem", fontSize: "0.8125rem", fontWeight: 600, color: "#3b82f6", background: "none", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer", flexShrink: 0 }}
                        >
                          Show {extra} more notification{extra !== 1 ? "s" : ""}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* User chip + dropdown */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setDropdown((d) => !d)}
                style={{ display: "flex", alignItems: "center", gap: "0.4375rem", padding: "0.3125rem 0.625rem 0.3125rem 0.3125rem", borderRadius: "2rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", cursor: "pointer", transition: "border-color 0.12s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--text-3)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={fullName} style={{ width: "24px", height: "24px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
                ) : (
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "#1d1d1d", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.625rem", fontWeight: 700 }}>
                    {initial}
                  </div>
                )}
                <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-1)" }}>{firstName}</span>
                <ChevronDown size={12} strokeWidth={2} color="#bababa" style={{ transition: "transform 0.15s ease", transform: dropdown ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>

              {/* Dropdown panel */}
              {dropdown && (
                <div style={{ position: "absolute", top: "calc(100% + 0.5rem)", right: 0, width: "220px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "0.75rem", boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)", overflow: "hidden", zIndex: 100, animation: "dropIn 0.15s ease" }}>

                  {/* Profile header */}
                  <div style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={fullName} style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
                      ) : (
                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#1d1d1d", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                          {initial}
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fullName}</div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
                      </div>
                    </div>
                  </div>

                  {/* Appearance */}
                  <div style={{ padding: "0.625rem 0.75rem" }}>
                    <p style={{ fontSize: "0.625rem", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 0.375rem 0.25rem" }}>Appearance</p>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {(["light", "dark", "system"] as Theme[]).map((t) => {
                        const icons = { light: Sun, dark: Moon, system: Monitor };
                        const labels = { light: "Light", dark: "Dark", system: "System" };
                        const Icon = icons[t];
                        const isSelected = theme === t;
                        return (
                          <button
                            key={t}
                            onClick={() => setTheme(t)}
                            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", padding: "0.4375rem 0.25rem", borderRadius: "0.4375rem", border: `1px solid ${isSelected ? "#3b82f6" : "var(--border)"}`, backgroundColor: isSelected ? (resolvedDark ? "rgba(59,130,246,0.12)" : "#f0f4ff") : "var(--surface)", color: isSelected ? "#3b82f6" : "var(--text-2)", cursor: "pointer", transition: "all 0.12s ease" }}
                          >
                            <Icon size={13} strokeWidth={isSelected ? 2.5 : 2} />
                            <span style={{ fontSize: "0.625rem", fontWeight: isSelected ? 600 : 500 }}>{labels[t]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ height: "1px", backgroundColor: "var(--border-subtle)", margin: "0 0.75rem" }} />

                  {/* Sign out */}
                  <div style={{ padding: "0.5rem 0.75rem 0.625rem" }}>
                    <button
                      onClick={handleLogout}
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", padding: "0.5rem 0.5rem", borderRadius: "0.4375rem", border: "none", backgroundColor: "transparent", color: "#ef4444", fontSize: "0.8125rem", fontWeight: 500, fontFamily: "Interdisplay, Arial, sans-serif", cursor: "pointer", transition: "background-color 0.12s ease" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.06)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <LogOut size={14} strokeWidth={2} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page body */}
        <div style={{ flex: 1, padding: "1.75rem", overflowY: "auto" }}>
          {renderContent()}
        </div>
      </main>

      {/* ─── DELETE ACCOUNT MODAL ───────────────────────────────────────── */}
      {showDeleteModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !deleteLoading) { setShowDeleteModal(false); setDeleteConfirmText(""); } }}
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", padding: "1rem" }}
        >
          <div style={{ width: "100%", maxWidth: "420px", backgroundColor: "var(--surface)", borderRadius: "1.125rem", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.28)", overflow: "hidden", animation: "fadeSlideUp 0.2s ease" }}>

            {/* Red top strip */}
            <div style={{ height: "4px", background: "linear-gradient(90deg,#ef4444,#f87171)" }} />

            <div style={{ padding: "1.75rem 1.75rem 1.5rem" }}>
              {/* Icon */}
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", backgroundColor: resolvedDark ? "rgba(239,68,68,0.12)" : "#fef2f2", border: `1px solid ${resolvedDark ? "rgba(239,68,68,0.25)" : "#fecaca"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
                <Trash2 size={22} color="#ef4444" strokeWidth={2} />
              </div>

              {/* Title */}
              <h2 style={{ textAlign: "center", margin: "0 0 0.625rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: "1.1875rem", fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.3px" }}>Delete Your Account</h2>
              <p style={{ textAlign: "center", margin: "0 0 1.75rem", fontSize: "0.8125rem", color: "var(--text-2)", lineHeight: "1.65em" }}>
                This will permanently remove your account, all campaigns, groups, pages, and Facebook Accounts data.<br />
                <strong style={{ color: "var(--text-1)" }}>This action cannot be undone.</strong>
              </p>

              {/* Confirmation input */}
              <div style={{ marginBottom: "1.375rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-2)", marginBottom: "0.5rem" }}>
                  Type <span style={{ fontFamily: "monospace", color: "#ef4444", fontWeight: 700, letterSpacing: "0.05em" }}>DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE here"
                  autoFocus
                  style={{ width: "100%", padding: "0.625rem 0.875rem", borderRadius: "0.5rem", border: `1.5px solid ${
                    deleteConfirmText === "DELETE" ? "#10b981" : deleteConfirmText.length > 0 ? "#ef4444" : "var(--border)"
                  }`, fontSize: "0.875rem", fontFamily: "monospace", color: "var(--text-1)", backgroundColor: "var(--input-bg)", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s ease", letterSpacing: "0.08em" }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
                  disabled={deleteLoading}
                  style={{ flex: 1, padding: "0.6875rem", borderRadius: "0.5625rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", transition: "background-color 0.12s ease" }}
                  onMouseEnter={(e) => { if (!deleteLoading) e.currentTarget.style.backgroundColor = "var(--hover-bg)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--surface)"; }}
                >Cancel</button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || deleteLoading}
                  style={{ flex: 1, padding: "0.6875rem", borderRadius: "0.5625rem", border: "none", backgroundColor: deleteConfirmText === "DELETE" ? "#ef4444" : "var(--hover-bg)", color: deleteConfirmText === "DELETE" ? "#ffffff" : "var(--text-3)", fontSize: "0.8125rem", fontWeight: 600, cursor: deleteConfirmText === "DELETE" && !deleteLoading ? "pointer" : "not-allowed", transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", transform: deleteConfirmText === "DELETE" && !deleteLoading ? "scale(1)" : "scale(0.98)", boxShadow: deleteConfirmText === "DELETE" && !deleteLoading ? "0 4px 14px rgba(239,68,68,0.35)" : "none" }}
                >
                  {deleteLoading
                    ? <><div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#ffffff", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />Deleting…</>
                    : <><Trash2 size={13} strokeWidth={2.5} />Delete Account</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── SECTION RENDERER ─────────────────────────────────────────────────────
  function renderContent() {
    const card  = { backgroundColor: "var(--surface)", borderRadius: "0.75rem", border: "1px solid var(--border)" };
    const h3    = { marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, fontSize: "0.875rem", color: "var(--text-1)", letterSpacing: "-0.2px" } as const;
    const label = { fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: "0.04em" };
    const btnPrimary = { display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "none", backgroundColor: resolvedDark ? "#f0f2f5" : "#1d1d1d", color: resolvedDark ? "#0d0f14" : "#ffffff", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "Interdisplay, Arial, sans-serif", cursor: "pointer" } as const;
    const inputStyle = { width: "100%", padding: "0.5625rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border)", fontSize: "0.8125rem", color: "var(--text-1)", fontFamily: "Interdisplay, Arial, sans-serif", outline: "none", backgroundColor: "var(--input-bg)", boxSizing: "border-box" as const };
    const emptyState = (icon: React.ReactNode, title: string, sub: string) => (
      <div style={{ padding: "3.5rem 1.5rem", textAlign: "center" }}>
        <div style={{ width: "42px", height: "42px", borderRadius: "50%", backgroundColor: "var(--hover-bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.875rem" }}>{icon}</div>
        <p style={{ margin: "0 0 0.3125rem", fontWeight: 600, fontSize: "0.875rem", color: "var(--text-1)" }}>{title}</p>
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-3)", lineHeight: "1.6em" }}>{sub}</p>
      </div>
    );

    // ── OVERVIEW ──────────────────────────────────────────────────────────────
    if (activeNav === "Overview") return (
      <>
        {/* Banner */}
        <div style={{ backgroundColor: "#1d1d1d", borderRadius: "0.875rem", padding: "1.5rem 1.75rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", width: "220px", height: "220px", borderRadius: "50%", background: "rgba(59,130,246,0.07)", top: "-60px", right: "160px", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <p style={{ margin: "0 0 0.1875rem", fontSize: "0.8125rem", color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>Welcome back,</p>
            <h2 style={{ margin: "0 0 0.5rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.375rem", color: "#ffffff", letterSpacing: "-0.4px" }}>{firstName} 👋</h2>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "rgba(255,255,255,0.45)", lineHeight: "1.5em" }}>
              {tokenSaved ? "Your Meta account is connected. Ready to snipe groups and pages." : "Connect your Facebook Accounts to start sniping groups and pages."}
            </p>
          </div>
          {tokenSaved ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5625rem 1rem", borderRadius: "0.5rem", backgroundColor: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
              <CheckCircle2 size={14} color="#34d399" strokeWidth={2.5} />
              <span style={{ color: "#34d399", fontSize: "0.8125rem", fontWeight: 600 }}>Meta Connected</span>
            </div>
          ) : (
            <button onClick={handleConnectMeta} style={{ ...btnPrimary, backgroundColor: "#3b82f6" }}><Zap size={13} strokeWidth={2.5} />Connect Meta</button>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.875rem", marginBottom: "1.5rem" }}>
          {STATS.map(({ label: lbl, value, sub, icon: Icon, color }) => (
            <div key={lbl} style={{ ...card, padding: "1.125rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-2)", fontWeight: 500 }}>{lbl}</span>
                <div style={{ width: "28px", height: "28px", borderRadius: "0.375rem", backgroundColor: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", color }}><Icon size={14} strokeWidth={2.5} /></div>
              </div>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.5rem", color: "var(--text-1)", letterSpacing: "-0.5px", marginBottom: "0.25rem" }}>{value}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", fontWeight: 500 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "0.875rem" }}>
          {/* Activity */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "1.125rem 1.375rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div><h3 style={h3}>Recent Activity</h3><p style={{ margin: "0.125rem 0 0", fontSize: "0.75rem", color: "var(--text-3)" }}>Last 50 sniper actions</p></div>
              <button onClick={() => setActiveNav("Analytics")} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "0.4375rem", padding: "0.3125rem 0.625rem", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}>View all <ArrowUpRight size={11} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 100px", padding: "0.5rem 1.375rem", borderBottom: "1px solid var(--border)" }}>
              {["Action","Target","Status","Time"].map(h => <span key={h} style={label}>{h}</span>)}
            </div>
            {activityLog.length > 0 ? (
              activityLog.slice(0, 10).map((entry, i) => {
                const sc = entry.status === "success" ? "#10b981" : entry.status === "failed" ? "#ef4444" : "#f59e0b";
                const d = new Date(entry.time);
                const diff = Math.floor((Date.now() - d.getTime()) / 1000);
                const timeStr = diff < 60 ? "just now" : diff < 3600 ? `${Math.floor(diff/60)}m ago` : diff < 86400 ? `${Math.floor(diff/3600)}h ago` : d.toLocaleDateString();
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 100px", padding: "0.6875rem 1.375rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-1)", fontWeight: 500 }}>{entry.action}</span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-2)" }}>{entry.target}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: sc, flexShrink: 0 }} />
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: sc, textTransform: "capitalize" }}>{entry.status}</span>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{timeStr}</span>
                  </div>
                );
              })
            ) : emptyState(<Activity size={18} color="#c0c8cf" />, "No activity yet", "Connect your Facebook Accounts and start a campaign to see logs here.")}
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div style={{ ...card, padding: "1.125rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
                <h3 style={h3}>Getting Started</h3>
                <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#3b82f6", backgroundColor: resolvedDark ? "rgba(59,130,246,0.12)" : "#f0f4ff", padding: "0.1875rem 0.5rem", borderRadius: "2rem" }}>{doneCount}/{setupSteps.length}</span>
              </div>
              <div style={{ height: "3px", backgroundColor: "var(--hover-bg)", borderRadius: "99px", marginBottom: "1rem", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, backgroundColor: "#3b82f6", borderRadius: "99px" }} />
              </div>
              {setupSteps.map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  {s.done ? <CheckCircle2 size={14} color="#10b981" strokeWidth={2.5} /> : <div style={{ width: "14px", height: "14px", borderRadius: "50%", border: "1.5px solid #dde5ed", flexShrink: 0 }} />}
                  <span style={{ fontSize: "0.8125rem", color: s.done ? "var(--text-3)" : "var(--text-1)", textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                </div>
              ))}
            </div>
            <div style={{ ...card, padding: "1.125rem 1.25rem" }}>
              <h3 style={{ ...h3, marginBottom: "0.875rem" }}>Quick Actions</h3>
              {([
                { icon: Target,   label: "New Sniper Campaign", color: "#3b82f6", nav: "Sniper" },
                { icon: Users,    label: "Manage Groups",       color: "#8b5cf6", nav: "Groups" },
                { icon: Globe,    label: "View Pages",          color: "#10b981", nav: "Pages" },
                { icon: BarChart3, label: "View Analytics",     color: "#f59e0b", nav: "Analytics" },
              ] as {icon: any; label: string; color: string; nav: string}[]).map(({ icon: Icon, label: lbl, color, nav }) => (
                <button key={lbl} onClick={() => setActiveNav(nav)} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.625rem", borderRadius: "0.4375rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-1)", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", width: "100%", marginBottom: "0.375rem", transition: "all 0.12s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--surface)"; }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "0.3125rem", backgroundColor: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}><Icon size={12} strokeWidth={2.5} /></div>
                  <span style={{ flex: 1 }}>{lbl}</span><ArrowUpRight size={11} color="#c0c8cf" />
                </button>
              ))}
            </div>
            {!tokenSaved && (
              <div style={{ backgroundColor: "#fff9f0", borderRadius: "0.75rem", border: "1px solid #fde8c0", padding: "1rem 1.125rem", display: "flex", gap: "0.625rem" }}>
                <AlertCircle size={16} color="#f59e0b" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: "1px" }} />
                <div><p style={{ margin: "0 0 0.1875rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Facebook Accounts required</p><p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)", lineHeight: "1.5em" }}>Go to <strong>Facebook Accounts</strong> in the sidebar to connect Facebook.</p></div>
              </div>
            )}
          </div>
        </div>
      </>
    );

    // ── SNIPER ────────────────────────────────────────────────────────────────
    if (activeNav === "Sniper") return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div>
            <h2 style={{ margin: "0 0 0.25rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "var(--text-1)", letterSpacing: "-0.4px" }}>Sniper</h2>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)" }}>Create and manage your automation campaigns</p>
          </div>
          <button onClick={() => setShowSniperForm(!showSniperForm)} style={{ ...btnPrimary }}>
            <Plus size={14} strokeWidth={2.5} />{showSniperForm ? "Cancel" : "New Campaign"}
          </button>
        </div>

        {showSniperForm && (
          <div style={{ ...card, padding: "1.5rem", marginBottom: "1.25rem" }}>
            <h3 style={{ ...h3, marginBottom: "1.25rem" }}>Campaign Setup</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Action Type</label>
                <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} style={{ ...inputStyle }}>
                  <option value="Post to group/page">Post to group/page</option>
                  <option value="Comment on post">Comment on post</option>
                  <option value="Like posts">Like posts</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Frequency</label>
                <div style={{ display: "flex", borderRadius: "0.5rem", border: "1px solid var(--border)", overflow: "hidden", height: "38px" }}>
                  {(["once", "daily"] as const).map(f => (
                    <button key={f} type="button" onClick={() => setFrequency(f)}
                      style={{ flex: 1, border: "none", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, transition: "all 0.15s ease",
                        backgroundColor: frequency === f ? (resolvedDark ? "#f0f2f5" : "#1d1d1d") : "var(--surface)",
                        color: frequency === f ? (resolvedDark ? "#0d0f14" : "#ffffff") : "var(--text-2)" }}>
                      {f === "once" ? "Post Once" : "Post Daily"}
                    </button>
                  ))}
                </div>
                {frequency === "daily" && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.6875rem", color: "var(--text-2)" }}>Repeats every 24 hrs at the scheduled time.</p>
                )}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                {connectedAccounts.length > 1 && (
                  <div style={{ marginBottom: "1.25rem" }}>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Target Account</label>
                    <select
                      value={targetAccountToken || ""}
                      onChange={(e) => setTargetAccountToken(e.target.value)}
                      style={{ width: "100%", padding: "0.625rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: "var(--input-bg)", color: "var(--text-1)", fontSize: "0.8125rem", outline: "none", fontFamily: "Interdisplay, Arial, sans-serif" }}
                    >
                      {connectedAccounts.map((acc: any) => (
                        <option key={acc.access_token} value={acc.access_token}>
                          {acc.name || "Facebook Account"} ({acc.pages?.length || 0} Pages)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.5rem" }}>Select Targets</label>
                {fbPages.length > 0 && (
                  <>
                    <p style={{ margin: "0 0 0.375rem", fontSize: "0.625rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pages</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: groups.length > 0 ? "0.875rem" : 0 }}>
                      {fbPages.map((pg: any) => { const sel = selectedTargets.includes(pg.id); return (
                        <div key={pg.id} onClick={() => setSelectedTargets(sel ? selectedTargets.filter(t => t !== pg.id) : [...selectedTargets, pg.id])}
                          style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", border: sel ? "1.5px solid #1877F2" : "1px solid var(--border)", backgroundColor: sel ? (resolvedDark ? "rgba(24,119,242,0.13)" : "#f0f6ff") : "var(--input-bg)", cursor: "pointer" }}>
                          {pg.picture?.data?.url
                            ? <img src={pg.picture.data.url} alt={pg.name} style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                            : <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#1877F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Globe size={14} color="white" /></div>}
                          <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>{pg.name}</p><p style={{ margin: 0, fontSize: "0.6875rem", color: "var(--text-2)" }}>{pg.category ?? "Page"}</p></div>
                          {sel && <CheckCircle2 size={15} color="#1877F2" strokeWidth={2.5} />}
                        </div>
                      ); })}
                    </div>
                  </>
                )}
                {groups.length > 0 ? (
                  <>
                    <p style={{ margin: "0 0 0.375rem", fontSize: "0.625rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Groups</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {groups.map((g) => { const sel = selectedTargets.includes(g.id); return (
                        <div key={g.id} onClick={() => setSelectedTargets(sel ? selectedTargets.filter(t => t !== g.id) : [...selectedTargets, g.id])}
                          style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", border: sel ? "1.5px solid #10b981" : "1px solid var(--border)", backgroundColor: sel ? (resolvedDark ? "rgba(16,185,129,0.12)" : "#f0fdf4") : "var(--input-bg)", cursor: "pointer" }}>
                          <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Users size={14} color="#10b981" strokeWidth={2} /></div>
                          <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>{g.name}</p>{g.url && <p style={{ margin: 0, fontSize: "0.6875rem", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.url}</p>}</div>
                          {sel && <CheckCircle2 size={15} color="#10b981" strokeWidth={2.5} />}
                        </div>
                      ); })}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: "0.625rem 0.875rem", borderRadius: "0.5rem", border: "1px dashed #edf1f4", backgroundColor: "var(--hover-bg)" }}>
                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-3)" }}>No groups added yet —{" "}
                      <button type="button" onClick={() => { setActiveNav("Groups"); setShowSniperForm(false); }} style={{ background: "none", border: "none", color: "var(--text-1)", fontWeight: 600, cursor: "pointer", padding: 0, fontSize: "0.8125rem", textDecoration: "underline" }}>go to Groups</button>
                    </p>
                  </div>
                )}
              </div>
            </div>
            {/* ── Post action ── */}
            {campaignType === "Post to group/page" && (<>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Post Content</label>
              <textarea value={postContent} onChange={(e) => setPostContent(e.target.value)} style={{ ...inputStyle, height: "100px", resize: "vertical" }} placeholder="Write your post content here…" />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Media (optional)</label>
              <div
                style={{ border: "1.5px dashed #dde5ed", borderRadius: "0.5rem", padding: "1rem", textAlign: "center", backgroundColor: "var(--hover-bg)", cursor: "pointer", position: "relative" }}
                onClick={() => document.getElementById("media-file-input")?.click()}
              >
                <input id="media-file-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && !f.type.startsWith("image/")) { alert("Only images are allowed (JPG, PNG, GIF, WebP)."); return; }
                    setMediaFile(f); setUploadedUrl(null); setUploadProgress(0);
                    if (f) uploadMediaFile(f);
                  }} />
                {mediaFile ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                    {uploadedUrl
                      ? <CheckCircle2 size={14} color="#10b981" strokeWidth={2.5} />
                      : <div style={{ width: "14px", height: "14px", border: "2px solid #dde5ed", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />}
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-1)", fontWeight: 500 }}>{mediaFile.name}</span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>({(mediaFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                ) : (
                  <><p style={{ margin: "0 0 0.25rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-2)" }}>Click to select an image</p>
                  <p style={{ margin: 0, fontSize: "0.6875rem", color: "var(--text-3)" }}>JPG, PNG, GIF, WebP — max 10 MB</p></>
                )}
              </div>
            </div>
            {(isUploading || uploadProgress > 0) && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3125rem" }}>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: isUploading ? "#3b82f6" : "#10b981" }}>{isUploading ? "Uploading to cloud…" : "Upload complete"}</span>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: isUploading ? "#3b82f6" : "#10b981" }}>{uploadProgress}%</span>
                </div>
                <div style={{ height: "5px", backgroundColor: "var(--border)", borderRadius: "99px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${uploadProgress}%`, backgroundColor: isUploading ? "#3b82f6" : "#10b981", borderRadius: "99px", transition: "width 0.2s ease" }} />
                </div>
              </div>
            )}
            {(postContent || uploadedUrl) && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.5rem" }}>Preview</label>
                <div style={{ border: "1px solid #dadde1", borderRadius: "8px", backgroundColor: "#fff", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                  <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "#1877F2", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                      {fbPages[0]?.picture?.data?.url
                        ? <img src={fbPages[0].picture.data.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <Globe size={20} color="white" strokeWidth={2} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 1px", fontSize: "0.875rem", fontWeight: 700, color: "#050505" }}>{fbPages[0]?.name ?? "Your Page"}</p>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "#65676b" }}>Just now · 🌐</p>
                    </div>
                    <span style={{ fontSize: "1.25rem", color: "#65676b", cursor: "default", lineHeight: 1 }}>···</span>
                  </div>
                  {postContent && (
                    <div style={{ padding: "0 16px 12px", fontSize: "0.9375rem", color: "#050505", lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{postContent}</div>
                  )}
                  {uploadedUrl && (
                    <div style={{ backgroundColor: "#f0f2f5", position: "relative" }}>
                      <img
                        src={uploadedUrl}
                        alt="Post media"
                        style={{ width: "100%", maxHeight: "320px", objectFit: "cover", display: "block" }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                  <div style={{ padding: "4px 16px 2px", borderTop: "1px solid #e4e6eb", display: "flex" }}>
                    {["\uD83D\uDC4D Like", "\uD83D\uDCAC Comment", "\u2197 Share"].map((a) => (
                      <button key={a} style={{ flex: 1, padding: "8px 4px", border: "none", borderRadius: "4px", backgroundColor: "transparent", fontSize: "0.8125rem", fontWeight: 600, color: "#65676b", cursor: "default" }}>{a}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* ── First Comment ── */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", margin: 0 }}>
                  <MessageSquare size={12} strokeWidth={2.5} color="#1877F2" />
                  First Comment
                  <span style={{ fontWeight: 400, color: "var(--text-3)", fontSize: "0.6875rem" }}>(optional)</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <Clock size={10} strokeWidth={2} color="var(--text-3)" />
                  {(["Now","15m","30m","1hr","Custom"] as const).map(opt => {
                    const active = commentDelayMode === opt;
                    return (
                      <button key={opt} type="button" onClick={() => setCommentDelayMode(opt)} style={{
                        padding: "0.1875rem 0.5rem",
                        borderRadius: "99px",
                        border: `1px solid ${active ? "#1877F2" : "var(--border)"}`,
                        backgroundColor: active ? "#eff6ff" : "transparent",
                        color: active ? "#1877F2" : "var(--text-3)",
                        fontSize: "0.625rem",
                        fontWeight: active ? 700 : 400,
                        cursor: "pointer",
                        letterSpacing: "0.01em",
                        transition: "all 0.12s ease",
                        display: "flex", alignItems: "center", gap: "2px",
                      }}>
                        {opt === "Now" && <Zap size={8} strokeWidth={2.5} />}
                        {opt}
                      </button>
                    );
                  })}
                  {commentDelayMode === "Custom" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginLeft: "0.125rem" }}>
                      <input
                        type="number" min={1} max={1440}
                        value={commentDelayCustom}
                        onChange={e => setCommentDelayCustom(e.target.value)}
                        style={{ width: "40px", padding: "0.1875rem 0.3125rem", borderRadius: "0.375rem", border: "1px solid #1877F2", fontSize: "0.625rem", textAlign: "center", color: "#1877F2", fontWeight: 700, outline: "none", backgroundColor: "#eff6ff" }}
                      />
                      <span style={{ fontSize: "0.625rem", color: "var(--text-3)" }}>min</span>
                    </div>
                  )}
                </div>
              </div>
              <textarea
                value={firstComment}
                onChange={(e) => setFirstComment(e.target.value)}
                style={{ ...inputStyle, height: "72px", resize: "vertical" }}
                placeholder="e.g. Comment below or DM us for pricing 🔥"
              />
              {firstComment && commentDelayMode !== "Now" && (
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.6875rem", color: "#1877F2", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <Clock size={10} strokeWidth={2} />
                  Will drop <strong>{commentDelayMode === "Custom" ? `${commentDelayCustom} min` : commentDelayMode}</strong> after post publishes
                </p>
              )}
            </div>
            </>)}

            {/* ── Comment trigger action ── */}
            {campaignType === "Comment on post" && (<>
              <div style={{ display: "flex", gap: "0.625rem", padding: "0.75rem 1rem", backgroundColor: "#f0f6ff", borderRadius: "0.625rem", border: "1px solid #bfdbfe", marginBottom: "1rem", alignItems: "flex-start" }}>
                <MessageSquare size={15} color="#1877F2" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: "1px" }} />
                <div>
                  <p style={{ margin: "0 0 0.125rem", fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-1)" }}>Trigger Mode Active</p>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#4b5563", lineHeight: "1.5" }}>The Sniper monitors your selected targets and auto-comments whenever a post matches your keywords.</p>
                </div>
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Trigger Keywords</label>
                <input type="text" value={triggerKeywords} onChange={(e) => setTriggerKeywords(e.target.value)} style={{ ...inputStyle }} placeholder="Price, Info, Interested, Buy, How much…" />
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.6875rem", color: "var(--text-3)" }}>Comma-separated · Case-insensitive · Fires when ANY keyword matches a post</p>
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Auto-Reply Message</label>
                <textarea value={autoReply} onChange={(e) => setAutoReply(e.target.value)} style={{ ...inputStyle, height: "90px", resize: "vertical" }} placeholder="Hey! Thanks for your interest. DM us for pricing and availability \uD83D\uDD25" />
              </div>
            </>)}

            {/* ── Like auto-boost action ── */}
            {campaignType === "Like posts" && (
              <div style={{ display: "flex", gap: "0.875rem", padding: "1rem 1.125rem", backgroundColor: "#f0fdf4", borderRadius: "0.625rem", border: "1px solid #bbf7d0", marginBottom: "1rem", alignItems: "flex-start" }}>
                <ThumbsUp size={18} color="#10b981" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: "1px" }} />
                <div>
                  <p style={{ margin: "0 0 0.3125rem", fontSize: "0.875rem", fontWeight: 700, color: "var(--text-1)" }}>Auto-Like Mode</p>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "#374151", lineHeight: "1.6" }}>The Sniper uses your connected <strong>Page Token</strong> to automatically Like posts on your selected targets. No content needed — select your targets above and set a schedule. Your page engages continuously, boosting algorithmic reach and social proof.</p>
                </div>
              </div>
            )}

            <div style={{ marginBottom: "1rem", position: "relative" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Schedule</label>
              <button type="button" onClick={() => setShowCalendar(!showCalendar)}
                style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left", width: "100%" }}>
                <span style={{ color: scheduleDate ? "#1d1d1d" : "#9ca3af", fontSize: "0.875rem" }}>
                  {scheduleDate
                    ? `${scheduleDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${scheduleHour}:${scheduleMinute} ${scheduleAmPm}`
                    : "Post immediately (or pick a date)"}
                </span>
                <Calendar size={14} color="#6b7785" />
              </button>
              <p style={{ margin: "0.3125rem 0 0", fontSize: "0.6875rem", color: "var(--text-3)", lineHeight: "1.4" }}>Set run time. Leave blank to execute immediately. Use <strong>Frequency</strong> above for daily repeat.</p>
              {showCalendar && (() => {
                const today = new Date(); today.setHours(0,0,0,0);
                const yr = calViewDate.getFullYear(), mo = calViewDate.getMonth();
                const firstDay = new Date(yr, mo, 1).getDay();
                const daysInMonth = new Date(yr, mo + 1, 0).getDate();
                const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)];
                while (cells.length % 7 !== 0) cells.push(null);
                const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                return (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200, backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "0.875rem", padding: "1.25rem", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", minWidth: "270px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
                      <button type="button" onClick={() => setCalViewDate(new Date(yr, mo-1, 1))} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", padding: "0.25rem", borderRadius: "0.375rem", display:"flex" }}><ChevronLeft size={14} /></button>
                      <span style={{ color: "#f0f0f0", fontSize: "0.875rem", fontWeight: 700 }}>{MONTHS[mo]} {yr}</span>
                      <button type="button" onClick={() => setCalViewDate(new Date(yr, mo+1, 1))} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", padding: "0.25rem", borderRadius: "0.375rem", display:"flex" }}><ChevronRight size={14} /></button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "0.3125rem" }}>
                      {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d} style={{ textAlign: "center", fontSize: "0.625rem", color: "#555", fontWeight: 700, padding: "0.125rem 0" }}>{d}</div>)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "0.875rem" }}>
                      {cells.map((day, i) => {
                        if (!day) return <div key={i} />;
                        const cellDate = new Date(yr, mo, day);
                        const isPast = cellDate < today;
                        const isToday = cellDate.getTime() === today.getTime();
                        const isSel = scheduleDate && scheduleDate.getFullYear()===yr && scheduleDate.getMonth()===mo && scheduleDate.getDate()===day;
                        return (
                          <button key={i} type="button" disabled={isPast} onClick={() => setScheduleDate(new Date(yr,mo,day))}
                            style={{ padding: "0.3125rem 0", textAlign: "center", borderRadius: "6px", fontSize: "0.8125rem", fontWeight: isSel ? 700 : 400,
                              backgroundColor: isSel ? "#ffffff" : isToday ? "#2a2a2a" : "transparent",
                              color: isSel ? "#000" : isPast ? "#383838" : "#e0e0e0",
                              border: isToday && !isSel ? "1px solid #3a3a3a" : "none", cursor: isPast ? "default" : "pointer" }}>{day}</button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", backgroundColor: "#111", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", marginBottom: "0.875rem" }}>
                      <Clock size={13} color="#555" />
                      <select value={scheduleHour} onChange={e => setScheduleHour(e.target.value)} style={{ background: "none", border: "none", color: "#e0e0e0", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", outline: "none" }}>
                        {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(h=><option key={h} value={h} style={{backgroundColor:"#222"}}>{h}</option>)}
                      </select>
                      <span style={{ color: "#444", fontWeight: 700 }}>:</span>
                      <select value={scheduleMinute} onChange={e => setScheduleMinute(e.target.value)} style={{ background: "none", border: "none", color: "#e0e0e0", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", outline: "none" }}>
                        {["00","15","30","45"].map(m=><option key={m} value={m} style={{backgroundColor:"#222"}}>{m}</option>)}
                      </select>
                      <select value={scheduleAmPm} onChange={e => setScheduleAmPm(e.target.value as "AM"|"PM")} style={{ background: "none", border: "none", color: "#e0e0e0", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", outline: "none" }}>
                        <option value="AM" style={{backgroundColor:"#222"}}>AM</option>
                        <option value="PM" style={{backgroundColor:"#222"}}>PM</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button type="button" onClick={() => { setScheduleDate(null); setShowCalendar(false); }} style={{ flex: 1, padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #2d2d2d", backgroundColor: "transparent", color: "#888", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}>Clear</button>
                      <button type="button" onClick={() => setShowCalendar(false)} style={{ flex: 2, padding: "0.5rem", borderRadius: "0.5rem", border: "none", backgroundColor: "#ffffff", color: "#000", fontSize: "0.8125rem", fontWeight: 700, cursor: "pointer" }}>Apply</button>
                    </div>
                  </div>
                );
              })()}
            </div>
            {launchError && selectedTargets.length === 0 && (
              <div style={{ display: "flex", gap: "0.5rem", padding: "0.625rem 0.875rem", backgroundColor: "#fef2f2", borderRadius: "0.5rem", border: "1px solid #fecaca", marginBottom: "0.75rem", alignItems: "center" }}>
                <AlertCircle size={14} color="#ef4444" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "#dc2626", fontWeight: 500 }}>{launchError}</p>
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setShowSniperForm(false)} style={{ padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-2)", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={async () => {
                  if (!user?.id) return;
                  if (selectedTargets.length === 0) { setLaunchError("Select at least one Page or Group before launching."); return; }
                  setLaunchError("");
                  let scheduledAt: string | null = null;
                  if (scheduleDate) {
                    const d = new Date(scheduleDate);
                    let h = parseInt(scheduleHour, 10);
                    if (scheduleAmPm === "PM" && h !== 12) h += 12;
                    if (scheduleAmPm === "AM" && h === 12) h = 0;
                    d.setHours(h, parseInt(scheduleMinute, 10), 0, 0);
                    scheduledAt = d.toISOString();
                  }
                  const targetGroupIds = groups.filter(g => selectedTargets.includes(g.id)).map(g => g.id);
                  const targetPageIds  = fbPages.filter((p: any) => selectedTargets.includes(p.id)).map((p: any) => p.id);

                  if (campaignType === "Post to group/page") {
                    // Use backend endpoint — creates post + optional paired comment atomically
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                    const res = await fetch(`${apiUrl}/api/sniper/schedule-post`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        user_id:              user.id,
                        content:              postContent,
                        target_groups:        targetGroupIds,
                        target_pages:         targetPageIds,
                        scheduled_at:         scheduledAt,
                        frequency,
                        media_url:            uploadedUrl ?? null,
                        comment:              firstComment.trim() || null,
                        comment_delay_minutes: firstComment.trim()
                          ? (commentDelayMode === "Now" ? 0 : commentDelayMode === "15m" ? 15 : commentDelayMode === "30m" ? 30 : commentDelayMode === "1hr" ? 60 : parseInt(commentDelayCustom, 10) || 0)
                          : 0,
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok) { setLaunchError(json.detail || "Failed to launch campaign."); return; }
                    // Refresh campaign list from DB so we get the full row
                    const { data: newCamp } = await supabase.from("automation_posts").select("*").eq("id", json.post_id).single();
                    if (newCamp) setCampaigns(prev => [newCamp, ...prev]);
                  } else {
                    // Comment-trigger and Like campaigns go direct to Supabase (no paired comment needed)
                    const { data: newCamp } = await supabase.from("automation_posts").insert({
                      user_id:       user.id,
                      content:       postContent,
                      target_groups: targetGroupIds,
                      target_pages:  targetPageIds,
                      status:        scheduledAt ? "scheduled" : "pending",
                      scheduled_at:  scheduledAt,
                      metadata:      { action_type: campaignType, frequency, media_url: uploadedUrl ?? null, trigger_keywords: triggerKeywords || null, auto_reply: autoReply || null },
                    }).select().single();
                    if (newCamp) setCampaigns(prev => [newCamp, ...prev]);
                  }

                  const newCount = campaignCount + 1;
                  setCampaignCount(newCount);
                  try { localStorage.setItem(`sniper_campaigns_${user.id}`, String(newCount)); } catch {}
                  logActivity("Launched Campaign", campaignType, "pending");
                  setPostContent(""); setMediaFile(null); setUploadedUrl(null); setUploadProgress(0); setSelectedTargets([]); setScheduleDate(null); setFrequency("once"); setTriggerKeywords(""); setAutoReply(""); setFirstComment(""); setCommentDelayMode("Now"); setCommentDelayCustom("15"); setLaunchError("");
                  setShowSniperForm(false);
                }}
                style={{ ...btnPrimary }}
              ><Send size={13} strokeWidth={2.5} />Launch Campaign</button>
            </div>
          </div>
        )}

        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "1.125rem 1.375rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><h3 style={h3}>Active Campaigns</h3><p style={{ margin: "0.125rem 0 0", fontSize: "0.75rem", color: "var(--text-3)" }}>All running and scheduled campaigns</p></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 100px 100px 100px", padding: "0.5rem 1.375rem", borderBottom: "1px solid var(--border)" }}>
            {["Campaign","Targets","Action","Status","Controls"].map(h => <span key={h} style={label}>{h}</span>)}
          </div>
          {campaignsLoading ? (
            <div style={{ padding: "2.5rem", textAlign: "center" }}>
              <div style={{ width: "18px", height: "18px", border: "2px solid #edf1f4", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 0.5rem" }} />
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-3)" }}>Loading campaigns…</p>
            </div>
          ) : campaigns.length === 0 ? (
            emptyState(<Target size={18} color="#c0c8cf" />, "No campaigns yet", "Create your first campaign above to start automating.")
          ) : (
            campaigns.map((c: any) => {
              const actionLabel: string = c.metadata?.action_type ?? "Post";
              const targetCount = (c.target_groups?.length ?? 0) + (c.target_pages?.length ?? 0);
              const campaignName: string = (c.content?.trim()?.slice(0, 42) || actionLabel);
              const freq: string = c.metadata?.frequency ?? "once";
              const statusColor: Record<string,string> = { pending: "#3b82f6", scheduled: "#f59e0b", running: "#10b981", completed: "#6b7785", failed: "#ef4444" };
              const statusLabel: Record<string,string> = { pending: "Queued", scheduled: "Scheduled", running: "Running", completed: "Done", failed: "Failed" };
              const color = statusColor[c.status] ?? "#bababa";
              return (
                <div key={c.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 100px 100px 100px", padding: "0.875rem 1.375rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                  <div style={{ overflow: "hidden" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{campaignName}{(c.content?.trim()?.length ?? 0) > 42 ? "…" : ""}</p>
                    <p style={{ margin: 0, fontSize: "0.6875rem", color: "var(--text-3)" }}>{freq === "daily" ? "Daily" : "One-time"} · {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-2)" }}>{targetCount} target{targetCount !== 1 ? "s" : ""}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actionLabel.split(" ")[0]}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.1875rem 0.5625rem", borderRadius: "2rem", backgroundColor: `${color}15`, border: `1px solid ${color}40`, width: "fit-content" }}>
                    <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
                    <span style={{ fontSize: "0.6875rem", fontWeight: 600, color }}>{statusLabel[c.status] ?? c.status}</span>
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from("automation_posts").delete().eq("id", c.id).then(null, () => {});
                      setCampaigns(prev => prev.filter((x: any) => x.id !== c.id));
                    }}
                    style={{ width: "28px", height: "28px", borderRadius: "0.375rem", border: "1px solid #fecaca", backgroundColor: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  ><Trash2 size={12} color="#ef4444" strokeWidth={2.5} /></button>
                </div>
              );
            })
          )}
        </div>
      </>
    );

    // ── GROUPS ────────────────────────────────────────────────────────────────
    if (activeNav === "Groups") {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const loadSessions = async () => {
        if (!user?.id) return;
        setSessionsLoading(true);
        try {
          const r = await fetch(`${apiBase}/api/fb/sessions?user_id=${user.id}`);
          const d = await r.json();
          if (d.success) setFbSessions(d.sessions || []);
        } catch {} finally { setSessionsLoading(false); }
      };

      const loginServiceBase = "https://api-login.astraventa.com";

      const handleConnectFB = async () => {
        if (!user?.id) return;
        // If login service is configured, use live noVNC iframe modal
        if (loginServiceBase) {
          setConnectingSession(true); setSessionConnectError(null);
          try {
            const r = await fetch(`${loginServiceBase}/start-login`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: user.id }),
            });
            const d = await r.json();
            if (d.success) {
              setLoginModal({ token: d.token, novncUrl: `https://api-login.astraventa.com/static/novnc/vnc.html?host=api-login.astraventa.com&port=443&path=websockify%3Ftoken%3D${d.token}&autoconnect=true&resize=scale&show_dot=false` });
              setLoginPollStatus("waiting");
              // Poll for completion
              const poll = setInterval(async () => {
                try {
                  const sr = await fetch(`${loginServiceBase}/login-status/${d.token}`);
                  const sd = await sr.json();
                  if (sd.status === "done") {
                    clearInterval(poll);
                    setLoginPollStatus("done");
                    setTimeout(() => { setLoginModal(null); setLoginPollStatus(null); loadSessions(); }, 2500);
                  } else if (sd.status === "expired" || sd.status === "error") {
                    clearInterval(poll);
                    setLoginPollStatus("error");
                  }
                } catch {}
              }, 3000);
            } else { setSessionConnectError(d.detail || "Failed to start login service."); }
          } catch (e: any) { setSessionConnectError("Login service unreachable. See instructions below."); setShowConnectInstructions(true); }
          finally { setConnectingSession(false); }
        } else {
          // Fallback: show manual script instructions
          setShowConnectInstructions(v => !v);
          setSessionConnectError(null);
        }
      };

      const handleCopyUserId = () => {
        if (!user?.id) return;
        navigator.clipboard.writeText(user.id);
        setCopiedUserId(true);
        setTimeout(() => setCopiedUserId(false), 2000);
      };

      const handleDisconnectSession = async (sid: string) => {
        if (!user?.id) return;
        await fetch(`${apiBase}/api/fb/session/disconnect`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id, session_id: sid }),
        });
        setFbSessions(prev => prev.filter(s => s.id !== sid));
      };

      const handleFetchGroups = async (sid: string) => {
        if (!user?.id) return;
        setFetchingGroups(true); setFetchGroupsError(null);
        try {
          const r = await fetch(`${apiBase}/api/fb/groups/fetch`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: user.id, session_id: sid, persist: true }),
          });
          const d = await r.json();
          if (d.success) {
            const { data: gData } = await supabase.from("target_groups").select("id,name,url,validation_status,privacy,is_member,can_post,requires_approval,session_id").eq("user_id", user.id).eq("is_active", true);
            if (gData) setGroups(gData);
          } else setFetchGroupsError(d.detail || "Failed to fetch groups.");
        } catch (e: any) { setFetchGroupsError(e.message); }
        finally { setFetchingGroups(false); }
      };

      const handleAddGroup = async () => {
        if (!addGroupUrl.trim() || !addGroupSession) return;
        setAddGroupLoading(true); setAddGroupResult(null);
        try {
          const r = await fetch(`${apiBase}/api/fb/groups/validate`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: user?.id, session_id: addGroupSession, url: addGroupUrl.trim(), name: addGroupName.trim() || undefined, persist: true }),
          });
          const d = await r.json();
          if (d.success) {
            const v = d.validation || {};
            const canPost = v.exists && v.can_post;
            setAddGroupResult({ ok: canPost, msg: canPost ? `✓ Group verified — ${v.privacy || "unknown"} group, you are a member${v.requires_approval ? " (posts need admin approval)" : ""}.` : `✗ ${!v.exists ? "Group not found or URL is invalid." : !v.is_member ? "You are not a member of this group." : "Cannot post in this group."}` });
            if (canPost) {
              const { data: gData } = await supabase.from("target_groups").select("id,name,url,validation_status,privacy,is_member,can_post,requires_approval,session_id").eq("user_id", user?.id || "").eq("is_active", true);
              if (gData) setGroups(gData);
              setAddGroupUrl(""); setAddGroupName("");
            }
          } else { setAddGroupResult({ ok: false, msg: d.detail || "Validation failed." }); }
        } catch (e: any) { setAddGroupResult({ ok: false, msg: e.message }); }
        finally { setAddGroupLoading(false); }
      };

      const getStatusBadge = (g: typeof groups[0]) => {
        const s = g.validation_status;
        if (s === "valid" && g.can_post) return { bg: "#f0fdf4", border: "#bbf7d0", dot: "#10b981", text: "#166534", label: "Active" };
        if (s === "invalid") return { bg: "#fef2f2", border: "#fecaca", dot: "#ef4444", text: "#991b1b", label: "Invalid" };
        if (g.requires_approval) return { bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b", text: "#92400e", label: "Pending Approval" };
        return { bg: "var(--hover-bg)", border: "var(--border)", dot: "#9ca3af", text: "var(--text-2)", label: "Unverified" };
      };

      return (
        <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ margin: "0 0 0.25rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "var(--text-1)", letterSpacing: "-0.4px" }}>Groups</h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)" }}>Manage Facebook groups for browser-based posting</p>
            </div>
            <button onClick={() => { setShowAddGroupForm(v => !v); setAddGroupResult(null); }} style={{ ...btnPrimary }}>
              <Plus size={14} strokeWidth={2.5} />{showAddGroupForm ? "Cancel" : "Add Group"}
            </button>
          </div>

          {/* ── noVNC Login Modal ── */}
          {loginModal && (
            <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
              <div style={{ width: "100%", maxWidth: "900px", backgroundColor: "#111", borderRadius: "1rem", overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
                <div style={{ padding: "0.875rem 1.25rem", backgroundColor: "#1d1d1d", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: loginPollStatus === "done" ? "#10b981" : loginPollStatus === "error" ? "#ef4444" : "#f59e0b", animation: loginPollStatus === "waiting" ? "pulse 1.5s infinite" : "none" }} />
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#fff" }}>
                      {loginPollStatus === "done" ? "✅ Connected! Closing…" : loginPollStatus === "error" ? "Session expired — please try again" : "Log into Facebook in the window below"}
                    </span>
                  </div>
                  <button onClick={() => { setLoginModal(null); setLoginPollStatus(null); }} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "1.25rem", cursor: "pointer", lineHeight: 1 }}>✕</button>
                </div>
                <iframe src={loginModal.novncUrl} style={{ width: "100%", height: "560px", border: "none", display: "block" }} allow="clipboard-read; clipboard-write" />
              </div>
            </div>
          )}

          {/* ── Step 1: Connect Facebook Session ── */}
          <div style={{ ...card, marginBottom: "1.25rem", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.375rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <h3 style={h3}>Connected Facebook Accounts</h3>
                <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-3)", backgroundColor: "var(--hover-bg)", padding: "0.1875rem 0.5rem", borderRadius: "2rem" }}>{fbSessions.length} account{fbSessions.length !== 1 ? "s" : ""}</span>
              </div>
              <button onClick={handleConnectFB} style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: showConnectInstructions ? "#1d1d1d" : "var(--surface)", color: showConnectInstructions ? "#fff" : "var(--text-1)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}>
                {showConnectInstructions ? "Hide Instructions" : "Connect Account"}
              </button>
            </div>
            {/* Local script instructions panel */}
            {showConnectInstructions && (
              <div style={{ margin: "1rem 1.375rem", padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "var(--hover-bg)", border: "1px solid var(--border)" }}>
                <p style={{ margin: "0 0 0.875rem", fontSize: "0.875rem", fontWeight: 700, color: "var(--text-1)" }}>How to connect your Facebook account</p>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                  Because the backend runs on Render (a headless server), Facebook login must be captured on <strong>your local machine</strong> once, then sent to Render automatically.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                  {[
                    { n: "1", t: "Install Python + dependencies", code: "pip install playwright requests && playwright install chromium" },
                    { n: "2", t: "Download the capture script from your repo", code: "tools/fb_login_capture.py" },
                    { n: "3", t: "Run the script", code: "python fb_login_capture.py" },
                    { n: "4", t: "Enter your Render URL when prompted", code: process.env.NEXT_PUBLIC_API_URL || "https://your-render-app.onrender.com" },
                  ].map(({ n, t, code }) => (
                    <div key={n} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                      <div style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: "#1d1d1d", color: "#fff", fontSize: "0.6875rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>{n}</div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: "0 0 0.2rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>{t}</p>
                        <code style={{ fontSize: "0.75rem", color: "var(--text-2)", backgroundColor: "var(--surface)", padding: "0.2rem 0.5rem", borderRadius: "0.3rem", border: "1px solid var(--border)", display: "inline-block", wordBreak: "break-all" }}>{code}</code>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                    <div style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: "#1d1d1d", color: "#fff", fontSize: "0.6875rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>5</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: "0 0 0.2rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Enter your User ID when prompted</p>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <code style={{ fontSize: "0.75rem", color: "var(--text-2)", backgroundColor: "var(--surface)", padding: "0.2rem 0.5rem", borderRadius: "0.3rem", border: "1px solid var(--border)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.id || "—"}</code>
                        <button onClick={handleCopyUserId} style={{ padding: "0.25rem 0.625rem", borderRadius: "0.375rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-1)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{copiedUserId ? "Copied ✓" : "Copy ID"}</button>
                      </div>
                    </div>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-3)", lineHeight: 1.5 }}>After the script completes, click <strong>Refresh</strong> below to see your account appear.</p>
                <button onClick={loadSessions} style={{ marginTop: "0.75rem", padding: "0.375rem 0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-1)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}>Refresh Sessions</button>
              </div>
            )}

            {sessionConnectError && (
              <div style={{ margin: "0.75rem 1.375rem", padding: "0.625rem 0.875rem", borderRadius: "0.5rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", fontSize: "0.8125rem", color: "#991b1b" }}>
                {sessionConnectError}
              </div>
            )}
            {sessionsLoading ? (
              <div style={{ padding: "1.5rem", textAlign: "center", fontSize: "0.8125rem", color: "var(--text-3)" }}>Loading sessions…</div>
            ) : fbSessions.length === 0 ? (
              <div style={{ padding: "2rem 1.375rem", textAlign: "center" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "var(--hover-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem" }}>
                  <Users size={18} color="#9ca3af" strokeWidth={2} />
                </div>
                <p style={{ margin: "0 0 0.25rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-1)" }}>No Facebook account connected</p>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)" }}>Click "Connect Account" — a browser will open for you to log in once.</p>
              </div>
            ) : (
              fbSessions.map(s => {
                const isActive = s.status === "active";
                const isExpired = s.status === "expired" || s.status === "invalid";
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1.375rem", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: isExpired ? "#fef2f2" : "#eff6ff", border: `1px solid ${isExpired ? "#fecaca" : "#bfdbfe"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <User size={16} color={isExpired ? "#ef4444" : "#3b82f6"} strokeWidth={2} />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, color: "var(--text-1)" }}>{s.fb_account_name || "Facebook Account"}</p>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-3)" }}>ID: {s.fb_account_id || "—"} &nbsp;·&nbsp; {s.last_validated_at ? `Checked ${new Date(s.last_validated_at).toLocaleDateString()}` : "Never checked"}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.1875rem 0.625rem", borderRadius: "2rem", backgroundColor: isExpired ? "#fef2f2" : isActive ? "#f0fdf4" : "#fffbeb", border: `1px solid ${isExpired ? "#fecaca" : isActive ? "#bbf7d0" : "#fde68a"}` }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: isExpired ? "#ef4444" : isActive ? "#10b981" : "#f59e0b" }} />
                        <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: isExpired ? "#991b1b" : isActive ? "#166534" : "#92400e" }}>{isExpired ? "Expired" : isActive ? "Active" : s.status}</span>
                      </div>
                      {isExpired && (
                        <button onClick={handleConnectFB} style={{ padding: "0.375rem 0.75rem", borderRadius: "0.5rem", border: "1px solid #fecaca", backgroundColor: "#fef2f2", color: "#ef4444", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>Reconnect</button>
                      )}
                      <button onClick={() => handleFetchGroups(s.id)} disabled={fetchingGroups || !isActive} style={{ padding: "0.375rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-2)", fontSize: "0.75rem", fontWeight: 600, cursor: (!isActive || fetchingGroups) ? "not-allowed" : "pointer", opacity: (!isActive || fetchingGroups) ? 0.5 : 1 }}>
                        {fetchingGroups ? "Fetching…" : "Auto-fetch Groups"}
                      </button>
                      <button onClick={() => handleDisconnectSession(s.id)} style={{ padding: "0.375rem 0.625rem", borderRadius: "0.5rem", border: "1px solid #fecaca", backgroundColor: "transparent", color: "#ef4444", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>Disconnect</button>
                    </div>
                  </div>
                );
              })
            )}
            {fetchGroupsError && (
              <div style={{ margin: "0.75rem 1.375rem", padding: "0.625rem 0.875rem", borderRadius: "0.5rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", fontSize: "0.8125rem", color: "#991b1b" }}>{fetchGroupsError}</div>
            )}
          </div>

          {/* ── Step 2: Add group by URL ── */}
          {showAddGroupForm && (
            <div style={{ ...card, marginBottom: "1.25rem", padding: "1.25rem 1.375rem" }}>
              <h3 style={{ ...h3, marginBottom: "1rem" }}>Add Group by URL</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <label style={{ ...label }}>Facebook Group URL</label>
                  <input value={addGroupUrl} onChange={e => setAddGroupUrl(e.target.value)} placeholder="https://www.facebook.com/groups/your-group-slug" style={{ padding: "0.625rem 0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: "var(--input-bg)", color: "var(--text-1)", fontSize: "0.875rem", outline: "none" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <label style={{ ...label }}>Group Name (optional)</label>
                  <input value={addGroupName} onChange={e => setAddGroupName(e.target.value)} placeholder="e.g. My Marketing Group" style={{ padding: "0.625rem 0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: "var(--input-bg)", color: "var(--text-1)", fontSize: "0.875rem", outline: "none" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <label style={{ ...label }}>Facebook Account Session</label>
                  <select value={addGroupSession} onChange={e => setAddGroupSession(e.target.value)} style={{ padding: "0.625rem 0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)", backgroundColor: "var(--input-bg)", color: "var(--text-1)", fontSize: "0.875rem", outline: "none" }}>
                    <option value="">— Select account —</option>
                    {fbSessions.filter(s => s.status === "active").map(s => (
                      <option key={s.id} value={s.id}>{s.fb_account_name || "Facebook Account"} ({s.fb_account_id})</option>
                    ))}
                  </select>
                </div>
                <button onClick={handleAddGroup} disabled={addGroupLoading || !addGroupUrl.trim() || !addGroupSession} style={{ ...btnPrimary, opacity: (addGroupLoading || !addGroupUrl.trim() || !addGroupSession) ? 0.6 : 1, cursor: (addGroupLoading || !addGroupUrl.trim() || !addGroupSession) ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
                  {addGroupLoading ? "Validating…" : "Validate & Add"}
                </button>
                {addGroupResult && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", padding: "0.75rem 1rem", borderRadius: "0.625rem", backgroundColor: addGroupResult.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${addGroupResult.ok ? "#bbf7d0" : "#fecaca"}` }}>
                    {addGroupResult.ok
                      ? <CheckCircle2 size={16} color="#10b981" strokeWidth={2} style={{ flexShrink: 0, marginTop: "1px" }} />
                      : <AlertCircle size={16} color="#ef4444" strokeWidth={2} style={{ flexShrink: 0, marginTop: "1px" }} />}
                    <span style={{ fontSize: "0.8125rem", color: addGroupResult.ok ? "#166534" : "#991b1b", lineHeight: "1.5" }}>{addGroupResult.msg}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Groups table ── */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "1.125rem 1.375rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h3 style={h3}>Your Groups</h3>
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-3)", backgroundColor: "var(--hover-bg)", padding: "0.1875rem 0.5rem", borderRadius: "2rem" }}>{groups.length} groups</span>
            </div>
            {groups.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 80px 130px 90px", padding: "0.5rem 1.375rem", borderBottom: "1px solid var(--border)" }}>
                {["Group Name", "URL", "Privacy", "Status", "Actions"].map(h => <span key={h} style={label}>{h}</span>)}
              </div>
            )}
            {groups.length > 0 ? groups.map(g => {
              const badge = getStatusBadge(g);
              return (
                <div key={g.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 80px 130px 90px", padding: "0.75rem 1.375rem", borderBottom: "1px solid var(--border)", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0 }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "50%", backgroundColor: badge.bg, border: `1px solid ${badge.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Users size={14} color={badge.dot} strokeWidth={2} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-1)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                      {g.requires_approval && <span style={{ fontSize: "0.6875rem", color: "#f59e0b", fontWeight: 500 }}>Needs admin approval</span>}
                    </div>
                  </div>
                  <a href={g.url || "#"} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#3b82f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>{g.url ? "Open ↗" : "—"}</a>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-2)", textTransform: "capitalize" }}>{g.privacy || "—"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.1875rem 0.5rem", borderRadius: "2rem", backgroundColor: badge.bg, border: `1px solid ${badge.border}`, width: "fit-content" }}>
                    <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: badge.dot }} />
                    <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: badge.text }}>{badge.label}</span>
                  </div>
                  <button onClick={async () => { await supabase.from("target_groups").update({ is_active: false }).eq("id", g.id); setGroups(prev => prev.filter(x => x.id !== g.id)); }} style={{ background: "none", border: "1px solid #fecaca", borderRadius: "0.375rem", padding: "0.25rem 0.5rem", color: "#ef4444", fontSize: "0.6875rem", fontWeight: 600, cursor: "pointer" }}>Remove</button>
                </div>
              );
            }) : emptyState(<Users size={18} color="#c0c8cf" />, "No groups added", fbSessions.length === 0 ? 'Connect a Facebook account above first, then auto-fetch or add by URL.' : 'Click "Auto-fetch Groups" to import your joined groups, or add one by URL above.')}
          </div>
        </>
      );
    }

    // ── PAGES ─────────────────────────────────────────────────────────────────
    if (activeNav === "Pages") return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div>
            <h2 style={{ margin: "0 0 0.25rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "var(--text-1)", letterSpacing: "-0.4px" }}>Pages</h2>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)" }}>Facebook pages connected to your account</p>
          </div>
          <button
            onClick={handleConnectMeta}
            disabled={tokenVerifying}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "none", backgroundColor: tokenVerifying ? "#4a90d9" : "#1877F2", color: "#ffffff", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "Interdisplay, Arial, sans-serif", cursor: tokenVerifying ? "not-allowed" : "pointer" }}
          >
            {tokenVerifying ? (
              <><div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />Connecting…</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>{tokenSaved ? "Reconnect to update pages" : "Connect Facebook"}</>
            )}
          </button>
        </div>

        {tokenSaved && (
          <div style={{ backgroundColor: "#f0f9ff", borderRadius: "0.75rem", border: "1px solid #bae6fd", padding: "0.875rem 1.125rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <CheckCircle2 size={15} color="#0284c7" strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "#0c4a6e", lineHeight: "1.5em" }}>
              Pages shown below are grouped by your connected Facebook accounts. Manage connections in the Facebook Accounts settings.
            </p>
          </div>
        )}

        {connectedAccounts.map((account, accIndex) => (
          <div key={account.access_token || accIndex} style={{ ...card, overflow: "hidden", marginBottom: "1.25rem" }}>
            <div style={{ padding: "1.125rem 1.375rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {account.picture ? (
                 <img src={account.picture} alt="" style={{ width: "24px", height: "24px", borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                 <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "#1877F2" }} />
              )}
              <h3 style={h3}>{account.name || "Facebook Account"}</h3>
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-3)", backgroundColor: "var(--hover-bg)", padding: "0.1875rem 0.5rem", borderRadius: "2rem" }}>{(account.pages || []).length} pages</span>
            </div>
            {pagesLoading ? (
              <div style={{ padding: "3rem", textAlign: "center" }}>
                <div style={{ width: "22px", height: "22px", border: "2px solid #edf1f4", borderTopColor: "#1d1d1d", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 0.75rem" }} />
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-3)" }}>Loading your pages…</p>
              </div>
            ) : (account.pages || []).length > 0 ? (
              account.pages.map((page: any) => (
                <div key={page.id} style={{ padding: "0.875rem 1.375rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "1rem" }}>
                  {page.picture?.data?.url ? (
                    <img src={page.picture.data.url} alt={page.name} style={{ width: "38px", height: "38px", borderRadius: "0.5rem", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: "38px", height: "38px", borderRadius: "0.5rem", backgroundColor: "var(--hover-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Globe size={18} color="#c0c8cf" strokeWidth={2} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 0.125rem", fontWeight: 600, fontSize: "0.875rem", color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{page.name}</p>
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)" }}>{page.category ?? "Page"}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ margin: "0 0 0.125rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>{page.fan_count != null ? page.fan_count.toLocaleString() : "—"}</p>
                    <p style={{ margin: 0, fontSize: "0.6875rem", color: "var(--text-3)" }}>followers</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3125rem", padding: "0.25rem 0.5625rem", borderRadius: "2rem", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", flexShrink: 0 }}>
                    <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#10b981" }} />
                    <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#166534" }}>Connected</span>
                  </div>
                  <a href={`https://facebook.com/${page.id}`} target="_blank" rel="noreferrer"
                    style={{ padding: "0.375rem 0.625rem", borderRadius: "0.4375rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-2)", fontSize: "0.75rem", fontWeight: 500, textDecoration: "none", display: "flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 }}>
                    View <ArrowUpRight size={11} />
                </a>
              </div>
            ))
          ) : (
            emptyState(<Globe size={18} color="#c0c8cf" />, "No managed pages found", "This account doesn't manage any Facebook pages.")
          )}
        </div>
        ))}
        {connectedAccounts.length === 0 && emptyState(<Key size={18} color="#c0c8cf" />, "Meta not connected", "Go to Facebook Accounts and connect your Facebook account first.")}
      </>
    );

    // ── POST QUEUE ────────────────────────────────────────────────────────────
    if (activeNav === "Post Queue") {
      const filters: { key: "all"|"pending"|"sent"|"failed"; label: string; color: string }[] = [
        { key: "all",     label: "All",     color: "var(--text-2)" },
        { key: "pending", label: "Pending", color: "#f59e0b" },
        { key: "sent",    label: "Sent",    color: "#10b981" },
        { key: "failed",  label: "Failed",  color: "#ef4444" },
      ];
      return (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ margin: "0 0 0.25rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "var(--text-1)", letterSpacing: "-0.4px" }}>Post Queue</h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)" }}>All scheduled and processed posts</p>
            </div>
            <button onClick={() => setActiveNav("Sniper")} style={{ ...btnPrimary }}><Plus size={14} strokeWidth={2.5} />New Campaign</button>
          </div>

          {/* Stat pills */}
          {(() => {
            const qTotal   = campaigns.length;
            const qPending = campaigns.filter(c => ["pending","scheduled","running"].includes(c.status)).length;
            const qSent    = campaigns.filter(c => c.status === "completed").length;
            const qFailed  = campaigns.filter(c => c.status === "failed").length;
            return (
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {[{ l: "Total", v: qTotal, c: "#6b7785" }, { l: "Pending", v: qPending, c: "#f59e0b" }, { l: "Sent", v: qSent, c: "#10b981" }, { l: "Failed", v: qFailed, c: "#ef4444" }].map(s => (
                  <div key={s.l} style={{ ...card, padding: "0.875rem 1.125rem", flex: 1 }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-2)", fontWeight: 500, marginBottom: "0.375rem" }}>{s.l}</div>
                    <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.375rem", color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem", backgroundColor: "var(--border)", padding: "0.25rem", borderRadius: "0.5rem", width: "fit-content" }}>
            {filters.map(f => (
              <button key={f.key} onClick={() => setQueueFilter(f.key)}
                style={{ padding: "0.3125rem 0.875rem", borderRadius: "0.375rem", border: "none", backgroundColor: queueFilter === f.key ? "var(--surface)" : "transparent", color: queueFilter === f.key ? "var(--text-1)" : "var(--text-2)", fontSize: "0.8125rem", fontWeight: queueFilter === f.key ? 600 : 500, cursor: "pointer", boxShadow: queueFilter === f.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.12s ease" }}
              >{f.label}</button>
            ))}
          </div>

          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 100px 130px 80px", padding: "0.5rem 1.375rem", borderBottom: "1px solid var(--border)" }}>
              {["Content","Target","Status","Scheduled","Actions"].map(h => <span key={h} style={label}>{h}</span>)}
            </div>
            {campaignsLoading ? (
              <div style={{ padding: "2.5rem", textAlign: "center" }}>
                <div style={{ width: "18px", height: "18px", border: "2px solid #edf1f4", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 0.5rem" }} />
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-3)" }}>Loading queue…</p>
              </div>
            ) : (() => {
              const statusColor: Record<string,string> = { pending: "#3b82f6", scheduled: "#f59e0b", running: "#10b981", completed: "#10b981", failed: "#ef4444" };
              const statusLabel: Record<string,string> = { pending: "Queued", scheduled: "Scheduled", running: "Running", completed: "Sent", failed: "Failed" };
              const filtered = campaigns.filter(c => {
                if (queueFilter === "all")     return true;
                if (queueFilter === "pending") return ["pending","scheduled","running"].includes(c.status);
                if (queueFilter === "sent")    return c.status === "completed";
                if (queueFilter === "failed")  return c.status === "failed";
                return true;
              });
              if (filtered.length === 0) return emptyState(<Clock size={18} color="#c0c8cf" />, "Queue is empty", "Launch a sniper campaign — posts will appear here as they are processed.");
              return filtered.map((c: any) => {
                const actionLabel: string = c.metadata?.action_type ?? "Post";
                const targetCount = (c.target_groups?.length ?? 0) + (c.target_pages?.length ?? 0);
                const preview = (c.content?.trim()?.slice(0, 55) || actionLabel);
                const color   = statusColor[c.status] ?? "#bababa";
                const scheduled = c.scheduled_at
                  ? new Date(c.scheduled_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                  : "Immediately";
                return (
                  <div key={c.id} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 100px 130px 80px", padding: "0.875rem 1.375rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                    <div style={{ overflow: "hidden" }}>
                      <p style={{ margin: "0 0 2px", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview}{(c.content?.trim()?.length ?? 0) > 55 ? "…" : ""}</p>
                      <p style={{ margin: 0, fontSize: "0.6875rem", color: "var(--text-3)" }}>{c.metadata?.frequency === "daily" ? "Daily" : "One-time"} · {actionLabel}</p>
                    </div>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-2)" }}>{targetCount} target{targetCount !== 1 ? "s" : ""}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.1875rem 0.5625rem", borderRadius: "2rem", backgroundColor: `${color}15`, border: `1px solid ${color}40`, width: "fit-content" }}>
                      <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontSize: "0.6875rem", fontWeight: 600, color }}>{statusLabel[c.status] ?? c.status}</span>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>{scheduled}</span>
                    <button
                      onClick={async () => {
                        await supabase.from("automation_posts").delete().eq("id", c.id).then(null, () => {});
                        setCampaigns(prev => prev.filter((x: any) => x.id !== c.id));
                      }}
                      style={{ width: "28px", height: "28px", borderRadius: "0.375rem", border: "1px solid #fecaca", backgroundColor: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    ><Trash2 size={12} color="#ef4444" strokeWidth={2.5} /></button>
                  </div>
                );
              });
            })()}
          </div>
        </>
      );
    }

    // ── ANALYTICS ────────────────────────────────────────────────────────────
    if (activeNav === "Analytics") {
      // ── Compute stats from real data ──────────────────────────────────────
      const totalActions   = campaigns.length;
      const successful     = campaigns.filter(c => c.status === "completed").length;
      const failed         = campaigns.filter(c => c.status === "failed").length;
      const rateBase       = successful + failed;
      const successRate    = rateBase > 0 ? Math.round((successful / rateBase) * 100) : null;

      // ── 7-day chart buckets ────────────────────────────────────────────────
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d;
      });
      const dayLabels  = last7.map(d => d.toLocaleDateString("en-US", { weekday: "short" }));
      const dayCounts  = last7.map(d => {
        const iso = d.toISOString().slice(0, 10);
        return analyticsLogs.filter(l => l.created_at?.slice(0, 10) === iso).length;
      });
      const maxDay = Math.max(...dayCounts, 1);

      // ── Action breakdown ───────────────────────────────────────────────────
      const completedCamps = campaigns.filter(c => c.status === "completed");
      const postsCount    = completedCamps.filter(c => (c.metadata?.action_type || "").includes("Post")).length;
      const commentsCount = completedCamps.filter(c => (c.metadata?.action_type || "").includes("Comment")).length;
      const likesCount    = completedCamps.filter(c => (c.metadata?.action_type || "").includes("Like")).length;
      const maxBreakdown  = Math.max(postsCount, commentsCount, likesCount, failed, 1);

      // ── Top groups ─────────────────────────────────────────────────────────
      const groupHits: Record<string, number> = {};
      campaigns.forEach(c => (c.target_groups || []).forEach((gid: string) => {
        groupHits[gid] = (groupHits[gid] || 0) + 1;
      }));
      const topGroups = Object.entries(groupHits)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([gid, count]) => ({ name: groups.find(g => g.id === gid)?.name || "Group", count }));
      const maxGroupCount = Math.max(...topGroups.map(g => g.count), 1);

      const isLoading = analyticsLoading || campaignsLoading;

      return (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ margin: "0 0 0.25rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "var(--text-1)", letterSpacing: "-0.4px" }}>Analytics</h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)" }}>Performance overview for all campaigns</p>
            </div>
            {isLoading && <div style={{ width: "16px", height: "16px", border: "2px solid #edf1f4", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
          </div>

          {/* Top stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.875rem", marginBottom: "1.5rem" }}>
            {[
              { l: "Total Actions", v: String(totalActions),                          icon: Zap,         color: "#3b82f6" },
              { l: "Successful",    v: String(successful),                             icon: CheckCircle2, color: "#10b981" },
              { l: "Failed",        v: String(failed),                                 icon: XCircle,      color: "#ef4444" },
              { l: "Success Rate",  v: successRate != null ? `${successRate}%` : "—",  icon: TrendingUp,   color: "#8b5cf6" },
            ].map(({ l, v, icon: Icon, color }) => (
              <div key={l} style={{ ...card, padding: "1.125rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-2)", fontWeight: 500 }}>{l}</span>
                  <div style={{ width: "28px", height: "28px", borderRadius: "0.375rem", backgroundColor: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", color }}><Icon size={14} strokeWidth={2.5} /></div>
                </div>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.5rem", color: "var(--text-1)", letterSpacing: "-0.5px" }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "0.875rem" }}>
            {/* 7-day bar chart */}
            <div style={{ ...card, padding: "1.375rem" }}>
              <h3 style={{ ...h3, marginBottom: "0.375rem" }}>Activity — Last 7 Days</h3>
              <p style={{ margin: "0 0 1.5rem", fontSize: "0.75rem", color: "var(--text-3)" }}>Actions triggered per day</p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: "120px" }}>
                {dayLabels.map((d, i) => (
                  <div key={d + i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.375rem" }}>
                    <span style={{ fontSize: "0.625rem", color: dayCounts[i] > 0 ? "#3b82f6" : "#bababa", fontWeight: 600, minHeight: "14px" }}>
                      {dayCounts[i] > 0 ? dayCounts[i] : ""}
                    </span>
                    <div
                      title={`${dayCounts[i]} action${dayCounts[i] !== 1 ? "s" : ""}`}
                      style={{ width: "100%", height: `${Math.max(Math.round((dayCounts[i] / maxDay) * 90), 4)}px`, backgroundColor: dayCounts[i] > 0 ? "#3b82f6" : "var(--border)", borderRadius: "0.25rem 0.25rem 0 0", transition: "height 0.4s ease" }}
                    />
                    <span style={{ fontSize: "0.625rem", color: "var(--text-3)", fontWeight: 500 }}>{d}</span>
                  </div>
                ))}
              </div>
              {analyticsLogs.length === 0 && !analyticsLoading && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "var(--hover-bg)", borderRadius: "0.5rem", textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-3)" }}>No activity yet — launch a campaign to see data here.</p>
                </div>
              )}
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {/* Action Breakdown */}
              <div style={{ ...card, padding: "1.25rem" }}>
                <h3 style={{ ...h3, marginBottom: "1rem" }}>Action Breakdown</h3>
                {[
                  { l: "Posts sent", v: postsCount,    color: "#3b82f6" },
                  { l: "Comments",   v: commentsCount, color: "#8b5cf6" },
                  { l: "Likes",      v: likesCount,    color: "#10b981" },
                  { l: "Failed",     v: failed,        color: "#ef4444" },
                ].map(({ l, v, color }) => (
                  <div key={l} style={{ marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-1)", fontWeight: 500 }}>{l}</span>
                      <span style={{ fontSize: "0.8125rem", color: v > 0 ? "var(--text-1)" : "var(--text-3)", fontWeight: 600 }}>{v}</span>
                    </div>
                    <div style={{ height: "5px", backgroundColor: "var(--hover-bg)", borderRadius: "99px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.round((v / maxBreakdown) * 100)}%`, backgroundColor: color, borderRadius: "99px", transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Top Groups */}
              <div style={{ ...card, padding: "1.25rem" }}>
                <h3 style={{ ...h3, marginBottom: "1rem" }}>Top Groups</h3>
                {topGroups.length === 0
                  ? emptyState(<BarChart3 size={16} color="#c0c8cf" />, "No data yet", "Groups will rank here once campaigns run.")
                  : topGroups.map(({ name, count }) => (
                    <div key={name} style={{ marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{name}</span>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-2)", fontWeight: 600 }}>{count}</span>
                      </div>
                      <div style={{ height: "5px", backgroundColor: "var(--hover-bg)", borderRadius: "99px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round((count / maxGroupCount) * 100)}%`, backgroundColor: "#8b5cf6", borderRadius: "99px", transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </>
      );
    }

    // ── Facebook Accounts ────────────────────────────────────────────────────────────
    if (activeNav === "Facebook Accounts") {
      return (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ margin: "0 0 0.25rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "var(--text-1)", letterSpacing: "-0.4px" }}>Facebook Accounts</h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)" }}>
                {tokenSaved ? "Your Facebook account is connected and automations are enabled." : "Connect your Facebook account to enable automations."}
              </p>
            </div>
          </div>

          {/* Error banner */}
          {metaError && (
            <div style={{ backgroundColor: "#fff5f5", borderRadius: "0.875rem", border: "1px solid #fecaca", padding: "0.875rem 1.375rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <AlertCircle size={16} color="#ef4444" strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "#991b1b" }}>Connection failed: {metaError.replace(/_/g, " ")}. Please try again.</p>
              <button onClick={() => setMetaError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444", lineHeight: 1 }}><XCircle size={16} strokeWidth={2} /></button>
            </div>
          )}

          {tokenSaved ? (
            // ─── CONNECTED VIEW ─────────────────────────────────────────
            <>
              {/* Success flash */}
              {metaConnected && (
                <div style={{ backgroundColor: "#f0fdf4", borderRadius: "0.875rem", border: "1px solid #bbf7d0", padding: "0.875rem 1.375rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <CheckCircle2 size={16} color="#16a34a" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "#14532d" }}>Connected! Long-lived token is active for ~60 days.</p>
                  <button onClick={() => setMetaConnected(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#16a34a", lineHeight: 1 }}><XCircle size={16} strokeWidth={2} /></button>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "1.5rem" }}>
                {connectedAccounts.map((account, index) => {
                  const daysLeft = account.expires_at ? Math.max(0, Math.ceil((new Date(account.expires_at).getTime() - Date.now()) / 86400000)) : null;
                  const expiryColor = daysLeft == null ? "#10b981" : daysLeft < 7 ? "#ef4444" : daysLeft < 15 ? "#f59e0b" : "#10b981";
                  const pages = account.pages || [];
                  const isReady = !!account.name;

                  return (
                    <div key={account.access_token || index} style={{ ...card, padding: "1.5rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                          {account.picture ? (
                            <img src={account.picture} alt={account.name ?? "Facebook"} referrerPolicy="no-referrer" style={{ width: "48px", height: "48px", borderRadius: "0.75rem", objectFit: "cover", flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: "48px", height: "48px", borderRadius: "0.75rem", backgroundColor: "#1877F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: "0 0 0.25rem", fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isReady ? account.name : "Loading Account..."}</p>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                              <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: expiryColor }} />
                              <span style={{ fontSize: "0.75rem", color: expiryColor, fontWeight: 600 }}>{daysLeft != null ? `${daysLeft} days left` : "Active"}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            if (!user?.id) return;
                            await supabase.from("meta_tokens").delete().eq("id", account.db_id);
                            const updated = connectedAccounts.filter(a => a.db_id !== account.db_id);
                            setConnectedAccounts(updated);
                            if (updated.length === 0) setTokenSaved(false);
                            if (targetAccountToken === account.access_token && updated.length > 0) setTargetAccountToken(updated[0].access_token);
                          }}
                          style={{ padding: "0.375rem 0.625rem", borderRadius: "0.375rem", border: "1px solid #fecaca", backgroundColor: "#fff5f5", color: "#ef4444", fontSize: "0.75rem", fontWeight: 600, fontFamily: "Interdisplay, Arial, sans-serif", cursor: "pointer" }}
                        >
                          Revoke
                        </button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem", marginBottom: pages.length > 0 ? "0.875rem" : "0" }}>
                        <div style={{ padding: "0.625rem 0.75rem", borderRadius: "0.5rem", backgroundColor: "var(--hover-bg)", border: "1px solid var(--border)" }}>
                          <p style={{ margin: "0 0 0.25rem", fontSize: "0.625rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Token Type</p>
                          <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 700, color: "var(--text-1)" }}>Long-lived</p>
                        </div>
                        <div style={{ padding: "0.625rem 0.75rem", borderRadius: "0.5rem", backgroundColor: "var(--hover-bg)", border: "1px solid var(--border)" }}>
                          <p style={{ margin: "0 0 0.25rem", fontSize: "0.625rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pages Linked</p>
                          <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 700, color: "var(--text-1)" }}>{!isReady ? "…" : pages.length > 0 ? pages.length : "—"}</p>
                        </div>
                      </div>

                      {pages.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                          {pages.map((pg: any) => (
                            <div key={pg.id} style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5rem 0.625rem", borderRadius: "0.5rem", backgroundColor: "var(--hover-bg)", border: "1px solid var(--border)" }}>
                              {pg.picture?.data?.url
                                ? <img src={pg.picture.data.url} alt={pg.name} style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                : <div style={{ width: "26px", height: "26px", borderRadius: "50%", backgroundColor: "#e8edf2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Globe size={13} color="#c0c8cf" /></div>}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pg.name}</p>
                                <p style={{ margin: 0, fontSize: "0.6875rem", color: "var(--text-3)" }}>{pg.category ?? "Page"}</p>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.1875rem 0.5rem", borderRadius: "2rem", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", flexShrink: 0 }}>
                                <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#10b981" }} />
                                <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "#166534" }}>Active</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {connectedAccounts.length < 5 && (
                <button
                  onClick={handleConnectMeta}
                  disabled={tokenVerifying}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%", padding: "0.875rem 1rem", borderRadius: "0.75rem", border: "1px dashed var(--text-3)", backgroundColor: "transparent", color: "var(--text-1)", fontSize: "0.9375rem", fontWeight: 600, fontFamily: "Interdisplay, Arial, sans-serif", cursor: tokenVerifying ? "not-allowed" : "pointer", marginBottom: "1.5rem", transition: "all 0.2s ease" }}
                >
                  {tokenVerifying ? <div style={{ width: "16px", height: "16px", border: "2px solid var(--border)", borderTopColor: "var(--text-1)", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} /> : <Activity size={16} strokeWidth={2.5} />}
                  {tokenVerifying ? "Connecting…" : `Connect Another Account (${connectedAccounts.length}/5)`}
                </button>
              )}
            </>
          ) : (
            // ─── NOT CONNECTED VIEW ─────────────────────────────────────
            <>
              <div style={{ backgroundColor: "#fff9f0", borderRadius: "0.875rem", border: "1px solid #fde8c0", padding: "1rem 1.375rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertCircle size={16} color="#f59e0b" strokeWidth={2.5} />
                </div>
                <div>
                  <p style={{ margin: "0 0 0.125rem", fontSize: "0.8125rem", fontWeight: 600, color: "#92400e" }}>No Meta account connected</p>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#a16207", lineHeight: "1.5em" }}>All automations are paused until you connect your Facebook account.</p>
                </div>
              </div>

              <div style={{ maxWidth: "600px" }}>
                <div style={{ ...card, padding: "2rem" }}>
                  <h3 style={{ ...h3, marginBottom: "0.5rem" }}>Connect Your Account</h3>
                  <p style={{ margin: "0 0 1.5rem", fontSize: "0.875rem", color: "var(--text-2)", lineHeight: "1.5em" }}>Authorize Astraventa to manage your Facebook groups and pages on your behalf. You can connect up to 5 accounts.</p>
                  <button
                    onClick={handleConnectMeta}
                    disabled={tokenVerifying}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.625rem", padding: "0.875rem 1.5rem", borderRadius: "0.625rem", border: "none", backgroundColor: tokenVerifying ? "#4a90d9" : "#1877F2", color: "#ffffff", fontSize: "0.9375rem", fontWeight: 700, fontFamily: "Interdisplay, Arial, sans-serif", cursor: tokenVerifying ? "not-allowed" : "pointer", letterSpacing: "-0.1px", transition: "background-color 0.2s ease" }}
                  >
                    {tokenVerifying ? (
                      <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />Connecting…</>
                    ) : (
                      <><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Continue with Facebook</>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      );
    }

    // ── SETTINGS ──────────────────────────────────────────────────────────────
    if (activeNav === "Settings") {
      const toggle = (val: boolean, setter: (v: boolean) => void, label: string, desc: string) => (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <p style={{ margin: "0 0 0.125rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>{label}</p>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)" }}>{desc}</p>
          </div>
          <button
            onClick={() => setter(!val)}
            style={{ width: "40px", height: "22px", borderRadius: "99px", border: "none", backgroundColor: val ? "#3b82f6" : (resolvedDark ? "#2a2f3e" : "#dde3ec"), cursor: "pointer", position: "relative", transition: "background-color 0.2s ease", flexShrink: 0 }}
          >
            <div style={{ position: "absolute", top: "3px", left: val ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#ffffff", transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
          </button>
        </div>
      );
      return (
        <>
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ margin: "0 0 0.25rem", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "var(--text-1)", letterSpacing: "-0.4px" }}>Settings</h2>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-2)" }}>Manage your account preferences</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>

            {/* ── Profile card ── */}
            <div style={{ ...card, padding: "1.5rem" }}>
              <h3 style={{ ...h3, marginBottom: "1.25rem" }}>Profile</h3>

              {/* Avatar + name row */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.375rem" }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt={fullName} style={{ width: "52px", height: "52px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
                  : <div style={{ width: "52px", height: "52px", borderRadius: "50%", backgroundColor: "#1d1d1d", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.125rem", fontWeight: 700, flexShrink: 0 }}>{initial}</div>
                }
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: "0 0 0.125rem", fontSize: "0.875rem", fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</p>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</p>
                  {twoFaEnabled && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginTop: "0.25rem", padding: "0.125rem 0.5rem", borderRadius: "99px", backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                      <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#10b981" }} />
                      <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "#10b981" }}>2FA Active</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Display name */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Display Name</label>
                <input
                  value={settingName}
                  onChange={e => { setSettingName(e.target.value); setSettingNameMsg(null); }}
                  style={{ ...inputStyle }}
                  placeholder="Your name"
                />
              </div>
              {settingNameMsg && (
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", fontWeight: 500, color: settingNameMsg.ok ? "#10b981" : "#ef4444" }}>{settingNameMsg.text}</p>
              )}
              <button
                onClick={async () => {
                  if (!user?.id || !settingName.trim()) return;
                  setSettingNameSaving(true); setSettingNameMsg(null);
                  try {
                    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                    const res = await fetch(`${apiBase}/api/auth/update-profile`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ user_id: user.id, full_name: settingName.trim() }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.detail || "Failed");
                    await supabase.auth.refreshSession();
                    setSettingNameMsg({ ok: true, text: "Name updated successfully." });
                  } catch (err: any) {
                    setSettingNameMsg({ ok: false, text: err.message });
                  } finally { setSettingNameSaving(false); }
                }}
                disabled={settingNameSaving}
                style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: settingNameSaving ? 0.6 : 1, marginBottom: "1.25rem" }}
              >{settingNameSaving ? "Saving…" : "Save Name"}</button>

              {/* ── Email change ── */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.125rem" }}>
                <p style={{ margin: "0 0 0.625rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Email Address</p>

                {settingEmailStep === "done" ? (
                  <div style={{ padding: "0.875rem 1rem", borderRadius: "0.625rem", backgroundColor: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.3)", marginBottom: "0.75rem" }}>
                    <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "#10b981" }}>Email updated!</p>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--text-2)" }}>Sign out and sign back in to apply your new email.</p>
                  </div>
                ) : settingEmailStep === "otp" ? (
                  <>
                    <p style={{ margin: "0 0 0.625rem", fontSize: "0.75rem", color: "var(--text-2)" }}>Enter the 6-digit code sent to <strong>{settingEmailNew}</strong></p>
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      value={settingEmailOtp}
                      onChange={e => { setSettingEmailOtp(e.target.value.replace(/\D/g,"").slice(0,6)); setSettingEmailError(null); }}
                      style={{ ...inputStyle, letterSpacing: "0.35em", fontFamily: "'Courier New',monospace", fontSize: "1.125rem", textAlign: "center", marginBottom: "0.625rem" }}
                      placeholder="000000"
                    />
                    {settingEmailError && <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#ef4444" }}>{settingEmailError}</p>}
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={async () => {
                          if (settingEmailOtp.length !== 6 || !user?.id) return;
                          setSettingEmailLoading(true); setSettingEmailError(null);
                          try {
                            const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                            const res = await fetch(`${apiBase}/api/auth/verify-email-change`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ user_id: user.id, new_email: settingEmailNew, otp_code: settingEmailOtp }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.detail || "Verification failed");
                            setSettingEmailStep("done");
                          } catch (err: any) { setSettingEmailError(err.message); }
                          finally { setSettingEmailLoading(false); }
                        }}
                        disabled={settingEmailLoading || settingEmailOtp.length !== 6}
                        style={{ ...btnPrimary, flex: 1, justifyContent: "center", opacity: (settingEmailLoading || settingEmailOtp.length !== 6) ? 0.6 : 1 }}
                      >{settingEmailLoading ? "Verifying…" : "Verify & Update"}</button>
                      <button onClick={() => { setSettingEmailStep("idle"); setSettingEmailOtp(""); setSettingEmailError(null); }}
                        style={{ padding: "0.5rem 0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)", background: "none", color: "var(--text-2)", fontSize: "0.8125rem", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--text-2)" }}>Current: <strong style={{ color: "var(--text-1)" }}>{email}</strong></p>
                    <input
                      type="email"
                      value={settingEmailNew}
                      onChange={e => { setSettingEmailNew(e.target.value); setSettingEmailError(null); }}
                      style={{ ...inputStyle, marginBottom: "0.5rem" }}
                      placeholder="New email address"
                    />
                    {settingEmailError && <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#ef4444" }}>{settingEmailError}</p>}
                    <button
                      onClick={async () => {
                        if (!settingEmailNew.includes("@") || !user?.id) return;
                        setSettingEmailLoading(true); setSettingEmailError(null);
                        try {
                          const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                          const res = await fetch(`${apiBase}/api/auth/request-email-change`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ user_id: user.id, new_email: settingEmailNew }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.detail || "Failed to send code");
                          setSettingEmailStep("otp");
                        } catch (err: any) { setSettingEmailError(err.message); }
                        finally { setSettingEmailLoading(false); }
                      }}
                      disabled={settingEmailLoading || !settingEmailNew.includes("@")}
                      style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: (settingEmailLoading || !settingEmailNew.includes("@")) ? 0.6 : 1 }}
                    >{settingEmailLoading ? "Sending…" : "Send verification code"}</button>
                  </>
                )}
              </div>
            </div>

            {/* ── Security card ── */}
            <div style={{ ...card, padding: "1.5rem" }}>
              <h3 style={{ ...h3, marginBottom: "1.125rem" }}>Security</h3>

              {/* Password change */}
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Current Password</label>
                <input type="password" value={settingOldPass} onChange={e => { setSettingOldPass(e.target.value); setSettingPassMsg(null); }} style={{ ...inputStyle }} placeholder="Enter current password" />
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>New Password</label>
                <input type="password" value={settingNewPass} onChange={e => { setSettingNewPass(e.target.value); setSettingPassMsg(null); }} style={{ ...inputStyle }} placeholder="At least 8 characters" />
              </div>
              <div style={{ marginBottom: "0.625rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>Confirm New Password</label>
                <input
                  type="password" value={settingConfPass}
                  onChange={e => { setSettingConfPass(e.target.value); setSettingPassMsg(null); }}
                  style={{ ...inputStyle, borderColor: settingConfPass && settingConfPass !== settingNewPass ? "#ef4444" : undefined }}
                  placeholder="Repeat new password"
                />
                {settingConfPass && settingConfPass !== settingNewPass && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.6875rem", color: "#ef4444" }}>Passwords do not match</p>
                )}
              </div>
              {settingPassMsg && (
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 500, color: settingPassMsg.ok ? "#10b981" : "#ef4444" }}>{settingPassMsg.text}</p>
              )}
              <button
                onClick={async () => {
                  if (!user?.email || !settingOldPass || settingNewPass.length < 8 || settingNewPass !== settingConfPass) return;
                  setSettingPassLoading(true); setSettingPassMsg(null);
                  try {
                    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: settingOldPass });
                    if (signInErr) throw new Error("Current password is incorrect.");
                    const { error: updateErr } = await supabase.auth.updateUser({ password: settingNewPass });
                    if (updateErr) throw new Error(updateErr.message);
                    setSettingPassMsg({ ok: true, text: "Password updated successfully." });
                    setSettingOldPass(""); setSettingNewPass(""); setSettingConfPass("");
                  } catch (err: any) { setSettingPassMsg({ ok: false, text: err.message }); }
                  finally { setSettingPassLoading(false); }
                }}
                disabled={settingPassLoading || !settingOldPass || settingNewPass.length < 8 || settingNewPass !== settingConfPass}
                style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginBottom: "1.25rem", opacity: (settingPassLoading || !settingOldPass || settingNewPass.length < 8 || settingNewPass !== settingConfPass) ? 0.5 : 1 }}
              >{settingPassLoading ? "Updating…" : "Update Password"}</button>

              {/* ── 2FA ── */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.125rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Google Authenticator (2FA)</p>
                  {twoFaEnabled
                    ? <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.2rem 0.625rem", borderRadius: "99px", backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#10b981" }} />
                        <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#10b981" }}>Enabled</span>
                      </div>
                    : <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", fontWeight: 500 }}>Not set up</span>
                  }
                </div>
                <p style={{ margin: "0 0 0.875rem", fontSize: "0.75rem", color: "var(--text-2)", lineHeight: "1.5em" }}>
                  {twoFaEnabled
                    ? "Your account is protected with an authenticator app."
                    : "Scan a QR code with Google Authenticator to add a second layer of protection."
                  }
                </p>

                {twoFaStep === "idle" && (
                  twoFaEnabled ? (
                    <button
                      onClick={() => { setTwoFaStep("disable"); setTwoFaCode(""); setTwoFaError(null); }}
                      style={{ width: "100%", padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #fecaca", backgroundColor: "transparent", color: "#ef4444", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}
                    >Disable 2FA</button>
                  ) : (
                    <button
                      onClick={async () => {
                        if (!user?.id) return;
                        setTwoFaLoading(true); setTwoFaError(null);
                        try {
                          const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                          const res = await fetch(`${apiBase}/api/auth/setup-2fa`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ user_id: user.id }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.detail || "Setup failed");
                          setTwoFaSecret(data.secret);
                          setTwoFaQrData(data.qr_data);
                          setTwoFaStep("setup");
                        } catch (err: any) { setTwoFaError(err.message); }
                        finally { setTwoFaLoading(false); }
                      }}
                      disabled={twoFaLoading}
                      style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: twoFaLoading ? 0.6 : 1 }}
                    >{twoFaLoading ? "Generating…" : "Set up Google Authenticator"}</button>
                  )
                )}

                {twoFaStep === "setup" && (
                  <div>
                    <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "var(--text-2)" }}>
                      1. Open <strong>Google Authenticator</strong> → tap <strong>+</strong> → <strong>Scan QR code</strong>
                    </p>
                    {/* QR code */}
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.875rem" }}>
                      <div style={{ padding: "0.75rem", borderRadius: "0.75rem", border: "1px solid var(--border)", backgroundColor: "#fff", display: "inline-block" }}>
                        <img src={twoFaQrData} alt="Scan with Google Authenticator" style={{ width: "180px", height: "180px", display: "block" }} />
                      </div>
                    </div>
                    {/* Manual key */}
                    <div style={{ backgroundColor: "var(--hover-bg)", borderRadius: "0.5rem", border: "1px solid var(--border)", padding: "0.625rem 0.875rem", marginBottom: "0.875rem" }}>
                      <p style={{ margin: "0 0 0.25rem", fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Can't scan? Enter manually</p>
                      <p style={{ margin: 0, fontFamily: "'Courier New',monospace", fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.1em", wordBreak: "break-all" }}>{twoFaSecret}</p>
                    </div>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--text-2)" }}>2. Enter the 6-digit code from the app to confirm</p>
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      value={twoFaCode}
                      onChange={e => { setTwoFaCode(e.target.value.replace(/\D/g,"").slice(0,6)); setTwoFaError(null); }}
                      style={{ ...inputStyle, letterSpacing: "0.35em", fontFamily: "'Courier New',monospace", fontSize: "1.25rem", textAlign: "center", marginBottom: "0.5rem" }}
                      placeholder="000000"
                    />
                    {twoFaError && <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#ef4444" }}>{twoFaError}</p>}
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={async () => {
                          if (twoFaCode.length !== 6 || !user?.id) return;
                          setTwoFaLoading(true); setTwoFaError(null);
                          try {
                            const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                            const res = await fetch(`${apiBase}/api/auth/enable-2fa`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ user_id: user.id, secret: twoFaSecret, code: twoFaCode }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.detail || "Verification failed");
                            setTwoFaEnabled(true); setTwoFaStep("idle"); setTwoFaCode(""); setTwoFaSecret(""); setTwoFaQrData("");
                          } catch (err: any) { setTwoFaError(err.message); }
                          finally { setTwoFaLoading(false); }
                        }}
                        disabled={twoFaLoading || twoFaCode.length !== 6}
                        style={{ ...btnPrimary, flex: 1, justifyContent: "center", opacity: (twoFaLoading || twoFaCode.length !== 6) ? 0.6 : 1 }}
                      >{twoFaLoading ? "Enabling…" : "Enable 2FA"}</button>
                      <button
                        onClick={() => { setTwoFaStep("idle"); setTwoFaCode(""); setTwoFaSecret(""); setTwoFaQrData(""); setTwoFaError(null); }}
                        style={{ padding: "0.5rem 0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)", background: "none", color: "var(--text-2)", fontSize: "0.8125rem", cursor: "pointer" }}
                      >Cancel</button>
                    </div>
                  </div>
                )}

                {twoFaStep === "disable" && (
                  <div>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--text-2)" }}>Enter your current authenticator code to confirm</p>
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      value={twoFaCode}
                      onChange={e => { setTwoFaCode(e.target.value.replace(/\D/g,"").slice(0,6)); setTwoFaError(null); }}
                      style={{ ...inputStyle, letterSpacing: "0.35em", fontFamily: "'Courier New',monospace", fontSize: "1.25rem", textAlign: "center", marginBottom: "0.5rem" }}
                      placeholder="000000"
                    />
                    {twoFaError && <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#ef4444" }}>{twoFaError}</p>}
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={async () => {
                          if (twoFaCode.length !== 6 || !user?.id) return;
                          setTwoFaLoading(true); setTwoFaError(null);
                          try {
                            const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                            const res = await fetch(`${apiBase}/api/auth/disable-2fa`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ user_id: user.id, code: twoFaCode }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.detail || "Verification failed");
                            setTwoFaEnabled(false); setTwoFaStep("idle"); setTwoFaCode("");
                          } catch (err: any) { setTwoFaError(err.message); }
                          finally { setTwoFaLoading(false); }
                        }}
                        disabled={twoFaLoading || twoFaCode.length !== 6}
                        style={{ flex: 1, padding: "0.5rem", borderRadius: "0.5rem", border: "none", backgroundColor: "#ef4444", color: "#fff", fontSize: "0.8125rem", fontWeight: 600, cursor: twoFaCode.length !== 6 ? "not-allowed" : "pointer", opacity: (twoFaLoading || twoFaCode.length !== 6) ? 0.6 : 1 }}
                      >{twoFaLoading ? "Disabling…" : "Confirm Disable"}</button>
                      <button
                        onClick={() => { setTwoFaStep("idle"); setTwoFaCode(""); setTwoFaError(null); }}
                        style={{ padding: "0.5rem 0.875rem", borderRadius: "0.5rem", border: "1px solid var(--border)", background: "none", color: "var(--text-2)", fontSize: "0.8125rem", cursor: "pointer" }}
                      >Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Connected Accounts */}
          <div style={{ ...card, padding: "1.5rem", marginBottom: "1.25rem" }}>
            <h3 style={{ ...h3, marginBottom: "0.25rem" }}>Connected Accounts</h3>
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.75rem", color: "var(--text-2)" }}>
              Link sign-in methods so you can log in with either email or Google.
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", borderRadius: "0.625rem", border: "1px solid var(--border)", backgroundColor: "var(--hover-bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <div>
                  <p style={{ margin: "0 0 0.125rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Google</p>
                  <p style={{ margin: 0, fontSize: "0.6875rem", color: googleLinked ? "#10b981" : "var(--text-3)" }}>
                    {googleLinked ? "Linked — you can sign in with Google" : "Not linked"}
                  </p>
                </div>
              </div>
              {googleLinked ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.375rem 0.75rem", borderRadius: "99px", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <CheckCircle2 size={12} color="#10b981" strokeWidth={2.5} />
                  <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#10b981" }}>Connected</span>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    setLinkingGoogle(true);
                    const { error } = await supabase.auth.linkIdentity({
                      provider: "google",
                      options: { redirectTo: `${window.location.origin}/auth/callback` },
                    });
                    if (error) { alert(error.message); setLinkingGoogle(false); }
                    // On success Supabase redirects to Google → comes back to /auth/callback → /dashboard
                  }}
                  disabled={linkingGoogle}
                  style={{ padding: "0.4375rem 0.875rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", backgroundColor: "var(--surface)", color: "var(--text-1)", fontSize: "0.75rem", fontWeight: 600, cursor: linkingGoogle ? "not-allowed" : "pointer", opacity: linkingGoogle ? 0.6 : 1, display: "flex", alignItems: "center", gap: "0.375rem" }}
                >
                  {linkingGoogle ? "Redirecting…" : "Link Google"}
                </button>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div style={{ ...card, padding: "1.5rem", marginBottom: "1.25rem" }}>
            <h3 style={{ ...h3, marginBottom: "0.125rem" }}>Notifications</h3>
            <p style={{ margin: "0 0 0.875rem", fontSize: "0.75rem", color: "var(--text-2)" }}>Choose which events you want to be notified about. We'll also ask your browser for permission to show alerts in the background.</p>

            {/* Campaign completed */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <p style={{ margin: "0 0 0.125rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Campaign completed</p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)" }}>Get notified when a sniper campaign finishes running.</p>
              </div>
              <button
                onClick={() => handleNotifToggle("notif_campaign", notifCampaign, setNotifCampaign)}
                style={{ width: "40px", height: "22px", borderRadius: "99px", border: "none", backgroundColor: notifCampaign ? "#3b82f6" : (resolvedDark ? "#2a2f3e" : "#dde3ec"), cursor: "pointer", position: "relative", transition: "background-color 0.2s ease", flexShrink: 0 }}
              >
                <div style={{ position: "absolute", top: "3px", left: notifCampaign ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#ffffff", transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
              </button>
            </div>

            {/* Failed actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <p style={{ margin: "0 0 0.125rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Failed actions</p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)" }}>Alert when a post or comment action fails due to token/permission issues.</p>
              </div>
              <button
                onClick={() => handleNotifToggle("notif_failed", notifFailed, setNotifFailed)}
                style={{ width: "40px", height: "22px", borderRadius: "99px", border: "none", backgroundColor: notifFailed ? "#3b82f6" : (resolvedDark ? "#2a2f3e" : "#dde3ec"), cursor: "pointer", position: "relative", transition: "background-color 0.2s ease", flexShrink: 0 }}
              >
                <div style={{ position: "absolute", top: "3px", left: notifFailed ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#ffffff", transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
              </button>
            </div>

            {/* Weekly summary — coming soon */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 0", opacity: 0.55 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.125rem" }}>
                    <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Weekly summary</p>
                    <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "99px", padding: "0.1rem 0.4rem", letterSpacing: "0.03em" }}>COMING SOON</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)" }}>Receive a weekly digest of your automation performance.</p>
                </div>
              </div>
              <button
                disabled
                style={{ width: "40px", height: "22px", borderRadius: "99px", border: "none", backgroundColor: resolvedDark ? "#2a2f3e" : "#dde3ec", cursor: "not-allowed", position: "relative", flexShrink: 0 }}
              >
                <div style={{ position: "absolute", top: "3px", left: "3px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
              </button>
            </div>
          </div>

          {/* Appearance */}
          <div style={{ ...card, padding: "1.5rem", marginBottom: "1.25rem" }}>
            <h3 style={{ ...h3, marginBottom: "0.25rem" }}>Appearance</h3>
            <p style={{ margin: "0 0 1rem", fontSize: "0.75rem", color: "var(--text-2)" }}>Controls how the dashboard looks for you</p>
            <div style={{ display: "flex", gap: "0.625rem" }}>
              {(["light", "dark", "system"] as Theme[]).map((t) => {
                const icons = { light: Sun, dark: Moon, system: Monitor };
                const labels = { light: "Light", dark: "Dark", system: "System" };
                const Icon = icons[t];
                const isSelected = theme === t;
                return (
                  <button key={t} onClick={() => setTheme(t)}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", padding: "0.875rem 0.5rem", borderRadius: "0.625rem", border: `1.5px solid ${isSelected ? "var(--text-1)" : "var(--border)"}`, backgroundColor: isSelected ? "var(--text-1)" : "var(--surface)", color: isSelected ? "var(--surface)" : "var(--text-2)", cursor: "pointer", transition: "all 0.15s ease" }}>
                    <Icon size={18} strokeWidth={isSelected ? 2.5 : 2} />
                    <span style={{ fontSize: "0.8125rem", fontWeight: isSelected ? 600 : 500 }}>{labels[t]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Danger zone */}
          <div style={{ borderRadius: "0.75rem", border: `1px solid ${resolvedDark ? "rgba(239,68,68,0.3)" : "#fecaca"}`, backgroundColor: resolvedDark ? "rgba(239,68,68,0.06)" : "#fff5f5", padding: "1.5rem" }}>
            <h3 style={{ ...h3, color: "#dc2626", marginBottom: "0.375rem" }}>Danger Zone</h3>
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.75rem", color: "var(--text-2)" }}>These actions are irreversible. Please proceed with caution.</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", backgroundColor: "var(--surface)", borderRadius: "0.5rem", border: "1px solid #fecaca" }}>
              <div>
                <p style={{ margin: "0 0 0.125rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-1)" }}>Delete Account</p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-2)" }}>Permanently delete your account and all associated data.</p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                style={{ padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "none", backgroundColor: "#ef4444", color: "#ffffff", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", flexShrink: 0, marginLeft: "1rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Trash2 size={13} strokeWidth={2.5} />Delete Account
              </button>
            </div>
          </div>
        </>
      );
    }

    // ── TRUE FALLBACK ─────────────────────────────────────────────────────────
    return (
      <div style={{ ...card, padding: "3rem 2rem", textAlign: "center" }}>
        <div style={{ width: "48px", height: "48px", borderRadius: "0.75rem", backgroundColor: "var(--hover-bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
          <Key size={20} color="#c0c8cf" strokeWidth={2} />
        </div>
        <h3 style={{ ...h3, margin: "0 0 0.5rem", fontSize: "1rem" }}>{activeNav}</h3>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-3)" }}>This section is coming soon.</p>
      </div>
    );
  }
}
