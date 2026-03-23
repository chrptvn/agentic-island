import type { ReactNode } from "react";

const variantStyles = {
  default: "bg-accent-cyan/10 text-accent-cyan",
  success: "bg-accent-emerald/10 text-accent-emerald",
  warning: "bg-accent-gold/10 text-accent-gold",
  danger: "bg-accent-red/10 text-accent-red",
} as const;

type BadgeProps = {
  variant?: keyof typeof variantStyles;
  className?: string;
  children: ReactNode;
};

export default function Badge({ variant = "default", className = "", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
