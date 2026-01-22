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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins manage backups' AND tablename = 'system_backups' AND schemaname = 'public'
    ) THEN
        CREATE POLICY "Admins manage backups" ON public.system_backups
            FOR ALL USING (public.check_is_admin());
    END IF;
END $$;

-- 3. Add missing columns to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS address_settings JSONB;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS gemini_api_settings JSONB;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS perfios_api_settings JSONB;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS otp_settings JSONB;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS site_management_settings JSONB;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS notification_settings JSONB;

-- 4. Storage Bucket Configuration
-- Create the backups bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
SELECT 'backups', 'backups', false
WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'backups'
);

-- Policies for the 'backups' bucket in storage.objects
-- Only administrators (checked via public.check_is_admin()) can manage snapshots.

DO $$
BEGIN
    -- 1. SELECT policy: Allow admins to view backups
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view backups' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Admins can view backups" ON storage.objects
            FOR SELECT TO authenticated
            USING (bucket_id = 'backups' AND public.check_is_admin());
    END IF;

    -- 2. INSERT policy: Allow admins to upload backups (Restoration Points)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins can upload backups' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Admins can upload backups" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (bucket_id = 'backups' AND public.check_is_admin());
    END IF;

    -- 3. UPDATE policy: Allow admins to update backup metadata
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update backups' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Admins can update backups" ON storage.objects
            FOR UPDATE TO authenticated
            USING (bucket_id = 'backups' AND public.check_is_admin())
            WITH CHECK (bucket_id = 'backups' AND public.check_is_admin());
    END IF;

    -- 4. DELETE policy: Allow admins to delete old backups
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins can delete backups' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Admins can delete backups" ON storage.objects
            FOR DELETE TO authenticated
            USING (bucket_id = 'backups' AND public.check_is_admin());
    END IF;
END $$;
