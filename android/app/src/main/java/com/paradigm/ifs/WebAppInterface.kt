package com.paradigm.ifs

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import android.widget.Toast
import android.util.Log

class WebAppInterface(private val mContext: Context) {

    @JavascriptInterface
    fun startTracking(intervalMinutes: Int, supabaseUrl: String, supabaseKey: String, userId: String) {
        Log.d("WebAppInterface", "startTracking called with interval: $intervalMinutes")
        val serviceIntent = Intent(mContext, LocationService::class.java)
        serviceIntent.action = "START_TRACKING"
        serviceIntent.putExtra("interval", intervalMinutes)
        serviceIntent.putExtra("supabaseUrl", supabaseUrl)
        serviceIntent.putExtra("supabaseKey", supabaseKey)
        serviceIntent.putExtra("userId", userId)
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            mContext.startForegroundService(serviceIntent)
        } else {
            mContext.startService(serviceIntent)
        }
        
        Toast.makeText(mContext, "Tracking Started", Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun stopTracking() {
        Log.d("WebAppInterface", "stopTracking called")
        val serviceIntent = Intent(mContext, LocationService::class.java)
        serviceIntent.action = "STOP_TRACKING"
        mContext.startService(serviceIntent)
        Toast.makeText(mContext, "Tracking Stopped", Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun updateNotificationCount(count: Int) {
        Log.d("WebAppInterface", "updateNotificationCount called with count: $count")
        
        // Update Status Bar Notification
        val notificationManager = mContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val channelId = "notifications_channel"
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "App Notifications",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        if (count > 0) {
            val notification = androidx.core.app.NotificationCompat.Builder(mContext, channelId)
                .setContentTitle("New Notifications")
                .setContentText("You have $count new notifications")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setNumber(count)
                .setAutoCancel(true)
                .build()
            notificationManager.notify(1001, notification)
        } else {
            notificationManager.cancel(1001)
        }

        // Update Launcher Badge
        try {
            me.leolin.shortcutbadger.ShortcutBadger.applyCount(mContext, count)
        } catch (e: Exception) {
            Log.e("WebAppInterface", "Failed to apply badge count", e)
        }
    }

    @JavascriptInterface
    fun showNotification(title: String, message: String) {
        Log.d("WebAppInterface", "showNotification called: $title")
        val notificationManager = mContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val channelId = "notifications_channel"

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "App Notifications",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification = androidx.core.app.NotificationCompat.Builder(mContext, channelId)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_DEFAULT)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }

    @JavascriptInterface
    fun showToast(toast: String) {
        Toast.makeText(mContext, toast, Toast.LENGTH_SHORT).show()
    }
}
