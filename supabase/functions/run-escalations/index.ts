declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer, accept, referer, user-agent',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Violation {
  id: string;
  user_id: string;
  date: string;
  users: { name: string } | { name: string }[] | null;
}

interface Recipient {
  id: string;
}

interface NotificationInsert {
  user_id: string;
  message: string;
  type: string;
}

Deno.serve(async (req: Request) => {
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
      .select('id, user_id, date, users(name)')
      .eq('status', 'pending')
      .lt('created_at', fortyEightHoursAgo);

    if (fetchError) throw fetchError;

    let escalatedCount = 0;
    if (violationsToEscalate && violationsToEscalate.length > 0) {
      const violations = violationsToEscalate as Violation[];
      const { error: updateError } = await supabaseClient
        .from('field_attendance_violations')
        .update({
          status: 'escalated',
          escalation_level: 1,
          escalated_at: new Date().toISOString(),
        })
        .in('id', violations.map(v => v.id));

      if (updateError) throw updateError;
      escalatedCount = violations.length;

      // 2. Notify Admin about escalations
      const { data: recipientsData } = await supabaseClient
        .from('users')
        .select('id')
        .eq('role_id', 'admin');

      const recipients = recipientsData as Recipient[] | null;

      if (recipients && recipients.length > 0) {
        const notifications: NotificationInsert[] = violations.flatMap((v: Violation) => {
          // Robustly get user name from join (might be object or array)
          const userData = Array.isArray(v.users) ? v.users[0] : v.users;
          const userName = userData?.name || v.user_id;
          
          return recipients.map((r: Recipient) => ({
            user_id: r.id,
            message: `URGENT: Field attendance violation for user ${userName} on ${v.date} has been escalated to Admin.`,
            type: 'security',
          }));
        });

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

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
