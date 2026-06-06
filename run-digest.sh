#!/bin/bash
osascript -e '
tell application "Hyper" to activate
tell application "System Events"
  keystroke "cd /Users/candice/DEV/obsidian-scripts && /Users/candice/.nvm/versions/node/v24.11.1/bin/node index.js"
  key code 36
end tell
'
