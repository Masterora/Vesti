import type { ReactElement } from "react";
import { siteName, siteTagline } from "@/lib/site";

const brandColors = {
  canvas: "#f8fafc",
  surface: "#ffffff",
  ink: "#0f172a",
  muted: "#475569",
  line: "#cbd5e1",
  accent: "#10b981",
  accentSoft: "#d1fae5"
};

type BrandMarkProps = {
  size: number;
};

type BrandCardProps = {
  width: number;
  height: number;
  eyebrow: string;
  title: string;
  subtitle: string;
};

export function BrandMark({ size }: BrandMarkProps): ReactElement {
  const borderWidth = Math.max(10, Math.floor(size * 0.035));

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Math.floor(size * 0.24),
        border: `${borderWidth}px solid ${brandColors.accentSoft}`,
        boxSizing: "border-box",
        background: brandColors.ink,
        color: brandColors.canvas,
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(16,185,129,0.24) 0%, rgba(15,23,42,0) 58%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          top: Math.floor(size * 0.16),
          right: Math.floor(size * 0.16),
          width: Math.floor(size * 0.12),
          height: Math.floor(size * 0.12),
          borderRadius: 9999,
          background: brandColors.accent
        }}
      />
      <span
        style={{
          fontSize: Math.floor(size * 0.52),
          fontWeight: 800,
          letterSpacing: "-0.08em",
          lineHeight: 1,
          transform: "translateY(-4%)"
        }}
      >
        V
      </span>
    </div>
  );
}

export function BrandCard({ width, height, eyebrow, title, subtitle }: BrandCardProps): ReactElement {
  const chips = ["Solana", "USDC", "Milestones"];

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        padding: Math.floor(width * 0.06),
        background: "linear-gradient(135deg, #f8fafc 0%, #ecfeff 100%)",
        color: brandColors.ink,
        fontFamily: "sans-serif"
      }}
    >
      <div
        style={{
          width: Math.floor(width * 0.008),
          borderRadius: 9999,
          background: brandColors.accent,
          marginRight: Math.floor(width * 0.04)
        }}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: Math.floor(width * 0.04)
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 24
            }}
          >
            <BrandMark size={112} />
            <div
              style={{
                display: "flex",
                flexDirection: "column"
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: brandColors.muted
                }}
              >
                {eyebrow}
              </span>
              <span
                style={{
                  marginTop: 8,
                  fontSize: 28,
                  fontWeight: 600,
                  color: brandColors.ink
                }}
              >
                {siteTagline}
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: Math.floor(width * 0.056),
              fontWeight: 800,
              letterSpacing: "-0.06em",
              lineHeight: 1.05
            }}
          >
            {title}
          </div>
          <div
            style={{
              maxWidth: Math.floor(width * 0.48),
              marginTop: 24,
              fontSize: Math.floor(width * 0.024),
              lineHeight: 1.45,
              color: brandColors.muted
            }}
          >
            {subtitle}
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 30
            }}
          >
            {chips.map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 18px",
                  borderRadius: 9999,
                  background: brandColors.surface,
                  border: `1px solid ${brandColors.line}`,
                  fontSize: 22,
                  fontWeight: 600,
                  color: brandColors.ink
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            width: Math.floor(width * 0.24),
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <BrandMark size={Math.floor(width * 0.22)} />
        </div>
      </div>
    </div>
  );
}

export { siteName };