pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // compose-markdown (jeziellago/compose-markdown) is published
        // through JitPack — no Maven Central artifact.
        maven { url = uri("https://jitpack.io") }
    }
}

rootProject.name = "Alfred"
include(":app")
