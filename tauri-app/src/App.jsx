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
  const emittedFinalsRef = useRef(new Set());

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

  useEffect(() => {
    if (window.__TAURI__) {
      setIsTauriAvailable(true);
      console.log("✓ Tauri is available");
    } else {
      console.warn("✗ Tauri not available - using Web Speech API fallback");
      setIsTauriAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, interim]);

  const invoke = async (command, args) => {
    if (!window.__TAURI__) {
      throw new Error("Tauri API not available");
    }
    return window.__TAURI__.invoke(command, args);
  };

  const listen = async (event, handler) => {
    if (!window.__TAURI__) {
      throw new Error("Tauri API not available");
    }
    return window.__TAURI__.event.listen(event, handler);
  };

  const startRecording = async () => {
    try {
      setError("");
      setTranscript("");
      setInterim("");
      emittedFinalsRef.current.clear();

      sessionIdRef.current = crypto.randomUUID();
      console.log("🎙️ Starting recording:", sessionIdRef.current);

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
      const recorder = MediaRecorder.isTypeSupported(mimeType)
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      if (isTauriAvailable) {
        // Use Deepgram via Tauri backend
        console.log("📡 Using Deepgram transcription");

        await invoke("start_live_transcription", {
          sessionId: sessionIdRef.current,
          language,
        });

        const unlisten = await listen("deepgram_transcript", (event) => {
          const { isFinal, text } = event.payload;

          if (isFinal) {
            // Deduplicate on frontend as well
            if (!emittedFinalsRef.current.has(text)) {
              emittedFinalsRef.current.add(text);

              setTranscript((prev) => {
                const addition = text.trim();
                if (!addition) return prev;
                return prev ? `${prev} ${addition}` : addition;
              });
            }
            setInterim("");
          } else {
            setInterim(text);
          }
        });
        unlistenRef.current = unlisten;

        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0) {
            try {
              const arrayBuffer = await e.data.arrayBuffer();
              const bytes = Array.from(new Uint8Array(arrayBuffer));
              await invoke("send_audio_chunk", {
                sessionId: sessionIdRef.current,
                chunk: bytes,
              });
            } catch (err) {
              console.error("❌ Failed to send chunk:", err);
            }
          }
        };
      } else {
        // Web Speech API fallback
        console.log("🌐 Using Web Speech API (fallback)");
        const SpeechRecognition =
          window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = language;

          recognition.onstart = () => {
            console.log("🎤 Speech recognition started");
          };

          recognition.onresult = (event) => {
            let finalText = "";
            let interimText = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalText += transcript + " ";
              } else {
                interimText += transcript;
              }
            }

            if (finalText) {
              setTranscript((prev) => prev + finalText);
            }
            if (interimText) {
              setInterim(interimText);
            }
          };

          recognition.onerror = (event) => {
            console.error("❌ Speech recognition error:", event.error);
            setError(`Speech recognition error: ${event.error}`);
          };

          recognition.onend = () => {
            console.log("🛑 Speech recognition ended");
          };

          recognition.start();
          mediaRecorderRef.current.speechRecognition = recognition;
        } else {
          setError("Speech recognition not supported in this browser");
          return;
        }
      }

      recorder.onerror = (e) => {
        console.error("❌ MediaRecorder error:", e);
        setError("Recording error occurred");
      };

      recorder.start(250);
      setIsRecording(true);
      console.log("✓ Recording started");
    } catch (err) {
      console.error("❌ Start error:", err);
      setError("Failed to start: " + (err.message || "Unknown error"));
      stopAll();
    }
  };

  const stopAll = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    if (mediaRecorderRef.current?.speechRecognition) {
      mediaRecorderRef.current.speechRecognition.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    mediaRecorderRef.current = null;
  };

  const stopRecording = async () => {
    console.log("⏹️ Stopping recording...");
    stopAll();

    if (isTauriAvailable) {
      try {
        await invoke("stop_live_transcription", {
          sessionId: sessionIdRef.current,
        });
      } catch (err) {
        console.warn("⚠️ Stop error:", err);
      }
    }

    setIsRecording(false);
    console.log("✓ Recording stopped");
  };

  const copyToClipboard = () => {
    const text = (transcript + (interim ? " " + interim : "")).trim();
    if (text) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          console.log("✓ Copied to clipboard");
          setError(""); // Clear any previous errors
        })
        .catch((err) => {
          console.error("❌ Copy failed:", err);
          setError("Failed to copy to clipboard");
        });
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    setInterim("");
    emittedFinalsRef.current.clear();
  };

  const displayText = transcript.trim();
  const currentInterim = interim.trim();

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
        >
          {isRecording ? "⏹️ Stop Recording" : "🎤 Start Live Recording"}
        </button>
      </div>

      {error && <div className="error-message">❌ {error}</div>}
      {isRecording && (
        <div className="recording-indicator">
          <span className="pulse"></span>
          Live transcription in progress...
        </div>
      )}

      <div className="transcript-box">
        <h2>📝 Transcript</h2>
        <div className="transcript-content">
          {displayText ||
            (isRecording
              ? "Listening..."
              : "Start recording to begin transcription")}
          {currentInterim && (
            <span className="interim-text">{currentInterim}</span>
          )}
        </div>

        <div className="transcript-actions">
          <button
            onClick={copyToClipboard}
            disabled={!displayText && !currentInterim}
            className="btn-secondary"
          >
            📋 Copy
          </button>
          <button
            onClick={clearTranscript}
            disabled={!displayText && !currentInterim}
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
