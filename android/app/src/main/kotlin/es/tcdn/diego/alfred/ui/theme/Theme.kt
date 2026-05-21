package es.tcdn.diego.alfred.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val AlfredPrimary = Color(0xFF6366F1)
private val AlfredPrimaryDim = Color(0xFF818CF8)
private val AlfredBackground = Color(0xFF0F1218)
private val AlfredSurface = Color(0xFF161B22)
private val AlfredSurfaceVariant = Color(0xFF1F2530)
private val AlfredOnSurface = Color(0xFFE6E8EC)
private val AlfredMuted = Color(0xFF9CA3AF)

private val DarkScheme = darkColorScheme(
    primary = AlfredPrimary,
    onPrimary = Color.White,
    secondary = AlfredPrimaryDim,
    background = AlfredBackground,
    onBackground = AlfredOnSurface,
    surface = AlfredSurface,
    onSurface = AlfredOnSurface,
    surfaceVariant = AlfredSurfaceVariant,
    onSurfaceVariant = AlfredMuted,
    error = Color(0xFFEF4444),
)

private val LightScheme = lightColorScheme(
    primary = AlfredPrimary,
    onPrimary = Color.White,
    secondary = AlfredPrimaryDim,
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
