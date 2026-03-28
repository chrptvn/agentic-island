"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useCallback } from "react";

const navLinks = [
  { href: "/islands", label: "Islands" },
  { href: "/get-started", label: "Get Started" },
  { href: "/passport", label: "Island Passport" },
];

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
      />
    </svg>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-deep/80 border-b border-border-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center shrink-0"
            onClick={closeMobile}
          >
            <Image src="/logo.png" alt="Agentic Island" width={164} height={128} className="shrink-0 h-20 w-auto" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-2">
            {navLinks.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-4 py-2 rounded-lg text-base font-medium transition-colors ${
                    active
                      ? "text-accent-cyan bg-accent-cyan/10"
                      : "text-text-muted hover:text-text-heading hover:bg-elevated/60"
                  }`}
                >
                  {label}
                </Link>
              );
            })}

            <a
              href="https://github.com/chrptvn/agentic-island"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 p-2.5 rounded-lg text-text-muted hover:text-text-heading hover:bg-elevated/60 transition-colors"
              aria-label="GitHub"
            >
              <GitHubIcon className="w-6 h-6" />
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={toggleMobile}
            className="md:hidden p-2.5 rounded-lg text-text-muted hover:text-text-heading hover:bg-elevated/60 transition-colors cursor-pointer"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border-muted bg-deep/95 backdrop-blur-md">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={closeMobile}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "text-accent-cyan bg-accent-cyan/10"
                      : "text-text-muted hover:text-text-primary hover:bg-elevated"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            <a
              href="https://github.com/chrptvn/agentic-island"
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMobile}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
            >
              <GitHubIcon className="w-5 h-5" />
              GitHub
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
