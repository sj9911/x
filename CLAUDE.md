# CLAUDE.md

This file provides guidance for AI assistants working on this codebase.

## Project Overview

**x** (`x.sunnyjoshi.com`) is a static personal portfolio/experiment lab for Sunny Joshi — a Creative Director and UI/UX Designer. It showcases AI experiments, generative interfaces, creative coding prototypes, and design system explorations.

- **Type:** Zero-dependency static HTML site
- **Stack:** HTML5, CSS3, Vanilla JavaScript — no frameworks, no build step
- **Hosting:** Static (GitHub Pages, Netlify, Vercel, or any web server)

## Repository Structure

```
x/
├── index.html    # Entire site — HTML, CSS, and JS in one file (1040 lines)
└── README.md     # One-line project description
```

There is no `package.json`, `node_modules`, build configuration, or test suite. The entire codebase lives in `index.html`.

## Running Locally

Open `index.html` directly in a browser, or serve it with any static file server:

```bash
python -m http.server 8000
# or
npx serve .
```

No installation, compilation, or environment setup required.

## Architecture: `index.html` Layout

The file is organized into three logical sections:

| Lines | Section |
|-------|---------|
| 1–9 | HTML head — meta tags, Google Fonts (`Instrument Serif`) |
| 10–790 | `<style>` — all CSS, organized by component (see below) |
| 792–972 | HTML body — semantic markup |
| 973–1037 | `<script>` — all JavaScript |

### CSS Organization (lines 10–790)

CSS is written as flat rules inside a single `<style>` block, organized with section comments:

```
/* === Theme Variables === */      lines 11–78
/* === Ambient Background === */   lines 103–153
/* === Grain === */                lines 155–168
/* === Navigation === */           lines 170–250
/* === Theme Toggle === */         lines 251–299
/* === Main Content === */         lines 301–308
/* === Hero === */                 lines 310–475
/* === Section Styles === */       lines 477–509
/* === Glass Cards Grid === */     lines 511–638
/* === About Section === */        lines 649–698
/* === Divider === */              lines 700–706
/* === Footer === */               lines 708–739
/* === Animations === */           lines 741–762
/* === Responsive === */           lines 763–789
```

### HTML Structure (lines 792–972)

```
<body>
  .ambient-bg (.orb-1, .orb-2, .orb-3)   — floating background orbs
  .grain                                   — SVG noise texture overlay
  <nav>                                    — fixed top navbar
  <main>
    <section.hero>                         — full-viewport entry
    .divider
    <section#experiments>                  — 2-column card grid
    .divider
    <section#about>                        — bio + stats grid
    <footer>
```

### JavaScript (lines 973–1037)

Four self-contained blocks, each with a comment header:

| Block | What it does |
|-------|-------------|
| `// === Theme Toggle ===` | Reads/writes `localStorage` theme; respects `prefers-color-scheme` |
| `// === Scroll Hint fade ===` | Hides scroll indicator after 80px scroll |
| `// === Card Reveal ===` | `IntersectionObserver` staggered reveal (120ms delay per card) |
| `// === Ambient Parallax ===` | RAF-throttled scroll parallax on `.ambient-orb` elements |
| `// === Nav bg on scroll ===` | Swaps nav background CSS variable at 20px scroll |

## Design System

### Color Palette

Two global accent colors defined in `:root` (not theme-dependent):

```css
--lime: #C9FF15
--blue: #0703FF
```

In **dark mode**, `--accent` = `--lime`, `--accent-secondary` = `--blue`.
In **light mode**, they swap: `--accent` = `--blue`, `--accent-secondary` = `--lime`.

### Theming

Theme is controlled by `data-theme="dark|light"` on `<html>`. All colors are CSS custom properties. The complete token sets are defined at lines 18–78:

- Dark theme: `[data-theme="dark"]` — black background, white text, lime accent
- Light theme: `[data-theme="light"]` — off-white background, dark text, blue accent

**Rule:** Never use hardcoded color values in new CSS. Always use a CSS custom property so both themes work correctly.

### Typography

- **Headings/display:** `'Instrument Serif'` (loaded from Google Fonts) — italic variant used for emphasis
- **Body/UI:** System font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', ...`
- **Responsive type:** Use `clamp()` — e.g., `font-size: clamp(64px, 10vw, 120px)`

### Glass Morphism Pattern

All cards and overlapping UI elements use this pattern:

```css
background: var(--glass-bg);
border: 0.5px solid var(--glass-border);
border-radius: 20px;
backdrop-filter: blur(40px) saturate(150%);
-webkit-backdrop-filter: blur(40px) saturate(150%);
```

Always include both `-webkit-backdrop-filter` and `backdrop-filter` for Safari compatibility.

### Transitions

- Theme transitions use `var(--transition-theme)` = `0.5s cubic-bezier(0.4, 0, 0.2, 1)`
- Hover/interaction transitions use `0.3s ease` or `0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- Apply theme transition to any property that changes between dark/light: `transition: color var(--transition-theme), background var(--transition-theme), border-color var(--transition-theme)`

## Key Conventions

### Adding a New Experiment Card

Cards live inside `.experiments-grid` (around line 860). Each card follows this HTML pattern:

```html
<div class="glass-card">
    <div class="card-icon">🔣</div>
    <div class="card-title">Experiment Name</div>
    <div class="card-desc">
        Short description of what this explores.
    </div>
    <div class="card-tag">Category Label</div>
</div>
```

The `featured` variant spans 2 columns and includes a `.featured-visual` placeholder:

```html
<div class="glass-card featured">
    <div>
        <!-- card-icon, card-title, card-desc, card-tag -->
    </div>
    <div class="featured-visual">
        <span class="featured-visual-text">Coming soon</span>
    </div>
</div>
```

Cards are automatically observed by the `IntersectionObserver` — the `.visible` class is added on scroll. Do not set `opacity` or `transform` inline; let the observer handle it.

### CSS Rules

- Follow the existing `/* === Section Name === */` comment convention for new CSS blocks
- Use `var(--custom-property)` for all colors — never hardcode hex values in component CSS
- Mobile breakpoint is `768px` — add responsive overrides inside the existing `@media (max-width: 768px)` block at the bottom
- z-index layering: ambient-bg = 0, grain = 1, main content = 2, nav = 100

### JavaScript Rules

- No external libraries — vanilla JS only
- Use `passive: true` on all scroll event listeners
- Use `requestAnimationFrame` for any animation tied to scroll position
- Store user preferences in `localStorage`
- Avoid querying the DOM repeatedly — cache references at the top of each block

### No Build Step

There is intentionally no bundler, transpiler, or pre-processor. Write standard, modern browser-compatible HTML/CSS/JS. Do not introduce `npm`, `webpack`, `vite`, or any build tooling unless explicitly requested.

## What Not to Change

- The single-file architecture — do not split into multiple files without explicit direction
- Google Fonts import — `Instrument Serif` is a core design element
- The CSS custom property naming scheme — renaming tokens breaks both themes simultaneously
- The `data-theme` attribute convention on `<html>` — JS reads and writes this directly
