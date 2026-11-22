# UI tokens (Nabiad)

One foundation for every page. New pages use these tokens; never hard-code a colour, size or timing.
Tokens live in `:root` of `style.css` (dark values in `:root[data-theme="dark"]`).

| Group | Tokens | Use |
|---|---|---|
| Surface | `--bg --surface --surface2 --line --line2` | page, card, nested block, borders |
| Text | `--txt --txt2 --mut` | main, secondary, muted |
| Brand | `--pri --pri2 --pri-soft --pri-ink --grad` | primary actions, links, highlights |
| Status | `--gr --rd --am --vi` (+ `-soft`) | success, danger, warning, info |
| Shape | `--r (14px) --r2 (9px)` | card / control radius |
| Depth | `--sh --sh2 --sh-pri` | card, modal, primary button |
| Amount | `--amt-fs (15px) --amt-fw (700)` | every money figure in tables |
| Motion | `--dur-fast (.14s) --dur (.2s) --ease` | hover/press/focus, modal pop |
| Focus | `--glow` | focus ring on inputs |

Rules
- Hover = lift 1px + soft shadow; press = scale .97; focus = `--glow`. Nothing longer than `--dur`.
- Every animation respects `prefers-reduced-motion`.
- Dark mode: raise surface depth with a faint `--pri` tint, not new colours.
- Buttons follow `UI_BUTTONS.md`.
- Applies to every page: the polish rules sit at the end of `style.css` (global selectors), not per page.
