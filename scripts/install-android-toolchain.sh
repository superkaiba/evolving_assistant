#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$ROOT_DIR/.tools"
SDK_DIR="$ROOT_DIR/.android-sdk"
GRADLE_VERSION="8.11.1"
CMDLINE_ZIP="$TOOLS_DIR/commandlinetools-linux.zip"
GRADLE_ZIP="$TOOLS_DIR/gradle-$GRADLE_VERSION-bin.zip"

mkdir -p "$TOOLS_DIR" "$SDK_DIR/cmdline-tools"

if ! command -v java >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y openjdk-17-jdk
  else
    echo "A JDK is required and sudo is not available."
    exit 2
  fi
fi

if [[ ! -d "$SDK_DIR/cmdline-tools/latest" ]]; then
  curl -L "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o "$CMDLINE_ZIP"
  rm -rf "$SDK_DIR/cmdline-tools/cmdline-tools"
  unzip -q "$CMDLINE_ZIP" -d "$SDK_DIR/cmdline-tools"
  mv "$SDK_DIR/cmdline-tools/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
fi

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
SDKMANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"

set +o pipefail
yes | "$SDKMANAGER" --licenses >/dev/null
set -o pipefail
"$SDKMANAGER" \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0"

if [[ ! -x "$TOOLS_DIR/gradle-$GRADLE_VERSION/bin/gradle" ]]; then
  curl -L "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" -o "$GRADLE_ZIP"
  unzip -q "$GRADLE_ZIP" -d "$TOOLS_DIR"
fi

echo "Android toolchain ready:"
echo "  ANDROID_HOME=$SDK_DIR"
echo "  Gradle=$TOOLS_DIR/gradle-$GRADLE_VERSION/bin/gradle"
