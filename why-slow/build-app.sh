#!/bin/sh
# Builds "Why Slow.app": the SwiftUI window plus the Go engine it runs.
# Usage: ./build-app.sh            build into build/
#        ./build-app.sh --install  also copy it to ~/Applications
#        ./build-app.sh --zip      also make build/Why Slow.zip to send to someone
#        (both flags together do both)
# The app is universal: one download runs on both Apple Silicon and Intel Macs.
set -eu
cd "$(dirname "$0")"

install=no zip=no
for arg in "$@"; do
	case "$arg" in
	--install) install=yes ;;
	--zip) zip=yes ;;
	*) echo "unknown option: $arg" >&2; exit 2 ;;
	esac
done

APP="build/Why Slow.app"
rm -rf "$APP" build/AppIcon.iconset build/arch "build/Why Slow.zip"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/arch

for arch in arm64 x86_64; do
	goarch=$arch
	[ "$arch" = x86_64 ] && goarch=amd64
	echo "building engine (Go, $arch)…"
	GOOS=darwin GOARCH=$goarch go build -o "build/arch/why-slow-$arch" .
	echo "building window (Swift, $arch)…"
	swiftc -O -swift-version 5 -parse-as-library -target "$arch-apple-macos14" \
		app/*.swift -o "build/arch/WhySlow-$arch"
done
lipo -create build/arch/why-slow-arm64 build/arch/why-slow-x86_64 -output "$APP/Contents/Resources/why-slow"
lipo -create build/arch/WhySlow-arm64 build/arch/WhySlow-x86_64 -output "$APP/Contents/MacOS/Why Slow"
rm -rf build/arch
cp app/Info.plist "$APP/Contents/Info.plist"

echo "drawing icon…"
swift scripts/make-icon.swift build/AppIcon.iconset
iconutil -c icns build/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"

# Ad-hoc signature: enough for macOS to run an app you built yourself.
codesign --force --deep --sign - "$APP"
echo "built $APP"

if [ "$install" = yes ]; then
	mkdir -p "$HOME/Applications"
	rm -rf "$HOME/Applications/Why Slow.app"
	cp -R "$APP" "$HOME/Applications/"
	echo "installed to ~/Applications/Why Slow.app"
fi

if [ "$zip" = yes ]; then
	# ditto keeps the signature and bundle metadata intact, unlike plain zip.
	ditto -c -k --keepParent "$APP" "build/Why Slow.zip"
	echo "zipped build/Why Slow.zip ($(du -h "build/Why Slow.zip" | cut -f1))"
fi
