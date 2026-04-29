#!/bin/bash
set -e

PLIST_NAME="com.fintax.x-monitor.plist"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

# Unload old plist if present, ignore errors
launchctl unload "$DEST" 2>/dev/null || true

cp "$SRC_DIR/$PLIST_NAME" "$DEST"
launchctl load "$DEST"

echo "Loaded: $DEST"
echo ""
echo "View status: launchctl list | grep com.fintax.x-monitor"
echo "View logs:   tail -f /Users/nightyoung/IdeaProjects/x-monitor/.pm2/logs/launchd.{out,err}.log"
echo "Uninstall:   $SRC_DIR/uninstall.sh"
