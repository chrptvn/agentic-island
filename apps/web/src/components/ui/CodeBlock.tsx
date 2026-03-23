"use client";

import { useState, useCallback } from "react";

type CodeBlockProps = {
  code: string;
  language?: string;
  showCopy?: boolean;
};

export default function CodeBlock({ code, language, showCopy = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      {showCopy && (
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 px-2 py-1 text-xs rounded-md bg-surface border border-border-default text-text-muted hover:text-text-primary hover:border-accent-cyan/40 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
          aria-label="Copy code"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      )}
      <pre
        className="bg-elevated rounded-lg p-4 overflow-x-auto"
        {...(language ? { "data-language": language } : {})}
      >
        <code className="font-mono text-sm text-text-primary">{code}</code>
      </pre>
    </div>
  );
}
