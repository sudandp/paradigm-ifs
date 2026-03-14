const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLeaveDetails() {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, user_id, status, current_approver_id, created_at')
    .in('status', ['pending_manager_approval', 'pending_hr_confirmation']);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Pending Leave Requests:', JSON.stringify(data, null, 2));
}

checkLeaveDetails();
