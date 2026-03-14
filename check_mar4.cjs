
const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';

async function debugHolidays() {
    const res = await fetch(`${supabaseUrl}/rest/v1/holidays?select=name,date&date=ilike.*2026-03-04*`, {
        headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`
        }
    });
    const data = await res.json();
    console.log('Holidays on March 4:', data);
}
debugHolidays();
