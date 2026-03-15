import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from '../_shared/cors.ts';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { 
      userIds, 
      title, 
      message, 
      url, 
      broadcast, 
      type, 
      severity, 
      metadata, 
      link_to,
      enable_sms,
      sms_message
    } = body;

    console.log('Received send-push request:', { 
      userIdsCount: userIds?.length, 
      title, 
      broadcast,
      enable_sms
    });

    // 1. Send Push via OneSignal
    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: message },
      url: url || null,
      web_url: url || null,
      data: { url, ...metadata },
    };

    // SMS Support
    if (enable_sms && (sms_message || message)) {
      payload.sms_from = Deno.env.get('ONESIGNAL_SMS_FROM') || undefined;
      payload.sms_contents = { en: sms_message || message };
    }

    // iOS Live Activities Support (if metadata contains activity info)
    if (metadata?.activity_id) {
      payload.event = metadata.event || 'update';
      payload.content_available = true;
    }

    // Optimization for High/Critical priority
    if (severity === 'High') {
      payload.priority = 10;
      payload.android_visibility = 1;
    } else {
      payload.priority = 5;
    }

    if (broadcast) {
      payload.included_segments = ["Subscribed Users", "Total Subscriptions", "Active Users"];
    } else {
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return new Response(JSON.stringify({ error: 'No user IDs provided' }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400 
        });
      }
      payload.include_aliases = { external_id: userIds };
      // If SMS is enabled, we don't strictly set target_channel to push
      if (!enable_sms) {
        payload.target_channel = "push";
      }
    }

    // 2. Fetch Unread Count for Badge (if single user and targeted)
    if (!broadcast && userIds && userIds.length === 1) {
      try {
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userIds[0])
          .eq('is_read', false);

        if (count !== null) {
          // If the notification hasn't been persisted yet, it might be 1 less than it should be
          // But since most callers (like notificationService) insert BEFORE calling this, it should be correct.
          payload.ios_badgeType = 'SetTo';
          payload.ios_badgeCount = count;
          payload.android_badge_type = 'SetTo';
          payload.android_badge_count = count;
          console.log(`[OneSignal] Setting badge count to ${count} for user ${userIds[0]}`);
        }
      } catch (err) {
        console.warn('Failed to fetch unread count for badge:', err);
      }
    }

    console.log('Sending message via OneSignal...');
    const osResponse = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const osResult = await osResponse.json();
    console.log('OneSignal response:', osResult);

    // 2. Persist to Database for Targeted Notifications
    if (!broadcast && userIds && userIds.length > 0) {
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        const dbNotifications = userIds.map((uid: string) => ({
          user_id: uid,
          message: message,
          type: type || 'info',
          severity: severity || 'Low',
          metadata: metadata || {},
          link_to: link_to || url || null
        }));

        console.log(`Persisting ${dbNotifications.length} notifications to database...`);
        const { error: dbError } = await supabase
          .from('notifications')
          .insert(dbNotifications);

        if (dbError) {
          console.error('Database insertion error:', dbError);
        }
      }
    }

    return new Response(JSON.stringify(osResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: osResponse.status,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Edge Function Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
