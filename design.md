# DevGrade — Design Guidelines (`design.md`)

Visual identity and interface rules for DevGrade. **AI agents and contributors
must follow this file when building or changing UI.** It defines the brand,
the design tokens, and the component/interaction rules so the product stays
visually consistent.

Scope: this is about **look, feel, and interface behavior**. For architecture and
data rules see [`AGENTS.md`](./AGENTS.md); for product intent see [`prd.md`](./prd.md).

---

## 1. How to use this file

- Treat the **design tokens in §4–§7 as the only source of truth**. Never
  hardcode a hex/rgb/oklch value or a raw pixel font size in a component — use the
  semantic Tailwind token (`bg-primary`, `text-muted-foreground`, `rounded-lg`,
  `font-sans`).
- Build UI from the shared **`@workspace/ui`** library. Add new primitives with
  the shadcn CLI (`pnpm dlx shadcn@latest add <component> -c apps/web`) so they
  land in `packages/ui/src/components` with the project's style baked in.
- If a design need isn't covered by an existing token, **add a token**, don't
  inline a one-off value.

---

## 2. Brand personality

DevGrade is a **calm, credible, developer-facing assessment tool**. The feel is
focused and quietly confident — closer to a well-made IDE than a gamified quiz.

| Do                                                  | Avoid                                        |
| --------------------------------------------------- | -------------------------------------------- |
| Clean, generous whitespace; content-first           | Dense, busy dashboards                       |
| One confident green accent, mostly neutral surfaces | Rainbow palettes, multiple competing accents |
| Restraint in motion — subtle, purposeful            | Bouncy, decorative animation                 |
| Precise, legible typography                         | Playful/display fonts                        |
| Neutral, non-judgmental tone in results             | Alarmist red-everywhere failure states       |

---

## 3. Design system foundation

| Concern       | Standard                                                           |
| ------------- | ------------------------------------------------------------------ |
| CSS engine    | Tailwind CSS v4 (`@import "tailwindcss"`)                          |
| Component kit | shadcn/ui, style **`base-nova`**, base color **neutral**           |
| Primitives    | **Base UI** (`@base-ui/react`) wrapped with **CVA** variants       |
| Class merge   | `cn` helper (`@workspace/ui/lib/utils`)                            |
| Icons         | **Phosphor** (`@phosphor-icons/react`)                             |
| Tokens        | OKLCH CSS variables in `packages/ui/src/styles/globals.css`        |
| Theming       | Light default + `.dark` class; CSS variables, `cssVariables: true` |
| Direction     | **RTL enabled** (`rtl: true`) — author with logical properties     |

`globals.css` is the single stylesheet (imported once via
`@workspace/ui/globals.css`). Token definitions and the `@theme inline` mapping
live there; do not fork or duplicate it.

---

## 4. Color

Colors are **semantic tokens**, defined in OKLCH for both themes. Reference them
through Tailwind utilities (`bg-*`, `text-*`, `border-*`, `ring-*`) — never the
raw variable or a literal color.

### Core tokens

| Token (utility)                      | Role                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| `background` / `foreground`          | Page surface and default text                                    |
| `card` / `card-foreground`           | Raised surfaces (question cards, report panels)                  |
| `popover` / `popover-foreground`     | Menus, tooltips, dropdowns                                       |
| `primary` / `primary-foreground`     | **Brand green** — primary actions, active/selected, "proficient" |
| `secondary` / `secondary-foreground` | Low-emphasis buttons and chips                                   |
| `muted` / `muted-foreground`         | Subtle backgrounds and secondary/meta text                       |
| `accent` / `accent-foreground`       | Hover/active neutral emphasis                                    |
| `destructive`                        | Errors and the "skill gap" state                                 |
| `border` / `input` / `ring`          | Hairlines, field borders, focus ring                             |
| `chart-1`…`chart-5`                  | Data visualization (the skill radar)                             |

### Rules

- **Primary is green** (`oklch(~0.53 0.15 150)`). It is the single brand accent —
  use it for the main CTA, selected answer, progress fill, and the "Proficient"
  tier. Don't introduce a second accent hue.
- **Neutrals do the heavy lifting.** Surfaces and text are neutral gray/white;
  color is a signal, not decoration.
- **`destructive` is reserved** for genuine errors and the skill-gap flag — not
  for general emphasis.
- **Always pair a surface with its `-foreground`** (e.g. `bg-primary
text-primary-foreground`) so contrast holds in both themes.
- **Support dark mode by default.** Because you use tokens, components theme
  automatically; never write a color that only works in one theme.

### Proficiency & pillar semantics

Map assessment outcomes to tokens (add a token before hardcoding a new hue):

| Meaning             | Token                            |
| ------------------- | -------------------------------- |
| Proficient (≥ 80%)  | `primary`                        |
| Developing (50–79%) | `muted-foreground` / `secondary` |
| Skill gap (< 50%)   | `destructive`                    |

The **skill radar** uses the `chart-1…5` tokens as **categorical pillar colors**
(theme-independent — the same hue in light and dark). They map to the pillars in
`SKILL_CATEGORIES` order:

| Token     | Pillar                     | Hue         |
| --------- | -------------------------- | ----------- |
| `chart-1` | Reactivity & State         | brand green |
| `chart-2` | Lifecycle & Effects        | blue        |
| `chart-3` | Performance & Optimization | amber       |
| `chart-4` | Async & Data               | purple      |
| `chart-5` | neutral fallback           | muted gray  |

Reference them as `bg-chart-2`, `text-chart-3`, etc. Add a new `--chart-*` token
in `globals.css` before inlining any color in the chart.

### Code-syntax tokens

Code snippets in questions are highlighted with dedicated `--code-*` tokens
(defined in `globals.css`, `--code-fn`/`--code-string` re-tuned for the dark
surface). They are **not** mapped in `@theme`, so reference them directly with an
arbitrary value: `text-[var(--code-fn)]`.

| Token            | Role                                         |
| ---------------- | -------------------------------------------- |
| `--code-keyword` | Keywords (`const`, `function`) — brand green |
| `--code-fn`      | Function / hook names — blue                 |
| `--code-string`  | String & numeric literals — teal             |
| `--code-comment` | Comments — muted, italic                     |
| `--code-punct`   | Punctuation — muted                          |

---

## 5. Typography

| Token          | Family                   | Use                              |
| -------------- | ------------------------ | -------------------------------- |
| `font-sans`    | IBM Plex Sans (Variable) | Body, UI, labels — the default   |
| `font-heading` | Source Sans 3 (Variable) | Headings and section titles      |
| Monospace      | JetBrains Mono           | Code blocks and inline code only |

Rules:

- Body text defaults to `font-sans`; apply `font-heading` to `h1`–`h3` and
  prominent titles.
- **All code — question snippets and inline code — is monospace** (PRD §4.3:
  JetBrains Mono). Render code on a `muted`/`card` surface with clear contrast.
  (Token wiring for the mono font is pending; wire it in `globals.css` as
  `--font-mono` before shipping code UI, and reference it as `font-mono`.)
- Use Tailwind's type scale (`text-sm`, `text-base`, `text-lg`, …); default UI
  control text is `text-sm`. Don't set arbitrary pixel sizes.
- Weight: `font-medium` for controls/labels, `font-semibold`/`font-bold` for
  headings. Avoid ultra-thin weights.
- Keep line length readable (~60–75ch) for prompts and explanations.

---

## 6. Spacing, radius & layout

- **Radius** derives from `--radius: 0.45rem`. Use the scale — `rounded-sm`,
  `rounded-md`, `rounded-lg` (base), up to `rounded-4xl`. Buttons/inputs/code use
  `rounded-lg`; **cards use `rounded-2xl`**; pills/badges use `rounded-4xl`.
  Don't use raw `rounded-[Npx]`.
- **Spacing** uses Tailwind's 4px-based scale (`p-2`, `gap-4`, `space-y-6`).
  Prefer consistent rhythm over bespoke margins.
- **Layout:** center content in a constrained container (`container mx-auto`)
  with comfortable padding; assessment screens are single-column and content-led,
  not multi-panel dashboards.
- **Direction-agnostic spacing:** use **logical properties** — `ms-*`/`me-*`,
  `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`/`text-end` — never `ml/mr`,
  `pl/pr`, `left/right`. This is what makes RTL work (see §10).

---

## 7. Iconography

- Use **Phosphor** icons (`@phosphor-icons/react`). Don't mix icon sets.
- Default icon size is `size-4` (buttons wire this automatically); scale with the
  control (`size-3` in `xs`/`sm`). Keep stroke weight consistent.
- Icons are decorative by default — give interactive icon-only controls an
  accessible label (`aria-label`).

---

## 8. Components

Components live in `packages/ui/src/components`, are built on Base UI primitives,
and expose variants via CVA. Follow the established pattern (see `button.tsx`):

- **Variants via CVA**, merged with `cn(...)`; expose `VariantProps` in the props
  type. Reuse the shared variant vocabulary rather than inventing per-component
  names.
- **`data-slot` attributes** on the root of each primitive (e.g.
  `data-slot="button"`) for styling/testing hooks.
- **Consume tokens only** inside variant classes (`bg-primary`, `border-border`,
  `text-muted-foreground`).

Button variant/size vocabulary to reuse across the UI:

| Variants | `default` · `outline` · `secondary` · `ghost` · `destructive` · `link`      |
| -------- | --------------------------------------------------------------------------- |
| Sizes    | `default` · `xs` · `sm` · `lg` · `icon` · `icon-xs` · `icon-sm` · `icon-lg` |

Primary CTA = `default` (green). Secondary/cancel = `outline` or `ghost`.
Destructive confirmations = `destructive`.

---

## 9. Interaction & motion

- **Focus:** every interactive element shows the visible focus ring
  (`focus-visible:ring-3 focus-visible:ring-ring/50` + `border-ring`). Never
  remove focus outlines.
- **Hover:** subtle token-based shift (e.g. `hover:bg-primary/80`,
  `hover:bg-muted`); use `color-mix(in oklch, …)` for tints when needed.
- **Press:** small, tactile feedback (`active:translate-y-px`) — nothing bouncy.
- **Disabled:** `opacity-50` + `pointer-events-none`.
- **Validation:** drive error styling from `aria-invalid` (border/ring in
  `destructive`), not ad-hoc classes.
- **Transitions:** `transition-all` with default durations; keep motion short and
  purposeful. Respect `prefers-reduced-motion`.
- Interactive elements use a pointer cursor (already set globally for
  `button`/`[role="button"]`).

---

## 10. Internationalization & RTL

RTL is a first-class requirement (`rtl: true`; PRD §4.3):

- Author **only** with logical properties (§6). A screen must mirror correctly by
  flipping `dir` with zero physical-direction overrides.
- Icons that imply direction (arrows, progress, "next") must flip with direction;
  prefer logical/auto-mirroring icons or swap by `dir`.
- Never assume left-to-right reading order in layout or animation.

---

## 11. Accessibility (WCAG 2.1 AA)

Non-negotiable baseline (PRD §4.3 / §10.2):

- **Contrast** ≥ 4.5:1 for text, ≥ 3:1 for UI/graphics. Token pairings are chosen
  to meet this in both themes — keep the `-foreground` pairing.
- **Keyboard:** full operability, logical tab order, visible focus. Answer
  options are real radios; the whole flow is completable without a mouse.
- **Semantics:** proper roles/labels; question sets use fieldset/legend or an
  equivalent grouping; icon-only buttons have `aria-label`.
- **Code blocks** must be screen-reader friendly (labelled, not conveyed by color
  alone).
- **Don't rely on color alone** — pair the proficiency color with text/icon
  (e.g. "Skill gap" label, not just red).

---

## 12. Assessment UI patterns

Domain-specific guidance for the candidate flow (PRD §4).

**Intake (framework + level):** clear single-choice selection; React enabled,
Vue/Angular shown as disabled "coming soon". Primary CTA to start.

**Question runner:**

- A single `card` per question: title (`font-heading`), prompt (`font-sans`),
  optional monospace code block, and **4 radio options (A–D)**.
- **Progress** (`N / Total`, 8 total) and a **per-question timer** are always
  visible; progress fill uses `primary`.
- Selected option uses `primary` emphasis; keep the selection obvious and
  keyboard-navigable.
- Loading and error/retry states come from the flow's states — show a calm inline
  spinner and a clear retry affordance, not a blocking modal.

**Report & skill radar:**

- Lead with the overall score and proficiency tier, then the **4-pillar radar**
  (`chart-*` tokens), then per-question correctness with explanations.
- Tier colors follow §4; **skill gaps** are flagged with `destructive` **and** a
  text label, each linking to remediation.
- Keep the tone neutral and constructive — this is feedback, not a verdict.

---

## 13. Quick rules for agents

- Use semantic tokens; **never hardcode colors, radii, or font sizes**.
- Support **light and dark** and **LTR and RTL** by default.
- Reuse `@workspace/ui` components and the CVA variant vocabulary; add new
  primitives via the shadcn CLI.
- **Green primary is the only accent.** Neutrals for surfaces; `destructive` only
  for real errors/gaps.
- Logical properties only. Visible focus always. Meet AA contrast.
- Need something new? **Add a token or a variant** — don't inline a one-off.
