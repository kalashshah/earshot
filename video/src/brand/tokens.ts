// Brand tokens: the only place a colour, face or type size is written down. Acts import these;
// scripts/lint-film.mjs fails any hex colour that is not declared here.
//
// Earshot's own palette: web/src/app/globals.css dark theme. Brand-supplied (BRIEF.md).
import type React from 'react';
import { safeInsets } from '../lib/safe';
import { H, W } from '../timeline';

export const C = {
  ink: '#111113', // the stage: the web app's dark --bg, and the watch's black reads as one with it
  ink2: '#18181B', // raised panels (--panel)
  sunk: '#1F1F23', // wells, device bezels (--sunk)
  line: '#2A2A2F', // hairlines (--line)
  line2: '#3A3A40', // strong hairlines (--line-strong)
  paper: '#ECECEF', // type on the stage (--text)
  mute: '#A0A0A8', // secondary type (--muted)
  faint: '#6E6E76', // tertiary (--faint)
  dot: '#5E5C57', // the orb's resting dots (--particle-ink)
  white: '#FFFFFF',
  black: '#000000', // device screens
  // Device hardware, drawn rather than photographed: a space-black aluminium watch case and a
  // titanium phone rim. Neutral greys only, so the product's own orange stays the one accent.
  metalHi: '#8C8C93', // the lit edge of the case
  metal: '#4A4A50', // the case body
  metalLo: '#1C1C1F', // the case in shadow
  band: '#232326', // the sport band
  bandHi: '#36363A', // the band's rounded crest
  stage: '#1B1B1F', // the soft pool of light the devices sit in
  // The one accent, and what it means: "Earshot heard this". It lights the words the watch
  // caught and the answers it gives back. cinetic:brand-supplied orange: Earshot's --accent (dark theme)
  accent: '#FF5A14',
};

export const FONT = {
  text: '"Bricolage Grotesque Variable", system-ui, sans-serif', // the film's one sans, for every role; typeStyle and measure.ts read it
  mono: '"JetBrains Mono Variable", ui-monospace, monospace',
};

/** Faces the FontGate waits for before anything renders or measures (one entry per weight in use). */
export const FACES = ['400 16px "Bricolage Grotesque Variable"', '600 16px "Bricolage Grotesque Variable"', '400 16px "JetBrains Mono Variable"'];

/** Layout unit: 1 at 1080p, scales every size with the short side of the frame (16:9, 9:16, 1:1). */
export const U = Math.min(W, H) / 1080;

// One token per role, reused everywhere, so nothing is "almost matched" (size in px at 1080p).
export const TYPE = {
  display: { size: 120, weight: 600, track: -0.045, lead: 1.0 }, // statements and the wordmark
  line: { size: 64, weight: 500, track: -0.025, lead: 1.1 }, // fragment chains (fx/Chain): a quiet line in open space, up to ~8 words
  secondary: { size: 48, weight: 450, track: -0.02, lead: 1.15 }, // descriptor lines, URLs
  ui: { size: 24, weight: 500, track: -0.01, lead: 1.3 }, // smallest readable size on screen
};

/** CSS for a type role at a size (px). Tabular figures always, so numbers never jitter in width. */
export const typeStyle = (role: keyof typeof TYPE, size = TYPE[role].size * U): React.CSSProperties => ({
  fontFamily: FONT.text,
  fontSize: size,
  fontWeight: TYPE[role].weight,
  letterSpacing: `${TYPE[role].track}em`,
  lineHeight: TYPE[role].lead,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'pre',
});

/**
 * Safe margins for a w x h frame as a symmetric envelope: the larger inset of each pair from the
 * frame's safe-zone preset (src/lib/safe.ts), so a centred layout that fits inside clears every
 * side. 96 x 64 px at 1920x1080; 120 x 420 at 1080x1920, where the feed zones are asymmetric
 * (use safeBox() from lib/safe.ts there to centre on the clear band instead of the frame).
 */
export const safeArea = (w: number, h: number) => {
  const i = safeInsets(undefined, w, h);
  return { x: Math.max(i.left, i.right), y: Math.max(i.top, i.bottom) };
};
/** The film's safe margins; text stays inside them (scripts/layout-audit.sh checks). */
export const SAFE = safeArea(W, H);
