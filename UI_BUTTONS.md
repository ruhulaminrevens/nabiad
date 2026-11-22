# Button design rule (Nabiad)

Buttons with the same purpose look the same on every page — never a per-page variant.

| Purpose | Look | How |
|---|---|---|
| Save / confirm / primary | gradient | `btn pri` |
| Edit | amber, tinted | `s-edit` |
| View | indigo, tinted | `s-view` |
| Delete | red, tinted | `s-del` (also `bad`, `rdo`) |
| Close / Cancel | slate, tinted | `s-close` |
| Print / Share | teal / green, tinted | `s-print` / `s-share` |
| Add photo / Reminder | sky / violet, tinted | `s-photo` / `s-remind` |

- Roles are applied automatically from the button label (EN + BN) by the "button roles" block in `app.js`;
  force one with `data-role="edit|view|del|close|print|share|save|photo|remind"`.
- Action buttons in a modal stay together in the `.modal-actions` grid (Close sits with the others).
- Icon-only row actions use `iconbtn cpi` + `pri` (view) / `am` (edit) / `rd` (delete), with `title`.
- Colours/tints live only in the "Button role system" section of `style.css`.
