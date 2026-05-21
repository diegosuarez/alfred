package es.tcdn.diego.alfred.ui.tasks

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
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
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.BoardDetail
import es.tcdn.diego.alfred.data.Task
import es.tcdn.diego.alfred.data.TaskCreate
import es.tcdn.diego.alfred.data.TaskUpdate
import es.tcdn.diego.alfred.ui.common.GlassCard
import es.tcdn.diego.alfred.ui.common.parseHex
import es.tcdn.diego.alfred.ui.common.priorityAccent
import es.tcdn.diego.alfred.ui.common.priorityTint
import es.tcdn.diego.alfred.ui.common.screenBackground
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
    var selectedColumnId by remember { mutableStateOf<Int?>(null) }
    var showCompleted by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var showArchiveConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(boardId, refreshTick) {
        loading = true
        error = null
        try {
            val fresh = ApiClient.create(config.apiUrl, config.token).getBoard(boardId)
            detail = fresh
            if (selectedColumnId == null && fresh.columns.isNotEmpty()) {
                selectedColumnId = fresh.columns.first().id
            }
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    val current = detail
    val activeColumn = current?.columns?.firstOrNull { it.id == selectedColumnId }
        ?: current?.columns?.firstOrNull()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(current?.name ?: "Tablero") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver"
                        )
                    }
                },
                actions = {
                    if (activeColumn != null && activeColumn.tasks.any { !it.completed || it.completed }) {
                        IconButton(onClick = { showArchiveConfirm = true }) {
                            Icon(
                                Icons.Default.Archive,
                                contentDescription = "Archivar todas las completadas",
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                ),
            )
        },
        floatingActionButton = {
            if (activeColumn != null) {
                ExtendedFloatingActionButton(
                    onClick = { showAdd = true },
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text("Tarea") },
                )
            }
        },
        containerColor = Color.Transparent,
        modifier = Modifier.background(screenBackground(null)),
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

            current == null || current.columns.isEmpty() -> Text(
                "El tablero no tiene columnas.",
                modifier = Modifier.padding(padding).padding(16.dp),
            )

            else -> Column(Modifier.padding(padding)) {
                // Search bar — filters titles + descriptions + names across
                // the current column.
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Buscar tareas") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )

                // Column tabs ("Pendiente / En Proceso / Completado").
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    current.columns.forEach { col ->
                        val selected = col.id == (activeColumn?.id ?: -1)
                        FilterChip(
                            selected = selected,
                            onClick = { selectedColumnId = col.id },
                            label = {
                                Text("${col.name} · ${col.tasks.count { !it.completed }}")
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                containerColor = Color.White.copy(alpha = 0.04f),
                                selectedContainerColor = MaterialTheme.colorScheme.primary
                                    .copy(alpha = 0.22f),
                            ),
                        )
                    }
                }

                val col = activeColumn ?: return@Column
                val q = query.trim().lowercase()
                // Show completed tasks too — just sort them to the bottom.
                // Hiding them on tick made cards "disappear" which surprised
                // users; the strikethrough style is enough to fade them out.
                val tasks = col.tasks
                    .filter { it.parentTaskId == null }
                    .filter { task ->
                        if (q.isEmpty()) return@filter true
                        val haystacks = listOf(
                            task.title,
                            task.description.orEmpty(),
                            task.requester?.name.orEmpty(),
                        ) + task.assignees.map { it.name }
                        haystacks.any { it.lowercase().contains(q) }
                    }
                    .sortedBy { it.completed }

                if (tasks.isEmpty()) {
                    Box(
                        Modifier.fillMaxWidth().padding(40.dp),
                        Alignment.Center,
                    ) {
                        Text(
                            "Sin tareas. Pulsa + para crear una.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.padding(horizontal = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 80.dp),
                    ) {
                        items(tasks) { task ->
                            TaskCard(
                                task = task,
                                apiUrl = config.apiUrl,
                                token = config.token,
                                onClick = { onPickTask(task.id) },
                                onToggle = { done ->
                                    scope.launch {
                                        try {
                                            ApiClient.create(config.apiUrl, config.token)
                                                .updateTask(task.id, TaskUpdate(completed = done))
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

    if (showArchiveConfirm && activeColumn != null) {
        AlertDialog(
            onDismissRequest = { showArchiveConfirm = false },
            title = { Text("Archivar columna") },
            text = {
                Text(
                    "¿Archivar todas las tareas de '${activeColumn.name}'? Las " +
                        "tareas archivadas no se borran; puedes restaurarlas " +
                        "luego desde el panel de archivadas."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val colId = activeColumn.id
                    showArchiveConfirm = false
                    scope.launch {
                        runCatching {
                            ApiClient.create(config.apiUrl, config.token)
                                .archiveAllInColumn(colId)
                        }
                        refreshTick++
                    }
                }) { Text("Archivar") }
            },
            dismissButton = {
                TextButton(onClick = { showArchiveConfirm = false }) { Text("Cancelar") }
            },
        )
    }

    if (showAdd && activeColumn != null) {
        AddTaskDialog(
            columnId = activeColumn.id,
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
private fun TaskCard(
    task: Task,
    apiUrl: String,
    token: String?,
    onClick: () -> Unit,
    onToggle: (Boolean) -> Unit,
) {
    val tint = priorityTint(task.priority)
    val coverImage = task.attachments.firstOrNull { it.isImage }
    val docCount = task.attachments.count { !it.isImage }
    val childCount = task.children.size
    val doneChildren = task.children.count { it.completed }

    GlassCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        tint = tint,
        contentPadding = 0,
    ) {
        Column {
            // Cover image bleeds to the card edges, matching the web look.
            if (coverImage != null) {
                AsyncImage(
                    model = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
                        .data(absUrl(apiUrl, coverImage.url, token))
                        .crossfade(true)
                        .build(),
                    contentDescription = coverImage.filename,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                        .clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp)),
                )
            }

            Column(Modifier.padding(14.dp)) {
                // Tags row (always present even if empty for spacing balance).
                if (task.tags.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        task.tags.take(4).forEach { tag ->
                            TagChip(tag.name, tag.color)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = task.completed,
                        onCheckedChange = onToggle,
                        colors = CheckboxDefaults.colors(
                            uncheckedColor = priorityAccent(task.priority),
                        ),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        task.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = if (task.completed)
                            MaterialTheme.colorScheme.onSurfaceVariant
                        else MaterialTheme.colorScheme.onSurface,
                        textDecoration = if (task.completed)
                            androidx.compose.ui.text.style.TextDecoration.LineThrough
                        else null,
                    )
                }

                // Badges row (subtasks / reminders / attachments / due date).
                val badges = mutableListOf<Pair<String, Color>>()
                if (childCount > 0) {
                    badges += "☑ $doneChildren/$childCount" to MaterialTheme.colorScheme.onSurfaceVariant
                }
                if (task.reminders.isNotEmpty()) {
                    badges += "🔔 ${task.reminders.size}" to Color(0xFFF59E0B)
                }
                if (docCount > 0) {
                    badges += "📎 $docCount" to MaterialTheme.colorScheme.onSurfaceVariant
                }
                task.dueDate?.let { iso ->
                    badges += "🗓 ${iso.take(10)}" to MaterialTheme.colorScheme.onSurfaceVariant
                }
                if (badges.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        badges.forEach { (text, color) ->
                            Text(text, style = MaterialTheme.typography.labelSmall, color = color)
                        }
                    }
                }

                // Subtasks rendered as nested rows with an L-connector.
                if (task.children.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    task.children.forEach { child -> SubtaskRow(child) }
                }
            }
        }
    }
}

@Composable
private fun TagChip(name: String, hex: String?) {
    val color = hex?.parseHex() ?: MaterialTheme.colorScheme.primary
    Box(
        Modifier
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, color.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            name,
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
    }
}

@Composable
private fun SubtaskRow(child: Task) {
    Row(
        Modifier.fillMaxWidth().padding(start = 8.dp, top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // L-connector glyph + indent
        Text(
            "└ ",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.width(2.dp))
        Box(
            Modifier
                .size(14.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(
                    if (child.completed) MaterialTheme.colorScheme.primary
                    else Color.White.copy(alpha = 0.10f)
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (child.completed) Text("✓", color = Color.White, style = MaterialTheme.typography.labelSmall)
        }
        Spacer(Modifier.width(8.dp))
        Text(
            child.title,
            style = MaterialTheme.typography.bodyMedium,
            color = if (child.completed)
                MaterialTheme.colorScheme.onSurfaceVariant
            else MaterialTheme.colorScheme.onSurface,
        )
    }
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
    var description by remember { mutableStateOf("") }
    var priority by remember { mutableStateOf("medium") }
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
                            ApiClient.create(apiUrl, token).createTask(
                                columnId,
                                TaskCreate(
                                    title = title.trim(),
                                    description = description.ifBlank { null },
                                    priority = priority,
                                ),
                            )
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
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Título") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Descripción (Markdown)") },
                    modifier = Modifier.fillMaxWidth().height(120.dp),
                )
                Text("Prioridad", style = MaterialTheme.typography.labelSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("low" to "Baja", "medium" to "Media", "high" to "Alta")
                        .forEach { (value, label) ->
                            AssistChip(
                                onClick = { priority = value },
                                label = { Text(label) },
                                colors = AssistChipDefaults.assistChipColors(
                                    containerColor = if (priority == value)
                                        priorityAccent(value).copy(alpha = 0.20f)
                                    else Color.White.copy(alpha = 0.04f),
                                ),
                            )
                        }
                }
            }
        },
    )
}

internal fun absUrl(apiUrl: String, path: String, token: String?): String {
    val base = apiUrl.trimEnd('/')
    val rel = if (path.startsWith("/")) path else "/$path"
    val full = "$base$rel"
    return if (token != null) "$full?token=$token" else full
}
