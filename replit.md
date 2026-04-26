# Workspace

## Overview

pnpm workspace monorepo. Hosts an Arabic-language Discord bot plus the default API server / mockup-sandbox artifacts that ship with the template.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9 (template artifacts)

## Packages

- `discord-bot/` — Arabic Discord AI bot (discord.js v14 + Gemini Flash 2.5)
- `artifacts/api-server` — template Express 5 API
- `artifacts/mockup-sandbox` — template Vite design sandbox

## Discord bot (`discord-bot/`)

- Entry: `index.js` → `src/client.js` (logs in) → `src/handler.js` (message routing).
- AI: `src/ai.js` — calls Gemini REST API directly, rotates across `GEMINI_API_KEY_1..10`.
  - `ask()` returns a JSON action plan (admin / chat mode).
  - `askVoice()` returns plain short Arabic text for voice replies.
- Commands: `src/commands.js` — `executeActions()` dispatches AI-emitted actions (channels, roles, embeds, polls, quizzes, giveaways, server admin). Music/YouTube playback was removed.
- **Voice chat**: `src/voice.js`
  - `!join` → bot joins the user's voice channel via `@discordjs/voice`.
  - Captures Opus from `connection.receiver.subscribe()` (ends after 1.2s of silence).
  - Decodes Opus→PCM with `prism-media`, then ffmpeg converts to 16 kHz mono WAV in `/tmp`.
  - Transcribes locally with `nodejs-whisper` (model `tiny`, no API).
  - Sends transcribed text to Gemini via `askVoice()` (concise Arabic reply).
  - TTS via Google Translate unofficial endpoint (`translate_tts`), plays MP3 chunks back through `createAudioPlayer`.
  - `!leave` destroys the voice connection.
  - The `!join`/`!leave` commands are intercepted directly in `handler.js` (they bypass the AI loop).
- Memory: `src/memory.js` persists per-user chat history to `data/memory.json`.
- Audit: `src/audit.js` + `src/auditStore.js` mirror admin actions to a configurable channel.

## Required secrets

- `DISCORD_TOKEN` — bot token.
- `GEMINI_API_KEY_1` … `GEMINI_API_KEY_10` — at least one; all are rotated on quota errors.
- `SESSION_SECRET` — used by template artifacts.

## Native deps & build notes

- `opusscript` is used as the Opus encoder/decoder fallback (pure JS) because `@discordjs/opus` would not build cleanly in this environment.
- `sodium-native`, `ffmpeg-static`, `prism-media` are listed in `pnpm-workspace.yaml` `onlyBuiltDependencies`.
- System deps installed: `cmake`, `gnumake`, `gcc`, `python-3.11` (needed by `node-gyp` and `nodejs-whisper`'s whisper.cpp build).
- `nodejs-whisper` lazy-builds whisper.cpp and downloads the `tiny` model on first transcription (cached under `node_modules/nodejs-whisper/cpp/whisper.cpp/`).

## Key commands

- Discord bot is run by the `Discord Bot` workflow: `pnpm --filter @workspace/discord-bot run start`.
- Restart the workflow after editing bot code.

See the `pnpm-workspace` skill for general workspace structure.
