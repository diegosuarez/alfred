package es.tcdn.diego.alfred.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import es.tcdn.diego.alfred.data.Contact

/** Single-select contact dropdown: trigger Row + dialog with search +
 *  list. Favorites (and the "Yo mismo" self contact) bubble to the top. */
@Composable
fun ContactDropdown(
    label: String,
    contacts: List<Contact>,
    selectedId: Int?,
    onPick: (Int?) -> Unit,
    apiUrl: String,
    token: String?,
    allowClear: Boolean = true,
) {
    var open by remember { mutableStateOf(false) }
    val current = contacts.firstOrNull { it.id == selectedId }

    DropdownTrigger(
        labelWhenEmpty = "Nadie",
        avatarUrl = current?.imageUrl,
        text = current?.name,
        apiUrl = apiUrl,
        token = token,
        onClick = { open = true },
    )

    if (open) {
        ContactSearchDialog(
            title = label,
            contacts = contacts,
            selectedIds = setOfNotNull(selectedId),
            onDismiss = { open = false },
            onPick = { ids ->
                onPick(ids.firstOrNull())
                open = false
            },
            multi = false,
            apiUrl = apiUrl,
            token = token,
            allowClear = allowClear,
        )
    }
}

/** Multi-select counterpart: trigger summarises selections inline; the
 *  dialog supports check-all/clear-all via search. */
@Composable
fun ContactMultiDropdown(
    label: String,
    contacts: List<Contact>,
    selectedIds: Set<Int>,
    onChange: (Set<Int>) -> Unit,
    apiUrl: String,
    token: String?,
) {
    var open by remember { mutableStateOf(false) }
    val summary = when {
        selectedIds.isEmpty() -> null
        selectedIds.size == 1 -> contacts.firstOrNull { it.id in selectedIds }?.name
        else -> "${selectedIds.size} personas"
    }

    DropdownTrigger(
        labelWhenEmpty = "Nadie",
        avatarUrl = contacts.firstOrNull { it.id in selectedIds }?.imageUrl,
        text = summary,
        apiUrl = apiUrl,
        token = token,
        onClick = { open = true },
    )

    if (open) {
        ContactSearchDialog(
            title = label,
            contacts = contacts,
            selectedIds = selectedIds,
            onDismiss = { open = false },
            onPick = { ids ->
                onChange(ids)
                open = false
            },
            multi = true,
            apiUrl = apiUrl,
            token = token,
            allowClear = true,
        )
    }
}

@Composable
private fun DropdownTrigger(
    labelWhenEmpty: String,
    avatarUrl: String?,
    text: String?,
    apiUrl: String,
    token: String?,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (avatarUrl != null) {
            AsyncImage(
                model = absUrl(apiUrl, avatarUrl, token),
                contentDescription = null,
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape),
            )
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text ?: labelWhenEmpty,
            color = if (text == null) MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.weight(1f))
        Text("▾", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ContactSearchDialog(
    title: String,
    contacts: List<Contact>,
    selectedIds: Set<Int>,
    onDismiss: () -> Unit,
    onPick: (Set<Int>) -> Unit,
    multi: Boolean,
    apiUrl: String,
    token: String?,
    allowClear: Boolean,
) {
    var query by remember { mutableStateOf("") }
    var draft by remember { mutableStateOf(selectedIds) }

    // Sort: self first, then favorites, then alphabetical. Search is
    // a plain case-insensitive substring on name / email.
    val sorted = remember(contacts) {
        contacts.sortedWith(
            compareByDescending<Contact> { it.isSelf }
                .thenByDescending { it.isFavorite }
                .thenBy { it.name.lowercase() }
        )
    }
    val filtered = remember(query, sorted) {
        if (query.isBlank()) sorted
        else {
            val q = query.trim().lowercase()
            sorted.filter {
                it.name.lowercase().contains(q) ||
                    (it.email?.lowercase()?.contains(q) ?: false)
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    placeholder = { Text("Buscar contacto…") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                LazyColumn(
                    modifier = Modifier
                        .heightIn(min = 240.dp, max = 480.dp)
                        .fillMaxHeight(),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    items(filtered, key = { it.id }) { c ->
                        val on = c.id in draft
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable {
                                    draft = when {
                                        !multi -> setOf(c.id)
                                        on -> draft - c.id
                                        else -> draft + c.id
                                    }
                                    if (!multi) onPick(draft)
                                }
                                .background(
                                    if (on) MaterialTheme.colorScheme.primary
                                        .copy(alpha = 0.12f)
                                    else Color.Transparent
                                )
                                .padding(horizontal = 8.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (multi) {
                                Checkbox(
                                    checked = on,
                                    onCheckedChange = null, // row handles it
                                )
                                Spacer(Modifier.width(4.dp))
                            }
                            if (c.imageUrl != null) {
                                AsyncImage(
                                    model = absUrl(apiUrl, c.imageUrl, token),
                                    contentDescription = null,
                                    modifier = Modifier.size(28.dp).clip(CircleShape),
                                )
                            } else {
                                Box(
                                    Modifier
                                        .size(28.dp)
                                        .clip(CircleShape)
                                        .background(Color.White.copy(alpha = 0.08f)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        c.name.firstOrNull()?.uppercase() ?: "?",
                                        style = MaterialTheme.typography.labelSmall,
                                    )
                                }
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        c.name,
                                        style = MaterialTheme.typography.bodyLarge,
                                    )
                                    if (c.isFavorite || c.isSelf) {
                                        Spacer(Modifier.width(6.dp))
                                        Icon(
                                            Icons.Default.Star,
                                            null,
                                            tint = Color(0xFFFBBF24),
                                            modifier = Modifier.size(12.dp),
                                        )
                                    }
                                }
                                c.email?.takeIf { it.isNotBlank() }?.let {
                                    Text(
                                        it,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (multi) {
                TextButton(onClick = { onPick(draft) }) { Text("Aplicar") }
            } else if (allowClear) {
                TextButton(onClick = { onPick(emptySet()) }) { Text("Quitar") }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        },
    )
}

/** Used by AsyncImage too — copied from TasksScreen to keep this self-
 *  contained. Token is appended as a query param to bypass header auth
 *  when Coil does the fetch. */
internal fun absUrl(apiUrl: String, path: String, token: String?): String {
    val base = apiUrl.trimEnd('/')
    val rel = if (path.startsWith("/")) path else "/$path"
    val full = "$base$rel"
    return if (token != null) "$full?token=$token" else full
}
