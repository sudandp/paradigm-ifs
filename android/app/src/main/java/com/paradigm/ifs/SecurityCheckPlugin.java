package com.paradigm.ifs;

import android.content.Context;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SecurityCheck")
public class SecurityCheckPlugin extends Plugin {

    @PluginMethod
    public void getSecurityStatus(PluginCall call) {
        JSObject ret = new JSObject();
        Context context = getContext();

        boolean devOptionsEnabled = false;
        try {
            devOptionsEnabled = Settings.Global.getInt(
                    context.getContentResolver(),
                    Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) != 0;
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Check Microphone Permission directly from Manifest
        boolean micGranted = false;
        try {
            micGranted = androidx.core.content.ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Check Calendar
        boolean calendarGranted = false;
        try {
            calendarGranted = androidx.core.content.ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.READ_CALENDAR) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Check Contacts
        boolean contactsGranted = false;
        try {
            contactsGranted = androidx.core.content.ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.READ_CONTACTS) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Check Files - using READ_EXTERNAL_STORAGE as general proxy
        boolean filesGranted = false;
        try {
            filesGranted = androidx.core.content.ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.READ_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED;

            // On newer Android (13+), external storage permission might be split
            if (!filesGranted && android.os.Build.VERSION.SDK_INT >= 33) {
                boolean images = androidx.core.content.ContextCompat.checkSelfPermission(context,
                        "android.permission.READ_MEDIA_IMAGES") == android.content.pm.PackageManager.PERMISSION_GRANTED;
                boolean video = androidx.core.content.ContextCompat.checkSelfPermission(context,
                        "android.permission.READ_MEDIA_VIDEO") == android.content.pm.PackageManager.PERMISSION_GRANTED;
                if (images || video)
                    filesGranted = true;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Check Physical Activity
        boolean activityGranted = false;
        try {
            activityGranted = androidx.core.content.ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.ACTIVITY_RECOGNITION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            e.printStackTrace();
        }

        ret.put("developerMode", devOptionsEnabled);
        ret.put("microphoneGranted", micGranted);
        ret.put("calendarGranted", calendarGranted);
        ret.put("contactsGranted", contactsGranted);
        ret.put("filesGranted", filesGranted);
        ret.put("activityGranted", activityGranted);

        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        android.content.Intent intent = new android.content.Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(android.net.Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
