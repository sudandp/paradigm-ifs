import { createClient } from '@supabase/supabase-js';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMjg1NDYsImV4cCI6MjA3NzgwNDU0Nn0.RqsniEqzNec6ww35TXJtLJD3mafnGbMI82om4XRUdUU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  console.log('--- Debugging Attendance Events ---');
  
  // 1. Get user "Sudhan M"
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, name')
    .ilike('name', '%Sudhan%')
    .single();

  if (userError || !userData) {
    console.error('User not found:', userError);
    return;
  }
  console.log(`Found User: ${userData.name} (${userData.id})`);

  // 2. Query events for last 2 days
  const now = new Date();
  const start = subDays(now, 2).toISOString();
  
  const { data: events, error: eventsError } = await supabase
    .from('attendance_events')
    .select('*')
    .eq('user_id', userData.id)
    .gte('timestamp', start)
    .order('timestamp', { ascending: false });

  if (eventsError) {
    console.error('Error fetching events:', eventsError);
    return;
  }

  console.log(`Recent events found: ${events.length}`);
  events.forEach(e => {
    console.log(`[${e.timestamp}] ${e.type} - Lat: ${e.latitude}, Lng: ${e.longitude}`);
  });

  // 3. Test current query logic range
  const today = format(now, 'yyyy-MM-dd');
  const queryStart = `${today}T00:00:00Z`;
  const queryEnd = `${today}T23:59:59Z`;
  console.log(`\nCurrent query range for ${today}:`);
  console.log(`Start: ${queryStart}`);
  console.log(`End:   ${queryEnd}`);
  
  const inRange = events.filter(e => e.timestamp >= queryStart && e.timestamp <= queryEnd);
  console.log(`Events in current logic's range: ${inRange.length}`);
}

debug();
