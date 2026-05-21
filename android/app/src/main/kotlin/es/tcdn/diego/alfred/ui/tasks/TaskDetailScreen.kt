package es.tcdn.diego.alfred.ui.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import dev.jeziellago.compose.markdowntext.MarkdownText
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.Task
import es.tcdn.diego.alfred.data.TaskUpdate
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailScreen(
    config: AlfredConfig,
    taskId: Int,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var task by remember { mutableStateOf<Task?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var editingTitle by remember { mutableStateOf("") }
    var editingDescription by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(taskId) {
        loading = true
        try {
            // The board detail endpoint hydrates children; for a single
            // task we re-pull via update with no-op body to get the full
            // serialized view. Simpler than adding GET /tasks/{id}.
            val api = ApiClient.create(config.apiUrl, config.token)
            val fresh = api.updateTask(taskId, TaskUpdate())
            task = fresh
            editingTitle = fresh.title
            editingDescription = fresh.description ?: ""
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(task?.title ?: "Tarea") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
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
            Text(
                "Error: $error",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(padding).padding(16.dp),
            )
            return@Scaffold
        }
        val t = task ?: return@Scaffold

        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = editingTitle,
                onValueChange = { editingTitle = it },
                label = { Text("Título") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = editingDescription,
                onValueChange = { editingDescription = it },
                label = { Text("Descripción (Markdown)") },
                modifier = Modifier.fillMaxWidth().height(200.dp),
            )
            Button(
                onClick = {
                    scope.launch {
                        try {
                            val updated = ApiClient.create(config.apiUrl, config.token)
                                .updateTask(
                                    t.id,
                                    TaskUpdate(
                                        title = editingTitle,
                                        description = editingDescription,
                                    ),
                                )
                            task = updated
                        } catch (_: Exception) {}
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Guardar") }

            if (t.description != null && t.description.isNotBlank()) {
                Text("Vista previa", style = MaterialTheme.typography.labelSmall)
                Card(modifier = Modifier.fillMaxWidth()) {
                    MarkdownText(
                        markdown = t.description,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }

            val images = t.attachments.filter { it.isImage }
            if (images.isNotEmpty()) {
                Text("Adjuntos (imágenes)", style = MaterialTheme.typography.labelSmall)
                images.forEach { att ->
                    AsyncImage(
                        model = absUrl(config.apiUrl, att.url, config.token),
                        contentDescription = att.filename,
                        modifier = Modifier.fillMaxWidth().height(200.dp),
                    )
                }
            }
            val docs = t.attachments.filter { !it.isImage }
            if (docs.isNotEmpty()) {
                Text("Adjuntos (documentos)", style = MaterialTheme.typography.labelSmall)
                docs.forEach { att ->
                    Text("📄 ${att.filename}")
                }
            }
        }
    }
}

/** Coil needs an absolute URL. Backend returns "/api/attachments/N";
 * we prepend the API root. Auth is the Bearer header attached at the
 * OkHttp layer via Coil's default network engine (we configured it). */
private fun absUrl(apiUrl: String, path: String, token: String?): String {
    val base = apiUrl.trimEnd('/')
    val rel = if (path.startsWith("/")) path else "/$path"
    val full = "$base$rel"
    return if (token != null) "$full?token=$token" else full
}
