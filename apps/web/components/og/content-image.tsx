import { SITE, type Difficulty } from "@repo/shared";
import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * Images are rendered outside the page, where the CSS design tokens do not
 * exist, so this one fixed palette mirrors the dark theme's tokens.
 */
const PALETTE = {
  background: "#14151c",
  foreground: "#eef0f6",
  muted: "#a6aab8",
  primary: "#9fb0ff",
  easy: "#5fd49a",
  medium: "#f1c45a",
  hard: "#f08f80",
} as const;

/** The Open Graph card for a paper or a problem (docs/specs/08-web.md §9). */
export function contentImage({
  eyebrow,
  title,
  subtitle,
  difficulty,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  difficulty?: Difficulty;
}): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: PALETTE.background,
        color: PALETTE.foreground,
      }}
    >
      <div style={{ display: "flex", fontSize: 30, color: PALETTE.primary }}>
        {SITE.name}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 28, color: PALETTE.muted }}>
          {eyebrow}
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: PALETTE.muted,
            lineHeight: 1.35,
          }}
        >
          {subtitle.length > 140 ? `${subtitle.slice(0, 137)}…` : subtitle}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 28, gap: 24, alignItems: "center" }}>
        {difficulty ? (
          <div
            style={{
              display: "flex",
              padding: "8px 20px",
              borderRadius: 12,
              border: `3px solid ${PALETTE[difficulty]}`,
              color: PALETTE[difficulty],
              textTransform: "capitalize",
            }}
          >
            {difficulty}
          </div>
        ) : null}
        <div style={{ display: "flex", color: PALETTE.muted }}>{SITE.tagline}</div>
      </div>
    </div>,
    OG_IMAGE_SIZE,
  );
}
