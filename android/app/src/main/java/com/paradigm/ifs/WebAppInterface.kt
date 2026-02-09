package com.paradigm.ifs

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import android.widget.Toast
import android.util.Log
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat

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
        val notificationManager = mContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "notifications_channel"
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "App Notifications",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        if (count > 0) {
            val notification = NotificationCompat.Builder(mContext, channelId)
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
    }

    @JavascriptInterface
    fun showNotification(title: String, message: String) {
        Log.d("WebAppInterface", "showNotification called: $title")
        val notificationManager = mContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "notifications_channel"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "App Notifications",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(mContext, channelId)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }

    @JavascriptInterface
    fun showToast(toast: String) {
        Toast.makeText(mContext, toast, Toast.LENGTH_SHORT).show()
    }
}
