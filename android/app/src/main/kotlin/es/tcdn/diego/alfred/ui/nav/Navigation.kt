package es.tcdn.diego.alfred.ui.nav

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import es.tcdn.diego.alfred.auth.LoginScreen
import es.tcdn.diego.alfred.data.AlfredConfig
import es.tcdn.diego.alfred.data.SettingsRepository
import es.tcdn.diego.alfred.ui.boards.BoardsScreen
import es.tcdn.diego.alfred.ui.focus.FocusTimerScreen
import es.tcdn.diego.alfred.ui.profile.ProfileScreen
import es.tcdn.diego.alfred.ui.settings.SettingsScreen
import es.tcdn.diego.alfred.ui.stats.StatsScreen
import es.tcdn.diego.alfred.ui.tasks.TaskDetailScreen
import es.tcdn.diego.alfred.ui.tasks.TasksScreen
import java.net.URLDecoder
import java.net.URLEncoder

object Routes {
    const val LOGIN = "login"
    const val BOARDS = "boards"
    const val TASKS = "tasks/{boardId}"
    const val TASK_DETAIL = "task/{taskId}"
    const val SETTINGS = "settings"
    const val STATS = "stats"
    const val PROFILE = "profile"
    const val FOCUS = "focus/{taskId}/{title}"
}

@Composable
fun AlfredNavHost(
    config: AlfredConfig?,
    settings: SettingsRepository,
    onSignedIn: () -> Unit,
) {
    val nav = rememberNavController()
    if (config == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }
    val start = if (config.token.isNullOrBlank()) Routes.LOGIN else Routes.BOARDS

    NavHost(navController = nav, startDestination = start) {
        composable(Routes.LOGIN) {
            LoginScreen(
                config = config,
                settings = settings,
                onSignedIn = {
                    onSignedIn()
                    nav.navigate(Routes.BOARDS) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.BOARDS) {
            BoardsScreen(
                config = config,
                onPickBoard = { boardId -> nav.navigate("tasks/$boardId") },
                onOpenSettings = { nav.navigate(Routes.SETTINGS) },
                onOpenStats = { nav.navigate(Routes.STATS) },
                onOpenProfile = { nav.navigate(Routes.PROFILE) },
            )
        }
        composable(
            Routes.TASKS,
            arguments = listOf(navArgument("boardId") { type = NavType.IntType }),
        ) { entry ->
            val boardId = entry.arguments?.getInt("boardId") ?: return@composable
            TasksScreen(
                config = config,
                boardId = boardId,
                onBack = { nav.popBackStack() },
                onPickTask = { taskId -> nav.navigate("task/$taskId") },
            )
        }
        composable(
            Routes.TASK_DETAIL,
            arguments = listOf(navArgument("taskId") { type = NavType.IntType }),
        ) { entry ->
            val taskId = entry.arguments?.getInt("taskId") ?: return@composable
            TaskDetailScreen(
                config = config,
                taskId = taskId,
                onBack = { nav.popBackStack() },
                onLaunchFocus = { tid, title ->
                    val enc = URLEncoder.encode(title, "UTF-8")
                    nav.navigate("focus/$tid/$enc")
                },
            )
        }
        composable(
            Routes.FOCUS,
            arguments = listOf(
                navArgument("taskId") { type = NavType.IntType },
                navArgument("title") { type = NavType.StringType },
            ),
        ) { entry ->
            val taskId = entry.arguments?.getInt("taskId") ?: return@composable
            val rawTitle = entry.arguments?.getString("title") ?: ""
            FocusTimerScreen(
                config = config,
                taskId = taskId,
                taskTitle = URLDecoder.decode(rawTitle, "UTF-8"),
                onBack = { nav.popBackStack() },
            )
        }
        composable(Routes.STATS) {
            StatsScreen(config = config, onBack = { nav.popBackStack() })
        }
        composable(Routes.PROFILE) {
            ProfileScreen(config = config, onBack = { nav.popBackStack() })
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                config = config,
                settings = settings,
                onBack = { nav.popBackStack() },
                onSignedOut = { nav.navigate(Routes.LOGIN) { popUpTo(0) } },
            )
        }
    }
}
