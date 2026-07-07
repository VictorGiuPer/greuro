# Budgeting App — Visual Design Specification

A precise textual description of three mobile screens (Overview, Transactions, Reminders), written so it can be implemented directly without reference to the source images. All hex values are close-read approximations — accurate to within a shade or two; treat them as starting tokens to fine-tune, not sacred constants. Target device: iPhone-class portrait, ~390pt logical width, safe-area insets respected top and bottom.

---

## 1. Global design system (shared across all three screens)

### 1.1 Background & ambient light ("halation")
- Base background is a near-black, very slightly blue-cool dark: approx `#0A0B0E` at the darkest.
- It is NOT flat black. There is a subtle large-radius radial glow ("halation") — a faint, low-opacity bluish-teal bloom sitting behind the content, brightest around the upper-center of the screen and falling off to near-black at the edges and bottom. Think of it as one soft `radial-gradient(ellipse at 50% 30%, rgba(30,60,70,0.25), transparent 70%)` layered over `#0A0B0E`. It is very restrained — you notice it as depth, not as a visible gradient.
- Corners of the screen are the darkest; there is a gentle vignette.

### 1.2 Cards / surfaces
- Cards sit on the background as slightly-lifted dark panels: fill approx `#14161B` (a desaturated near-black grey, marginally warmer/lighter than the page).
- Corner radius: large and soft, ~18–20px on cards, ~14–16px on inner elements (icon tiles, pills).
- Border: a hairline ~1px stroke at very low opacity, approx `rgba(255,255,255,0.06)`, which reads as a faint lighter edge catching light. Some cards additionally have an almost-imperceptible outer glow.
- Elevation is expressed through the lighter fill + hairline border + faint glow, NOT through hard drop shadows. Shadows, where present, are large, soft, very low opacity, near-black.
- Vertical gap between stacked cards: ~14–16px. Horizontal screen padding: ~18–20px on both sides.

### 1.3 Color tokens
- **Primary accent (teal/aqua):** approx `#2EE8C6` — a bright cyan-leaning green. Used for: active states, primary monetary values on the dashboard, the FAB, the active bottom-tab, the largest donut segment, dropdown/active-pill highlights, and "Actual" line on charts. It carries a soft outer glow wherever it appears prominently (FAB, active pill, active tab icon).
- **Positive / income green:** approx `#4ADE80` — slightly warmer/greener than the accent teal. Used for income amounts (`+$…`), and the "▲ x% vs last month" trend text.
- **Negative / expense red:** approx `#F87171` — a soft coral red, not harsh. Used for expense amounts (`-$…`).
- **Transfer / neutral amount:** light grey-white, approx `#D6D9DE`. Transfers are deliberately NOT colored red or green.
- **Primary text (white):** `#FFFFFF` for headline numbers and row titles; `#F3F4F6` acceptable.
- **Secondary / muted text:** approx `#8A909B` — grey, used for section labels, category sub-labels, axis ticks, dates, legend values.
- **Category color palette** (used for donut segments and icon-tile glyphs):
  - Teal `#2EE8C6` — Housing / groceries / internet
  - Green `#5EEAD4`→`#6EE7B7` — Food & Dining (a lighter mint-green, distinct from accent)
  - Blue `#60A5FA` — Transportation / credit card
  - Amber/Orange `#F59E0B` — Shopping / fuel
  - Purple `#A78BFA` — Entertainment / insurance
  - Indigo `#6366F1` — "Other"
  - Pink/Magenta `#F472B6` — Personal Care (gym)
  - Gold `#FBBF24` — Savings (education fund)

### 1.4 Typography
- Sans-serif, SF-Pro / Inter character. Tight, modern, high legibility.
- **Hero numbers** (dashboard card values, donut center total): ~28–32px, bold (700).
- **Screen title** ("Upcoming Reminders"): ~22–24px, semibold (600), white.
- **Section labels** ("Spending by Category", card headers): ~14–15px, medium (500), white or near-white.
- **Row primary** (transaction/reminder name): ~15–16px, medium (500), white.
- **Row secondary** (category, date, "vs last month"): ~12–13px, regular (400), muted grey.
- **Legend / axis / small print:** ~11–12px, muted grey.
- Numbers are tabular where aligned in columns (right-aligned amounts).

### 1.5 Bottom tab bar (all three screens)
- Fixed to bottom, spanning full width, sitting above the home-indicator safe area.
- Background is the dark surface, subtly elevated/translucent over content, with a hairline top border `rgba(255,255,255,0.06)`.
- Three items, evenly spaced, each an icon above a small text label (~11px):
  1. **Overview** — pie/donut-segment icon
  2. **Transactions** — horizontal-lines / list icon
  3. **Reminders** — bell icon
- Active item: icon + label in accent teal `#2EE8C6` with a soft glow. Inactive items: muted grey `#8A909B`, no glow.

### 1.6 Floating action button (Transactions & Reminders screens)
- Circular, ~56px diameter, bottom-right, floating ~16–20px above the tab bar and ~18px from the right edge.
- Fill: accent teal `#2EE8C6` (may be a very slight vertical teal gradient). Centered white `+` glyph, bold.
- Pronounced soft teal glow / halation radiating outward — this is the single most "glowing" element on the screen.

### 1.7 Status bar
- Standard iOS: `9:41` top-left in white; cellular, wifi, battery glyphs top-right in white. Transparent over the app background.

---

## 2. Screen 1 — Overview (Dashboard)

Active tab: **Overview**. This screen scrolls vertically; content top-to-bottom:

### 2.1 Period filter (segmented control) — top, below status bar
- A single pill-shaped container spanning most of the width, dark surface fill, containing four equal segments: **Week · Month · Quarter · Year**.
- **"Month" is the active segment:** filled with a teal-tinted rounded pill (accent teal, either solid with dark text or a teal fill with a soft glow) and its label reads as highlighted. The other three labels are muted grey on the transparent track.

### 2.2 "Spending by Category" section
- Left-aligned section label "Spending by Category" (white, medium) directly above the chart block.
- **Donut chart** on the LEFT half:
  - A ring (donut, not full pie) with a thick stroke and rounded/segmented arcs, moderate gap feel between segments.
  - **Center label:** "$3,450" in large bold white, with "Total" beneath it in small muted grey, both centered inside the ring.
  - Segment order & colors (clockwise, largest first): Housing teal, Food & Dining mint-green, Transportation blue, Shopping amber, Entertainment purple, Other indigo.
- **Legend** on the RIGHT half, vertically stacked rows, each row: a small colored dot (matching segment) + category name (white, left) … value + percentage (muted grey, right-aligned):
  - ● Housing — $1,350 (39%)
  - ● Food & Dining — $720 (21%)
  - ● Transportation — $450 (13%)
  - ● Shopping — $380 (11%)
  - ● Entertainment — $280 (8%)
  - ● Other — $270 (8%)

### 2.3 Two summary cards (side by side, equal width, ~12px gap)
- **Left card — "Net Earnings This Month":**
  - Small header row: label "Net Earnings This Month" (muted/white small) with a small calendar glyph top-right of the card.
  - Value: "$5,860.00" — large bold, **accent teal**.
  - Trend line beneath: "▲ 8.4% vs last month" — up-arrow + percentage in **green**, "vs last month" in muted grey.
- **Right card — "Cash Flow":**
  - Header row: label "Cash Flow" with a small transfer/swap glyph (up-down arrows ⇅) top-right, teal-tinted.
  - Value: "$2,410.00" — large bold, **accent teal**.
  - Trend beneath: "▲ 12.7% vs last month" — green up-arrow + percentage, muted "vs last month".

### 2.4 "Net Worth Over Time" card (full width)
- Header row inside the card: title "Net Worth Over Time" (white, medium) on the LEFT; a small dropdown control "6 Months ⌄" on the RIGHT (rounded pill, dark, muted-grey text + chevron).
- **Line chart** below the header:
  - Y-axis labels on the left, muted grey, from bottom to top: `$20K, $30K, $40K, $50K, $60K`.
  - X-axis labels along the bottom, muted grey: `Jan Feb Mar Apr May Jun Jul Aug`.
  - **Actual series:** a solid **teal** line, gently rising with small month-to-month wiggle, running from Jan up to roughly Jun. Beneath the solid portion is a subtle teal-to-transparent area gradient fill.
  - **Forecast series:** from roughly Jun onward the line continues as a **dashed teal** line trending upward, NO area fill (or much fainter). It visually reads as a projection.
  - **Data-point tooltip:** a highlighted point around May with a filled teal dot and a small dark tooltip label reading "$48,750" with "May" beneath. A faint vertical guide may drop from that point.
  - **Chart legend** beneath the plot, centered: "— Actual" (solid teal swatch) and "-- Forecast" (dashed teal swatch), labels in muted grey.

### 2.5 Bottom tab bar
- **Overview active** (teal pie icon + teal "Overview" label, glowing); Transactions and Reminders muted grey.

---

## 3. Screen 2 — Transactions

Active tab: **Transactions**. A search/filter header pinned at top, then a scrollable date-grouped list, with the FAB floating bottom-right.

### 3.1 Search + filter header (top, below status bar)
- **Search field:** a full-width rounded pill (radius ~14px), dark surface fill, with a magnifying-glass glyph on the left and placeholder text "Search transactions" in muted grey.
- **Filter button:** to the RIGHT of the search field, a separate rounded-square button (~44px) with a funnel/filter glyph, teal-tinted, dark fill — visually distinct from the search pill.

### 3.2 Transaction list — grouped by date
- **Date group headers:** left-aligned, muted grey, small (~12–13px), e.g. "May 20, 2025". They introduce each day's group with a bit of vertical space above.
- **Transaction row layout** (repeated), left → right:
  1. **Icon tile:** rounded-square (~40–44px, radius ~12px), dark fill with a subtle tint of the category color, containing a category glyph in that category's color.
  2. **Two-line text block** (left-aligned, takes remaining width): line 1 = merchant/description, white, medium; line 2 = category name, muted grey, small.
  3. **Amount** (right-aligned): expenses in red `-$…`, income in green `+$…`, transfers in neutral grey-white `-$…` (no red/green).
- Rows are separated by subtle spacing / faint hairline dividers; the whole day-group may sit on one card-like surface.

**Exact seed content (top to bottom):**

*May 20, 2025*
- 🛒 cart icon (teal tile) — **Grocery Market** / Food & Dining — **-$68.42** (red)
- 🚗 car icon (blue tile) — **City Transit** / Transportation — **-$25.00** (red)
- 💼 briefcase icon (green tile) — **Design Services** / Income — **+$1,250.00** (green)
- ⇄ transfer-arrows icon (grey tile) — **Checking → Savings** / Transfer — **-$500.00** (neutral grey-white)

*May 19, 2025*
- 🍴 fork-knife icon (teal/green tile) — **Cafe Delight** / Food & Dining — **-$14.75** (red)
- 🛍 shopping-bag icon (blue tile) — **Online Store** / Shopping — **-$89.99** (red)
- 🏠 house icon (red/coral tile) — **Rent Payment** / Housing — **-$1,200.00** (red)

*May 18, 2025*
- 🎵 music-note icon (purple tile) — **Music Stream** / Entertainment — **-$9.99** (red)
- ⛽ fuel-pump icon (orange tile) — **Fuel Stop** / Transportation — **-$45.30** (red)
- 💼 briefcase icon (green tile) — **Paycheck** / Income — **+$3,2xx.xx** (green) *(partially occluded by the FAB in the reference)*

### 3.3 FAB + tab bar
- Teal glowing circular **+** FAB, bottom-right (per §1.6).
- **Transactions active** in the tab bar (teal list icon + teal label).

---

## 4. Screen 3 — Reminders

Active tab: **Reminders**. Uses a screen title (not a period filter), then a vertical list of reminder cards, FAB bottom-right.

### 4.1 Screen title
- "Upcoming Reminders" — large white semibold heading, left-aligned, below the status bar.

### 4.2 Reminder list — one card/row per item
- **Row layout** left → right:
  1. **Icon tile:** rounded-square (~44px, radius ~12px), dark fill tinted with the category color, glyph in category color.
  2. **Two-line text block:** line 1 = reminder name (white, medium); line 2 = category (muted grey, small).
  3. **Right column, right-aligned:** line 1 = amount (white, bold); line 2 = due date (muted grey, small). For items due soon, a small **badge** appears in this column (below the date).
- **"Due Soon" badges:** small rounded-pill badges with subtle tinted fill + colored text. Two urgency variants observed:
  - **Teal** "Due Soon" badge (accent teal text on faint teal fill) — near-term.
  - **Amber/orange** "Due Soon" badge — more urgent / sooner.
- Rows separated by faint hairline dividers; consistent vertical rhythm.

**Exact seed content (top to bottom):**
- 📶 wifi icon (teal tile) — **Internet Service** / Utilities — **$59.99** / May 23, 2025 — badge: **Due Soon (teal)**
- 🛡 shield icon (purple tile) — **Insurance Premium** / Insurance — **$120.00** / May 25, 2025 — badge: **Due Soon (amber)**
- 💳 credit-card icon (blue tile) — **Credit Card Payment** / Credit & Debt — **$350.00** / May 28, 2025 — no badge
- 📱 phone icon (green tile) — **Mobile Plan** / Utilities — **$45.00** / May 30, 2025 — no badge
- 🏋 dumbbell icon (pink/magenta tile) — **Gym Membership** / Personal Care — **$29.99** / Jun 2, 2025 — no badge
- 🎓 graduation-cap icon (gold tile) — **Education Fund** / Savings — **$200.00** / Jun 5, 2025 — no badge

### 4.3 FAB + tab bar
- Teal glowing circular **+** FAB, bottom-right (per §1.6).
- **Reminders active** in the tab bar (teal bell icon + teal label).

---

## 5. Implementation notes / cross-cutting details
- Everything is dark-mode-only; there is no light theme in these references.
- The "glow" aesthetic is achieved with soft, low-opacity outer glows on: the FAB, the active period pill, the active tab icon, and (subtly) the accent-teal chart line — plus the single large ambient background halation. Do not over-apply glow to text or every card; it is selective.
- Monetary formatting: `$` prefix, thousands separators, two decimals, sign prefix for transactions (`+` income / `-` expense & transfer).
- Amounts and right-hand columns are right-aligned; category/name columns are left-aligned; icon tiles are fixed-width so text baselines line up across rows.
- Charts: teal solid = actual, teal dashed = forecast; area-gradient fill only under the actual/historical portion.
- Keep corner radii generous and consistent; keep hairline borders at ~6% white; keep muted text around `#8A909B`.