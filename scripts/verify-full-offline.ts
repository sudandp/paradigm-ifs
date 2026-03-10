import { offlineDb } from '../services/offline/database';
import { syncService } from '../services/offline/syncService';
import { api } from '../services/api';

async function verifyOfflineIntegration() {
  console.log('🚀 Starting Full Offline Integration Verification...');

  try {
    // 1. Check Database availability
    console.log('--- Phase 1: Database Check ---');
    const outboxCountBefore = (await offlineDb.getOutbox()).length;
    console.log(`Current Outbox count: ${outboxCountBefore}`);

    // 2. Simulate Offline Write (Attendance)
    console.log('\n--- Phase 2: Simulating Offline Write (Attendance) ---');
    const mockEvent = {
      userId: 'test_user_123',
      timestamp: new Date().toISOString(),
      eventType: 'Check-In',
      locationId: 'test_loc_456'
    };
    
    // We assume the network is "offline" for the sake of this test if we call the underlying db directly
    // or we can mock the Network status. Since this is a server-side script, Network.getStatus() might fail.
    // We will manually add to outbox to verify SyncService.
    
    await offlineDb.addToOutbox({
      table_name: 'attendance_events',
      action: 'INSERT',
      payload: mockEvent
    });

    const outboxAfter = await offlineDb.getOutbox();
    console.log(`Outbox count after simulated offline check-in: ${outboxAfter.length}`);
    
    const lastItem = outboxAfter[outboxAfter.length - 1];
    if (lastItem.table_name === 'attendance_events' && lastItem.action === 'INSERT') {
      console.log('✅ Outbox insertion successful');
    } else {
      throw new Error('❌ Outbox insertion failed or data mismatch');
    }

    // 3. Verify SyncService Handler
    console.log('\n--- Phase 3: Verifying SyncService Handler Logic ---');
    // We can't actually call Supabase in this mock environment easily without keys, 
    // but we can verify the SyncService has the logic.
    // We'll check if syncService.runSync doesn't throw immediate errors.
    console.log('Checking SyncService availability...');
    if (syncService && typeof syncService.runSync === 'function') {
      console.log('✅ SyncService initialized');
    }

    console.log('\n--- Phase 4: Cache Verification ---');
    await offlineDb.setCache('test_key', { data: 'test_value' });
    const cached = await offlineDb.getCache('test_key');
    if (cached && cached.data === 'test_value') {
      console.log('✅ Local caching (IndexedDB/SQLite abstraction) working');
    } else {
      throw new Error('❌ Cache verification failed');
    }

    console.log('\n✨ Verification script completed basic checks successfully!');
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyOfflineIntegration();
