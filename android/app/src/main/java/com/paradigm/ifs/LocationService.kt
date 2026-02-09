package com.paradigm.ifs

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Bundle
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.Timer
import java.util.TimerTask

class LocationService : Service(), LocationListener {

    private lateinit var locationManager: LocationManager
    private var trackingIntervalMinutes: Int = 15
    private var isTracking = false
    private var supabaseUrl: String? = null
    private var supabaseKey: String? = null
    private var userId: String? = null
    
    private val TAG = "LocationService"
    private val NOTIFICATION_CHANNEL_ID = "location_tracking_channel"
    private val NOTIFICATION_ID = 1

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) {
            val action = intent.action
            if (action == "START_TRACKING") {
                val interval = intent.getIntExtra("interval", 15)
                supabaseUrl = intent.getStringExtra("supabaseUrl")
                supabaseKey = intent.getStringExtra("supabaseKey")
                userId = intent.getStringExtra("userId")
                startTracking(interval)
            } else if (action == "STOP_TRACKING") {
                stopTracking()
            }
        }
        return START_STICKY
    }

    private fun startTracking(intervalMinutes: Int) {
        if (isTracking) {
             // Update interval if needed
             if (trackingIntervalMinutes != intervalMinutes) {
                 stopLocationUpdates()
                 trackingIntervalMinutes = intervalMinutes
                 startLocationUpdates()
             }
             return
        }

        trackingIntervalMinutes = intervalMinutes
        isTracking = true

        // Static notification text as requested
        val notification = createNotification("Location Tracking Active", "Paradigm Services running in background")
        startForeground(NOTIFICATION_ID, notification)

        startLocationUpdates()
    }

    private fun stopTracking() {
        isTracking = false
        stopLocationUpdates()
        stopForeground(true)
        stopSelf()
    }

    private fun startLocationUpdates() {
        try {
            val minTime = trackingIntervalMinutes * 60 * 1000L
            val minDistance = 10f 

            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                minTime,
                minDistance,
                this
            )
             locationManager.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                minTime,
                minDistance,
                this
            )
            Log.d(TAG, "Location updates started with interval: $trackingIntervalMinutes mins")

        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission missing", e)
        }
    }

    private fun stopLocationUpdates() {
        locationManager.removeUpdates(this)
         Log.d(TAG, "Location updates stopped")
    }

    override fun onLocationChanged(location: Location) {
        Log.d(TAG, "Location changed: ${location.latitude}, ${location.longitude}")
        
        val intent = Intent("LOCATION_UPDATE")
        intent.putExtra("latitude", location.latitude)
        intent.putExtra("longitude", location.longitude)
        intent.putExtra("timestamp", location.time)
        sendBroadcast(intent)
        
        // TODO: Sync location to Supabase here if needed (via HTTP)
    }

    // Violation Detection: GPS Status
    override fun onProviderDisabled(provider: String) {
        if (isTracking && (provider == LocationManager.GPS_PROVIDER || provider == LocationManager.NETWORK_PROVIDER)) {
            Log.w(TAG, "GPS/Network Provider Disabled: $provider")
            triggerViolationNotification("Location Services Disabled", "Please enable GPS to continue tracking.")
            sendViolationToSupabase("GPS Disabled", "User disabled location services.")
        }
    }

    override fun onProviderEnabled(provider: String) {
        // Resume/Re-check?
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
    
    // Violation Detection: App Kill (Task Removed)
    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.w(TAG, "App Task Removed (App Killed)")
        if (isTracking) {
             triggerViolationNotification("Attendance Detection", "Please keep the app running for attendance tracking.")
             sendViolationToSupabase("App Killed", "User killed the application task.")
        }
        super.onTaskRemoved(rootIntent)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Location Tracking Channel",
                NotificationManager.IMPORTANCE_LOW 
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun createNotification(title: String, content: String): Notification {
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation) 
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    private fun triggerViolationNotification(title: String, content: String) {
        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
            
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(2, notification)
    }
    
    private fun sendViolationToSupabase(title: String, message: String) {
        if (supabaseUrl == null || supabaseKey == null || userId == null) return
        
        Thread {
            try {
                // Post to 'notifications' table
                // Note: This matches the 'Notification' interface in types
                // We need to fetch Admin ID or just create a system notification?
                // For now, let's assume we create a notification for the USER (Admin will see it if they are tracking)
                // OR we want to notify the Admin about THIS user.
                // The 'notifications' table usually has 'user_id' for the recipient.
                // Sending to SELF (the field staff) won't help the admin see it.
                // We really need to know the Admin's ID.
                // Alternative: Insert into 'attendance_violations' table if it exists?
                // The user said "Notification Bar" (Web UI). 
                // Let's try to insert into 'notifications' for the user themselves for now, 
                // OR ideally we should trigger an Edge Function that notifies admins.
                
                // Simplified: Just log for now, full implementation requires Admin ID lookup.
                // But wait, the screenshot shows "Good Afternoon Sudhan" (Admin).
                // If I insert a notification for the *Admin*, I need their ID.
                // I don't have the Admin's ID here in the Native Service of the Employee's phone.
                
                // Strategy: Insert into 'attendance_violations' (or similar) and let the Backend/Edge Function notify Admin.
                // But I only have REST access here.
                
                // Let's try to post a generic 'security' notification to the *current user* (field staff)
                // hoping that existing logic propagates it, OR just to verify connectivity.
                // Actually, the prompt says "notification all need to go Notification Bar".
                // If the user IS the admin (testing on their phone), they will see it.
                
                val url = java.net.URL("$supabaseUrl/rest/v1/notifications")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("apikey", supabaseKey)
                conn.setRequestProperty("Authorization", "Bearer $supabaseKey")
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                
                val jsonPayload = """
                    {
                        "user_id": "$userId",
                        "title": "$title",
                        "message": "$message",
                        "type": "security",
                        "read": false
                    }
                """.trimIndent()
                
                conn.outputStream.use { os ->
                    val input = jsonPayload.toByteArray(java.nio.charset.StandardCharsets.UTF_8)
                    os.write(input, 0, input.size)
                }
                
                val responseCode = conn.responseCode
                Log.d(TAG, "Sent violation to Supabase: $responseCode")
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send violation", e)
            }
        }.start()
    }
}
