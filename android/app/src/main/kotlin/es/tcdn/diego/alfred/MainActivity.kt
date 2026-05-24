package es.tcdn.diego.alfred

import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.FragmentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import es.tcdn.diego.alfred.data.SettingsRepository
import es.tcdn.diego.alfred.push.PushSubscriber
import es.tcdn.diego.alfred.ui.nav.AlfredNavHost
import es.tcdn.diego.alfred.ui.theme.AlfredTheme
import kotlinx.coroutines.launch

// FragmentActivity (vs the simpler ComponentActivity) is required by
// androidx.biometric so the biometric prompt can be hosted in the
// activity's FragmentManager.
class MainActivity : FragmentActivity() {

    // Request POST_NOTIFICATIONS on Android 13+. Result is ignored —
    // PushSubscriber still registers regardless and FCM will deliver
    // silently if the user denies it.
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* no-op */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermissionLauncher.launch(
                android.Manifest.permission.POST_NOTIFICATIONS
            )
        }

        val settings = SettingsRepository(applicationContext)

        setContent {
            AlfredTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val cfg by settings.config.collectAsState(initial = null)
                    AlfredNavHost(
                        config = cfg,
                        settings = settings,
                        onSignedIn = {
                            // Refresh the FCM token registration with the
                            // backend whenever the user (re)authenticates.
                            lifecycleScope.launch {
                                PushSubscriber(applicationContext, settings)
                                    .registerCurrentToken()
                            }
                        },
                    )
                }
            }
        }
    }
}
