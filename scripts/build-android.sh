#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
LOCAL_SDK="$ROOT_DIR/.android-sdk"
LOCAL_GRADLE="$ROOT_DIR/.tools/gradle-8.11.1/bin/gradle"

if ! command -v java >/dev/null 2>&1; then
  echo "Java runtime is required to build the Android APK. Install a JDK and rerun npm run android:build."
  exit 2
fi

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" && -d "$LOCAL_SDK" ]]; then
  export ANDROID_HOME="$LOCAL_SDK"
  export ANDROID_SDK_ROOT="$LOCAL_SDK"
fi

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "ANDROID_HOME or ANDROID_SDK_ROOT must point to an Android SDK before building the APK."
  exit 2
fi

KEYSTORE="$ANDROID_DIR/app/debug-release.keystore"
if [[ ! -f "$KEYSTORE" ]]; then
  if ! command -v keytool >/dev/null 2>&1; then
    echo "keytool is required to create the release signing keystore."
    exit 2
  fi
  keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -storepass selfevolving \
    -keypass selfevolving \
    -alias selfevolving \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Self Evolving Assistant, OU=Local MVP, O=Self Evolving Assistant, L=Local, ST=Local, C=US" >/dev/null
fi

cd "$ANDROID_DIR"

if [[ -x ./gradlew ]]; then
  ./gradlew assembleRelease
elif [[ -x "$LOCAL_GRADLE" ]]; then
  "$LOCAL_GRADLE" assembleRelease
elif command -v gradle >/dev/null 2>&1; then
  gradle assembleRelease
else
  echo "Gradle or a Gradle wrapper is required. Install Gradle or add a wrapper to android/."
  exit 2
fi

APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK" ]]; then
  echo "Android build completed without producing $APK"
  exit 1
fi

echo "$APK"
