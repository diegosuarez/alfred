package es.tcdn.diego.alfred.ui.focus

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.ApiClient
import es.tcdn.diego.alfred.data.FocusSessionCreate
import es.tcdn.diego.alfred.ui.common.GlassCard
import es.tcdn.diego.alfred.ui.common.screenBackground
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FocusTimerScreen(
    config: AlfredConfig,
    taskId: Int,
    taskTitle: String,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var durationMinutes by remember { mutableStateOf(25) }
    var remainingSeconds by remember { mutableStateOf(25 * 60) }
    var running by remember { mutableStateOf(false) }
    var finished by remember { mutableStateOf(false) }

    // Restart the countdown whenever the preset changes (but only when
    // we're idle — don't yank the rug out of an active session).
    LaunchedEffect(durationMinutes) {
        if (!running) {
            remainingSeconds = durationMinutes * 60
            finished = false
        }
    }

    LaunchedEffect(running) {
        if (!running) return@LaunchedEffect
        while (remainingSeconds > 0 && running) {
            delay(1000)
            remainingSeconds -= 1
        }
        if (remainingSeconds <= 0 && running) {
            running = false
            finished = true
            // Record the focus session on completion.
            scope.launch {
                runCatching {
                    ApiClient.create(config.apiUrl, config.token)
                        .createFocusSession(
                            FocusSessionCreate(
                                taskId = taskId,
                                duration = durationMinutes * 60,
                            )
                        )
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Foco") },
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
                .padding(24.dp)
                .fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                taskTitle,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Big circular countdown clock.
            Box(
                modifier = Modifier.size(220.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    progress = {
                        val total = durationMinutes * 60
                        if (total == 0) 0f else remainingSeconds / total.toFloat()
                    },
                    modifier = Modifier.size(220.dp),
                    strokeWidth = 8.dp,
                )
                Text(
                    text = formatClock(remainingSeconds),
                    fontSize = 56.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            // Preset row.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(15, 25, 50).forEach { mins ->
                    AssistChip(
                        onClick = { durationMinutes = mins },
                        label = { Text("${mins}m") },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = if (durationMinutes == mins)
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)
                            else Color.White.copy(alpha = 0.04f),
                        ),
                    )
                }
            }

            // Controls.
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = { running = !running },
                    enabled = remainingSeconds > 0,
                ) { Text(if (running) "Pausar" else "Iniciar") }
                OutlinedButton(
                    onClick = {
                        running = false
                        remainingSeconds = durationMinutes * 60
                        finished = false
                    },
                ) { Text("Reiniciar") }
            }

            if (finished) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        "Sesión guardada ✅",
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Spacer(Modifier.height(0.dp))
        }
    }
}

private fun formatClock(sec: Int): String {
    val m = sec / 60
    val s = sec % 60
    return "%02d:%02d".format(m, s)
}
