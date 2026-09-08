import { THE_FIRST_ID } from "./types";

export type AgentRef = { id: string; name: string };

export type AgentTint = {
  /** Main accent, readable on the dark brown sheet. */
  hex: string;
  /** Highlight stop for the face radial. */
  hi: string;
  /** Shadow stop for the face radial. */
  lo: string;
  /** "r, g, b" for rgba(var(--agent-rgb), a). */
  rgb: string;
};

/** Blob Builder / default brand — warm sepia. */
export const BRAND_TINT: AgentTint = {
  hex: "#d4b48a",
  hi: "#f0e2c8",
  lo: "#7a6244",
  rgb: "212, 180, 138",
};

/** TheFirst — dusty steel blue. */
const FIRST_TINT: AgentTint = {
  hex: "#7eafd4",
  hi: "#d2e6f4",
  lo: "#355a78",
  rgb: "126, 175, 212",
};

/** Growth — light silver, still visible on dark brown. */
const GROWTH_TINT: AgentTint = {
  hex: "#ddd8d0",
  hi: "#f7f4ef",
  lo: "#7a7670",
  rgb: "221, 216, 208",
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function hsl(hDeg: number, s: number, l: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const sat = clamp01(s);
  const light = clamp01(l);
  if (sat === 0) {
    const v = Math.round(light * 255);
    return [v, v, v];
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

function hexOf(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function tintFromHsl(h: number, s: number, l: number): AgentTint {
  const [r, g, b] = hsl(h, s, l);
  const [hr, hg, hb] = hsl(h, s * 0.42, Math.min(0.93, l + 0.16));
  const [lr, lg, lb] = hsl(h, Math.min(0.55, s + 0.1), Math.max(0.28, l * 0.45));
  return {
    hex: hexOf(r, g, b),
    hi: hexOf(hr, hg, hb),
    lo: hexOf(lr, lg, lb),
    rgb: `${r}, ${g}, ${b}`,
  };
}

function fnv1a(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable pastel from agent id. Avoids brand-brown / chartreuse hues. */
function hashTint(id: string): AgentTint {
  const n = fnv1a(id);
  let hue = n % 360;
  if (hue >= 18 && hue < 78) hue = 78 + (hue - 18);
  const sat = 0.38 + ((n >>> 8) % 10) / 100;
  const light = 0.7 + ((n >>> 16) % 7) / 100;
  return tintFromHsl(hue, sat, light);
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function namedTint(agent: AgentRef): AgentTint | null {
  if (agent.id.toLowerCase() === THE_FIRST_ID.toLowerCase()) return FIRST_TINT;
  const key = slug(agent.name);
  if (key === "thefirst") return FIRST_TINT;
  if (key === "blobbuilder") return BRAND_TINT;
  if (key === "growth") return GROWTH_TINT;
  return null;
}

export function agentTint(agent: AgentRef | null | undefined): AgentTint {
  if (!agent) return BRAND_TINT;
  return namedTint(agent) ?? hashTint(agent.id || agent.name || "agent");
}

export function applyAgentTint(el: HTMLElement, tint: AgentTint): void {
  el.style.setProperty("--agent", tint.hex);
  el.style.setProperty("--agent-hi", tint.hi);
  el.style.setProperty("--agent-lo", tint.lo);
  el.style.setProperty("--agent-rgb", tint.rgb);
}
