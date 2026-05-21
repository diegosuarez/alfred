import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.gms.google-services")
}

// Per-host overrides live in local.properties (gitignored). Used to seed
// build-time constants like the Android OAuth client id (web client id
// actually — Google Sign-In for Android needs the *web* client id from
// the same Cloud project).
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "es.tcdn.diego.alfred"
    compileSdk = 35

    defaultConfig {
        applicationId = "es.tcdn.diego.alfred"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // Default API host. Override per-build via -PalfredApi=https://...
        // or via local.properties (alfred.apiUrl=...).
        val defaultApi = localProps.getProperty("alfred.apiUrl")
            ?: project.findProperty("alfredApi") as String?
            ?: "https://alfred.example.com"
        buildConfigField("String", "DEFAULT_API_URL", "\"$defaultApi\"")

        // Web OAuth client id of the Google project that backs the
        // Android sign-in. Pulled from local.properties; missing values
        // disable the Google button at runtime so the app still boots.
        val webClientId = localProps.getProperty("google.webClientId") ?: ""
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$webClientId\"")
    }

    // Persistent debug keystore at app/debug.keystore so the SHA-1 stays
    // stable across rebuilds (and across hosts when the container build
    // is used). Required when registering the Android client in Google
    // Cloud / Firebase.
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets["main"].kotlin.srcDir("src/main/kotlin")

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    // Material Components AAR — needed for the XML Theme.Material3.* parent
    // styles even when the rest of the UI lives in Compose.
    implementation("com.google.android.material:material:1.12.0")

    // Core Compose + Material 3.
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")

    // Coroutines.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Networking — Retrofit + OkHttp + kotlinx.serialization.
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Persistent settings (server URL, token).
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Image loading for attachment thumbnails / Google avatars.
    implementation("io.coil-kt.coil3:coil-compose:3.0.4")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.0.4")

    // Markdown renderer for task descriptions.
    implementation("com.github.jeziellago:compose-markdown:0.5.7")

    // Google Sign-In (Credential Manager flow).
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // Firebase Cloud Messaging.
    implementation(platform("com.google.firebase:firebase-bom:33.6.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
