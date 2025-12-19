#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use dotenvy::dotenv;
mod deepgram_proxy;

use deepgram_proxy::start_deepgram_proxy;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex, RwLock};

type AudioChannels = RwLock<HashMap<String, tokio::sync::mpsc::Sender<Vec<u8>>>>;

struct AppState {
    api_key: String,
    channels: AudioChannels,
}

#[tauri::command]
async fn start_live_transcription(
    session_id: String,
    language: String,
    state: State<'_, Arc<Mutex<AppState>>>,
    app: AppHandle,
) -> Result<(), String> {
    println!("Starting live transcription for session: {}", session_id);
    
    let state_guard = state.lock().await;
    
    // Check if session already exists
    if state_guard.channels.read().await.contains_key(&session_id) {
        return Err("Session already active".into());
    }
    
    // Create new audio channel
    let audio_tx = start_deepgram_proxy(
        app.clone(), 
        state_guard.api_key.clone(), 
        language
    ).await?;
    
    // Store the channel
    state_guard.channels.write().await.insert(session_id.clone(), audio_tx);
    
    println!("Live transcription started for session: {}", session_id);
    Ok(())
}

#[tauri::command]
async fn send_audio_chunk(
    session_id: String,
    chunk: Vec<u8>,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let state_guard = state.lock().await;
    let channels = state_guard.channels.read().await;

    if let Some(tx) = channels.get(&session_id) {
        tx.send(chunk).await.map_err(|_| "Send failed or session closed".to_string())
    } else {
        Err("Invalid session".into())
    }
}

#[tauri::command]
async fn stop_live_transcription(
    session_id: String,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    println!("Stopping live transcription for session: {}", session_id);
    
    let state_guard = state.lock().await;
    let mut channels = state_guard.channels.write().await;
    
    if channels.remove(&session_id).is_some() {
        println!("Session removed: {}", session_id);
        Ok(())
    } else {
        Err("Session not found".into())
    }
}

#[tauri::command]
fn test_connection() -> String {
    "Tauri backend is working!".to_string()
}

fn main() {
    dotenv().ok();
    
    let api_key = std::env::var("DEEPGRAM_API_KEY")
        .unwrap_or_else(|_| "DEMO_KEY".to_string()); // Use demo key for testing
    
    println!("Starting Tauri app");
    
    tauri::Builder::default()
        .setup(|app| {
            println!("App setup completed");
            Ok(())
        })
        .manage(Arc::new(Mutex::new(AppState {
            api_key,
            channels: RwLock::new(HashMap::new()),
        })))
        .invoke_handler(tauri::generate_handler![
            start_live_transcription,
            send_audio_chunk,
            stop_live_transcription,
            test_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}