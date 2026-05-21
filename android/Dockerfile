# Container that produces a debug APK of the Alfred Android client.
#
# Usage from the repo root:
#   docker build -f android/Dockerfile -t alfred-android-build android/
#   docker run --rm -v "$PWD/android:/work" alfred-android-build
#
# The build artefact lands at android/app/build/outputs/apk/debug/app-debug.apk.
FROM eclipse-temurin:17-jdk-jammy

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_HOME=/opt/android-sdk \
    PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/gradle/bin:$PATH

# Base utilities. zip/unzip needed for the SDK installer.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl unzip git \
    && rm -rf /var/lib/apt/lists/*

# Android command-line tools (the rest of the SDK gets pulled via sdkmanager).
ARG CMDLINE_TOOLS_VERSION=11076708
RUN mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools" \
    && curl -fsSL -o /tmp/cmdline-tools.zip \
        "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip" \
    && unzip -q /tmp/cmdline-tools.zip -d "$ANDROID_SDK_ROOT/cmdline-tools" \
    && mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest" \
    && rm /tmp/cmdline-tools.zip

# Accept licences once and install the bits AGP 8.7 needs. We install
# both build-tools 34 and 35 because some transitive AGP tasks still
# pin 34 even when the project targets SDK 35.
RUN yes | sdkmanager --licenses >/dev/null \
    && sdkmanager --install \
        "platform-tools" \
        "platforms;android-35" \
        "build-tools;35.0.0" \
        "build-tools;34.0.0" \
        >/dev/null \
    && chmod -R 0777 "$ANDROID_SDK_ROOT"

# Gradle distribution that matches gradle/wrapper/gradle-wrapper.properties.
ARG GRADLE_VERSION=8.11.1
RUN curl -fsSL -o /tmp/gradle.zip \
        "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
    && unzip -q /tmp/gradle.zip -d /opt \
    && mv "/opt/gradle-${GRADLE_VERSION}" /opt/gradle \
    && rm /tmp/gradle.zip

WORKDIR /work

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as a non-root user so the produced artefacts stay writable on the
# host bind-mount; the user's uid/gid is picked up via --user at runtime.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["assembleDebug"]
