const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugNotifications() {
  console.log('--- Debugging Notifications ---');

  // 1. Find user "Sudhan M"
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, name')
    .ilike('name', '%Sudhan M%');

  if (userError) {
    console.error('Error fetching user:', userError);
    return;
  }

  if (!users || users.length === 0) {
    console.log('User "Sudhan M" not found.');
    return;
  }

  const user = users[0];
  console.log(`Found User: ${user.name} (ID: ${user.id}, Role: ${user.role})`);

  // 2. Check notifications table
  const { data: notifications, error: notifError } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (notifError) {
    console.error('Error fetching notifications:', notifError);
  } else {
    console.log(`Found ${notifications.length} notifications in 'notifications' table.`);
    const unread = notifications.filter(n => !n.is_read);
    console.log(`Unread count: ${unread.length}`);
    if (unread.length > 0) {
      console.log('Sample Unread Notification:', unread[0]);
    }
  }

  // 3. Check pending items (Approvals)
  // Attendance Unlock Requests
  const { data: unlockRequests, error: unlockError } = await supabase
    .from('attendance_unlock_requests')
    .select('*')
    .eq('status', 'pending');
  
  if (unlockError) console.error('Error fetching unlock requests:', unlockError);
  else console.log(`Total Pending Attendance Unlock Requests: ${unlockRequests.length}`);

  // Leave Requests
  const { data: leaveRequests, error: leaveError } = await supabase
    .from('leave_requests')
    .select('*')
    .in('status', ['pending_manager_approval', 'pending_hr_confirmation']);

  if (leaveError) console.error('Error fetching leave requests:', leaveError);
  else console.log(`Total Pending Leave Requests: ${leaveRequests.length}`);

  // Extra Work Logs (Claims)
  const { data: claims, error: claimError } = await supabase
    .from('extra_work_logs')
    .select('*')
    .eq('status', 'Pending');

  if (claimError) console.error('Error fetching claims:', claimError);
  else console.log(`Total Pending Extra Work Claims: ${claims.length}`);
}

debugNotifications();
