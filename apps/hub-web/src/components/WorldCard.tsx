import { Link } from "react-router-dom";
import type { WorldMeta } from "@agentic-island/shared";

export function WorldCard({ world }: { world: WorldMeta }) {
  return (
    <Link
      to={`/world/${world.id}`}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "1.25rem",
        color: "var(--text)",
        transition: "border-color 0.2s",
        display: "block",
      }}
    >
      <h3 style={{ marginBottom: "0.5rem" }}>{world.name}</h3>
      {world.description && (
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: "0.75rem",
          }}
        >
          {world.description}
        </p>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
        }}
      >
        <span>👥 {world.playerCount} players</span>
        <span
          style={{
            color:
              world.status === "online"
                ? "var(--accent)"
                : "var(--text-muted)",
          }}
        >
          {world.status === "online" ? "● Online" : "○ Offline"}
        </span>
      </div>
    </Link>
  );
}
