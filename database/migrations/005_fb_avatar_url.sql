-- Migration: Add fb_avatar_url column to fb_sessions
-- Run this migration in the Supabase Dashboard SQL Editor to support scraping profile pictures.

ALTER TABLE public.fb_sessions ADD COLUMN IF NOT EXISTS fb_avatar_url TEXT;
