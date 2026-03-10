import { createClient } from '@supabase/supabase-js';
import { processDailyEvents } from './utils/attendanceCalculations.js'; // Assuming it's in a place I can import

// Mock data or direct fetch
const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = '07f61efd-24f2-457e-84b3-d8dafcb556c6';

async function verify() {
  const { data: events } = await supabase
    .from('attendance_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', '2026-02-01')
    .lte('timestamp', '2026-02-28T23:59:59');

  const days = {};
  events.forEach(e => {
    const d = e.timestamp.split('T')[0];
    if (!days[d]) days[d] = [];
    days[d].push(e);
  });

  console.log('| Date | Net Hrs | Status (Expected) |');
  console.log('|------|---------|-------------------|');

  Object.keys(days).sort().forEach(date => {
    const dayEvents = days[date];
    // Simplified logic similar to MonthlyHoursReport.tsx
    const sorted = dayEvents.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const ins = sorted.filter(e => e.type.includes('in'));
    const outs = sorted.filter(e => e.type.includes('out'));
    
    if (ins.length && outs.length) {
       const start = new Date(ins[0].timestamp);
       const end = new Date(outs[outs.length-1].timestamp);
       const duration = (end - start) / (1000 * 60 * 60);
       
       // Note: we don't handle breaks perfectly in this script, but it gives a good estimate
       let status = 'P';
       if (duration < 8 && duration >= 4) status = '1/2P';
       else if (duration < 4) status = 'Inc';
       
       console.log(`| ${date} | ${duration.toFixed(2)} | ${status} |`);
    }
  });
}

verify();
