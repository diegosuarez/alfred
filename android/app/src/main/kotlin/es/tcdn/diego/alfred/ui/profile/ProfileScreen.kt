package es.tcdn.diego.alfred.ui.profile

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import coil3.compose.AsyncImage
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.GoogleAccount
import es.tcdn.diego.alfred.data.GoogleConnectRequest
import es.tcdn.diego.alfred.data.Pat
import es.tcdn.diego.alfred.data.PatCreate
import es.tcdn.diego.alfred.data.PatCreated
import es.tcdn.diego.alfred.ui.common.GlassCard
import es.tcdn.diego.alfred.ui.common.absUrl
import es.tcdn.diego.alfred.ui.common.screenBackground
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    config: AlfredConfig,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    val ctx = LocalContext.current

    var pats by remember { mutableStateOf<List<Pat>>(emptyList()) }
    var accounts by remember { mutableStateOf<List<GoogleAccount>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshTick by remember { mutableStateOf(0) }

    var showAddPat by remember { mutableStateOf(false) }
    var justCreated by remember { mutableStateOf<PatCreated?>(null) }
    var syncMessage by remember { mutableStateOf<String?>(null) }
    var syncingId by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(refreshTick) {
        loading = true
        try {
            val api = ApiClient.create(config.apiUrl, config.token)
            pats = runCatching { api.listPats() }.getOrDefault(emptyList())
            accounts = runCatching { api.listGoogleAccounts() }.getOrDefault(emptyList())
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Perfil") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                ),
            )
        },
        containerColor = Color.Transparent,
        modifier = Modifier.background(screenBackground(null)),
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            error?.let {
                Text("Error: $it", color = MaterialTheme.colorScheme.error)
            }

            // ---------- Google accounts -------------------------------------
            Column {
                SectionHeader("Cuentas Google")
                if (accounts.isEmpty()) {
                    GlassCard(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "No tienes ninguna cuenta de Google conectada. " +
                                "Las cuentas aportan la lista de contactos para " +
                                "asignar tareas.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                } else {
                    accounts.forEach { acc ->
                        GlassCard(modifier = Modifier.fillMaxWidth()) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (acc.pictureUrl != null) {
                                    AsyncImage(
                                        model = acc.pictureUrl,
                                        contentDescription = null,
                                        modifier = Modifier
                                            .size(36.dp)
                                            .clip(CircleShape),
                                    )
                                } else {
                                    Box(
                                        Modifier
                                            .size(36.dp)
                                            .clip(CircleShape)
                                            .background(Color.White.copy(alpha = 0.08f))
                                    )
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        acc.displayName ?: acc.email,
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                    Text(
                                        acc.email,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                IconButton(
                                    enabled = syncingId != acc.id,
                                    onClick = {
                                        syncingId = acc.id
                                        scope.launch {
                                            val result = runCatching {
                                                ApiClient.create(config.apiUrl, config.token)
                                                    .syncGoogleContacts(acc.id)
                                            }
                                            syncMessage = result.fold(
                                                onSuccess = {
                                                    "Sincronizados: " +
                                                        "${it.added} nuevos, " +
                                                        "${it.updated} actualizados " +
                                                        "(total ${it.total})"
                                                },
                                                onFailure = {
                                                    "Error al sincronizar: ${it.message}"
                                                },
                                            )
                                            syncingId = null
                                        }
                                    },
                                ) {
                                    Icon(
                                        Icons.Default.Refresh,
                                        contentDescription = "Sincronizar contactos"
                                    )
                                }
                                IconButton(onClick = {
                                    scope.launch {
                                        runCatching {
                                            ApiClient.create(config.apiUrl, config.token)
                                                .disconnectGoogleAccount(acc.id)
                                        }
                                        refreshTick++
                                    }
                                }) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = "Desconectar"
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = {
                        scope.launch {
                            runCatching {
                                val resp = ApiClient.create(config.apiUrl, config.token)
                                    .connectGoogleAccount(
                                        GoogleConnectRequest(
                                            extraScopes = listOf(
                                                "https://www.googleapis.com/auth/contacts.readonly"
                                            ),
                                        ),
                                    )
                                // The backend redirects through Google's
                                // consent screen; open it in the system browser
                                // and let the OAuth callback finish on the
                                // backend (sets the session cookie that the
                                // web frontend uses — the mobile app picks up
                                // the new account on next list-google-accounts).
                                ctx.startActivity(
                                    Intent(Intent.ACTION_VIEW, resp.authorizeUrl.toUri())
                                )
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Conectar otra cuenta de Google") }
                syncMessage?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                }
            }

            // ---------- Personal Access Tokens ------------------------------
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SectionHeader("Tokens API")
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = { showAddPat = true }) {
                        Icon(Icons.Default.Add, contentDescription = "Crear PAT")
                    }
                }
                if (pats.isEmpty()) {
                    Text(
                        "Sin tokens. Crea uno para usar el CLI o automations.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                } else {
                    pats.forEach { pat ->
                        GlassCard(modifier = Modifier.fillMaxWidth()) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        pat.name,
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                    Text(
                                        "${pat.prefix}…  ·  creado " +
                                            (pat.createdAt?.take(10) ?: "—"),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    if (pat.revokedAt != null) {
                                        Text(
                                            "Revocado",
                                            color = MaterialTheme.colorScheme.error,
                                            style = MaterialTheme.typography.labelSmall,
                                        )
                                    }
                                }
                                if (pat.revokedAt == null) {
                                    IconButton(onClick = {
                                        scope.launch {
                                            runCatching {
                                                ApiClient.create(config.apiUrl, config.token)
                                                    .revokePat(pat.id)
                                            }
                                            refreshTick++
                                        }
                                    }) {
                                        Icon(
                                            Icons.Default.Delete,
                                            contentDescription = "Revocar"
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
        }
    }

    if (showAddPat) {
        AddPatDialog(
            onDismiss = { showAddPat = false },
            onCreate = { name ->
                scope.launch {
                    val result = runCatching {
                        ApiClient.create(config.apiUrl, config.token)
                            .createPat(PatCreate(name = name))
                    }
                    showAddPat = false
                    result.onSuccess {
                        justCreated = it
                        refreshTick++
                    }
                }
            },
        )
    }

    justCreated?.let { created ->
        ShowCreatedTokenDialog(
            pat = created,
            onCopy = { clipboard.setText(AnnotatedString(created.token)) },
            onDismiss = { justCreated = null },
        )
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

@Composable
private fun AddPatDialog(
    onDismiss: () -> Unit,
    onCreate: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nuevo token") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Nombre (ej. movil-cli, claude-agent)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank(),
                onClick = { onCreate(name.trim()) },
            ) { Text("Crear") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun ShowCreatedTokenDialog(
    pat: PatCreated,
    onCopy: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Token creado") },
        text = {
            Column {
                Text(
                    "Este es el único momento en que verás el token. " +
                        "Cópialo ahora y guárdalo en el cliente que lo " +
                        "vaya a usar.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        pat.token,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onCopy) { Text("Copiar") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cerrar") }
        },
    )
}
