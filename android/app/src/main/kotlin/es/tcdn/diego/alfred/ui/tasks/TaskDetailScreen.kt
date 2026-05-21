package es.tcdn.diego.alfred.ui.tasks

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import dev.jeziellago.compose.markdowntext.MarkdownText
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.Board
import es.tcdn.diego.alfred.data.Contact
import es.tcdn.diego.alfred.data.MoveTaskRequest
import es.tcdn.diego.alfred.data.ReminderCreate
import es.tcdn.diego.alfred.data.Tag
import es.tcdn.diego.alfred.data.Task
import es.tcdn.diego.alfred.data.TaskUpdate
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import es.tcdn.diego.alfred.ui.common.ContactDropdown
import es.tcdn.diego.alfred.ui.common.ContactMultiDropdown
import es.tcdn.diego.alfred.ui.common.GlassCard
import es.tcdn.diego.alfred.ui.common.ReminderPickerDialog
import es.tcdn.diego.alfred.ui.common.parseHex
import es.tcdn.diego.alfred.ui.common.priorityAccent
import es.tcdn.diego.alfred.ui.common.priorityTint
import es.tcdn.diego.alfred.ui.common.screenBackground
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailScreen(
    config: AlfredConfig,
    taskId: Int,
    onBack: () -> Unit,
    onLaunchFocus: (taskId: Int, title: String) -> Unit = { _, _ -> },
) {
    val scope = rememberCoroutineScope()
    val androidContext = LocalContext.current
    var task by remember { mutableStateOf<Task?>(null) }
    var allTags by remember { mutableStateOf<List<Tag>>(emptyList()) }
    var allContacts by remember { mutableStateOf<List<Contact>>(emptyList()) }
    var allBoards by remember { mutableStateOf<List<Board>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var editingTitle by remember { mutableStateOf("") }
    var editingDescription by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var showMoveSheet by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var showReminderPicker by remember { mutableStateOf(false) }

    suspend fun refresh() {
        val api = ApiClient.create(config.apiUrl, config.token)
        val fresh = api.updateTask(taskId, TaskUpdate())
        task = fresh
        editingTitle = fresh.title
        editingDescription = fresh.description ?: ""
    }

    LaunchedEffect(taskId) {
        loading = true
        try {
            val api = ApiClient.create(config.apiUrl, config.token)
            refresh()
            allTags = runCatching { api.listTags() }.getOrDefault(emptyList())
            allContacts = runCatching { api.listContacts() }.getOrDefault(emptyList())
            allBoards = runCatching { api.listBoards() }.getOrDefault(emptyList())
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    // System file picker → uploads as multipart on selection.
    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                val resolver = androidContext.contentResolver
                val name = uri.lastPathSegment ?: "upload"
                val mime = resolver.getType(uri) ?: "application/octet-stream"
                val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: return@launch
                val body = bytes.toRequestBody(mime.toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("file", name, body)
                ApiClient.create(config.apiUrl, config.token)
                    .uploadAttachment(taskId, part)
                refresh()
            }
        }
    }

    fun patch(body: TaskUpdate) {
        scope.launch {
            try {
                task = ApiClient.create(config.apiUrl, config.token)
                    .updateTask(taskId, body)
            } catch (_: Exception) {}
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(task?.title ?: "Tarea") },
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
        if (loading) {
            Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        error?.let {
            Text(
                "Error: $it",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(padding).padding(16.dp),
            )
            return@Scaffold
        }
        val t = task ?: return@Scaffold

        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            OutlinedTextField(
                value = editingTitle,
                onValueChange = { editingTitle = it },
                label = { Text("Título") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            Section("Prioridad") {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("low" to "Baja", "medium" to "Media", "high" to "Alta")
                        .forEach { (value, label) ->
                            FilterChip(
                                selected = t.priority == value,
                                onClick = { patch(TaskUpdate(priority = value)) },
                                label = { Text(label) },
                                colors = FilterChipDefaults.filterChipColors(
                                    containerColor = priorityTint(value),
                                    selectedContainerColor = priorityAccent(value)
                                        .copy(alpha = 0.30f),
                                ),
                            )
                        }
                }
            }

            Section("Descripción (Markdown)") {
                OutlinedTextField(
                    value = editingDescription,
                    onValueChange = { editingDescription = it },
                    placeholder = { Text("Sin descripción") },
                    modifier = Modifier.fillMaxWidth().height(160.dp),
                )
                Spacer(Modifier.height(6.dp))
                Button(
                    onClick = {
                        patch(
                            TaskUpdate(
                                title = editingTitle,
                                description = editingDescription,
                            )
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Guardar título + descripción") }

                if (!t.description.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    GlassCard(modifier = Modifier.fillMaxWidth()) {
                        MarkdownText(markdown = t.description)
                    }
                }
            }

            Section("Etiquetas") {
                if (allTags.isEmpty()) {
                    Text(
                        "Sin etiquetas creadas",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                } else {
                    val selected = t.tags.map { it.id }.toSet()
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                    ) {
                        allTags.forEach { tag ->
                            val on = tag.id in selected
                            val color = tag.color?.parseHex()
                                ?: MaterialTheme.colorScheme.primary
                            FilterChip(
                                selected = on,
                                onClick = {
                                    val newSet = if (on) selected - tag.id
                                                  else selected + tag.id
                                    patch(TaskUpdate(tagIds = newSet.toList()))
                                },
                                label = { Text(tag.name) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = color.copy(alpha = 0.30f),
                                ),
                            )
                        }
                    }
                }
            }

            Section("Encargada por") {
                ContactDropdown(
                    label = "Encargada por",
                    contacts = allContacts,
                    selectedId = t.requester?.id,
                    apiUrl = config.apiUrl,
                    token = config.token,
                    onPick = { id -> patch(TaskUpdate(requesterId = id ?: 0)) },
                )
            }

            Section("Asignado a") {
                ContactMultiDropdown(
                    label = "Asignado a",
                    contacts = allContacts,
                    selectedIds = t.assignees.map { it.id }.toSet(),
                    apiUrl = config.apiUrl,
                    token = config.token,
                    onChange = { ids -> patch(TaskUpdate(assigneeIds = ids.toList())) },
                )
            }

            Section("Recordatorios") {
                if (t.reminders.isEmpty()) {
                    Text(
                        "Sin recordatorios programados.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    t.reminders.forEach { rem ->
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("🔔 ${formatReminderLocal(rem.remindAt)}")
                            Spacer(Modifier.weight(1f))
                            IconButton(onClick = {
                                scope.launch {
                                    try {
                                        ApiClient.create(config.apiUrl, config.token)
                                            .deleteReminder(rem.id)
                                        refresh()
                                    } catch (_: Exception) {}
                                }
                            }) {
                                Text(
                                    "✕",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                AssistChip(
                    onClick = { showReminderPicker = true },
                    label = { Text("+ Añadir recordatorio") },
                )
            }

            val images = t.attachments.filter { it.isImage }
            if (images.isNotEmpty()) {
                Section("Imágenes") {
                    images.forEach { att ->
                        AsyncImage(
                            model = absUrl(config.apiUrl, att.url, config.token),
                            contentDescription = att.filename,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(180.dp)
                                .clip(RoundedCornerShape(10.dp)),
                        )
                    }
                }
            }
            val docs = t.attachments.filter { !it.isImage }
            if (docs.isNotEmpty()) {
                Section("Documentos") {
                    docs.forEach { att ->
                        Text("📄 ${att.filename}  (${att.size / 1024} KB)")
                    }
                }
            }

            Section("Acciones") {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                ) {
                    AssistChip(
                        onClick = { onLaunchFocus(t.id, t.title) },
                        label = { Text("⏱ Foco") },
                    )
                    AssistChip(
                        onClick = { filePicker.launch("*/*") },
                        label = { Text("📎 Adjuntar") },
                    )
                    AssistChip(
                        onClick = { showMoveSheet = true },
                        label = { Text("➡ Mover de tablero") },
                    )
                }
            }

            Section("Estado") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(
                        onClick = { patch(TaskUpdate(completed = !t.completed)) },
                        label = {
                            Text(
                                if (t.completed) "✓ Completada"
                                else "Marcar completada"
                            )
                        },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = if (t.completed)
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.20f)
                            else Color.White.copy(alpha = 0.04f),
                        ),
                    )
                    AssistChip(
                        onClick = { patch(TaskUpdate(archived = true)) },
                        label = { Text("Archivar") },
                    )
                    AssistChip(
                        onClick = { showDeleteConfirm = true },
                        label = { Text("Borrar") },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = MaterialTheme.colorScheme.error
                                .copy(alpha = 0.18f),
                            labelColor = MaterialTheme.colorScheme.error,
                        ),
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
        }
    }

    val taskRef = task
    if (showReminderPicker) {
        ReminderPickerDialog(
            onDismiss = { showReminderPicker = false },
            onPick = { isoUtc ->
                showReminderPicker = false
                scope.launch {
                    runCatching {
                        ApiClient.create(config.apiUrl, config.token)
                            .addReminder(taskId, ReminderCreate(remindAt = isoUtc))
                        refresh()
                    }
                }
            },
        )
    }

    if (showDeleteConfirm && taskRef != null) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Borrar tarea") },
            text = {
                Text(
                    "Esta acción es permanente y se llevará por delante las " +
                        "subtareas, recordatorios y adjuntos. Para conservar el " +
                        "historial usa \"Archivar\" en su lugar."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteConfirm = false
                    scope.launch {
                        runCatching {
                            ApiClient.create(config.apiUrl, config.token)
                                .deleteTask(taskRef.id)
                        }
                        onBack()
                    }
                }) {
                    Text(
                        "Borrar definitivamente",
                        color = MaterialTheme.colorScheme.error
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancelar") }
            },
        )
    }
    if (showMoveSheet && taskRef != null) {
        val candidates = allBoards.filter { it.id != taskRef.boardId }
        AlertDialog(
            onDismissRequest = { showMoveSheet = false },
            title = { Text("Mover a otro tablero") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (candidates.isEmpty()) {
                        Text(
                            "No hay otros tableros disponibles.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        candidates.forEach { board ->
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable {
                                        showMoveSheet = false
                                        scope.launch {
                                            runCatching {
                                                val api = ApiClient.create(
                                                    config.apiUrl, config.token
                                                )
                                                val detail = api.getBoard(board.id)
                                                val firstCol = detail.columns.firstOrNull()
                                                    ?: return@runCatching
                                                api.moveTaskToBoard(
                                                    taskRef.id,
                                                    MoveTaskRequest(
                                                        boardId = board.id,
                                                        columnId = firstCol.id,
                                                    ),
                                                )
                                                onBack()
                                            }
                                        }
                                    }
                                    .padding(vertical = 10.dp, horizontal = 8.dp),
                            ) {
                                Text("${board.icon ?: "📁"}  ${board.name}")
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showMoveSheet = false }) { Text("Cancelar") }
            },
        )
    }
}

/** Backend stores reminders naive-UTC and serialises with a 'Z' suffix.
 *  This converts it back to the user's local zone for display. Falls
 *  back to the truncated string if parsing fails so a malformed value
 *  doesn't crash the detail view. */
private fun formatReminderLocal(iso: String): String = try {
    val instant = java.time.Instant.parse(iso)
    val local = instant.atZone(java.time.ZoneId.systemDefault())
    local.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
} catch (_: Exception) {
    iso.replace('T', ' ').take(16)
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column {
        Text(
            title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(6.dp))
        content()
    }
}

