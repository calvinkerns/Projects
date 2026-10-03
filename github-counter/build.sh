#!/bin/sh
# Builds GitHubCounter.app next to this script.
set -e
cd "$(dirname "$0")"
APP=GitHubCounter.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
swiftc -O main.swift -o "$APP/Contents/MacOS/GitHubCounter"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>GitHubCounter</string>
  <key>CFBundleIdentifier</key><string>local.githubcounter</string>
  <key>CFBundleExecutable</key><string>GitHubCounter</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
EOF
echo "Built $APP"
