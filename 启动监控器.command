#!/bin/zsh
cd -- "${0:A:h}"
if /usr/bin/curl -fsS http://127.0.0.1:8765/api/state >/dev/null 2>&1; then
  open http://127.0.0.1:8765
  exit 0
fi
(sleep 1; open http://127.0.0.1:8765) &
python3 server.py
