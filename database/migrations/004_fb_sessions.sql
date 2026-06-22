-- Migration 004: Facebook session storage + group validation columns
-- Run this in the Supabase SQL Editor (DDL cannot run via the REST API).
-- Branch: group  |  Feature: Playwright-based group posting

-- ============================================
-- fb_sessions TABLE
-- Stores one logged-in Facebook browser session per connected account.
-- storage_state is ENCRYPTED (Fernet) before it ever reaches the DB.
-- ============================================
CREATE TABLE IF NOT EXISTS public.fb_sessions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    fb_account_name   TEXT,                       -- detected display name
    fb_account_id     TEXT,                       -- detected c_user id
    storage_state     TEXT,                       -- ENCRYPTED Playwright storage_state JSON
    status            TEXT NOT NULL DEFAULT 'pending', -- pending | active | expired | checkpoint | invalid
    proxy             TEXT,                       -- optional per-account proxy (host:port or scheme://user:pass@host:port)
    user_agent        TEXT,                       -- pinned UA for fingerprint consistency
    last_validated_at TIMESTAMPTZ,
    last_error        TEXT,
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_sessions_user_id ON public.fb_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_fb_sessions_status  ON public.fb_sessions(status);

ALTER TABLE public.fb_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fb sessions"   ON public.fb_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fb sessions" ON public.fb_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fb sessions" ON public.fb_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fb sessions" ON public.fb_sessions FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_fb_sessions_updated_at
    BEFORE UPDATE ON public.fb_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_sessions TO authenticated;

-- ============================================
-- Extend target_groups with validation metadata
-- ============================================
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS fb_group_id       TEXT;
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS session_id        UUID REFERENCES public.fb_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS privacy           TEXT DEFAULT 'unknown';   -- public | private | unknown
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS is_member         BOOLEAN DEFAULT FALSE;
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS can_post          BOOLEAN DEFAULT FALSE;
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS member_count      INTEGER;
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending';   -- pending | checking | valid | invalid
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS validation_error  TEXT;
ALTER TABLE public.target_groups ADD COLUMN IF NOT EXISTS last_checked_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_target_groups_session_id        ON public.target_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_target_groups_validation_status ON public.target_groups(validation_status);

-- Required for upsert(on_conflict="user_id,fb_group_id") in the /api/fb routes.
-- Partial unique index ignores legacy rows where fb_group_id is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_target_groups_user_fb_group
    ON public.target_groups (user_id, fb_group_id)
    WHERE fb_group_id IS NOT NULL;
