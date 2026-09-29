import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))"
        ,sidebar: "hsl(var(--sidebar))"
        ,surface: "hsl(var(--surface))"
        ,"surface-raised": "hsl(var(--surface-raised))"
        ,selected: "hsl(var(--selected))"
        ,focus: "hsl(var(--focus))"
      },
      boxShadow: {
        soft: "0 12px 32px rgb(0 0 0 / 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
