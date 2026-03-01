import { useState, useRef } from "react";
import { Upload, FileText, MessageSquare, Mail, Copy, X, ScanText, CheckCheck, Sparkles } from "lucide-react";

const OUTPUT_FORMATS = [
  { value: "email", label: "Email", icon: Mail, desc: "Professional email" },
  { value: "slack", label: "Slack", icon: MessageSquare, desc: "Team update" },
  { value: "bullet", label: "Bullets", icon: FileText, desc: "Key points" },
  { value: "formal", label: "Report", icon: FileText, desc: "Formal doc" },
];

const STATUS_MESSAGES = {
  compressing: "Compressing image...",
  extracting: "Reading your handwriting...",
  transforming: "Crafting your output...",
};

export default function App() {
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [format, setFormat] = useState("bullet");
  const [output, setOutput] = useState("");
  const [extracted, setExtracted] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("idle");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const compressImage = (file) =>
    new Promise((resolve, reject) => {
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
    } catch {
      setError("Could not process image. Please try a different file.");
    }
    setStep("idle"); setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const process = async () => {
    if (!imageBase64?.data) return;
    setLoading(true); setError(""); setOutput(""); setExtracted("");
    try {
      setStep("extracting");
      const extractRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const rawText = extractData.content.map(b => b.text || "").join("\n").trim();
      if (!rawText || rawText === "No text found") {
        setError("No text found. Please try a clearer photo.");
        setLoading(false); setStep("idle"); return;
      }
      setExtracted(rawText);
      setStep("transforming");
      const instructions = {
        email: "Transform these notes into a professional email with a subject line, greeting, body, and sign-off.",
        slack: "Transform these notes into a concise, friendly Slack message with appropriate formatting (bold, bullet points using *, etc.).",
        bullet: "Transform these notes into clean, well-organized bullet points grouped by topic.",
        formal: "Transform these notes into a formal report with sections: Summary, Key Points, and Action Items.",
      };
      const transformRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: `Here are transcribed notes:\n\n${rawText}\n\n${instructions[format]}\n\nExpand abbreviations naturally and use professional language.` }]
        })
      });
      const transformData = await transformRes.json();
      const result = transformData.content.map(b => b.text || "").join("\n").trim();
      setOutput(result);
      setStep("done");
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("idle");
    }
    setLoading(false);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setImage(null); setImageBase64(null); setOutput(""); setExtracted(""); setStep("idle"); setError("");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f0e0c; }

        .app {
          min-height: 100vh;
          background: #0f0e0c;
          color: #f0ebe1;
          font-family: 'DM Sans', sans-serif;
          padding: 2rem 1.5rem;
        }

        .container { max-width: 960px; margin: 0 auto; }

        .header { margin-bottom: 2.5rem; }
        .header-tag {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(214,174,96,0.12); border: 1px solid rgba(214,174,96,0.25);
          border-radius: 100px; padding: 4px 12px;
          font-size: 11px; font-weight: 500; color: #d6ae60;
          text-transform: uppercase; letter-spacing: 1.5px;
          margin-bottom: 1rem;
        }
        .title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(2rem, 5vw, 3rem);
          line-height: 1.1; color: #f0ebe1; margin-bottom: 0.5rem;
        }
        .title span { color: #d6ae60; font-style: italic; }
        .subtitle { color: #7a7166; font-size: 0.95rem; font-weight: 300; }

        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }

        .panel {
          background: #17160f;
          border: 1px solid #2a2820;
          border-radius: 16px;
          overflow: hidden;
        }

        .upload-zone {
          border: 2px dashed #2a2820;
          border-radius: 14px;
          padding: 3rem 2rem;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s ease;
          background: #17160f; gap: 0.75rem;
          min-height: 200px;
        }
        .upload-zone:hover, .upload-zone.drag-over {
          border-color: #d6ae60;
          background: rgba(214,174,96,0.04);
        }
        .upload-icon {
          width: 48px; height: 48px;
          background: rgba(214,174,96,0.1); border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          color: #d6ae60;
        }
        .upload-text { font-size: 0.9rem; color: #7a7166; text-align: center; }
        .upload-text strong { display: block; color: #c4bfb4; font-weight: 500; margin-bottom: 2px; }

        .image-preview { position: relative; border-radius: 14px; overflow: hidden; }
        .image-preview img { width: 100%; object-fit: contain; max-height: 280px; display: block; }
        .remove-btn {
          position: absolute; top: 10px; right: 10px;
          background: rgba(15,14,12,0.8); border: 1px solid #2a2820;
          border-radius: 50%; width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #c4bfb4; transition: all 0.2s;
        }
        .remove-btn:hover { background: rgba(214,174,96,0.2); color: #d6ae60; }

        .formats-panel { padding: 1.25rem; }
        .formats-label { font-size: 11px; font-weight: 500; color: #7a7166; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 0.75rem; }
        .formats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .format-btn {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          cursor: pointer; transition: all 0.18s ease;
          border: 1px solid #2a2820; background: transparent;
          text-align: left;
        }
        .format-btn.active { border-color: #d6ae60; background: rgba(214,174,96,0.08); }
        .format-btn:hover:not(.active) { border-color: #3a3830; background: rgba(255,255,255,0.02); }
        .format-icon {
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: #1e1d16; flex-shrink: 0;
          color: #7a7166; transition: all 0.18s;
        }
        .format-btn.active .format-icon { background: rgba(214,174,96,0.15); color: #d6ae60; }
        .format-label { font-size: 13px; font-weight: 500; color: #c4bfb4; line-height: 1.2; }
        .format-desc { font-size: 11px; color: #55524a; }

        .process-btn {
          width: 100%; padding: 14px;
          background: #d6ae60; color: #0f0e0c;
          border: none; border-radius: 12px;
          font-family: 'DM Sans', sans-serif; font-size: 0.9rem; font-weight: 600;
          cursor: pointer; transition: all 0.2s ease;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          letter-spacing: 0.3px;
        }
        .process-btn:hover:not(:disabled) { background: #e8c070; transform: translateY(-1px); }
        .process-btn:disabled { background: #2a2820; color: #55524a; cursor: not-allowed; transform: none; }

        .spinner {
          width: 16px; height: 16px; border: 2px solid rgba(15,14,12,0.3);
          border-top-color: #0f0e0c; border-radius: 50%;
          animation: spin 0.8s linear infinite; flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .error { color: #e07070; font-size: 0.83rem; text-align: center; padding: 0.5rem 0; }

        .extracted-panel { padding: 1.25rem; border-top: 1px solid #2a2820; }
        .section-label { font-size: 10px; font-weight: 600; color: #7a7166; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 0.6rem; }
        .extracted-text { font-size: 0.82rem; color: #7a7166; white-space: pre-wrap; line-height: 1.6; }

        .output-panel { display: flex; flex-direction: column; height: 100%; }
        .output-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 1.25rem;
          border-bottom: 1px solid #2a2820;
        }
        .output-title { font-size: 11px; font-weight: 600; color: #7a7166; text-transform: uppercase; letter-spacing: 2px; }
        .copy-btn {
          display: flex; align-items: center; gap: 6px;
          background: rgba(214,174,96,0.1); border: 1px solid rgba(214,174,96,0.2);
          border-radius: 8px; padding: 6px 12px;
          color: #d6ae60; font-size: 12px; font-weight: 500; cursor: pointer;
          font-family: 'DM Sans', sans-serif; transition: all 0.18s;
        }
        .copy-btn:hover { background: rgba(214,174,96,0.18); }

        .output-body { flex: 1; padding: 1.25rem; overflow-y: auto; }
        .output-text { font-size: 0.875rem; color: #c4bfb4; white-space: pre-wrap; line-height: 1.75; font-weight: 300; }

        .empty-state {
          height: 100%; min-height: 300px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 1rem; color: #3a3830;
        }
        .empty-icon {
          width: 56px; height: 56px; border-radius: 16px;
          background: #1e1d16; border: 1px solid #2a2820;
          display: flex; align-items: center; justify-content: center;
        }
        .empty-text { font-size: 0.85rem; color: #3a3830; text-align: center; line-height: 1.5; }

        .left-col { display: flex; flex-direction: column; gap: 1rem; }

        .loading-text { font-size: 0.83rem; color: #7a7166; display: flex; align-items: center; gap: 8px; justify-content: center; }
      `}</style>

      <div className="app">
        <div className="container">
          <div className="header">
            <div className="header-tag">
              <Sparkles size={10} />
              AI-Powered
            </div>
            <h1 className="title">Handwritten Note <span>Digitizer</span></h1>
            <p className="subtitle">Upload a photo of your notes — we'll read, transcribe & transform them.</p>
          </div>

          <div className="grid">
            {/* Left Column */}
            <div className="left-col">
              {/* Upload */}
              {!image ? (
                <div
                  className={`upload-zone${dragOver ? " drag-over" : ""}`}
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileRef.current.click()}
                >
                  <div className="upload-icon"><Upload size={22} /></div>
                  <div className="upload-text">
                    <strong>Drop your image here</strong>
                    or click to browse
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
                </div>
              ) : (
                <div className="image-preview">
                  <img src={image} alt="Uploaded notes" />
                  <button className="remove-btn" onClick={reset}><X size={14} /></button>
                </div>
              )}

              {/* Format Select */}
              <div className="panel formats-panel">
                <div className="formats-label">Output Format</div>
                <div className="formats-grid">
                  {OUTPUT_FORMATS.map(f => {
                    const Icon = f.icon;
                    return (
                      <button
                        key={f.value}
                        className={`format-btn${format === f.value ? " active" : ""}`}
                        onClick={() => setFormat(f.value)}
                      >
                        <div className="format-icon"><Icon size={15} /></div>
                        <div>
                          <div className="format-label">{f.label}</div>
                          <div className="format-desc">{f.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CTA */}
              <button className="process-btn" onClick={process} disabled={!image || loading}>
                {loading ? (
                  <><div className="spinner" />{STATUS_MESSAGES[step] || "Processing..."}</>
                ) : (
                  <><ScanText size={16} /> Digitize & Transform</>
                )}
              </button>

              {error && <p className="error">{error}</p>}

              {extracted && (
                <div className="panel extracted-panel">
                  <div className="section-label">Raw Transcription</div>
                  <p className="extracted-text">{extracted}</p>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="panel output-panel">
              <div className="output-header">
                <span className="output-title">Result</span>
                {output && (
                  <button className="copy-btn" onClick={copy}>
                    {copied ? <><CheckCheck size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                  </button>
                )}
              </div>
              <div className="output-body">
                {output ? (
                  <p className="output-text">{output}</p>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon"><FileText size={22} color="#3a3830" /></div>
                    <p className="empty-text">Your transformed notes<br />will appear here</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
