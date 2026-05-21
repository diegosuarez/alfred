package es.tcdn.diego.alfred

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context

class AlfredApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // FCM needs a channel on Android 8+; create it early so the
        // service can post immediately when a payload arrives.
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            getString(R.string.alfred_notification_channel_id),
            getString(R.string.alfred_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        )
        nm.createNotificationChannel(channel)
    }
}
