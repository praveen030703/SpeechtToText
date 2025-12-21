// src/deepgram_proxy.rs

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, EventTarget};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use std::sync::Arc;

pub async fn start_deepgram_proxy<R: tauri::Runtime>(
    app: AppHandle<R>,
    api_key: String,
    language: String,
) -> Result<mpsc::Sender<Vec<u8>>, String> {
    let (audio_tx, mut audio_rx) = mpsc::channel::<Vec<u8>>(100);

    let ws_url = format!(
        "wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&smart_format=true&punctuate=true&language={}&token={}",
        language,
        api_key
    );

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .map_err(|e| format!("WebSocket connection failed: {}", e))?;

    let (sink, mut stream) = ws_stream.split();

    let sink = Arc::new(Mutex::new(sink));
    let sink_for_send = sink.clone();
    let sink_for_receive = sink.clone();

    let app_clone = app.clone();

    // Track the last emitted final transcript (not just last N, but actual last one)
    let last_emitted_final = Arc::new(Mutex::new(String::new()));
    let last_emitted_receive = last_emitted_final.clone();

    // Receive task
    tokio::spawn(async move {
        while let Some(message) = stream.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if let Some(transcript) = json
                            .pointer("/channel/alternatives/0/transcript")
                            .and_then(|t| t.as_str())
                        {
                            let trimmed = transcript.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            let is_final = json.get("is_final").and_then(|v| v.as_bool()).unwrap_or(false);

                            if is_final {
                                let mut last_final = last_emitted_receive.lock().await;
                                
                                // Only emit if this is different from the last final we sent
                                if last_final.as_str() != trimmed {
                                    *last_final = trimmed.to_string();
                                    
                                    let payload = json!({
                                        "isFinal": true,
                                        "text": trimmed
                                    });

                                    let _ = app_clone.emit_to(EventTarget::any(), "deepgram_transcript", payload);
                                    eprintln!("📤 Final emitted: {}", trimmed);
                                } else {
                                    eprintln!("⏭️ Duplicate final skipped: {}", trimmed);
                                }
                            } else {
                                // Always emit interim results for real-time feedback
                                let payload = json!({
                                    "isFinal": false,
                                    "text": trimmed
                                });

                                let _ = app_clone.emit_to(EventTarget::any(), "deepgram_transcript", payload);
                            }
                        }
                    }
                }
                Ok(Message::Ping(data)) => {
                    let mut locked_sink = sink_for_receive.lock().await;
                    let _ = locked_sink.send(Message::Pong(data)).await;
                }
                Ok(Message::Close(_)) => {
                    eprintln!("Deepgram connection closed");
                    break;
                }
                Err(e) => {
                    eprintln!("❌ Deepgram WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }
    });

    // Send task
    tokio::spawn(async move {
        while let Some(chunk) = audio_rx.recv().await {
            let mut locked_sink = sink_for_send.lock().await;
            if locked_sink.send(Message::Binary(chunk)).await.is_err() {
                eprintln!("Failed to send audio chunk");
                break;
            }
        }

        // Close connection gracefully
        let mut locked_sink = sink_for_send.lock().await;
        let _ = locked_sink.send(Message::Close(None)).await;
    });

    Ok(audio_tx)
}