import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

const variantStyles = {
  primary:
    "bg-accent-cyan text-on-accent font-semibold hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] active:bg-accent-cyan/90",
  secondary:
    "bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/40 hover:bg-accent-emerald/20 active:bg-accent-emerald/30",
  ghost:
    "text-text-primary hover:bg-elevated active:bg-elevated/80",
  outline:
    "border border-border-default text-text-primary hover:border-accent-cyan/50 hover:text-accent-cyan active:bg-elevated/50",
} as const;

const sizeStyles = {
  sm: "px-3 py-1.5 text-sm rounded-md",
  md: "px-5 py-2.5 text-sm rounded-lg",
  lg: "px-7 py-3 text-base rounded-lg",
} as const;

type Variant = keyof typeof variantStyles;
type Size = keyof typeof sizeStyles;

type ButtonBaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = ButtonBaseProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof ButtonBaseProps> & {
    href?: undefined;
  };

type ButtonAsLink = ButtonBaseProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof ButtonBaseProps> & {
    href: string;
  };

type ButtonProps = ButtonAsButton | ButtonAsLink;

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  href,
  ...rest
}: ButtonProps) {
  const classes = `inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        {...(rest as Omit<ComponentPropsWithoutRef<typeof Link>, "href" | "className">)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      {...(rest as Omit<ComponentPropsWithoutRef<"button">, "className">)}
    >
      {children}
    </button>
  );
}
