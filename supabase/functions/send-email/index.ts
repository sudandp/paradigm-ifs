import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, html, attachments } = await req.json();
    
    if (!RESEND_API_KEY) {
       console.error("Missing RESEND_API_KEY");
       // For dev/test without key, we can simulate success to avoid breaking frontend
       // return new Response(JSON.stringify({ id: 'mock-id', message: 'Simulated success (missing key)' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
       
       return new Response(JSON.stringify({ error: 'Server configuration error: Missing RESEND_API_KEY' }), {
         status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Paradigm FMS <onboarding@resend.dev>', // Use resend.dev for testing, or configured domain
        to,
        subject,
        html,
        attachments // Pass existing attachments if any
      }),
    });

    const data = await res.json();

    if (!res.ok) {
       return new Response(JSON.stringify({ error: data }), {
         status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
