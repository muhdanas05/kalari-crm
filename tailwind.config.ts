import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ════ Kalari Tours and Travels — navy + gold ════
        // Sampled from kalaritravels.in/logo.svg: the emblem navy is #0F365D
        // (deep) / #031D3C (darker), the gold is #C7890A.
        //
        // WHY NAVY IS THE ACCENT AND GOLD IS NOT:
        // The accent role is interactive — primary buttons, active nav — and it
        // carries WHITE TEXT. Gold #C7890A against white is ~3.4:1, which fails
        // WCAG AA for anything under 18px. Navy is ~11:1. So navy takes the
        // interactive role and gold takes the brand role (the mark, eyebrows,
        // rules, premium moments). That reads as the logo AND stays legible;
        // gold buttons would look right in a mockup and fail on a real phone in
        // real daylight.
        accent: "#0F365D", // navy — buttons, active nav, links, focus
        "accent-deep": "#031D3C", // hover / pressed — the logo's own darker navy
        "accent-soft": "#4C74A6", // highlight on dark
        "accent-pale": "#D9E3EF", // pale surface
        "accent-mist": "#EFF4F9", // faint wash (active nav, focus rings)

        // ── Gold — brand highlight, used sparingly ──
        // `gold` is for FILLS and graphics. `gold-deep` is the text-safe one
        // (~5.5:1 on paper) — never set small type in `gold` itself.
        gold: "#C7890A", // the logo's own gold
        "gold-deep": "#8F6207", // gold TEXT on light surfaces
        "gold-soft": "#E0A83C", // gold on dark
        "gold-pale": "#F8ECD2",
        "gold-mist": "#FDF8EE",

        // ── Paper + surfaces ── a hint of warmth so gold doesn't go grey and
        // navy doesn't go cold-clinical.
        paper: "#FAF9F6",
        "paper-deep": "#F0EEE8",
        surface: "#FFFFFF",
        "surface-alt": "#F7F6F2",

        // ── Ink ── near-black with a navy cast, so body copy belongs to the
        // brand rather than sitting on top of it.
        ink: "#0A1428",
        "ink-strong": "#050A16",
        "ink-soft": "#232C42",
        "ink-mid": "#626B80",
        "ink-faint": "#949BAB",
        "ink-ghost": "#C3C8D4",

        // ── Hairlines ──
        line: "#E5E3DC",
        "line-strong": "#CDCBC2",

        // ── Semantic. These carry MEANING; never reuse them decoratively. ──
        // `warn` is pushed ORANGE, away from the gold: an amber "attention"
        // state next to a gold brand accent means the warning stops registering
        // as a warning. Money overdue must not look like a flourish.
        ok: "#1F7A4C", // paid, complete, won
        "ok-pale": "#DCF5E6",
        warn: "#C2610A", // due, pending, attention
        "warn-pale": "#FBEAD9",
        alert: "#C62828", // overdue, stuck, blocked, error
        "alert-pale": "#FBE4E4",
        info: "#2B5FA8",
        "info-pale": "#DEE9F8",
      },
      fontFamily: {
        // Senator visual lock: Manrope (display+body) + JetBrains Mono.
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        // `font-display` kept as an alias to Manrope so existing title classes
        // resolve (no serif family — Source Serif 4 removed).
        display: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        floating:
          "0 1px 2px rgba(20,20,30,0.04), 0 4px 12px rgba(20,20,30,0.06)",
        "card-hover":
          "0 6px 24px -8px rgba(15, 54, 93, 0.22), 0 2px 6px -2px rgba(15, 54, 93, 0.12)",
      },
      letterSpacing: {
        micro: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
