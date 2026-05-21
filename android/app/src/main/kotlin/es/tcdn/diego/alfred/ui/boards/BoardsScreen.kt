package es.tcdn.diego.alfred.ui.boards

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
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
import androidx.compose.ui.unit.dp
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.Board
import es.tcdn.diego.alfred.data.Context as AlfredContext
import es.tcdn.diego.alfred.ui.common.GlassCard
import es.tcdn.diego.alfred.ui.common.parseHex
import es.tcdn.diego.alfred.ui.common.screenBackground
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoardsScreen(
    config: AlfredConfig,
    onPickBoard: (Int) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenStats: () -> Unit = {},
    onOpenProfile: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    var contexts by remember { mutableStateOf<List<AlfredContext>>(emptyList()) }
    var boards by remember { mutableStateOf<List<Board>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var activeContextId by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(config.apiUrl, config.token) {
        loading = true
        error = null
        try {
            val api = ApiClient.create(config.apiUrl, config.token)
            contexts = api.listContexts()
            boards = api.listBoards()
            if (activeContextId == null && contexts.isNotEmpty()) {
                activeContextId = contexts.first().id
            }
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    val activeContext = contexts.firstOrNull { it.id == activeContextId }
    val visibleBoards = boards.filter { it.contextId == activeContextId }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                ContextsDrawer(
                    contexts = contexts,
                    activeId = activeContextId,
                    onPick = { id ->
                        activeContextId = id
                        scope.launch { drawerState.close() }
                    },
                    onOpenStats = {
                        scope.launch { drawerState.close() }
                        onOpenStats()
                    },
                    onOpenProfile = {
                        scope.launch { drawerState.close() }
                        onOpenProfile()
                    },
                )
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ContextDot(color = activeContext?.color)
                            Spacer(Modifier.size(8.dp))
                            Text(activeContext?.name ?: "Contextos")
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "Contextos")
                        }
                    },
                    actions = {
                        IconButton(onClick = onOpenSettings) {
                            Icon(Icons.Default.Settings, contentDescription = "Ajustes")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                    ),
                )
            },
            containerColor = Color.Transparent,
            modifier = Modifier.background(screenBackground(activeContext?.color)),
        ) { padding ->
            when {
                loading -> Box(
                    Modifier.fillMaxSize().padding(padding),
                    Alignment.Center,
                ) { CircularProgressIndicator() }

                error != null -> Text(
                    "Error: $error",
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(padding).padding(16.dp),
                )

                visibleBoards.isEmpty() -> Text(
                    "No tienes tableros en este contexto.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(padding).padding(16.dp),
                )

                else -> LazyColumn(
                    modifier = Modifier
                        .padding(padding)
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(vertical = 12.dp),
                ) {
                    items(visibleBoards) { board ->
                        GlassCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onPickBoard(board.id) },
                        ) {
                            Column {
                                Text(
                                    "${board.icon ?: "📁"}  ${board.name}",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                board.description?.takeIf { it.isNotBlank() }?.let {
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        it,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ContextsDrawer(
    contexts: List<AlfredContext>,
    activeId: Int?,
    onPick: (Int) -> Unit,
    onOpenStats: () -> Unit = {},
    onOpenProfile: () -> Unit = {},
) {
    Column(
        Modifier
            .background(Color(0xFF0F1218))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            "Contextos",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        contexts.forEach { ctx ->
            val active = ctx.id == activeId
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        if (active) Color.White.copy(alpha = 0.06f)
                        else Color.Transparent
                    )
                    .clickable { onPick(ctx.id) }
                    .padding(horizontal = 10.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ContextDot(color = ctx.color)
                Spacer(Modifier.size(10.dp))
                Text(
                    ctx.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (active) MaterialTheme.colorScheme.onSurface
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .clickable { onOpenStats() }
                .padding(horizontal = 10.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "📊  Estadísticas",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .clickable { onOpenProfile() }
                .padding(horizontal = 10.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "👤  Perfil (Google, tokens, contactos)",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ContextDot(color: String?) {
    val parsed = color?.parseHex() ?: Color.White.copy(alpha = 0.18f)
    Box(
        Modifier
            .size(12.dp)
            .clip(CircleShape)
            .background(parsed)
    )
}
