package es.tcdn.diego.alfred.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Background gradient applied to every screen. Soft radial-ish blend
 *  from the deep "outer space" navy to the accent indigo, with an
 *  optional tint hex (from the active context) overlaid on top. */
@Composable
fun screenBackground(contextColorHex: String? = null): Brush {
    val tint = contextColorHex?.parseHex()
    val base = listOf(Color(0xFF0B0E14), Color(0xFF1A1E2A), Color(0xFF0B0E14))
    return if (tint != null) {
        Brush.verticalGradient(
            colors = listOf(
                lerp(Color(0xFF0B0E14), tint, 0.18f),
                Color(0xFF131822),
                lerp(Color(0xFF0B0E14), tint, 0.10f),
            ),
        )
    } else {
        Brush.verticalGradient(colors = base)
    }
}

/** Glassmorphic-ish surface — semi-translucent fill + 1 px hairline +
 *  subtle drop shadow for depth. Compose lacks backdrop blur out of the
 *  box; this approximation lands close to the web's vibe without
 *  expensive RenderEffect on every frame. */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    tint: Color = Color.Transparent,
    cornerRadius: Int = 16,
    contentPadding: Int = 16,
    elevated: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(cornerRadius.dp)
    val baseFill = Color.White.copy(alpha = 0.045f)
    val blended = if (tint == Color.Transparent) baseFill else tint
    var m: Modifier = modifier
    if (elevated) {
        // Compose's shadow modifier is GPU-cheap and gives just enough
        // lift to separate cards from the gradient background without
        // looking like a Material 1 dropshadow.
        m = m.shadow(elevation = 6.dp, shape = shape, ambientColor = Color.Black, spotColor = Color.Black)
    }
    Box(
        modifier = m
            .clip(shape)
            .background(blended)
            .border(1.dp, Color.White.copy(alpha = 0.06f), shape)
            .padding(contentPadding.dp),
        content = content,
    )
}

/** Card background tint per priority (matches the web app). */
fun priorityTint(priority: String): Color = when (priority) {
    "high" -> Color(0xFFEF4444).copy(alpha = 0.15f)
    "low" -> Color(0xFF3B82F6).copy(alpha = 0.13f)
    else -> Color.Transparent
}

fun priorityAccent(priority: String): Color = when (priority) {
    "high" -> Color(0xFFEF4444)
    "low" -> Color(0xFF3B82F6)
    else -> Color(0xFF9CA3AF)
}

/** Parse a #RRGGBB / #RGB / RRGGBB hex into a Compose Color, or null. */
fun String.parseHex(): Color? {
    val s = trim().removePrefix("#")
    return try {
        when (s.length) {
            6 -> Color(("ff$s").toLong(16))
            8 -> Color(s.toLong(16))
            3 -> Color(("ff" + s.map { "$it$it" }.joinToString("")).toLong(16))
            else -> null
        }
    } catch (_: NumberFormatException) {
        null
    }
}

private fun lerp(a: Color, b: Color, t: Float): Color = Color(
    red = a.red + (b.red - a.red) * t,
    green = a.green + (b.green - a.green) * t,
    blue = a.blue + (b.blue - a.blue) * t,
    alpha = a.alpha + (b.alpha - a.alpha) * t,
)
