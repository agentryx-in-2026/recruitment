# HireStream — UI Polish Sprint

**Phase:** 4.6 — UI Overhaul (follows Phase 4.5 Frontend Overhaul)  
**Created:** 13 Apr 2026  
**Trigger:** All features built and functional. Frontend looks like a developer prototype — needs professional government portal aesthetic.  
**Goal:** Transform every page from "basic and plain" to "polished government portal that impresses at demo"

---

## Research Sources

Patterns adopted from:
- **GOV.UK Design System** — typography hierarchy, status tags, form patterns
- **Singapore GovTech (SGDS)** — masthead banner, card-based dashboards
- **NCS India** — tricolor strip, bilingual header, search prominence
- **Australian myGov** — white cards with borders, generous whitespace
- **LinkedIn** — dashboard layout, profile completion ring, notification bell
- **Greenhouse/Lever** — recruiter dashboards, applicant pipeline, stat cards
- **Workday** — multi-step wizard, data tables

---

## Design System Tokens

### Color Palette

```
Primary (Government Blue):
  --gov-blue:       hsl(211, 80%, 42%)    #1565C0
  --gov-blue-light: hsl(211, 80%, 95%)    #E3F2FD
  --gov-blue-dark:  hsl(211, 80%, 28%)    #0D47A1

Success (Trust Green):
  --gov-green:      hsl(152, 69%, 31%)    #2E7D32

Accent (Action Orange):
  --gov-orange:     hsl(14, 100%, 57%)    #FF5722

Warning:
  --gov-amber:      hsl(38, 100%, 50%)    #FF9800

Error:
  --gov-red:        hsl(0, 73%, 46%)      #C62828

Neutrals:
  --slate-900: Body text        --slate-600: Secondary text
  --slate-100: Page background  --slate-50: Alt card background
```

### Typography Scale

```
H1 (Page Title):   text-3xl font-bold tracking-tight       30px
H2 (Section):      text-2xl font-semibold                   24px
H3 (Card Title):   text-lg font-semibold                    18px
H4 (Subsection):   text-base font-medium                    16px
Body:              text-sm text-slate-700                    14px
Caption:           text-xs text-slate-500                    12px
Badge:             text-[10px] font-medium uppercase tracking-wider
Stat Number:       text-3xl font-bold tabular-nums           30px
```

### Spacing System

```
Page padding:       py-6 px-4 sm:px-6 lg:px-8
Between sections:   space-y-6 (24px)
Stat card internal: p-5 (20px)
Content card:       p-6 (24px)
Card gap:           gap-4 (tight) / gap-6 (main layout)
List items:         space-y-3 (12px)
Label to input:     space-y-1.5 (6px)
```

### Status Badge System (consistent everywhere)

```
Applied/Pending:    bg-blue-50    text-blue-700    border-blue-200
In Review:          bg-amber-50   text-amber-700   border-amber-200
Shortlisted:        bg-purple-50  text-purple-700  border-purple-200
Interview:          bg-cyan-50    text-cyan-700    border-cyan-200
Selected/Approved:  bg-emerald-50 text-emerald-700 border-emerald-200
Rejected:           bg-red-50     text-red-700     border-red-200
Draft/Inactive:     bg-slate-50   text-slate-500   border-slate-200
```

---

## Implementation Checklist

### Pass 1: Foundation (Color + Typography + Layout)

- [ ] Add gov color tokens to tailwind.config.ts properly
- [ ] Set page background to `bg-slate-50` globally
- [ ] Add government masthead banner (tricolor strip + "HPSEDC Initiative")
- [ ] Standardize all heading sizes to the typography scale
- [ ] Add `tabular-nums` to all stat numbers
- [ ] Add `tracking-tight` to all H1/H2 headings
- [ ] Standardize card styling: `rounded-xl border border-slate-200` with `hover:shadow-md`
- [ ] Standardize spacing: `p-5` stat cards, `p-6` content cards, `gap-6` sections

### Pass 2: Landing Page (First Impression)

- [ ] Hero: split layout (text left, floating stat cards right)
- [ ] Hero: gradient `from-blue-900 via-blue-800 to-blue-700` with geometric SVG overlay
- [ ] Hero: orange CTA button with `shadow-lg shadow-orange-500/25`
- [ ] Hero: "HPSEDC Official Platform" badge
- [ ] Hero: frosted glass stat cards (`bg-white/10 backdrop-blur-sm border-white/20`)
- [ ] Role cards: improved with larger icons, better descriptions
- [ ] Footer: refined typography and spacing

### Pass 3: Candidate Dashboard

- [ ] Profile header: cleaner layout with proper spacing
- [ ] Stat cards: tinted icon backgrounds (`bg-blue-100 text-blue-600`) instead of solid
- [ ] Profile completion: SVG circular ring replacing linear Progress bar
- [ ] Recommendations: card grid with match score breakdown
- [ ] Job search board: refined card styling, country flag emoji
- [ ] Application pipeline: larger nodes, ring effect on current, check on completed
- [ ] Sidebar sections: consistent card styling with headers
- [ ] Empty states: icon + text + action button pattern

### Pass 4: Agent Dashboard

- [ ] Agency header: cleaner layout, verification badge prominent
- [ ] Stat cards: tinted style
- [ ] Tab content: consistent padding and card styling
- [ ] Applicant table: GOV.UK header style, hover rows, toolbar
- [ ] Drive cards: status badges with tinted colors
- [ ] Candidate search: refined result cards

### Pass 5: Employer Dashboard

- [ ] Header: consistent with agent pattern
- [ ] Job cards: refined with better status badges
- [ ] Notifications: inline list with type icons and unread indicators

### Pass 6: Admin Dashboard

- [ ] Stat cards: tinted with trend badges
- [ ] Charts: proper labels, colors matching the palette
- [ ] Pipeline funnel: bar chart with rounded corners
- [ ] Country pie chart: legend alignment
- [ ] Pending actions: tinted alert cards
- [ ] Drive approval cards: cleaner action buttons
- [ ] Grievance cards: status workflow visible

### Pass 7: Auth Page

- [ ] Login form: refined spacing, consistent with design system
- [ ] Registration form: role selector with icons
- [ ] CAPTCHA: styled to match the card design
- [ ] Forgot password: cleaner layout

### Pass 8: Support Pages

- [ ] FAQ: accordion with smooth animation, category badges
- [ ] Grievances: submission form styling, status cards
- [ ] 404 page: illustration/icon with helpful links

### Pass 9: Global Components

- [ ] Header: masthead + refined nav + notification bell with ring badge
- [ ] Footer: consistent typography, better link styling
- [ ] Announcement banner: refined with icon alignment
- [ ] Loading skeletons: consistent across all pages
- [ ] Toast notifications: styled with status colors
- [ ] Dialog/Modal: consistent header + body + footer pattern

---

## Before / After Expectations

| Component | Before | After |
|-----------|--------|-------|
| Page background | White everywhere | `bg-slate-50` with white cards |
| Stat cards | Solid colored icons, `shadow-sm` | Tinted backgrounds, `border` + `hover:shadow-md` |
| Profile completion | Flat progress bar | SVG circular ring with percentage center |
| Status badges | Inconsistent colors | Unified tinted system across all pages |
| Hero section | Simple gradient with text | Split layout, geometric overlay, frosted cards |
| Headings | Random sizes | Consistent scale: 30/24/18/16/14/12 |
| Cards | `rounded-lg shadow-sm` | `rounded-xl border border-slate-200 hover:shadow-md` |
| Numbers | Regular font | `tabular-nums` for alignment |
| Spacing | Inconsistent | System: `p-5`/`p-6`, `gap-4`/`gap-6` |
| Government identity | Just a logo | Tricolor masthead + "HPSEDC Initiative" bar |

---

## Success Criteria

After this sprint, the portal should:
1. Look like a **professional government digital service** (not a developer prototype)
2. Have **consistent visual language** across all pages (same colors, spacing, typography)
3. Feel **trustworthy** (government masthead, verification badges, professional aesthetics)
4. Be **intuitive** (clear hierarchy, obvious CTAs, meaningful empty states)
5. Work on **mobile** (responsive, readable, touch-friendly)
6. Make the client say **"wow"** at the demo

---

## Estimated Effort

| Pass | Scope | Effort |
|------|-------|--------|
| 1. Foundation | Colors, typography, spacing, cards | 1 hour |
| 2. Landing | Hero overhaul, role cards | 1 hour |
| 3. Candidate | Dashboard, profile ring, pipeline | 1.5 hours |
| 4. Agent | Dashboard, table, drives | 1 hour |
| 5. Employer | Dashboard, jobs, notifications | 0.5 hour |
| 6. Admin | Charts, actions, tables | 1 hour |
| 7. Auth | Login, register, forgot password | 0.5 hour |
| 8. Support | FAQ, grievances, 404 | 0.5 hour |
| 9. Global | Header, footer, banners, toasts | 1 hour |
| **Total** | | **~8 hours** |

---

*This is the final visual pass. After this, the portal is demo-ready.*
