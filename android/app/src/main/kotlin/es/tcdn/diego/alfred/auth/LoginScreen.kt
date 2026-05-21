package es.tcdn.diego.alfred.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import es.tcdn.diego.alfred.BuildConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.GoogleNativeRequest
import es.tcdn.diego.alfred.data.LoginRequest
import es.tcdn.diego.alfred.data.SettingsRepository
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    config: AlfredConfig,
    settings: SettingsRepository,
    onSignedIn: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var apiUrl by remember { mutableStateOf(config.apiUrl) }
    var pat by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Alfred", style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = apiUrl,
            onValueChange = { apiUrl = it },
            label = { Text("URL del backend") },
            placeholder = { Text("https://alfred.example.com") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Spacer(Modifier.height(16.dp))

        OutlinedTextField(
            value = pat,
            onValueChange = { pat = it },
            label = { Text("Personal Access Token") },
            placeholder = { Text("alfred_pat_…") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = {
                scope.launch {
                    busy = true
                    try {
                        settings.setApiUrl(apiUrl)
                        settings.setToken(pat.trim())
                        onSignedIn()
                    } catch (e: Exception) {
                        status = e.message
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && pat.isNotBlank() && apiUrl.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Entrar con PAT") }

        Spacer(Modifier.height(16.dp))
        HorizontalDivider()
        Spacer(Modifier.height(16.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Contraseña") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = {
                scope.launch {
                    busy = true
                    try {
                        settings.setApiUrl(apiUrl)
                        val api = ApiClient.create(apiUrl, token = null)
                        val token = api.loginPassword(email.trim(), password)
                        settings.setToken(token.accessToken)
                        onSignedIn()
                    } catch (e: Exception) {
                        status = e.message
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Entrar con email/contraseña") }

        if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            TextButton(
                onClick = {
                    scope.launch {
                        busy = true
                        try {
                            val idToken = GoogleSignInHelper(ctx)
                                .obtainIdToken(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                            settings.setApiUrl(apiUrl)
                            val api = ApiClient.create(apiUrl, token = null)
                            val token = api.loginGoogle(GoogleNativeRequest(idToken))
                            settings.setToken(token.accessToken)
                            onSignedIn()
                        } catch (e: Exception) {
                            status = e.message
                        } finally {
                            busy = false
                        }
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Entrar con Google") }
        }

        if (status != null) {
            Spacer(Modifier.height(12.dp))
            Text(
                status!!,
                color = androidx.compose.material3.MaterialTheme.colorScheme.error,
            )
        }
    }
}
