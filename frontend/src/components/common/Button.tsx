import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "danger" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantStyles: Record<Variant, string> = {
  primary: "background:#4f46e5;color:#fff;",
  danger: "background:#dc2626;color:#fff;",
  secondary: "background:#e5e7eb;color:#111827;",
};

export function Button({ variant = "primary", style, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      style={{
        padding: "10px 18px",
        borderRadius: 8,
        border: "none",
        fontWeight: 600,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
        ...Object.fromEntries(
          variantStyles[variant]
            .split(";")
            .filter(Boolean)
            .map((rule) => rule.split(":").map((s) => s.trim()))
        ),
        ...style,
      }}
    />
  );
}
