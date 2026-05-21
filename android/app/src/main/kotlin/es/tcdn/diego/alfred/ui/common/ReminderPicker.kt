package es.tcdn.diego.alfred.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/** Pick "when to remind me" with quick presets + a free-form local
 *  datetime input that mirrors the CLI ("YYYY-MM-DD HH:MM"). The
 *  returned string is an ISO timestamp with explicit Z so the backend
 *  parser stays happy. */
@Composable
fun ReminderPickerDialog(
    onDismiss: () -> Unit,
    onPick: (isoUtc: String) -> Unit,
) {
    var custom by remember {
        // Seed the custom field with "now + 1h" in the local zone so the
        // user only has to tweak the part they care about.
        val seed = LocalDateTime.now().plusHours(1).withSecond(0).withNano(0)
        mutableStateOf(seed.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
    }
    var error by remember { mutableStateOf<String?>(null) }

    val presets = remember {
        listOf<Pair<String, () -> ZonedDateTime>>(
            "En 30 min" to { ZonedDateTime.now().plusMinutes(30) },
            "En 1 hora" to { ZonedDateTime.now().plusHours(1) },
            "En 3 horas" to { ZonedDateTime.now().plusHours(3) },
            "Mañana 09:00" to {
                ZonedDateTime.now()
                    .plusDays(1)
                    .withHour(9).withMinute(0).withSecond(0).withNano(0)
            },
            "En 1 semana" to { ZonedDateTime.now().plusWeeks(1) },
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("¿Cuándo te aviso?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                presets.forEach { (label, build) ->
                    OutlinedButton(
                        onClick = { onPick(toUtcIso(build())) },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(label) }
                }
                Spacer(Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                Text(
                    "Personalizado",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = custom,
                    onValueChange = { custom = it; error = null },
                    label = { Text("YYYY-MM-DD HH:MM (hora local)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    isError = error != null,
                    supportingText = { error?.let { Text(it) } },
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val parsed = parseLocalDateTime(custom)
                if (parsed == null) {
                    error = "Formato no válido"
                    return@TextButton
                }
                onPick(toUtcIso(parsed))
            }) { Text("Personalizado") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

private fun parseLocalDateTime(raw: String): ZonedDateTime? = try {
    val text = raw.trim().replace('T', ' ')
    val ldt = LocalDateTime.parse(
        text,
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
    )
    ldt.atZone(ZoneId.systemDefault())
} catch (_: Exception) {
    null
}

private fun toUtcIso(zdt: ZonedDateTime): String {
    val utc = zdt.withZoneSameInstant(ZoneId.of("UTC"))
    return utc.format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'"))
}
