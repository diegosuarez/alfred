package es.tcdn.diego.alfred.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

class GoogleSignInHelper(private val context: Context) {

    /** Trigger Google Sign-In via Credential Manager and return the ID
     * token. Throws on cancellation or when no Google account is
     * configured on the device. */
    suspend fun obtainIdToken(webClientId: String): String {
        require(webClientId.isNotBlank()) {
            "GOOGLE_WEB_CLIENT_ID is not configured. Set google.webClientId " +
                "in local.properties before building."
        }
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(webClientId)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val response = CredentialManager.create(context).getCredential(context, request)
        val cred = response.credential
        if (cred !is androidx.credentials.CustomCredential ||
            cred.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            error("Unexpected credential type: ${cred.type}")
        }
        return GoogleIdTokenCredential.createFrom(cred.data).idToken
    }
}
