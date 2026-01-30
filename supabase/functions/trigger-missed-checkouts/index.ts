
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch Core Settings
    const { data: globalSettings, error: settingsError } = await supabaseClient
      .from('settings')
      .select('attendance_settings')
      .eq('id', 'singleton')
      .single();

    if (settingsError) throw new Error(`Failed to fetch settings: ${settingsError.message}`);
    
    const attendanceSettings = globalSettings?.attendance_settings || {};
    const config = attendanceSettings.missedCheckoutConfig;
    // Office staff settings contain the fixed hours by default
    const fixedHours = attendanceSettings.office?.fixedOfficeHours;

    // 2. Check if we should run based on time
    // Shift end logic: if current time >= configured checkout time
    
    const now = new Date();
    // Use IST offset for comparison as per user context
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const currentHour = istDate.getUTCHours();
    const currentMinute = istDate.getUTCMinutes();
    const currentTimeVal = currentHour * 60 + currentMinute;

    const configuredTime = fixedHours?.checkOutTime || '19:00';
    const [confHour, confMinute] = configuredTime.split(':').map(Number);
    const configuredTimeVal = confHour * 60 + confMinute;

    if (currentTimeVal < configuredTimeVal) {
      return new Response(
        JSON.stringify({ 
          message: `Current time (${currentHour}:${currentMinute} IST) is before configured checkout time (${configuredTime}). Skipping.`,
          currentTime: currentTimeVal,
          targetTime: configuredTimeVal
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Identify Roles to Process
    const enabledGroups = config?.enabledGroups || ['office'];
    const roleMapping = config?.roleMapping;
    const rolesToProcessSet = new Set<string>();

    if (enabledGroups.includes('office')) {
        const mapped = roleMapping?.office;
        if (mapped && mapped.length > 0) mapped.forEach((r: string) => rolesToProcessSet.add(r));
        else ['admin', 'hr', 'finance', 'developer'].forEach(r => rolesToProcessSet.add(r));
    }
    // We can add field/site logic here too if needed, but request focused on Office Staff check-out time.
    
    // Legacy support
    if (config?.enabledRoles && config.enabledRoles.length > 0) {
        config.enabledRoles.forEach((r: string) => rolesToProcessSet.add(r.toLowerCase()));
    }

    const rolesToProcess = Array.from(rolesToProcessSet);
    if (rolesToProcess.length === 0) {
         return new Response(
            JSON.stringify({ message: "No roles configured for auto-checkout." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
    }

    // 4. Fetch Users in these roles
    const { data: users, error: userError } = await supabaseClient
      .from('users')
      .select('id, name, role_id')
      .in('role_id', rolesToProcess);

    if (userError) throw userError;
    if (!users || users.length === 0) {
        return new Response(
            JSON.stringify({ message: "No users found in configured roles." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
    }

    // 5. Process Each User
    let processedCount = 0;
    const todayStart = new Date(istDate);
    todayStart.setUTCHours(0,0,0,0); // Start of day in IST? No this logic is tricky with date objects.
    
    // Let's use ISO strings for DB queries which are safer
    const todayISO = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // We need to query events for "Today"
    // Since we are running on server, let's look for events created > 24 hours ago? 
    // Or just look for "last event is check-in"
    
    // Better query: Get latest event for each user. If it's 'check-in' AND it was created "today" (local time logic), then checkout.
    
    for (const user of users) {
        // Get last event
        const { data: events, error: eventError } = await supabaseClient
            .from('attendance_events')
            .select('*')
            .eq('user_id', user.id)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (eventError || !events || events.length === 0) continue;
        
        const lastEvent = events[0];
        
        // Check if last event is check-in
        if (lastEvent.type === 'check-in') {
            // Check if the check-in happened "today"
            // We can compare the date part of the timestamp
            const eventDate = new Date(lastEvent.timestamp);
            // Simple check: is it within last 24 hours? 
            const timeDiff = now.getTime() - eventDate.getTime();
            const hoursDiff = timeDiff / (1000 * 60 * 60);

            // If checked in within last 18 hours (reasonable for a work day), and we are past checkout time
            if (hoursDiff < 18) {
                // Perform Checkout
                
                // Checkout time should be the configured time on the SAME DAY as the check-in
                // OR just "now" if we want to be accurate to when the script ran?
                // Request said "at configured time". So if configured is 19:00, and script runs at 19:05,
                // we should probably timestamp it at 19:00 to be clean, or 19:00:01.
                
                // Construct checkout timestamp: Date of check-in + Configured Time
                const checkoutDate = new Date(eventDate); // Start with checkin date (handles timezone implicitly for the day)
                // Actually, eventDate is in UTC.
                // If we want 19:00 IST, we need to be careful.
                // Let's just use the current script execution time BUT set hours/mins to configured time if we want exactness.
                // However, if the script runs late (e.g. 21:00), setting it to 19:00 is rewriting history (which might be desired).
                // Let's set it to the configured time.
                
                // Logic: Take Check-in Date (YYYY-MM-DD), append Configured Time (HH:mm:00), attach IST Offset/Timezone.
                // Since Supabase stores in UTC, we need to convert 19:00 IST to UTC.
                // 19:00 IST = 13:30 UTC.
                
                // Harder bit: Parsing the configured time vs the variable "check-in date".
                
                // Simplified approach: Just timestamp it "Now" because the cron will run close to the time.
                // OR: Timestamp it at configured time for better records.
                
                // Let's try to target the configured time.
                // 19:00 IST -> 13:30 UTC.
                // coHour, coMinute are from settings.
                
                // Create Date object for "Today 19:00 IST"
                // We derived `istDate` earlier which is `now + 5.5h`.
                // So if we set `istDate` hours to `confHour` and mins to `confMinute`, we get the target time in "shifted" frame.
                // Then subtract 5.5h to get back to UTC.
                
                const targetIST = new Date(istDate);
                targetIST.setUTCHours(confHour, confMinute, 0, 0);
                const targetUTC = new Date(targetIST.getTime() - istOffset);
                
                // Insert Check-out
                const { error: insertError } = await supabaseClient
                    .from('attendance_events')
                    .insert({
                        user_id: user.id,
                        timestamp: targetUTC.toISOString(),
                        type: 'check-out',
                        location_name: 'Auto Check-out',
                        reason: 'Auto-checkout: Shift End',
                        is_manual: true,
                        device_info: { device: 'System', os: 'Cron', browser: 'EdgeFunction' }
                    });

                if (!insertError) {
                    processedCount++;
                    
                    // Log to Audit
                    await supabaseClient.from('attendance_audit_logs').insert({
                        action: 'AUTO_MISSED_CHECKOUT',
                        performed_by: '00000000-0000-0000-0000-000000000000', // System ID placeholder
                        target_user_id: user.id,
                        details: { 
                            message: `Auto check-out triggered at ${configuredTime}`,
                            original_checkin: lastEvent.timestamp
                        }
                    });

                    // Notification
                    await supabaseClient.from('notifications').insert({
                        user_id: user.id,
                        message: `Notice: You were automatically checked out at ${configuredTime} as per office hours.`,
                        type: 'info',
                        is_read: false
                    });
                }
            }
        }
    }

    return new Response(
      JSON.stringify({ 
        message: "Auto-checkout process completed", 
        processed: processedCount,
        configTime: configuredTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
