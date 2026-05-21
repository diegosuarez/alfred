package es.tcdn.diego.alfred.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.BoardDetail
import es.tcdn.diego.alfred.data.Task
import es.tcdn.diego.alfred.data.TaskCreate
import es.tcdn.diego.alfred.data.TaskUpdate
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(
    config: AlfredConfig,
    boardId: Int,
    onBack: () -> Unit,
    onPickTask: (Int) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<BoardDetail?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    var refreshTick by remember { mutableStateOf(0) }

    LaunchedEffect(boardId, refreshTick) {
        loading = true
        error = null
        try {
            detail = ApiClient.create(config.apiUrl, config.token).getBoard(boardId)
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(detail?.name ?: "Tablero") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                },
            )
        },
        floatingActionButton = {
            if (detail != null && detail!!.columns.isNotEmpty()) {
                ExtendedFloatingActionButton(
                    onClick = { showAdd = true },
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text("Tarea") },
                )
            }
        },
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) {
                CircularProgressIndicator()
            }
            error != null -> Text(
                "Error: $error",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(padding).padding(16.dp),
            )
            else -> LazyColumn(
                modifier = Modifier.padding(padding).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 12.dp),
            ) {
                detail!!.columns.forEach { col ->
                    item {
                        Text(
                            col.name.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 4.dp, top = 8.dp),
                        )
                    }
                    items(col.tasks.filter { !it.completed }) { task ->
                        TaskRow(
                            task = task,
                            onClick = { onPickTask(task.id) },
                            onToggle = {
                                scope.launch {
                                    try {
                                        ApiClient.create(config.apiUrl, config.token)
                                            .updateTask(task.id, TaskUpdate(completed = it))
                                        refreshTick++
                                    } catch (_: Exception) {}
                                }
                            },
                        )
                    }
                    val done = col.tasks.filter { it.completed }
                    if (done.isNotEmpty()) {
                        items(done) { task ->
                            TaskRow(
                                task = task,
                                onClick = { onPickTask(task.id) },
                                onToggle = {
                                    scope.launch {
                                        try {
                                            ApiClient.create(config.apiUrl, config.token)
                                                .updateTask(task.id, TaskUpdate(completed = it))
                                            refreshTick++
                                        } catch (_: Exception) {}
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showAdd && detail != null) {
        AddTaskDialog(
            columnId = detail!!.columns.first().id,
            apiUrl = config.apiUrl,
            token = config.token,
            onDismiss = { showAdd = false },
            onCreated = {
                showAdd = false
                refreshTick++
            },
        )
    }
}

@Composable
private fun TaskRow(
    task: Task,
    onClick: () -> Unit,
    onToggle: (Boolean) -> Unit,
) {
    val tint = when (task.priority) {
        "high" -> Color(0x26EF4444)
        "low" -> Color(0x213B82F6)
        else -> Color.Transparent
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .clickable { onClick() }
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = task.completed, onCheckedChange = onToggle)
            Column(Modifier.padding(start = 4.dp)) {
                Text(
                    task.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (task.completed) MaterialTheme.colorScheme.onSurfaceVariant
                            else MaterialTheme.colorScheme.onSurface,
                )
                if (task.priority != "medium" || task.dueDate != null) {
                    Text(
                        buildString {
                            if (task.priority != "medium") append(task.priority).append(" · ")
                            task.dueDate?.let { append(it.take(10)) }
                        }.trimEnd(' ', '·'),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
    Box(Modifier.fillMaxWidth().padding(0.dp))
    // Subtle background tint per priority — drawn via outer Card color above.
    if (tint != Color.Transparent) Unit
}

@Composable
private fun AddTaskDialog(
    columnId: Int,
    apiUrl: String,
    token: String?,
    onDismiss: () -> Unit,
    onCreated: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                enabled = title.isNotBlank() && !busy,
                onClick = {
                    scope.launch {
                        busy = true
                        try {
                            ApiClient.create(apiUrl, token)
                                .createTask(columnId, TaskCreate(title = title.trim()))
                            onCreated()
                        } catch (_: Exception) {
                            busy = false
                        }
                    }
                },
            ) { Text("Crear") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        title = { Text("Nueva tarea") },
        text = {
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Título") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    )
}
