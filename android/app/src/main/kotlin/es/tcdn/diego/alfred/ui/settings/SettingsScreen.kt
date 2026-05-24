package es.tcdn.diego.alfred.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import es.tcdn.diego.alfred.auth.BiometricStore
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.SettingsRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    config: AlfredConfig,
    settings: SettingsRepository,
    onBack: () -> Unit,
    onSignedOut: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var apiUrl by remember { mutableStateOf(config.apiUrl) }
    var token by remember { mutableStateOf(config.token ?: "") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ajustes") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = apiUrl,
                onValueChange = { apiUrl = it },
                label = { Text("URL del backend") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("Token (PAT o JWT)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
            )
            Button(
                onClick = {
                    scope.launch {
                        settings.setApiUrl(apiUrl)
                        settings.setToken(token.takeIf { it.isNotBlank() })
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Guardar") }

            Spacer(Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))

            val androidCtx = LocalContext.current
            val biometricStore = remember { BiometricStore(androidCtx) }
            var biometricEnabled by remember { mutableStateOf(biometricStore.hasStored()) }
            if (biometricStore.isHardwareAvailable()) {
                Text(
                    "Desbloqueo con huella",
                    style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                )
                Text(
                    if (biometricEnabled)
                        "Activo. El JWT cifrado se desbloquea con tu huella al abrir la app."
                    else
                        "Inactivo. Cuando vuelvas a iniciar sesión te ofreceré activarlo.",
                    style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
                    color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (biometricEnabled) {
                    OutlinedButton(
                        onClick = {
                            biometricStore.clear()
                            biometricEnabled = false
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Olvidar credenciales biométricas") }
                }
                Spacer(Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
            }

            OutlinedButton(
                onClick = {
                    scope.launch {
                        biometricStore.clear()
                        settings.setToken(null)
                        settings.setDefaultBoardId(null)
                        settings.setDefaultContextId(null)
                        onSignedOut()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Cerrar sesión") }
        }
    }
}
