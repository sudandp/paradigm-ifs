import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = '07f61efd-24f2-457e-84b3-d8dafcb556c6';

async function analyze() {
  console.log('Fetching events for February...');
  const { data: events, error } = await supabase
    .from('attendance_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', '2026-02-01')
    .lte('timestamp', '2026-02-28T23:59:59')
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    return;
  }

  console.log(`Found ${events.length} events.`);

  const dailyEvents = {};
  events.forEach(event => {
    const date = event.timestamp.split('T')[0];
    if (!dailyEvents[date]) dailyEvents[date] = [];
    dailyEvents[date].push(event);
  });

  const analysis = [];

  Object.keys(dailyEvents).sort().forEach(date => {
    const dayEvents = dailyEvents[date];
    const hasPunchIn = dayEvents.some(e => e.type === 'punch-in');
    const hasPunchOut = dayEvents.some(e => e.type === 'punch-out');
    
    // Simple hours calculation (gross)
    let hours = 0;
    if (hasPunchIn && hasPunchOut) {
      const punchIn = new Date(dayEvents.find(e => e.type === 'punch-in').timestamp);
      const punchOut = new Date(dayEvents.find(e => e.type === 'punch-out').timestamp);
      hours = (punchOut - punchIn) / (1000 * 60 * 60);
    }

    analysis.push({
      date,
      hasPunchIn,
      hasPunchOut,
      hours,
      events: dayEvents.map(e => ({ type: e.type, time: e.timestamp }))
    });
  });

  fs.writeFileSync('kavya_feb_analysis.json', JSON.stringify(analysis, null, 2));
  console.log('Analysis saved to kavya_feb_analysis.json');

  // Print summary
  console.log('\n--- Summary ---');
  analysis.forEach(a => {
    if (!a.hasPunchOut) {
      const punchInEvent = a.events.find(e => e.type === 'punch-in');
      console.log(`${a.date}: Missing punch-out. Punch-in @ ${punchInEvent ? new Date(punchInEvent.time).toLocaleTimeString() : 'N/A'}`);
    } else if (a.hours < 8) {
      console.log(`${a.date}: Worked ${a.hours.toFixed(2)} hours (Half Day)`);
    } else {
      console.log(`${a.date}: Worked ${a.hours.toFixed(2)} hours (Full Day)`);
    }
  });
}

analyze();
