const fetch = require('node-fetch');

async function testTrigger() {
    console.log("Triggering process-notification-rules...");
    
    const url = 'https://fmyafuhxlorbafbacywa.supabase.co/functions/v1/process-notification-rules';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyODU0NiwiZXhwIjoyMDc3ODA0NTQ2fQ.1wQC3L3gzGpZ2SwwQXMhXliZo_f7ye99vKEO7Q2iC5M';

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        const bodyTxt = await res.text();
        console.log(`Status: ${res.status}`);
        console.log(`Response: ${bodyTxt}`);
    } catch (err) {
        console.error("Fetch Error:", err);
    }
}

testTrigger();
