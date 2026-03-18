import { useWorlds } from "../hooks/useWorlds.js";
import { WorldCard } from "../components/WorldCard.js";

export function Home() {
  const { worlds, loading, error } = useWorlds("online");

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>🌍 Live Worlds</h1>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading worlds...</p>
      ) : error ? (
        <p style={{ color: "var(--text-muted)" }}>Failed to load worlds: {error}</p>
      ) : worlds.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No worlds online right now. Be the first to share yours!
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {worlds.map((w) => (
            <WorldCard key={w.id} world={w} />
          ))}
        </div>
      )}
    </div>
  );
}
