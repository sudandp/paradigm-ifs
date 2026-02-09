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
    fun showToast(toast: String) {
        Toast.makeText(mContext, toast, Toast.LENGTH_SHORT).show()
    }
}
