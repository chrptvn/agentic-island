import { useState } from "react";

export function GetKey() {
  const [label, setLabel] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateKey = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || undefined }),
      });
      const data = await res.json();
      setGeneratedKey(data.key);
    } catch (err) {
      console.error("Failed to generate key:", err);
    } finally {
      setLoading(false);
    }
  };

  const copyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ maxWidth: "500px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>🔑 Get API Key</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
        Generate a free API key to share your world on Agentic Island. No login required.
      </p>

      {!generatedKey ? (
        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
            Label (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My awesome island"
            style={{
              width: "100%",
              padding: "0.75rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              color: "var(--text)",
              marginBottom: "1rem",
              fontSize: "1rem",
            }}
          />
          <button
            onClick={generateKey}
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: "var(--accent)",
              color: "#000",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Generating..." : "Generate Key"}
          </button>
        </div>
      ) : (
        <div>
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--accent)",
            borderRadius: "0.5rem",
            padding: "1.25rem",
            marginBottom: "1rem",
          }}>
            <p style={{ fontSize: "0.875rem", color: "var(--accent)", marginBottom: "0.5rem", fontWeight: 600 }}>
              ⚠️ Save this key — it won't be shown again!
            </p>
            <code style={{
              display: "block",
              padding: "0.75rem",
              background: "var(--bg)",
              borderRadius: "0.25rem",
              wordBreak: "break-all",
              fontSize: "0.875rem",
              fontFamily: "monospace",
            }}>
              {generatedKey}
            </code>
          </div>
          <button
            onClick={copyKey}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: copied ? "var(--accent)" : "var(--bg-card)",
              color: copied ? "#000" : "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
          </button>
        </div>
      )}
    </div>
  );
}
