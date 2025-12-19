# Tauri + React

This template should help get you started developing with Tauri and React in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

# SpeechToText Tauri App

SpeechToText is a desktop application built with Tauri that enables real-time speech-to-text transcription directly on your machine. It leverages web technologies for the frontend and Rust for secure, efficient backend processing, ensuring privacy by keeping all audio data local.

## Tech Stack

- **Frontend**: Likely React/Vite or similar with Web Speech API for recognition.[3]
- **Backend**: Tauri (Rust) for system audio access and app bundling.[6]
- **Dependencies**: Standard Tauri setup with potential Whisper.cpp integration for advanced offline STT.[5]

## Quick Start

1. Clone the repo: `git clone https://github.com/praveen030703/SpeechToText.git`
2. Navigate to tauri-app: `cd tauri-app`
3. Install dependencies: `npm install`
4. Get Deepgram API key from : `https://deepgram.com`
5. Create .env file : `DEEPGRAM_API_KEY : your API key`
6. Run dev server: `npm run tauri dev`
7. Build for production: `npm run tauri build`

Ensure Tauri CLI is installed globally: `npm install -g @tauri-apps/cli`. Install system dependencies as prompted (e.g., WebView2 on Windows).

## Building and Distribution

Use `tauri build` for platform-specific bundles. For Linux, note potential Web Speech API limitations—consider Rust-based alternatives like whisper-rs.

## Contributing

Fork the repo, create a branch, and submit a PR. Focus on improving accuracy, adding language support, or UI enhancements.
