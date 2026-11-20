#!/bin/sh
# Stop the 4gbVramStrata server this project runs and the engine it started, then free the card.
#
# Written for the desktop shortcut "Gemma — остановить": the launcher opens its own terminal with the model window,
# and closing that window is not always possible (a detached start, or a window that lost its terminal). This finds
# the server and the engine by name, tells them to stop the way Ctrl+C does, and kills only what is left.
#
# It stops ANY 4gbVramStrata server of this folder, not only Gemma: Clover, Gemma and a 64K copy all share one card
# and the same launcher pattern, and only one can run at a time.
cd "/home/ilia/Документы/OpenCode/4gbVramStrata" || exit 1
HERE="/home/ilia/Документы/OpenCode/4gbVramStrata"

found=0
for pid in $(pgrep -f "$HERE/serve/server.py" 2>/dev/null); do
  found=1
  echo "stopping server $pid ..."
  kill -TERM "$pid" 2>/dev/null
done

# The server stops its engine itself; give it a moment, then end an engine it outlived (a SIGKILLed server leaves one).
for _ in 1 2 3 4 5 6 7 8 9 10; do
  pgrep -f "$HERE/serve/server.py" >/dev/null 2>&1 || break
  sleep 1
done

for pid in $(pgrep -f "$HERE/engine-fourgbvram/strata-fourgbvram" 2>/dev/null); do
  found=1
  echo "stopping engine $pid ..."
  kill -TERM "$pid" 2>/dev/null
done

sleep 2
for pid in $(pgrep -f "$HERE/engine-fourgbvram/strata-fourgbvram" 2>/dev/null); do
  echo "engine $pid did not stop: killing it"
  kill -KILL "$pid" 2>/dev/null
done

if [ "$found" = 0 ]; then
  echo "Nothing to stop: no 4gbVramStrata server is running."
else
  echo "Stopped."
fi

# Say what is left, so the card's state is known without another tool.
if command -v nvidia-smi >/dev/null 2>&1; then
  echo "VRAM in use now: $(nvidia-smi --query-gpu=memory.used --format=csv,noheader 2>/dev/null)"
fi
