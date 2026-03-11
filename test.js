const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMjg1NDYsImV4cCI6MjA3NzgwNDU0Nn0.RqsniEqzNec6ww35TXJtLJD3mafnGbMI82om4XRUdUU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { error } = await supabase.rpc('broadcast_notification', {
    p_message: 'Test message',
    p_type: 'emergency_broadcast',
    p_severity: 'High',
    p_metadata: {},
    p_link_to: null
  });
  console.log('Error from RPC:', error);

  const { data, error: tableError } = await supabase.from('notifications').select('severity').limit(1);
  console.log('Sample severity:', data?.[0]);
  if (tableError) console.error(tableError);
  
}

test();
