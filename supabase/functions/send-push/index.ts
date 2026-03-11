import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

serve(async (req) => {
  try {
    const { userIds, title, message, url, broadcast } = await req.json();

    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: message },
      data: { url },
    };


    if (broadcast) {
      payload.included_segments = ["All"];
    } else {
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return new Response(JSON.stringify({ error: 'No user IDs provided' }), { status: 400 });
      }
      payload.include_external_user_ids = userIds;
    }

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });


    const result = await response.json();

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: response.status,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }


});
