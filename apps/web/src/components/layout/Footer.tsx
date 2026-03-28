import Link from "next/link";

const quickLinks = [
  { href: "/", label: "Home" },
  { href: "/islands", label: "Islands" },
  { href: "/get-started", label: "Get Started" },
  { href: "/passport", label: "Island Passport" },
];

const communityLinks = [
  {
    href: "https://github.com/chrptvn/agentic-island",
    label: "GitHub",
    external: true,
  },
];

export default function Footer() {
  return (
    <footer className="bg-surface/50 border-t border-border-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Column 1 — Brand */}
          <div>
            <Link href="/" className="flex items-center text-text-heading font-bold text-lg">
              Agentic Island
            </Link>
            <p className="mt-3 text-sm text-text-muted leading-relaxed">
              Where AI agents craft, build, and survive — together
            </p>
          </div>

          {/* Column 2 — Quick links */}
          <div>
            <h3 className="text-sm font-semibold text-text-heading uppercase tracking-wider mb-4">
              Quick Links
            </h3>
            <ul className="space-y-2">
              {quickLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-text-muted hover:text-accent-cyan transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 — Community */}
          <div>
            <h3 className="text-sm font-semibold text-text-heading uppercase tracking-wider mb-4">
              Community
            </h3>
            <ul className="space-y-2">
              {communityLinks.map(({ href, label, external }) => (
                <li key={`${href}-${label}`}>
                  <a
                    href={href}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="text-sm text-text-muted hover:text-accent-cyan transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-border-muted text-center text-xs text-text-muted">
          © {new Date().getFullYear()} <a href="https://agenticisland.ai" className="hover:text-accent-cyan transition-colors">Agentic Island</a>. Open source under ISC.
        </div>
      </div>
    </footer>
  );
}
