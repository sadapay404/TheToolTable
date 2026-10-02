#!/usr/bin/env bash
# One-shot installer for the yt-dlp companion engine (venv in ~/.ytvenv, found automatically).
set -e
python3 -m venv "$HOME/.ytvenv"
"$HOME/.ytvenv/bin/pip" install -q -U "yt-dlp[default]" imageio-ffmpeg
echo "yt-dlp $("$HOME/.ytvenv/bin/yt-dlp" --version) installed (ffmpeg bundled via imageio-ffmpeg)."
echo "Keep it fresh any time with:  $HOME/.ytvenv/bin/pip install -U yt-dlp"
