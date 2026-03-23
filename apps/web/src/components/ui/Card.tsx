import type { ReactNode } from "react";

type CardProps = {
  className?: string;
  children: ReactNode;
  hover?: boolean;
};

export default function Card({ className = "", children, hover = false }: CardProps) {
  return (
    <div
      className={`bg-surface border border-border-default rounded-xl p-6 ${
        hover
          ? "transition-colors duration-200 hover:border-accent-cyan/30"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
