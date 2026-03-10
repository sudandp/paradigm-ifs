import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = '07f61efd-24f2-457e-84b3-d8dafcb556c6';

async function performPunchOut() {
  const actions = [
    { date: '2026-02-28', timestamp: '2026-02-28T13:30:00.000Z' }, // 19:00 IST
    { date: '2026-03-10', timestamp: '2026-03-10T13:30:00.000Z' }  // 19:00 IST
  ];

  for (const action of actions) {
    console.log(`Inserting punch-out for ${action.date} at 19:00 IST...`);
    const { data, error } = await supabase
      .from('attendance_events')
      .insert({
        user_id: userId,
        timestamp: action.timestamp,
        type: 'punch-out',
        is_manual: true,
        checkout_note: 'Auto punched out at 19:00 as per request',
        location_name: 'Auto Process'
      });

    if (error) {
      console.error(`Error inserting for ${action.date}:`, error.message);
    } else {
      console.log(`Successfully auto punched out for ${action.date}.`);
    }
  }
}

performPunchOut();
