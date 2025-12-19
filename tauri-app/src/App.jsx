import { useState, useRef, useEffect } from "react";
import "./App.css";

function App() {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("en");
  const [isTauriAvailable, setIsTauriAvailable] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const unlistenRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const chunksRef = useRef([]);

  const languages = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    hi: "Hindi",
  };

  // Check if Tauri is available
  useEffect(() => {
    if (window.__TAURI__) {
      setIsTauriAvailable(true);
      console.log("Tauri is available");
    } else {
      console.warn("Tauri is not available, running in browser mode");
      setIsTauriAvailable(false);
    }
  }, []);

  // Auto-scroll to bottom of transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, interim]);

  const invoke = async (command, args) => {
    if (!window.__TAURI__) {
      throw new Error("Tauri API not available - running in browser mode");
    }
    return window.__TAURI__.invoke(command, args);
  };

  const listen = async (event, handler) => {
    if (!window.__TAURI__) {
      throw new Error("Tauri API not available - running in browser mode");
    }
    return window.__TAURI__.event.listen(event, handler);
  };

  const startRecording = async () => {
    try {
      setError("");
      setTranscript("");
      setInterim("");
      chunksRef.current = [];

      // Generate new session ID for each recording
      sessionIdRef.current = crypto.randomUUID();
      console.log("Starting recording with session ID:", sessionIdRef.current);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mimeType = "audio/webm;codecs=opus";
      let recorder;

      if (MediaRecorder.isTypeSupported(mimeType)) {
        recorder = new MediaRecorder(stream, {
          mimeType,
          audioBitsPerSecond: 16000,
        });
      } else {
        // Fallback to default
        console.warn("Opus in WebM not supported, using default");
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;

      // Only call Tauri commands if available
      if (isTauriAvailable) {
        // Start proxy session
        await invoke("start_live_transcription", {
          sessionId: sessionIdRef.current,
          language,
        });

        // Listen for transcript events
        const unlisten = await listen("deepgram_transcript", (event) => {
          const payload = event.payload;
          if (payload.sessionId !== sessionIdRef.current) return;

          if (payload.isFinal) {
            setTranscript((prev) => prev + (prev ? " " : "") + payload.text);
            setInterim("");
          } else {
            setInterim(payload.text);
          }
        });
        unlistenRef.current = unlisten;
      } else {
        // Browser fallback: Use Web Speech API
        console.log("Using browser Web Speech API as fallback");
        const SpeechRecognition =
          window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = language;

          recognition.onresult = (event) => {
            let interimTranscript = "";
            let finalTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcript + " ";
              } else {
                interimTranscript += transcript;
              }
            }

            if (finalTranscript) {
              setTranscript((prev) => prev + finalTranscript);
            }
            if (interimTranscript) {
              setInterim(interimTranscript);
            }
          };

          recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            setError("Speech recognition error: " + event.error);
          };

          recognition.start();
          mediaRecorderRef.current.speechRecognition = recognition;
        } else {
          setError("Speech recognition not supported in this browser");
          return;
        }
      }

      // Send audio chunks (only for Tauri mode)
      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);

          // Only send to Tauri backend if available
          if (isTauriAvailable) {
            try {
              const arrayBuffer = await e.data.arrayBuffer();
              const bytes = Array.from(new Uint8Array(arrayBuffer));
              await invoke("send_audio_chunk", {
                sessionId: sessionIdRef.current,
                chunk: bytes,
              });
            } catch (err) {
              console.error("Failed to send chunk:", err);
            }
          }
        }
      };

      recorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        setError("Recording error occurred");
      };

      recorder.onstop = () => {
        console.log("MediaRecorder stopped");
      };

      // Start with 250ms chunks for better compatibility
      recorder.start(250);
      setIsRecording(true);
      console.log("Recording started successfully");
    } catch (err) {
      console.error("Start recording error:", err);
      setError(
        "Failed to start recording: " + (err.message || "Unknown error")
      );
      stopAll();
    }
  };

  const stopAll = () => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }

      // Stop Web Speech API if it was used
      if (mediaRecorderRef.current.speechRecognition) {
        mediaRecorderRef.current.speechRecognition.stop();
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }

    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    mediaRecorderRef.current = null;
  };

  const stopRecording = async () => {
    try {
      console.log("Stopping recording...");

      stopAll();

      if (isTauriAvailable) {
        await invoke("stop_live_transcription", {
          sessionId: sessionIdRef.current,
        }).catch((err) => console.warn("Stop transcription error:", err));
      }

      setIsRecording(false);
      chunksRef.current = [];
      console.log("Recording stopped successfully");
    } catch (err) {
      console.error("Stop recording error:", err);
      setError("Error stopping recording: " + err.message);
      setIsRecording(false);
    }
  };

  const copyToClipboard = () => {
    const text = (transcript + (interim ? " " + interim : "")).trim();
    if (text) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          console.log("Copied to clipboard");
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
          setError("Failed to copy to clipboard");
        });
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    setInterim("");
  };

  const displayText = (transcript + (interim ? " " + interim : "")).trim();

  return (
    <div className="container">
      <h1>🎙️ Real-Time Speech to Text</h1>

      <div className="language-selector">
        <label htmlFor="language">Language:</label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={isRecording}
        >
          {Object.entries(languages).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="controls">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={isRecording ? "btn-recording" : "btn-primary"}
          disabled={!isTauriAvailable && isRecording ? false : undefined}
        >
          {isRecording ? "⏹️ Stop Recording" : "🎤 Start Live Recording"}
        </button>
      </div>

      {error && <div className="error-message">❌ {error}</div>}
      {isRecording && (
        <div className="recording-indicator">
          <span className="pulse"></span>
          Live transcription in progress...
          {!isTauriAvailable && " (Browser mode)"}
        </div>
      )}

      <div className="transcript-box">
        <h2>📝 Transcript</h2>
        <div className="transcript-content">
          {displayText ||
            (isRecording
              ? "Listening..."
              : "Start recording to begin transcription")}
          {interim && <span className="interim-text"> {interim}</span>}
          <div ref={transcriptEndRef} />
        </div>

        <div className="transcript-actions">
          <button
            onClick={copyToClipboard}
            disabled={!displayText}
            className="btn-secondary"
          >
            📋 Copy
          </button>
          <button
            onClick={clearTranscript}
            disabled={!displayText && !interim}
            className="btn-secondary"
          >
            🗑️ Clear
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
