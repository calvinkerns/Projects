#!/bin/sh
# Builds "Why Slow.app": the SwiftUI window plus the Go engine it runs.
# Usage: ./build-app.sh            build into build/
#        ./build-app.sh --install  also copy it to ~/Applications
set -eu
cd "$(dirname "$0")"

APP="build/Why Slow.app"
rm -rf "$APP" build/AppIcon.iconset
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "building engine (Go)…"
go build -o "$APP/Contents/Resources/why-slow" .

echo "building window (Swift)…"
swiftc -O -swift-version 5 -parse-as-library -target "$(uname -m)-apple-macos14" \
	app/*.swift -o "$APP/Contents/MacOS/Why Slow"
cp app/Info.plist "$APP/Contents/Info.plist"

echo "drawing icon…"
swift scripts/make-icon.swift build/AppIcon.iconset
iconutil -c icns build/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"

# Ad-hoc signature: enough for macOS to run an app you built yourself.
codesign --force --deep --sign - "$APP"
echo "built $APP"

if [ "${1:-}" = "--install" ]; then
	mkdir -p "$HOME/Applications"
	rm -rf "$HOME/Applications/Why Slow.app"
	cp -R "$APP" "$HOME/Applications/"
	echo "installed to ~/Applications/Why Slow.app"
fi
