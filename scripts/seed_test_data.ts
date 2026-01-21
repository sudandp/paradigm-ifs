import { createClient } from '@supabase/supabase-js';
import { startOfDay, endOfDay, addHours, addMinutes } from 'date-fns';

const supabaseUrl = 'https://fmyafuhxlorbafbacywa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteWFmdWh4bG9yYmFmYmFjeXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyMjg1NDYsImV4cCI6MjA3NzgwNDU0Nn0.RqsniEqzNec6ww35TXJtLJD3mafnGbMI82om4XRUdUU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function seedData() {
  console.log('--- Seeding Test Attendance Data ---');
  
  const { data: userData } = await supabase
    .from('users')
    .select('id, name')
    .ilike('name', '%Sudhan%')
    .single();

  if (!userData) {
    console.error('User not found');
    return;
  }
  console.log(`Target User: ${userData.name} (${userData.id})`);

  const todayStart = startOfDay(new Date());
  
  const events = [
    {
      user_id: userData.id,
      timestamp: addHours(todayStart, 9).toISOString(), // 9 AM
      type: 'check-in',
      latitude: 12.9716,
      longitude: 77.5946,
      location_name: 'Paradigm HQ'
    },
    {
      user_id: userData.id,
      timestamp: addHours(todayStart, 12).toISOString(), // 12 PM
      type: 'check-out',
      latitude: 12.9716,
      longitude: 77.5946,
      location_name: 'Paradigm HQ'
    },
    {
      user_id: userData.id,
      timestamp: addMinutes(addHours(todayStart, 12), 30).toISOString(), // 12:30 PM
      type: 'check-in',
      latitude: 12.9800,
      longitude: 77.6000,
      location_name: 'Client Site A'
    }
  ];

  const { data, error } = await supabase
    .from('attendance_events')
    .insert(events)
    .select();

  if (error) {
    console.error('Seed failed:', error);
  } else {
    console.log('Seed successful:', data);
  }
}

seedData();
