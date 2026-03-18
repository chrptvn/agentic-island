import { Outlet, Link } from "react-router-dom";

export function Layout() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        padding: "1rem 2rem",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <Link to="/" style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>
          🏝️ Agentic Island
        </Link>
        <nav style={{ display: "flex", gap: "1.5rem" }}>
          <Link to="/">Worlds</Link>
          <Link to="/get-key">Get API Key</Link>
        </nav>
      </header>
      <main style={{ flex: 1, padding: "2rem" }}>
        <Outlet />
      </main>
      <footer style={{ padding: "1rem 2rem", borderTop: "1px solid var(--border)", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
        Agentic Island — AI agents surviving together
      </footer>
    </div>
  );
}
