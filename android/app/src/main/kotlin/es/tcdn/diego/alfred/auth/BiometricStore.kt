package es.tcdn.diego.alfred.auth

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/** Stores the JWT in EncryptedSharedPreferences-style — encrypted with
 *  an AES-GCM key in the Android Keystore that's gated on biometric
 *  authentication. The biometric prompt fronts both encrypt (enable
 *  feature) and decrypt (unlock at launch). Cancelling the prompt
 *  returns null rather than throwing so callers can degrade gracefully.
 */
class BiometricStore(private val context: Context) {
    private val prefs =
        context.getSharedPreferences("alfred_biometric", Context.MODE_PRIVATE)

    fun isHardwareAvailable(): Boolean {
        val manager = BiometricManager.from(context)
        return manager.canAuthenticate(STRONG) == BiometricManager.BIOMETRIC_SUCCESS
    }

    fun hasStored(): Boolean = prefs.contains(PREF_CT)

    fun clear() {
        prefs.edit().clear().apply()
        try {
            keystore().deleteEntry(KEY_ALIAS)
        } catch (_: Exception) {
        }
    }

    suspend fun storeToken(activity: FragmentActivity, token: String): Boolean {
        return try {
            val key = getOrCreateKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val authed = prompt(activity, cipher, "Activar desbloqueo con huella")
                ?: return false
            val ct = authed.doFinal(token.toByteArray(Charsets.UTF_8))
            prefs.edit()
                .putString(PREF_CT, Base64.encodeToString(ct, Base64.NO_WRAP))
                .putString(PREF_IV, Base64.encodeToString(authed.iv, Base64.NO_WRAP))
                .apply()
            true
        } catch (_: Exception) {
            // KeyPermanentlyInvalidatedException or the like — clear and bail.
            clear()
            false
        }
    }

    suspend fun unlock(activity: FragmentActivity): String? {
        val ctB64 = prefs.getString(PREF_CT, null) ?: return null
        val ivB64 = prefs.getString(PREF_IV, null) ?: return null
        return try {
            val key = getOrCreateKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val iv = Base64.decode(ivB64, Base64.NO_WRAP)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            val authed = prompt(activity, cipher, "Desbloquear Alfred")
                ?: return null
            val ct = Base64.decode(ctB64, Base64.NO_WRAP)
            String(authed.doFinal(ct), Charsets.UTF_8)
        } catch (_: Exception) {
            // KeyPermanentlyInvalidatedException happens when the user
            // changed their biometrics (added/removed a fingerprint).
            // Wipe the stored token so the user falls back to manual login.
            clear()
            null
        }
    }

    private fun keystore(): KeyStore =
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun getOrCreateKey(): SecretKey {
        val ks = keystore()
        ks.getKey(KEY_ALIAS, null)?.let { return it as SecretKey }

        val kg = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
        )
        val builder = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(
                0, // every-use auth — we re-prompt for each operation
                KeyProperties.AUTH_BIOMETRIC_STRONG,
            )
        }
        kg.init(builder.build())
        return kg.generateKey()
    }

    private suspend fun prompt(
        activity: FragmentActivity,
        cipher: Cipher,
        title: String,
    ): Cipher? = suspendCancellableCoroutine { cont ->
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    if (cont.isActive) cont.resume(result.cryptoObject?.cipher)
                }

                override fun onAuthenticationError(
                    errorCode: Int,
                    errString: CharSequence,
                ) {
                    if (cont.isActive) cont.resume(null)
                }
                // onAuthenticationFailed() — don't resume; the prompt
                // allows multiple attempts before invoking onError.
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setNegativeButtonText("Cancelar")
            .setAllowedAuthenticators(STRONG)
            .build()
        prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }

    companion object {
        private const val KEY_ALIAS = "alfred.token.v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val PREF_CT = "ct"
        private const val PREF_IV = "iv"
        private const val STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG
    }
}
