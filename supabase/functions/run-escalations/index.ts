declare const Deno: any;
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer, accept, referer, user-agent',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: any) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    })
  }

  try {
    const supabaseClient = createClient(
      // @ts-ignore: Deno is available in Edge Function environment
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore: Deno is available in Edge Function environment
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      // Create client with Auth context of the user that called the function.
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 1. Escalate Field Attendance Violations
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    const { data: violationsToEscalate, error: fetchError } = await supabaseClient
      .from('field_attendance_violations')
      .select('id, user_id, date')
      .eq('status', 'pending')
      .lt('created_at', fortyEightHoursAgo);

    if (fetchError) throw fetchError;

    let escalatedCount = 0;
    if (violationsToEscalate && violationsToEscalate.length > 0) {
      const { error: updateError } = await supabaseClient
        .from('field_attendance_violations')
        .update({
          status: 'escalated',
          escalation_level: 1,
          escalated_at: new Date().toISOString(),
        })
        .in('id', (violationsToEscalate as any[]).map((v: any) => v.id));

      if (updateError) throw updateError;
      escalatedCount = (violationsToEscalate as any[]).length;

      // 2. Notify HR/Admin about escalations
      const { data: recipients } = await supabaseClient
        .from('users')
        .select('id')
        .in('role_id', ['admin', 'hr']);

      if (recipients && (recipients as any[]).length > 0) {
        const notifications = (violationsToEscalate as any[]).flatMap((v: any) => 
          (recipients as any[]).map((r: any) => ({
            user_id: r.id,
            message: `URGENT: Field attendance violation for user ${v.user_id} on ${v.date} has been escalated to HR/Admin.`,
            type: 'security',
          }))
        );

        await supabaseClient.from('notifications').insert(notifications);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        message: "Escalations completed", 
        fieldViolationsEscalated: escalatedCount 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
