// supabase/functions/biometric-push/index.ts
/// <reference lib="deno.ns" />
import { createClient } from 'supabase';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @ts-ignore: Deno is a global in Supabase Edge Functions
Deno.serve(async (req: Request) => {
  const { method, url } = req;
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const query = urlObj.searchParams;

  const sn = query.get('SN') || query.get('sn');
  const table = query.get('table');

  console.log(`[${method}] Path: ${path} | SN: ${sn} | Table: ${table}`);

  // eSSL Handshake / Get Config
  if (method === 'GET') {
    if (sn) {
      console.log(`Processing handshake for SN: ${sn}`);
      try {
        const supabaseAdmin = createClient(
          // @ts-ignore: Deno environment
          Deno.env.get('SUPABASE_URL') ?? '',
          // @ts-ignore: Deno environment
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        
        const { error } = await supabaseAdmin
          .from('biometric_devices')
          .update({ last_seen: new Date().toISOString(), status: 'online' })
          .eq('sn', sn);
        
        if (error) console.error('DB Update Error:', error);
      } catch (e) {
        console.error('Handshake status update failed:', e);
      }
      // eSSL expects plain text OK
      return new Response('OK', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
    }
    return new Response('BIOMETRIC_PUSH_SERVICE_ALIVE', { status: 200, headers: corsHeaders });
  }

  // eSSL Data Push
  if (method === 'POST') {
    if (!sn) return new Response('BadRequest: No SN', { status: 400, headers: corsHeaders });

    const payloadBuffer = await req.arrayBuffer();
    const payload = new TextDecoder().decode(payloadBuffer);

    console.log(`Received ${table} push from SN: ${sn}`);

    const supabaseAdmin = createClient(
      // @ts-ignore: Deno environment
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore: Deno environment
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    if (table === 'ATTLOG') {
      const logs = payload.split('\n').filter((l: string) => l.trim());
      let successCount = 0;
      const errors: Record<string, unknown>[] = [];

      for (const log of logs) {
        // eSSL ATTLOG Format: [BiometricID]\t[Timestamp]\t[Status]\t[VerifyType]\t[DeviceID]\t[WorkCode]
        const parts = log.split('\t');
        if (parts.length < 2) continue;

        const biometricId = parts[0];
        const timestamp = parts[1]; // YYYY-MM-DD HH:mm:ss
        const status = parts[2]; // 0=CheckIn, 1=CheckOut

        // 1. Find User by BiometricID
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, name, organization_id, reporting_manager_id, role_id')
          .eq('biometric_id', biometricId)
          .single();

        if (user) {
          // 2. Fetch Device info and Organization name
          const { data: device } = await supabaseAdmin
            .from('biometric_devices')
            .select('id, organization_id, location_name, organizations:organization_id(full_name)')
            .eq('sn', sn)
            .single();

          const locationName = device?.location_name || (device as { organizations?: { full_name?: string } })?.organizations?.full_name || 'Biometric Device';

          // 3. Insert Attendance Event
          // Custom Mapping: 1=CheckIn, 0=CheckOut (User Requested)
          const eventType = status === '1' ? 'check_in' : 'check_out';
          const { error: attError } = await supabaseAdmin
            .from('attendance_events')
            .insert({
              user_id: user.id,
              timestamp: timestamp,
              type: eventType,
              device_id: device?.id,
              location_name: locationName
            });

          if (!attError) {
            successCount++;
            
            // 4. Update device last seen
            if (device) {
              await supabaseAdmin
                .from('biometric_devices')
                .update({ last_seen: new Date().toISOString(), status: 'online' })
                .eq('id', device.id);
            }

            // 5. Notifications
            try {
              // Self Notification
              const greeting = new Date().getHours() < 12 ? 'Good Morning' : (new Date().getHours() < 17 ? 'Good Afternoon' : 'Good Evening');
              const actionText = eventType === 'check_in' ? 'checking in' : 'checking out';
              await supabaseAdmin.from('notifications').insert({
                user_id: user.id,
                message: `${greeting}, ${user.name || 'there'}! Thanks for ${actionText} via biometric device.`,
                type: 'greeting',
              });

              // Manager Notifications
              const { data: settingsData } = await supabaseAdmin.from('settings').select('attendance_settings').eq('id', 'singleton').single();
              if (settingsData?.attendance_settings) {
                const settings = settingsData.attendance_settings;
                const isOfficeUser = ['admin', 'hr', 'finance', 'developer'].includes((user as { role_id?: string }).role_id || '');
                const rules = isOfficeUser ? settings.office : settings.field;

                if (rules?.enableAttendanceNotifications) {
                  const recipients: string[] = [];
                  if (user.reporting_manager_id) recipients.push(user.reporting_manager_id);
                  
                  // Also notify other admins/managers if needed (simplified)
                  const actorName = user.name || 'An employee';
                  const message = `${actorName} ${eventType.replace('-', ' ')} via biometric device`;
                  
                  for (const rid of recipients) {
                    await supabaseAdmin.from('notifications').insert({
                      user_id: rid,
                      message,
                      type: 'greeting'
                    });
                  }
                }
              }
            } catch (notifyErr) {
              console.warn('Failed to send notifications for biometric event:', notifyErr);
            }
          } else {
             console.error('Attendance Insert Error:', attError);
             errors.push({ log, error: attError });
          }
        } else {
             errors.push({ log, error: 'User not found', id: biometricId });
        }
      }
      return new Response(`OK: ${successCount}. Errors: ${JSON.stringify(errors)}`, { status: 200, headers: corsHeaders });
    }

    if (table === 'USER') {
        const lines = payload.split('\n').filter((l: string) => l.trim());
        let createdCount = 0;

        interface DeviceWithOrg {
          organization_id: string;
          location_name: string;
          organizations?: { short_name: string };
        }
        const { data: device } = await supabaseAdmin
          .from('biometric_devices')
          .select('organization_id, location_name, organizations:organization_id(short_name)')
          .eq('sn', sn)
          .single();
        
        const deviceTyped = device as unknown as DeviceWithOrg;
        const rawSiteName = deviceTyped?.location_name || deviceTyped?.organizations?.short_name || 'site';
        const sanitizedSiteName = rawSiteName.toLowerCase().replace(/[^a-z0-9]/g, '');

        const errors: Record<string, unknown>[] = [];
        for (const line of lines) {
            const parts = line.split('\t');
            const biometricId = parts[0];
            const name = parts[1] || `User ${biometricId}`;
            
            const { data: existingUser } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('biometric_id', biometricId)
                .single();
            
            if (!existingUser) {
                console.log(`Auto-enrolling new user: ${name} (ID: ${biometricId})`);
                
                const email = `${sanitizedSiteName}_${biometricId}@paradigm.com`;
                const password = Math.random().toString(36).slice(-12); // Random temp password

                // 1. Create Auth User
                const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: { name }
                });

                if (authError) {
                    console.error(`Auth Creation Failed for ${email}:`, authError);
                    errors.push({ email, error: authError });
                    continue;
                }

                // 2. Create Public Profile
                if (authUser.user) {
                    const { error: profileError } = await supabaseAdmin
                        .from('users')
                        .insert({
                            id: authUser.user.id,
                            name: name,
                            email: email,
                            role_id: 'field_staff',
                            biometric_id: biometricId,
                            organization_id: device?.organization_id,
                            organization_name: rawSiteName
                        });
                    
                    if (!profileError) {
                        createdCount++;
                    } else {
                        console.error('Profile Creation Failed:', profileError);
                        errors.push({ profile: name, error: profileError });
                    }
                }
            } else {
                 errors.push({ msg: 'User exists', id: biometricId });
            }
        }
        return new Response(`OK: ${createdCount} created. Errors: ${JSON.stringify(errors)}`, { status: 200, headers: corsHeaders });
    }

    if (table === 'USERPIC') {
        // Handle User Photo Push
        // The payload contains binary or base64 photo data
        // eSSL typically sends biometric_id as a header or part of payload
        const biometricId = query.get('PIN');
        if (biometricId) {
            const { data: user } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('biometric_id', biometricId)
                .single();
            
            if (user) {
                // Upload to Storage
                const fileName = `${user.id}_face.jpg`;
                const { error: uploadError } = await supabaseAdmin
                    .storage
                    .from('avatars')
                    .upload(fileName, payloadBuffer, {
                        contentType: 'image/jpeg',
                        upsert: true
                    });
                
                if (!uploadError) {
                    const { data: { publicUrl } } = supabaseAdmin.storage.from('avatars').getPublicUrl(fileName);
                    await supabaseAdmin
                        .from('users')
                        .update({ photo_url: publicUrl })
                        .eq('id', user.id);
                }
            }
        }
        return new Response('OK', { status: 200, headers: corsHeaders });
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  return new Response('NotFound', { status: 404, headers: corsHeaders });
});
