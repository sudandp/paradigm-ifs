import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = '07f61efd-24f2-457e-84b3-d8dafcb556c6';

async function fixAttendance() {
  console.log('Fetching Kavya M events for February...');
  const { data: events, error: fetchError } = await supabase
    .from('attendance_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', '2026-02-01')
    .lte('timestamp', '2026-02-28T23:59:59');

  if (fetchError) {
    console.error('Error fetching events:', fetchError.message);
    return;
  }

  console.log(`Analyzing ${events.length} events...`);

  let updatedCount = 0;
  let otClearedCount = 0;

  for (const event of events) {
    let needsUpdate = false;
    let updatePayload = {};

    // 1. Cap punch-out at 19:00 IST (13:30 UTC)
    if (event.type === 'punch-out' || event.type === 'check-out') {
      const eventDate = event.timestamp.split('T')[0];
      const capTimestamp = `${eventDate}T13:30:00.000Z`;
      
      if (new Date(event.timestamp) > new Date(capTimestamp)) {
        console.log(`[CAPPING] Day ${eventDate}: ${event.timestamp} -> 19:00 IST`);
        updatePayload.timestamp = capTimestamp;
        updatePayload.checkout_note = (event.checkout_note ? event.checkout_note + ' | ' : '') + 'Auto capped at 19:00 IST';
        needsUpdate = true;
      }
    }

    // 2. Clear is_ot
    if (event.is_ot === true) {
      console.log(`[CLEAR OT] Event ${event.id} on ${event.timestamp}`);
      updatePayload.is_ot = false;
      needsUpdate = true;
      otClearedCount++;
    }

    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from('attendance_events')
        .update(updatePayload)
        .eq('id', event.id);

      if (updateError) {
        console.error(`Error updating event ${event.id}:`, updateError.message);
      } else {
        updatedCount++;
      }
    }
  }

  // 3. Search for extra_work_logs (OT)
  console.log('Checking extra_work_logs for any OT entries...');
  const { data: workLogs, error: logError } = await supabase
    .from('extra_work_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('work_date', '2026-02-01')
    .lte('work_date', '2026-02-28');

  if (logError) {
    console.error('Error fetching work logs:', logError.message);
  } else if (workLogs && workLogs.length > 0) {
    console.log(`Found ${workLogs.length} work logs. Checking for OT...`);
    for (const log of workLogs) {
      if (log.claim_type === 'OT' || log.claim_type === 'Overtime') {
          console.log(`[REJECTING OT LOG] Date: ${log.work_date}, Hours: ${log.hours_worked}`);
          await supabase
            .from('extra_work_logs')
            .update({ status: 'Rejected', rejection_reason: 'OT not allowed for this employee' })
            .eq('id', log.id);
      }
    }
  }

  console.log(`Summary: Updated ${updatedCount} events, Cleared OT for ${otClearedCount} events.`);
}

fixAttendance();
