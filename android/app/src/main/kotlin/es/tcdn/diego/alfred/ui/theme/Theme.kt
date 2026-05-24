package es.tcdn.diego.alfred.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Layered surface tones: gives elements depth without relying on hairline
// borders alone — closer to Things / TickTick / Linear's vibe.
internal val AlfredBackground = Color(0xFF0A0D14)
internal val AlfredSurface = Color(0xFF131822)
internal val AlfredSurfaceVariant = Color(0xFF1B2230)
internal val AlfredSurfaceHigh = Color(0xFF252D3D)

private val AlfredPrimary = Color(0xFF818CF8)        // indigo-400
private val AlfredPrimaryDim = Color(0xFF6366F1)     // indigo-500
private val AlfredOnSurface = Color(0xFFE5E7EB)
private val AlfredMuted = Color(0xFF8A93A3)

private val DarkScheme = darkColorScheme(
    primary = AlfredPrimary,
    onPrimary = Color(0xFF0B1020),
    primaryContainer = Color(0xFF1F2547),
    onPrimaryContainer = Color(0xFFCBD2FF),
    secondary = AlfredPrimaryDim,
    background = AlfredBackground,
    onBackground = AlfredOnSurface,
    surface = AlfredSurface,
    onSurface = AlfredOnSurface,
    surfaceVariant = AlfredSurfaceVariant,
    onSurfaceVariant = AlfredMuted,
    surfaceContainerHigh = AlfredSurfaceHigh,
    error = Color(0xFFF87171),
    outline = Color(0x33FFFFFF),
    outlineVariant = Color(0x1AFFFFFF),
)

private val LightScheme = lightColorScheme(
    primary = AlfredPrimaryDim,
    onPrimary = Color.White,
    secondary = AlfredPrimary,
)

@Composable
fun AlfredTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkScheme else LightScheme
    MaterialTheme(
        colorScheme = colors,
        typography = AlfredTypography,
        content = content,
    )
}
