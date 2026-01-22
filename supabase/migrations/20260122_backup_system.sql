-- Migration: Backup & Restoration System
-- Date: 2026-01-22
-- Description: Creates the system_backups table to track restoration points and snapshots.

-- 1. Create system_backups table
CREATE TABLE IF NOT EXISTS public.system_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    snapshot_path TEXT NOT NULL, -- Path in the 'backups' storage bucket
    size_bytes BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES public.users(id),
    status TEXT DEFAULT 'completed' -- 'completed', 'failed', 'restoring'
);

-- 2. Add RLS for backups
ALTER TABLE public.system_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage backups" ON public.system_backups
    FOR ALL USING (public.check_is_admin());

-- 3. Storage Bucket Note:
-- The 'backups' bucket should be created in the Supabase dashboard.
-- Policies for the 'backups' bucket should allow 'authenticated' users (admins)
-- to read/write.
