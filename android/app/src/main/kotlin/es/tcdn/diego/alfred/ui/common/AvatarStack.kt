package es.tcdn.diego.alfred.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import es.tcdn.diego.alfred.data.Contact

/** A row of overlapping circular avatars (cap N). Mirrors the assignee
 *  cluster the web uses at the bottom-right of each task card. */
@Composable
fun AvatarStack(
    contacts: List<Contact>,
    apiUrl: String,
    token: String?,
    size: Int = 22,
    maxVisible: Int = 3,
) {
    if (contacts.isEmpty()) return
    val visible = contacts.take(maxVisible)
    val overflow = (contacts.size - maxVisible).coerceAtLeast(0)
    Row {
        visible.forEachIndexed { i, contact ->
            val offsetX = if (i == 0) 0 else -6 * i
            Box(
                Modifier
                    .offset(x = offsetX.dp)
                    .size(size.dp)
                    .clip(CircleShape)
                    .border(
                        1.5.dp,
                        MaterialTheme.colorScheme.surface,
                        CircleShape,
                    )
                    .background(Color.White.copy(alpha = 0.08f)),
                contentAlignment = Alignment.Center,
            ) {
                if (contact.imageUrl != null) {
                    AsyncImage(
                        model = absUrl(apiUrl, contact.imageUrl, token),
                        contentDescription = contact.name,
                        modifier = Modifier.size(size.dp).clip(CircleShape),
                    )
                } else {
                    Text(
                        contact.name.firstOrNull()?.uppercase() ?: "?",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (overflow > 0) {
            Box(
                Modifier
                    .offset(x = (-6 * visible.size).dp)
                    .size(size.dp)
                    .clip(CircleShape)
                    .border(
                        1.5.dp,
                        MaterialTheme.colorScheme.surface,
                        CircleShape,
                    )
                    .background(Color.White.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "+$overflow",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}
