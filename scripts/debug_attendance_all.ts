import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMjg1NDYsImV4cCI6MjA3NzgwNDU0Nn0.RqsniEqzNec6ww35TXJtLJD3mafnGbMI82om4XRUdUU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const { data: userData } = await supabase.from('users').select('id, name').ilike('name', '%Sudhan%').single();
  if (!userData) return;

  const { data: events } = await supabase
    .from('attendance_events')
    .select('*')
    .eq('user_id', userData.id)
    .order('timestamp', { ascending: false });

  console.log(`Total events for ${userData.name}: ${events?.length || 0}`);
  events?.slice(0, 10).forEach(e => {
    console.log(`[${e.timestamp}] ${e.type}`);
  });
}
debug();
