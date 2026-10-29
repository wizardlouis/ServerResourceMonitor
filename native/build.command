#!/bin/zsh
set -e
cd -- "${0:A:h}/.."
APP="$PWD/服务器资源监控器.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc native/Monitor.swift native/CoreGrouping.swift native/GPUName.swift native/ServerColumn.swift -parse-as-library -O -o "$APP/Contents/MacOS/ServerMonitor" -framework SwiftUI -framework AppKit
cp collector.py "$APP/Contents/Resources/"
printf '{"servers": []}\n' > "$APP/Contents/Resources/servers.json"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ServerMonitor</string>
<key>CFBundleIdentifier</key><string>local.shen.ServerResourceMonitor</string>
<key>CFBundleName</key><string>服务器资源监控器</string>
<key>CFBundleDisplayName</key><string>服务器资源监控器</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.6.0</string>
<key>CFBundleVersion</key><string>7</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
cp native/AppIcon.icns "$APP/Contents/Resources/"
/usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP"
