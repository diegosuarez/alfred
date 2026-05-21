package es.tcdn.diego.alfred.push

import android.content.Context
import android.os.Build
import com.google.firebase.messaging.FirebaseMessaging
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.FcmSubscribeRequest
import es.tcdn.diego.alfred.data.SettingsRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class PushSubscriber(
    private val context: Context,
    private val settings: SettingsRepository,
) {

    suspend fun registerCurrentToken() {
        val token = currentFcmToken() ?: return
        registerToken(token)
    }

    suspend fun registerToken(token: String) {
        val cfg = settings.config.first()
        if (cfg.token.isNullOrBlank()) return
        try {
            ApiClient.create(cfg.apiUrl, cfg.token).fcmSubscribe(
                FcmSubscribeRequest(token = token, deviceLabel = deviceLabel()),
            )
        } catch (_: Exception) {
            // Retry on next foreground.
        }
    }

    private fun deviceLabel(): String =
        "${Build.MANUFACTURER} ${Build.MODEL}".trim()

    private suspend fun currentFcmToken(): String? =
        suspendCancellableCoroutine { cont ->
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { cont.resume(it) }
                .addOnFailureListener { cont.resumeWithException(it) }
        }
}
