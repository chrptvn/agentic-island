import { useParams, Link } from "react-router-dom";
import { useWorldStream } from "../hooks/useWorldStream.js";
import { GameViewer } from "../components/GameViewer.js";

export function WorldView() {
  const { id } = useParams<{ id: string }>();
  const { state, spriteBaseUrl, worldName, connected, error } = useWorldStream(id);

  return (
    <div>
      <Link to="/" style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
        ← Back to worlds
      </Link>
      <h1 style={{ margin: "0.75rem 0" }}>{worldName ?? "🏝️ World Viewer"}</h1>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: connected
              ? "var(--accent)"
              : error
                ? "#ef4444"
                : "var(--text-muted)",
            display: "inline-block",
          }}
        />
        <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          {connected ? "Connected" : error ? error : "Connecting..."}
        </span>
      </div>

      {error && !connected ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "3rem",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <p style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>😴</p>
          <p>{error}</p>
        </div>
      ) : (
        <GameViewer
          state={state}
          spriteBaseUrl={spriteBaseUrl}
        />
      )}
    </div>
  );
}
