import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMjg1NDYsImV4cCI6MjA3NzgwNDU0Nn0.RqsniEqzNec6ww35TXJtLJD3mafnGbMI82om4XRUdUU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
    console.log('--- Checking User and Settings ---');
    
    // 1. Check Sudhan M
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, role_id')
        .ilike('name', '%Sudhan M%')
        .single();
    
    if (userError) {
        console.error('Error fetching user:', userError.message);
    } else {
        console.log('User Found:', user);
    }

    // 2. Check Roles table for exact IDs
    const { data: roles, error: rolesError } = await supabase
        .from('roles')
        .select('id, display_name');
    
    if (rolesError) {
        console.error('Error fetching roles:', rolesError.message);
    } else {
        console.log('Available Roles:', roles.map(r => r.id));
    }

    // 3. Check Settings
    const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .select('attendance_settings')
        .eq('id', 'singleton')
        .single();
    
    if (settingsError) {
        console.error('Error fetching settings:', settingsError.message);
    } else {
        console.log('Attendance Settings (missedCheckoutConfig):', JSON.stringify(settings.attendance_settings.missedCheckoutConfig, null, 2));
        console.log('Office Hours:', settings.attendance_settings.office.fixedOfficeHours);
    }
}

checkUser();
