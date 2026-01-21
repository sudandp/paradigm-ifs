import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMjg1NDYsImV4cCI6MjA3NzgwNDU0Nn0.RqsniEqzNec6ww35TXJtLJD3mafnGbMI82om4XRUdUU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const { count, error } = await supabase
    .from('attendance_events')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Total attendance_events in DB: ${count}`);
  }
}
debug();
