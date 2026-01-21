import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMjg1NDYsImV4cCI6MjA3NzgwNDU0Nn0.RqsniEqzNec6ww35TXJtLJD3mafnGbMI82om4XRUdUU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  console.log('--- Testing Attendance Event Insertion ---');
  
  // Get Sudhan M
  const { data: userData } = await supabase
    .from('users')
    .select('id, name')
    .ilike('name', '%Sudhan%')
    .single();

  if (!userData) {
    console.error('User not found');
    return;
  }
  console.log(`Target User: ${userData.name} (${userData.id})`);

  // Try to insert an event
  const testEvent = {
    user_id: userData.id,
    timestamp: new Date().toISOString(),
    type: 'check-in',
    latitude: 12.9716,
    longitude: 77.5946,
    location_name: 'Test Location'
  };

  const { data, error } = await supabase
    .from('attendance_events')
    .insert([testEvent])
    .select();

  if (error) {
    console.error('Insert failed:', error);
  } else {
    console.log('Insert successful:', data);
  }
}

testInsert();
