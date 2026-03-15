const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMjg1NDYsImV4cCI6MjA3NzgwNDU0Nn0.RqsniEqzNec6ww35TXJtLJD3mafnGbMI82om4XRUdUU';

async function test() {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/broadcast_notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({
      p_message: 'Test message',
      p_type: 'emergency_broadcast',
      p_severity: 'High',
      p_metadata: {},
      p_link_to: null
    })
  });
  console.log('RPC Status:', res.status);
  console.log('RPC Error:', await res.text());

  const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({
      broadcast: true,
      title: 'Alert From fetch',
      message: 'Testing broadcast',
      url: null,
      type: 'info',
      severity: 'Low',
      metadata: { isBroadcast: true }
    })
  });
  console.log('Edge Function Status:', pushRes.status);
  console.log('Edge Function Error:', await pushRes.text());
}

test();
