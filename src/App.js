import { useState, useRef } from "react";
import { Upload, FileText, MessageSquare, Mail, Copy, X, ScanText, Key, Eye, EyeOff } from "lucide-react";

const OUTPUT_FORMATS = [
  { value: "email", label: "Email", icon: Mail },
  { value: "slack", label: "Slack", icon: MessageSquare },
  { value: "bullet", label: "Bullet Points", icon: FileText },
  { value: "formal", label: "Formal Report", icon: FileText },
];

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("nd_api_key") || "");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKeyEntry, setShowKeyEntry] = useState(() => !localStorage.getItem("nd_api_key"));
  const [showKey, setShowKey] = useState(false);
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [format, setFormat] = useState("bullet");
  const [output, setOutput] = useState("");
  const [extracted, setExtracted] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("idle");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  const saveApiKey = () => {
    const key = apiKeyInput.trim();
    if (!key.startsWith("sk-ant-")) {
      setError("That doesn't look like a valid Anthropic API key (should start with sk-ant-).");
      return;
    }
    localStorage.setItem("nd_api_key", key);
    setApiKey(key);
    setShowKeyEntry(false);
    setError("");
  };

  const forgetKey = () => {
    localStorage.removeItem("nd_api_key");
    setApiKey("");
    setApiKeyInput("");
    setShowKeyEntry(true);
  };

  const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Image load failed"));
      img.onload = () => {
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        let quality = 0.85, dataUrl;
        do {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
          quality -= 0.1;
        } while (Math.round((dataUrl.length * 3) / 4) > 4 * 1024 * 1024 && quality > 0.2);
        resolve({ dataUrl, data: dataUrl.split(",")[1], type: "image/jpeg" });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setError(""); setOutput(""); setExtracted(""); setStep("compressing"); setLoading(true);
    try {
      const compressed = await compressImage(file);
      setImage(compressed.dataUrl);
      setImageBase64({ data: compressed.data, type: compressed.type });
    } catch (e) { setError("Could not process image. Please try a different file."); }
    setStep("idle"); setLoading(false);
  };

  const handleDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };

  const process = async () => {
    if (!imageBase64?.data || !apiKey) return;
    setLoading(true); setError(""); setOutput(""); setExtracted("");
    try {
      setStep("extracting");
      const extractRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: imageBase64.type, data: imageBase64.data } },
            { type: "text", text: "Please transcribe all the handwritten or printed text you can see in this image. Output only the raw transcribed text, preserving the original structure as much as possible. If you cannot find any text, say 'No text found'." }
          ]}]
        })
      });
      const extractData = await extractRes.json();
      if (extractData.error) { setError(`API error: ${extractData.error.message}`); setLoading(false); setStep("idle"); return; }
      const rawText = extractData.content.map(b => b.text || "").join("\n").trim();
      if (!rawText || rawText === "No text found") {
        setError("No text could be found in the image. Please try a clearer photo.");
        setLoading(false); setStep("idle"); return;
      }
      setExtracted(rawText);
      setStep("transforming");
      const formatInstructions = {
        email: "Transform these notes into a professional email with a subject line, greeting, body, and sign-off.",
        slack: "Transform these notes into a concise, friendly Slack message with appropriate formatting (bold, bullet points using *, etc.).",
        bullet: "Transform these notes into clean, well-organized bullet points grouped by topic.",
        formal: "Transform these notes into a formal report with sections: Summary, Key Points, and Action Items.",
      };
      const transformRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: `Here are transcribed notes:\n\n${rawText}\n\n${formatInstructions[format]}\n\nExpand abbreviations naturally and use professional language.` }]
        })
      });
      const transformData = await transformRes.json();
      if (transformData.error) { setError(`API error: ${transformData.error.message}`); setLoading(false); setStep("idle"); return; }
      setOutput(transformData.content.map(b => b.text || "").join("\n").trim());
      setStep("done");
    } catch (err) { setError("Something went wrong. Please try again."); setStep("idle"); }
    setLoading(false);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => { setImage(null); setImageBase64(null); setOutput(""); setExtracted(""); setStep("idle"); setError(""); };

  const statusLabel = step === "compressing" ? "Compressing…" : step === "extracting" ? "Reading handwriting…" : "Transforming notes…";

  return (
    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", minHeight: "100vh", background: "#faf8f5", color: "#1a1208" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Serif+4:ital,wght@0,300;0,400;1,300&display=swap');
        * { box-sizing: border-box; }
        .upload-zone { border: 2px dashed #c8b89a; border-radius: 4px; transition: all 0.2s; cursor: pointer; }
        .upload-zone:hover { border-color: #7c5c2e; background: #f5f0e8; }
        .fmt-btn { border: 1.5px solid #d4c4a8; background: white; border-radius: 2px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: 'Source Serif 4', Georgia, serif; font-size: 13px; color: #5a4020; transition: all 0.15s; }
        .fmt-btn:hover { background: #f5f0e8; border-color: #7c5c2e; }
        .fmt-btn.active { background: #3d2b0f; color: #f5f0e8; border-color: #3d2b0f; }
        .process-btn { background: #3d2b0f; color: #f5f0e8; border: none; padding: 14px; width: 100%; border-radius: 3px; font-family: 'Source Serif 4', Georgia, serif; font-size: 15px; cursor: pointer; letter-spacing: 0.04em; transition: background 0.2s; }
        .process-btn:hover:not(:disabled) { background: #5a4020; }
        .process-btn:disabled { background: #c8b89a; cursor: not-allowed; }
        .spinner { width: 16px; height: 16px; border: 2px solid rgba(245,240,232,0.3); border-top-color: #f5f0e8; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; margin-right: 8px; vertical-align: middle; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .result-area { background: white; border: 1px solid #e0d4be; border-radius: 3px; padding: 20px; min-height: 260px; font-family: 'Source Serif 4', Georgia, serif; font-size: 14px; line-height: 1.8; color: #2a1f0e; white-space: pre-wrap; overflow-y: auto; max-height: 480px; }
        .tag { display: inline-block; background: #f0e8d8; color: #7c5c2e; font-size: 11px; padding: 3px 8px; border-radius: 2px; letter-spacing: 0.06em; font-family: 'Source Serif 4', Georgia, serif; text-transform: uppercase; }
        .key-input { width: 100%; border: 1.5px solid #d4c4a8; border-radius: 3px; padding: 10px 12px; font-family: 'Source Serif 4', Georgia, serif; font-size: 13px; color: #2a1f0e; background: white; outline: none; }
        .key-input:focus { border-color: #7c5c2e; }
        .save-key-btn { background: #3d2b0f; color: #f5f0e8; border: none; padding: 10px 20px; border-radius: 3px; font-family: 'Source Serif 4', Georgia, serif; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .save-key-btn:hover { background: #5a4020; }
        .forget-btn { background: none; border: none; font-family: 'Source Serif 4', Georgia, serif; font-size: 12px; color: #a08060; cursor: pointer; text-decoration: underline; padding: 0; }
        .forget-btn:hover { color: #7c5c2e; }
        @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 40, borderBottom: "2px solid #3d2b0f", paddingBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <ScanText size={28} color="#7c5c2e" />
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, margin: 0, color: "#2a1f0e" }}>Note Digitizer</h1>
            </div>
            {apiKey && !showKeyEntry && (
              <button onClick={forgetKey} className="forget-btn">Change API key</button>
            )}
          </div>
          <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontStyle: "italic", color: "#7c5c2e", fontSize: 15, margin: 0, fontWeight: 300 }}>
            Photograph your handwritten notes — we'll read, transcribe, and transform them.
          </p>
        </div>

        {/* API Key Entry */}
        {showKeyEntry && (
          <div style={{ border: "1px solid #e0d4be", borderRadius: 3, padding: 24, background: "white", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Key size={16} color="#7c5c2e" />
              <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c5c2e", margin: 0 }}>Anthropic API Key</p>
            </div>
            <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13, color: "#7c5c2e", fontStyle: "italic", marginTop: 0, marginBottom: 14 }}>
              Your key is saved only in your browser's local storage — never sent anywhere except directly to Anthropic.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  className="key-input"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-ant-api03-..."
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveApiKey()}
                  style={{ paddingRight: 36 }}
                />
                <button onClick={() => setShowKey(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, color: "#a08060" }}>
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button onClick={saveApiKey} className="save-key-btn">Save</button>
            </div>
            {error && <p style={{ color: "#b04020", fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13, fontStyle: "italic", marginTop: 10, marginBottom: 0 }}>{error}</p>}
            <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 12, color: "#a08060", marginTop: 12, marginBottom: 0 }}>
              Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#7c5c2e" }}>console.anthropic.com</a>
            </p>
          </div>
        )}

        {/* Main UI */}
        {!showKeyEntry && (
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {!image ? (
                <div className="upload-zone" onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current.click()} style={{ padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <Upload size={36} color="#c8b89a" />
                  <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 15, color: "#5a4020", margin: 0 }}>Drop an image here</p>
                  <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13, color: "#a08060", margin: 0, fontStyle: "italic" }}>or click to browse</p>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
                </div>
              ) : (
                <div style={{ position: "relative", border: "1px solid #d4c4a8", borderRadius: 3, overflow: "hidden" }}>
                  <img src={image} alt="Uploaded notes" style={{ width: "100%", objectFit: "contain", maxHeight: 280, display: "block" }} />
                  <button onClick={reset} style={{ position: "absolute", top: 8, right: 8, background: "white", border: "1px solid #d4c4a8", borderRadius: 2, padding: 4, cursor: "pointer", display: "flex", alignItems: "center" }}>
                    <X size={14} color="#5a4020" />
                  </button>
                </div>
              )}

              <div style={{ border: "1px solid #e0d4be", borderRadius: 3, padding: 16, background: "white" }}>
                <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c5c2e", marginBottom: 12, marginTop: 0 }}>Output Format</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {OUTPUT_FORMATS.map(f => {
                    const Icon = f.icon;
                    return (
                      <button key={f.value} onClick={() => setFormat(f.value)} className={`fmt-btn${format === f.value ? " active" : ""}`}>
                        <Icon size={14} /> {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={process} disabled={!image || loading} className="process-btn">
                {loading ? <><span className="spinner" />{statusLabel}</> : "Digitize & Transform →"}
              </button>

              {error && <p style={{ color: "#b04020", fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13, fontStyle: "italic", textAlign: "center", margin: 0 }}>{error}</p>}

              {extracted && (
                <div style={{ border: "1px solid #e0d4be", borderRadius: 3, padding: 16, background: "white" }}>
                  <div style={{ marginBottom: 10 }}><span className="tag">Extracted Text</span></div>
                  <p style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13, color: "#3a2a10", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{extracted}</p>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="tag">Result</span>
                {output && (
                  <button onClick={copy} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 13, color: "#7c5c2e" }}>
                    <Copy size={13} /> {copied ? "Copied!" : "Copy"}
                  </button>
                )}
              </div>
              <div className="result-area">
                {output || <span style={{ color: "#c8b89a", fontStyle: "italic" }}>Your transformed notes will appear here once processed…</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
