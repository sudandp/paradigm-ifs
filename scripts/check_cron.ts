
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function checkCron() {
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  console.log('Fetching cron jobs...')
  const { data: jobs, error: jobError } = await supabase
    .from('job')
    .select('*')
    .filter('jobname', 'eq', 'auto-checkout-trigger')
    .abortSignal(AbortSignal.timeout(5000))
    .single()

  if (jobError) {
    console.error('Error fetching cron job:', jobError)
  } else {
    console.log('Cron Job found:', JSON.stringify(jobs, null, 2))
  }

  console.log('Fetching recent run details...')
  const { data: runs, error: runError } = await supabase
    .from('job_run_details')
    .select('*')
    .filter('jobname', 'eq', 'auto-checkout-trigger')
    .order('start_time', { ascending: false })
    .limit(5)

  if (runError) {
    console.error('Error fetching run details:', runError)
  } else {
    console.log('Recent Runs:', JSON.stringify(runs, null, 2))
  }
}

checkCron()
