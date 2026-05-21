package es.tcdn.diego.alfred.ui.boards

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.Board
import es.tcdn.diego.alfred.data.Context as AlfredContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoardsScreen(
    config: AlfredConfig,
    onPickBoard: (Int) -> Unit,
    onOpenSettings: () -> Unit,
) {
    var contexts by remember { mutableStateOf<List<AlfredContext>>(emptyList()) }
    var boards by remember { mutableStateOf<List<Board>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(config.apiUrl, config.token) {
        loading = true
        error = null
        try {
            val api = ApiClient.create(config.apiUrl, config.token)
            contexts = api.listContexts()
            boards = api.listBoards()
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tableros") },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Ajustes")
                    }
                },
            )
        },
    ) { padding ->
        if (loading) {
            Column(
                Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) { CircularProgressIndicator() }
            return@Scaffold
        }
        if (error != null) {
            Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                Text("Error: $error", color = MaterialTheme.colorScheme.error)
            }
            return@Scaffold
        }
        LazyColumn(
            modifier = Modifier.padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 12.dp),
        ) {
            contexts.forEach { ctx ->
                val boardsInCtx = boards.filter { it.contextId == ctx.id }
                if (boardsInCtx.isEmpty()) return@forEach
                item {
                    Text(
                        ctx.name.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp, top = 8.dp),
                    )
                }
                items(boardsInCtx) { board ->
                    Card(
                        modifier = Modifier
                            .clickable { onPickBoard(board.id) }
                            .padding(vertical = 2.dp),
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text(
                                "${board.icon ?: "📁"}  ${board.name}",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            board.description?.takeIf { it.isNotBlank() }?.let {
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
