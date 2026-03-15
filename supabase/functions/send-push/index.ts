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
    const { userIds, title, message, url, broadcast, type, severity, metadata, link_to } = body;
    console.log('Received send-push request:', { userIdsCount: userIds?.length, title, broadcast });

    // 1. Send Push via OneSignal
    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: message },
      data: { url, ...metadata },
    };

    if (broadcast) {
      payload.included_segments = ["Subscribed Users"];
    } else {
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return new Response(JSON.stringify({ error: 'No user IDs provided' }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400 
        });
      }
      // Use include_aliases with external_id (current OneSignal REST API standard)
      payload.include_aliases = { external_id: userIds };
      payload.target_channel = "push";
    }

    console.log('Sending push via OneSignal...');
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
