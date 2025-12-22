-- ============================================
-- SITE MANAGEMENT - DATABASE SETUP
-- Run these queries in your Supabase SQL Editor
-- ============================================

-- 1. Add new columns to the organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS reporting_manager_name TEXT,
ADD COLUMN IF NOT EXISTS manager_name TEXT,
ADD COLUMN IF NOT EXISTS field_officer_names TEXT[], -- Array for multiple field officers
ADD COLUMN IF NOT EXISTS backend_field_officer_name TEXT;

-- 2. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_organizations_manager 
ON organizations(manager_name);

CREATE INDEX IF NOT EXISTS idx_organizations_reporting_manager 
ON organizations(reporting_manager_name);

CREATE INDEX IF NOT EXISTS idx_organizations_backend_officer 
ON organizations(backend_field_officer_name);

-- 3. Add comments to document the columns (optional but recommended)
COMMENT ON COLUMN organizations.reporting_manager_name 
IS 'Name of the reporting manager for this site';

COMMENT ON COLUMN organizations.manager_name 
IS 'Name of the site manager';

COMMENT ON COLUMN organizations.field_officer_names 
IS 'Array of field officer names assigned to this site';

COMMENT ON COLUMN organizations.backend_field_officer_name 
IS 'Name of the backend field officer';

-- 4. Sample data insert (optional - for testing)
-- Uncomment and modify as needed
/*
INSERT INTO organizations (
    id, 
    short_name, 
    full_name, 
    address, 
    manpower_approved_count,
    reporting_manager_name,
    manager_name,
    field_officer_names,
    backend_field_officer_name
) VALUES (
    'SITE-SAMPLE-001',
    'Sample Site',
    'Sample Site Full Name',
    '123 Main St, City, State',
    50,
    'John Doe',
    'Jane Smith',
    ARRAY['Officer 1', 'Officer 2', 'Officer 3'],
    'Backend Officer Name'
);
*/

-- 5. View all organizations with new columns
SELECT 
    id,
    short_name,
    full_name,
    address,
    manpower_approved_count,
    reporting_manager_name,
    manager_name,
    field_officer_names,
    backend_field_officer_name,
    created_at,
    updated_at
FROM organizations
ORDER BY short_name;

-- 6. Enable Row Level Security (RLS) if not already enabled
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- 7. Create policy for authenticated users to read organizations
CREATE POLICY IF NOT EXISTS "Allow authenticated users to read organizations"
ON organizations
FOR SELECT
TO authenticated
USING (true);

-- 8. Create policy for authenticated users with manage_sites permission to modify
CREATE POLICY IF NOT EXISTS "Allow authorized users to modify organizations"
ON organizations
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
