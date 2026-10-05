#!/usr/bin/env bash
# One-shot installer for the yt-dlp companion engine (venv in ~/.ytvenv, found automatically).
set -euo pipefail
VENV="$HOME/.ytvenv"
PYTHON="$(command -v python3 || command -v python)"
"$PYTHON" -m venv "$VENV"
if [ -x "$VENV/bin/pip" ]; then
  PIP="$VENV/bin/pip"
  YTDLP="$VENV/bin/yt-dlp"
else
  PIP="$VENV/Scripts/pip.exe"
  YTDLP="$VENV/Scripts/yt-dlp.exe"
fi
"$PIP" install -q -U "yt-dlp[default]" imageio-ffmpeg
echo "yt-dlp $("$YTDLP" --version) installed (ffmpeg bundled via imageio-ffmpeg)."
echo "Keep it fresh any time with:  $PIP install -U yt-dlp"
