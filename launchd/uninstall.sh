#!/bin/bash
set -e

PLIST_NAME="com.fintax.x-monitor.plist"
DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

if [ ! -f "$DEST" ]; then
  echo "Not installed: $DEST"
  exit 0
fi

launchctl unload "$DEST"
rm -f "$DEST"
echo "Unloaded and removed: $DEST"
