# Speech to Text Desktop App

A desktop application for real-time speech-to-text transcription. Built with **Tauri** (Rust backend) and **React** (frontend), it runs entirely on your machine.

**Note**: Currently uses the Deepgram cloud API for transcription (requires an API key and internet connection).

## Features

- Real-time speech-to-text using modern web technologies
- Lightweight desktop app (Tauri)
- Cross-platform support (Windows, macOS, Linux – with some limitations on Linux for Web Speech API)
- Audio processed securely with Tauri's Rust backend

## Tech Stack

- **Frontend**: React + Vite + Web Speech API
- **Backend/Build**: Tauri (Rust)
- **Speech Recognition**: Deepgram API (cloud) – planned migration to offline alternatives

## Prerequisites

Before starting, ensure you have:

- **Node.js** (v18 or higher) – Download from https://nodejs.org
- **Rust** – Install via https://rustup.rs
- **Tauri CLI** – Will be installed globally in the steps below

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/praveen030703/SpeechtToText.git
   ```
2. **Enter the app directory**

   ```
   cd tauri app
   ```

3. **Install dependancies**

   ```
   npm install
   ```

4. **Install tauri CLI globally**

   ```
   npm install -g @tauri-apps/cli
   ```

5. **Get a Deepgram API Key**

   ```
   Sign up at https://deepgram.com and create a free API key.
   This is required for speech transcription.
   ```

6. **Create .env file to store API Key**

   ```
   DEEPGRAM_API_KEY = "Your API Key here"
   ```

7. **Run the Applicatio in development mode**

   ```
   npm run tauri dev
   ```
