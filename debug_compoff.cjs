
const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';

async function supabaseCall(path, method = 'GET', body = null) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: body ? JSON.stringify(body) : null
    });
    return res.json();
}

async function debugCompOff() {
    console.log('Searching for user Sudhan...');
    const users = await supabaseCall('users?select=id,name&name=ilike.*Sudhan*');
    const userId = users[0].id;
    
    const yearStart = '2026-01-01';
    const yearEnd = '2026-12-31';

    const events = await supabaseCall(`attendance_events?select=timestamp&user_id=eq.${userId}&timestamp=gte.${yearStart}&timestamp=lte.${yearEnd}`);
    const dbHolidays = await supabaseCall('holidays?select=date');
    const settings = await supabaseCall('settings?select=attendance_settings&id=eq.singleton');

    const attendedDates = new Set(events.map(e => e.timestamp.split('T')[0]));
    const holidayDates = new Set((dbHolidays || []).map(h => h.date.split('T')[0]));

    const attendanceSettings = settings[0].attendance_settings;
    const rules = attendanceSettings.office || attendanceSettings.field || attendanceSettings.site;
    
    if (rules.holiday_pool) {
        rules.holiday_pool.forEach(hp => {
            if (hp.date.startsWith('-')) holidayDates.add(`2026${hp.date}`);
        });
    }

    console.log('Worked Sundays or Holidays:');
    let count = 0;
    Array.from(attendedDates).sort().forEach(dateStr => {
        const date = new Date(dateStr.replace(/-/g, '/'));
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
        const isSunday = dayName === 'Sunday';
        const isHoliday = holidayDates.has(dateStr);
        if (isSunday || isHoliday) {
            count++;
            console.log(`- ${dateStr} (${dayName}) ${isHoliday ? '[Holiday]' : ''}`);
        }
    });
    console.log(`Total Earned: ${count}`);
}

debugCompOff();
