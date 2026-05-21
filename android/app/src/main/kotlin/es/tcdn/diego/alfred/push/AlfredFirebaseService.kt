package es.tcdn.diego.alfred.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import es.tcdn.diego.alfred.MainActivity
import es.tcdn.diego.alfred.R
import es.tcdn.diego.alfred.data.SettingsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AlfredFirebaseService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Re-register every time FCM rotates the token. Failures swallowed:
        // the next app open will retry via PushSubscriber.
        CoroutineScope(Dispatchers.IO).launch {
            try {
                PushSubscriber(applicationContext, SettingsRepository(applicationContext))
                    .registerToken(token)
            } catch (_: Exception) { /* retried on next foreground */ }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title
            ?: message.data["title"]
            ?: "Alfred"
        val body = message.notification?.body
            ?: message.data["body"]
            ?: "Recordatorio"
        showNotification(title, body, message.data["task_id"]?.toIntOrNull())
    }

    private fun showNotification(title: String, body: String, taskId: Int?) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            taskId?.let { putExtra("task_id", it) }
        }
        val pi = PendingIntent.getActivity(
            this, taskId ?: 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notif = NotificationCompat.Builder(this, getString(R.string.alfred_notification_channel_id))
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(taskId ?: 1, notif)
    }
}
