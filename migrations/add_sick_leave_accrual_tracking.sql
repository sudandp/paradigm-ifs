-- Migration: Add Sick Leave Monthly Accrual Tracking
-- Description: Adds columns to track sick leave opening balance and date for monthly accrual calculation
-- Date: 2026-02-05

-- Add sick_leave_opening_balance column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS sick_leave_opening_balance INTEGER DEFAULT 0;

-- Add sick_leave_opening_date column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS sick_leave_opening_date DATE;

-- Set default values for existing users
-- Opening date: start of current year (2026-01-01)
-- Opening balance: current month number (e.g., 2 for February 2026)
UPDATE users 
SET 
  sick_leave_opening_date = '2026-01-01',
  sick_leave_opening_balance = EXTRACT(MONTH FROM CURRENT_DATE)
WHERE sick_leave_opening_date IS NULL;

-- Add comments to document the columns
COMMENT ON COLUMN users.sick_leave_opening_balance IS 'Opening balance of sick leaves for monthly accrual calculation';
COMMENT ON COLUMN users.sick_leave_opening_date IS 'Start date for sick leave accrual calculation (YYYY-MM-DD format)';
