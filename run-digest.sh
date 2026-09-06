#!/bin/bash
osascript -e '
tell application "Hyper" to activate
tell application "System Events"
  keystroke "cd /Users/candice/DEV/obsidian-scripts && /Users/candice/.nvm/versions/node/v24.11.1/bin/node index.js > /Users/candice/DEV/obsidian-scripts/logs/dock-debug.log 2>&1"
  key code 36
end tell
'
