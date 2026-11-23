/* NABIAD Smart Finance Suite  (single-page app, no build step) */
"use strict";
const CFG = window.NABIAD_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL;
const STATUSES = ["Pending","Cleared","Bounced","Returned-Cash","Cancelled","Stopped"];
const PURPOSES = ["Cash Withdrawal (ক্যাশ উত্তোলন)","Own A/C Transfer (নিজ অ্যাকাউন্টে জমা)","Supplier Payment (সাপ্লায়ার পেমেন্ট)","Rent (ভাড়া)","Loan/EMI (লোন কিস্তি)","Inter-company (সহযোগী প্রতিষ্ঠান)","Zakat/Donation (যাকাত/দান)","Cancelled/Spoiled (বাতিল/নষ্ট পাতা)"];
/* v6.24 — user-added purposes (shared in DB table cheque_purposes, cached per device) */
let PURP_X = []; try { PURP_X = JSON.parse(localStorage.getItem("nb_purp_v2") || "[]"); } catch (e) {}
const pKey = p => String(p || "").split(" (")[0].trim().toLowerCase();
/* v6.55 — a used purpose is added only if no listed purpose has the same key (e.g. "Cancelled/Spoiled" vs "Cancelled/Spoiled (বাতিল/নষ্ট পাতা)") */
const allPurposes = (withUsed) => { const l = [...(PURP_X.length ? PURP_X : PURPOSES)]; if (withUsed) { const ks = new Set(l.map(pKey)); (S.cheques || []).forEach(c => { if (c.purpose && !ks.has(pKey(c.purpose))) { ks.add(pKey(c.purpose)); l.push(c.purpose); } }); } return l; };
async function loadPurposes() { try { const x = await API.purposes(); PURP_X = x; if (!DEMO) localStorage.setItem("nb_purp_v2", JSON.stringify(x)); } catch (e) {} }
const TAKERS = ["Foysal","Sourov","Sadik","Tushar","Sohan","Omi","Aslam","Boss","Others"];
const BN_M = ["জানু","ফেব্রু","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টে","অক্টো","নভে","ডিসে"];

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => (n === null || n === undefined || n === "" || isNaN(n)) ? "" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money0 = n => (n === null || n === undefined || isNaN(n)) ? "0" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const dmy = s => s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : "";
const dmy2 = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(2, 4)}` : "";
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(n) ? 0 : n; };
/* typed arithmetic in money cells: "4,93,582+500", "1,20,000-10000", "5000*2", brackets ok. evalExpr → number or null (not valid yet) */
function evalExpr(src) {
  const s = String(src ?? "").replace(/[,\s৳]/g, "").replace(/[−–—]/g, "-").replace(/[×xX]/g, "*").replace(/÷/g, "/");
  if (!s || !/^[0-9.+\-*/()]+$/.test(s)) return null;
  let i = 0;
  const factor = () => {
    if (s[i] === "+" || s[i] === "-") { const sg = s[i++] === "-" ? -1 : 1, f = factor(); return f === null ? null : sg * f; }
    if (s[i] === "(") { i++; const v = expr(); if (v === null || s[i] !== ")") return null; i++; return v; }
    const m = /^(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) return null; i += m[0].length; return parseFloat(m[0]);
  };
  const term = () => { let v = factor(); while (v !== null && (s[i] === "*" || s[i] === "/")) { const op = s[i++], r = factor(); if (r === null || (op === "/" && r === 0)) return null; v = op === "*" ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (v !== null && (s[i] === "+" || s[i] === "-")) { const op = s[i++], r = term(); if (r === null) return null; v = op === "+" ? v + r : v - r; } return v; };
  const out = expr(); return out !== null && i === s.length && Number.isFinite(out) ? Math.round(out * 100) / 100 : null;
}
const exprTail = s => String(s ?? "").replace(/[\s+\-*/×÷xX−.(]+$/, "");
const ev = s => { const t = evalExpr(s); if (t !== null) return t; const u = evalExpr(exprTail(s)); return u === null ? 0 : u; };
const exprOk = s => evalExpr(s) !== null || evalExpr(exprTail(s)) !== null;
const hasOp = s => /[0-9).]\s*[+\-*/×÷−xX]/.test(String(s ?? "").replace(/,/g, ""));
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const purposeKey = p => { const s = String(p || "").toLowerCase(); return s.startsWith("cash") ? "cash" : s.startsWith("own") ? "own" : (s.startsWith("cancel") || s.startsWith("blank")) ? "cancel" : s.startsWith("supplier") ? "supplier" : "other"; };
function toast(msg, kind = "ok") { const t = document.createElement("div"); t.className = "toast " + kind; t.innerHTML = `<i>${kind === "err" ? "!" : kind === "info" ? "i" : "✓"}</i><span></span>`; t.lastChild.textContent = tr(String(msg)).replace(/^✔\s*/, ""); $("#toasts").appendChild(t); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, kind === "err" ? 6000 : 2800); return t; }
const ask = m => confirm(tr(m));
function overlayKeys(panel, close) {
  panel.addEventListener("keydown", e => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const controls = $$('a[href],button,input,select,textarea,summary,[tabindex]', panel)
      .filter(el => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first || (e.shiftKey ? e.target === first || e.target === panel : e.target === last)) {
      e.preventDefault(); (e.shiftKey ? last || panel : first || panel).focus();
    }
  });
}
function modal(html, onMount) {
  const root = $("#modal-root"), opener = document.activeElement;
  root.innerHTML = `<div class="mback"><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  const panel = $(".modal", root), title = $("h2", panel);
  if (title) { title.id ||= "modal-title"; panel.setAttribute("aria-labelledby", title.id); }
  const actions = $(".modal-actions", panel);
  if (actions && title && !$(".modal-body", panel)) {
    const body = document.createElement("div");
    body.className = "modal-body";
    actions.remove();
    title.remove();
    body.append(...panel.childNodes);
    panel.append(title, body, actions);
  }
  const close = () => {
    if (!panel.isConnected) return;
    root.replaceChildren();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  overlayKeys(panel, close);
  $(".mback", root).addEventListener("mousedown", e => { if (e.target.classList.contains("mback")) close(); });
  panel.focus({ preventScroll: true });
  onMount && onMount(root, close); return close;
}
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[data-s="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.dataset.s = src; s.onload = res; s.onerror = () => rej(new Error("Load failed: " + src)); document.head.appendChild(s); }); }
/* ---------- v6.41: profile pictures ---------- */
const avaMap = () => (S.ava ||= {});
const avaInit = (n, e) => esc((n || e || "?").trim().slice(0, 1).toUpperCase());
const avaIn = (id, n, e) => { const im = avaMap()[id]; return im ? `<img src="${im}" alt="">` : avaInit(n, e); };
const avaEl = (id, n, e, cls = "") => `<div class="ava ${cls}" data-uid="${esc(id)}" data-n="${esc(n || "")}" data-e="${esc(e || "")}">${avaIn(id, n, e)}</div>`;
function refreshAvatars() { $$(".ava[data-uid]").forEach(a => { a.innerHTML = avaIn(a.dataset.uid, a.dataset.n, a.dataset.e); a.classList.toggle("has", !!avaMap()[a.dataset.uid]); }); }
async function loadAvatars() {
  try { if (S.me) { const c = localStorage.getItem("nabiad_ava_" + S.me.id); if (c) avaMap()[S.me.id] = c; } } catch { }
  try { S.ava = await API.avatars(); try { const m = S.ava[S.me.id]; m ? localStorage.setItem("nabiad_ava_" + S.me.id, m) : localStorage.removeItem("nabiad_ava_" + S.me.id); } catch { } refreshAvatars(); } catch { }
}
function imgToAvatar(file, size = 256) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type || "image/")) return rej(new Error(LANG === "en" ? "Choose an image file" : "ছবির ফাইল বাছুন"));
    if (file.size > 15 * 1024 * 1024) return rej(new Error(LANG === "en" ? "Image is too large (max 15 MB)" : "ছবি অনেক বড় (সর্বোচ্চ ১৫ MB)"));
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { try { const w = im.naturalWidth, h = im.naturalHeight, m = Math.min(w, h), c = document.createElement("canvas"); c.width = c.height = size; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, size, size); x.drawImage(im, (w - m) / 2, (h - m) / 2, m, m, 0, 0, size, size); res(c.toDataURL("image/jpeg", 0.86)); } catch (e) { rej(e); } URL.revokeObjectURL(url); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error(LANG === "en" ? "Could not read this image (try JPG or PNG)" : "এই ছবি পড়া যায়নি (JPG বা PNG দিন)")); };
    im.src = url;
  });
}
/* ---------- v6.42: image crop (manual + auto-suggest) — used by every photo upload/capture ---------- */
const crClamp = (v, a, b) => Math.max(a, Math.min(b, v));
function crFit(b, a, W, H) { let w = b.w, h = b.h; const cx = b.x + w / 2, cy = b.y + h / 2; if (w / h > a) h = w / a; else w = h * a; if (w > W) { w = W; h = w / a; } if (h > H) { h = H; w = h * a; } return { x: crClamp(cx - w / 2, 0, W - w), y: crClamp(cy - h / 2, 0, H - h), w, h }; }
async function crAuto(src, aspect, face) {
  const W = src.width, H = src.height;
  if (face && "FaceDetector" in window) { try { const f = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 }).detect(src); if (f.length) { const b = f.map(x => x.boundingBox).sort((p, q) => q.width * q.height - p.width * p.height)[0], sz = Math.max(b.width, b.height) * 2.6; return crFit({ x: b.x + b.width / 2 - sz / 2, y: b.y + b.height / 2 - sz * .46, w: sz, h: sz }, aspect || 1, W, H); } } catch { } }
  const k = 180 / Math.max(W, H), w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k)), c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(src, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  const col = new Float32Array(w), row = new Float32Array(h); let tot = 0, mx = 0, my = 0;
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const p = j * w + i, e = Math.abs(g[p + 1] - g[p - 1]) + Math.abs(g[p + w] - g[p - w]); col[i] += e; row[j] += e; tot += e; mx += e * i; my += e * j; }
  if (!tot) return crFit({ x: 0, y: 0, w: W, h: H }, aspect || W / H, W, H);
  const edge = (p, fr) => { const T = p.reduce((a, b) => a + b, 0); let s = 0, lo = 0, hi = p.length - 1; for (let i = 0; i < p.length; i++) { s += p[i]; if (s >= T * fr) { lo = i; break; } } s = 0; for (let i = p.length - 1; i >= 0; i--) { s += p[i]; if (s >= T * fr) { hi = i; break; } } return [lo, hi]; };
  let [x0, x1] = edge(col, .012), [y0, y1] = edge(row, .012); const padX = (x1 - x0) * .03 + 1, padY = (y1 - y0) * .03 + 1;
  let b = { x: crClamp(x0 - padX, 0, w) / k, y: crClamp(y0 - padY, 0, h) / k, w: 0, h: 0 }; b.w = Math.min(W - b.x, (x1 - x0 + 2 * padX) / k); b.h = Math.min(H - b.y, (y1 - y0 + 2 * padY) / k);
  if (aspect === 1 && face) { const sz = Math.min(W, H) * .86; return crFit({ x: mx / tot / k - sz / 2, y: my / tot / k - sz / 2, w: sz, h: sz }, 1, W, H); }
  if (b.w * b.h > W * H * .94) b = { x: W * .02, y: H * .02, w: W * .96, h: H * .96 };
  return aspect ? crFit(b, aspect, W, H) : b;
}
const crLoad = blob => new Promise((res, rej) => { const u = URL.createObjectURL(blob), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("img")); }; i.src = u; });
/* cropModal(file, {title, aspect:null|number, aspects:[…], circle, face, maxSide, allowFull}) → Promise<Blob|File|null>  (null = cancelled) */
async function cropModal(file, o = {}) {
  const en = LANG === "en"; let im; try { im = await crLoad(file); } catch { return file; }
  const k0 = Math.min(1, 2800 / Math.max(im.naturalWidth, im.naturalHeight)); let src = document.createElement("canvas"); src.width = Math.round(im.naturalWidth * k0); src.height = Math.round(im.naturalHeight * k0); src.getContext("2d").drawImage(im, 0, 0, src.width, src.height);
  const ASP = o.aspects === undefined ? [null, 1, 4 / 3, 3 / 4, 16 / 9] : o.aspects, nm = a => a == null ? (en ? "Free" : "ফ্রি") : a === 1 ? "1:1" : a === 4 / 3 ? "4:3" : a === 3 / 4 ? "3:4" : a === 16 / 9 ? "16:9" : a.toFixed(2);
  return new Promise(async resolve => {
    const host = document.createElement("div"); host.className = "crhost";
    host.innerHTML = `<div class="mback" style="z-index:95"><div class="modal crop"><h2>✂️ <span>${esc(o.title || (en ? "Crop photo" : "ছবি ক্রপ করুন"))}</span><button class="shclose" id="cr-x" type="button">✕ ${en ? "Close" : "বন্ধ"}</button></h2>
      <div class="crwrap"><div class="crstage" id="cr-st"><canvas id="cr-cv"></canvas><div class="crbox ${o.circle ? "circ" : ""}" id="cr-bx"><i class="crh" data-h="nw"></i><i class="crh" data-h="ne"></i><i class="crh" data-h="sw"></i><i class="crh" data-h="se"></i></div></div></div>
      <div class="crtools"><button class="btn sm" id="cr-auto" type="button">✨ ${en ? "Auto crop" : "অটো ক্রপ"}</button><button class="btn sm" id="cr-l" type="button" title="${en ? "Rotate left" : "বাঁয়ে ঘোরান"}">↺</button><button class="btn sm" id="cr-r" type="button" title="${en ? "Rotate right" : "ডানে ঘোরান"}">↻</button><button class="btn sm" id="cr-rs" type="button">${en ? "Reset" : "রিসেট"}</button>${ASP.length > 1 ? `<div class="seg" id="cr-as">${ASP.map(a => `<span class="chip" data-a="${a == null ? "" : a}">${nm(a)}</span>`).join("")}</div>` : ""}</div>
      <div class="mut xs" id="cr-info" style="margin:8px 0 0"></div>
      <div class="crbar"><button class="btn" id="cr-full" type="button">↺ ${en ? "Retake" : "আবার তুলুন"}</button><button class="btn pri" id="cr-ok" type="button"></button></div></div></div>`;
    document.body.appendChild(host);
    const q = id => host.querySelector("#" + id), cv = q("cr-cv"), st = q("cr-st"), bx = q("cr-bx"); let aspect = o.aspect === undefined ? (ASP.length ? ASP[0] : null) : o.aspect, box, s = 1;
    const fin = v => { document.removeEventListener("keydown", key); host.remove(); resolve(v); };
    const info = () => { q("cr-info").textContent = `${Math.round(box.w)} × ${Math.round(box.h)} px`; const full = box.w >= src.width * .985 && box.h >= src.height * .985; q("cr-ok").textContent = full ? `✔ ${en ? "Save now" : "এখনই সেভ"}` : `✔ ${en ? "Save cropped" : "ক্রপ সেভ"}`; };
    const paint = () => { bx.style.left = box.x * s + "px"; bx.style.top = box.y * s + "px"; bx.style.width = box.w * s + "px"; bx.style.height = box.h * s + "px"; info(); };
    const chips = () => host.querySelectorAll("#cr-as .chip").forEach(c => c.classList.toggle("on", (c.dataset.a === "" ? null : +c.dataset.a) === aspect));
    const layout = () => { const aw = Math.max(120, st.parentElement.clientWidth - 2), ah = Math.min(innerHeight * .42, 460); s = Math.min(aw / src.width, ah / src.height); cv.width = Math.round(src.width * s); cv.height = Math.round(src.height * s); st.style.width = cv.width + "px"; st.style.height = cv.height + "px"; cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height); paint(); };
    const initBox = () => { const W = src.width, H = src.height; box = aspect ? crFit({ x: W * .05, y: H * .05, w: W * .9, h: H * .9 }, aspect, W, H) : { x: W * .04, y: H * .04, w: W * .92, h: H * .92 }; };
    const setAuto = async () => { const b = q("cr-auto"); b.disabled = true; try { box = await crAuto(src, aspect, !!o.face); } catch { initBox(); } b.disabled = false; paint(); };
    const rot = d => { const n = document.createElement("canvas"); n.width = src.height; n.height = src.width; const x = n.getContext("2d"); x.translate(n.width / 2, n.height / 2); x.rotate(d * Math.PI / 2); x.drawImage(src, -src.width / 2, -src.height / 2); src = n; initBox(); layout(); };
    let drag = null; const MIN = 24;
    bx.addEventListener("pointerdown", e => { drag = { h: e.target.dataset?.h || "", sx: e.clientX, sy: e.clientY, b: { ...box } }; bx.setPointerCapture(e.pointerId); e.preventDefault(); });
    bx.addEventListener("pointermove", e => {
      if (!drag) return; const W = src.width, H = src.height, dx = (e.clientX - drag.sx) / s, dy = (e.clientY - drag.sy) / s, b0 = drag.b, h = drag.h;
      if (!h) { box = { ...b0, x: crClamp(b0.x + dx, 0, W - b0.w), y: crClamp(b0.y + dy, 0, H - b0.h) }; return paint(); }
      const hw = h.includes("w"), hn = h.includes("n"), r0 = b0.x + b0.w, bt0 = b0.y + b0.h; let l, r, t, bt;
      if (aspect) { let w = b0.w + (hw ? -dx : dx), hh; const maxW = hw ? r0 : W - b0.x, maxH = hn ? bt0 : H - b0.y; w = Math.max(MIN, Math.min(w, maxW, maxH * aspect)); hh = w / aspect; l = hw ? r0 - w : b0.x; r = l + w; t = hn ? bt0 - hh : b0.y; bt = t + hh; }
      else { l = hw ? crClamp(b0.x + dx, 0, r0 - MIN) : b0.x; r = hw ? r0 : crClamp(r0 + dx, b0.x + MIN, W); t = hn ? crClamp(b0.y + dy, 0, bt0 - MIN) : b0.y; bt = hn ? bt0 : crClamp(bt0 + dy, b0.y + MIN, H); }
      box = { x: l, y: t, w: r - l, h: bt - t }; paint();
    });
    const up = () => { drag = null; }; bx.addEventListener("pointerup", up); bx.addEventListener("pointercancel", up);
    const apply = async () => {
      const mx = o.maxSide || 2000, k = Math.min(1, mx / Math.max(box.w, box.h)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(box.w * k)); c.height = Math.max(1, Math.round(box.h * k));
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .92)); fin(blob);
    };
    function key(e) { if (e.key === "Escape") fin(null); else if (e.key === "Enter" && !(e.target.tagName === "BUTTON")) apply(); }
    document.addEventListener("keydown", key);
    q("cr-x").onclick = () => fin(null); q("cr-ok").onclick = apply; q("cr-full").onclick = () => fin(CR_RETAKE);
    q("cr-auto").onclick = setAuto; q("cr-l").onclick = () => rot(-1); q("cr-r").onclick = () => rot(1); q("cr-rs").onclick = () => { initBox(); paint(); };
    host.querySelectorAll("#cr-as .chip").forEach(c => c.onclick = () => { aspect = c.dataset.a === "" ? null : +c.dataset.a; chips(); if (aspect) { box = crFit(box, aspect, src.width, src.height); paint(); } });
    host.querySelector(".mback").addEventListener("mousedown", e => { if (e.target.classList.contains("mback")) fin(null); });
    initBox(); chips(); requestAnimationFrame(async () => { layout(); await setAuto(); });
  });
}
/* ask for a crop, then return the blob to upload (null = user cancelled) */
const CR_RETAKE = { retake: 1 };
async function pickImage(file, o, again) { if (!file) return null; const r = await cropModal(file, o); if (r === CR_RETAKE) { again && again.click(); return null; } return r; }

function userErr(e) {
  const m = String(e?.message || e), en = LANG === "en";
  const T = { admin_only: ["শুধু Admin এই কাজ করতে পারেন", "Only an admin can do this"], bad_email: ["ইমেইল ঠিক নয়", "Invalid email address"], weak_password: ["পাসওয়ার্ড কমপক্ষে ১০ অক্ষর হতে হবে", "Password must be at least 10 characters"], bad_role: ["Role ঠিক নয়", "Invalid role"], email_exists: ["এই ইমেইলে আগেই ব্যবহারকারী আছে", "A user with this email already exists"], no_user: ["ব্যবহারকারী পাওয়া যায়নি", "User not found"], edit_window_closed: ["এডিটের সময় শেষ বা বন্ধ — ছবি বদলানো যায়নি", "Your edit window is closed or off — photo not changed"], purpose_exists: ["এই খাত আগেই আছে", "This purpose already exists"], no_purpose: ["খাত পাওয়া যায়নি", "Purpose not found"], bad_name: ["নাম লিখুন", "Enter a name"], cannot_delete_self: ["নিজেকে মোছা যাবে না", "You cannot delete yourself"], deactivate_first: ["আগে ব্যবহারকারীকে নিষ্ক্রিয় করুন, তারপর মুছুন", "Deactivate the user first, then delete"], too_many_attempts: ["অনেকবার ভুল হয়েছে — ১০ মিনিট পরে চেষ্টা করুন", "Too many wrong attempts — try again in 10 minutes"] };
  for (const k in T) if (m.includes(k)) return new Error(T[k][en ? 1 : 0]);
  return e instanceof Error ? e : new Error(m);
}
function genPassword() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ", a = "abcdefghijkmnpqrstuvwxyz", d = "23456789", all = A + a + d, r = n => crypto.getRandomValues(new Uint32Array(n)); const pick = (set, x) => set[x % set.length]; const x = r(12); let o = [pick(A, x[0]), pick(a, x[1]), pick(d, x[2])]; for (let i = 3; i < 12; i++) o.push(pick(all, x[i])); const y = r(12); for (let i = o.length - 1; i > 0; i--) { const j = y[i] % (i + 1);[o[i], o[j]] = [o[j], o[i]]; } return o.join(""); }
function pwField(id, val = "") { const en = LANG === "en"; return `<div class="pwf"><input class="in" id="${id}" type="text" autocomplete="off" spellcheck="false" value="${esc(val)}" placeholder="${en ? "At least 10 characters" : "কমপক্ষে ১০ অক্ষর"}"><button type="button" class="btn sm" data-gen="${id}" title="${en ? "Generate a strong password" : "শক্তিশালী পাসওয়ার্ড বানান"}">${ico("key")} ${en ? "Generate" : "জেনারেট"}</button><button type="button" class="btn sm" data-cp="${id}" title="${en ? "Copy" : "কপি"}">${ico("copy")}</button></div>`; }
function pwBind(root) { $$("[data-gen]", root).forEach(b => b.onclick = () => { $("#" + b.dataset.gen, root).value = genPassword(); }); $$("[data-cp]", root).forEach(b => b.onclick = () => { const v = $("#" + b.dataset.cp, root).value; v ? copyText(v, LANG === "en" ? "Password copied" : "পাসওয়ার্ড কপি হয়েছে") : toast(LANG === "en" ? "Nothing to copy" : "কপি করার মতো কিছু নেই", "err"); }); }
function newUserModal(after) {
  const en = LANG === "en";
  modal(`<h2>➕ ${en ? "New user" : "নতুন ব্যবহারকারী"}</h2>
    <div class="ug2"><div><label class="f">${en ? "Name" : "নাম"}</label><input class="in" id="nu-n" autocomplete="off" placeholder="${en ? "Full name" : "পুরো নাম"}"></div>
    <div><label class="f">${en ? "Email (used to sign in)" : "ইমেইল (লগইনে ব্যবহার হবে)"}</label><input class="in" id="nu-e" type="email" autocomplete="off" inputmode="email" placeholder="name@company.com"></div>
    <div><label class="f">Role</label><div class="seg rl" id="nu-r" style="display:flex;width:100%">${[["staff", "Staff"], ["boss", "Boss"], ["admin", "Admin"]].map(([r, l], i) => `<span class="chip ${i === 0 ? "on" : ""}" data-r="${r}" style="flex:1;text-align:center">${l}</span>`).join("")}</div>
    <div class="mut xs" style="margin-top:6px">${en ? "Staff: daily entry · Boss: view & reports · Admin: everything incl. this page" : "Staff: দৈনিক এন্ট্রি · Boss: দেখা ও রিপোর্ট · Admin: সব কিছু, এই পাতাসহ"}</div></div>
    <div><label class="f">${en ? "Password" : "পাসওয়ার্ড"}</label>${pwField("nu-p", genPassword())}</div></div>
    <div class="alert" style="margin-top:12px">${en ? "Copy the password and give it to the user. It is not shown again — you can always reset it from the user's card." : "পাসওয়ার্ড কপি করে ব্যবহারকারীকে দিন। এটা আর দেখানো হবে না — দরকার হলে ব্যবহারকারীর কার্ড থেকে নতুন বানাতে পারবেন।"}</div>
    <div class="modal-actions"><button class="btn" id="nu-x">${en ? "Cancel" : "বাতিল"}</button><button class="btn pri" id="nu-ok">${ico("save")} ${en ? "Create user" : "তৈরি করুন"}</button></div>`, (root, close) => {
    pwBind(root); $$("#nu-r .chip", root).forEach(c => c.onclick = () => $$("#nu-r .chip", root).forEach(x => x.classList.toggle("on", x === c)));
    $("#nu-x", root).onclick = close; setTimeout(() => $("#nu-n", root)?.focus(), 50);
    $("#nu-ok", root).onclick = async e => {
      const name = $("#nu-n", root).value.trim(), email = $("#nu-e", root).value.trim().toLowerCase(), pw = $("#nu-p", root).value, role = $("#nu-r .chip.on", root).dataset.r;
      if (!name) return toast(en ? "Enter a name" : "নাম লিখুন", "err");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast(en ? "Enter a valid email" : "সঠিক ইমেইল দিন", "err");
      if (pw.length < 10) return toast(en ? "Password must be at least 10 characters" : "পাসওয়ার্ড কমপক্ষে ১০ অক্ষর", "err");
      e.target.disabled = true;
      try { await API.createUser(email, pw, name, role); close(); toast(en ? "✔ User created" : "✔ ব্যবহারকারী তৈরি হয়েছে"); credModal(email, pw, name); after && after(); }
      catch (er) { toast(er.message, "err"); e.target.disabled = false; }
    };
  });
}
function credModal(email, pw, name, reset) {
  const en = LANG === "en", url = location.origin + "/", txt = `Nabiad\n${url}\n${en ? "Email" : "ইমেইল"}: ${email}\n${en ? "Password" : "পাসওয়ার্ড"}: ${pw}`;
  modal(`<h2>🔑 ${reset ? (en ? "Password changed" : "পাসওয়ার্ড বদলানো হয়েছে") : (en ? "User ready" : "ব্যবহারকারী প্রস্তুত")}</h2>
    <div class="card cred" data-nt><div><span class="mut xs">${en ? "Name" : "নাম"}</span><b>${esc(name || "—")}</b></div><div><span class="mut xs">${en ? "Email" : "ইমেইল"}</span><b>${esc(email)}</b></div><div><span class="mut xs">${en ? "Password" : "পাসওয়ার্ড"}</span><b class="mono">${esc(pw)}</b></div><div><span class="mut xs">${en ? "Sign in at" : "লগইন লিংক"}</span><b>${esc(url)}</b></div></div>
    <div class="mut xs" style="margin:10px 0">${en ? "This password is shown only now. Copy it before closing." : "এই পাসওয়ার্ড শুধু এখনই দেখা যাবে। বন্ধ করার আগে কপি করে নিন।"}</div>
    <div class="modal-actions"><button class="btn pri" id="cr-cp">${ico("copy")} ${en ? "Copy details" : "সব কপি করুন"}</button><button class="btn" id="cr-x">${en ? "Done" : "হয়েছে"}</button></div>`, (root, close) => { $("#cr-cp", root).onclick = () => copyText(txt, en ? "Details copied" : "তথ্য কপি হয়েছে"); $("#cr-x", root).onclick = close; });
}
function editUserModal(u, after) {
  const en = LANG === "en", me = u.id === S.me.id, st = { av: undefined };
  const cur = () => st.av === undefined ? avaMap()[u.id] : st.av;
  modal(`<h2>✏️ ${en ? "Edit user" : "ব্যবহারকারী এডিট"}</h2>
    <div class="pfp"><div class="ava xl" id="eu-av"></div><div class="pfb"><b style="word-break:break-all">${esc(u.email)}</b>${me ? `<div class="mut xs">${en ? "This is you" : "এটা আপনি"}</div>` : ""}<div class="row" style="margin-top:8px"><button class="btn sm pri fix" id="eu-up" type="button">${ico("cam")} ${en ? "Photo" : "ছবি"}</button><button class="btn sm fix" id="eu-rm" type="button">${ico("trash")} ${en ? "Remove" : "মুছুন"}</button><input type="file" id="eu-f" accept="image/*" hidden></div></div></div>
    <div class="ug2" style="margin-top:14px"><div><label class="f">${en ? "Name" : "নাম"}</label><input class="in" id="eu-n" value="${esc(u.name || "")}" autocomplete="off"></div>
    <div><label class="f">Role</label><div class="seg rl" id="eu-r" style="display:flex;width:100%">${[["admin", "Admin"], ["staff", "Staff"], ["boss", "Boss"]].map(([r, l]) => `<span class="chip ${r === u.role ? "on" : ""}" data-r="${r}" style="flex:1;text-align:center">${l}</span>`).join("")}</div></div>
    <div class="euac" id="eu-edw" style="display:${u.role === "staff" ? "" : "none"}"><div style="flex:1"><b>${en ? "Edit window (own entries)" : "নিজের এন্ট্রি এডিটের সময়"}</b><div class="mut xs">${en ? "Lets this staff edit their own cheque and Cash Book entries, for up to N days after posting. Staff can never delete anything." : "এই staff নিজের চেক ও ক্যাশ খাতার এন্ট্রি পোস্টের পর সর্বোচ্চ N দিন এডিট করতে পারবেন। কোনো staff কখনোই কিছু মুছতে পারেন না।"}</div></div><select class="in" id="eu-ed" style="width:auto">${[0, 1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}" ${(u.edit_days || 0) === d ? "selected" : ""}>${d === 0 ? (en ? "OFF" : "বন্ধ") : d + (en ? " day" : " দিন")}</option>`).join("")}</select></div>
    <div class="euac"><div><b>${en ? "Active" : "সক্রিয়"}</b><div class="mut xs">${en ? "Inactive users cannot sign in or see any data." : "নিষ্ক্রিয় ইউজার লগইন করতে বা কোনো ডাটা দেখতে পারেন না।"}</div></div><label class="sw"><input type="checkbox" id="eu-ac" ${u.active ? "checked" : ""}><i></i></label></div></div>
    <div class="modal-actions"><button class="btn" id="eu-x" type="button">${en ? "Cancel" : "বাতিল"}</button><button class="btn pri" id="eu-ok" type="button">${ico("save")} ${en ? "Save changes" : "সেভ করুন"}</button></div>`, (root, close) => {
    const g = id => $("#" + id, root), paint = () => { const im = cur(); g("eu-av").innerHTML = im ? `<img src="${im}" alt="">` : avaInit(g("eu-n").value || u.name, u.email); g("eu-av").classList.toggle("has", !!im); g("eu-rm").classList.toggle("hide", !im); };
    paint(); g("eu-n").oninput = paint; $$("#eu-r .chip", root).forEach(c => c.onclick = () => { $$("#eu-r .chip", root).forEach(x => x.classList.toggle("on", x === c)); g("eu-edw").style.display = c.dataset.r === "staff" ? "" : "none"; });
    g("eu-up").onclick = () => g("eu-f").click(); g("eu-x").onclick = close;
    g("eu-f").onchange = async () => { const f0 = g("eu-f").files[0]; g("eu-f").value = ""; if (!f0) return; const f = await pickImage(f0, { title: en ? "Crop profile picture" : "প্রোফাইল ছবি ক্রপ", aspect: 1, aspects: [], circle: true, face: true, allowFull: false, maxSide: 512 }, g("eu-f")); if (!f) return; try { st.av = await imgToAvatar(f); paint(); } catch (e) { toast(e.message, "err"); } };
    g("eu-rm").onclick = () => { st.av = null; paint(); };
    g("eu-ok").onclick = async e => {
      const name = g("eu-n").value.trim(), role = $("#eu-r .chip.on", root).dataset.r, active = g("eu-ac").checked;
      if (!name) return toast(en ? "Enter a name" : "নাম লিখুন", "err");
      if (me && (role !== "admin" || !active) && !ask(en ? "Removing your own Admin access will lock you out of the admin pages. Sure?" : "নিজের Admin অধিকার সরিয়ে দিলে আর অ্যাডমিন পাতায় আসতে পারবেন না। নিশ্চিত?")) return;
      e.target.disabled = true;
      try {
        await API.updateProfile(u.id, { name, role, active, edit_days: role === "staff" ? +g("eu-ed").value : 0 });
        if (st.av !== undefined) { await API.setUserAvatar(u.id, st.av); st.av ? avaMap()[u.id] = st.av : delete avaMap()[u.id]; if (me) try { st.av ? localStorage.setItem("nabiad_ava_" + u.id, st.av) : localStorage.removeItem("nabiad_ava_" + u.id); } catch { } }
        close(); toast(en ? "✔ Saved" : "✔ সেভ হয়েছে");
        if (me) { S.me.name = name; saveCache(); shell(); route(); } else { refreshAvatars(); after && after(); }
      } catch (er) { toast(er.message, "err"); e.target.disabled = false; }
    };
  });
}
function resetPwModal(u) {
  const en = LANG === "en", me = u.id === S.me.id;
  modal(`<h2>🔑 ${en ? "Reset password" : "পাসওয়ার্ড রিসেট"}</h2>
    <div class="uh2">${avaEl(u.id, u.name, u.email)}<div><b>${esc(u.name || "—")}</b><div class="mut xs">${esc(u.email)}</div></div></div>
    <label class="f" style="margin-top:14px">${en ? "New password" : "নতুন পাসওয়ার্ড"}</label>${pwField("rp-p", genPassword())}
    <div class="mut xs" style="margin-top:8px">${me ? (en ? "This is your own account — you stay signed in." : "এটা আপনার নিজের অ্যাকাউন্ট — আপনি সাইন-ইন থাকবেন।") : (en ? "The user is signed out from all devices and must sign in with this password." : "ব্যবহারকারী সব device থেকে সাইন-আউট হবেন এবং এই পাসওয়ার্ড দিয়ে নতুন করে লগইন করতে হবে।")}</div>
    <div class="modal-actions"><button class="btn" id="rp-x">${en ? "Cancel" : "বাতিল"}</button><button class="btn pri" id="rp-ok">${ico("save")} ${en ? "Set password" : "পাসওয়ার্ড সেট করুন"}</button></div>`, (root, close) => {
    pwBind(root); $("#rp-x", root).onclick = close;
    $("#rp-ok", root).onclick = async e => {
      const pw = $("#rp-p", root).value; if (pw.length < 10) return toast(en ? "Password must be at least 10 characters" : "পাসওয়ার্ড কমপক্ষে ১০ অক্ষর", "err");
      e.target.disabled = true;
      try { await API.setUserPassword(u.id, pw); close(); toast(en ? "✔ Password changed" : "✔ পাসওয়ার্ড বদলানো হয়েছে"); credModal(u.email, pw, u.name, true); }
      catch (er) { toast(er.message, "err"); e.target.disabled = false; }
    };
  });
}
const ICON = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  book: '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  chev: '<path d="M15 6l-6 6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  dl: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8M7 21v-7h10v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  copyt: '<path d="M8 4h8M8 4a2 2 0 0 0-2 2v14h12V6a2 2 0 0 0-2-2M9 10h6M9 14h6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  ledger: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  pie: '<path d="M12 3v9h9a9 9 0 1 1-9-9z"/><path d="M16 3.5A9 9 0 0 1 20.5 8H16z"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  sliders: '<path d="M4 6h10M20 6h0M4 12h4M14 12h6M4 18h11M20 18h0"/><circle cx="17" cy="6" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  chq: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h6M6 14h4M15 14l1.6 1.6L20 11.5"/>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5v1M12 14.5v1M8.5 12h1M14.5 12h1"/>',
  note: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5h.01M18 14.5h.01"/>',
  net: '<circle cx="12" cy="5.5" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M11 8l-4 7.5M13 8l4 7.5M8 18h8"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'
};
Object.assign(ICON, {
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
});
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

/* ---------- state ---------- */
const markFrom = r => ({ id: r.id, code: r.code, no: Number(r.leaf_no), kind: r.kind, note: r.note, photo: r.photo || null, resolved: !!r.resolved, rnote: r.resolved_note, rby: r.resolved_by, rat: r.resolved_at, by: r.entered_by, uid: r.user_id, at: r.created_at });
const S = { me: null, accounts: [], cheques: [], books: [], marks: [], reminders: [], loaded: false, lastBal: null };
const accMap = () => Object.fromEntries(S.accounts.map(a => [a.code, a]));
let _alc = { src: null, map: null };
const acLabel = code => { if (_alc.src !== S.accounts) _alc = { src: S.accounts, map: accMap() }; const h = (_alc.map[code] || {}).holder; return h ? `${code} · ${h}` : `${code}`; };
function derive(c) {
  const k = purposeKey(c.purpose);
  let st = "Pending", sd = null;
  if (k === "cash" || k === "own") { st = "Cleared"; sd = c.date; } else if (k === "cancel") { st = "Cancelled"; sd = c.date; }
  const ev = c.events || [];
  if (ev.length) { const l = ev[ev.length - 1]; st = l.status; sd = l.status === "Pending" ? null : l.date; }
  c.status = st; c.sdate = sd; return c;
}
const isLive = c => !["Cancelled", "Bounced", "Stopped"].includes(c.status);

/* ---------- data layer: Supabase ---------- */
let sb = null;
async function fetchAll(table, order = "id", columns = "*") {
  let out = [], from = 0; const step = 1000;
  for (;;) {
    let q = sb.from(table).select(columns);
    for (const col of [].concat(order)) q = q.order(col);
    const { data, error } = await q.range(from, from + step - 1);
    if (error) throw error; out = out.concat(data); if (data.length < step) break; from += step;
  }
  return out;
}
/* BACKUP_TABLES:start - table -> stable order column(s). Keep equal to public.nabiad_restore_tables() + profiles, leaf_marks (run scripts/check-backup-tables.py) */
const BACKUP_TABLES = {
  accounts: "code", dist_asms: "id", dist_parties: "id", inv_items: "id", rm_products: "code", cheque_purposes: "id",
  cheques: "id", cheque_status: "id", cheque_statement_verifications: "cheque_id", books: "id", balances: ["date", "code"],
  balance_drafts: "date", reminders: "id", cash_records: "date", cashbook_days: "date", cashbook_ledgers: "id",
  cash_group_names: "group_key", cash_tally_vouchers: ["date", "type", "ref"], dist_collections: "id", dist_opening: "id",
  dist_sales_reg: "id", inv_demand: ["ch", "month"], inv_orders: "id", rm_daily: ["date", "product"], rm_ledger: "id",
  inv_locks: "month", profiles: "id", leaf_marks: "id"
};
/* BACKUP_TABLES:end */
const SbAPI = {
  async init() { await loadScript("vendor/supabase.js"); sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); },
  async session() {
    if (!navigator.onLine) return readCache()?.me || null;
    const { data } = await sb.auth.getSession(); const u = data.session?.user;
    if (!u) return null;
    const { data: p, error } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
    if (error && isNetErr(error)) { const c = readCache(); if (c?.me?.id === u.id) return c.me; }
    if (error || !p || !p.active) return null; return { id: u.id, email: p.email, name: p.name, role: p.role, edit_days: p.edit_days || 0, module_access: p.module_access ?? null };
  },
  async login(email, pw) { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return this.session(); },
  async logout() {
    try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem("nabiad_locked"); } catch { }
    await sb.auth.signOut();
  },
  async loadAll() {
    const [acc, ch, ev, bk, verifications] = await Promise.all([fetchAll("accounts", "sort"), fetchAll("cheques", "created_at"), fetchAll("cheque_status", "created_at"), fetchAll("books", "code"), fetchAll("cheque_statement_verifications", "cheque_id").catch(() => null)]);
    const verified = new Map((verifications || []).map(r => [r.cheque_id, r]));
    const by = {}; ev.forEach(e => (by[e.cheque_id] ||= []).push({ id: e.id, status: e.new_status, date: e.status_date, remarks: e.remarks, by: e.entered_by, at: e.created_at }));
    return {
      accounts: acc, statementReady: verifications !== null, books: bk.map(b => ({ id: b.id, code: b.code, series: b.series, first: Number(b.first_leaf), last: b.last_leaf == null ? null : Number(b.last_leaf), track: b.track_from == null ? null : Number(b.track_from), status: b.status, note: b.note })),
      cheques: ch.map(r => ({ id: r.id, date: r.chq_date, code: r.code, no: Number(r.chq_no), amount: Number(r.amount), purpose: r.purpose, taker: r.cash_taker, party: r.party, toac: r.to_ac, remarks: r.remarks, photo: r.photo || null, by: r.entered_by, uid: r.user_id || null, at: r.created_at, events: by[r.id] || [], statementVerification: verified.get(r.id) || null }))
    };
  },
  async addCheque(c) {
    const row = { id: c.id || crypto.randomUUID(), chq_date: c.date, code: c.code, chq_no: c.no, amount: c.amount, purpose: c.purpose, cash_taker: c.taker || null, party: c.party || null, to_ac: c.toac || null, remarks: c.remarks || null, entered_by: S.me.name };
    if (c.photo) row.photo = c.photo;
    const local = () => ({ id: row.id, date: c.date, code: c.code, no: c.no, amount: c.amount, purpose: c.purpose, taker: row.cash_taker, party: row.party, toac: row.to_ac, remarks: row.remarks, by: S.me.name, uid: S.me.id, at: new Date().toISOString(), events: [], pending: true });
    if (!navigator.onLine) { Outbox.add("cheque", row); return local(); }
    const { data, error } = await sb.from("cheques").insert(row).select().single();
    if (error && isNetErr(error)) { Outbox.add("cheque", row); return local(); }
    if (error) { if (error.code === "23505") throw new Error("এই চেক নম্বর এই অ্যাকাউন্টে আগেই এন্ট্রি আছে"); throw error; }
    return { id: data.id, date: data.chq_date, code: data.code, no: Number(data.chq_no), amount: Number(data.amount), purpose: data.purpose, taker: data.cash_taker, party: data.party, toac: data.to_ac, remarks: data.remarks, photo: data.photo || null, by: data.entered_by, uid: data.user_id || null, at: data.created_at, events: [] };
  },
  async addStatus(chequeId, status, date, remarks) {
    const row = { id: crypto.randomUUID(), cheque_id: chequeId, new_status: status, status_date: date, remarks: remarks || null, entered_by: S.me.name };
    const local = () => ({ id: row.id, status, date, remarks: row.remarks, by: S.me.name, at: new Date().toISOString(), pending: true });
    if (!navigator.onLine || Outbox.has(chequeId)) { Outbox.add("status", row); return local(); }
    const { data, error } = await sb.from("cheque_status").insert(row).select().single();
    if (error && isNetErr(error)) { Outbox.add("status", row); return local(); }
    if (error) throw error; return { id: data.id, status: data.new_status, date: data.status_date, remarks: data.remarks, by: data.entered_by, at: data.created_at };
  },
  async updateCheque(id, p) {
    const m = { date: "chq_date", code: "code", no: "chq_no", amount: "amount", purpose: "purpose", taker: "cash_taker", party: "party", toac: "to_ac", remarks: "remarks" }; const row = {};
    for (const k in p) row[m[k]] = p[k] === "" ? null : p[k];
    const { data, error } = await sb.from("cheques").update(row).eq("id", id).select("id"); if (error) throw error; if (!data || !data.length) throw new Error(LANG === "en" ? "Edit not allowed — your edit window is closed or switched off" : "এডিট করা যাবে না — আপনার এডিটের সময় শেষ বা বন্ধ আছে");
  },
  async deleteCheque(id) {
    const {data,error} = await sb.from("cheques").delete().eq("id",id).select("id");
    if (error) throw /in_use/.test(error.message || "") ? new Error(bi("এই চেকের স্ট্যাটাস রেকর্ড আছে — ভুল এন্ট্রি হলে Cancelled দিন।", "This cheque has status records. Set the status to Cancelled to correct a mistaken entry.")) : error;
    if (!data?.length) throw new Error(bi("চেক মুছে ফেলার অ্যাক্সেস নেই অথবা রেকর্ডটি পাওয়া যায়নি।","Cheque deletion is not allowed or the record no longer exists."));
  },
  async deleteStatus(id) { const { error } = await sb.from("cheque_status").delete().eq("id", id); if (error) throw error; },
  async lastBalDate() { const { data } = await sb.from("balances").select("date").order("date", { ascending: false }).limit(1); return data?.[0]?.date || null; },
  async balancesOn(d) { const { data, error } = await sb.from("balances").select("*").eq("date", d).limit(2000); if (error) throw error; return Object.fromEntries(data.map(r => [r.code, { total: r.total == null ? null : Number(r.total), block: r.block == null ? null : Number(r.block), remark: r.remark, od: r.other_debit, odp: r.other_deposit, by: r.entered_by }])); },
  async prevBalances(d) {
    const { data, error } = await sb.from("balances").select("date").lt("date", d).order("date", { ascending: false }).limit(1);
    if (error) throw error;
    if (!data?.length) return { date: null, map: {} }; return { date: data[0].date, map: await this.balancesOn(data[0].date) };
  },
  async saveBalances(d, rows, overwrite) {
    const payload = rows.map(r => ({ date: d, code: r.code, total: r.total, block: r.block, remark: r.remark || null, other_debit: r.od || null, other_deposit: r.odp || null, entered_by: S.me.name }));
    balCache.delete(d);
    if (!navigator.onLine && !overwrite) { Outbox.add("bal", payload); return; }
    const q = overwrite ? sb.from("balances").upsert(payload, { onConflict: "date,code" }) : sb.from("balances").insert(payload);
    const { error } = await q; if (error && isNetErr(error) && !overwrite) { Outbox.add("bal", payload); return; }
    if (error) { if (error.code === "23505") throw new Error("এই তারিখের ব্যালেন্স আগেই সেভ করা আছে — শুধু Admin বদলাতে পারবে"); throw error; }
  },
  async historyAll(from, to) { const out = []; for (let i = 0; ; i += 1000) { const { data, error } = await sb.from("balances").select("date,code,total,block").gte("date", from).lte("date", to).order("date").order("code").range(i, i + 999); if (error) throw error; data.forEach(r => out.push({ date: r.date, code: r.code, total: r.total == null ? null : Number(r.total), block: r.block == null ? null : Number(r.block) })); if (data.length < 1000) break; } return out; },
  async history(code, from, to) { const { data, error } = await sb.from("balances").select("date,total,block,remark").eq("code", code).gte("date", from).lte("date", to).order("date"); if (error) throw error; return data.map(r => ({ date: r.date, total: Number(r.total), block: r.block == null ? null : Number(r.block), remark: r.remark })); },
  async balanceCount() { const { count } = await sb.from("balances").select("date", { count: "exact", head: true }); return count || 0; },
  async balanceStats() {
    const one = async asc => (await sb.from("balances").select("date").order("date", { ascending: asc }).limit(1)).data?.[0]?.date || null;
    const [first, last, n] = await Promise.all([one(true), one(false), this.balanceCount()]);
    return { first, last, n };
  },
  async importBalances(rows, onProg) {
    for (let i = 0; i < rows.length; i += 1000) {
      const part = rows.slice(i, i + 1000).map(r => ({ date: r[0], code: r[1], total: r[2], block: r[3], remark: r[4], entered_by: "Old file (Foysal)" }));
      /* only fills MISSING rows — never overwrites a balance that was entered/edited in the app */
      const { error } = await sb.from("balances").upsert(part, { onConflict: "date,code", ignoreDuplicates: true }); if (error) throw error; onProg && onProg(Math.min(i + 1000, rows.length), rows.length);
    }
  },
  async upsertAccount(a) { const { error } = await sb.from("accounts").upsert(a, { onConflict: "code" }); if (error) throw error; },
  async upsertBook(b) {
    const row = { code: b.code, series: b.series || null, first_leaf: b.first, last_leaf: b.last, track_from: b.track, status: b.status, note: b.note || null }; if (b.id) row.id = b.id;
    const q = sb.from("books"), { data, error } = await (b.id ? q.upsert(row) : q.insert(row)).select().single(); if (error) throw error; return data.id;
  },
  async marks() { const { data, error } = await sb.from("leaf_marks").select("*").order("created_at", { ascending: false }).limit(5000); if (error) throw error; return data.map(markFrom); },
  async addMarks(rows) { const { error } = await sb.from("leaf_marks").insert(rows.map(r => ({ code: r.code, leaf_no: r.no, kind: r.kind, note: r.note || null, photo: r.photo || null, entered_by: S.me.name, user_id: S.me.id }))); if (error) throw error; },
  async resolveMark(id, note) { const { data, error } = await sb.from("leaf_marks").update({ resolved: true, resolved_note: note || null, resolved_by: S.me.name, resolved_at: new Date().toISOString() }).eq("id", id).select("id"); if (error) throw error; if (!data || !data.length) throw new Error("admin_only"); },
  async reopenMark(id) { const { data, error } = await sb.from("leaf_marks").update({ resolved: false, resolved_note: null, resolved_by: null, resolved_at: null }).eq("id", id).select("id"); if (error) throw error; if (!data || !data.length) throw new Error("admin_only"); },
  async deleteMark(id) { const { data, error } = await sb.from("leaf_marks").delete().eq("id", id).select("id"); if (error) throw error; if (!data || !data.length) throw new Error("admin_only"); },
  async deleteBook(id) { const { error } = await sb.from("books").delete().eq("id", id); if (error) throw /in_use/.test(error.message || "") ? new Error(bi("এই বইয়ের পাতায় চেক এন্ট্রি আছে — মুছা যাবে না। স্ট্যাটাস Finished বা Lost দিন", "This book has cheque entries — it cannot be deleted. Set the status to Finished or Lost instead.")) : error; },
  async dataKey() { const { data, error } = await sb.from("app_secrets").select("v").eq("k", "data_key").maybeSingle(); if (error || !data) throw new Error("ডাটা কী পাওয়া যায়নি"); return data.v; },
  async setModuleAccess(id, config) { const { error } = await sb.rpc("admin_set_module_access", {target_id:id, config}); if (error) throw error; },
  async users() { const { data, error } = await sb.from("profiles").select("*").order("role"); if (error) throw error; return data; },
  async updateProfile(id, p) { const { error } = await sb.from("profiles").update(p).eq("id", id); if (error) throw error; },
  async createUser(email, password, name, role) { const { data, error } = await sb.rpc("admin_create_user", { p_email: email, p_password: password, p_name: name, p_role: role }); if (error) throw userErr(error); return data; },
  async setUserPassword(id, password) { const { error } = await sb.rpc("admin_set_password", { p_user: id, p_password: password }); if (error) throw userErr(error); },
  async avatars() { const { data, error } = await sb.from("user_avatars").select("user_id,img"); if (error) throw error; return Object.fromEntries((data || []).map(r => [r.user_id, r.img])); },
  async setAvatar(img) { const { error } = await sb.rpc("set_my_avatar", { a: img || null }); if (error) throw error; },
  async setUserAvatar(id, img) { const { error } = await sb.rpc("admin_set_avatar", { p_user: id, a: img || null }); if (error) throw userErr(error); },
  /* v2: drafts, reminders, audit log, cheque photos (need schema_v2.sql) */
  async getDraft(d) { const { data, error } = await sb.from("balance_drafts").select("*").eq("date", d).maybeSingle(); if (error) throw error; return data ? { rows: data.data, at: data.updated_at, by: data.updated_by } : null; },
  async saveDraft(d, rows) { const { error } = await sb.from("balance_drafts").upsert({ date: d, data: rows, updated_by: S.me.name, updated_at: new Date().toISOString() }); if (error) throw error; },
  async deleteDraft(d) { const { error } = await sb.from("balance_drafts").delete().eq("date", d); if (error) throw error; },
  async reminders() { const since = new Date(Date.now() - 30 * 864e5).toISOString(); const { data, error } = await sb.from("reminders").select("*").or(`done.eq.false,done_at.gte.${since}`).order("due_at").limit(1000); if (error) throw error; return data; },
  async addReminder(r) { const row = { id: crypto.randomUUID(), title: r.title, note: r.note || null, due_at: r.due_at, repeat: r.repeat || "none", for_role: r.for_role || "me", kind: r.kind || "custom", cheque_id: r.cheque_id || null, created_by: S.me.name }; const { data, error } = await sb.from("reminders").insert(row).select().single(); if (error) throw error; return data; },
  async updateReminder(id, p) { const { error } = await sb.from("reminders").update(p).eq("id", id); if (error) throw error; },
  async deleteReminder(id) { const { error } = await sb.from("reminders").delete().eq("id", id); if (error) throw error; },
  async audit(f) { let q = sb.from("audit_log").select("*").order("at", { ascending: false }).limit(500); if (f.tbl) q = q.eq("tbl", f.tbl); if (f.act) q = q.eq("action", f.act); if (f.from) q = q.gte("at", new Date(f.from + "T00:00:00").toISOString()); if (f.to) q = q.lt("at", new Date(addDays(f.to, 1) + "T00:00:00").toISOString()); const { data, error } = await q; if (error) throw error; return data; },
  async uploadPhoto(path, blob) { const { error } = await sb.storage.from("cheque-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false }); if (error) throw error; },
  async photoUrl(path) { const { data, error } = await sb.storage.from("cheque-photos").createSignedUrl(path, 3600); if (error) throw error; return data.signedUrl; },
  async setPhoto(id, path) { const { error } = await sb.rpc("set_cheque_photo", { cid: id, p: path }); if (error) throw error; }
};

/* ---------- data layer: Demo (in-memory + localStorage) ---------- */
const DEMO_KEY = "nabiad_demo_v1";
let demoHist = null, demoStore = null;
const DemoAPI = {
  async init() {
    demoStore = JSON.parse(localStorage.getItem(DEMO_KEY) || "null") || { cheques: [], events: [], balances: {}, books: [], accounts: null };
    demoStore.drafts ||= {}; demoStore.reminders ||= []; demoStore.audit ||= []; demoStore.photos ||= {};
    S.demoAccounts = await (await fetch("dev/accounts.json")).json();
    if (!demoStore.accounts) demoStore.accounts = S.demoAccounts;
  },
  save() { localStorage.setItem(DEMO_KEY, JSON.stringify(demoStore)); },
  async session() {
    const s = sessionStorage.getItem("nabiad_demo_user");
    if (!s) return null;
    const user = JSON.parse(s), saved = (demoStore?.users || []).find(u => u.id === user.id);
    return saved ? (saved.active ? { ...user, ...saved } : null) : user;
  },
  async login(role, name) { const u = { id: "demo-" + role, email: role + "@demo", name, role }; sessionStorage.setItem("nabiad_demo_user", JSON.stringify(u)); return u; },
  async logout() { try { localStorage.removeItem("nabiad_locked"); } catch { } sessionStorage.removeItem("nabiad_demo_user"); },
  async loadAll() {
    const ev = {}; demoStore.events.forEach(e => (ev[e.cheque_id] ||= []).push(e));
    return { accounts: demoStore.accounts, books: demoStore.books, statementReady: true, cheques: demoStore.cheques.map(c => ({ ...c, events: ev[c.id] || [], statementVerification: demoStore.statementVerifications?.[c.id] || null })) };
  },
  async addCheque(c) {
    if (demoStore.cheques.some(x => x.code === c.code && x.no === c.no)) throw new Error("এই চেক নম্বর এই অ্যাকাউন্টে আগেই এন্ট্রি আছে");
    const row = { ...c, id: crypto.randomUUID(), uid: S.me.id, by: S.me.name, at: new Date().toISOString() }; demoStore.cheques.push(row); this.save(); return { ...row, events: [] };
  },
  async addStatus(chequeId, status, date, remarks) { const e = { id: crypto.randomUUID(), cheque_id: chequeId, status, date, remarks, by: S.me.name, at: new Date().toISOString() }; demoStore.events.push(e); this.save(); return e; },
  async updateCheque(id, p) { const c = demoStore.cheques.find(c => c.id === id); this.aud("cheques", "update", `${c.code} · ${c.no}`, { ...c }, { ...c, ...p }); Object.assign(c, p); this.save(); },
  async deleteCheque(id) { const c = demoStore.cheques.find(c => c.id === id); c && this.aud("cheques", "delete", `${c.code} · ${c.no}`, c, null); demoStore.cheques = demoStore.cheques.filter(c => c.id !== id); demoStore.events = demoStore.events.filter(e => e.cheque_id !== id); this.save(); },
  async deleteStatus(id) { demoStore.events = demoStore.events.filter(e => e.id !== id); this.save(); },
  async hist() {
    if (!demoHist) {
      demoHist = new Map(); const rows = await (await fetch("dev/history.json")).json();
      for (const r of rows) { let m = demoHist.get(r[0]); if (!m) demoHist.set(r[0], m = {}); m[r[1]] = { total: r[2], block: r[3], remark: r[4] }; }
      for (const k in demoStore.balances) { const [d, code] = k.split("|"); let m = demoHist.get(d); if (!m) demoHist.set(d, m = {}); m[code] = demoStore.balances[k]; }
    } return demoHist;
  },
  async lastBalDate() { const h = await this.hist(); return [...h.keys()].sort().pop() || null; },
  async balancesOn(d) { const h = await this.hist(); return h.get(d) || {}; },
  async prevBalances(d) { const h = await this.hist(); const ks = [...h.keys()].filter(k => k < d).sort(); const k = ks.pop(); return k ? { date: k, map: h.get(k) } : { date: null, map: {} }; },
  async saveBalances(d, rows, overwrite) {
    const h = await this.hist(); if (h.has(d) && !overwrite && Object.keys(h.get(d)).length) throw new Error("এই তারিখের ব্যালেন্স আগেই সেভ করা আছে — শুধু Admin বদলাতে পারবে");
    if (overwrite) rows.forEach(r => { const o = h.get(d)?.[r.code]; if (o && (o.total !== r.total || (o.block || 0) !== (r.block || 0))) this.aud("balances", "update", `${d} · ${r.code}`, { total: o.total, block: o.block }, { total: r.total, block: r.block }); });
    const m = {}; rows.forEach(r => { m[r.code] = { total: r.total, block: r.block, remark: r.remark, od: r.od, odp: r.odp, by: S.me.name }; demoStore.balances[d + "|" + r.code] = m[r.code]; }); h.set(d, { ...(h.get(d) || {}), ...m }); this.save();
  },
  async historyAll(from, to) { const h = await this.hist(), out = []; for (const [d, m] of [...h.entries()].sort()) if (d >= from && d <= to) for (const c in m) out.push({ date: d, code: c, total: m[c].total, block: m[c].block }); return out; },
  async history(code, from, to) { const h = await this.hist(); const out = []; for (const [d, m] of [...h.entries()].sort()) if (d >= from && d <= to && m[code]) out.push({ date: d, total: m[code].total, block: m[code].block, remark: m[code].remark }); return out; },
  async balanceCount() { const h = await this.hist(); let n = 0; h.forEach(m => n += Object.keys(m).length); return n; },
  async balanceStats() { const h = await this.hist(), ds = [...h.keys()].sort(); return { first: ds[0] || null, last: ds.at(-1) || null, n: await this.balanceCount() }; },
  async importBalances() { }, 
  async upsertAccount(a) { const i = demoStore.accounts.findIndex(x => x.code === a.code); if (i >= 0) demoStore.accounts[i] = { ...demoStore.accounts[i], ...a }; else demoStore.accounts.push(a); this.save(); },
  async upsertBook(b) { if (b.id) { Object.assign(demoStore.books.find(x => x.id === b.id), b); } else { b.id = crypto.randomUUID(); demoStore.books.push(b); } this.save(); return b.id; },
  async deleteBook(id) { demoStore.books = demoStore.books.filter(b => b.id !== id); this.save(); },
  async marks() { return (demoStore.marks ||= []).map(m => ({ ...m })); },
  async addMarks(rows) { const ms = (demoStore.marks ||= []); for (const r of rows) { if (demoStore.cheques.some(c => c.code === r.code && c.no === r.no)) throw new Error("leaf_in_use"); if (ms.some(m => m.code === r.code && m.no === r.no)) throw new Error("duplicate key value"); const auto = r.kind === "cancelled" || r.kind === "unused"; ms.push({ id: crypto.randomUUID(), code: r.code, no: r.no, kind: r.kind, note: r.note || null, photo: r.photo || null, resolved: auto, rnote: null, rby: auto ? "System" : null, rat: auto ? new Date().toISOString() : null, by: S.me.name, uid: S.me.id, at: new Date().toISOString() }); } this.save(); },
  async resolveMark(id, note) { const m = demoStore.marks.find(x => x.id === id); Object.assign(m, { resolved: true, rnote: note || null, rby: S.me.name, rat: new Date().toISOString() }); this.save(); },
  async reopenMark(id) { const m = demoStore.marks.find(x => x.id === id); Object.assign(m, { resolved: false, rnote: null, rby: null, rat: null }); this.save(); },
  async deleteMark(id) { demoStore.marks = demoStore.marks.filter(x => x.id !== id); this.save(); },
  async setModuleAccess(id, config) { const user = (demoStore.users || []).find(u => u.id === id); if (S.me.role !== "admin" || !user || user.role === "admin") throw writeDenied(); user.module_access = config; this.save(); },
  async users() { return [{ id: S.me?.id || "1", email: "admin@demo", name: "Admin", role: "admin", active: true }, ...(demoStore.users || [])]; },
  async updateProfile() { },
  async createUser(email, password, name, role) { if (demoStore.users?.some(u => u.email === email)) throw userErr({ message: "email_exists" }); (demoStore.users ||= []).push({ id: "d" + Date.now(), email, name: name || email.split("@")[0], role, active: true }); this.aud("users", "insert", email, null, { role, event: "user_created" }); this.save(); },
  async avatars() { return { ...(demoStore.avatars || {}) }; },
  async setUserAvatar(id, img) { (demoStore.avatars ||= {}); if (img) demoStore.avatars[id] = img; else delete demoStore.avatars[id]; this.save(); },
  async setAvatar(img) { (demoStore.avatars ||= {}); if (img) demoStore.avatars[S.me.id] = img; else delete demoStore.avatars[S.me.id]; this.save(); },
  async setUserPassword(id) { this.aud("users", "update", (demoStore.users || []).find(u => u.id === id)?.email || "admin@demo", null, { event: "password_reset" }); this.save(); },
  aud(tbl, action, key, o, n) { demoStore.audit.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), user_name: S.me?.name, tbl, action, row_key: key, old: o || null, new: n || null }); demoStore.audit.length > 2000 && (demoStore.audit.length = 2000); },
  async getDraft(d) { return demoStore.drafts[d] || null; },
  async saveDraft(d, rows) { demoStore.drafts[d] = { rows, at: new Date().toISOString(), by: S.me.name }; this.save(); },
  async deleteDraft(d) { delete demoStore.drafts[d]; this.save(); },
  async reminders() { return demoStore.reminders.map(r => ({ ...r })); },
  async addReminder(r) { const row = { id: crypto.randomUUID(), ...r, created_by: S.me.name, done: false, created_at: new Date().toISOString() }; demoStore.reminders.push(row); this.save(); return { ...row }; },
  async updateReminder(id, p) { Object.assign(demoStore.reminders.find(r => r.id === id) || {}, p); this.save(); },
  async deleteReminder(id) { demoStore.reminders = demoStore.reminders.filter(r => r.id !== id); this.save(); },
  async audit(f) { return demoStore.audit.filter(r => (!f.tbl || r.tbl === f.tbl) && (!f.act || r.action === f.act) && (!f.from || r.at.slice(0, 10) >= f.from) && (!f.to || r.at.slice(0, 10) <= f.to)).slice(0, 500); },
  async uploadPhoto(path, blob) { demoStore.photos[path] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); this.save(); },
  async photoUrl(path) { return demoStore.photos[path] || ""; },
  async setPhoto(id, path) { const c = demoStore.cheques.find(c => c.id === id); this.aud("cheques", "update", `${c.code} · ${c.no}`, { photo: c.photo || null }, { photo: path }); c.photo = path; this.save(); }
};
const API = DEMO ? DemoAPI : SbAPI;

/* local cache: app opens instantly with last known data, then refreshes in background */
const CACHE_KEY = "nabiad_cache_v2";
function saveCache() { if (DEMO) return; try { const old = readCache() || {}; localStorage.setItem(CACHE_KEY, JSON.stringify({ u: S.me?.id, me: S.me, t: Date.now(), accounts: S.accounts, books: S.books, marks: S.marks, cheques: S.cheques.filter(c => !c.pending), reminders: S.reminders, lastBal: S.lastBal, lastCash: S.lastCash, snap: S.snap || (old.u === S.me?.id ? old.snap : null) }));
  window.dispatchEvent(new Event("pwa-state"));
} catch { } }
function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; } }
const isNetErr = e => !navigator.onLine || /fetch|network|load failed|timed? ?out|ERR_/i.test(String(e?.message || e || ""));

/* ---------- offline outbox: entries made without internet are kept here and synced automatically ---------- */
const OB_KEY = "nabiad_outbox_v1", DEAD_KEY = "nabiad_outbox_dead_v1";
const Outbox = {
  list() { try { return JSON.parse(localStorage.getItem(OB_KEY) || "[]"); } catch { return []; } },
  save(a) { localStorage.setItem(OB_KEY, JSON.stringify(a)); syncBadge(); },
  add(kind, payload) { const a = this.list(); a.push({ k: kind, p: payload, at: Date.now(), u: S.me?.id }); this.save(a); },
  has(chequeId) { return this.list().some(x => x.k === "cheque" && x.p.id === chequeId); },
  count() { return this.list().length; },
  /* dead-letter: entries the server refused are parked here (never silently dropped) until a person retries or discards them */
  dead() { try { return JSON.parse(localStorage.getItem(DEAD_KEY) || "[]"); } catch { return []; } },
  saveDead(a) { localStorage.setItem(DEAD_KEY, JSON.stringify(a)); syncBadge(); },
  kill(it, why) { const a = this.dead(); a.push({ ...it, why: String(why || "").slice(0, 300), dead_at: Date.now() }); this.saveDead(a); },
  deadCount() { return this.dead().filter(x => !x.u || x.u === S.me?.id).length; },
  retry(i) { const d = this.dead(), it = d[i]; if (!it) return; d.splice(i, 1); const { why, dead_at, ...orig } = it; const a = this.list(); a.push(orig); this.save(a); this.saveDead(d); },
  discard(i) { const d = this.dead(); d.splice(i, 1); this.saveDead(d); },
  busy: false,
  async flush() {
    if (DEMO || this.busy || !navigator.onLine || !sb) return;
    let a = this.list(); if (!a.length) return syncBadge();
    this.busy = true; syncBadge(); let done = 0, dropped = [];
    try { await sb.auth.getSession(); } catch { }
    try {
      while (a.length) {
        const it = a[0], tbl = { cheque: "cheques", status: "cheque_status", bal: "balances", dcol: "dist_collections" }[it.k];
        const { error } = await sb.from(tbl).insert(it.p);
        if (error && isNetErr(error)) break;
        if (error && error.code !== "23505" && !/foreign key/i.test(error.message)) { if (/JWT|auth|permission|policy/i.test(error.message)) break; dropped.push(`${it.k}: ${error.message}`); this.kill(it, error.message); }
        else if (error && error.code !== "23505") { dropped.push(`${it.k}: ${error.message}`); this.kill(it, error.message); }   // foreign-key etc.: a real rejection, never mislabel as "already saved"
        else if (error) {
          if (it.k === "cheque") { dropped.push(`${it.p.code} · ${it.p.chq_no} — আগেই অন্য কেউ এন্ট্রি করেছে`); this.kill(it, "duplicate cheque (already entered by someone else)"); a.filter((x, i) => i > 0 && x.k === "status" && x.p.cheque_id === it.p.id).forEach(x => this.kill(x, "its cheque was a duplicate")); a = a.filter((x, i) => i === 0 || !(x.k === "status" && x.p.cheque_id === it.p.id)); }
          else if (it.k === "bal") dropped.push(`${it.p[0]?.date} ব্যালেন্স — আগেই সেভ করা আছে`);
          else if (it.k === "dcol") dropped.push(`${it.p.party} ${bi("কালেকশন — আগেই সেভ হয়েছে", "collection — already saved")}`);
        } else done++;
        a.shift(); this.save(a);
      }
    } finally { this.busy = false; syncBadge(); }
    if (done) { toast(bi(`✔ ${done}টি অফলাইন এন্ট্রি সিঙ্ক হয়েছে`, `✔ ${done} offline ${done === 1 ? "entry" : "entries"} synced`)); balCache.clear(); try { await reload(); refreshBadges(); if (CUR === "dcol" && window.__dcolRefresh) window.__dcolRefresh(); else if (CUR !== "closing") route(); } catch { } }
    dropped.forEach(m => toast(bi("সিঙ্ক হয়নি: ", "Not synced: ") + m, "err"));
  }
};
const DEAD_LABEL = { cheque: ["চেক", "Cheque"], status: ["স্ট্যাটাস", "Status"], bal: ["ব্যালেন্স", "Balance"], dcol: ["কালেকশন", "Collection"] };
function deadTitle(it) {
  const p = it.p || {};
  return it.k === "cheque" ? `${p.code || ""} · ${p.chq_no || ""}` : it.k === "bal" ? `${p[0]?.date || ""}` : it.k === "dcol" ? `${p.party || ""} · ${p.amount ?? ""}` : `${p.status || ""} · ${p.date || ""}`;
}
function deadModal() {
  const html = () => {
    const list = Outbox.dead().map((it, i) => ({ it, i })).filter(({ it }) => !it.u || it.u === S.me?.id);
    return `<h2>${bi("সার্ভার যেসব এন্ট্রি নেয়নি", "Entries the server rejected")}</h2>
      <div class="mut xs">${bi("এগুলো হারায়নি — এই ডিভাইসে রাখা আছে। কারণ ঠিক করে আবার চেষ্টা করুন, নয়তো কপি করে রেখে বাদ দিন।", "These were not lost — they are kept on this device. Fix the cause and retry, or copy them and discard.")}</div>
      ${list.length ? list.map(({ it, i }) => `<div class="card" style="margin:8px 0"><b>${esc((DEAD_LABEL[it.k] || [it.k, it.k])[LANG === "en" ? 1 : 0])}</b> · ${esc(deadTitle(it))}
        <div class="mut xs">${esc(new Date(it.at).toLocaleString())} — ${esc(it.why || "")}</div>
        <div class="row" style="margin-top:6px"><button class="btn fix" data-r="${i}">↻ ${bi("আবার চেষ্টা", "Retry")}</button><button class="btn fix" data-c="${i}">${bi("কপি", "Copy")}</button><button class="btn fix" data-d="${i}">${bi("বাদ দিন", "Discard")}</button></div></div>`).join("") : `<div class="mut" style="margin:12px 0">${bi("কিছু নেই ✔", "Nothing here ✔")}</div>`}
      <div class="modal-actions"><button class="btn" data-x="close">${bi("বন্ধ করুন", "Close")}</button></div>`;
  };
  const open = () => modal(html(), (root, close) => {
    $("[data-x=close]", root).onclick = close;
    $$("[data-r]", root).forEach(b => b.onclick = async () => { Outbox.retry(+b.dataset.r); open(); await Outbox.flush(); open(); });
    $$("[data-c]", root).forEach(b => b.onclick = () => copyText(JSON.stringify(Outbox.dead()[+b.dataset.c], null, 2), bi("কপি হয়েছে", "Copied")));
    $$("[data-d]", root).forEach(b => b.onclick = () => { if (!ask(bi("এই এন্ট্রি চিরতরে বাদ যাবে। নিশ্চিত?", "This entry will be permanently discarded. Sure?"))) return; Outbox.discard(+b.dataset.d); open(); });
  });
  open();
}
function syncBadge() {
  const el = $("#sync"); if (!el) return; const n = Outbox.count(), on = navigator.onLine;
  el.className = "sync " + (!on ? "off" : n ? "wait" : "ok");
  el.innerHTML = `<i></i><span>${!on ? "অফলাইন" : Outbox.busy ? "সিঙ্ক হচ্ছে…" : n ? "সিঙ্ক বাকি" : "অনলাইন"}${n ? ` · ${n}` : ""}${Outbox.deadCount() ? ` · ⚠${Outbox.deadCount()}` : ""}</span>`;
  el.title = !on ? "ইন্টারনেট নেই — এন্ট্রি এই ডিভাইসে জমা থাকবে, নেট এলে নিজে থেকে সিঙ্ক হবে" : n ? `${n}টি এন্ট্রি সার্ভারে যাওয়া বাকি — চাপলে এখনই সিঙ্ক` : "সব ডাটা সার্ভারে সেভ আছে";
}
window.addEventListener("online", () => { syncBadge(); toast("ইন্টারনেট ফিরে এসেছে — সিঙ্ক হচ্ছে"); Outbox.flush(); });
window.addEventListener("offline", () => { syncBadge(); toast("ইন্টারনেট নেই — অফলাইনে এন্ট্রি চালিয়ে যান, পরে নিজে সিঙ্ক হবে", "err"); });
setInterval(() => { if (Outbox.count()) Outbox.flush(); }, 20000);
function mergeOutbox() {
  const ob = Outbox.list().filter(x => x.u === S.me?.id); const ids = new Set(S.cheques.map(c => c.id));
  ob.filter(x => x.k === "cheque" && !ids.has(x.p.id)).forEach(x => { const r = x.p; S.cheques.push(derive({ id: r.id, date: r.chq_date, code: r.code, no: Number(r.chq_no), amount: Number(r.amount), purpose: r.purpose, taker: r.cash_taker, party: r.party, toac: r.to_ac, remarks: r.remarks, by: r.entered_by, at: new Date(x.at).toISOString(), events: [], pending: true })); });
  ob.filter(x => x.k === "status").forEach(x => { const c = S.cheques.find(c => c.id === x.p.cheque_id); if (c && !c.events.some(e => e.id === x.p.id)) { c.events.push({ id: x.p.id, status: x.p.new_status, date: x.p.status_date, remarks: x.p.remarks, by: x.p.entered_by, at: new Date(x.at).toISOString(), pending: true }); derive(c); } });
}
function pendingBal(d) { const m = {}; Outbox.list().filter(x => x.k === "bal" && x.p[0]?.date === d).forEach(x => x.p.forEach(r => m[r.code] = { total: r.total, block: r.block, remark: r.remark, od: r.other_debit, odp: r.other_deposit, by: r.entered_by, pending: true })); return m; }
function pendingBalDates() { return Outbox.list().filter(x => x.k === "bal").map(x => x.p[0]?.date).filter(Boolean); }
function loadCache() { if (DEMO) return false; try { const c = readCache(); if (!c || c.u !== S.me?.id) return false; S.accounts = c.accounts; S.books = c.books; S.marks = c.marks || []; S.cheques = c.cheques.map(derive); S.reminders = c.reminders || []; S.lastBal = c.lastBal; S.lastCash = c.lastCash || null; S.snap = c.snap; S.loaded = true; mergeOutbox(); const pd = pendingBalDates().sort().pop(); if (pd && (!S.lastBal || pd > S.lastBal)) S.lastBal = pd; return true; } catch { return false; } }
const balCache = new Map();
async function balancesOn(d) {
  const pb = pendingBal(d);
  if (!navigator.onLine && !DEMO) return Object.keys(pb).length ? pb : (S.snap?.date === d ? S.snap.map : {});
  if (!balCache.has(d)) balCache.set(d, API.balancesOn(d).then(m => { if (!DEMO && d === S.lastBal) { S.snap = { date: d, map: m }; saveCache(); } return m; }).catch(e => { balCache.delete(d); throw e; }));
  const m = await balCache.get(d); return Object.keys(pb).length ? { ...m, ...pb } : m;
}
async function reload() {
  const [d, lb, lc, lbk, rm, mk] = await Promise.all([API.loadAll(), API.lastBalDate(), API.lastCashDate().then(x => { S.cashOff = false; return x; }).catch(() => { S.cashOff = true; return S.lastCash || null; }), API.lastBookDate().catch(() => S.lastBook || null), API.reminders().then(x => { S.remErr = null; return x; }).catch(e => { S.remErr = e.message || String(e); return null; }), API.marks().then(x => { S.marksOff = false; return x; }).catch(() => { S.marksOff = true; return null; })]);
  if (rm) S.reminders = rm; if (mk) S.marks = mk; S.lastCash = lc; S.lastBook = lbk;
  S.accounts = d.accounts; S.books = d.books; S.cheques = d.cheques.map(derive); S.statementReady = d.statementReady; S.lastBal = lb; S.loaded = true; saveCache(); setTimeout(() => typeof remTick === "function" && remTick(), 50);
  if (!DEMO) { mergeOutbox(); const pd = pendingBalDates().sort().pop(); if (pd && (!S.lastBal || pd > S.lastBal)) S.lastBal = pd; if (S.lastBal && S.snap?.date !== S.lastBal) balancesOn(S.lastBal).catch(() => { }); }
}

/* encrypted data files (repo is public; key lives in the database, readable only by signed-in users) */
async function loadEncrypted(path) {
  const keyB64 = await API.dataKey(); const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const buf = new Uint8Array(await (await fetch(path, { cache: "no-store" })).arrayBuffer());
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ---------- derived stats ---------- */
const LK = {
  blank: { bn: "মুড়ি ফাঁকা", en: "Blank stub", ic: "✂️", d: ["পাতা ছেঁড়া হয়েছে কিন্তু মুড়িতে কিছু লেখা নেই — কোথায় গেছে জানা নেই (খুঁজে দেখতে হবে)", "Leaf is torn out but the stub is empty — usage unknown (needs tracing)"] },
  lost: { bn: "হারানো / চুরি", en: "Lost / stolen", ic: "🚨", d: ["পাতা পাওয়া যাচ্ছে না — প্রয়োজনে ব্যাংকে Stop Payment দিন", "Leaf cannot be found — give the bank a Stop Payment if needed"] },
  cancelled: { bn: "বাতিল / নষ্ট", en: "Cancelled / spoiled", ic: "✖", d: ["ভুল লেখা বা নষ্ট হওয়া পাতা, বাতিল করা হয়েছে", "Spoiled or mis-written leaf that was cancelled"] },
  unused: { bn: "অব্যবহৃত", en: "Unused (still in book)", ic: "📄", d: ["পাতা বইয়েই আছে, শুধু নম্বর বাদ পড়েছে", "Leaf is still in the book — the number was just skipped"] },
  other: { bn: "অন্য কারণ", en: "Other reason", ic: "•", d: ["অন্য কোনো কারণ — মন্তব্যে লিখুন", "Another reason — explain in the note"] }
};
const LK_ORD = ["blank", "lost", "cancelled", "unused", "other"];
const lkName = k => bi(LK[k].bn, LK[k].en);
const lkTag = k => `<span class="lk ${k}">${LK[k].ic} ${lkName(k)}</span>`;
const openMarks = () => S.marks.filter(m => !m.resolved);
const markOf = (code, no) => S.marks.find(m => m.code === code && m.no === no);
const _dupIdx = { ref: null, n: -1, map: null };
function findDup(code, no) {
  if (_dupIdx.ref !== S.cheques || _dupIdx.n !== S.cheques.length) { _dupIdx.map = new Map(S.cheques.map(c => [c.code + "|" + Number(c.no), c])); _dupIdx.ref = S.cheques; _dupIdx.n = S.cheques.length; }
  return _dupIdx.map.get(code + "|" + no) || null;
}
const _postCache = new WeakMap();
function postInfo(c) {
  let p = _postCache.get(c);
  if (!p || p.s !== c.at) { const at = Date.parse(c.at); p = { s: c.at, at, posted: Number.isFinite(at) ? iso(new Date(at)) : "" }; _postCache.set(c, p); }
  return p;
}
function bookForLeaf(code, no) {
  let latest = null;
  for (const b of S.books) {
    if (b.code === code && no >= b.first && (!latest || b.first > latest.first)) latest = b;
  }
  return latest && (latest.last == null || no <= latest.last) ? latest : null;
}
const canAddBook = () => S.me.role === "admin" || (S.me.role === "staff" && moduleCan("cheque", "entry"));
const noBookMsg = (code, no) => bi(`${code} · ${no} কোনো রেজিস্টার্ড চেক বইয়ে নেই — আগে চেক বই যোগ করুন।`, `${code} · ${no} is not in any registered cheque book — register the cheque book first.`);
const leafLabel = (code, no) => { const b = bookForLeaf(code, no); return (b?.series ? b.series + " " : "") + no; };
function bookLedger() {
  const accounts = new Map();
  const forCode = code => {
    if (!accounts.has(code)) accounts.set(code, { posted: [], marks: [], starts: [] });
    return accounts.get(code);
  };
  S.cheques.forEach(c => forCode(c.code).posted.push(c.no));
  S.marks.forEach(m => forCode(m.code).marks.push(m));
  S.books.forEach(b => forCode(b.code).starts.push(b.first));
  return accounts;
}
function bookStats(b, ledger = bookLedger()) {
  const account = ledger.get(b.code) || { posted: [], marks: [], starts: [] };
  const start = Math.max(b.first, b.track ?? b.first);
  // Open-ended legacy books stop before the next recorded range on the same account.
  const end = b.last ?? account.starts.reduce((limit, n) => n > b.first ? Math.min(limit, n - 1) : limit, Infinity);
  const within = n => Number.isSafeInteger(n) && n >= start && n <= end;
  const used = new Set(account.posted.filter(within));
  const marks = account.marks.filter(m => within(m.no) && !used.has(m.no)).sort((x, y) => x.no - y.no);
  const maxUsed = [...used].reduce((max, n) => max === null ? n : Math.max(max, n), null);
  const occupied = new Set([...used, ...marks.filter(m => maxUsed !== null && m.no <= maxUsed).map(m => m.no)]);
  const gaps = [];
  let next = start;
  for (const n of [...occupied].sort((x, y) => x - y)) {
    if (n > next) gaps.push([next, n - 1]);
    next = n + 1;
  }
  const missingCount = gaps.reduce((sum, [from, to]) => sum + to - from + 1, 0);
  const latest = maxUsed ?? start - 1;
  const reserved = marks.filter(m => m.no > latest && m.kind !== "unused").length;
  const remaining = b.last == null ? null : Math.max(0, b.last - latest - reserved);
  return { start, end, hasMarks: account.marks.some(m => m.no >= b.first && m.no <= end), used: used.size, maxUsed, gaps, missingCount, marks, remaining, capacity: b.last == null ? null : Math.max(0, b.last - start + 1) };
}
function gapPage(gaps, offset, limit) {
  const leaves = [];
  for (const [first, last] of gaps) {
    const size = last - first + 1;
    if (offset >= size) { offset -= size; continue; }
    const count = Math.min(limit - leaves.length, size - offset);
    for (let i = 0; i < count; i++) leaves.push(first + offset + i);
    if (leaves.length >= limit) break;
    offset = 0;
  }
  return leaves;
}
const allMissing = () => {
  const ledger = bookLedger();
  return S.books.filter(b => b.status === "Active").map(b => ({ b, st: bookStats(b, ledger) })).filter(x => x.st.missingCount);
};
function lastCheque(code) {
  let last = null;
  for (const cheque of S.cheques) {
    if (cheque.code === code && (!last || cheque.no > last.no)) last = cheque;
  }
  return last;
}
const nextNo = code => { const last = lastCheque(code), n = last ? Number(last.no) + 1 : NaN; return Number.isSafeInteger(n) ? n : ""; };
const pendingOld = () => S.cheques.filter(c => c.status === "Pending" && daysBetween(c.date, today()) > (CFG.PENDING_ALERT_DAYS ?? 3));
const activeAccounts = () => S.accounts.filter(a => a.status === "Active");
const sumAmt = a => a.reduce((s, c) => s + c.amount, 0);

/* ---------- searchable combobox ---------- */
let suggestionId = 0;
function suggest(input, getItems, onPick, opts = {}) {
  const wrap = input.parentElement; wrap.classList.add("suggest");
  const list = document.createElement("div"); list.className = "sg-list hide"; wrap.appendChild(list);
  list.id = "suggestions-" + ++suggestionId;
  list.setAttribute("role", "listbox");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  let items = [], idx = 0, picked = null, moved = false;
  const show = visible => {
    list.classList.toggle("hide", !visible);
    input.setAttribute("aria-expanded", String(visible));
    if (!visible) input.removeAttribute("aria-activedescendant");
  };
  const highlight = scroll => {
    const options = $$("[data-i]", list);
    options.forEach((option, i) => {
      option.classList.toggle("on", i === idx);
      option.setAttribute("aria-selected", String(i === idx));
    });
    const option = options[idx];
    if (option) {
      input.setAttribute("aria-activedescendant", option.id);
      if (scroll) option.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };
  show(false);
  const normalize = opts.normalize || norm;
  const fmt = it => opts.free ? it.value : `${it.value} (${it.label})`;
  const render = () => {
    const q = normalize(input.value);
    const rank = it => { if (it.last) return 9; const v = normalize(it.value); if (!q) return 0; if (v === q) return 0; if (v.startsWith(q)) return 1; if (v.includes(q)) return 2; return 3; };
    items = getItems().filter(it => !q || it.last || [it.value, it.label, it.sub].some(f => normalize(f).includes(q)))
      .map(it => ({ it, r: rank(it) })).sort((a, b) => a.r - b.r).slice(0, opts.max || 40).map(x => x.it);
    idx = 0; moved = false; list.innerHTML = items.map((it, i) => `<div data-i="${i}" id="${list.id}-${i}" role="option">${it.html || `<span><b>${esc(it.value)}</b> ${esc(it.label)}</span>`}<small>${esc(it.sub || "")}</small></div>`).join("") || `<div class="mut" role="option" aria-disabled="true">${bi("কিছু পাওয়া যায়নি", "No matches")}</div>`;
    show(!!(items.length || input.value));
    highlight(false);
  };
  const pick = it => { picked = it; input.value = fmt(it); show(false); onPick && onPick(it); };
  input.addEventListener("input", () => { picked = null; onPick && onPick(null); render(); });
  input.addEventListener("focus", () => { input.select(); render(); });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.isComposing || e.keyCode === 229 || e.repeat)) return;
    if (list.classList.contains("hide") && ["ArrowDown", "ArrowUp"].includes(e.key)) render();
    if (e.key === "ArrowDown") { idx = Math.min(idx + 1, items.length - 1); moved = true; e.preventDefault(); } else if (e.key === "ArrowUp") { idx = Math.max(idx - 1, 0); moved = true; e.preventDefault(); }
    else if (e.key === "Enter" || e.key === "Tab") {
      const exact = items.find(it => !it.last && normalize(it.value) === normalize(input.value)), sel = items[idx];
      const cand = opts.free && !input.value.trim() ? null : (exact || (sel && (!sel.last || moved) ? sel : null));
      if (!picked && cand && !list.classList.contains("hide")) { pick(cand); if (e.key === "Enter") { e.preventDefault(); input.dispatchEvent(new CustomEvent("picked")); } }
      else if (picked && e.key === "Enter") { e.preventDefault(); input.dispatchEvent(new CustomEvent("picked")); }
      return;
    } else if (e.key === "Escape" && !list.classList.contains("hide")) {
      e.preventDefault(); e.stopPropagation(); show(false); return;
    } else return;
    highlight(true);
  });
  list.addEventListener("mousedown", e => { const d = e.target.closest("[data-i]"); if (d) { e.preventDefault(); pick(items[+d.dataset.i]); input.dispatchEvent(new CustomEvent("picked")); } });
  let bt = 0; input.addEventListener("blur", () => { clearTimeout(bt); bt = setTimeout(() => show(false), 120); });
  input.addEventListener("focus", () => clearTimeout(bt));
  return { get: () => picked, set: it => { if (it) pick(it); else { picked = null; input.value = ""; } }, setSilent: it => { picked = it; input.value = it ? fmt(it) : ""; } };
}
const acItems = (all = false) => (all ? S.accounts : activeAccounts()).map(a => ({ value: a.code, label: a.holder || "", sub: a.bank || "" }));

/* ---------- shell / router ---------- */
const ROUTES = {
  dash: { t: "ড্যাশবোর্ড", ic: "home", roles: "asb", sec: "top", f: () => vDash },
  entry: { t: "চেক পোস্টিং", ic: "plus", roles: "as", sec: "main", f: () => vEntry },
  status: { t: "চেক স্ট্যাটাস", ic: "flag", roles: "as", sec: "main", f: () => vStatus },
  cheques: { t: "চেক রেজিস্টার", ic: "list", roles: "asb", sec: "main", f: () => vCheques },
  closing: { t: "ব্যাংক ক্লোজিং", ic: "bank", roles: "as", sec: "bank", f: () => vClosing },
  crep: { t: "ব্যাংক সামারি", ic: "img", roles: "asb", sec: "bank", f: () => vCrep },
  reports: { t: "ব্যাংক বিস্তারিত রিপোর্ট", ic: "chart", roles: "asb", sec: "bank", f: () => vReports },
  cash: { t: "ক্যাশ খাতা", ic: "book", roles: "as", sec: "cash", f: () => vCashBook },
  cashchk: { t: "ক্যাশ চেকার", ic: "check", roles: "as", sec: "cash", f: () => vCash },
  cashsum: { t: "ক্যাশ সামারি", ic: "pulse", roles: "asb", sec: "cash", f: () => vCashSum },
  cashrep: { t: "ক্যাশ রিপোর্ট", ic: "pie", roles: "asb", sec: "cash", f: () => vCashRep },
  dcol: { t: "কালেকশন এন্ট্রি", ic: "coins", roles: "as", sec: "dist", f: () => vDcol },
  dsum: { t: "কালেকশন সামারি", ic: "trend", roles: "asb", sec: "dist", f: () => vDsum },
  drep: { t: "কালেকশন রিপোর্ট", ic: "table", roles: "asb", sec: "dist", f: () => vDrep },
  books: { t: "চেক বই", ic: "book", roles: "asb", sec: "more", f: () => vBooks },
  accounts: { t: "অ্যাকাউন্ট ফাইন্ডার", ic: "card", roles: "asb", sec: "more", f: () => vAccounts },
  register: { t: "ক্যাশ লেজার", ic: "ledger", roles: "asb", sec: "more", f: () => vRegister },
  dparty: { t: "পার্টি তালিকা", ic: "users", roles: "asb", sec: "more", f: () => vDparty },
  rem: { t: "রিমাইন্ডার", ic: "bell", roles: "asb", sec: "more", f: () => vRem },
  settings: { t: "সেটিংস", ic: "gear", roles: "asb", sec: "more", f: () => vSettings },
  audit: { t: "অডিট ও সিকিউরিটি", ic: "shield", roles: "b", sec: "more", f: () => vSecurity },
  admin: { t: "অ্যাডমিন প্যানেল", ic: "sliders", roles: "a", sec: "more", f: () => vAdmin }
};
const SECS = { top: "", main: "চেক", bank: "ব্যাংক", cash: "ক্যাশ", dist: "ডিস্ট্রিবিউশন কালেকশন", more: "অন্যান্য" };
const roleKey = () => ({ admin: "a", staff: "s", boss: "b" }[S.me.role]);
const WRITE_ROUTES = {
  entry: () => moduleCan("cheque", "entry"),
  status: () => moduleCan("cheque", "edit"),
  closing: () => moduleOpen("bank"),
  cash: () => moduleOpen("cash"),
  dcol: () => moduleOpen("collection")
};
const allowed = () => Object.keys(ROUTES).filter(k => WRITE_ROUTES[k] ? WRITE_ROUTES[k]() : ROUTES[k].roles.includes(roleKey()));
let cleanup = null;
const getTheme = () => document.documentElement.dataset.theme || "light";
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("nabiad_theme", t); } catch { } $$(".th-ic").forEach(e => e.innerHTML = ico(t === "dark" ? "sun" : "moon")); }
function badges() { return { status: pendingOld().length, books: allMissing().reduce((a, x) => a + x.st.missingCount, 0) + openMarks().length, rem: typeof dueList === "function" ? dueList().length : 0 }; }
function sideMin(on, save = true) { sideFlyClose(); document.documentElement.dataset.side = on ? "min" : ""; if (save) try { localStorage.setItem("nabiad_side", on ? "min" : "full"); } catch { } const b = $("#sbtog"); if (b) { const t = LANG === "en" ? (on ? "Expand sidebar" : "Minimize sidebar") : (on ? "সাইডবার বড় করুন" : "সাইডবার ছোট করুন"); b.title = t; b.setAttribute("aria-label", t); b.setAttribute("aria-expanded", on ? "false" : "true"); } }
function shell() {
  const keys = allowed(), bd = badges();
  const link = k => { const r = ROUTES[k]; const n = bd[k]; return `<a href="#/${k}" data-k="${k}" title="${esc(r.t)}">${ico(r.ic)}<span>${r.t}</span>${n ? `<span class="badge">${n}</span>` : ""}</a>`; };
  /* v6.49: accordion sidebar — Dashboard · 5 collapsible groups · pinned utilities */
  const UTIL = ["rem", "settings", "audit", "admin"], GR = [["main", bi("চেক", "Cheque"), "chq", "#818cf8"], ["bank", bi("ব্যাংক", "Bank"), "vault", "#38bdf8"], ["cash", bi("ক্যাশ", "Cash"), "note", "#34d399"], ["dist", bi("কালেকশন", "Collection"), "net", "#fbbf24"], ["inv", bi("ইনভেন্টরি", "Inventory"), "ivbox", "#38bdf8"], ["more", bi("আরও", "More"), "grid", "#c4b5fd"]];
  const inGroup = g => keys.filter(k => ROUTES[k].sec === g && !UTIL.includes(k));
  let nav = keys.includes("dash") ? link("dash") : "";
  GR.forEach(([g, lab, ic, col]) => { const ks = inGroup(g); if (!ks.length) return; const n = ks.reduce((a, k) => a + (bd[k] || 0), 0);
    nav += `<div class="ng" data-g="${g}" data-ks="${ks.join(",")}" style="--gc:${col}"><button type="button" class="ng-h" aria-expanded="false" title="${esc(lab)}"><span class="gi">${ico(ic)}</span><span class="gl">${lab}</span><span class="gb badge" ${n ? "" : "hidden"}>${n || ""}</span><span class="chv">${ico("chev")}</span></button><div class="ng-b"><div class="ng-bi">${ks.map(link).join("")}</div></div></div>`; });
  const ut = UTIL.filter(k => keys.includes(k)), navFix = ut.length ? `<div class="nsep"></div>` + ut.map(link).join("") : "";
  const TABS = [
    [["entry", "status", "cheques"], "main", "চেক"],
    [["closing", "crep"], "bank", "ব্যাংক"],
    [["cash", "cashsum"], "cash", "ক্যাশ"],
    [["dcol", "dsum"], "dist", "কালেকশন"]
  ].map(([pages, sec, label]) => [pages.find(k => keys.includes(k)), sec, label]).filter(([k]) => k);
  const mob = TABS.map(t => t[0]);
  $("#app").innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b>NABIAD</b><span>Smart Finance Suite</span></div><button class="sbtog" id="sbtog" type="button">${ico("chev")}</button></div>
      <nav class="nav">${nav}</nav>
      ${navFix ? `<nav class="nav navfix" aria-label="Utilities">${navFix}</nav>` : ""}
      <div class="me">${avaEl(S.me.id, S.me.name, S.me.email)}<div class="who"><b>${esc(S.me.name)}</b><span class="mut">${esc(S.me.email)}</span></div><button class="iconbtn" id="logout" title="লগআউট">${ico("out")}</button></div></aside>
    <div class="mainwrap">
      <header class="topbar"><div class="tb-brand"><div class="logo" style="width:30px;height:30px"><img src="icon.svg" alt="Nabiad"></div>NABIAD</div><div class="crumb" id="crumb"></div><div class="sp"></div>
        <button class="searchbtn" id="qs">${ico("search").replace("<svg", '<svg width="16" height="16"')}<span class="lbl">চেক / অ্যাকাউন্ট খুঁজুন…</span><kbd>Ctrl K</kbd></button>
        <button class="iconbtn bell" id="bell" title="রিমাইন্ডার ও সতর্কতা">${ico("bell")}<span class="bb"></span></button>${DEMO ? "" : `<button class="sync" id="sync"></button>`}${langToggle()}<button class="iconbtn th-ic" id="theme" title="থিম">${ico(getTheme() === "dark" ? "sun" : "moon")}</button>
        <span class="pill" style="align-self:center">${esc(S.me.role)}${DEMO ? " · demo" : ""}</span></header>
      <main class="main"><div id="view"></div></main></div></div>
    <nav class="mnav">${TABS.map(([k, sec, lab]) => `<a href="#/${k}" data-tab="${k}" data-sec="${sec}"><span class="mi">${ico(ROUTES[k].ic)}</span><span class="ml">${lab}</span>${tabBadge(sec, bd)}</a>`).join("")}<button type="button" id="more" data-sec="more" aria-haspopup="dialog" aria-expanded="false"><span class="mi">${ico("more")}</span><span class="ml">আরও</span>${tabBadge("more", bd)}</button></nav>`;
  // Magic UI Magic Card, adapted for the static app: share one pointer listener per view.
  if (matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) {
    $("#view").addEventListener("pointermove", event => {
      if (event.pointerType !== "mouse") return;
      const card = event.target.closest(".magic-card");
      if (!card) return;
      const { left, top } = card.getBoundingClientRect();
      card.style.setProperty("--magic-x", `${event.clientX - left}px`);
      card.style.setProperty("--magic-y", `${event.clientY - top}px`);
    });
  }
  const lo = async () => { await API.logout(); try { localStorage.removeItem(CACHE_KEY); } catch { } location.hash = ""; location.reload(); };
  $("#logout").onclick = lo;
  $("#sbtog").onclick = () => sideMin(document.documentElement.dataset.side !== "min");
  $$(".nav .ng-h").forEach(h => h.onclick = () => { const g = h.parentElement; if (document.documentElement.dataset.side === "min") return sideFly(g, h); const was = g.classList.contains("open"); sideGroup(was ? null : g.dataset.g); }); /* accordion: one group open at a time */
  { let m = false; try { m = localStorage.getItem("nabiad_side") === "min"; } catch { } sideMin(m, false); }
  $("#theme").onclick = () => setTheme(getTheme() === "dark" ? "light" : "dark");
  $("#qs").onclick = palette; $("#bell").onclick = () => { const d = dueList(); if (d.length) dueModal(d); else location.hash = "#/rem"; }; updateBell();
  if ($("#sync")) { $("#sync").onclick = () => navigator.onLine ? Outbox.flush() : toast("ইন্টারনেট নেই — নেট এলে নিজে থেকে সিঙ্ক হবে", "err"); syncBadge(); }
  $("#lang").onclick = () => setLang(LANG === "bn" ? "en" : "bn");
  $("#more").onclick = e => { e.preventDefault(); openMore(keys, mob, bd, lo); };

}
const tabBadge = (sec, bd) => { const n = sec === "main" ? bd.status : sec === "more" ? (bd.books || 0) + (bd.rem || 0) : 0; return n ? `<span class="badge">${n}</span>` : ""; };
const secOf = k => { const x = ROUTES[k]?.sec; return !x || x === "top" ? "more" : x; };
function setTabActive(k) {
  $$(".mnav [data-sec]").forEach(tab => {
    const active = tab.dataset.sec === secOf(k);
    tab.classList.toggle("on", active);
    if (active && tab.matches("a")) tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  });
}
/* open the group that holds route k (or only the named group); everything else folds away */
/* v6.58: minimized sidebar shows one icon per group; clicking it opens a small flyout with that group's pages */
function sideFlyClose() { const f = $("#sidefly"); if (f) { f._off && f._off(); f.remove(); } }
function sideFly(g, h) {
  const old = $("#sidefly"), same = old && old.dataset.g === g.dataset.g; sideFlyClose(); if (same) return;
  const f = document.createElement("div"); f.id = "sidefly"; f.className = "sidefly"; f.dataset.g = g.dataset.g; f.style.setProperty("--gc", g.style.getPropertyValue("--gc"));
  f.innerHTML = `<div class="sf-t">${esc($(".gl", g).textContent)}</div>` + $(".ng-bi", g).innerHTML;
  document.body.appendChild(f);
  const r = h.getBoundingClientRect(); f.style.left = (r.right + 10) + "px"; f.style.top = Math.max(8, Math.min(r.top, innerHeight - f.offsetHeight - 10)) + "px";
  const down = e => { if (!f.contains(e.target) && !h.contains(e.target)) sideFlyClose(); }, key = e => { if (e.key === "Escape") sideFlyClose(); };
  f._off = () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", key, true); };
  document.addEventListener("mousedown", down, true); document.addEventListener("keydown", key, true);
  f.addEventListener("click", e => { if (e.target.closest("a")) sideFlyClose(); });
}
function sideGroup(k, byRoute) {
  $$(".nav .ng").forEach(g => { const has = byRoute ? !!$(`[data-k="${k}"]`, g) : g.dataset.g === k; g.classList.toggle("open", has); if (byRoute) g.classList.toggle("has-on", has); $(".ng-h", g).setAttribute("aria-expanded", has ? "true" : "false"); });
}
function refreshBadges() {
  const bd = badges();
  $$(".nav .ng").forEach(g => { const n = g.dataset.ks.split(",").reduce((a, k) => a + (bd[k] || 0), 0), b = $(".gb", g); b.textContent = n || ""; b.hidden = !n; });
  $$("[data-k]").forEach(a => { const n = bd[a.dataset.k]; let b = $(".badge", a); if (n) { if (!b) { b = document.createElement("span"); b.className = "badge"; a.appendChild(b); } b.textContent = n; } else b && b.remove(); });
  $$(".mnav [data-sec]").forEach(a => { const t = tabBadge(a.dataset.sec, bd); let b = $(".badge", a); if (t) { if (!b) { b = document.createElement("span"); b.className = "badge"; a.appendChild(b); } b.textContent = (t.match(/>(\d+)</) || [])[1]; } else b && b.remove(); });
}
/* label table cells so they can become cards on phones */
function labelTables(root) {
  $$("table", root).forEach(t => { const hs = $$("thead th", t).map(th => th.textContent.trim()); if (!hs.length) return; $$("tbody tr", t).forEach(tr => [...tr.children].forEach((td, i) => { if (!td.hasAttribute("data-l")) td.setAttribute("data-l", hs[i] || ""); })); });
}
async function route() {
  const v = $("#view");
  if (!S.me || !v) return;
  if (updReady && navigator.onLine && !Outbox.busy) { location.reload(); return; }   // switching page = safe moment to load the new version
  DIRTY = false;
  let k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (k === "audit" && S.me.role === "admin") {
    const old = sessionStorage.getItem("nabiad_sec_tab");
    const target = ["audit", "backup", "sec"].includes(old) ? old : "audit";
    history.replaceState(null, "", "#/admin?tab=" + target);
    k = "admin";
  }
  if (!allowed().includes(k)) k = "dash";
  CUR = k; document.body.classList.remove("print-rep");
  if (cleanup) { cleanup(); cleanup = null; }
  $$("[data-k]").forEach(a => a.classList.toggle("on", a.dataset.k === k)); setTabActive(k); sideGroup(k, true);
  try { const on = $(".side .nav a.on"); if (on) { const n = on.closest(".nav"), r = on.getBoundingClientRect(), nr = n.getBoundingClientRect(); if (r.top < nr.top + 8 || r.bottom > nr.bottom - 16) n.scrollTop += (r.top < nr.top + 8 ? r.top - nr.top - 40 : r.bottom - nr.bottom + 40); } } catch { }
  const cr = $("#crumb"); if (cr) cr.textContent = ROUTES[k].t;
  document.title = tr(ROUTES[k].t) + " · NABIAD Smart Finance Suite";
  v.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div><div class="skel" style="margin-top:12px"></div><div class="skel" style="margin-top:12px;width:70%"></div></div>`;
  const tok = ++ROUTE_TOK;   // v6.67: a slow page that finishes after the user moved on must never paint its error over the newer page
  try { const c = await ROUTES[k].f()(v) || null; if (tok !== ROUTE_TOK) { try { c && c(); } catch { } return; } cleanup = c; }
  catch (e) { console.error(e); if (tok !== ROUTE_TOK) return; v.innerHTML = `<div class="alert rd">${bi("ত্রুটি", "Error")}: ${esc(e.message || e)}</div>`; }
  window.scrollTo(0, 0);
}
let ROUTE_TOK = 0;
/* ---------- button roles: ONE look per purpose, everywhere (see .btn.s-* in style.css) ----------
   Close/Cancel, Save, Edit, View, Delete, Print, Share are recognised from the label (EN + BN) and given
   the same colour/pattern on every page. Add data-role="edit|view|del|close|print|share|save" to force one. */
(function () {
  const ROLE_RX = [
    ["close", /^(close|cancel|dismiss|বন্ধ|বন্ধ করুন|বাতিল|বাতিল করুন)$/i],
    ["del",   /^(delete|remove|মুছুন|মুছে ফেলুন|মুছবেন)(\s|$)/i],
    ["edit",  /^(edit|এডিট|সম্পাদনা)(\s|$)/i],
    ["view",  /^(view|দেখুন|বিস্তারিত)(\s|$)/i],
    ["print", /^(print|প্রিন্ট)(\s|$)/i],
    ["share", /^(share|শেয়ার)(\s|$)/i],
    ["photo", /^(add photo|replace photo|ছবি যোগ|ছবি বদলান)(\s|$)/i],
    ["remind", /^(reminders?|রিমাইন্ডার)(\s|$)/i],
    ["save",  /^(save|সেভ)(\s|$)/i]
  ];
  const VARIANT = /\b(pri|ok|bad|rdo|ghost|s-close|s-del|s-edit|s-view|s-print|s-share|s-photo|s-remind)\b/;
  const SKIP = ".dnav, .chips, .chip, .cp-header, .bk-tabs, .nav, .mnav, .sheet2, .topbar, .tabs";
  let queued = false;
  const decorate = () => {
    queued = false;
    document.querySelectorAll("button[title]:not([aria-label]),a[title]:not([aria-label])").forEach(el => { if (!el.textContent.trim()) el.setAttribute("aria-label", el.getAttribute("title")); });
    document.querySelectorAll(".btn:not([data-role-done]):not(.iconbtn)").forEach(el => {
      el.setAttribute("data-role-done", "1");
      if (el.closest(SKIP)) return;
      let role = el.dataset.role;
      if (!role) {
        if (VARIANT.test(el.className)) return;
        const label = el.textContent.replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
        if (!label || label.split(" ").length > 3) return;
        role = (ROLE_RX.find(([, rx]) => rx.test(label)) || [])[0];
      }
      if (!role) return;
      el.classList.add(role === "save" ? "pri" : "s-" + role);
    });
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(decorate); } };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  queue();
})();

/* ---------- command palette (Ctrl+K) ---------- */
function palette() {
  if ($(".pal")) return;
  const el = document.createElement("div"); el.className = "pal";
  el.innerHTML = `<div class="box"><input placeholder="চেক নং, A/C কোড, হোল্ডার, পার্টি, টাকা বা পাতার নাম…" autocomplete="off"><div class="res"></div></div>`;
  document.body.appendChild(el);
  const inp = $("input", el), res = $(".res", el); let items = [], idx = 0;
  const close = () => el.remove();
  const draw = () => {
    const q = inp.value.trim(), n = norm(q); items = [];
    const pages = allowed().filter(k => !n || norm(ROUTES[k].t + k).includes(n)).map(k => ({ g: "পাতা", ic: ROUTES[k].ic, t: ROUTES[k].t, s: "", go: () => location.hash = "#/" + k }));
    let chq = [], acc = [];
    if (n) {
      acc = S.accounts.filter(a => norm(a.code + a.holder + a.bank + (a.acno || "")).includes(n)).slice(0, 6).map(a => ({ g: "অ্যাকাউন্ট", ic: "card", t: `<b>${esc(a.code)}</b> · ${esc(a.holder || "")}`, s: `${esc(a.bank || "")} ${a.acno ? "· " + esc(a.acno) : ""}`, go: () => { location.hash = "#/accounts"; setTimeout(() => { const i = $("#acf-q"); if (i) { i.value = a.code; i.dispatchEvent(new Event("input")); } }, 60); } }));
      const raw = q.replace(/,/g, "");
      chq = S.cheques.filter(c => String(c.no).includes(raw) || norm(c.code + c.no + (c.party || "") + (c.remarks || "")).includes(n) || String(c.amount) === raw).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
        .map(c => ({ g: "চেক", ic: "list", t: `<b>${esc(c.code)} · ${c.no}</b> &nbsp;<span class="num">৳ ${money(c.amount)}</span> &nbsp;${stTag(c.status)}`, s: `${dmy(c.date)} · ${esc(c.purpose.split(" (")[0])}${c.party ? " · " + esc(c.party) : ""}`, go: () => chequeModal(c, () => { }) }));
    }
    items = [...chq, ...acc, ...pages.slice(0, n ? 4 : 10)]; idx = 0; let g = "";
    res.innerHTML = items.map((it, i) => { const h = it.g !== g ? `<div class="grp">${(g = it.g)}</div>` : ""; return h + `<div class="it ${i === 0 ? "on" : ""}" data-i="${i}">${ico(it.ic).replace("<svg", '<svg width="18" height="18" style="color:var(--mut)"')}<div class="t"><div>${it.t}</div>${it.s ? `<div class="mut sm">${it.s}</div>` : ""}</div></div>`; }).join("") || `<div class="empty">কিছু পাওয়া যায়নি</div>`;
  };
  const pick = i => { const it = items[i]; if (!it) return; close(); it.go(); };
  inp.addEventListener("input", draw);
  inp.addEventListener("keydown", e => {
    if (e.key === "Escape") return close();
    if (e.key === "Enter") { e.preventDefault(); return pick(idx); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(0, Math.min(items.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1))); $$(".it", res).forEach((d, i) => d.classList.toggle("on", i === idx)); $$(".it", res)[idx]?.scrollIntoView({ block: "nearest" }); }
  });
  res.addEventListener("click", e => { const d = e.target.closest("[data-i]"); if (d) pick(+d.dataset.i); });
  el.addEventListener("mousedown", e => { if (e.target === el) close(); });
  draw(); inp.focus();
}
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && S.me) { e.preventDefault(); palette(); } });
let CUR = "dash";
/* v6.66 — one page header for every page: section-coloured icon, breadcrumb, title, one-line purpose, actions */
const PH_SEC = { top: ["", ""], main: ["চেক", "Cheque"], bank: ["ব্যাংক", "Bank"], cash: ["ক্যাশ", "Cash"], dist: ["কালেকশন", "Collection"], more: ["আরও", "More"] };
const head = (title, extra = "", cls = "") => {
  const r = ROUTES[CUR] || {}, sec = r.sec || "top", sc = (PH_SEC[sec] || PH_SEC.top).map((x, i) => i ? x : x)[LANG === "en" ? 1 : 0];
  return `<div class="top ph s-${sec}${cls ? " " + cls : ""}"><div class="ph-l"><div class="pic">${ico(r.ic || "home")}</div><div class="ph-t">${sc ? `<div class="ph-bc"><i></i>${sc}</div>` : ""}<h1>${title}</h1></div></div>${extra ? `<div class="acts">${extra}</div>` : ""}</div>`;
};
const stTag = s => `<span class="st ${s}">${s}</span>`;
const pendTag = c => c.pending || c.events?.some(e => e.pending) ? ` <span class="tag" style="background:var(--am-soft);color:var(--am)" title="সার্ভারে যাওয়া বাকি">⏳ সিঙ্ক বাকি</span>` : "";
const chqIcons = c => `${c.photo ? ` <span class="ci" title="ছবি আছে">📷</span>` : ""}${(S.reminders || []).some(r => r.cheque_id === c.id && !r.done) ? ` <span class="ci" title="রিমাইন্ডার আছে">⏰</span>` : ""}`;

/* ---------- v6.37: install-the-app helper (Android / iOS / Windows / Mac) ---------- */
let installEvt = null; window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
window.addEventListener("appinstalled", () => { installEvt = null; });
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
function osKey() {
  const u = navigator.userAgent, p = navigator.platform || "";
  if (/iPhone|iPad|iPod/.test(u) || (p === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(u)) return "android"; if (/Win/.test(p)) return "win"; if (/Mac/.test(p)) return "mac"; return "win";
}
function installModal() {
  const en = LANG === "en", url = location.origin + "/", me = osKey();
  const T = {
    android: [en ? "Android" : "অ্যান্ড্রয়েড", en ? ["Open this site in <b>Chrome</b>", "Tap <b>⋮</b> (top right) → <b>Install app</b> (or <b>Add to Home screen</b>)", "Tap <b>Install</b> — the Nabiad icon appears on your home screen"] : ["এই সাইট <b>Chrome</b>-এ খুলুন", "উপরে ডানের <b>⋮</b> চাপুন → <b>Install app</b> (বা <b>Add to Home screen</b>)", "<b>Install</b> চাপুন — হোম স্ক্রিনে Nabiad আইকন চলে আসবে"]],
    ios: ["iPhone / iPad", en ? ["Open this site in <b>Safari</b> (not Chrome)", "Tap the <b>Share</b> button (square with an arrow)", "Choose <b>Add to Home Screen</b> → <b>Add</b>"] : ["এই সাইট <b>Safari</b>-তে খুলুন (Chrome-এ নয়)", "নিচের <b>Share</b> বোতাম (তীর-সহ বক্স) চাপুন", "<b>Add to Home Screen</b> → <b>Add</b> চাপুন"]],
    win: ["Windows", en ? ["Open this site in <b>Chrome</b> or <b>Edge</b>", "Click the <b>install icon</b> at the right end of the address bar (or menu → <b>Install Nabiad</b>)", "Click <b>Install</b> — it opens as its own app window and gets a desktop/Start menu shortcut"] : ["এই সাইট <b>Chrome</b> বা <b>Edge</b>-এ খুলুন", "অ্যাড্রেস বারের ডান প্রান্তের <b>install আইকন</b> চাপুন (বা মেনু → <b>Install Nabiad</b>)", "<b>Install</b> চাপুন — আলাদা অ্যাপ উইন্ডোতে খুলবে, ডেস্কটপ/Start মেনুতে শর্টকাট হবে"]],
    mac: ["Mac", en ? ["Chrome / Edge: click the <b>install icon</b> in the address bar → <b>Install</b>", "Safari: <b>File → Add to Dock</b>"] : ["Chrome / Edge: অ্যাড্রেস বারের <b>install আইকন</b> → <b>Install</b>", "Safari: <b>File → Add to Dock</b>"]]
  };
  const tabs = Object.keys(T).map(k => `<span class="chip ${k === me ? "on" : ""}" data-os="${k}">${T[k][0]}</span>`).join("");
  const steps = k => `<ol class="inst-st">${T[k][1].map(x => `<li>${x}</li>`).join("")}</ol>`;
  modal(`<h2>📲 ${en ? "Install the Nabiad app" : "Nabiad অ্যাপ ইনস্টল করুন"}</h2>
    <p class="mut" style="margin:0 0 12px">${en ? "No store needed — it installs straight from this page and updates itself." : "স্টোর লাগবে না — এই পেজ থেকেই ইনস্টল হয়, নিজে নিজে আপডেট হয়।"}</p>
    ${isStandalone() ? `<div class="alert gr" style="margin-bottom:12px">✔ ${en ? "This device already runs the installed app." : "এই device-এ অ্যাপ ইনস্টল করাই আছে।"}</div>` : ""}
    ${installEvt && !isStandalone() ? `<button class="btn pri lg" style="width:100%;margin-bottom:12px" id="in-go">${ico("dl")} ${en ? "Install on this device" : "এই device-এ এখনই ইনস্টল করুন"}</button>` : ""}
    <div class="seg wrap inst-tabs" style="width:100%;display:grid;grid-template-columns:repeat(4,1fr)">${tabs}</div>
    <div id="in-steps">${steps(me)}</div>
    <label class="f">${en ? "App link (share with staff)" : "অ্যাপের লিংক (স্টাফদের পাঠান)"}</label>
    <div class="row" style="flex-wrap:nowrap"><input class="in" id="in-url" value="${url}" readonly><button class="btn" id="in-cp">${ico("copyt")} Copy</button>${navigator.share ? `<button class="btn" id="in-sh">${ico("share")}</button>` : ""}</div>
    <div class="modal-actions"><button class="btn" data-x="close">${en ? "Close" : "বন্ধ করুন"}</button></div>`, (root, close) => {
    $$("[data-os]", root).forEach(c => c.onclick = () => { $$("[data-os]", root).forEach(x => x.classList.toggle("on", x === c)); $("#in-steps", root).innerHTML = steps(c.dataset.os); });
    $("#in-go", root) && ($("#in-go", root).onclick = async () => { try { installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === "accepted") { toast("✔ " + (en ? "Installing…" : "ইনস্টল হচ্ছে…")); close(); } } catch { } });
    $("#in-cp", root).onclick = async () => { try { await navigator.clipboard.writeText(url); } catch { $("#in-url", root).select(); document.execCommand("copy"); } toast("✔ " + (en ? "Link copied" : "লিংক কপি হয়েছে")); };
    $("#in-sh", root) && ($("#in-sh", root).onclick = () => navigator.share({ title: "Nabiad", url }).catch(() => { }));
    $("[data-x=close]", root).onclick = close;
  });
}

/* ---------- login ---------- */
function loginView(language = "en") {
  LANG = language;
  document.documentElement.lang = language;
  const demoBox = DEMO ? `<div class="alert am" style="margin-top:14px"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("Supabase সেট করা হয়নি, ডাটা শুধু এই ব্রাউজারে থাকবে।", "Supabase is not configured; data stays in this browser only.")}</span></div>
    <div class="chips" style="margin-top:12px">${[["admin", "Ruhul"], ["staff", "Foysal"], ["boss", "Boss"]].map(([r, n]) => `<span class="chip" data-demo="${r}|${n}">${r} (${n})</span>`).join("")}</div>` : "";
  $("#app").innerHTML = `<div class="login"><div class="tl-l"><button class="iconbtn th-ic" id="theme" title="Theme">${ico(getTheme() === "dark" ? "sun" : "moon")}</button></div><div class="tl">${langToggle()}</div>
    <div class="art"><div class="brand" style="padding:0"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b>NABIAD</b><span>Smart Finance Suite</span></div></div>
      <div><h1>চেক রেজিস্টার, দৈনিক ব্যাংক ক্লোজিং আর রিপোর্ট — এক জায়গায়</h1><p>প্রতিটি চেক পাতার হিসাব, মিসিং পাতা ধরা, আর Boss-এর জন্য তাৎক্ষণিক এনকোয়ারি।</p>
      <ul><li>Staff শুধু যোগ করতে পারে, বদলাতে পারে শুধু Admin</li><li>দৈনিক ক্লোজিং রিপোর্ট — ছবি, PDF, Excel, WhatsApp</li><li>মোবাইল ও কম্পিউটার দুটোতেই চলে</li></ul></div>
      <div class="sm" style="opacity:.6">© ${new Date().getFullYear()} NABIAD Group</div></div>
    <div class="pane"><div class="card"><div class="brand" style="padding:0 0 22px"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b style="color:var(--txt)">NABIAD</b><span class="mut">Smart Finance Suite</span></div></div>
    <h2>লগইন করুন</h2><p class="mut">আপনার অফিস ইমেইল ও পাসওয়ার্ড দিন</p>
    ${DEMO ? "" : `<form id="lf"><label class="f">ইমেইল</label><input class="in" id="em" type="email" autocomplete="username" required>
    <label class="f" style="margin-top:14px">পাসওয়ার্ড</label><input class="in" id="pw" type="password" autocomplete="current-password" required>
    <button class="btn pri lg" style="width:100%;margin-top:20px" id="lb">লগইন</button><div class="hint" id="le"></div></form>`}${demoBox}${isStandalone() ? "" : `<button class="inst-link" id="lg-inst" type="button">${ico("dl")} ${LANG === "en" ? "Install the app — Android · iPhone · Windows" : "অ্যাপ ইনস্টল করুন — Android · iPhone · Windows"}</button>`}</div></div></div>`;
  $("#theme").onclick = () => setTheme(getTheme() === "dark" ? "light" : "dark"); $("#lg-inst") && ($("#lg-inst").onclick = installModal);
  $("#lang").onclick = () => loginView(LANG === "bn" ? "en" : "bn");
  const done = async u => {
    LANG = savedAppLanguage();
    document.documentElement.lang = LANG;
    S.me = u;
    await boot();
  };
  if (DEMO) $$("[data-demo]").forEach(c => c.onclick = async () => { const [r, n] = c.dataset.demo.split("|"); await done(await API.login(r, n)); });
  else $("#lf").onsubmit = async e => { e.preventDefault(); $("#lb").disabled = true; try { const u = await API.login($("#em").value.trim(), $("#pw").value); if (!u) throw new Error("প্রোফাইল পাওয়া যায়নি বা নিষ্ক্রিয়"); await done(u); } catch (er) { $("#le").textContent = "লগইন হয়নি: " + (er.message || er); $("#le").className = "hint rd"; $("#lb").disabled = false; } };
}

/* ---------- dashboard ---------- */

/* ---------- cheque entry ---------- */
const chequeDigits = value => String(value ?? "").trim().replace(/[০-৯]/g, digit => digit.charCodeAt(0) - 2534);
const chequeSearchKey = value => chequeDigits(value).normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, "");
function chequeNumber(value) {
  const text = chequeDigits(value);
  const number = Number(text);
  return /^\d+$/.test(text) && Number.isSafeInteger(number) && number > 0 ? number : NaN;
}
function chequeAmount(value) {
  const text = chequeDigits(value).replace(/^৳\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(text)) return NaN;
  const amount = Number(text.replace(/,/g, ""));
  return Number.isSafeInteger(Math.round(amount * 100)) ? amount : NaN;
}
function validChequeDate(value) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function chequeMatcher(query, accounts) {
  const terms = chequeDigits(query).split(/\s+/).map(chequeSearchKey).filter(Boolean);
  const amount = chequeAmount(query);
  return c => {
    if (!terms.length) return true;
    if (c.amount === amount) return true;
    const a = accounts[c.code];
    const text = chequeSearchKey([c.code, c.no, c.purpose, c.party, c.remarks, c.taker, c.toac, a?.holder, a?.bank].join(" "));
    return terms.every(term => text.includes(term));
  };
}
const statusWrites = new Set();
async function setStatus(c, status, date, remarks) {
  if (!moduleCan("cheque", "edit")) throw writeDenied();
  if (!validChequeDate(date) || date > today()) throw new Error(bi("আজকের বা আগের একটি তারিখ দিন।", "Choose today or an earlier date."));
  if (!STATUSES.includes(status)) throw new Error(bi("স্ট্যাটাস বাছুন।", "Choose a status."));
  if (statusWrites.has(c.id)) throw new Error(bi("স্ট্যাটাস সেভ হচ্ছে।", "A status update is in progress."));
  statusWrites.add(c.id);
  try {
    const event = await API.addStatus(c.id, status, date, remarks);
    const current = S.cheques.find(row => row.id === c.id) || c;
    if (!current.events.some(e => e.id === event.id)) current.events.push(event);
    derive(current); saveCache(); refreshBadges();
    return current;
  } finally { statusWrites.delete(c.id); }
}
/* v6.136: Cheque Posting — amount shorthand + words */
const _w1 = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const _w10 = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const _w2 = n => n < 20 ? _w1[n] : _w10[Math.floor(n / 10)] + (n % 10 ? "-" + _w1[n % 10] : "");
const _w3 = n => (n >= 100 ? _w1[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? _w2(n % 100) : "");
function takaWords(amount) {
  if (!(amount > 0) || amount >= 1e12) return "";
  let n = Math.floor(amount); const paisa = Math.round((amount - n) * 100), parts = [];
  for (const [d, label] of [[1e7, "Crore"], [1e5, "Lakh"], [1e3, "Thousand"]]) { const q = Math.floor(n / d); if (q) { parts.push(_w3(q) + " " + label); n %= d; } }
  if (n) parts.push(_w3(n));
  return "Taka " + [parts.join(" "), paisa ? (parts.length ? "and " : "") + _w2(paisa) + " Paisa" : ""].filter(Boolean).join(" ") + " Only";
}
function expandAmt(value) {
  const m = chequeDigits(value).replace(/^৳\s*/, "").match(/^(\d+(?:\.\d{1,2})?)\s*(k|l|lac|lakh|lakhs|lk|cr|crore)$/i);
  if (!m) return value;
  const mult = { k: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, lk: 1e5, cr: 1e7, crore: 1e7 }[m[2].toLowerCase()];
  return String(Math.round(Number(m[1]) * mult * 100) / 100);
}
async function vEntry(v) {
  const st = { purpose: null, photo: null };
  const activityPageSize = 12;
  let activityMode = "today", activityStatus = "", activityLimit = activityPageSize;
  const dateLabel = bi("চেকের তারিখ", "Cheque date");
  const postedLabel = bi("পোস্ট করা হয়েছে", "Posted");
  const activitySearchLabel = bi("এই তালিকায় চেক খুঁজুন", "Search this activity");
  v.innerHTML = head("চেক পোস্টিং", `<a class="btn cqh pri" href="#/books">${ico("book")} ${bi("চেক বই", "Cheque Book")}</a>${moduleCan("cheque", "edit") ? `<a class="btn cqh am" href="#/status">${ico("flag")} ${bi("স্ট্যাটাস", "Status")}</a>` : ""}<a class="btn cqh gr" href="#/cheques">${ico("list")} ${bi("রেজিস্টার", "Register")}</a>`, "tc cp-header") + `
  <div class="split cq-posting">
   <div class="card tbar navcard cp-date-card"><div class="dnav cp-dnav"><button type="button" class="btn" id="e-dprev" title="${bi("আগের দিন (শুক্রবার বাদ)", "Previous day (skips Friday)")}">${bi("‹ আগের", "‹ Prev")}</button><input class="in big" type="date" id="e-activity-date" value="${today()}" aria-label="${dateLabel}"><button type="button" class="btn" id="e-dnext" title="${bi("পরের দিন (শুক্রবার বাদ)", "Next day (skips Friday)")}">${bi("পরের ›", "Next ›")}</button></div>
    <dl class="cp-activity-stats">
         <div><dt>${bi("এন্ট্রি", "Entries")}</dt><dd id="e-cnt" class="num"></dd></div>
         <div><dt>${bi("কার্যকর মোট", "Live amount")}</dt><dd id="e-total" class="num"></dd></div>
         <div><dt>${bi("অপেক্ষমাণ অঙ্ক", "Pending amount")}</dt><dd id="e-pending-total" class="num"></dd></div>
       </dl></div>
   <section class="card efc" aria-labelledby="e-title">
    <div class="cp-headrow"><h2 class="cp-title" id="e-title">${bi("নতুন চেক এন্ট্রি", "New cheque entry")}</h2><span class="cp-keyhint mut xs">${bi("Enter ↵ দিয়ে পরের ঘরে যান", "Press Enter ↵ to move to the next field")}</span></div>
    <ol class="cp-flow" id="e-flow" aria-label="${bi("এন্ট্রির ধাপ", "Entry steps")}">${[["e-date", bi("তারিখ", "Date")], ["e-ac", "A/C"], ["e-no", bi("চেক নং", "Cheque no")], ["e-amt", bi("টাকা", "Amount")], ["e-purp", bi("খাত", "Purpose")], ["e-rem", bi("মন্তব্য", "Remarks")]].map(([id, label], i) => `<li><button type="button" tabindex="-1" data-step="${id}"><i>${i + 1}</i><span>${label}</span></button></li>`).join("")}</ol>
    <div class="fgrid ef">
     <div class="s2"><label class="f" for="e-date">${dateLabel}</label><input class="in" type="date" id="e-date" value="${today()}"></div>
     <div class="s2"><label class="f" for="e-ac">A/C Code</label><div><input class="in" id="e-ac" autocomplete="off" placeholder="${bi("কোড বা নাম", "Code or name")}"></div></div>
     <div class="s4 cp-recent hide" id="e-recent-ac" aria-label="${bi("সাম্প্রতিক A/C", "Recent accounts")}"></div>
     <div class="s2"><label class="f" for="e-no">${bi("চেক নং", "Cheque no")} <span class="cp-auto hide" id="e-auto">${bi("অটো", "auto")}</span></label><input class="in" id="e-no" inputmode="numeric" autocomplete="off" aria-describedby="e-nohint e-nberr"><div class="hint cp-hint" id="e-nohint"></div></div>
     <div class="s2"><label class="f" for="e-amt">${bi("টাকা", "Amount")}</label><input class="in num" id="e-amt" inputmode="decimal" autocomplete="off" aria-describedby="e-amthint" placeholder="${bi("যেমন 50000 বা 5l", "e.g. 50000 or 5l")}"><div class="hint num cp-hint" id="e-amthint"></div></div>
     <div class="s4 cp-nberr" id="e-nberr" role="alert" hidden></div>
     <div class="s4 cp-purpose"><div class="cp-section-head"><span class="f" id="e-purpose-label">${bi("খাত", "Purpose")}</span><div class="cp-purpose-tools">
       <button class="btn sm" type="button" id="e-padd">${ico("plus")} ${bi("নতুন খাত যোগ করুন", "New purpose")}</button>
       ${S.me.role === "admin" ? `<button class="btn sm" type="button" id="e-pmg">${ico("edit")} ${bi("খাত সম্পাদনা", "Edit purposes")}</button>` : ""}
     </div></div><div class="chips" id="e-purp" role="radiogroup" aria-labelledby="e-purpose-label"></div></div>
     <div class="s4" id="x-cash" style="display:none"><label class="f">${bi("কে তুলেছে *", "Withdrawn by *")}</label><input type="hidden" id="e-taker"><div class="chips takers" id="e-takers" role="radiogroup" aria-label="${bi("কে তুলেছে", "Withdrawn by")}">${TAKERS.map(t => `<button class="chip" type="button" role="radio" data-t="${esc(t)}" aria-checked="false" tabindex="-1">${esc(t)}</button>`).join("")}</div></div>
     <div class="s4" id="x-own" style="display:none"><label class="f" for="e-toac">কোন A/C তে জমা * <span class="mut">(${bi("শুধু রেকর্ড", "record only")})</span></label><div><input class="in" id="e-toac" autocomplete="off" placeholder="${bi("যে অ্যাকাউন্টে টাকা গেছে — কোড বা নাম টাইপ করুন", "Receiving account — type code or name")}"></div></div>
     <div class="s4 cbm" id="e-cashlink" style="display:none"></div>
     <div class="s4"><label class="f" for="e-rem">${bi("মন্তব্য", "Remarks")} <span class="mut xs">${bi("(↓ দিয়ে সাজেশন বাছুন)", "(↓ to pick a suggestion)")}</span></label><input class="in" id="e-rem" autocomplete="off" placeholder="${bi("যেমন: সাপ্লায়ারের নাম — বিলের বিবরণ", "e.g. supplier name — bill details")}"><div class="cp-recent cp-remchips hide" id="e-remchips" aria-label="${bi("মন্তব্যের সাজেশন", "Remark suggestions")}"></div></div>
     <details class="s4 cp-attachment" id="e-attach"><summary>${ico("cam")} <span>${bi("চেকের ছবি", "Cheque photo")}</span> <span class="mut sm" id="e-photo-state">${bi("ঐচ্ছিক", "Optional")}</span></summary>
       <div class="photo-in"><button type="button" class="btn" id="e-camera">${ico("cam")} ${bi("ক্যামেরা", "Camera")}</button><button type="button" class="btn" id="e-gallery">${ico("img")} ${bi("গ্যালারি", "Gallery")}</button>
       <input type="file" id="e-ph-c" accept="image/*" capture="environment" hidden><input type="file" id="e-ph" accept="image/*" hidden><img id="e-phv" class="hide" alt="${bi("চেকের ছবির প্রিভিউ", "Cheque photo preview")}"><button type="button" class="btn sm ghost hide" id="e-phx" aria-label="${bi("ছবি বাদ দিন", "Remove photo")}">✕</button></div>
       <div id="e-ocrw" class="hide noprint"><button type="button" class="btn sm" id="e-ocr">${ico("search")} ${bi("ছবি থেকে পড়ুন", "Read from photo")}</button><div id="e-ocro"></div></div>
     </details>
     <div class="s4" id="e-sum" style="display:none"></div>
    </div>
    <div class="fbar cp-footer">
      <div class="hint rd" id="e-err" role="alert"></div>
      <label class="keep"><input type="checkbox" id="keep" checked> ${bi("পরের এন্ট্রিতে A/C ও খাত ধরে রাখুন", "Keep A/C and purpose for next entry")}</label>
      <div class="entry-actions"><button type="button" class="btn lg" id="e-clear">${bi("পরিষ্কার", "Clear")}</button><button type="button" class="btn pri lg" id="e-save">${ico("save")} ${bi("সেভ", "Save")}</button></div>
    </div>
   </section>
   <section class="card flush cp-activity" aria-labelledby="e-activity-title">
     <div class="ch"><h3 id="e-activity-title">${bi("চেক এন্ট্রি", "Cheque activity")}</h3></div>
     <div class="cp-activity-controls">
       <div id="e-review-tools">
         <label class="cp-search"><span aria-hidden="true">${ico("search")}</span><input class="in" type="search" id="e-find" aria-label="${activitySearchLabel}" placeholder="${bi("চেক নং, A/C বা অঙ্ক", "Cheque no, A/C or amount")}" autocomplete="off"></label>
         <div class="chips cp-status" id="e-activity-filters" role="group" aria-label="${bi("স্ট্যাটাস ফিল্টার", "Status filter")}" aria-controls="e-list"></div>
         <select class="in cp-sel" id="e-period-sel" aria-label="${bi("এন্ট্রির সময়", "Activity period")}" aria-controls="e-list"><option value="today">${bi("আজ পোস্ট করা", "Posted today")}</option><option value="date">${bi("চেকের তারিখে", "By cheque date")}</option></select>
       </div>
     </div>
     <div id="e-list"></div>
     <div class="cp-activity-footer"><span class="mut sm" id="e-visible" role="status"></span><button type="button" class="btn sm cp-more" id="e-more" aria-controls="e-list" hidden>${bi("আরও দেখুন", "Show more")}</button></div>
   </section>
  </div>`;
  const posting = $(".cq-posting", v);
  const $e = id => $("#" + id, posting);
  let autoNo = "", remIdx = -1, flashId = "";
  const radios = g => $$("[role=radio]", g);
  const checkedOf = g => radios(g).find(b => b.getAttribute("aria-checked") === "true");
  const rove = g => { const on = checkedOf(g) || radios(g)[0]; radios(g).forEach(b => { b.tabIndex = b === on ? 0 : -1; }); return on; };
  const shake = el => { if (!el) return; el.classList.remove("cp-shake"); void el.offsetWidth; el.classList.add("cp-shake"); };
  const autoTag = () => $e("e-auto").classList.toggle("hide", !autoNo || $e("e-no").value !== autoNo);
  const noHint = code => { const last = lastCheque(code); $e("e-nohint").textContent = last ? bi(`শেষ এন্ট্রি: ${last.no} (${dmy(last.date)})`, `Last entry: ${last.no} (${dmy(last.date)})`) : bi("এই অ্যাকাউন্টে এখনো এন্ট্রি নেই", "No entries for this account yet"); };
  const setAutoNo = code => { const n = nextNo(code); autoNo = n === "" ? "" : String(n); $e("e-no").value = autoNo; noHint(code); autoTag(); };
  const ac = suggest($e("e-ac"), () => acItems(), it => {
    const a = it && accMap()[it.value]; 
    if (it) setAutoNo(it.value);
    sum(); drawRem(); flow();
  });
  const toac = suggest($e("e-toac"), () => acItems(true).filter(i => i.value !== ac.get()?.value), () => sum());
  const clearPhoto = photoPicker(v, st, { inp: "e-ph", cam: "e-ph-c", img: "e-phv", x: "e-phx" }, () => { $e("e-ocrw").classList.toggle("hide", !st.photo); $e("e-ocro").innerHTML = ""; $e("e-photo-state").textContent = st.photo ? bi("ছবি যুক্ত হয়েছে", "Attached") : bi("ঐচ্ছিক", "Optional"); });
  $e("e-camera").onclick = () => $e("e-ph-c").click();
  $e("e-gallery").onclick = () => $e("e-ph").click();
  $e("e-ocr").onclick = () => runOcr(st, $e("e-ocro"), val => { $e("e-no").value = val; $e("e-no").dispatchEvent(new Event("input")); }, val => { $e("e-amt").value = val; $e("e-amt").dispatchEvent(new Event("input")); });
  const purpKey = () => st.purpose ? purposeKey(st.purpose) : "";
  let clTok = 0, clT = 0;
  const setTaker = t => { $e("e-taker").value = t || ""; const g = $e("e-takers"); radios(g).forEach(c => { const on = c.classList.toggle("on", c.dataset.t === t); c.setAttribute("aria-checked", on); }); rove(g); draw(); flow(); };
  $$("#e-takers .chip", v).forEach(c => c.onclick = ev => { setTaker($e("e-taker").value === c.dataset.t ? "" : c.dataset.t); $e("e-err").textContent = ""; if (ev.detail && !matchMedia("(pointer:coarse)").matches) $e("e-rem").focus(); });
  function drawPurp() {
    if (!posting.isConnected) return;
    $e("e-purp").innerHTML = allPurposes().map(p => `<button class="chip" type="button" role="radio" data-p="${esc(p)}" aria-checked="false" tabindex="-1">${esc(p.split(" (")[0])}</button>`).join("");
    if ($e("e-pmg")) $e("e-pmg").onclick = () => purposeManage(() => { if (st.purpose && !allPurposes().includes(st.purpose)) st.purpose = ""; drawPurp(); });
    $$(".chip[data-p]", v).forEach(c => c.onclick = ev => { st.purpose = c.dataset.p; $e("e-err").textContent = ""; applyPurpose(); if (!ev.detail) return; if (purpKey() === "cash") $e("x-cash").scrollIntoView({ block: "nearest" }); else if (purpKey() === "own") $e("e-toac").focus(); else if (!matchMedia("(pointer:coarse)").matches) $e("e-rem").focus(); });
    $e("e-padd").onclick = () => askText("নতুন খাত (Purpose)", "খাতের নাম লিখুন (যেমন: Salary)", "", async n => {
      if (allPurposes(true).some(p => p.split(" (")[0].trim().toLowerCase() === n.split(" (")[0].trim().toLowerCase())) throw new Error("এই খাত আগেই আছে");
      await API.purposeAdd(n); PURP_X = [...allPurposes(), n]; if (!DEMO) localStorage.setItem("nb_purp_v2", JSON.stringify(PURP_X));
      st.purpose = n; drawPurp(); toast("✔ নতুন খাত যোগ হয়েছে");
    });
    applyPurpose();
  }
  function applyPurpose() {
    $$(".chip[data-p]", v).forEach(c => { const on = c.classList.toggle("on", c.dataset.p === st.purpose); c.setAttribute("aria-checked", on); });
    rove($e("e-purp"));
    const k = purpKey(); $e("x-cash").style.display = k === "cash" ? "" : "none"; $e("x-own").style.display = k === "own" ? "" : "none"; sum(); drawRem(); flow();
  }
  drawPurp(); loadPurposes().then(drawPurp);
  /* Cheque Posting (Cash Withdrawal) ↔ Cash Checker "Total Bank" link */
  async function cashLink() {
    const el = $e("e-cashlink"), tok = ++clTok; if (!el) return;
    const code = ac.get()?.value, date = $e("e-date").value;
    if (purpKey() !== "cash" || !code || !date) { el.style.display = "none"; return; }
    const { src, ok } = await cashEff(date);
    if (tok !== clTok || !el.isConnected) return;
    const entered = cashAccSum(src, "bank_in")[code] || 0;
    const posted = S.cheques.filter(c => c.date === date && c.code === code && purposeKey(c.purpose) === "cash" && isLive(c)).reduce((q, c) => q + c.amount, 0), cur = chequeAmount($e("e-amt").value) || 0;
    el.style.display = ""; el.className = "s4 cbm";
    el.innerHTML = `<div class="cbm-h"><span>${ico("link")} Cash Checker (${dmy(date)}) · Receipt › Bank · <b>${esc(code)}</b>: <b class="num">${src ? "৳ " + money0(entered) : ok ? bi("এখনো এন্ট্রি নেই", "no entry yet") : "—"}</b> · ${bi("চেক পোস্টিং", "Cheque Posting")}: <b class="num">৳ ${money0(posted)}</b>${cur ? ` <span class="mut xs">(+ ৳ ${money0(cur)} ${bi("এই চেক", "this cheque")})</span>` : ""}</span><a class="btn sm" href="#/cashchk" id="e-cashgo">${bi("Cash Checker খুলুন", "Open Cash Checker")}</a></div>`;
    $("#e-cashgo", el).onclick = () => sessionStorage.setItem("nabiad_cash_date", date);
  }
  function amtVal() { return expandAmt($e("e-amt").value); }
  function commitAmt() { const x = expandAmt($e("e-amt").value); if (x !== $e("e-amt").value) { $e("e-amt").value = x; sum(); } }
  function sum() { clearTimeout(clT); clT = setTimeout(cashLink, 350); draw(); }
  function draw() {
    const code = ac.get()?.value, no = chequeNumber($e("e-no").value), amt = chequeAmount(amtVal()), k = purpKey();
    $e("e-amthint").textContent = amt ? "৳ " + money(amt) : ""; const el = $e("e-sum");
    const nb = $e("e-nberr"), setErr = msg => { nb.hidden = !msg; if (nb.innerHTML !== msg) nb.innerHTML = msg; $e("e-no").setAttribute("aria-invalid", msg ? "true" : "false"); };
    if (!code) { el.style.display = "none"; setErr(""); return; }
    const a = accMap()[code], dup = no ? findDup(code, +no) : null, bk = no ? bookForLeaf(code, +no) : null, nobk = !!no && !dup && !bk;
    if (dup) { setErr(`⛔ <b>${no}</b> ${bi("আগেই এন্ট্রি আছে", "is already entered")} (${dmy(dup.date)}, ৳ ${money(dup.amount)}, ${esc(dup.status)})`); el.style.display = "none"; return; }
    if (nobk) { setErr(`⛔ ${bi("কোনো চেক বইয়ে নেই —", "Not in any cheque book —")} ` + (canAddBook() ? `<button type="button" class="cp-nblink" data-newbook>${bi("যোগ করুন", "register it")} ➜</button>` : bi("Admin-কে চেক বই যোগ করতে বলুন", "ask an admin to add the book"))); el.style.display = "none"; return; }
    setErr(""); el.style.display = ""; el.className = "s4 sumbox cp-tk";
    const date = $e("e-date").value, extra = k === "cash" ? $e("e-taker").value : k === "own" ? toac.get()?.value || "" : "", rem = $e("e-rem").value.trim();
    const words = amt ? takaWords(amt) : "", leaf = bk && bk.last != null ? bi(`পাতা ${no - bk.first + 1}/${bk.last - bk.first + 1}`, `Leaf ${no - bk.first + 1} of ${bk.last - bk.first + 1}`) : "";
    const pills = [validChequeDate(date) ? `${ico("clock")} ${dmy(date)}` : "", `<b>${esc((st.purpose || bi("খাত বাছুন", "Choose purpose")).split(" (")[0])}</b>`, extra ? esc(extra) : "", bk ? `${esc(bk.series || "")} ${leaf}`.trim() : "", rem ? `“${esc(rem.length > 46 ? rem.slice(0, 46) + "…" : rem)}”` : ""].filter(Boolean);
    el.innerHTML = `<div class="cp-tk-top"><span class="tag">${esc(code)}</span><b>${esc(a?.holder || "")}</b><span class="mut">${esc(a?.bank || "")}</span></div>
      <div class="cp-tk-main"><span class="cp-tk-no">${bi("চেক নং", "Cheque no")} <b>${no || "—"}</b></span><span class="big num">৳ ${amt ? money(amt) : "—"}</span></div>
      ${words ? `<div class="cp-tk-words">${esc(words)}</div>` : ""}
      <div class="cp-tk-meta">${pills.map(x => `<span>${x}</span>`).join("")}</div>`;
  }
  /* step indicator (follows focus + progress) */
  function flow() {
    const k = purpKey(), amt = chequeAmount(amtVal());
    const done = {
      "e-date": validChequeDate($e("e-date").value), "e-ac": !!ac.get(), "e-no": !!chequeNumber($e("e-no").value),
      "e-amt": k === "cancel" || amt > 0,
      "e-purp": !!st.purpose && (k !== "cash" || !!$e("e-taker").value) && (k !== "own" || !!toac.get()),
      "e-rem": $e("e-rem").value.trim() !== ""
    };
    const f = document.activeElement; let act = "";
    if (f && posting.contains(f)) act = f.id === "e-rem" ? "e-rem" : ["e-date", "e-ac", "e-no", "e-amt"].includes(f.id) ? f.id : f.closest("#e-purp,#e-takers,#x-cash,#x-own") ? "e-purp" : "";
    $$("#e-flow [data-step]", posting).forEach(b => { const id = b.dataset.step; b.classList.toggle("done", !!done[id]); b.classList.toggle("on", id === act); b.parentElement.classList.toggle("on", id === act); });
  }
  const focusPurpose = () => { const b = rove($e("e-purp")); (b || $e("e-rem")).focus(); };
  const afterPurpose = () => { const k = purpKey(); if (k === "cash") (rove($e("e-takers")) || $e("e-rem")).focus(); else if (k === "own") $e("e-toac").focus(); else $e("e-rem").focus(); };
  function radioNav(group, choose, advance) {
    group.addEventListener("keydown", e => {
      const items = radios(group), cur = items.indexOf(document.activeElement);
      if (cur < 0 || e.ctrlKey || e.metaKey || e.altKey) return;
      const chk = items.indexOf(checkedOf(group)); let to = -1;
      if (e.key === "ArrowRight") to = chk >= 0 ? (chk + 1) % items.length : cur;
      else if (e.key === "ArrowLeft") to = chk >= 0 ? (chk - 1 + items.length) % items.length : cur;
      else if (e.key === "Home") to = 0; else if (e.key === "End") to = items.length - 1;
      else if (e.key === "Enter") { e.preventDefault(); if (chk < 0) { shake(group); $e("e-err").textContent = bi("← → চেপে বাছুন", "Use ← → to choose"); } else { $e("e-err").textContent = ""; advance(); } return; }
      else return;
      e.preventDefault(); $e("e-err").textContent = choose(items[to]) || ""; items[to].focus();
    });
  }
  radioNav($e("e-purp"), chip => { st.purpose = chip.dataset.p; applyPurpose(); }, afterPurpose);
  $e("e-purp").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) b.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); });
  radioNav($e("e-takers"), chip => { setTaker(chip.dataset.t); }, () => $e("e-rem").focus());
  rove($e("e-takers"));
  /* recent accounts + remark suggestions */
  function drawRecent() {
    const box = $e("e-recent-ac"), seen = new Set(), out = [];
    for (const c of [...S.cheques].sort((x, y) => (Date.parse(y.at) || 0) - (Date.parse(x.at) || 0))) {
      if (seen.has(c.code)) continue; seen.add(c.code);
      const a = accMap()[c.code]; if (a && a.status === "Active") out.push(a);
      if (out.length >= 5) break;
    }
    const html = out.length ? `<span class="cp-recent-l">${bi("সাম্প্রতিক", "Recent")}</span>` + out.map(a => `<button type="button" tabindex="-1" class="chip sm${ac.get()?.value === a.code ? " on" : ""}" data-ac="${esc(a.code)}" title="${esc([a.holder, a.bank].filter(Boolean).join(" · "))}">${esc(a.code)}</button>`).join("") : "";
    if (box.innerHTML !== html) box.innerHTML = html;
    box.classList.toggle("hide", !out.length);
  }
  $e("e-recent-ac").onmousedown = e => e.preventDefault();
  $e("e-recent-ac").onclick = e => {
    const b = e.target.closest("[data-ac]"); if (!b) return;
    const it = acItems().find(i => i.value === b.dataset.ac); if (!it) return;
    ac.set(it); drawRecent(); $e("e-ac").dispatchEvent(new CustomEvent("picked"));
  };
  function remPool() {
    const code = ac.get()?.value, k = purpKey(), map = new Map(), rows = [...S.cheques].sort((x, y) => (Date.parse(y.at) || 0) - (Date.parse(x.at) || 0)).slice(0, 800);
    rows.forEach((c, i) => {
      for (const text of [c.remarks, c.party].map(x => String(x || "").trim()).filter(Boolean)) {
        const key = text.toLowerCase(), cur = map.get(key) || { text, score: 0, at: i };
        cur.score += 1 + (code && c.code === code ? 3 : 0) + (k && purposeKey(c.purpose) === k ? 2 : 0); map.set(key, cur);
      }
    });
    return [...map.values()].sort((x, y) => y.score - x.score || x.at - y.at);
  }
  function drawRem() {
    const box = $e("e-remchips"), q = $e("e-rem").value.trim().toLowerCase();
    const list = remPool().filter(x => x.text.toLowerCase() !== q && (!q || x.text.toLowerCase().includes(q))).slice(0, 6);
    remIdx = Math.min(remIdx, list.length - 1);
    box.innerHTML = list.map((x, i) => `<button type="button" tabindex="-1" class="chip sm${i === remIdx ? " hl" : ""}" data-rem="${esc(x.text)}">${esc(x.text.length > 34 ? x.text.slice(0, 34) + "…" : x.text)}</button>`).join("");
    box.classList.toggle("hide", !list.length);
  }
  function applyRem(text) { $e("e-rem").value = text; remIdx = -1; drawRem(); draw(); flow(); }
  $e("e-remchips").onmousedown = e => e.preventDefault();
  $e("e-remchips").onclick = e => { const b = e.target.closest("[data-rem]"); if (b) { applyRem(b.dataset.rem); $e("e-rem").focus(); } };
  $e("e-rem").addEventListener("input", () => { remIdx = -1; drawRem(); draw(); flow(); });
  $e("e-rem").addEventListener("keydown", e => {
    if (e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey) return;
    const chips = $$("[data-rem]", $e("e-remchips"));
    if (e.key === "ArrowDown" && chips.length) { e.preventDefault(); remIdx = (remIdx + 1) % chips.length; drawRem(); }
    else if (e.key === "ArrowUp" && chips.length) { e.preventDefault(); remIdx = remIdx <= 0 ? chips.length - 1 : remIdx - 1; drawRem(); }
    else if (e.key === "Enter") { e.preventDefault(); if (remIdx >= 0 && chips[remIdx]) applyRem(chips[remIdx].dataset.rem); else save(); }
    else if (e.key === "Escape" && remIdx >= 0) { e.preventDefault(); e.stopPropagation(); remIdx = -1; drawRem(); }
  });
  /* keyboard flow: Date → A/C → Cheque no → Amount → Purpose (← →) → Remarks → Enter saves, then back to Date */
  ["e-no", "e-amt"].forEach(i => $e(i).addEventListener("input", sum));
  $e("e-no").addEventListener("input", autoTag);
  $e("e-date").addEventListener("input", () => { draw(); flow(); });
  $e("e-date").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); $e("e-ac").focus(); } });
  $e("e-ac").addEventListener("picked", () => { $e("e-no").focus(); $e("e-no").select(); });
  $e("e-no").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $e("e-amt").focus(); } });
  $e("e-amt").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commitAmt(); focusPurpose(); } });
  $e("e-amt").addEventListener("blur", commitAmt);
  $e("e-toac").addEventListener("picked", () => $e("e-rem").focus());
  $e("e-date").addEventListener("change", () => { clearTimeout(clT); clT = setTimeout(cashLink, 100); });
  posting.addEventListener("input", flow); posting.addEventListener("change", flow);
  posting.addEventListener("focusin", flow); posting.addEventListener("focusout", () => setTimeout(flow, 0));
  posting.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.isComposing) { e.preventDefault(); save(); } });
  $e("e-flow").onclick = e => { const b = e.target.closest("[data-step]"); if (!b) return; if (b.dataset.step === "e-purp") focusPurpose(); else $e(b.dataset.step).focus(); };
  const onSlash = e => {
    if (!posting.isConnected || e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".mback")) return;
    const t = document.activeElement; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    e.preventDefault(); $e("e-find").focus();
  };
  document.addEventListener("keydown", onSlash);
  /* animated numbers */
  const tween = (el, to, fmt) => {
    const from = Number(el.dataset.v ?? to); el.dataset.v = to; cancelAnimationFrame(+el.dataset.raf || 0);
    if (from === to || matchMedia("(prefers-reduced-motion:reduce)").matches) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), step = now => { const p = Math.min(1, (now - t0) / 380); el.textContent = fmt(p < 1 ? Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))) : to); if (p < 1) el.dataset.raf = requestAnimationFrame(step); };
    el.dataset.raf = requestAnimationFrame(step);
  };
  function clearAll(full) {
    $e("e-err").textContent = "";
    $e("e-attach").open = false;
    if (full || !$("#keep", v).checked) { ac.set(null); st.purpose = null; setTaker(""); $e("e-nohint").textContent = ""; }
    toac.set(null);
    if (ac.get()) setAutoNo(ac.get().value); else { autoNo = ""; $e("e-no").value = ""; autoTag(); }
    $e("e-amt").value = ""; $e("e-rem").value = ""; remIdx = -1; clearPhoto(); applyPurpose(); drawRecent(); flow();
  }
  let renderedActivity = "", renderedFilters = "";
  function list() {
    if (!posting.isConnected) return;
    const t = today(), byDate = activityMode === "date", date = $e("e-activity-date").value;
    const counts = new Map(), matches = chequeMatcher($e("e-find").value, accMap());
    const records = [];
    let liveTotal = 0, pendingTotal = 0;
    for (const c of S.cheques) {
      if (byDate && c.date !== date) continue;
      const { at, posted } = postInfo(c);
      if (!byDate && posted !== t) continue;
      if (isLive(c)) liveTotal += c.amount;
      if (c.status === "Pending") pendingTotal += c.amount;
      counts.set(c.status, (counts.get(c.status) || 0) + 1);
      records.push({c, at, posted});
    }
    const filtered = records.filter(({c}) => (!activityStatus || c.status === activityStatus) && matches(c));
    filtered.sort((a, b) => (b.at || 0) - (a.at || 0) || b.c.no - a.c.no);
    const visible = filtered.slice(0, activityLimit);
    tween($e("e-cnt"), records.length, String);
    tween($e("e-total"), liveTotal, n => "৳ " + money(n));
    tween($e("e-pending-total"), pendingTotal, n => "৳ " + money(n));
    const toolsVisible = records.length > 0 || !!activityStatus || $e("e-find").value !== "";
    $e("e-review-tools").hidden = false;
    $e("e-find").closest(".cp-search").hidden = $e("e-activity-filters").hidden = !toolsVisible;
    const filters = [["", records.length], ...STATUSES.filter(status => counts.has(status) || status === activityStatus).map(status => [status, counts.get(status) || 0])];
    const filtersHtml = filters.map(([status, count]) => `<button type="button" class="chip sm${status === activityStatus ? " on" : ""}" data-st="${esc(status)}" aria-pressed="${status === activityStatus}">${status ? esc(status) : bi("সব", "All")} <b>${count}</b></button>`).join("");
    if (filtersHtml !== renderedFilters) $e("e-activity-filters").innerHTML = renderedFilters = filtersHtml;
    $e("e-more").hidden = visible.length >= filtered.length;
    const countText = records.length ? bi(`${filtered.length}টির মধ্যে ${visible.length}টি দেখানো হয়েছে`, `Showing ${visible.length} of ${filtered.length} matches`) : "";
    if ($e("e-visible").textContent !== countText) $e("e-visible").textContent = countText;
    const html = visible.length ? `<div class="tw cards cp-activity-table"><table><thead><tr><th scope="col">A/C · ${bi("চেক", "Cheque")}</th><th scope="col" class="r">${bi("অঙ্ক", "Amount")}</th><th scope="col">${bi("স্ট্যাটাস", "Status")}</th><th scope="col">${bi("তারিখ ও অপারেটর", "Date & operator")}</th><th scope="col">${bi("অ্যাকশন","Action")}</th></tr></thead><tbody>
      ${visible.map(({c, posted}) => `<tr${c.id === flashId ? ' class="cp-new"' : ""}><td data-l=""><button type="button" class="cq-link" data-recent="${esc(c.id)}" data-activity-action="reference">${esc(acLabel(c.code))} · ${c.no}</button>${chqIcons(c)}<div class="mut sm">${esc([c.purpose?.split(" (")[0], c.party].filter(Boolean).join(" · "))}</div></td>
        <td class="r num"><strong>৳ ${money(c.amount)}</strong></td>
        <td><div class="stc">${stTag(c.status)}${statementBadge(c)}${pendTag(c)}</div></td>
        <td><div class="cp-row-date mut sm"><span>${byDate ? postedLabel : dateLabel} ${dmy(byDate ? posted : c.date) || "—"}</span><span>${esc(c.by || "—")}</span></div></td>
        <td><div class="cp-row-actions">
          <button type="button" class="iconbtn sm cpi pri" data-recent="${esc(c.id)}" data-activity-action="view" title="${bi("দেখুন","View")}" aria-label="${bi("দেখুন","View")}">${ico("eye")}</button>
          ${canEditChq(c) ? `<button type="button" class="iconbtn sm cpi am" data-recent="${esc(c.id)}" data-activity-action="edit" title="${bi("এডিট","Edit")}" aria-label="${bi("এডিট","Edit")}">${ico("edit")}</button>` : ""}
          ${canDeleteChq(c) ? `<button type="button" class="iconbtn sm cpi rd" data-recent="${esc(c.id)}" data-activity-action="delete" title="${bi("মুছুন","Delete")}" aria-label="${bi("মুছুন","Delete")}">${ico("trash")}</button>` : ""}
        </div></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty cp-empty"><strong>${records.length ? bi("ফিল্টারে কোনো চেক মেলেনি", "No cheques match these filters") : byDate ? bi("এই তারিখে কোনো চেক নেই", "No cheques for this date") : bi("আজ কোনো চেক পোস্ট হয়নি", "No cheques posted today")}</strong>${records.length ? `<button class="btn sm" type="button" id="e-reset-activity">${bi("ফিল্টার মুছুন", "Clear filters")}</button>` : ""}</div>`;
    if (html !== renderedActivity) {
      const listEl = $e("e-list"), focused = listEl.contains(document.activeElement) ? document.activeElement : null;
      listEl.innerHTML = renderedActivity = html;
      if (focused?.dataset.recent) {
        ($$("[data-recent]", listEl).find(btn => btn.dataset.recent === focused.dataset.recent && btn.dataset.activityAction === focused.dataset.activityAction) || $e("e-find")).focus({preventScroll: true});
      }
    }
  }
  function choosePurpose() {
    $e("e-err").textContent = bi("খাত বাছুন", "Choose a purpose.");
    shake($e("e-purp")); focusPurpose();
  }
  function resetActivity(mode) {
    activityMode = mode;
    if (mode === "today") $e("e-activity-date").value = today();
    resetActivityFilters();
    $e("e-period-sel").value = mode;
    list();
  }
  function resetActivityFilters() {
    activityStatus = "";
    activityLimit = activityPageSize;
    $e("e-find").value = "";
  }
  $e("e-period-sel").onchange = () => resetActivity($e("e-period-sel").value);
  $e("e-activity-date").onchange = () => {
    if (!validChequeDate($e("e-activity-date").value)) $e("e-activity-date").value = today();
    resetActivity("date");
  };
  const stepActivityDate = dir => {
    const d = $e("e-activity-date"), next = stepDay(d.value || today(), dir);
    if (!validChequeDate(next)) return;
    d.value = next; resetActivity("date");
  };
  $e("e-dprev").onclick = () => stepActivityDate(-1);
  $e("e-dnext").onclick = () => stepActivityDate(1);
  $e("e-nberr").onclick = e => {
    if (!e.target.closest("[data-newbook]")) return;
    const code = ac.get()?.value; if (!code) return;
    bookModal({ code, series: "", first: "", last: "", track: "", status: "Active", note: "" }, () => { sum(); $e("e-no").focus(); });
  };
  let findT = 0;
  $e("e-find").oninput = () => { activityLimit = activityPageSize; clearTimeout(findT); findT = setTimeout(list, 120); };
  $e("e-activity-filters").onclick = e => {
    const b = e.target.closest("[data-st]"); if (!b) return;
    activityStatus = activityStatus === b.dataset.st ? "" : b.dataset.st;
    activityLimit = activityPageSize;
    list();
  };
  $e("e-more").onclick = () => {
    const previous = activityLimit;
    activityLimit += activityPageSize;
    list();
    $$('[data-activity-action="reference"]', $e("e-list"))[previous]?.focus();
  };
  $e("e-list").onclick = event => {
    const btn = event.target.closest("button");
    if (!btn) return;
    if (btn.id === "e-reset-activity") { resetActivityFilters(); list(); $e("e-find").focus(); return; }
    const row = S.cheques.find(c => c.id === btn.dataset.recent);
    if (!row) return;
    if (btn.dataset.activityAction === "edit") editChequeModal(row,list);
    else if (btn.dataset.activityAction === "delete") deleteChequeEntry(row,list);
    else chequeModal(row,list);
  };
  let busy = false;
  async function save() {
    if (busy) return; const err = $e("e-err"); err.textContent = ""; err.className = "hint rd"; commitAmt();
    const code = ac.get()?.value, no = chequeNumber($e("e-no").value), amount = chequeAmount(amtVal()), date = $e("e-date").value, k = purpKey();
    if (!code) return err.textContent = "A/C Code বাছুন", $e("e-ac").focus();
    if (!no) return err.textContent = bi("সঠিক চেক নম্বর দিন।", "Enter a valid cheque number."), $e("e-no").focus();
    if (!st.purpose) return choosePurpose();
    if (!validChequeDate(date)) return err.textContent = bi("সঠিক তারিখ দিন।", "Enter a valid cheque date."), $e("e-date").focus();
    if (k !== "cancel" && !(amount > 0)) return err.textContent = bi("সঠিক টাকার অঙ্ক দিন।", "Enter a valid amount greater than zero."), $e("e-amt").focus();
    if (k === "cancel" && $e("e-amt").value.trim() && amount !== 0) return err.textContent = bi("বাতিল পাতার অঙ্ক ০ দিন।", "Use a zero amount for a cancelled leaf."), $e("e-amt").focus();
    if (k === "cash" && !$e("e-taker").value) return err.textContent = bi("কে তুলেছে — বাছুন", "Select who withdrew"), $e("x-cash").scrollIntoView({ block: "nearest" });
    if (k === "own" && !toac.get()) return err.textContent = "কোন A/C তে জমা — বাছুন", $e("e-toac").focus();
    if (k === "own" && toac.get().value === code) return err.textContent = "From ও To একই A/C হতে পারে না";
    if (S.cheques.some(c => c.code === code && c.no === no)) return err.textContent = "এই চেক আগেই এন্ট্রি আছে";
    if (!bookForLeaf(code, no)) {
      err.textContent = noBookMsg(code, no) + (canAddBook() ? "" : bi(" Admin-কে চেক বই যোগ করতে বলুন।", " Ask an admin to add the book."));
      if (canAddBook() && ask(bi("এখনই নতুন চেক বই যোগ করবেন?", "Register a new cheque book now?"))) bookModal({ code, series: "", first: "", last: "", track: "", status: "Active", note: "" }, () => sum());
      return;
    }
    const diff = daysBetween(date, today());
    if ((diff > 7 || diff < 0) && !ask(bi(`তারিখ ${dmy(date)} — আজ থেকে ${Math.abs(diff)} দিন ${diff > 0 ? "আগের" : "পরের"}। ঠিক আছে?`, `Date ${dmy(date)} is ${Math.abs(diff)} day(s) ${diff > 0 ? "before" : "after"} today. Is that right?`))) return;
    if (amount >= 1000000 && !ask(bi(`৳ ${money(amount)} — অঙ্ক ঠিক আছে?`, `৳ ${money(amount)} — is the amount right?`))) return;
    const fields = { date, code, no, amount: k === "cancel" ? 0 : amount, purpose: st.purpose, taker: k === "cash" ? $e("e-taker").value : "", party: "", toac: k === "own" ? toac.get().value : "", remarks: $e("e-rem").value.trim() };
    const saveButton = $e("e-save"), clearButton = $e("e-clear");
    const saveLabel = saveButton.innerHTML;
    busy = true; saveButton.disabled = clearButton.disabled = true;
    saveButton.textContent = bi("সেভ হচ্ছে…", "Saving…");
    try {
      const id = crypto.randomUUID(); let photo = null, warn = "";
      if (st.photo) {
        if (!navigator.onLine && !DEMO) warn = " · ইন্টারনেট নেই, তাই ছবি সেভ হয়নি (পরে চেকের পাতা থেকে যোগ করুন)";
        else { try { const p = photoPath(id, code, no, date); await API.uploadPhoto(p, st.photo); photo = p; } catch (e) { if (!ask(bi("ছবি আপলোড হয়নি (", "Photo upload failed (") + (e.message || e) + bi(")।\nছবি ছাড়া চেক সেভ করবেন?", ").\nSave the cheque without a photo?"))) throw new Error(bi("ছবি আপলোড হয়নি — আবার চেষ্টা করুন", "Photo upload failed — try again")); warn = bi(" · ছবি সেভ হয়নি", " · photo not saved"); } }
      }
      const row = await API.addCheque({ id, photo, ...fields });
      if (!S.cheques.some(c => c.id === row.id)) S.cheques.push(derive(row));
      saveCache(); refreshBadges(); cashLink();
      if (warn) toast(warn.slice(3), /হয়নি/.test(warn) ? "err" : "ok"); toast(row.pending ? `✔ অফলাইনে জমা হয়েছে: ${code} · ${no} · ৳ ${money(row.amount)} — নেট এলে সিঙ্ক হবে` : `✔ সেভ হয়েছে: ${code} · ${no} · ৳ ${money(row.amount)}`);
      if (!posting.isConnected) return;
      flashId = row.id; clearAll(false); list(); setTimeout(() => { flashId = ""; }, 2800);
      saveButton.classList.add("cp-saved"); setTimeout(() => saveButton.classList.remove("cp-saved"), 1200);
      $e("e-date").focus();
    } catch (e) { err.textContent = e.message || String(e); toast(e.message || String(e), "err"); }
    finally { busy = false; saveButton.disabled = clearButton.disabled = false; saveButton.innerHTML = saveLabel; }
  }
  $e("e-save").onclick = save; $e("e-clear").onclick = () => { clearAll(true); $e("e-ac").focus(); };
  list();
  let refreshing = false;
  const poll = setInterval(async () => {
    if (document.hidden || refreshing || busy) return;
    refreshing = true;
    try { await reload(); list(); drawRecent(); } catch { } finally { refreshing = false; }
  }, 30000);
  drawRecent(); drawRem(); flow();
  return () => { clearInterval(poll); clearTimeout(clT); document.removeEventListener("keydown", onSlash); };
}

/* ---------- status update ---------- */
function statusModal(c, after, initialDate = today(), initialStatus = c.status) {
  const events = c.events || [];
  const canEditEntry = canEditChq(c), canDeleteEntry = canDeleteChq(c);
  const reasonLabels = [
    bi("অপর্যাপ্ত তহবিল", "Insufficient funds"),
    bi("স্বাক্ষর মেলেনি", "Signature differs"),
    bi("তারিখে সমস্যা", "Date issue"),
    bi("কথায় ও অঙ্কে অমিল", "Amount mismatch")
  ];
  modal(`<h2>${esc(acLabel(c.code))} · ${c.no}</h2><div class="cq-meta"><strong class="num">৳ ${money(c.amount)}</strong> ${stTag(c.status)} <span class="mut">${dmy(c.date)} · ${esc(c.purpose.split(" (")[0])}</span></div>
    <form id="cq-status-form">
      <div class="cq-status-fields"><div><label class="f" for="m-st">${bi("নতুন স্ট্যাটাস", "New status")}</label><select class="in" id="m-st">${STATUSES.map(s => `<option ${s === initialStatus ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div><label class="f" for="m-d">${bi("স্ট্যাটাসের তারিখ", "Status date")}</label><input class="in" type="date" id="m-d" value="${esc(initialDate)}" max="${today()}" aria-describedby="m-err" required></div></div>
      <label class="f" for="m-r">${bi("মন্তব্য (ঐচ্ছিক)", "Remarks (optional)")}</label><input class="in" id="m-r">
      <div class="chips cq-reasons" id="cq-reasons" hidden>${reasonLabels.map((label, i) => `<button class="chip" type="button" data-reason="${i}">${esc(label)}</button>`).join("")}</div>
      <div class="hint rd" id="m-err" role="alert"></div>
    </form>
    ${canEditEntry || canDeleteEntry ? `<div class="cq-events">
      <div class="chips" role="group" aria-label="${bi("চেক এন্ট্রির কাজ", "Cheque entry actions")}">
        ${canEditEntry ? `<button class="btn" id="m-edit-entry" type="button">${bi("চেক এডিট", "Edit cheque")}</button>` : ""}
        ${canDeleteEntry ? `<button class="btn bad" id="m-delete-entry" type="button"${events.length ? ' disabled aria-describedby="m-delete-note"' : ""}>${bi("চেক মুছুন", "Delete cheque")}</button>` : ""}
      </div>
      ${canDeleteEntry && events.length ? `<p class="mut sm" id="m-delete-note">${bi("স্ট্যাটাস ইতিহাস থাকা চেক মুছতে পারবেন না। ভুল এন্ট্রি সংশোধনে Cancelled স্ট্যাটাস দিন।", "This cheque has status history. Set the status to Cancelled to correct a mistaken entry.")}</p>` : ""}
    </div>` : ""}
    ${events.length ? `<details class="cq-events"><summary>${bi("স্ট্যাটাসের ইতিহাস", "Status history")} · ${events.length}</summary><ul>${events.slice().reverse().map(e => `<li><strong>${esc(e.status)}</strong> · ${dmy(e.date)}${e.by ? " · " + esc(e.by) : ""}${e.remarks ? `<div class="mut">${esc(e.remarks)}</div>` : ""}</li>`).join("")}</ul></details>` : ""}
    <div class="modal-actions"><button class="btn" type="button" id="m-x">${bi("বাতিল", "Cancel")}</button><button class="btn pri" type="submit" form="cq-status-form" id="m-ok">${bi("সেভ", "Save")}</button></div>`, (root, close) => {
    const form = $("#cq-status-form", root), select = $("#m-st", root), date = $("#m-d", root);
    const remarks = $("#m-r", root), reasons = $("#cq-reasons", root), error = $("#m-err", root);
    const save = $("#m-ok", root), cancel = $("#m-x", root);
    const editEntry = $("#m-edit-entry", root), deleteEntry = $("#m-delete-entry", root);
    const controls = [save, cancel, editEntry, deleteEntry].filter(button => button && !button.disabled);
    const setBusy = busy => controls.forEach(button => { button.disabled = busy; });
    if (editEntry) editEntry.onclick = () => {
      if (save.disabled) return;
      if (!canEditChq(c)) { error.textContent = chequeEditDenied(); return; }
      close();
      editChequeModal(c, after);
    };
    if (deleteEntry && !deleteEntry.disabled) deleteEntry.onclick = async () => {
      if (save.disabled) return;
      setBusy(true);
      try { await deleteChequeEntry(c, () => { close(); after?.(); }); }
      finally { setBusy(false); }
    };
    const showReasons = () => { reasons.hidden = select.value !== "Bounced"; };
    showReasons(); select.onchange = showReasons;
    $$("[data-reason]", reasons).forEach(btn => btn.onclick = () => {
      const reason = reasonLabels[Number(btn.dataset.reason)];
      if (!remarks.value.includes(reason)) remarks.value = [remarks.value.trim(), reason].filter(Boolean).join(" · ");
      remarks.focus();
    });
    cancel.onclick = close;
    form.onsubmit = async e => {
      e.preventDefault();
      if (save.disabled) return;
      error.textContent = "";
      setBusy(true);
      try {
        const updated = await setStatus(c, select.value, date.value, remarks.value.trim());
        toast(`✔ ${updated.code} · ${updated.no} → ${updated.status}`);
        close();
        after?.();
      } catch (err) { error.textContent = err.message || String(err); }
      finally { setBusy(false); }
    };
  });
}
/* v6.138: Cheque Status — smart queue (live filters, age buckets, keyboard, bulk clear, inline timeline) */
function tweenNum(el, to, fmt) {
  const from = Number(el.dataset.v ?? to); el.dataset.v = to; cancelAnimationFrame(+el.dataset.raf || 0);
  if (from === to || matchMedia("(prefers-reduced-motion:reduce)").matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), step = now => { const p = Math.min(1, (now - t0) / 380); el.textContent = fmt(p < 1 ? Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))) : to); if (p < 1) el.dataset.raf = requestAnimationFrame(step); };
  el.dataset.raf = requestAnimationFrame(step);
}
async function vStatus(v) {
  const alertDays = CFG.PENDING_ALERT_DAYS ?? 3, canEdit = moduleCan("cheque", "edit");
  const filters = [
    ["pending", bi("অপেক্ষমাণ", "Pending"), bi("ব্যাংকে ক্লিয়ারের অপেক্ষায়", "Waiting for the bank to clear"), "clock", c => c.status === "Pending"],
    ["older", bi("পুরনো অপেক্ষমাণ", "Older pending"), bi(`${alertDays} দিনের বেশি পুরনো`, `Pending for more than ${alertDays} days`), "bell", (c, t) => c.status === "Pending" && daysBetween(c.date, t) > alertDays],
    ["review", bi("ফেরত / স্থগিত", "Bounced / stopped"), bi("ফেরত বা স্থগিত — ব্যবস্থা দরকার", "Needs follow-up"), "flag", c => c.status === "Bounced" || c.status === "Stopped"],
    ["all", bi("সব চেক", "All cheques"), bi("রেকর্ডে থাকা সব চেক", "Every cheque on record"), "list", () => true]
  ];
  const buckets = [["", bi("সব বয়স", "Any age")], ["0", bi(`≤ ${alertDays} দিন`, `≤ ${alertDays} days`)], ["1", bi("৪–৭ দিন", "4–7 days")], ["2", bi("৮–১৫ দিন", "8–15 days")], ["3", bi("১৫+ দিন", "15+ days")]];
  const bucketOf = d => d <= alertDays ? "0" : d <= 7 ? "1" : d <= 15 ? "2" : "3";
  let saved = {}; try { saved = JSON.parse(sessionStorage.getItem("nabiad_status_view") || "{}"); } catch { }
  let mode = filters.some(f => f[0] === saved.mode) ? saved.mode : "pending", page = 0, ageF = saved.age || "", acF = "", grp = ["bank", "ac", "day"].includes(saved.grp) ? saved.grp : saved.group ? "day" : "", dateBy = ["year", "month", "week"].includes(saved.dateBy) ? saved.dateBy : ["year", "month", "week"].includes(saved.grp) ? saved.grp : "", activeId = "", bulkBusy = false, lastQueue = [];
  const sel = new Set(), open = new Set();
  v.innerHTML = head("চেক স্ট্যাটাস আপডেট", `<button class="btn" type="button" id="s-xl">${ico("dl")} ${bi("এক্সেল", "Excel")}</button>${moduleCan("cheque", "entry") ? `<a class="btn" href="#/entry">${ico("plus")} ${bi("চেক পোস্টিং", "Cheque Posting")}</a>` : ""}<a class="btn" href="#/cheques">${ico("list")} ${bi("চেক তালিকা", "Register")}</a>`) + `
    <section class="card cq-tools cq-workspace" aria-label="${bi("চেক স্ট্যাটাস তালিকা", "Cheque status queue")}">
      <div class="cq-filters" role="group" aria-label="${bi("স্ট্যাটাস ফিল্টার", "Status filters")}">${filters.map(([id, label, desc, ic]) => `<button type="button" class="btn" data-cq-filter="${id}" aria-pressed="false" aria-controls="s-list"><span class="cq-tl-t"><i>${ico(ic)}</i>${label}</span><strong class="num"></strong><small class="num"></small><em>${desc}</em></button>`).join("")}</div>
      <div class="cq-pulse" id="s-pulse"></div>
      <div class="cq-queue-controls">
        <div><label class="f" for="s-ac">${bi("অ্যাকাউন্ট", "Account")}</label><select class="in" id="s-ac"></select></div>
        <div><label class="f" for="s-sort">${bi("সাজানোর ক্রম", "Sort by")}</label><select class="in" id="s-sort"><option value="">${bi("তালিকার ডিফল্ট ক্রম", "Queue default")}</option><option value="old">${bi("পুরনো চেক আগে", "Oldest cheque first")}</option><option value="new">${bi("নতুন চেক আগে", "Newest cheque first")}</option><option value="amount">${bi("বেশি অঙ্ক আগে", "Highest amount first")}</option></select></div>
        <div class="cq-grp-s"><label class="f" for="s-group">${bi("গ্রুপ করুন", "Group by")}</label><select class="in" id="s-group"><option value="">${bi("গ্রুপ ছাড়া", "No grouping")}</option><option value="bank">${bi("ব্যাংকের নাম", "Bank name")}</option><option value="ac">${bi("অ্যাকাউন্টের নাম", "Account name")}</option><option value="day">${bi("চেকের তারিখ", "Cheque date")}</option></select></div>
        <div class="cq-grp-s"><label class="f" for="s-dateby">${bi("তারিখ অনুযায়ী", "Date by")}</label><select class="in" id="s-dateby"><option value="">—</option><option value="year">${bi("বছর", "Year")}</option><option value="month">${bi("মাস", "Month")}</option><option value="week">${bi("সপ্তাহ", "Week")}</option></select></div>
        <div class="cq-clear"><button type="button" class="btn sm" id="s-clearall" disabled>${bi("সব মুছুন", "Clear all")}</button></div>
      </div>
      <div class="cq-chiprow"><div class="chips" id="s-age" role="group" aria-label="${bi("চেকের বয়স", "Cheque age")}"></div></div>
    </section>
    <div class="cq-queue-head">
      <div><h2 class="cq-queue-title" id="s-title"></h2><p id="s-info" class="cq-info mut sm" role="status"></p></div>
      <div class="cq-head-r"><div class="cq-qsearch"><div class="cq-qw"><span aria-hidden="true">${ico("search")}</span><input class="in" id="s-q" type="search" autocomplete="off" aria-label="${bi("চেক খুঁজুন", "Search cheques")}" placeholder="${bi("চেক নং, A/C বা অঙ্ক", "Cheque no, A/C or amount")}"><kbd aria-hidden="true">/</kbd></div></div><label class="cq-selall" id="s-allw" hidden><input type="checkbox" id="s-all"> <span id="s-alll"></span></label>
      <div class="cq-action-date"><label class="f" for="s-d">${bi("আপডেটের তারিখ", "Update date")}</label><input class="in" type="date" id="s-d" value="${today()}" max="${today()}" required></div></div>
    </div>
    <div id="s-list" class="cq-list" role="region" aria-labelledby="s-title"></div>
    <div class="cq-keys" aria-hidden="true"><span><kbd>J</kbd><kbd>K</kbd> ${bi("ওঠানামা", "move")}</span><span><kbd>C</kbd> ${bi("ক্লিয়ার", "clear")}</span><span><kbd>S</kbd> ${bi("স্ট্যাটাস", "status")}</span><span><kbd>X</kbd> ${bi("বাছাই", "select")}</span><span><kbd>E</kbd> ${bi("বিস্তারিত", "details")}</span><span><kbd>/</kbd> ${bi("খুঁজুন", "search")}</span></div>
    <div class="cq-pager" id="s-pager" hidden><button class="btn" type="button" id="s-prev">‹ ${bi("আগের", "Previous")}</button><span class="mut sm" id="s-page"></span><button class="btn" type="button" id="s-next">${bi("পরের", "Next")} ›</button></div>
    <div class="cq-bulk" id="s-bulk" hidden role="region" aria-label="${bi("বাছাই করা চেক", "Selected cheques")}"><div><strong id="s-bn" class="num"></strong><span class="mut sm" id="s-bt"></span></div><div class="cq-bulk-a"><button type="button" class="btn" id="s-bx">${bi("বাতিল", "Deselect")}</button><button type="button" class="btn ok" id="s-bc">${ico("check")} ${bi("সব ক্লিয়ার করুন", "Mark all cleared")}</button></div></div>`;
  const q = $("#s-q", v), date = $("#s-d", v), list = $("#s-list", v), info = $("#s-info", v);
  const pager = $("#s-pager", v), prev = $("#s-prev", v), next = $("#s-next", v), sort = $("#s-sort", v), title = $("#s-title", v);
  const acSel = $("#s-ac", v), ageBox = $("#s-age", v), tiles = $$("[data-cq-filter]", v), pageSize = 40;
  sort.value = saved.sort || ""; $("#s-group", v).value = grp; $("#s-dateby", v).value = dateBy;
  let lastHtml = "", lastAc = "", lastAge = "";
  const persist = () => { try { sessionStorage.setItem("nabiad_status_view", JSON.stringify({ mode, age: ageF, grp, dateBy, sort: sort.value })); } catch { } };
  const refOf = c => `${acLabel(c.code)} · ${c.no}`;
  function draw() {
    if (!list.isConnected) return;
    const t = today(), accounts = accMap(), matches = chequeMatcher(q.value, accounts), base = [];
    const totals = filters.map(() => ({ count: 0, amount: 0 }));
    let oldest = null, largest = null, clearedN = 0, clearedAmt = 0;
    for (const c of S.cheques) {
      if (c.status === "Pending") { if (!oldest || c.date < oldest.date) oldest = c; if (!largest || c.amount > largest.amount) largest = c; }
      if (c.status === "Cleared" && c.sdate === t) { clearedN++; clearedAmt += c.amount; }
      if (!matches(c)) continue;
      for (const [i, f] of filters.entries()) {
        if (!f[4](c, t)) continue;
        totals[i].count++; totals[i].amount += c.amount;
        if (f[0] === mode) base.push(c);
      }
    }
    const showAge = mode === "pending" || mode === "older";
    if (acF && !base.some(c => c.code === acF)) acF = "";
    const inAge = c => !showAge || !ageF || bucketOf(daysBetween(c.date, t)) === ageF;
    const queue = base.filter(c => (!acF || c.code === acF) && inAge(c));
    tiles.forEach((btn, i) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.cqFilter === mode));
      tweenNum($("strong", btn), totals[i].count, String);
      $("small", btn).textContent = "৳ " + money(totals[i].amount);
    });
    /* pulse insights */
    const ageOld = oldest ? daysBetween(oldest.date, t) : 0;
    const pulse = [
      oldest ? `<button type="button" class="cq-p warn" data-act="oldest" data-id="${esc(oldest.id)}"><span>${bi("সবচেয়ে পুরনো অপেক্ষমাণ", "Oldest pending")}</span><b>${esc(refOf(oldest))}</b><em>${bi(`${ageOld} দিন · ৳ ${money(oldest.amount)}`, `${ageOld} day(s) · ৳ ${money(oldest.amount)}`)}</em></button>` : `<div class="cq-p ok"><span>${bi("সবচেয়ে পুরনো অপেক্ষমাণ", "Oldest pending")}</span><b>${bi("কোনো অপেক্ষমাণ চেক নেই", "Nothing pending")}</b><em>${bi("সব হালনাগাদ ✓", "All caught up ✓")}</em></div>`,
      largest ? `<button type="button" class="cq-p" data-act="largest" data-id="${esc(largest.id)}"><span>${bi("সবচেয়ে বড় অপেক্ষমাণ অঙ্ক", "Largest pending amount")}</span><b class="num">৳ ${money(largest.amount)}</b><em>${esc(refOf(largest))}</em></button>` : "",
      `<div class="cq-p ok"><span>${bi("আজ ক্লিয়ার হয়েছে", "Cleared today")}</span><b class="num">${clearedN}</b><em class="num">৳ ${money(clearedAmt)}</em></div>`
    ].join("");
    if ($("#s-pulse", v).innerHTML !== pulse) $("#s-pulse", v).innerHTML = pulse;
    /* A/C + age facets */
    const acCount = new Map(); base.filter(inAge).forEach(c => acCount.set(c.code, (acCount.get(c.code) || 0) + 1));
    const acHtml = `<option value="">${bi("সব অ্যাকাউন্ট", "All accounts")} (${[...acCount.values()].reduce((a, b) => a + b, 0)})</option>` + [...acCount].sort((a, b) => b[1] - a[1]).map(([code, n]) => `<option value="${esc(code)}">${esc(acLabel(code))} (${n})</option>`).join("");
    if (acHtml !== lastAc) acSel.innerHTML = lastAc = acHtml; acSel.value = acF;
    const ageCount = {}; base.filter(c => !acF || c.code === acF).forEach(c => { const b = bucketOf(daysBetween(c.date, t)); ageCount[b] = (ageCount[b] || 0) + 1; });
    const ageOn = showAge && base.length > 0, ageHtml = ageOn ? buckets.map(([id, label]) => `<button type="button" class="chip sm${id === ageF ? " on" : ""}" data-age="${id}" aria-pressed="${id === ageF}">${label} <b>${id ? ageCount[id] || 0 : Object.values(ageCount).reduce((a, b) => a + b, 0)}</b></button>`).join("") : "";
    if (ageHtml !== lastAge) ageBox.innerHTML = lastAge = ageHtml; ageBox.hidden = !ageOn;
    const order = sort.value;
    queue.sort((a, b) => {
      if (order === "amount") return b.amount - a.amount || b.date.localeCompare(a.date);
      if (order === "old" || (!order && (mode === "pending" || mode === "older"))) return a.date.localeCompare(b.date) || a.no - b.no;
      if (order === "new") return b.date.localeCompare(a.date) || b.no - a.no;
      return (b.sdate || b.date).localeCompare(a.sdate || a.date) || b.no - a.no;
    });
    const desc = !(order === "old" || (!order && (mode === "pending" || mode === "older")));
    const dKey = c => dateBy === "year" ? c.date.slice(0, 4) : dateBy === "month" ? c.date.slice(0, 7) : dateBy === "week" ? pbWeek(c.date)[0] : c.date;
    const MN = [bi("জানুয়ারি", "January"), bi("ফেব্রুয়ারি", "February"), bi("মার্চ", "March"), bi("এপ্রিল", "April"), bi("মে", "May"), bi("জুন", "June"), bi("জুলাই", "July"), bi("আগস্ট", "August"), bi("সেপ্টেম্বর", "September"), bi("অক্টোবর", "October"), bi("নভেম্বর", "November"), bi("ডিসেম্বর", "December")];
    const levels = [];
    if (grp === "bank" || grp === "ac") levels.push({ key: c => grp === "bank" ? (accounts[c.code]?.bank || "—") : c.code, label: (k, c) => grp === "ac" ? acLabel(c.code) : k, desc: false });
    if (grp === "day" || dateBy) levels.push({ key: dKey, desc, label: k => dateBy === "month" ? `${MN[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` : dateBy === "week" ? `${dmy(k)} – ${dmy(pbWeek(k)[1])}` : dateBy === "year" ? k : dmy(k) });
    const gk = new Map(), gagg = new Map();
    if (levels.length) {
      for (const c of queue) {
        let pre = ""; const raw = levels.map(L => L.key(c)), comp = raw.map(k => pre = pre + "\u0001" + k);
        gk.set(c, { raw, comp });
        for (const k of comp) { const o = gagg.get(k) || { n: 0, amt: 0 }; o.n++; o.amt += c.amount; gagg.set(k, o); }
      }
      queue.sort((a, b) => { const x = gk.get(a).raw, y = gk.get(b).raw; for (let i = 0; i < levels.length; i++) if (x[i] !== y[i]) return levels[i].desc ? y[i].localeCompare(x[i]) : x[i].localeCompare(y[i]); return 0; });
    }
    lastQueue = queue;
    const pages = Math.max(1, Math.ceil(queue.length / pageSize));
    page = Math.min(page, pages - 1);
    const start = page * pageSize, end = Math.min(start + pageSize, queue.length), visible = queue.slice(start, end);
    const nAct = [q.value.trim(), acF, ageF, sort.value, grp, dateBy].filter(Boolean).length;
    clearAll.disabled = !nAct; clearAll.textContent = bi("সব মুছুন", "Clear all") + (nAct ? ` (${nAct})` : "");
    title.textContent = filters.find(f => f[0] === mode)[1];
    info.textContent = queue.length ? bi(`${queue.length}টির মধ্যে ${start + 1}–${end} · চেকের মোট অঙ্ক ৳ ${money(sumAmt(queue))}`, `${start + 1}–${end} of ${queue.length} · Face value ৳ ${money(sumAmt(queue))}`) : bi("০ চেক", "0 cheques");
    pager.hidden = pages <= 1; prev.disabled = page === 0; next.disabled = page + 1 >= pages;
    $("#s-page", pager).textContent = `${page + 1} / ${pages}`;
    const selectable = c => canEdit && c.status === "Pending" && !c.pending;
    for (const id of [...sel]) { const c = S.cheques.find(r => r.id === id); if (!c || !selectable(c)) sel.delete(id); }
    const pageSel = visible.filter(selectable);
    $("#s-allw", v).hidden = !pageSel.length;
    $("#s-all", v).checked = pageSel.length > 0 && pageSel.every(c => sel.has(c.id));
    $("#s-alll", v).textContent = bi(`পাতার সব বাছুন (${pageSel.length})`, `Select all on page (${pageSel.length})`);
    if (activeId && !visible.some(c => c.id === activeId)) activeId = "";
    const card = c => {
      const age = daysBetween(c.date, t), isPend = c.status === "Pending", old = isPend && age > alertDays, rev = c.status === "Bounced" || c.status === "Stopped";
      const a = accounts[c.code], can = selectable(c), on = sel.has(c.id), isOpen = open.has(c.id), lvl = age <= alertDays ? "ok" : age <= alertDays * 3 ? "warn" : "bad";
      const evs = [...(c.events || [])].sort((x, y) => (x.date || "").localeCompare(y.date || ""));
      const at = Date.parse(c.at), posted = Number.isFinite(at) ? iso(new Date(at)) : "";
      const book = bookForLeaf(c.code, c.no);
      const detail = isOpen ? `<div class="cq-xd"><ol class="cq-tl"><li><b>${bi("পোস্ট হয়েছে", "Posted")}</b> ${posted ? dmy(posted) : "—"} · ${esc(c.by || "—")}</li>${evs.map(e => `<li><b>${esc(e.status)}</b> ${dmy(e.date)}${e.by ? " · " + esc(e.by) : ""}${e.remarks ? ` <span class="mut">— ${esc(e.remarks)}</span>` : ""}</li>`).join("")}</ol>
        <dl class="cq-facts">${c.taker ? `<div><dt>${bi("তুলেছেন", "Withdrawn by")}</dt><dd>${esc(c.taker)}</dd></div>` : ""}${c.toac ? `<div><dt>${bi("জমা A/C", "To A/C")}</dt><dd>${esc(c.toac)}</dd></div>` : ""}${c.remarks ? `<div><dt>${bi("মন্তব্য", "Remarks")}</dt><dd>${esc(c.remarks)}</dd></div>` : ""}${book ? `<div><dt>${bi("চেক বই", "Cheque book")}</dt><dd>${esc(book.series || "")} ${book.first}–${book.last ?? "…"}</dd></div>` : ""}${a?.acno ? `<div><dt>${bi("অ্যাকাউন্ট নং", "Account no")}</dt><dd class="num">${esc(a.acno)}</dd></div>` : ""}</dl></div>` : "";
      return `<article class="card cq-item${can ? " has-sel" : ""}${on ? " sel" : ""}${c.id === activeId ? " act" : ""}" data-id="${esc(c.id)}" ${old ? 'data-priority="older"' : rev ? 'data-priority="review"' : ""}>
        ${can ? `<label class="cqs-chk"><input type="checkbox" data-act="sel" data-id="${esc(c.id)}" data-k="sel:${esc(c.id)}" ${on ? "checked" : ""} aria-label="${bi("বাছুন", "Select")} ${esc(refOf(c))}"></label>` : ""}
        <div class="cq-ref"><button type="button" class="cq-link" data-act="open" data-id="${esc(c.id)}" data-k="open:${esc(c.id)}">${esc(refOf(c))}</button>
        <div class="mut sm">${esc([a?.holder, a?.bank].filter(Boolean).join(" · "))}</div>
        <div class="mut sm">${bi("চেকের তারিখ", "Cheque date")} ${dmy(c.date)}</div>
        <div class="cq-purpose sm">${esc(c.purpose.split(" (")[0])}${c.party || c.remarks ? " · " + esc(c.party || c.remarks) : ""}</div>
        </div><div class="cq-value"><strong class="num">৳ ${money(c.amount)}</strong>
        <div class="cq-state">${stTag(c.status)}${statementBadge(c)}${pendTag(c)}${old ? `<span class="cq-aged">${bi(`${age} দিন অপেক্ষমাণ`, `Pending ${age} days`)}</span>` : ""}${c.sdate ? `<span class="mut sm">${bi("স্ট্যাটাসের তারিখ", "Status date")} ${dmy(c.sdate)}</span>` : ""}</div>
        ${isPend ? `<div class="cqs-age ${lvl}" title="${bi(`${age} দিন আগের চেক`, `${age} day(s) old`)}"><i style="width:${Math.min(100, Math.max(6, Math.round(age / (alertDays * 4) * 100)))}%"></i></div>` : ""}</div>
        <div class="cq-actions">${isPend ? `<button class="btn ok" type="button" data-act="clear" data-id="${esc(c.id)}" data-k="clear:${esc(c.id)}">${bi("ক্লিয়ার করুন", "Mark cleared")}</button>` : ""}<button class="btn" type="button" data-act="status" data-id="${esc(c.id)}" data-k="status:${esc(c.id)}">${bi("স্ট্যাটাস বদলান", "Update status")}</button><button class="btn ghost sm cq-xbtn" type="button" data-act="xd" data-id="${esc(c.id)}" data-k="xd:${esc(c.id)}" aria-expanded="${isOpen}">${isOpen ? bi("লুকান", "Hide details") : bi("বিস্তারিত", "Details")} <i>${ico("chev")}</i></button></div>
        ${detail}</article>`;
    };
    let html = "";
    if (visible.length) {
      let last = [];
      for (const c of visible) {
        const g = gk.get(c);
        if (g) {
          const from = levels.findIndex((_, i) => last[i] !== g.comp[i]);
          if (from >= 0) for (let i = from; i < levels.length; i++) { last[i] = g.comp[i]; const t = gagg.get(g.comp[i]); html += `<div class="cq-grp${i > 0 ? " l2" : ""}"><b>${esc(levels[i].label(g.raw[i], c))}</b><span>${bi(`${t.n}টি চেক`, `${t.n} cheque(s)`)} · ৳ ${money(t.amt)}</span></div>`; }
        }
        html += card(c);
      }
    } else html = `<div class="card empty cp-empty"><strong>${q.value.trim() || acF || ageF ? bi("ফিল্টারে কোনো চেক মেলেনি", "No cheques match these filters") : mode === "pending" ? bi("সব চেক হালনাগাদ ✓ — কোনো অপেক্ষমাণ চেক নেই", "All caught up ✓ — no pending cheques") : bi("এই তালিকায় কোনো চেক নেই", "No cheques in this queue")}</strong>${q.value.trim() || acF || ageF ? `<button type="button" class="btn sm" id="s-reset-q">${bi("ফিল্টার মুছুন", "Clear filters")}</button>` : mode === "pending" ? `<button type="button" class="btn sm" data-cq-go="all">${bi("সব চেক দেখুন", "View all cheques")}</button>` : ""}</div>`;
    if (html !== lastHtml) {
      const f = document.activeElement, key = list.contains(f) ? f.dataset.k : "";
      list.innerHTML = lastHtml = html;
      if (key) $(`[data-k="${key}"]`, list)?.focus({ preventScroll: true });
    }
    /* bulk bar */
    const rows = [...sel].map(id => S.cheques.find(r => r.id === id)).filter(Boolean);
    $("#s-bulk", v).hidden = !rows.length;
    $("#s-bn", v).textContent = bi(`${rows.length}টি বাছাই`, `${rows.length} selected`);
    $("#s-bt", v).textContent = " · ৳ " + money(sumAmt(rows));
    persist();
  }
  const resetPage = () => { page = 0; draw(); };
  tiles.forEach(btn => btn.onclick = () => { mode = btn.dataset.cqFilter; ageF = ""; acF = ""; sel.clear(); resetPage(); });
  const clearAll = $("#s-clearall", v);
  clearAll.onclick = () => { q.value = ""; acF = ""; ageF = ""; sort.value = ""; grp = dateBy = ""; $("#s-group", v).value = ""; $("#s-dateby", v).value = ""; sel.clear(); resetPage(); q.focus(); };
  let qT = 0; q.oninput = () => { clearTimeout(qT); qT = setTimeout(resetPage, 120); }; sort.onchange = resetPage;
  acSel.onchange = () => { acF = acSel.value; resetPage(); };
  ageBox.onclick = e => { const b = e.target.closest("[data-age]"); if (!b) return; ageF = ageF === b.dataset.age ? "" : b.dataset.age; resetPage(); };
  $("#s-group", v).onchange = e => { grp = e.target.value; page = 0; persist(); draw(); };
  $("#s-dateby", v).onchange = e => { dateBy = e.target.value; page = 0; persist(); draw(); };
  const changePage = delta => { page += delta; draw(); info.scrollIntoView({ block: "nearest" }); };
  prev.onclick = () => changePage(-1); next.onclick = () => changePage(1);
  $("#s-all", v).onchange = e => { const on = e.target.checked; lastQueue.slice(page * pageSize, page * pageSize + pageSize).filter(c => canEdit && c.status === "Pending" && !c.pending).forEach(c => on ? sel.add(c.id) : sel.delete(c.id)); draw(); };
  $("#s-bx", v).onclick = () => { sel.clear(); draw(); };
  $("#s-xl", v).onclick = () => lastQueue.length ? exportXlsx({ Cheques: [CHQ_HEAD, ...lastQueue.map(chqRow)] }, `cheque-status-${mode}-${today()}.xlsx`) : toast(bi("ডাটা নেই", "No data"), "err");
  const byId = id => S.cheques.find(row => row.id === id);
  function act(kind, id) {
    const c = byId(id); if (!c) return;
    if (kind === "open") chequeModal(c, draw);
    else if (kind === "xd") { open.has(id) ? open.delete(id) : open.add(id); draw(); }
    else if (kind === "sel") { sel.has(id) ? sel.delete(id) : sel.add(id); draw(); }
    else if ((kind === "clear" || kind === "status") && date.reportValidity()) statusModal(c, draw, date.value, kind === "clear" ? "Cleared" : c.status);
  }
  list.onclick = e => {
    const go = e.target.closest("[data-cq-go]"); if (go) { mode = go.dataset.cqGo; resetPage(); return; }
    const btn = e.target.closest("button, input[data-act]");
    if (!btn) return;
    if (btn.id === "s-reset-q") { q.value = ""; ageF = ""; acF = ""; resetPage(); q.focus(); return; }
    if (btn.dataset.act) act(btn.dataset.act, btn.dataset.id);
  };
  $("#s-pulse", v).onclick = e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const c = byId(b.dataset.id); if (!c) return;
    mode = "pending"; ageF = ""; acF = ""; q.value = ""; sort.value = b.dataset.act === "oldest" ? "old" : "amount"; page = 0; activeId = c.id; draw();
    const idx = lastQueue.findIndex(x => x.id === c.id); if (idx >= pageSize) { page = Math.floor(idx / pageSize); draw(); }
    $(`[data-id="${CSS.escape(c.id)}"].cq-item`, list)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  async function bulkClear() {
    if (bulkBusy) return;
    const rows = [...sel].map(byId).filter(c => c && c.status === "Pending");
    if (!rows.length || !date.reportValidity()) return;
    if (!ask(bi(`${rows.length}টি চেক ক্লিয়ার করবেন?\nমোট ৳ ${money(sumAmt(rows))} · স্ট্যাটাসের তারিখ ${dmy(date.value)}`, `Mark ${rows.length} cheque(s) as cleared?\nTotal ৳ ${money(sumAmt(rows))} · status date ${dmy(date.value)}`))) return;
    bulkBusy = true; const btn = $("#s-bc", v), label = btn.innerHTML; btn.disabled = true; let ok = 0; const fails = [];
    for (const c of rows) {
      btn.textContent = `${ok + fails.length + 1}/${rows.length}…`;
      try { await setStatus(c, "Cleared", date.value, ""); ok++; sel.delete(c.id); } catch (er) { fails.push(`${refOf(c)}: ${er.message || er}`); }
    }
    bulkBusy = false; btn.disabled = false; btn.innerHTML = label;
    if (ok) toast(bi(`✔ ${ok}টি চেক ক্লিয়ার হয়েছে`, `✔ ${ok} cheque(s) cleared`));
    if (fails.length) toast(fails.slice(0, 2).join(" | ") + (fails.length > 2 ? ` (+${fails.length - 2})` : ""), "err");
    draw();
  }
  $("#s-bc", v).onclick = bulkClear;
  /* keyboard: J/K move, C clear, S status, X select, E details, / search */
  const onKey = e => {
    if (!list.isConnected || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".mback")) return;
    const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) && !(t.type === "checkbox" && t.dataset.act)) return;
    const key = e.key.toLowerCase(), cards = $$(".cq-item", list), idx = cards.findIndex(el => el.dataset.id === activeId);
    const move = d => { if (!cards.length) return; const n = idx < 0 ? (d > 0 ? 0 : cards.length - 1) : Math.max(0, Math.min(cards.length - 1, idx + d)); activeId = cards[n].dataset.id; cards.forEach(el => el.classList.toggle("act", el.dataset.id === activeId)); cards[n].scrollIntoView({ block: "nearest" }); };
    if (key === "/") { e.preventDefault(); q.focus(); q.select(); }
    else if (key === "j" || key === "arrowdown") { if (key === "arrowdown" && t.tagName === "BUTTON") return; e.preventDefault(); move(1); }
    else if (key === "k" || key === "arrowup") { if (key === "arrowup" && t.tagName === "BUTTON") return; e.preventDefault(); move(-1); }
    else if (key === "escape") { if (sel.size) { sel.clear(); draw(); } }
    else if (activeId && ["c", "s", "x", "e", "o"].includes(key)) { e.preventDefault(); const c = byId(activeId); if (!c) return; act(key === "c" ? (c.status === "Pending" ? "clear" : "status") : key === "s" ? "status" : key === "x" ? "sel" : key === "e" ? "xd" : "open", activeId); }
  };
  document.addEventListener("keydown", onKey);
  list.addEventListener("mouseover", e => { const el = e.target.closest(".cq-item"); if (el && el.dataset.id !== activeId) { activeId = el.dataset.id; $$(".cq-item", list).forEach(x => x.classList.toggle("act", x === el)); } });
  draw();
  let refreshing = false;
  const poll = setInterval(async () => {
    if (document.hidden || refreshing || bulkBusy || document.querySelector(".mback")) return;
    refreshing = true;
    try { await reload(); draw(); } catch { } finally { refreshing = false; }
  }, 30000);
  return () => { clearInterval(poll); document.removeEventListener("keydown", onKey); };
}

/* ---------- export helpers ---------- */
async function exportXlsx(sheets, filename) {
  await loadScript("vendor/xlsx.min.js"); const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) { const ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = (rows[0] || []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...rows.slice(0, 60).map(r => String(r[i] ?? "").length + 2))) })); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); }
  XLSX.writeFile(wb, filename);
}
/* Excel with the uploaded cheque photos embedded (ExcelJS, loaded on demand) */
async function photoThumb(path, maxW = 520) {
  const u = await API.photoUrl(path); let blob; if (/^data:/.test(u)) { const [h, d] = u.split(","); blob = new Blob([Uint8Array.from(atob(d), ch => ch.charCodeAt(0))], { type: h.slice(5).split(";")[0] }); } else { const r = await fetch(u); if (!r.ok) throw new Error("photo " + r.status); blob = await r.blob(); }
  const bm = await createImageBitmap(blob), k = Math.min(1, maxW / bm.width), w = Math.round(bm.width * k), h = Math.round(bm.height * k);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(bm, 0, 0, w, h); bm.close && bm.close();
  return { b64: cv.toDataURL("image/jpeg", 0.72).split(",")[1], w, h };
}
async function exportChequesXlsx(rows, filename, btn) {
  if (!rows.length) return toast(bi("ডাটা নেই", "No data"), "err");
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  const lbl = btn && btn.innerHTML; const prog = t => { if (btn) btn.innerHTML = t; };
  try { prog("⏳ …"); await loadScript("vendor/exceljs.min.js");
    const wb = new ExcelJS.Workbook(); wb.creator = "Nabiad"; const ws = wb.addWorksheet("Cheques", { views: [{ state: "frozen", ySplit: 1 }] });
    const head = [...CHQ_HEAD, "Photo"], widths = [12, 12, 28, 12, 14, 26, 12, 18, 12, 11, 12, 26, 12, 23, 15, 22, 28, 34];
    ws.columns = head.map((h, i) => ({ header: h, key: "c" + i, width: widths[i] }));
    const hr = ws.getRow(1); hr.height = 22; hr.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }; c.alignment = { vertical: "middle" }; });
    rows.forEach(c => { const r = ws.addRow(chqRow(c)); r.alignment = { vertical: "middle", wrapText: true }; r.getCell(5).numFmt = "#,##0.##"; });
    const withPh = rows.map((c, i) => [c, i]).filter(([c]) => c.photo); let done = 0;
    const work = async ([c, i]) => { try { const t = await photoThumb(c.photo), w = 230, h = Math.round(t.h * w / t.w), id = wb.addImage({ base64: t.b64, extension: "jpeg" }); ws.getRow(i + 2).height = Math.max(20, h * 0.75 + 4); ws.addImage(id, { tl: { col: head.length - 1, row: i + 1 + 0.04 }, ext: { width: w, height: h } }); } catch { ws.getCell(i + 2, head.length).value = bi("(ছবি আনা যায়নি)", "(photo unavailable)"); } prog(`⏳ ${++done}/${withPh.length}`); };
    const q = [...withPh]; await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await work(q.shift()); }));
    const buf = await wb.xlsx.writeBuffer(); dlBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
    toast(bi(`✔ Excel তৈরি — ${rows.length}টি চেক, ${withPh.length}টি ছবিসহ`, `✔ Excel ready — ${rows.length} cheque(s), ${withPh.length} with photo`));
  } catch (e) { console.error(e); toast(bi("Excel তৈরি হয়নি: ", "Excel failed: ") + (e.message || e), "err"); }
  finally { if (btn) { btn.innerHTML = lbl; btn.disabled = false; } }
}
const chqRow = c => [dmy(c.date), c.code, (accMap()[c.code] || {}).holder || "", c.no, c.amount, c.purpose, c.taker || "", c.party || "", c.toac || "", c.status, c.sdate ? dmy(c.sdate) : "", c.remarks || "", c.by || "", ...statementExport(c)];
const CHQ_HEAD = ["Date", "A/C Code", "Holder", "Cheque No", "Amount", "Purpose", "Cash Taker", "Party", "To A/C", "Status", "Status Date", "Remarks", "Entered By", "Statement Verification", "Statement Date", "Verified By", "Verified At"];

/* ---------- cheque list / enquiry ---------- */
const canDeleteChq = c => S.me.role === "admin" && !c.pending;
async function deleteChequeEntry(c, after) {
  if (!canDeleteChq(c)) return;
  if (c.events.length) return toast(bi(
    `এই চেকের ${c.events.length}টি স্ট্যাটাস রেকর্ড আছে। ভুল এন্ট্রি হলে "Cancelled" স্ট্যাটাস দিন।`,
    `This cheque has ${c.events.length} status record(s). If it was entered by mistake, set the status to "Cancelled".`), "err");
  if (!ask(bi(`চেক ${c.code} · ${c.no} স্থায়ীভাবে মুছবেন? (ফেরানো যাবে না)`,
    `Permanently delete cheque ${c.code} · ${c.no}? (cannot be undone)`))) return;
  try {
    await API.deleteCheque(c.id);
  } catch (error) {
    return toast(error.message || String(error),"err");
  }
  S.cheques = S.cheques.filter(row => row.id !== c.id);
  S.reminders = (S.reminders || []).map(row => row.cheque_id === c.id ? {...row,cheque_id:null} : row);
  saveCache(); refreshBadges();
  after?.();
  toast(bi("চেক মুছে ফেলা হয়েছে","Cheque deleted"));
}
function chequeModal(c, after) {
  const admin = S.me.role === "admin"; const a = accMap()[c.code] || {};
  modal(`<h2><span class="cq-detail-ref">${esc(acLabel(c.code))} · ${c.no}</span> ${stTag(c.status)} ${statementBadge(c)}</h2>
   <div class="grid g2 cq-detail" style="gap:8px;font-size:14px"><div><span class="mut sm">তারিখ</span><br>${dmy(c.date)}</div><div><span class="mut sm">টাকা</span><br><b class="num">৳ ${money(c.amount)}</b></div>
   <div><span class="mut sm">A/C</span><br>${esc(a.holder || "")}<div class="mut sm">${esc(a.bank || "")}</div></div><div><span class="mut sm">খাত</span><br>${esc(c.purpose)}</div>
   ${c.taker ? `<div><span class="mut sm">কে তুলেছে</span><br>${esc(c.taker)}</div>` : ""}${c.toac ? `<div><span class="mut sm">To A/C</span><br>${esc(c.toac)}</div>` : ""}${c.party ? `<div><span class="mut sm">পার্টি</span><br>${esc(c.party)}</div>` : ""}${c.remarks ? `<div><span class="mut sm">মন্তব্য</span><br>${esc(c.remarks)}</div>` : ""}
   <div><span class="mut sm">এন্ট্রি</span><br>${esc(c.by || "")} <span class="mut sm">${c.at ? new Date(c.at).toLocaleString("en-GB") : ""}</span></div></div>
   ${statementDetail(c)}
   <div id="c-ph" style="margin-top:12px"></div>
   ${(S.reminders || []).filter(r => r.cheque_id === c.id && !r.done).map(r => `<div class="alert vi" style="margin-top:10px">⏰ <span>${esc(r.title)} — ${new Date(remDue(r)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span></div>`).join("")}
   <h3 style="margin:16px 0 8px;font-size:13px;color:var(--mut)">স্ট্যাটাস ইতিহাস</h3>
   ${c.events.length ? c.events.map(e => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0">${stTag(e.status)} <span>${dmy(e.date)}</span> <span class="mut sm">${esc(e.by || "")} ${esc(e.remarks || "")}</span>${admin ? `<button class="btn ghost sm evdel" style="margin-left:auto" data-de="${e.id}" type="button" title="${bi("এই স্ট্যাটাস এন্ট্রি মুছুন", "Delete this status entry")}" aria-label="${bi("স্ট্যাটাস এন্ট্রি মুছুন", "Delete status entry")}">${ico("x")}</button>` : ""}</div>`).join("") : `<div class="mut sm">কোনো আপডেট নেই (ডিফল্ট: ${c.status})</div>`}
   <div class="modal-actions cq-va"><div class="cq-va-top">${moduleCan("cheque", "edit") ? `<button class="btn pri" id="c-st">স্ট্যাটাস দিন</button>` : ""}<button class="btn" id="c-rm">${ico("bell")} রিমাইন্ডার</button>${moduleCan("cheque", "edit", S.me.role === "staff" && (!c.photo || canEditChq(c))) ? `<button class="btn" id="c-ap">${ico("cam")} ${c.photo ? "ছবি বদলান" : "ছবি যোগ"}</button>` : ""}</div><div class="cq-va-bot">${canEditChq(c) ? `<button class="btn" id="c-ed">✎ ${bi("এডিট","Edit")}</button>` : ""}${canDeleteChq(c) ? `<button class="btn bad" id="c-dl">${ico("trash")} ${bi("মুছুন", "Delete")}</button>` : ""}<button class="btn s-close" id="c-x" type="button">✕ ${bi("বন্ধ", "Close")}</button></div></div>${!admin && canEditChq(c) ? `<div class="mut xs" style="margin-top:8px">⏳ ${LANG === "en" ? "You can edit this entry for another " : "এই এন্ট্রি আরও এডিট করতে পারবেন: "}${leftTxt(chqEditLeft(c))}</div>` : ""}`, (root, close) => {
    $("#c-x", root).onclick = close; showPhoto($("#c-ph", root), c);
    $("#c-rm", root).onclick = () => { close(); reminderModal(null, { title: bi(`চেক ${c.code} · ${c.no} পাস হয়েছে কি না দেখুন`, `Check whether cheque ${c.code} · ${c.no} has cleared`), note: `৳ ${money(c.amount)}${c.party ? " · " + c.party : ""} · ${bi("চেকের তারিখ", "Cheque date")} ${dmy(c.date)}`, due: (() => { const d = new Date(addDays(c.date < today() ? today() : c.date, 3) + "T10:00"); return d; })(), kind: "cheque", cheque_id: c.id, for_role: "all" }, after); };
    $("#c-ap", root) && ($("#c-ap", root).onclick = () => { close(); addPhotoModal(c, after); });
    $("#c-st", root) && ($("#c-st", root).onclick = () => { close(); statusModal(c, after); });
    $$("[data-de]", root).forEach(b => b.onclick = async () => { if (!ask("এই স্ট্যাটাস এন্ট্রি স্থায়ীভাবে মুছবেন?")) return; await API.deleteStatus(b.dataset.de); await reload(); close(); after && after(); toast("মুছে ফেলা হয়েছে"); });
    const deleteButton = $("#c-dl",root);
    if (deleteButton) deleteButton.onclick = () => deleteChequeEntry(c,() => { close(); after?.(); });
    $("#c-ed", root) && ($("#c-ed", root).onclick = () => { close(); editChequeModal(c, after); });
  });
}
const chequeEditDenied = () => bi("এই চেক এডিটের অনুমোদিত সময় বা অ্যাক্সেস নেই।", "The edit window is closed or you do not have permission to edit this cheque.");
function editChequeModal(c, after) {
  if (!canEditChq(c)) { after?.(); return toast(chequeEditDenied(),"err"); }
  modal(`<h2>${bi("চেক এডিট","Edit cheque")} · ${esc(acLabel(c.code))} · ${c.no}</h2><div class="grid" style="gap:10px">
   <div class="cq-edit-row"><div><label class="f" for="x-d">তারিখ</label><input class="in" type="date" id="x-d" value="${c.date}"></div><div><label class="f" for="x-c">A/C Code</label><select class="in" id="x-c">${S.accounts.map(a => `<option ${a.code === c.code ? "selected" : ""}>${esc(a.code)}</option>`).join("")}</select></div></div>
   <div class="cq-edit-row"><div><label class="f" for="x-n">চেক নং</label><input class="in" id="x-n" inputmode="numeric" value="${c.no}"></div><div><label class="f" for="x-a">টাকা</label><input class="in" id="x-a" inputmode="decimal" value="${c.amount}"></div></div>
   <div><label class="f" for="x-p">খাত</label><select class="in" id="x-p">${allPurposes(true).map(p => `<option ${pKey(p) === pKey(c.purpose) ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
   <div class="cq-edit-row"><div><label class="f" for="x-t">কে তুলেছে</label><input class="in" id="x-t" value="${esc(c.taker || "")}"></div><div><label class="f" for="x-o">To A/C</label><input class="in" id="x-o" value="${esc(c.toac || "")}"></div></div>
   <div class="cq-edit-row"><div><label class="f" for="x-y">পার্টি</label><input class="in" id="x-y" value="${esc(c.party || "")}"></div><div><label class="f" for="x-r">মন্তব্য</label><input class="in" id="x-r" value="${esc(c.remarks || "")}"></div></div>
   <div class="hint rd" id="x-err" role="alert"></div></div><div class="modal-actions"><button class="btn" id="x-x">${bi("বাতিল", "Cancel")}</button><button class="btn pri" id="x-ok">${bi("সেভ", "Save")}</button></div>`, (root, close) => {
    const get = id => $("#x-" + id, root), save = get("ok"), cancel = get("x"), error = get("err");
    cancel.onclick = close;
    save.onclick = async () => {
      if (save.disabled) return;
      if (!canEditChq(c)) { error.textContent = chequeEditDenied(); return; }
      const date = get("d").value, code = get("c").value, no = chequeNumber(get("n").value);
      const purpose = get("p").value, kind = purposeKey(purpose), rawAmount = get("a").value.trim();
      const amount = kind === "cancel" && !rawAmount ? 0 : chequeAmount(rawAmount);
      const taker = get("t").value.trim(), toac = get("o").value.trim();
      if ((code !== c.code || no !== c.no) && !bookForLeaf(code, no)) { error.textContent = noBookMsg(code, no); return; }
      const fail = (field, message) => { error.textContent = message; get(field).focus(); };
      if (!validChequeDate(date)) return fail("d", bi("সঠিক তারিখ দিন।", "Enter a valid cheque date."));
      if (!code) return fail("c", bi("A/C Code বাছুন।", "Choose an A/C code."));
      if (!no) return fail("n", bi("সঠিক চেক নম্বর দিন।", "Enter a valid cheque number."));
      if (S.cheques.some(other => other.id !== c.id && other.code === code && other.no === no)) return fail("n", bi("এই চেক আগেই এন্ট্রি আছে।", "This cheque is already registered."));
      if (!(amount === c.amount && purpose === c.purpose)) {
        if (kind === "cancel" && amount !== 0) return fail("a", bi("বাতিল পাতার অঙ্ক ০ দিন।", "Use a zero amount for a cancelled leaf."));
        if (kind !== "cancel" && !(amount > 0)) return fail("a", bi("সঠিক টাকার অঙ্ক দিন।", "Enter a valid amount greater than zero."));
      }
      if (kind === "cash" && !taker && purpose !== c.purpose) return fail("t", bi("কে তুলেছে লিখুন।", "Enter who withdrew the cash."));
      if (kind === "own" && (!toac || code === toac) && (purpose !== c.purpose || code !== c.code || toac !== (c.toac || ""))) return fail("o", bi("ভিন্ন একটি To A/C দিন।", "Enter a different receiving A/C."));
      error.textContent = "";
      save.disabled = cancel.disabled = true;
      try {
        const fields = { date, code, no, amount, purpose, taker, toac, party: get("y").value.trim(), remarks: get("r").value.trim() };
        await API.updateCheque(c.id, fields);
        const updated = S.cheques.find(row => row.id === c.id) || c;
        if (updated.code !== code || updated.no !== no || updated.amount !== amount) {
          updated.statementVerification = null;
          if (DEMO && demoStore.statementVerifications) { delete demoStore.statementVerifications[c.id]; DemoAPI.save(); }
        }
        derive(Object.assign(updated, fields)); saveCache(); refreshBadges();
        close(); after?.(); toast(bi("আপডেট হয়েছে", "Cheque updated"));
      } catch (err) { error.textContent = err.message || String(err); }
      finally { save.disabled = cancel.disabled = false; }
    };
  });
}
async function vCheques(v) {
  const F = { q: "", code: "", status: "", purpose: "", verification: "", sort: "newest", page: 0 }, PF = pbInit("month"), PS = 100, PBO = { all: true };
  const filterFields = { "k-q": "q", "k-c": "code", "k-s": "status", "k-u": "purpose", "k-vf": "verification" };
  let saved = {}; try { saved = JSON.parse(sessionStorage.getItem("nabiad_reg_view") || "{}"); } catch { }
  let grp = ["bank", "ac", "day"].includes(saved.grp) ? saved.grp : saved.group ? "day" : "", dateBy = ["year", "month", "week"].includes(saved.dateBy) ? saved.dateBy : "", dens = saved.dens || "", activeRow = "", quickActs = [];
  if (["newest", "oldest", "highest", "lowest"].includes(saved.sort)) F.sort = saved.sort;
  const columns = [
    bi("তারিখ", "Date"), bi("A/C · চেক", "A/C · Cheque"), bi("হোল্ডার", "Holder"), bi("টাকা", "Amount"),
    bi("খাত / বিবরণ", "Purpose / Details"), bi("স্ট্যাটাস", "Status"), bi("কে", "Entered by")
  ];
  v.innerHTML = head("চেক তালিকা ও এনকোয়ারি", `<button class="btn" id="k-x">${ico("dl")} Excel</button><button class="btn" id="k-p">${ico("print")} প্রিন্ট</button>${S.me.role !== "boss" && moduleCan("cheque", "edit") ? `<button class="btn" id="k-verify">${ico("check")} ${bi("স্টেটমেন্ট যাচাই", "Verify statement")}</button>` : ""}`) + `<div class="card tbar noprint">${pbBar("k", PF, PBO)}<div class="row cflt" style="margin-top:12px">
   <div class="k-sw" style="flex:2 1 220px"><label class="f" for="k-q">${bi("চেক খুঁজুন", "Search cheques")} <kbd>/</kbd></label><input class="in" id="k-q" type="search" autocomplete="off" placeholder="${bi("চেক নং, A/C, নাম… বা >50000 status:pending", "Cheque no, A/C, name… or >50000 status:pending")}"><div class="k-tips" id="k-tips" aria-hidden="true"><span>${bi("স্মার্ট সার্চ:", "Smart search:")}</span>${[[">=1l", bi("≥ ১ লাখ", "≥ 1 lakh")], ["<10k", bi("< ১০ হাজার", "< 10k")], ["status:pending", "status:pending"], ["status:bounced", "status:bounced"], ["by:", "by:name"], ["ac:", "ac:code"]].map(([t, l]) => `<button type="button" tabindex="-1" data-tip="${t}">${l}</button>`).join("")}</div></div>
   <button type="button" class="btn sm k-more" id="k-more" aria-expanded="false" aria-controls="k-c">${ico("sliders")}<span>${bi("আরও ফিল্টার", "More filters")}</span><b id="k-moren"></b></button>
   <div style="flex:1 1 220px"><label class="f" for="k-c">A/C</label><select class="in" id="k-c"><option value="">সব</option>${S.accounts.map(a => `<option value="${esc(a.code)}">${esc(a.code)}${a.holder ? " · " + esc(a.holder) : ""}${a.bank ? " · " + esc(a.bank) : ""}</option>`).join("")}</select></div>
   <div><label class="f" for="k-s">স্ট্যাটাস</label><select class="in" id="k-s"></select></div>
   <div><label class="f" for="k-u">খাত</label><select class="in" id="k-u"><option value="">সব</option>${allPurposes(true).map(p => `<option value="${esc(p)}">${esc(p.split(" (")[0])}</option>`).join("")}</select></div>
   ${S.statementReady ? `<div><label class="f" for="k-vf">${bi("স্টেটমেন্ট যাচাই", "Statement verification")}</label><select class="in" id="k-vf"><option value="">${bi("সব", "All")}</option><option value="yes">Verified</option><option value="no">Unverified</option></select></div>` : ""}</div><div class="k-quick" id="k-quick" role="group" aria-label="${bi("দ্রুত ফিল্টার", "Quick views")}"></div><div class="k-chips" id="k-chips"></div></div>
   <div id="k-sum" class="ksum enquiry-summary" role="region" tabindex="0" aria-label="${bi("চেকের সারাংশ", "Cheque summary")}"></div>
   <div class="cq-pulse k-pulse" id="k-pulse"></div>
   <section class="card flush enquiry-results" aria-label="${bi("চেকের ফলাফল", "Cheque results")}">
     <div class="enquiry-toolbar noprint">
       <div id="k-count" class="mut sm" role="status" tabindex="-1"></div>
       <div class="enquiry-actions">
         <label for="k-group" class="mut sm">${bi("গ্রুপ করুন", "Group by")}</label>
         <select class="in" id="k-group"><option value="">${bi("গ্রুপ ছাড়া", "No grouping")}</option><option value="bank">${bi("ব্যাংকের নাম", "Bank name")}</option><option value="ac">${bi("অ্যাকাউন্টের নাম", "Account name")}</option><option value="day">${bi("চেকের তারিখ", "Cheque date")}</option></select>
         <label for="k-dateby" class="mut sm">${bi("তারিখ অনুযায়ী", "Date by")}</label>
         <select class="in" id="k-dateby"><option value="">—</option><option value="year">${bi("বছর", "Year")}</option><option value="month">${bi("মাস", "Month")}</option><option value="week">${bi("সপ্তাহ", "Week")}</option></select>
         <div class="chips k-dens" role="group" aria-label="${bi("ঘনত্ব", "Density")}"><button type="button" class="chip sm" data-dens="" aria-pressed="true">${bi("স্বাভাবিক", "Comfortable")}</button><button type="button" class="chip sm" data-dens="compact" aria-pressed="false">${bi("কমপ্যাক্ট", "Compact")}</button></div>
         <button type="button" class="btn sm" id="k-reset">${bi("সব মুছুন", "Clear all")}</button>
         <label for="k-sort" class="mut sm">${bi("সাজান", "Sort by")}</label>
         <select class="in" id="k-sort"><option value="newest">${bi("নতুন চেক আগে", "Newest date")}</option>
           <option value="oldest">${bi("পুরোনো চেক আগে", "Oldest date")}</option>
           <option value="highest">${bi("বেশি টাকা আগে", "Highest amount")}</option>
           <option value="lowest">${bi("কম টাকা আগে", "Lowest amount")}</option></select>
       </div>
     </div>
     <div id="k-tab"></div><div id="k-pg" class="row noprint enquiry-pager" hidden>
       <button type="button" class="btn sm fix" id="k-prev">‹ ${bi("আগের", "Previous")}</button>
       <span id="k-page" class="mut sm fix"></span>
       <button type="button" class="btn sm fix" id="k-next">${bi("পরের", "Next")} ›</button>
     </div>
   </section>`;
  /* smart search: >50000  <10k  >=1l  status:pending  by:name  ac:code  — everything else is plain text */
  function parseQ(raw) {
    const P = { text: [], min: null, max: null, status: "", ac: "", by: "", chips: [] };
    for (const tok of String(raw || "").trim().split(/\s+/).filter(Boolean)) {
      let m;
      if (/^[a-z]+:$/i.test(tok)) continue;
      if ((m = tok.match(/^(>=|<=|>|<)(.+)$/)) && Number.isFinite(chequeAmount(expandAmt(m[2])))) {
        const n = chequeAmount(expandAmt(m[2])), op = m[1];
        if (op[0] === ">") P.min = Math.max(P.min ?? 0, op === ">" ? n + 0.005 : n); else P.max = Math.min(P.max ?? Infinity, op === "<" ? n - 0.005 : n);
        P.chips.push([tok, bi(`অঙ্ক ${op} ৳ ${money(n)}`, `Amount ${op} ৳ ${money(n)}`)]);
      } else if ((m = tok.match(/^(?:status|st):(.+)$/i)) && STATUSES.find(x => x.toLowerCase().startsWith(m[1].toLowerCase()))) {
        P.status = STATUSES.find(x => x.toLowerCase().startsWith(m[1].toLowerCase())); P.chips.push([tok, bi("স্ট্যাটাস: ", "Status: ") + P.status]);
      } else if ((m = tok.match(/^ac:(.+)$/i))) { P.ac = m[1].toLowerCase(); P.chips.push([tok, "A/C: " + m[1]]); }
      else if ((m = tok.match(/^by:(.+)$/i))) { P.by = m[1].toLowerCase(); P.chips.push([tok, bi("এন্ট্রি: ", "By: ") + m[1]]); }
      else P.text.push(tok);
    }
    return P;
  }
  const filt = (accounts = accMap()) => {
    const [from, to] = pbRange(PF), P = parseQ(F.q), matches = chequeMatcher(P.text.join(" "), accounts);
    return S.cheques.filter(c => c.date >= from && c.date <= to && (!F.code || c.code === F.code) && (!F.purpose || pKey(c.purpose) === pKey(F.purpose))
      && (P.min == null || c.amount >= P.min) && (P.max == null || c.amount <= P.max) && (!P.status || c.status === P.status)
      && (!P.ac || c.code.toLowerCase().includes(P.ac)) && (!P.by || String(c.by || "").toLowerCase().includes(P.by)) && matches(c));
  };
  const withStatus = rows => rows.filter(c => (!F.status || c.status === F.status) && (!F.verification || (F.verification === "yes") === Boolean(statementVerification(c))));
  const newest = (a, b) => b.date.localeCompare(a.date) || b.no - a.no;
  const comparators = {
    newest,
    oldest: (a, b) => newest(b, a),
    highest: (a, b) => b.amount - a.amount || newest(a, b),
    lowest: (a, b) => a.amount - b.amount || newest(a, b)
  };
  const sorted = rows => rows.sort(comparators[F.sort]);
  const stOpts = base => {
    const counts = {};
    base.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    const sel = $("#k-s", v);
    sel.innerHTML = `<option value="">${bi("সব", "All")} (${base.length})</option>` + STATUSES.map(status => `<option value="${status}">${status} (${counts[status] || 0})</option>`).join("");
    sel.value = F.status;
  };
  const draw = () => {
    if (!$("#k-tab", v)) return;
    const accounts = accMap(), base = filt(accounts);
    stOpts(base);
    const arr = sorted(withStatus(base)), pages = Math.max(1, Math.ceil(arr.length / PS));
    const MN = [bi("জানুয়ারি", "January"), bi("ফেব্রুয়ারি", "February"), bi("মার্চ", "March"), bi("এপ্রিল", "April"), bi("মে", "May"), bi("জুন", "June"), bi("জুলাই", "July"), bi("আগস্ট", "August"), bi("সেপ্টেম্বর", "September"), bi("অক্টোবর", "October"), bi("নভেম্বর", "November"), bi("ডিসেম্বর", "December")];
    const dKey = c => dateBy === "year" ? c.date.slice(0, 4) : dateBy === "month" ? c.date.slice(0, 7) : dateBy === "week" ? pbWeek(c.date)[0] : c.date;
    const levels = [];
    if (grp === "bank" || grp === "ac") levels.push({ key: c => grp === "bank" ? (accounts[c.code]?.bank || "—") : c.code, label: (k, c) => grp === "ac" ? acLabel(c.code) : k, desc: false });
    if (grp === "day" || dateBy) levels.push({ key: dKey, desc: F.sort !== "oldest", label: k => dateBy === "month" ? `${MN[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` : dateBy === "week" ? `${dmy(k)} – ${dmy(pbWeek(k)[1])}` : dateBy === "year" ? k : dmy(k) });
    const gk = new Map(), gagg = new Map();
    if (levels.length) {
      for (const c of arr) {
        let pre = ""; const raw = levels.map(L => L.key(c)), comp = raw.map(k => pre = pre + "\u0001" + k);
        gk.set(c, { raw, comp });
        for (const k of comp) { const o = gagg.get(k) || { n: 0, amt: 0 }; o.n++; if (isLive(c)) o.amt += c.amount; gagg.set(k, o); }
      }
      arr.sort((a, b) => { const x = gk.get(a).raw, y = gk.get(b).raw; for (let i = 0; i < levels.length; i++) if (x[i] !== y[i]) return levels[i].desc ? y[i].localeCompare(x[i]) : x[i].localeCompare(y[i]); return 0; });
    }
    F.page = Math.min(F.page, pages - 1);
    const offset = F.page * PS, part = arr.slice(offset, offset + PS);
    const live = arr.filter(isLive);
    const statusTotals = new Map(group(arr, c => c.status).map(total => [total.k, total]));
    const kc = (label, count, amount, cls = "", st = "") => `<div class="kc ${cls}${st && F.status === st ? " on" : ""}"${st ? ` data-st="${st}" role="button" tabindex="0" aria-pressed="${F.status === st}"` : ""}><span>${label}</span><div class="kv"><b>${count}</b>${amount != null ? `<small class="num">৳ ${money(amount)}</small>` : ""}</div></div>`;
    let summary = kc(bi("মোট চেক", "Cheques"), arr.length, null) + kc(bi("কার্যকর মোট", "Live total"), live.length, sumAmt(live), "main");
    if (S.statementReady) {
      const verified = statementSummary(arr);
      summary += kc(bi("যাচাইকৃত", "Verified"), verified.count, verified.amount) + kc(bi("অযাচাইকৃত", "Unverified"), verified.rest, null);
    }
    for (const status of STATUSES) {
      const total = statusTotals.get(status);
      if (total) summary += kc(stTag(status), total.n, total.amt, "st-" + status.toLowerCase(), status);
    }
    $("#k-sum", v).innerHTML = summary;
    const P = parseQ(F.q), terms = P.text.filter(Boolean);
    const topAc = group(live, c => c.code).sort((a, b) => b.amt - a.amt)[0], topP = group(live, c => pKey(c.purpose)).sort((a, b) => b.amt - a.amt)[0];
    const largest = live.reduce((m, c) => !m || c.amount > m.amount ? c : m, null), sampleP = topP && live.find(c => pKey(c.purpose) === topP.k)?.purpose;
    const pulse = live.length ? [
      `<button type="button" class="cq-p" data-kact="open" data-id="${esc(largest.id)}"><span>${bi("সবচেয়ে বড় চেক", "Largest cheque")}</span><b class="num">৳ ${money(largest.amount)}</b><em>${esc(acLabel(largest.code))} · ${largest.no}</em></button>`,
      topAc ? `<button type="button" class="cq-p" data-kact="ac" data-v="${esc(topAc.k)}"><span>${bi("শীর্ষ A/C", "Top account")}</span><b>${esc(acLabel(topAc.k))}</b><em class="num">৳ ${money(topAc.amt)} · ${topAc.n}${bi("টি", "")}</em></button>` : "",
      topP ? `<button type="button" class="cq-p" data-kact="purpose" data-v="${esc(sampleP)}"><span>${bi("শীর্ষ খাত", "Top purpose")}</span><b>${esc(sampleP.split(" (")[0])}</b><em class="num">৳ ${money(topP.amt)} · ${topP.n}${bi("টি", "")}</em></button>` : "",
      `<div class="cq-p ok"><span>${bi("গড় অঙ্ক", "Average amount")}</span><b class="num">৳ ${money(Math.round(sumAmt(live) / live.length))}</b><em>${live.length} ${bi("কার্যকর চেক", "live cheques")}</em></div>`
    ].join("") : "";
    if ($("#k-pulse", v).innerHTML !== pulse) $("#k-pulse", v).innerHTML = pulse; $("#k-pulse", v).hidden = !pulse;
    const chipsList = [...P.chips.map(([tok, label]) => ["q:" + tok, label]), F.code && ["code", "A/C: " + acLabel(F.code)], F.status && ["status", bi("স্ট্যাটাস: ", "Status: ") + F.status], F.purpose && ["purpose", bi("খাত: ", "Purpose: ") + F.purpose.split(" (")[0]], F.verification && ["verification", F.verification === "yes" ? "Verified" : "Unverified"]].filter(Boolean);
    const chipsHtml = chipsList.map(([k, label]) => `<button type="button" class="chip sm on" data-rm="${esc(k)}" title="${bi("সরান", "Remove")}">${esc(label)} <b>✕</b></button>`).join("");
    if ($("#k-chips", v).innerHTML !== chipsHtml) $("#k-chips", v).innerHTML = chipsHtml; $("#k-chips", v).hidden = !chipsList.length;
    const cashP = allPurposes(true).find(p => purposeKey(p) === "cash"), hvRe = /(^|\s)>=100000(?=\s|$)/;
    const quick = [
      [bi("সব", "All"), !F.status && !F.purpose && !F.verification && !hvRe.test(F.q), () => { F.status = F.purpose = F.verification = ""; F.q = F.q.replace(hvRe, "").trim(); }],
      ["Pending", F.status === "Pending", () => { F.status = F.status === "Pending" ? "" : "Pending"; }],
      ["Cleared", F.status === "Cleared", () => { F.status = F.status === "Cleared" ? "" : "Cleared"; }],
      ["Bounced", F.status === "Bounced", () => { F.status = F.status === "Bounced" ? "" : "Bounced"; }],
      cashP ? [bi("ক্যাশ উত্তোলন", "Cash withdrawal"), pKey(F.purpose) === pKey(cashP) && !!F.purpose, () => { F.purpose = F.purpose && pKey(F.purpose) === pKey(cashP) ? "" : cashP; }] : null,
      [bi("বড় অঙ্ক ≥ ১ লাখ", "High value ≥ 1 lakh"), hvRe.test(F.q), () => { F.q = hvRe.test(F.q) ? F.q.replace(hvRe, "").trim() : (F.q.trim() + " >=100000").trim(); }],
      S.statementReady ? [bi("অযাচাইকৃত", "Unverified"), F.verification === "no", () => { F.verification = F.verification === "no" ? "" : "no"; }] : null
    ].filter(Boolean);
    quickActs = quick.map(x => x[2]);
    const quickHtml = `<span class="k-quick-l">${bi("দ্রুত ভিউ", "Quick views")}</span>` + quick.map(([label, on], i) => `<button type="button" class="chip sm${on ? " on" : ""}" data-q="${i}" aria-pressed="${on}">${label}</button>`).join("");
    if ($("#k-quick", v).innerHTML !== quickHtml) $("#k-quick", v).innerHTML = quickHtml;
    const activeCount = Object.values(filterFields).filter(key => F[key].trim()).length;
    const reset = $("#k-reset", v);
    const allCount = activeCount + (grp ? 1 : 0) + (dateBy ? 1 : 0) + (F.sort !== "newest" ? 1 : 0);
    reset.disabled = allCount === 0;
    reset.textContent = bi("সব মুছুন", "Clear all") + (allCount ? ` (${allCount})` : "");
    $("#k-count", v).textContent = part.length
      ? bi(`${money(offset + 1)}–${money(offset + part.length)} দেখাচ্ছে · মোট ${money(arr.length)} চেক`, `Showing ${money(offset + 1)}–${money(offset + part.length)} of ${money(arr.length)} cheques`)
      : bi("০টি চেক", "0 cheques");
    const cell = (index, content, cls = "") => `<td class="${cls}" data-l="${columns[index]}"><div>${content}</div></td>`;
    const hl = t => { t = String(t ?? ""); if (!terms.length) return esc(t); const re = new RegExp("(" + terms.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi"); return t.split(re).map((x, i) => i % 2 ? `<mark>${esc(x)}</mark>` : esc(x)).join(""); };
    const th = (i, col) => {
      const k = i === 0 ? ["newest", "oldest"] : i === 3 ? ["highest", "lowest"] : null, r = i === 3 ? " r" : "";
      if (!k) return `<th scope="col" class="${r.trim()}">${col}</th>`;
      const on = k.includes(F.sort);
      return `<th scope="col" class="k-th${r}${on ? " on" : ""}" data-ksort="${on && F.sort === k[0] ? k[1] : k[0]}" tabindex="0" role="button" aria-sort="${on ? (F.sort === k[0] ? "descending" : "ascending") : "none"}">${col} <i>${on ? (F.sort === k[0] ? "↓" : "↑") : "↕"}</i></th>`;
    };
    const last = [];
    $("#k-tab", v).className = dens ? "k-" + dens : "";
    $("#k-tab", v).innerHTML = part.length ? `<div class="tw cards"><table><thead><tr>${columns.map((column, i) => th(i, column)).join("")}</tr></thead><tbody>${part.map(c => {
      let g = "";
      if (levels.length) {
        const k = gk.get(c), from = levels.findIndex((_, i) => last[i] !== k.comp[i]);
        if (from >= 0) for (let i = from; i < levels.length; i++) { last[i] = k.comp[i]; const t = gagg.get(k.comp[i]); g += `<tr class="k-grp${i > 0 ? " l2" : ""}"><td colspan="7"><b>${esc(levels[i].label(k.raw[i], c))}</b><span>${bi(`${t.n}টি চেক`, `${t.n} cheque(s)`)} · ৳ ${money(t.amt)}</span></td></tr>`; }
      }
      return g + `<tr data-register-id="${esc(c.id)}"${c.id === activeRow ? ' class="k-act"' : ""}>
      ${cell(0, dmy(c.date))}
      ${cell(1, `<button type="button" class="cq-link" data-register-id="${esc(c.id)}">${hl(acLabel(c.code) + " · " + c.no)}</button>${chqIcons(c)}`)}
      ${cell(2, hl(accounts[c.code]?.holder || "—"), "mut sm")}
      ${cell(3, money(c.amount), "r num")}
      ${cell(4, `${hl(c.purpose.split(" (")[0])}<div class="mut sm">${hl([c.taker, c.party, c.toac && "→ " + c.toac, c.remarks].filter(Boolean).join(" · "))}</div>`)}
      ${cell(5, `<span class="stc">${stTag(c.status)}${statementBadge(c)}${pendTag(c)}${c.sdate && c.status !== "Pending" ? `<span class="mut sm stc-d">${dmy(c.sdate)}</span>` : ""}</span>`)}
      ${cell(6, hl(c.by || "—"), "mut sm")}
    </tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">${activeCount || chipsList.length
      ? bi("কোনো চেক মেলেনি। ফিল্টার পরিবর্তন করে দেখুন।", "No cheques match these filters.")
      : bi("এই সময়সীমায় কোনো চেক নেই।", "No cheques in this period.")}</div>`;
    try { sessionStorage.setItem("nabiad_reg_view", JSON.stringify({ grp, dateBy, dens, sort: F.sort })); } catch { }
    const pager = $("#k-pg", v);
    pager.hidden = pages <= 1;
    $("#k-prev", v).disabled = F.page === 0;
    $("#k-next", v).disabled = F.page >= pages - 1;
    $("#k-page", v).textContent = bi(`পাতা ${F.page + 1} / ${pages}`, `Page ${F.page + 1} of ${pages}`);
  };
  const syncInputs = () => { for (const [id, key] of Object.entries(filterFields)) { const f = $("#" + id, v); if (f) f.value = F[key]; } $("#k-sort", v).value = F.sort; F.page = 0; };
  const openRow = id => { const row = S.cheques.find(c => c.id === id); if (row) chequeModal(row, draw); };
  $("#k-tab", v).onclick = event => {
    const th = event.target.closest("[data-ksort]");
    if (th) { F.sort = th.dataset.ksort; $("#k-sort", v).value = F.sort; F.page = 0; draw(); return; }
    if (event.target.closest("a,input") || String(getSelection()).trim()) return;
    const id = event.target.closest("[data-register-id]")?.dataset.registerId;
    if (id) { activeRow = id; openRow(id); }
  };
  $("#k-tab", v).onkeydown = e => { const th = e.target.closest?.("[data-ksort]"); if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); th.click(); } };
  const kcToggle = el => { const st = el?.dataset.st; if (!st) return; F.status = F.status === st ? "" : st; syncInputs(); draw(); };
  $("#k-sum", v).onclick = e => kcToggle(e.target.closest("[data-st]"));
  $("#k-sum", v).onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target.dataset?.st) { e.preventDefault(); kcToggle(e.target); } };
  $("#k-pulse", v).onclick = e => {
    const b = e.target.closest("[data-kact]"); if (!b) return;
    if (b.dataset.kact === "open") openRow(b.dataset.id);
    else { F[b.dataset.kact === "ac" ? "code" : "purpose"] = b.dataset.v; syncInputs(); draw(); }
  };
  $("#k-quick", v).onclick = e => { const b = e.target.closest("[data-q]"); if (!b) return; quickActs[+b.dataset.q](); syncInputs(); draw(); };
  $("#k-chips", v).onclick = e => {
    const b = e.target.closest("[data-rm]"); if (!b) return; const k = b.dataset.rm;
    if (k.startsWith("q:")) { const tok = k.slice(2), parts = F.q.trim().split(/\s+/); const i = parts.indexOf(tok); if (i >= 0) parts.splice(i, 1); F.q = parts.join(" "); } else F[k] = "";
    syncInputs(); draw();
  };
  $("#k-tips", v).onmousedown = e => e.preventDefault();
  $("#k-tips", v).onclick = e => {
    const b = e.target.closest("[data-tip]"); if (!b) return; const q = $("#k-q", v), tip = b.dataset.tip;
    q.value = (q.value.trim() + " " + tip).trim() + (tip.endsWith(":") ? "" : " "); F.q = q.value; F.page = 0; draw(); q.focus();
  };
  $("#k-group", v).value = grp; $("#k-dateby", v).value = dateBy;
  $("#k-group", v).onchange = e => { grp = e.target.value; F.page = 0; draw(); };
  $("#k-dateby", v).onchange = e => { dateBy = e.target.value; F.page = 0; draw(); };
  $$("[data-dens]", v).forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.dens === dens)); b.classList.toggle("on", b.dataset.dens === dens); b.onclick = () => { dens = b.dataset.dens; $$("[data-dens]", v).forEach(x => { x.setAttribute("aria-pressed", String(x.dataset.dens === dens)); x.classList.toggle("on", x.dataset.dens === dens); }); draw(); }; });
  $("#k-sort", v).value = F.sort;
  const bind = (id, k) => { const el = $("#" + id, v); el.addEventListener("input", () => { F[k] = el.value; F.page = 0; draw(); }); };
  const pre = sessionStorage.getItem("nabiad_chq_ac"); if (pre) { sessionStorage.removeItem("nabiad_chq_ac"); F.code = pre; $("#k-c", v).value = pre; }
  pbBind(v, "k", PF, () => { F.page = 0; draw(); }, PBO);
  for (const [id, key] of Object.entries(filterFields)) {
    if ($("#" + id, v)) bind(id, key);
  }
  bind("k-sort", "sort");
  $("#k-reset", v).onclick = () => {
    for (const [id, key] of Object.entries(filterFields)) {
      F[key] = "";
      const field = $("#" + id, v);
      if (field) field.value = "";
    }
    F.page = 0; F.sort = "newest"; grp = dateBy = "";
    $("#k-sort", v).value = "newest"; $("#k-group", v).value = ""; $("#k-dateby", v).value = "";
    $("#k-q", v).focus();
    draw();
  };
  const turnPage = step => {
    F.page += step;
    draw();
    $("#k-count", v).focus();
  };
  $("#k-prev", v).onclick = () => turnPage(-1);
  $("#k-next", v).onclick = () => turnPage(1);
  if ($("#k-verify", v)) $("#k-verify", v).onclick = () => S.statementReady
    ? statementModal(draw)
    : toast(bi("স্টেটমেন্ট যাচাই চালু নেই। ডাটাবেস সেটআপ ও সংযোগ দেখুন।", "Statement verification is unavailable. Check the database setup and connection."), "err");
  { const flt = $(".cflt", v), more = $("#k-more", v), cnt = () => { const n = ["k-c", "k-s", "k-u", "k-vf"].filter(id => { const el = $("#" + id, v); return el && el.value; }).length; $("#k-moren", v).textContent = n || ""; };
    more.onclick = () => { const on = !flt.classList.contains("k-open"); flt.classList.toggle("k-open", on); more.setAttribute("aria-expanded", String(on)); };
    flt.addEventListener("change", cnt); new MutationObserver(cnt).observe($("#k-chips", v), { childList: true }); cnt(); }
  $("#k-x", v).onclick = () => exportChequesXlsx(sorted(withStatus(filt())), `Cheques_${PF.m === "all" ? today() : pbRange(PF).join("_to_")}.xlsx`, $("#k-x", v));
  $("#k-p", v).onclick = () => {
    const arr = withStatus(filt()).sort((x, y) => x.date.localeCompare(y.date) || x.code.localeCompare(y.code)), live = arr.filter(isLive), am = accMap(); if (!arr.length) return toast("ডাটা নেই", "err");
    const [pa, pb] = pbRange(PF), f = PF.m === "all" ? arr[0].date : pa, t = PF.m === "all" ? arr[arr.length - 1].date : pb, flt = [F.code, F.status, F.purpose && F.purpose.split(" (")[0], F.verification === "yes" ? "Verified" : F.verification === "no" ? "Unverified" : "", F.q && `"${esc(F.q)}"`].filter(Boolean).join(" · ");
    printSheet(repSheet("k-sheet", "Cheque List · চেক তালিকা" + (flt ? " · " + flt : ""), f, t,
      repKpi([[`Cheques · live`, `${live.length} <small>/ ${arr.length}</small>`, "k1"], ["Live Amount", "৳ " + money(sumAmt(live)), "k3"], ["Pending", `${arr.filter(c => c.status === "Pending").length} · ৳ ${money(sumAmt(arr.filter(c => c.status === "Pending")))}`, ""], ["Cleared", `${arr.filter(c => c.status === "Cleared").length} · ৳ ${money(sumAmt(arr.filter(c => c.status === "Cleared")))}`, ""]]),
      repOne(repBox(`Cheques (${arr.length})`, ["~Date", "~A/C · Cheque", "~Holder", "Amount", "~Purpose / Detail", "Status", "~Statement"], arr.map(c => `<tr><td class="cd">${dmy(c.date)}</td><td><b>${esc(c.code)}</b> #${esc(c.no)}</td><td>${esc((am[c.code] || {}).holder || "")}</td><td class="r num b">${money(c.amount)}</td><td>${esc(c.purpose.split(" (")[0])}${c.party || c.taker || c.remarks ? `<div class="mut" style="font-size:10px">${esc([c.party, c.taker, c.remarks].filter(Boolean).join(" · "))}</div>` : ""}</td><td class="r">${esc(c.status)}</td><td>${statementLabel(c)}</td></tr>`).join(""), `<tr class="tot"><td colspan="3">TOTAL (live)</td><td class="r num">${money(sumAmt(live))}</td><td colspan="3"></td></tr>`)) + statementReportBlock(arr)), `Cheque_List_${f}_${t}`);
  };
  draw();
  const onKey = e => {
    if (!$("#k-tab", v)?.isConnected || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".mback")) return;
    const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const key = e.key.toLowerCase(), rows = $$("#k-tab tbody tr[data-register-id]", v), idx = rows.findIndex(r => r.dataset.registerId === activeRow);
    const move = d => { if (!rows.length) return; const n = idx < 0 ? (d > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, idx + d)); activeRow = rows[n].dataset.registerId; rows.forEach(r => r.classList.toggle("k-act", r.dataset.registerId === activeRow)); rows[n].scrollIntoView({ block: "nearest" }); };
    if (key === "/") { e.preventDefault(); $("#k-q", v).focus(); $("#k-q", v).select(); }
    else if (key === "j" || (key === "arrowdown" && t.tagName !== "BUTTON")) { e.preventDefault(); move(1); }
    else if (key === "k" || (key === "arrowup" && t.tagName !== "BUTTON")) { e.preventDefault(); move(-1); }
    else if ((key === "enter" || key === "o") && activeRow && t.tagName !== "BUTTON" && t.tagName !== "A") { e.preventDefault(); openRow(activeRow); }
  };
  document.addEventListener("keydown", onKey);
  let refreshing = false;
  const poll = setInterval(async () => {
    if (document.hidden || refreshing || document.querySelector(".mback") || document.activeElement === $("#k-q", v)) return;
    refreshing = true; try { await reload(); draw(); } catch { } finally { refreshing = false; }
  }, 30000);
  return () => { clearInterval(poll); document.removeEventListener("keydown", onKey); };
}

/* ---------- daily closing ---------- */
const isFri = d => new Date(d + "T00:00:00").getDay() === 5;
const stepDay = (d, n) => { let x = addDays(d, n); if (CFG.SKIP_FRIDAY !== false && isFri(x)) x = addDays(x, n); return x; };
const workGap = (a, b) => { let n = 0; for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (!isFri(d)) n++; return n; };
const fmtIn = n => n === null || n === undefined || n === "" || isNaN(n) ? "" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const same = (a, b) => Math.abs(num(a) - num(b)) < 0.005;
/* Previous | Date | Next on one line */
function dateNav(id, date) {
  return `<div class="dnav"><button class="btn" id="${id}-p" title="আগের দিন (শুক্রবার বাদ)">‹ আগের</button><input class="in big" type="date" id="${id}-d" value="${date}"><button class="btn" id="${id}-n" title="পরের দিন (শুক্রবার বাদ)">পরের ›</button></div>`;
}
function bindDateNav(v, id, draw) {
  const d = $(`#${id}-d`, v); d.onchange = draw;
  $(`#${id}-p`, v).onclick = () => { d.value = stepDay(d.value, -1); draw(); };
  $(`#${id}-n`, v).onclick = () => { d.value = stepDay(d.value, 1); draw(); };
}
const searchBox = (id, ph, extra = "") => `<div class="srch"><label class="si">${ico("search")}<input class="in" id="${id}" placeholder="${ph}" autocomplete="off" type="search"></label>${extra}</div>`;
const accHay = a => norm([a.code, a.holder, a.bank, a.branch, a.acno, a.type].join(" "));

/* drafts: kept on this device automatically, and on the server when "ড্রাফট সেভ" is pressed */
const DRAFT_KEY = d => "nabiad_draft_" + d;
const Draft = {
  local(d) { try { return JSON.parse(localStorage.getItem(DRAFT_KEY(d)) || "null"); } catch { return null; } },
  saveLocal(d, rows) {
    try {
      localStorage.setItem(DRAFT_KEY(d), JSON.stringify({ rows, at: new Date().toISOString(), by: S.me.name, local: true }));
      return true;
    } catch { return false; }
  },
  dropLocal(d) { try { localStorage.removeItem(DRAFT_KEY(d)); } catch { } },
  localDates() { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("nabiad_draft_")) o.push(k.slice(13)); } return o.sort(); },
  async get(d) {
    const l = this.local(d); let s = null;
    if (navigator.onLine || DEMO) { try { s = await API.getDraft(d); } catch (e) { console.warn("draft", e); } }
    if (l && s) return new Date(l.at) > new Date(s.at) ? l : s; return l || s;
  },
  async drop(d) { this.dropLocal(d); try { await API.deleteDraft(d); } catch { } }
};

async function vClosing(v) {
  const t = today(); let date = S.lastBal && S.lastBal < t ? stepDay(S.lastBal, 1) : t;
  if (date > t) date = t;
  const searchLabel = bi("ব্যাংক অ্যাকাউন্ট খুঁজুন", "Search bank accounts");
  const reviews = [["all", bi("সব A/C", "All accounts")], ["mv", bi("লেনদেন", "Activity")], ["diff", bi("অমিল", "Differences")], ["remarks", bi("মন্তব্য বাকি", "Remarks needed")]];
  v.innerHTML = head("ব্যাংক ক্লোজিং", `<a class="btn cb-action cb-account-link" id="c-account-link" href="#/accounts">${ico("card")}<span class="lb">${bi("অ্যাকাউন্ট", "Account")}</span></a><a class="btn cb-action" id="c-report-link" href="#/reports">${ico("chart")}<span class="lb">${bi("রিপোর্ট", "Report")}</span></a><a class="btn cb-action cb-summary-link" id="c-summary-link" href="#/cashchk">${ico("list")}<span class="lb">${bi("সামারি", "Summary")}</span></a>`, "bc-head") + `<div class="card tbar navcard bc-controls">${dateNav("c", date)}
    ${searchBox("c-q", bi("কোড, হোল্ডার, ব্যাংক, A/C নং…", "Code, holder, bank, A/C no…"))}
    <div class="bc-filters" role="group" aria-label="${bi("অ্যাকাউন্ট ফিল্টার", "Account filters")}" hidden>${reviews.map(([key, label]) => `<button type="button" class="btn sm" data-review="${key}" aria-pressed="${key === "all"}">${label} <span class="bc-count"></span></button>`).join("")}</div>
    <div class="bc-context" hidden><div id="c-msg" role="status" hidden></div><div id="c-linked"></div></div></div>
    <div id="c-body" class="bc-workspace"><div class="card empty">${bi("লোড হচ্ছে…", "Loading…")}</div></div>`;
  const body = $("#c-body", v), query = $("#c-q", v), msg = $("#c-msg", v);
  const context = $(".bc-context", v), linked = $("#c-linked", context), filters = $(".bc-filters", v);
  const reviewButtons = $$("[data-review]", filters);
  $("#c-report-link", v).onclick = () => sessionStorage.setItem("nabiad_bank_report_date", date);
  $("#c-summary-link", v).onclick = () => sessionStorage.setItem("nabiad_cash_date", date);
  query.setAttribute("aria-label", searchLabel);
  $("#c-d", v).setAttribute("aria-label", bi("ক্লোজিংয়ের তারিখ", "Closing date"));
  const dateControls = ["#c-p", "#c-d", "#c-n"].map(s => $(s, v));
  let autoT, pendingDraft, revision = 0, saving = false, review = "all";
  let statusToast, draftState, gapToastKey;
  const notifyStatus = (message, kind = "info") => {
    statusToast?.remove();
    statusToast = toast(message, kind);
    statusToast.setAttribute("role", kind === "err" ? "alert" : "status");
  };
  const setDraftState = (state, message, kind) => {
    if (draftState === state && !message) return;
    draftState = state;
    notifyStatus(message || (state === "local"
      ? bi("ড্রাফট · এই ডিভাইস", "Draft · This device")
      : bi("ড্রাফট · সার্ভারে সেভ", "Draft · Saved online")), kind);
  };
  function flushDraft() {
    clearTimeout(autoT);
    if (!pendingDraft) return;
    const stored = Draft.saveLocal(pendingDraft.date, pendingDraft.rows);
    pendingDraft = null;
    return stored;
  }
  async function draw(saved = false) {
    if (saving) return;
    const date = $("#c-d", v).value;
    if (!date) return;
    flushDraft();
    const id = ++revision, current = () => id === revision && body.isConnected;
    statusToast?.remove();
    draftState = null;
    query.oninput = null;
    context.hidden = filters.hidden = true;
    body.innerHTML = `<div class="card empty">${bi("লোড হচ্ছে…", "Loading…")}</div>`;
    let prev, ex;
    try { if (!navigator.onLine && !DEMO) throw new Error("offline"); [prev, ex] = await Promise.all([API.prevBalances(date), API.balancesOn(date)]); ex = { ...ex, ...pendingBal(date) }; }
    catch (e) {
      if (!current()) return;
      if (!isNetErr(e) && e.message !== "offline") {
        body.innerHTML = `<div class="card"><div class="alert rd">${bi("ব্যালেন্স লোড হয়নি।", "Could not load balances.")} ${esc(e.message || "")}</div><button class="btn" id="c-retry">${bi("আবার চেষ্টা করুন", "Retry")}</button></div>`;
        $("#c-retry", body).onclick = () => draw();
        return;
      }
      const pds = pendingBalDates().filter(x => x < date).sort(), pd = pds.pop();
      prev = pd && (!S.snap || pd > S.snap.date) ? { date: pd, map: pendingBal(pd) } : S.snap && S.snap.date < date ? { date: S.snap.date, map: S.snap.map } : { date: null, map: {} };
      ex = pendingBal(date);
      if (!prev.date) { body.innerHTML = `<div class="alert am">ইন্টারনেট নেই এবং আগের দিনের ব্যালেন্স এই ডিভাইসে জমা নেই। একবার অনলাইনে ক্লোজিং পাতা খুললে পরে অফলাইনেও চলবে।</div>`; return; }
    }
    if (!current()) return;
    const has = Object.values(ex).some(r => r.total != null);
    const canEdit = moduleCan("bank", "edit", false), canEntry = moduleCan("bank", "entry");
    const accs = S.accounts.filter(a => a.daily && (a.status === "Active" || ex[a.code]) && (!has || canEntry || ex[a.code]?.total != null)).sort((a, b) => String(a.bank || "~").localeCompare(String(b.bank || "~"), "en", { sensitivity: "base" }) || String(a.code).localeCompare(String(b.code), "en", { numeric: true, sensitivity: "base" })); /* bank A–Z, then A/C code A–Z */
    const locked = has ? !canEdit || Object.values(ex).some(r => r.pending) : !canEntry;
    const draft = has ? null : await Draft.get(date); const dr = draft?.rows || {};
    /* Debit/Withdraw ← Cash Checker "Total Bank" · Credit/Deposit ← approved Collection + Cash Checker "Bank" (per A/C, this date) */
    const [ce, colRows] = await Promise.all([cashEff(date), API.dcolRange(date, date).catch(() => null)]);
    if (!current()) return;
    const srcOk = ce.ok && colRows !== null, aDr = cashAccSum(ce.src, "bank_in"), aCb = cashAccSum(ce.src, "bank_out"), aCc = {};
    (colRows || []).forEach(r => { if (r.date === date && r.status === "approved" && r.account) aCc[r.account] = (aCc[r.account] || 0) + (+r.amount || 0); });
    const gap = prev.date ? workGap(prev.date, date) : 0;
    const queued = Object.values(ex).some(r => r.pending);
    if (draft) draftState = DEMO || draft.local ? "local" : "online"; /* passive: no popup on page open */
    else if (queued) notifyStatus(bi("ফাইনাল · সিঙ্ক বাকি", "Final · Pending sync"));
    else if (saved) notifyStatus(bi("ক্লোজিং সেভ হয়েছে", "Closing saved"), "ok");
    const msgs = [];
    if (saved) msgs.push(`<div class="alert gr bc-notice"><span>${queued ? bi("এই ডিভাইসে সেভ হয়েছে", "Saved on this device") : bi("ক্লোজিং সেভ হয়েছে", "Closing saved")}</span>${queued ? "" : `<a class="btn sm" href="#/crep" data-go="crep">${ico("img")} ${bi("ব্যালেন্স স্ন্যাপশট", "Balance Snapshot")}</a>`}</div>`);
    if (has && !queued) msgs.push(`<div class="alert ${locked ? "rd" : "am"}">${locked ? "🔒 " + bi("এই তারিখের ব্যালেন্স ফাইনাল সেভ হয়েছে। বদলাতে Admin কে বলুন।", "This date is finalized. Ask an Admin to change it.") : "⚠ " + bi("এই তারিখ ফাইনাল সেভ আছে। সেভ করলে নতুন মান বসবে।", "This date is already finalized. Saving will replace the values.")}</div>`);
    if (statusToast?.dataset.gap) statusToast.remove();
    if (!has && prev.date && gap && gapToastKey !== date) {
      gapToastKey = date; /* once per opened date, replaces the previous popup: a short popup instead of a permanent line */
      notifyStatus(`${bi("আগের ডাটা:", "Previous data:")} ${dmy(prev.date)} · ${bi("মাঝে " + gap + " কর্মদিবসের ডাটা নেই", gap + " working days of data missing in between")}`, "err");
      statusToast.dataset.gap = "1";
    }
    if (draft && !locked) msgs.push(`<div class="alert vi bc-notice"><span>${bi("ড্রাফট লোড হয়েছে", "Draft loaded")} · ${esc(draft.by || "")} · ${new Date(draft.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span><button type="button" class="btn sm" id="c-dd">${bi("ড্রাফট বাদ দিন", "Discard draft")}</button></div>`);
    if (isFri(date) && !has) msgs.push(`<div class="alert am">${bi("শুক্রবার — সাধারণত ব্যাংক বন্ধ থাকে। দরকার না হলে \"পরের ›\" চাপুন।", "Friday — banks are usually closed. Press \"Next ›\" if you do not need this day.")}</div>`);
    if (!srcOk) msgs.push(`<div class="alert am">⚠ ${bi("লিংক করা ডাটা পুরোপুরি লোড হয়নি। ফাইনাল সেভের আগে হিসাব মতে ব্যালেন্স যাচাই করুন।", "Some linked data could not load. Review the expected balance before finalizing.")}</div>`);
    msg.innerHTML = msgs.join("");
    msg.hidden = !msgs.length;
    const discard = $("#c-dd", msg);
    if (discard) discard.onclick = async () => {
      if (saving || !ask("এই তারিখের ড্রাফট মুছে আগের দিনের ক্লোজিং থেকে নতুন করে শুরু করবেন?")) return;
      setBusy(true);
      try {
        await API.deleteDraft(date);
        pendingDraft = null;
        clearTimeout(autoT);
        Draft.dropLocal(date);
      } catch (e) {
        if (current()) toast(bi("ড্রাফট বাদ দেওয়া যায়নি। আবার চেষ্টা করুন।", "Could not discard the draft. Try again."), "err");
        return;
      } finally { setBusy(false); }
      if (current()) draw();
    };
    const rows = accs.map(a => {
      const p = prev.map[a.code] || {}, e = ex[a.code] || {}, d = dr[a.code] || {};
      const src = has ? e : d;
      return { a, code: a.code, holder: a.holder, prevT: p.total || 0, prevB: p.block || 0, adr: aDr[a.code] || 0, acc: aCc[a.code] || 0, acb: aCb[a.code] || 0, od: src.od || 0, odp: src.odp || 0,
        total: has ? e.total : (d.tot ?? null), block: has ? (e.block ?? 0) : (d.blk ?? p.block ?? 0), remark: src.remark ?? src.rem ?? "" };
    });
    const B = a => brandOf(a);
    const mapped = new Set(accs.map(a => a.code)), lost = (m, skip) => Object.entries(m).filter(([c]) => !mapped.has(c) && !(skip && skip(c))).reduce((q, [, x]) => q + x, 0);
    const lostDr = lost(aDr), lostCb = lost(aCb), lostCc = lost(aCc, c => String(c).trim().toLowerCase() === "cash");
    const linkedTotal = field => rows.reduce((sum, row) => sum + row[field], 0);
    const amount = (ok, field) => ok ? "৳ " + money(linkedTotal(field)) : "—";
    const stTxt = !ce.ok ? (ce.src ? bi("এই ডিভাইসের ড্রাফট", "Local draft") : bi("ডাটা পাওয়া যায়নি", "Unavailable")) : ce.state === "final" ? bi("ফাইনাল", "Final") : ce.state === "draft" ? bi("ড্রাফট", "Draft") : bi("এন্ট্রি নেই", "No entry");
    const linkBox = `<div class="clink"><div class="cl-h"><b>${bi("লিংক করা লেনদেন", "Linked transactions")}</b></div>
      <div class="cl-g"><span class="c-dr"><i>${bi("ডেবিট", "Debit")}</i><em>${bi("ক্যাশ চেকার", "Cash Checker")} · ${stTxt}</em><b class="num">${amount(ce.ok || ce.src, "adr")}</b></span><span class="c-cr"><i>${bi("ক্রেডিট", "Credit")}</i><em>${bi("অনুমোদিত কালেকশন", "Approved Collection")}</em><b class="num">${amount(colRows !== null, "acc")}</b></span><span class="c-cr"><i>${bi("ক্রেডিট", "Credit")}</i><em>${bi("ক্যাশ চেকার", "Cash Checker")}</em><b class="num">${amount(ce.ok || ce.src, "acb")}</b></span></div>
      ${lostDr || lostCb || lostCc ? `<div class="cl-w">${bi("দৈনিক ক্লোজিংয়ের A/C-তে লিংক হয়নি", "Unlinked to a daily-closing account")} · ${[lostDr ? `Cash Checker debit ৳ ${money(lostDr)}` : "", lostCb ? `Cash Checker credit ৳ ${money(lostCb)}` : "", lostCc ? `Collection ৳ ${money(lostCc)}` : ""].filter(Boolean).join(" · ")}</div>` : ""}</div>`;
    linked.innerHTML = linkBox;
    context.hidden = false;
    const tiles = [[4, bi("মোট ক্লোজিং", "Closing total")], [3, bi("হিসাব মতে", "Expected balance")], [5, bi("ব্লক / লিয়েন", "Blocked / lien")], [6, bi("ব্যবহারযোগ্য", "Usable balance")]];
    const autoDr = r => r.adr ? `<span><em>${bi("ক্যাশ চেকার", "Cash Checker")}</em> <b class="num">${money(r.adr)}</b></span>` : `<span class="mut">—</span>`;
    const autoCr = r => (r.acc || r.acb) ? `${r.acc ? `<span><em>${bi("কালেকশন", "Collection")}</em> <b class="num">${money(r.acc)}</b></span>` : ""}${r.acb ? `<span><em>${bi("ক্যাশ জমা", "Cash dep.")}</em> <b class="num">${money(r.acb)}</b></span>` : ""}` : `<span class="mut">—</span>`;
    body.innerHTML = `<div class="bc-summary" aria-label="${bi("দিনের মোট", "Daily totals")}">${tiles.map(([i, label]) => `<div class="card bc-kpi" data-kpi="${i}"><span>${label}</span><strong class="num"></strong></div>`).join("")}</div>
    <section class="card bc-register" aria-label="${bi("অ্যাকাউন্ট পর্যালোচনা", "Account review")}">
    <div class="bc-review">${locked ? "" : `<button type="button" class="bc-info" id="c-tip" aria-expanded="false" aria-controls="c-extra-help">${ico("info")}<span>${bi("টিপ", "Tip")}</span></button>`}<span class="bc-dt" id="c-dt">${new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span><span class="mut sm" id="c-shown" role="status"></span>${locked ? "" : `<div class="bc-tip" id="c-extra-help" role="tooltip" hidden><p>${bi("অতিরিক্ত ডেবিট বা ক্রেডিট দিতে আগে ওই A/C-এর ব্যাংক ক্লোজিং লিখুন।", "Enter the account’s Bank Closing amount to enable extra debit and credit.")}</p><p>${bi("সরাসরি হিসাব লেখা যায়: 4,93,582+500 বা 1,20,000-10000", "You can type a sum directly: 4,93,582+500 or 1,20,000-10000")}</p></div>`}</div>
    <div id="c-empty" class="empty" hidden>${bi("এই ফিল্টারে কোনো অ্যাকাউন্ট নেই", "No accounts match these filters")}</div>
    <div class="tw cards closing bc-table"><table id="ct"><thead><tr><th>#</th><th>A/C</th><th class="r">আগের ক্লোজিং</th><th class="r c-dr">${bi("ডেবিট / উত্তোলন", "Debit / Withdraw")}</th><th class="r c-cr">${bi("ক্রেডিট / জমা", "Credit / Deposit")}</th><th class="r">হিসাব মতে</th><th class="r c-bk">ব্যাংক ক্লোজিং</th><th class="r">${bi("ব্লক", "Block")}</th><th class="r">${bi("ব্যবহারযোগ্য", "Usable")}</th><th class="r">${bi("অমিল", "Diff")}</th><th>মন্তব্য</th></tr></thead><tbody>
    ${rows.map((r, i) => { const b = B(r.a); const bk = r.a.bank || bi("অন্যান্য", "Other"), first = i === 0 || (rows[i - 1].a.bank || "") !== (r.a.bank || ""); const gh = first ? `<tr class="gh"><td colspan="11" data-l=""><b>${esc(bk)}</b> <span class="gn">${rows.filter(y => (y.a.bank || "") === (r.a.bank || "")).length}</span></td></tr>` : ""; return gh + `<tr data-i="${i}" style="--b1:${b.c1}"><td class="mut">${i + 1}</td><td class="acc-c" style="--b1:${b.c1}"><b>${esc(r.code)}</b> <span class="mvdot" aria-label="${bi("লেনদেন", "Activity")}" hidden>●</span><div class="mut sm">${esc(r.holder)}</div></td><td class="r num">${money(r.prevT)}</td>
     <td class="c-dr"><div class="au">${autoDr(r)}</div><input class="cell od" ${locked ? "" : 'aria-describedby="c-extra-help"'} aria-label="${esc(r.code)} · ${bi("অতিরিক্ত ডেবিট", "Additional debit")}" value="${fmtIn(r.od || "")}" inputmode="decimal" placeholder="${bi("অতিরিক্ত", "Extra")}" ${locked ? "disabled" : ""}><div class="eff num"></div></td>
     <td class="c-cr"><div class="au">${autoCr(r)}</div><input class="cell odp" ${locked ? "" : 'aria-describedby="c-extra-help"'} aria-label="${esc(r.code)} · ${bi("অতিরিক্ত ক্রেডিট", "Additional credit")}" value="${fmtIn(r.odp || "")}" inputmode="decimal" placeholder="${bi("অতিরিক্ত", "Extra")}" ${locked ? "disabled" : ""}><div class="eff num"></div></td>
     <td class="r num exp"></td><td class="c-bk"><input class="cell tot" aria-label="${esc(r.code)} · ${bi("ব্যাংক ক্লোজিং", "Bank closing")}" value="${r.total == null ? "" : fmtIn(r.total)}" data-dirty="${r.total == null ? "" : "1"}" inputmode="decimal" ${locked ? "disabled" : ""}></td><td><input class="cell blk" aria-label="${esc(r.code)} · ${bi("ব্লক", "Blocked amount")}" value="${fmtIn(r.block || "")}" inputmode="decimal" ${locked ? "disabled" : ""}></td>
     <td class="r num usa b"></td><td class="r num dif"></td><td><input class="cell t rem" aria-label="${esc(r.code)} · ${bi("মন্তব্য", "Remarks")}" value="${esc(r.remark)}" ${locked ? "disabled" : ""}></td></tr>`; }).join("")}
    <tr class="tot"><td></td><td>মোট <span class="mut sm" id="T-n"></span></td><td class="r num" id="T0"></td><td class="r num c-dr" id="T1"></td><td class="r num c-cr" id="T2"></td><td class="r num" id="T3"></td><td class="r num c-bk t-bank" id="T4"></td><td class="r num" id="T5"></td><td class="r num t-usa" id="T6"></td><td class="r num t-diff" id="T7"></td><td></td></tr></tbody></table></div>
    ${locked || !rows.length ? "" : `<div class="cbar entry-actions"><label class="bc-bsrch">${ico("search")}<input id="c-bq" type="search" autocomplete="off" placeholder="${bi("খুঁজুন — কোড, হোল্ডার, ব্যাংক", "Search code, holder, bank")}" aria-label="${bi("অ্যাকাউন্ট খুঁজুন", "Search accounts")}"></label><div class="bc-bartot" id="c-bartot" aria-live="off"><span class="bt-n">${bi("মোট", "Total")} <b id="bt-n"></b></span><span>${bi("ক্লোজিং", "Closing")} <b id="bt-4" class="num"></b></span><span>${bi("ব্যবহারযোগ্য", "Usable")} <b id="bt-6" class="num bt-usa"></b></span><span>${bi("অমিল", "Diff")} <b id="bt-7" class="num"></b></span></div><button type="button" class="btn lg fix" id="c-preview">${ico("eye")} <span>${bi("প্রিভিউ", "Preview")}</span></button>${has ? "" : `<button type="button" class="btn lg fix" id="c-draft">${ico("edit")} <span data-save-label>${bi("ড্রাফট সেভ", "Save draft")}</span></button>`}<button type="button" class="btn pri lg fix" id="c-save">${ico("save")} <span data-save-label>${bi("সেভ", "Save")}</span></button><div class="hint" id="c-err" role="alert"></div></div>`}
    </section>`;
    [...$$("[data-go]", body), ...$$("[data-go]", msg)].forEach(a => a.onclick = () => {
      const key = {crep: "nabiad_crep_date"}[a.dataset.go];
      if (key) sessionStorage.setItem(key, date);
    });
    const trs = $$("#ct tbody tr[data-i]", body);
    const stats = $$("[data-kpi]", body);
    const cells = trs.map(tr => ({
      tr, r: rows[+tr.dataset.i], odI: $(".od", tr), odpI: $(".odp", tr), ti: $(".tot", tr),
      blkI: $(".blk", tr), remI: $(".rem", tr), eff: $$(".eff", tr), expO: $(".exp", tr),
      usaO: $(".usa", tr), difO: $(".dif", tr), dot: $(".mvdot", tr)
    }));
    const accountKeys = rows.map(({a}) => [a.code, a.holder, a.bank, a.branch, a.acno, a.type].map(chequeSearchKey));
    const needsRemark = r => r._chg && !r._rem;
    const filter = (keepFocus = false) => {
      const q = chequeSearchKey(query.value);
      let visible = 0;
      cells.forEach(({tr, r}, i) => {
        const ok = (!q || accountKeys[i].some(key => key.includes(q))) &&
          (review === "all" || (review === "diff" && r._chg) || (review === "remarks" && needsRemark(r)) || (review === "mv" && r._mv));
        const show = ok || (keepFocus && tr.contains(document.activeElement));
        tr.style.display = show ? "" : "none";
        if (show) visible++;
      });
      $$("#ct tbody tr.gh", body).forEach(gh => { let n = gh.nextElementSibling, any = false; while (n && !n.classList.contains("gh") && !n.classList.contains("tot")) { if (n.style.display !== "none") any = true; n = n.nextElementSibling; } gh.style.display = any ? "" : "none"; });
      $("#c-shown", body).textContent = bi(`${rows.length}টির মধ্যে ${visible}টি`, `${visible} of ${rows.length} accounts`);
      $("#c-empty", body).hidden = visible > 0;
      reviewButtons.forEach(btn => btn.setAttribute("aria-pressed", btn.dataset.review === review));
    };
    const actions = $(".bc-register .cbar", body);
    const validClosing = input => {
      return !!input.dataset.dirty && exprOk(input.value);
    };
    const setExtraInputs = ({odI, odpI, ti}) => {
      odI.disabled = odpI.disabled = saving || locked || !validClosing(ti) || (has && !ti.dataset.edited);
    };
    const setBusy = (busy, button) => {
      saving = busy;
      [...dateControls, ...$$("#c-draft, #c-save, #ct input", body), ...(discard ? [discard] : [])].forEach(el => { el.disabled = busy || (locked && el.matches("#ct input")); });
      cells.forEach(setExtraInputs);
      if (actions) actions.setAttribute("aria-busy", String(busy));
      const label = button && $("[data-save-label]", button);
      if (label) {
        label.dataset.idle ||= label.textContent;
        label.textContent = busy ? bi("সেভ হচ্ছে…", "Saving…") : label.dataset.idle;
      }
    };
    const calc = (keepFocus = false) => {
      const T = Array(8).fill(0), counts = {all: rows.length, mv: 0, diff: 0, remarks: 0};
      cells.forEach(cell => {
        const {tr, r, odI, odpI, ti, blkI, remI, eff, expO, usaO, difO, dot} = cell;
        const closingSet = validClosing(ti);
        const draftDebit = ev(odI.value), draftCredit = ev(odpI.value);
        const od = closingSet ? draftDebit : 0, odp = closingSet ? draftCredit : 0, blk = ev(blkI.value);
        const dr = r.adr + od, cr = r.acc + r.acb + odp, exp = r.prevT - dr + cr;
        if (!ti.dataset.dirty && document.activeElement !== ti) ti.value = fmtIn(exp);
        const tot = closingSet ? ev(ti.value) : exp;
        setExtraInputs(cell);
        const diff = tot - exp, usa = tot - blk, chg = Math.abs(diff) > 0.001;
        const mv = !!(r.adr || r.acc || r.acb || od || odp);
        ti.classList.toggle("chg", chg); blkI.classList.toggle("chg", !same(blk, r.prevB));
        odI.classList.toggle("chg", od !== 0); odpI.classList.toggle("chg", odp !== 0);
        eff[0].textContent = r.adr && od ? "= " + money(dr) : "";
        eff[1].textContent = (r.acc || r.acb) && odp ? "= " + money(cr) : "";
        tr.classList.toggle("chgrow", chg);
        dot.hidden = !mv;
        expO.textContent = money(exp);
        usaO.textContent = money(usa);
        difO.textContent = chg ? money(diff) : "0";
        difO.className = "r num dif " + (chg ? "diffx" : "diff0");
        [r.prevT, dr, cr, exp, tot, blk, usa, diff].forEach((n, i) => T[i] += n);
        Object.assign(r, { _od: od, _odp: odp, _draftDebit: draftDebit, _draftCredit: draftCredit, _tot: tot, _blk: blk, _rem: remI.value.trim(), _chg: chg, _mv: mv, _dirty: closingSet });
        remI.required = chg && !locked;
        remI.setAttribute("aria-invalid", String(needsRemark(r) && !locked));
        counts.mv += Number(mv);
        counts.diff += Number(chg);
        counts.remarks += Number(needsRemark(r));
      });
      T.forEach((n, i) => $("#T" + i, body).textContent = money(n));
      stats.forEach(el => $("strong", el).textContent = "৳ " + money(T[Number(el.dataset.kpi)]));
      $("#T-n", body).textContent = `(${rows.length})`;
      const bt = $("#c-bartot", body); if (bt) { $("#bt-n", bt).textContent = `(${rows.length})`; [4, 6, 7].forEach(i => { $("#bt-" + i, bt).textContent = money(T[i]); }); $("#bt-7", bt).className = "num " + (Math.abs(T[7]) > 0.001 ? "bt-bad" : ""); }
      reviewButtons.forEach(btn => $(".bc-count", btn).textContent = counts[btn.dataset.review]);
      filter(keepFocus);
    };
    const collect = () => Object.fromEntries(rows.map(r => [r.code, { od: r._draftDebit, odp: r._draftCredit, tot: r._dirty ? r._tot : null, blk: r._blk || 0, rem: r._rem || "" }]));
    const autosave = () => {
      if (has || saving) return;
      pendingDraft = {date, rows: collect()};
      clearTimeout(autoT);
      autoT = setTimeout(() => {
        const stored = flushDraft();
        if (!current()) return;
        if (stored) draftState = "local"; /* silent autosave; only failures are announced */
        else if (draftState !== "failed") setDraftState("failed",
          bi("ডিভাইসে ড্রাফট সেভ হয়নি। Save draft চাপুন।", "Could not save on this device. Use Save draft to retry."), "err");
      }, 700);
    };
    /* "= 4,058" under a cell while an expression such as 3,558+500 is being typed */
    const xhint = inp => {
      if (inp.classList.contains("rem")) return;
      let h = inp.parentElement.querySelector(".xr"); const on = document.activeElement === inp && hasOp(inp.value) && exprOk(inp.value);
      if (!on) { h && h.remove(); return; }
      if (!h) { h = document.createElement("div"); h.className = "xr num"; inp.after(h); }
      h.textContent = "= " + money(ev(inp.value));
    };
    $$("#ct input", body).forEach(input => input.addEventListener("input", () => {
      if (input.classList.contains("tot")) {
        input.dataset.dirty = input.value.trim() === "" ? "" : "1";
        input.dataset.edited = "1";
      }
      calc(true);
      xhint(input);
      autosave();
    }));
    $$("#ct .rem", body).forEach(input => input.addEventListener("blur", event => {
      if (!actions?.contains(event.relatedTarget)) filter();
    }));
    $$("#ct input.cell:not(.rem)", body).forEach(inp => {
      inp.addEventListener("focus", () => inp.select());
      inp.addEventListener("blur", event => {
        if (inp.value.trim() !== "" && (!inp.classList.contains("tot") || validClosing(inp))) inp.value = fmtIn(ev(inp.value)); xhint(inp);
        if (!actions?.contains(event.relatedTarget)) calc();
      });
      inp.addEventListener("keydown", e => { if (e.key !== "Enter") return; e.preventDefault(); let tr = inp.closest("tr").nextElementSibling; while (tr && tr.style.display === "none") tr = tr.nextElementSibling; const cls = [...inp.classList].find(c => ["od", "odp", "tot", "blk"].includes(c)); const nx = tr && $("." + cls, tr); if (nx) nx.focus(); });
    });
    const tipB = $("#c-tip", body), tipP = $("#c-extra-help", body);
    if (tipB && tipP) {
      const show = on => { tipP.hidden = !on; tipB.setAttribute("aria-expanded", String(on)); };
      const hov = matchMedia("(hover:hover)").matches;
      tipB.onclick = e => { e.stopPropagation(); show(hov ? true : tipP.hidden); };
      if (hov) { tipB.onmouseenter = () => show(true); tipB.onmouseleave = () => show(false); }
      body.addEventListener("click", e => { if (!tipP.hidden && !tipP.contains(e.target)) show(false); });
      body.addEventListener("keydown", e => { if (e.key === "Escape" && !tipP.hidden) { show(false); tipB.focus(); } });
    }
    const bq = $("#c-bq", body);
    query.oninput = () => { if (bq) bq.value = query.value; filter(); };
    if (bq) { bq.value = query.value; bq.oninput = () => { query.value = bq.value; filter(); }; }
    reviewButtons.forEach(btn => btn.onclick = () => { review = btn.dataset.review; filter(); });
    calc();
    filters.hidden = false;
    if (locked || !rows.length) return;
    const previewBtn = $("#c-preview", body);
    if (previewBtn) previewBtn.onclick = () => {
      calc(); /* refresh so the report shows exactly what is typed right now (saved or not) */
      const list = rows.map(r => ({ a: r.a, total: r._tot || 0, block: r._blk || 0, remark: r._rem || "" }));
      const name = `Bank_Closing_${date}`, canShare = !!navigator.share;
      modal(`<div class="sn-pv"><div class="sn-pvh noprint"><h2>${bi("ডেইলি ব্যাংক ক্লোজিং রিপোর্ট", "Daily Bank Closing Report")}</h2><button type="button" class="btn sm" data-role="close" aria-label="${bi("বন্ধ", "Close")}">${ico("xmark")}</button></div>
        <div class="sn-pvn noprint">${has ? "" : bi("সেভ না করা মান দিয়ে প্রিভিউ — সেভ করলে এটাই ফাইনাল হবে।", "Preview of the values typed now — not saved yet.")}</div>
        <div class="rep-wrap sn-pvb"><div class="rep-scroll"><div id="pv-wrap">${bankRepHtml("pv-rep", date, list, null, null)}</div></div></div>
        <div class="sn-pva noprint"><button type="button" class="btn cb-action sn-png" id="pv-png">${ico("img")}<span>${bi("ছবি", "Image")}</span></button><button type="button" class="btn cb-action sn-pdf" id="pv-pdf">${ico("print")}<span>${bi("প্রিন্ট PDF", "Print PDF")}</span></button>${canShare ? `<button type="button" class="btn cb-action sn-sh" id="pv-sh">${ico("share")}<span>${bi("শেয়ার", "Share")}</span></button>` : ""}</div></div>`, (root, close) => {
        const rep = () => $("#pv-rep", root), T = list.reduce((q, r) => ({ t: q.t + r.total, b: q.b + r.block }), { t: 0, b: 0 });
        $$('[data-role="close"]', root).forEach(b => b.onclick = close);
        const fit = () => dcFit(root, "pv-rep"); fit(); window.addEventListener("resize", fit);
        new MutationObserver(() => { if (!root.isConnected || !rep()) window.removeEventListener("resize", fit); }).observe(root, { childList: true });
        $("#pv-png", root).onclick = () => dcPng(rep(), name);
        $("#pv-pdf", root).onclick = () => dcPdf(rep(), name);
        const sh = $("#pv-sh", root); if (sh) sh.onclick = () => dcShare(rep(), name, `${dmy(date)} Bank Closing — Total ৳ ${money0(T.t)} · Block ${money0(T.b)} · Usable ${money0(T.t - T.b)}`);
      });
    };
    const saveDraft = $("#c-draft", body), saveFinal = $("#c-save", body);
    if (saveDraft) saveDraft.onclick = async () => {
      if (saving) return;
      calc();
      const draftRows = collect();
      pendingDraft = null;
      clearTimeout(autoT);
      const stored = Draft.saveLocal(date, draftRows);
      statusToast?.remove();
      setBusy(true, saveDraft);
      try {
        await API.saveDraft(date, draftRows);
        if (!current()) return;
        setDraftState(DEMO ? "local" : "online", DEMO
          ? bi("ডিভাইসে ড্রাফট সেভ হয়েছে", "Draft saved on this device")
          : bi("সার্ভারে ড্রাফট সেভ হয়েছে", "Draft saved online"), "ok");
      } catch (e) {
        if (!current()) return;
        setDraftState(stored ? "local" : "failed", stored
          ? bi("অনলাইনে সেভ হয়নি। ড্রাফট এই ডিভাইসে সেভ হয়েছে।", "Online save failed. Draft saved on this device.")
          : bi("ড্রাফট সেভ হয়নি। আবার চেষ্টা করুন।", "Draft could not be saved. Try again."), "err");
      } finally { setBusy(false, saveDraft); }
    };
    saveFinal.onclick = async () => {
      if (saving) return;
      calc(); const err = $("#c-err", body); err.className = "hint rd"; err.textContent = "";
      const missing = cells.filter(({r, ti}) => !r._dirty && (ti.dataset.dirty || r._draftDebit || r._draftCredit));
      if (missing.length) {
        err.textContent = bi("সঠিক ব্যাংক ক্লোজিং লিখুন", "Enter a valid Bank Closing amount") + " · " + missing.map(({r}) => r.code).join(", ");
        query.value = ""; review = "all"; filter();
        const closing = missing[0].ti;
        closing.scrollIntoView({block: "center"}); closing.focus();
        return;
      }
      const bad = rows.filter(needsRemark);
      if (bad.length) {
        err.textContent = bi(`অমিলের মন্তব্য দিন · ${bad.map(r => r.code).join(", ")}`, `Add remarks for differences · ${bad.map(r => r.code).join(", ")}`);
        query.value = ""; review = "remarks"; filter();
        const rem = cells[rows.indexOf(bad[0])].remI;
        rem.scrollIntoView({block: "center"}); rem.focus();
        return;
      }
      const tot = rows.reduce((sum, r) => sum + r._tot, 0), blk = rows.reduce((sum, r) => sum + r._blk, 0);
      const nDiff = rows.filter(r => r._chg).length;
      if (!ask(bi(`${dmy(date)} · ফাইনাল সেভ\nক্লোজিং ৳ ${money(tot)} · ব্লক ৳ ${money(blk)} · ব্যবহারযোগ্য ৳ ${money(tot - blk)}\nঅমিল: ${nDiff} / ${rows.length}${!canEdit ? "\nফাইনাল সেভের পর সম্পাদনার অনুমতি লাগবে।" : ""}`, `${dmy(date)} · Final save\nClosing ৳ ${money(tot)} · Blocked ৳ ${money(blk)} · Usable ৳ ${money(tot - blk)}\nDifferences: ${nDiff} / ${rows.length}${!canEdit ? "\nEditing after final save requires Edit access." : ""}`))) return;
      flushDraft();
      statusToast?.remove();
      setBusy(true, saveFinal);
      try {
        await API.saveBalances(date, rows.map(r => ({ code: r.code, total: r._tot, block: r._blk || null, remark: r._rem, od: r._od, odp: r._odp })), has && canEdit);
      } catch (e) {
        err.textContent = e.message || String(e);
        if (current()) toast(e.message || String(e), "err");
        setBusy(false, saveFinal);
        return;
      }
      if (!S.lastBal || date > S.lastBal) S.lastBal = date;
      await Draft.drop(date);
      refreshBadges();
      setBusy(false, saveFinal);
      if (current()) await draw(true);
    };
  }
  bindDateNav(v, "c", () => { review = "all"; return draw(); });
  await draw();
  return () => { ++revision; statusToast?.remove(); flushDraft(); };
}

/* ---------- closing report + account history ---------- */
/* Daily Bank Closing Report card — shared by Balance Snapshot and the Bank Closing preview */
function bankRepHtml(id, date, rows, by, filteredOf) {
  const T = rows.reduce((q, r) => ({ t: q.t + r.total, b: q.b + r.block }), { t: 0, b: 0 }), usaN = rows.filter(r => r.total - r.block > 0).length, filtered = filteredOf != null && filteredOf !== rows.length, all = filteredOf;
  rows.forEach((r, i) => r.n = i + 1);
  return `<div class="rep" id="${id}">
      ${dcHead("Daily Bank Closing Report · ব্যাংক ক্লোজিং রিপোর্ট" + (filtered ? ` · Filtered ${rows.length}/${all}` : ""), date, date)}
      <div class="rep-kpi"><div><span>Accounts</span><b>${rows.length}</b></div><div class="k1"><span>Total Balance</span><b>৳ ${money0(T.t)}</b></div><div class="k2"><span>Block / Lien</span><b>৳ ${money0(T.b)}</b></div><div class="k3"><span>Usable (${usaN} A/C)</span><b>৳ ${money0(T.t - T.b)}</b></div></div>
      <table class="rep-t grp-t"><thead><tr><th class="r">#</th><th>A/C Code</th><th>Account Holder</th><th class="r">Total</th><th class="r bk">Block</th><th class="r us">Usable</th><th>Remarks</th></tr></thead><tbody>
      ${rows.map((r, k) => { const u = r.total - r.block; const bk = r.a.bank || bi("অন্যান্য", "Other"), first = k === 0 || (rows[k - 1].a.bank || "") !== (r.a.bank || ""); const grp = first ? (g => `<tr class="gh"><td></td><td colspan="2"><b>${esc(bk)}</b> <span class="gn">${g.length}</span></td><td class="r num">${money0(g.reduce((x, y) => x + y.total, 0))}</td><td class="r num">${money0(g.reduce((x, y) => x + y.block, 0))}</td><td class="r num">${money0(g.reduce((x, y) => x + y.total - y.block, 0))}</td><td></td></tr>`)(rows.filter(y => (y.a.bank || "") === (r.a.bank || ""))) : ""; return grp + `<tr><td class="n">${r.n}</td><td class="cd"><i class="bdot" style="background:${brandOf(r.a).c1}"></i>${esc(r.a.code)}</td><td class="ho">${esc(r.a.holder)}</td><td class="r num">${money0(r.total)}</td><td class="r num ${r.block ? "bk" : "z"}">${r.block ? money0(r.block) : "—"}</td><td class="r num ${u > 0 ? "us" : "z"}">${u > 0 ? money0(u) : u < 0 ? money0(u) : "0"}</td><td class="rm">${esc(r.remark)}</td></tr>`; }).join("")}
      <tr class="tot"><td></td><td colspan="2">GRAND TOTAL</td><td class="r num">${money0(T.t)}</td><td class="r num">${money0(T.b)}</td><td class="r num">${money0(T.t - T.b)}</td><td></td></tr></tbody></table>
      ${dcFoot(by ? " · Entered by " + esc(by) : "")}</div>`;
}
/* ---------- Account history helpers (period grouping, KPIs, chart) ---------- */
const H_MODES = [["daily", "দৈনিক", "Daily"], ["weekly", "সাপ্তাহিক", "Weekly"], ["monthly", "মাসিক", "Monthly"], ["yearly", "বার্ষিক", "Yearly"], ["fy", "অর্থবছর", "Financial Year"]];
const fyStart = d => { const y = +d.slice(0, 4); return +d.slice(5, 7) >= 7 ? y : y - 1; };   /* Bangladesh financial year: 1 Jul – 30 Jun */
const hKey = (m, d) => m === "daily" ? d : m === "weekly" ? addDays(d, -((new Date(d + "T00:00:00").getDay() + 1) % 7)) : m === "monthly" ? d.slice(0, 7) : m === "yearly" ? d.slice(0, 4) : String(fyStart(d));   /* weeks run Sat–Fri */
function hRange(m) {
  const t = today(), y = +t.slice(0, 4);
  const from = m === "daily" ? addDays(t, -29) : m === "weekly" ? hKey("weekly", addDays(t, -77)) : m === "monthly" ? (() => { const d = new Date(t + "T00:00:00"); d.setMonth(d.getMonth() - 11, 1); return iso(d); })() : m === "yearly" ? `${y - 4}-01-01` : `${fyStart(t) - 4}-07-01`;
  return { from, to: t };
}
const mon3 = d => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { month: "short" }), dm3 = d => `${d.slice(8, 10)} ${mon3(d)}`;
function hLabel(m, k) {
  if (m === "daily") return `${dmy(k)} <i>${new Date(k + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" })}</i>`;
  if (m === "weekly") return `${dm3(k)} – ${dm3(addDays(k, 6))}`;
  if (m === "monthly") return `${mon3(k + "-01")} ${k.slice(0, 4)}`;
  if (m === "yearly") return k;
  return `FY ${k}-${String(+k + 1).slice(2)}`;
}
const compactN = n => { const a = Math.abs(n), s = n < 0 ? "-" : ""; return a >= 1e7 ? s + (a / 1e7).toFixed(2).replace(/\.?0+$/, "") + "Cr" : a >= 1e5 ? s + (a / 1e5).toFixed(1).replace(/\.0$/, "") + "L" : a >= 1e3 ? s + (a / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : s + Math.round(a); };
/* rows: [{date,total,block,remark}] ascending → grouped periods + overall stats. A "txn" = a saved day on which the balance moved. */
function hGroup(rows, m) {
  const gs = [], map = new Map(); let prev = null, moves = 0, deb = 0, cre = 0;
  rows.forEach(r => {
    const k = hKey(m, r.date); let g = map.get(k);
    if (!g) { g = { k, rows: [], moves: 0, deb: 0, cre: 0, hi: -Infinity, lo: Infinity, sum: 0 }; map.set(k, g); gs.push(g); }
    const mv = prev !== null && r.total !== prev ? 1 : 0, df = prev === null ? 0 : r.total - prev; g.moves += mv; moves += mv; if (df > 0) { g.cre += df; cre += df; } else if (df < 0) { g.deb -= df; deb -= df; } prev = r.total;
    g.rows.push(r); g.hi = Math.max(g.hi, r.total); g.lo = Math.min(g.lo, r.total); g.sum += r.total;
  });
  gs.forEach((g, i) => { const last = g.rows[g.rows.length - 1]; g.date = last.date; g.total = last.total; g.block = last.block || 0; g.remark = last.remark || ""; g.avg = g.sum / g.rows.length; g.chg = g.total - (i ? gs[i - 1].total : g.rows[0].total); });
  const tot = rows.map(r => r.total), hi = Math.max(...tot), lo = Math.min(...tot), first = rows[0], last = rows[rows.length - 1];
  return { gs, moves, deb, cre, hi, lo, hiD: rows.find(r => r.total === hi).date, loD: rows.find(r => r.total === lo).date, avg: tot.reduce((a, b) => a + b, 0) / tot.length, first, last, chg: last.total - first.total, pct: first.total ? (last.total - first.total) / Math.abs(first.total) * 100 : null, days: rows.length };
}
const H_G = { W: 640, H: 210, L: 46, R: 12, T: 12, B: 26 };
/* inline SVG area chart over the grouped closings; hover tooltip is wired by hChartBind */
function hChart(gs, m) {
  const { W, H, L, R, T, B } = H_G, n = gs.length, vals = gs.map(g => g.total), use = gs.map(g => g.total - g.block), showUse = false, all = vals;
  let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * .1 || Math.abs(hi) * .05 || 1; hi += pad; lo -= pad; if (lo < 0 && Math.min(...all) >= 0) lo = 0;
  const X = i => L + (n === 1 ? (W - L - R) / 2 : i / (n - 1) * (W - L - R)), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = a => a.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const grid = [0, .25, .5, .75, 1].map(f => { const v = lo + (hi - lo) * f, y = Y(v).toFixed(1); return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="hg"/><text x="${L - 6}" y="${(+y + 3.5).toFixed(1)}" class="ht" text-anchor="end">${compactN(v)}</text>`; }).join("");
  const xl = [...new Set([0, Math.floor((n - 1) / 2), n - 1])].map(i => `<text x="${X(i).toFixed(1)}" y="${H - 7}" class="ht" text-anchor="${n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}">${esc(m === "daily" ? dm3(gs[i].k) : hLabel(m, gs[i].k).replace(/<[^>]+>/g, ""))}</text>`).join("");
  const iHi = vals.indexOf(Math.max(...vals)), iLo = vals.indexOf(Math.min(...vals));
  const dots = n > 1 && iHi !== iLo ? `<circle cx="${X(iHi).toFixed(1)}" cy="${Y(vals[iHi]).toFixed(1)}" r="4" class="hdh"/><circle cx="${X(iLo).toFixed(1)}" cy="${Y(vals[iLo]).toFixed(1)}" r="4" class="hdl"/>` : "";
  const area = n > 1 ? `<path d="${line(vals)}L${X(n - 1).toFixed(1)},${H - B}L${X(0).toFixed(1)},${H - B}Z" fill="url(#hga)"/>` : "";
  return `<div class="sn-chart" data-lo="${lo}" data-hi="${hi}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${bi("ব্যালেন্সের গ্রাফ", "Balance chart")}"><defs><linearGradient id="hga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c3aed" stop-opacity=".28"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></linearGradient><linearGradient id="hgl" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>${grid}${area}${n > 1 ? `<path d="${line(vals)}" class="hl"/>` : ""}${showUse && n > 1 ? `<path d="${line(use)}" class="hu"/>` : ""}${dots}${n === 1 ? `<circle cx="${X(0)}" cy="${Y(vals[0]).toFixed(1)}" r="5" class="hdh"/>` : ""}${xl}<line class="hcur" x1="0" x2="0" y1="${T}" y2="${H - B}"/><circle class="hcd" r="5" cx="0" cy="0"/><rect class="hov" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="hq" hidden></div>${showUse ? `<div class="hlg"><span><i class="l1"></i>${bi("টোটাল", "Total")}</span><span><i class="l2"></i>${bi("ব্যবহারযোগ্য", "Usable")}</span></div>` : ""}</div>`;
}
function hChartBind(root, gs, m, lbl, pre) {
  const box = $(".sn-chart", root); if (!box) return;
  const svg = $("svg", box), tip = $(".hq", box), cur = $(".hcur", svg), cd = $(".hcd", svg), { W, H, L, R, T, B } = H_G, n = gs.length, lo = +box.dataset.lo, hi = +box.dataset.hi;
  const move = e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, i = n === 1 ? 0 : Math.round(Math.min(1, Math.max(0, (x - L) / (W - L - R))) * (n - 1)), g = gs[i];
    const cx = L + (n === 1 ? (W - L - R) / 2 : i / (n - 1) * (W - L - R)), cy = T + (1 - (g.total - lo) / (hi - lo)) * (H - T - B);
    cur.setAttribute("x1", cx); cur.setAttribute("x2", cx); cd.setAttribute("cx", cx); cd.setAttribute("cy", cy); cur.style.opacity = cd.style.opacity = 1;
    tip.hidden = false; tip.innerHTML = `<b>${hLabel(m, g.k)}</b><span>${lbl || bi("ব্যালেন্স", "Balance")} <strong>${pre ?? "৳ "}${money0(g.total)}</strong></span>${g.deb ? `<span>${bi("ডেবিট", "Debit")} ${money0(g.deb)}</span>` : ""}${g.cre ? `<span>${bi("ক্রেডিট", "Credit")} ${money0(g.cre)}</span>` : ""}`;
    const tw = tip.offsetWidth; tip.style.left = Math.min(r.width - tw - 4, Math.max(4, cx / W * r.width - tw / 2)) + "px";
  };
  const out = () => { tip.hidden = true; cur.style.opacity = cd.style.opacity = 0; };
  const ov = $(".hov", svg); ov.addEventListener("pointermove", move); ov.addEventListener("pointerdown", move); ov.addEventListener("pointerleave", out);
}

async function vCrep(v) {
  let date = sessionStorage.getItem("nabiad_crep_date") || S.lastBal || today(); sessionStorage.removeItem("nabiad_crep_date");
  const canShare = !!navigator.share;
  v.innerHTML = head("ব্যাংক সামারি", `<button class="btn cb-action sn-png" id="r-png">${ico("img")}<span class="lb">${bi("ছবি", "Image")}</span></button><button class="btn cb-action sn-pdf" id="r-pdf">${ico("print")}<span class="lb">PDF</span></button><button class="btn cb-action sn-xl" id="r-xl">${ico("dl")}<span class="lb">Excel</span></button>${canShare ? `<button class="btn cb-action sn-sh" id="r-sh">${ico("share")}<span class="lb">${bi("শেয়ার", "Share")}</span></button>` : ""}`, "sn-head") + `
   <div class="sn-split">
   <div class="card noprint sn-hist"><div class="sn-hh"><div><h3>${bi("অ্যাকাউন্ট ইতিহাস", "Account history")}</h3><p class="mut sm">${bi("যেকোনো অ্যাকাউন্টের ব্যালেন্সের ধারা", "Balance trend of any account")}</p></div><button type="button" class="btn sm sn-hx" id="h-xl" title="Excel">${ico("dl")}<span>Excel</span></button></div>
    <div class="sn-acw">${ico("search")}<input class="in" id="h-ac" autocomplete="off" placeholder="${bi("A/C কোড, হোল্ডার বা ব্যাংক খুঁজুন", "Search A/C code, holder or bank")}"><button type="button" class="sn-clr" id="h-clr" hidden aria-label="${bi("মুছুন", "Clear")}">${ico("xmark")}</button></div>
    <div class="sn-top" id="h-top"></div>
    <div class="sn-hrow"><div class="sn-hp"><label class="f" for="h-m">${bi("সময়কাল", "Period")}</label><select class="in" id="h-m">${H_MODES.map(([k, b, e]) => `<option value="${k}">${bi(b, e)}</option>`).join("")}</select></div><div><label class="f" for="h-f">${bi("থেকে", "From")}</label><input class="in" type="date" id="h-f" value="${hRange("daily").from}"></div><div><label class="f" for="h-t">${bi("পর্যন্ত", "To")}</label><input class="in" type="date" id="h-t" value="${today()}"></div></div>
    <div id="h-out" class="sn-hout"></div></div>
   <div class="card rep-wrap"><div class="sn-pc noprint"><div class="sn-ph">${bi("অ্যাকাউন্ট প্রিভিউ", "Account Preview")}</div><div class="sn-ctl">${dateNav("r", date)}${searchBox("r-q", bi("খুঁজুন — কোড, হোল্ডার, ব্যাংক…", "Search code, holder, bank"))}</div></div><div class="rep-scroll"><div id="crep"></div></div></div></div>`;
  let data = null, bm = {};
  async function load() { date = $("#r-d", v).value; bm = await balancesOn(date); draw(); }
  function draw() {
    if (!$("#crep", v)) return;   // page already replaced (user navigated away)
    const q = norm($("#r-q", v).value);
    const all = S.accounts.filter(a => a.daily && bm[a.code] && bm[a.code].total != null).sort((a, b) => { const A = String(a.bank || "~"), B = String(b.bank || "~"); return A.localeCompare(B, "en", { sensitivity: "base" }) || String(a.code).localeCompare(String(b.code), "en", { numeric: true, sensitivity: "base" }); }); /* grouped by bank A–Z, then A/C code A–Z (natural order: 2 before 10) */
    const rows = all.filter(a => !q || accHay(a).includes(q)).map(a => ({ n: 0, a, total: bm[a.code].total, block: bm[a.code].block || 0, remark: bm[a.code].remark || "" }));
    rows.forEach((r, i) => r.n = i + 1); const T = rows.reduce((s, r) => ({ t: s.t + r.total, b: s.b + r.block }), { t: 0, b: 0 }); data = { rows, T, filtered: rows.length !== all.length, all: all.length };
    const wd = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" }), dl = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const usaN = rows.filter(r => r.total - r.block > 0).length, by = (bm[all[0]?.code] || {}).by;
    $("#crep", v).innerHTML = rows.length ? bankRepHtml("crep-in", date, rows, by, all.length) : `<div class="empty">${all.length ? "খোঁজার সাথে কিছু মেলেনি" : "এই তারিখে কোনো ব্যালেন্স সেভ নেই"}</div>`;
    fitRep();
  }
  function fitRep() { const el = $("#crep-in", v); if (!el) return; el.style.zoom = ""; const w = el.parentElement.clientWidth - 8; if (w < 794) el.style.zoom = (w / 794).toFixed(3); }
  async function canvas() { const el = $("#crep-in", v); if (!el) { toast("ডাটা নেই", "err"); return null; } await loadScript("vendor/html2canvas.min.js"); const z = el.style.zoom; el.style.zoom = ""; try { return await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", width: el.offsetWidth, windowWidth: 1200 }); } finally { el.style.zoom = z; } }
  const onRs = () => fitRep(); window.addEventListener("resize", onRs);
  bindDateNav(v, "r", load); $("#r-q", v).oninput = draw;
  $("#r-pdf", v).onclick = () => { if (!$("#crep-in", v)) return toast("ডাটা নেই", "err"); document.body.classList.add("print-rep"); const t = document.title; document.title = `Bank_Closing_${date}`; window.print(); document.title = t; setTimeout(() => document.body.classList.remove("print-rep"), 500); };
  $("#r-png", v).onclick = async () => { const cv = await canvas(); if (!cv) return; const a = document.createElement("a"); a.download = `Bank_Closing_${date}.png`; a.href = cv.toDataURL("image/png"); a.click(); };
  $("#r-sh", v) && ($("#r-sh", v).onclick = async () => {
    const cv = await canvas(); if (!cv) return; const blob = await new Promise(r => cv.toBlob(r, "image/png")); const file = new File([blob], `Bank_Closing_${date}.png`, { type: "image/png" });
    const T = data.T, txt = `${dmy(date)} Bank Closing — Total ৳ ${money0(T.t)} · Block ${money0(T.b)} · Usable ${money0(T.t - T.b)}`;
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `Bank Closing ${dmy(date)}`, text: txt }); else await navigator.share({ title: `Bank Closing ${dmy(date)}`, text: txt }); } catch (e) { if (e.name !== "AbortError") toast("শেয়ার করা যায়নি: " + e.message, "err"); }
  });
  $("#r-xl", v).onclick = () => data?.rows.length ? exportXlsx({ Closing: [[dmy2(date), "A/C", "Code", "TOTAL", "BLOCK", "USABLE", "REMARKS"], ...data.rows.map(r => [r.n, r.a.holder, r.a.code, r.total, r.block, r.total - r.block, r.remark]), ["", "TOTAL", "", data.T.t, data.T.b, data.T.t - data.T.b, ""]] }, `Closing_${date}.xlsx`) : toast("ডাটা নেই", "err");
  let hSeq = 0, hData = null, topList = null;
  const hAcItems = () => acItems(true).map(it => { const a = S.accounts.find(x => x.code === it.value), br = brandOf(a); return { ...it, html: `<span class="sgb" style="background:linear-gradient(135deg,${br.c1},${br.c2})"></span><span class="sgn"><b>${esc(it.value)}</b><em>${esc(it.label)}</em></span>` }; });
  const hAc = suggest($("#h-ac", v), hAcItems, it => { if (it) hist(); });
  const hOut = () => $("#h-out", v), mode = () => $("#h-m", v).value;
  async function loadTop() {
    try {
      const rows = await API.historyAll(addDays(today(), -90), today()), by = new Map();
      rows.forEach(r => { if (r.total == null) return; let o = by.get(r.code); if (!o) by.set(r.code, o = { code: r.code, prev: null, moves: 0, flow: 0 }); if (o.prev !== null && r.total !== o.prev) { o.moves++; o.flow += Math.abs(r.total - o.prev); } o.prev = r.total; });
      topList = [...by.values()].filter(o => o.moves > 0 && S.accounts.some(a => a.code === o.code)).sort((a, b) => b.moves - a.moves || b.flow - a.flow).slice(0, 5);
    } catch { topList = []; }
  }
  function renderTop() {
    const box = $("#h-top", v); if (!box) return; const cur = hAc.get()?.value;
    box.innerHTML = topList && topList.length ? `<span class="sn-tl">${ico("trend")}${bi("সবচেয়ে সক্রিয় ৫টি · ৯০ দিন", "Top 5 most active · 90 days")}</span>${topList.map(o => { const br = brandOf(S.accounts.find(a => a.code === o.code)); return `<button type="button" class="sn-chip${o.code === cur ? " on" : ""}" data-c="${esc(o.code)}" aria-pressed="${o.code === cur}" title="${o.moves} ${bi("বার ব্যালেন্স বদলেছে", "balance changes")}"><i style="background:linear-gradient(135deg,${br.c1},${br.c2})"></i><b>${esc(o.code)}</b><em>${o.moves}</em></button>`; }).join("")}` : "";
  }
  function pickAcc(code) { const a = S.accounts.find(x => x.code === code); if (a) hAc.set({ value: a.code, label: a.holder || "", sub: a.bank || "" }); }
  const hMsg = (cls, html) => { hOut().innerHTML = `<div class="sn-hmsg ${cls}">${html}</div>`; };
  async function hist() {
    const my = ++hSeq, it = hAc.get(); $("#h-clr", v).hidden = !$("#h-ac", v).value; renderTop();
    if (!it) { hData = null; return hMsg("", `${ico("search")}<b>${bi("একটি অ্যাকাউন্ট বেছে নিন", "Pick an account")}</b><span>${bi("কোড, হোল্ডার বা ব্যাংকের নাম লিখে খুঁজুন", "Search by code, holder or bank")}</span>`); }
    const a = S.accounts.find(x => x.code === it.value) || { code: it.value }, br = brandOf(a), m = mode();
    hMsg("load", bi("লোড হচ্ছে…", "Loading…"));
    let rows; try { rows = await API.history(a.code, $("#h-f", v).value, $("#h-t", v).value); } catch (e) { if (my === hSeq && hOut()) hMsg("err", esc(e.message || String(e))); return; }
    if (my !== hSeq || !hOut()) return;
    rows = rows.filter(r => r.total != null);
    const strip = `<div class="sn-sel"><span class="sn-bd" style="background:linear-gradient(135deg,${br.c1},${br.c2})">${esc(br.s)}</span><div class="sn-si"><b>${esc(a.code)}</b><span>${esc(a.holder || "")}</span><em>${esc([a.bank, a.branch, a.type].filter(Boolean).join(" · "))}</em></div></div>`;
    if (!rows.length) { hData = null; hOut().innerHTML = strip + `<div class="sn-hmsg">${bi("এই সময়ে কোনো ডাটা নেই", "No data in this period")}</div>`; return; }
    const G = hGroup(rows, m), up = G.chg > 0 ? "up" : G.chg < 0 ? "dn" : "", sg = n => n > 0 ? "+" + money0(n) : n < 0 ? "−" + money0(-n) : "—";
    const kp = [["sn-k1", bi("সর্বশেষ ব্যালেন্স", "Closing"), "৳ " + money0(G.last.total), dmy(G.last.date), ""], ["sn-k2", bi("পরিবর্তন", "Change"), sg(G.chg), (G.pct == null ? "" : (G.pct > 0 ? "+" : "") + G.pct.toFixed(1) + "% · ") + bi("শুরু থেকে", "since start"), up], ["sn-k3", bi("সর্বোচ্চ", "Highest"), money0(G.hi), dmy(G.hiD), "up"], ["sn-k4", bi("সর্বনিম্ন", "Lowest"), money0(G.lo), dmy(G.loD), "dn"], ["sn-k5", bi("গড়", "Average"), money0(G.avg), `${G.days} ${bi("দিন", "days")}`, ""], ["sn-k6", bi("লেনদেন", "Txns"), String(G.moves), bi("ব্যালেন্স বদলেছে", "balance moved"), ""], ["sn-k7", bi("মোট ডেবিট", "Total debit"), money0(G.deb), bi("ব্যালেন্স কমেছে", "balance went down"), "dn"], ["sn-k8", bi("মোট ক্রেডিট", "Total credit"), money0(G.cre), bi("ব্যালেন্স বেড়েছে", "balance went up"), "up"]];
    const mx = Math.max(...G.gs.map(g => g.total), 1), list = [...G.gs].reverse();
    hData = { a, m, G };
    hOut().innerHTML = strip + `<div class="sn-kpis">${kp.map(([c, l, val, sub, t]) => `<div class="sn-kp ${c} ${t}"><span>${l}</span><b>${val}</b><em>${sub}</em></div>`).join("")}</div>` + hChart(G.gs, m) +
      `<div class="tw sn-ht"><table><thead><tr><th>${bi("সময়", "Period")}</th><th class="r">${bi("ক্লোজিং", "Closing")}</th><th class="r">${bi("ডেবিট", "Debit")}</th><th class="r">${bi("ক্রেডিট", "Credit")}</th><th class="r" title="${bi("যতবার ব্যালেন্স বদলেছে", "How many times the balance changed")}">${bi("লেনদেন", "Txns")}</th></tr></thead><tbody>${list.map(g => `<tr><td class="sn-pd">${hLabel(m, g.k)}${m === "daily" && g.remark ? `<small>${esc(g.remark)}</small>` : ""}</td><td class="r num sn-cb" style="--w:${Math.max(2, Math.round(Math.max(0, g.total) / mx * 100))}%">${money0(g.total)}</td><td class="r num ${g.deb ? "dn" : "z"}">${g.deb ? money0(g.deb) : "—"}</td><td class="r num ${g.cre ? "up" : "z"}">${g.cre ? money0(g.cre) : "—"}</td><td class="r num">${g.moves || "—"}</td></tr>`).join("")}</tbody></table></div>`;
    hChartBind(hOut(), G.gs, m);
  }
  $("#h-m", v).onchange = () => { const r = hRange(mode()); $("#h-f", v).value = r.from; $("#h-t", v).value = r.to; hist(); };
  $("#h-f", v).onchange = hist; $("#h-t", v).onchange = hist;
  $("#h-clr", v).onclick = () => { hAc.set(null); $("#h-ac", v).focus(); hist(); };
  $("#h-ac", v).addEventListener("input", () => { $("#h-clr", v).hidden = !$("#h-ac", v).value; });
  $("#h-top", v).onclick = e => { const b = e.target.closest("[data-c]"); if (b) pickAcc(b.dataset.c); };
  $("#h-xl", v).onclick = () => { if (!hData) return toast(bi("আগে একটি অ্যাকাউন্ট বেছে নিন", "Pick an account first"), "err"); const { a, m, G } = hData; exportXlsx({ History: [[a.code + " · " + (a.holder || ""), "Closing", "Debit", "Credit", "Txns"], ...G.gs.map(g => [hLabel(m, g.k).replace(/<[^>]+>/g, ""), g.total, g.deb, g.cre, g.moves]), ["TOTAL / LATEST", G.last.total, G.deb, G.cre, G.moves]] }, `History_${a.code}_${$("#h-f", v).value}_${$("#h-t", v).value}.xlsx`); };
  await load();
  hist();   /* empty prompt first, then default to the most active account */
  loadTop().then(() => { if (!$("#h-top", v)) return; renderTop(); if (!hAc.get() && topList.length) pickAcc(topList[0].code); });
  return () => window.removeEventListener("resize", onRs);
}

/* ---------- reports ---------- */
function periodRange(p) {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth();
  if (p === "today") return [today(), today()];
  if (p === "month") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (p === "last") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (p === "year") return [`${y}-01-01`, `${y}-12-31`];
  return null;
}
/* ---------- v6.35: ONE period picker for every report / summary ----------
   Daily / Weekly / Monthly / Yearly each have  ‹ Prev | running period | Next ›
   Custom = any From → To calendar range. State lives in F: { m, d, f, t }. */
const PB_M = () => [["day", LANG === "en" ? "Daily" : "দৈনিক"], ["week", LANG === "en" ? "Weekly" : "সাপ্তাহিক"], ["month", LANG === "en" ? "Monthly" : "মাসিক"], ["year", LANG === "en" ? "Yearly" : "বার্ষিক"], ["custom", LANG === "en" ? "Custom" : "কাস্টম"]];
const pbInit = (m = "month") => ({ m, d: today(), f: addDays(today(), -29), t: today() });
const pbWeek = d => { const x = new Date(d + "T00:00:00"), off = (x.getDay() + 1) % 7, a = addDays(d, -off); return [a, addDays(a, 6)]; }; /* Sat → Fri */
function pbRange(F) {
  const d = F.d || today();
  if (F.m === "all") return ["0000-01-01", "9999-12-31"];
  if (F.m === "day") return [d, d];
  if (F.m === "week") return pbWeek(d);
  if (F.m === "month") { const y = +d.slice(0, 4), mo = +d.slice(5, 7) - 1; return [iso(new Date(y, mo, 1)), iso(new Date(y, mo + 1, 0))]; }
  if (F.m === "year") return [`${d.slice(0, 4)}-01-01`, `${d.slice(0, 4)}-12-31`];
  const a = F.f || addDays(today(), -29), b = F.t || today(); return a <= b ? [a, b] : [b, a];
}
function pbShift(F, n) {
  const d = F.d || today();
  if (F.m === "day") F.d = addDays(d, n); else if (F.m === "week") F.d = addDays(d, 7 * n);
  else if (F.m === "month") { const x = new Date(d.slice(0, 7) + "-01T00:00:00"); x.setMonth(x.getMonth() + n); F.d = iso(x); }
  else if (F.m === "year") F.d = `${+d.slice(0, 4) + n}-${d.slice(5, 7)}-01`;
}
const pbFmt = d => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
function pbBar(id, F, o = {}) {
  const [a, b] = pbRange(F), yr = +today().slice(0, 4), ys = []; for (let y = yr + 1; y >= 2023; y--) ys.push(y);
  const chips = (o.all ? [["all", bi("সব", "All")]] : []).concat(PB_M()).map(([k, l]) => `<span class="chip ${k === F.m ? "on" : ""}" data-m="${k}">${l}</span>`).join("");
  let mid = "";
  if (F.m === "day") mid = `<input class="in big" type="date" id="${id}pb-d" value="${F.d}">`;
  else if (F.m === "month") mid = `<input class="in big" type="month" id="${id}pb-d" value="${F.d.slice(0, 7)}">`;
  else if (F.m === "year") mid = `<select class="in big" id="${id}pb-d">${ys.map(y => `<option ${y === +F.d.slice(0, 4) ? "selected" : ""}>${y}</option>`).join("")}</select>`;
  else if (F.m === "week") mid = `<label class="pbw in big"><span>${pbFmt(a)} – ${pbFmt(b)} ${b.slice(0, 4)}</span><input type="date" id="${id}pb-d" value="${F.d}"></label>`;
  const nav = F.m === "all" ? "" : F.m === "custom"
    ? `<div class="pbcu"><div><label class="f">From</label><input class="in" type="date" id="${id}pb-f" value="${F.f}"></div><div><label class="f">To</label><input class="in" type="date" id="${id}pb-t" value="${F.t}"></div></div>`
    : `<div class="dnav pbnav"><button class="btn" id="${id}pb-p">‹ ${LANG === "en" ? "Prev" : "আগের"}</button>${mid}<button class="btn" id="${id}pb-n">${LANG === "en" ? "Next" : "পরের"} ›</button></div>`;
  return `<div class="pb${o.all ? " pb6" : ""}" id="${id}"><div class="pbm">${chips}</div>${nav}</div>`;
}
function pbBind(v, id, F, draw, o = {}) {
  const redraw = () => { const h = $(`#${id}`, v); h.outerHTML = pbBar(id, F, o); pbBind(v, id, F, draw, o); draw(); };
  $$(`#${id} .chip`, v).forEach(c => c.onclick = () => {
    const k = c.dataset.m;
    if (k === "all") { F.m = "all"; return redraw(); }
    if (k === F.m) { F.d = today(); if (k === "custom") { F.f = addDays(today(), -29); F.t = today(); } return redraw(); } /* tap the active tab = jump back to the running period */
    if (k === "custom" && F.m === "all") { F.f = addDays(today(), -29); F.t = today(); }
    else if (k === "custom") { const [a, b] = pbRange(F); F.f = a; F.t = b > today() ? today() : b; }
    else if (F.m === "custom") F.d = F.t || today();
    F.m = k; redraw();
  });
  const d = $(`#${id}pb-d`, v);
  if (d) {
    d.onchange = () => { const x = d.value; if (!x) return; F.d = F.m === "month" ? x + "-01" : F.m === "year" ? x + "-01-01" : x; redraw(); };
    $(`#${id}pb-p`, v).onclick = () => { pbShift(F, -1); redraw(); }; $(`#${id}pb-n`, v).onclick = () => { pbShift(F, 1); redraw(); };
  }
  [`${id}pb-f`, `${id}pb-t`].forEach(x => { const e = $("#" + x, v); if (e) e.onchange = () => { F.f = $(`#${id}pb-f`, v).value || F.f; F.t = $(`#${id}pb-t`, v).value || F.t; if (F.f > F.t) { toast(LANG === "en" ? "From date cannot be after To" : "From তারিখ To-এর পরে হতে পারে না", "err"); return; } draw(); }; });
}
function group(arr, kf) { const m = new Map(); arr.forEach(c => { const k = kf(c); if (k === "" || k == null) return; const o = m.get(k) || { k, n: 0, amt: 0 }; o.n++; o.amt += c.amount; m.set(k, o); }); return [...m.values()]; }

/* ---------- cheque books / missing leaves ---------- */
/* parse the printed cover of a cheque book:  "No. IDF 5291201 to No. IDF 5291300"  +  Account Number */
function parseBookCover(text) {
  const T = String(text || "").toUpperCase().replace(/[|,]/g, " ");
  const pairs = [...T.matchAll(/\b([A-Z]{2,5})[\s.:-]*(\d{5,9})\b/g)].map(m => [m[1], +m[2]]);
  let series = "", first = null, last = null;
  if (pairs.length) { series = pairs[0][0]; const same = pairs.filter(x => x[0] === series).map(x => x[1]).sort((x, y) => x - y); first = same[0]; if (same.length > 1 && same[same.length - 1] - first <= 1000) last = same[same.length - 1]; }
  const nums = [...T.matchAll(/\b\d{10,20}\b/g)].map(m => m[0]);
  const acc = S.accounts.find(a => a.acno && nums.includes(String(a.acno).replace(/\D/g, "")));
  return { series, first, last, code: acc ? acc.code : "" };
}
function bookModal(b, after) {
  b = b || { code: "", series: "", first: "", last: "", track: "", status: "Active", note: "" };
  const am = accMap();
  modal(`<h2>${b.id ? bi("বই এডিট", "Edit cheque book") : bi("নতুন চেক বই", "New cheque book")}</h2><div class="modal-body grid book-fields">
   <div><label class="f" for="b-c">A/C Code <span class="mut">(${bi("টাইপ করুন: ibbl, 905, nabiad…", "type: ibbl, 905, nabiad…")})</span></label><div><input class="in big" id="b-c" autocomplete="off" placeholder="IBBL-905"></div><div class="hint" id="b-ach"></div></div>
   <div class="noprint"><label class="btn sm" for="b-ph">${ico("cam")} ${bi("বইয়ের কভার স্ক্যান করে ভরুন", "Scan book cover to auto-fill")}</label><input type="file" id="b-ph" accept="image/*" hidden><div class="mut xs" id="b-ocro" style="margin-top:4px"></div></div>
   <div class="row"><div><label class="f" for="b-s">${bi("সিরিজ (CD/SB…)", "Series (CD/SB…)")}</label><input class="in" id="b-s" value="${esc(b.series || "")}" autocomplete="off" style="text-transform:uppercase"></div><div><label class="f" for="b-st">Status</label><select class="in" id="b-st">${["Active", "Finished", "Lost"].map(s => `<option ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
   <div class="row"><div><label class="f" for="b-f">${bi("প্রথম পাতা", "First leaf")}</label><input class="in" id="b-f" value="${b.first ?? ""}" inputmode="numeric" autocomplete="off"></div><div><label class="f" for="b-l">${bi("শেষ পাতা", "Last leaf")}</label><input class="in" id="b-l" value="${b.last ?? ""}" inputmode="numeric" autocomplete="off"></div></div>
   <div class="chips" id="b-q"><span class="mut xs" style="align-self:center">${bi("পাতার সংখ্যা:", "Leaves:")}</span>${[10, 25, 50, 100].map(n => `<button type="button" class="chip" data-n="${n}" aria-pressed="false">${n}</button>`).join("")}</div>
   <div><label class="f" for="b-t">${bi("ট্র্যাক শুরু — পাতা নং (ঐচ্ছিক)", "Track from — leaf no. (optional)")}</label><div class="row" style="gap:8px"><input class="in" id="b-t" value="${b.track ?? ""}" inputmode="numeric" autocomplete="off" placeholder="${bi("ফাঁকা = প্রথম পাতা থেকে", "empty = from first leaf")}"><button type="button" class="btn sm fix" id="b-t1">${bi("= প্রথম পাতা", "= first leaf")}</button></div>
    <div class="mut xs" style="margin-top:4px">${bi("সিস্টেম চালুর আগে যে পাতাগুলো এন্ট্রি হয়নি সেগুলো মিসিং ধরা এড়াতে এখানে পাতার নম্বর (তারিখ নয়) দিন। ফাঁকা রাখলে প্রথম পাতা থেকেই গোনা হবে।", "To avoid flagging leaves used before go-live as missing, enter a leaf number here (not a date). Leave empty to count from the first leaf.")}</div></div>
   <div id="b-ex" class="mut xs"></div>
   <div id="b-info" class="hint" style="min-height:18px"></div>
   <div><label class="f" for="b-n">${bi("নোট", "Note")}</label><input class="in" id="b-n" value="${esc(b.note || "")}"></div>
   </div><div class="modal-actions"><button class="btn pri" id="b-ok">${bi("সেভ", "Save")}</button>${b.id ? `<button class="btn bad" id="b-dl">${bi("মুছুন", "Delete")}</button>` : ""}<button class="btn" id="b-x">${bi("বাতিল", "Cancel")}</button></div>`, (root, close) => {
    const g = id => $("#" + id, root), digits = x => chequeDigits(x).replace(/[,\s]/g, "");
    const item = a => ({ value: a.code, label: a.holder || "", sub: [a.bank, a.acno].filter(Boolean).join(" · ") });
    const acc = suggest(g("b-c"), () => S.accounts.map(item), it => { hint(); if (it && !b.id) autoNext(it.value); check(); });
    const codeNow = () => { const p = acc.get(); if (p) return p.value; const t = g("b-c").value.trim().toUpperCase().split(/[\s(]/)[0]; return am[t] ? t : ""; };
    function hint() { const a = am[codeNow()]; g("b-ach").innerHTML = a ? `${esc(a.holder || "")} · ${esc(a.bank || "")}${a.branch ? " · " + esc(a.branch) : ""}${a.acno ? " · <b>" + esc(a.acno) + "</b>" : ""}` : ""; const bk = a ? S.books.filter(x => x.code === a.code && x.id !== b.id).sort((x, y) => y.first - x.first) : []; g("b-ex").innerHTML = bk.length ? `${bi("এই অ্যাকাউন্টের বই:", "Books of this account:")} ${bk.map(x => `${esc(x.series || "")} ${x.first}–${x.last ?? "?"} (${x.status})`).join(" · ")}` : ""; }
    function autoNext(code) { /* next book usually continues the previous one */
      const prev = S.books.filter(x => x.code === code && x.last != null).sort((x, y) => y.last - x.last)[0];
      if (prev && !digits(g("b-f").value)) { g("b-s").value = prev.series || ""; g("b-f").value = prev.last + 1; g("b-l").value = prev.last + (prev.last - prev.first + 1); }
    }
    function check() {
      const code = codeNow(), fs = digits(g("b-f").value), ls = digits(g("b-l").value), ts = digits(g("b-t").value), ser = g("b-s").value.trim().toUpperCase();
      const out = (err, msg) => { g("b-info").className = "hint " + (err === 2 ? "rd" : err === 1 ? "am" : "gr"); g("b-info").textContent = msg; g("b-ok").disabled = err === 2; return { err }; };
      if (!code) return out(2, bi("A/C Code বাছুন", "Pick an A/C code"));
      if (!fs) return out(2, bi("প্রথম পাতা দিন", "Enter the first leaf"));
      if (!chequeNumber(fs) || (ls && !chequeNumber(ls))) return out(2, bi("সঠিক পাতার নম্বর দিন", "Enter a valid leaf number"));
      const f = +fs, l = ls ? +ls : null;
      if (l !== null && l < f) return out(2, bi("শেষ পাতা প্রথম পাতার চেয়ে ছোট হতে পারে না", "Last leaf cannot be before the first leaf"));
      if (ts) { if (!/^\d+$/.test(ts)) return out(2, bi("ট্র্যাক শুরুতে পাতার নম্বর দিন — তারিখ নয়", "Track-from needs a leaf number — not a date")); if (+ts < f || (l !== null && +ts > l)) return out(2, bi(`ট্র্যাক শুরু ${f}–${l ?? "?"}-এর মধ্যে হতে হবে`, `Track-from must be between ${f} and ${l ?? "?"}`)); }
      const clash = S.books.find(x => x.code === code && x.id !== b.id && (x.series || "").toUpperCase() === ser && f <= (x.last ?? Infinity) && (l ?? f) >= x.first);
      if (clash) return out(2, bi(`এই অ্যাকাউন্টের আরেকটি বইয়ের সাথে মিলে যাচ্ছে: ${clash.series || ""} ${clash.first}–${clash.last ?? "?"}`, `Overlaps another book of this account: ${clash.series || ""} ${clash.first}–${clash.last ?? "?"}`));
      const n = l !== null ? l - f + 1 : null, used = S.cheques.filter(c => c.code === code && c.no >= f && (l === null || c.no <= l)).length;
      const warn = l !== null && (n > 500 || (fs.length !== ls.length)) ? bi(" · ⚠ সংখ্যা অস্বাভাবিক — মিলিয়ে নিন", " · ⚠ unusual range — please verify") : "";
      $$("#b-q .chip", root).forEach(c => {
        const active = n === +c.dataset.n;
        c.classList.toggle("on", active);
        c.setAttribute("aria-pressed", String(active));
      });
      return out(warn ? 1 : 0, `✔ ${ser ? ser + " " : ""}${f}${l !== null ? "–" + l : ""}${n !== null ? ` · ${n} ${bi("পাতা", "leaves")}` : ""}${used ? ` · ${used} ${bi("টি চেক এই সীমায় আগেই এন্ট্রি আছে", "cheque(s) already posted in this range")}` : ""}${warn}`);
    }
    if (b.code && am[b.code]) acc.setSilent(item(am[b.code])); hint();
    ["b-s", "b-f", "b-l", "b-t"].forEach(id => g(id).addEventListener("input", () => { if (id === "b-s") g(id).value = g(id).value.toUpperCase(); check(); }));
    g("b-c").addEventListener("input", () => { hint(); check(); });
    $$("#b-q .chip", root).forEach(c => c.onclick = () => { const f = +digits(g("b-f").value); if (!f) return toast(bi("আগে প্রথম পাতা দিন", "Enter the first leaf first"), "err"); g("b-l").value = f + +c.dataset.n - 1; check(); });
    g("b-t1").onclick = () => { g("b-t").value = digits(g("b-f").value); check(); };
    g("b-ph").onchange = async function () {
      const f0 = this.files[0]; this.value = ""; if (!f0) return; const box = g("b-ocro"); box.textContent = "🔍 " + bi("পড়া হচ্ছে… (প্রথমবার ~১০ MB ডাউনলোড হতে পারে)", "Reading… (first run downloads ~10 MB)");
      try { const r = parseBookCover((await ocrCheque(f0, p => { box.textContent = "🔍 " + Math.round(p * 100) + "%"; })).text);
        if (r.code) { acc.set(item(am[r.code])); } if (r.series) g("b-s").value = r.series; if (r.first) g("b-f").value = r.first; if (r.last) g("b-l").value = r.last; hint(); check();
        box.textContent = r.first ? bi("পড়া হয়েছে — নিজে মিলিয়ে নিন" + (r.code ? "" : " (A/C নিজে বাছুন)"), "Filled from the photo — please verify" + (r.code ? "" : " (pick the A/C yourself)")) : bi("ছবি থেকে পাতার নম্বর পড়া যায়নি — স্পষ্ট ছবি দিন বা নিজে লিখুন", "Could not read leaf numbers — use a clearer photo or type them");
      } catch (e) { box.textContent = "OCR: " + (e.message || e); }
    };
    g("b-x").onclick = close;
    g("b-ok").onclick = async () => { if (check().err === 2) return; const first = parseInt(digits(g("b-f").value)); try { await API.upsertBook({ id: b.id, code: codeNow(), series: g("b-s").value.trim().toUpperCase(), first, last: parseInt(digits(g("b-l").value)) || null, track: parseInt(digits(g("b-t").value)) || null, status: g("b-st").value, note: g("b-n").value.trim() }); await reload(); close(); after(); toast(bi("সেভ হয়েছে", "Saved")); } catch (e) { toast(e.message, "err"); } };
    g("b-dl") && (g("b-dl").onclick = async () => { const u = bookStats(b).used; if (u) return toast(bi(`এই বইয়ের ${u}টি পাতায় চেক এন্ট্রি আছে — মুছা যাবে না। এর বদলে বইয়ের স্ট্যাটাস Finished বা Lost দিন`, `${u} leaf(s) of this book have cheque entries — it cannot be deleted. Set the book status to Finished or Lost instead.`), "err"); if (!ask(bi("এই বই মুছবেন?", "Delete this book?"))) return; try { await API.deleteBook(b.id); await reload(); close(); after(); } catch (e) { toast(e.message || bi("মোছা যায়নি", "Could not delete"), "err"); } });
    check();
  });
}
let BK_TAB = "books";
const markErr = e => { const m = String(e && e.message || e); return /leaf_in_use/.test(m) ? bi("এই পাতার চেক ইতিমধ্যে এন্ট্রি আছে — মার্ক করা যাবে না", "This leaf already has a cheque entry — it cannot be marked") : /duplicate|23505|unique/i.test(m) ? bi("এই পাতা আগেই মার্ক করা আছে", "This leaf is already marked") : /admin_only|row-level|permission/i.test(m) ? bi("এই কাজের অনুমতি নেই", "Not allowed") : m; };
async function vBooks(v) {
  const admin = S.me.role === "admin";
  const filters = { mode: "all", query: "", sort: "priority", page: 0 };
  const draw = () => {
    if (CUR !== "books") return;
    const canMark = !S.marksOff && (admin || S.me.role === "staff");
    const ledger = bookLedger(), accounts = accMap();
    const rows = S.books.map(b => ({ b, st: bookStats(b, ledger), account: accounts[b.code] }));
    const active = rows.filter(({ b }) => b.status === "Active");
    const open = openMarks().length;
    const groups = [
      ["all", bi("সব বই", "All books"), rows.length],
      ["active", bi("সক্রিয়", "Active"), active.length],
      ["low", bi("পাতা কম", "Low stock"), active.filter(lowBook).length],
      ["missing", bi("হিসাবহীন পাতা", "Missing leaves"), active.reduce((n, r) => n + r.st.missingCount, 0)],
      ["open", bi("ফলো-আপ বাকি", "Open follow-ups"), open]
    ];
    const current = BK_TAB === "books" ? filters.mode : LF_F.st === "open" ? "open" : "";
    v.innerHTML = head(bi("চেক বই ও মিসিং পাতা", "Cheque Books & Missing Leaves"), (canMark ? `<button class="btn ${admin ? "" : "pri"}" id="bk-mk">${ico("flag")} ${bi("পাতা মার্ক করুন", "Mark leaves")}</button>` : "") + (canAddBook() ? `<button class="btn pri" id="bk-add">${ico("plus")} ${bi("নতুন বই", "New book")}</button>` : "")) +
      `<div class="bk-overview" aria-label="${bi("চেক বইয়ের সারাংশ", "Cheque book overview")}">${groups.map(([id, label, n]) => `<button type="button" class="bk-stat" data-bk-mode="${id}" aria-pressed="${id === current}" ${S.marksOff && ["low", "missing", "open"].includes(id) ? "disabled" : ""}><span>${label}</span><strong class="num">${["open", "missing", "low"].includes(id) && S.marksOff ? "—" : money0(n)}</strong></button>`).join("")}</div>
      <div class="pbm bk-tabs"><button type="button" class="chip ${BK_TAB === "books" ? "on" : ""}" data-t="books" aria-pressed="${BK_TAB === "books"}">${bi("চেক বই", "Books")}</button><button type="button" class="chip ${BK_TAB === "leaves" ? "on" : ""}" data-t="leaves" aria-pressed="${BK_TAB === "leaves"}">${bi("পাতার রেজিস্টার", "Leaf register")}</button></div><div id="bk-body"></div>`;
    const show = (tab, focus) => { BK_TAB = tab; draw(); $(focus, v)?.focus({ preventScroll: true }); };
    $$(".bk-tabs .chip", v).forEach(c => c.onclick = () => show(c.dataset.t, `.bk-tabs [data-t="${c.dataset.t}"]`));
    $$("[data-bk-mode]", v).forEach(btn => btn.onclick = () => {
      const mode = btn.dataset.bkMode;
      if (mode === "open") {
        Object.assign(LF_F, { code: "", book: null, kind: "", st: "open", q: "" });
        LF_PF.m = "all";
      } else {
        Object.assign(filters, { mode, page: 0, query: "" });
      }
      show(mode === "open" ? "leaves" : "books", `[data-bk-mode="${mode}"]`);
    });
    if ($("#bk-add", v)) $("#bk-add", v).onclick = () => bookModal(null, draw);
    if ($("#bk-mk", v)) $("#bk-mk", v).onclick = () => leafMarkModal(null, draw);
    if (BK_TAB === "leaves") leafRegister($("#bk-body", v), draw);
    else booksTab($("#bk-body", v), rows, filters, { admin, canMark, draw, show });
  };
  draw();
}
const lowBook = ({ b, st }) => b.status === "Active" && st.remaining !== null && st.remaining <= 10;
const bookRisk = row => row.b.status !== "Active" ? 4 : row.st.missingCount ? 0 : lowBook(row) ? 1 : row.st.remaining === null ? 2 : 3;
function booksTab(host, rows, F, { admin, canMark, draw, show }) {
  const size = 24;
  host.innerHTML = `${S.marksOff ? `<div class="alert am">${bi("পাতার রেজিস্টার লোড হয়নি। বাকি ও হিসাবহীন পাতার সংখ্যা যাচাই করা যায়নি।", "The leaf register could not load. Remaining and missing counts are unavailable.")}</div>` : ""}<div class="card bk-search"><div><label class="f" for="bk-search">${bi("চেক বই খুঁজুন", "Search cheque books")}</label><input class="in" id="bk-search" type="search" value="${esc(F.query)}" placeholder="${bi("A/C, ব্যাংক, সিরিজ বা পাতা নং", "A/C, bank, series or leaf number")}"></div>
    <div><label class="f" for="bk-sort">${bi("সাজান", "Sort by")}</label><select class="in" id="bk-sort"><option value="priority">${bi("অগ্রাধিকার", "Priority")}</option><option value="account">A/C</option><option value="remaining">${bi("কম পাতা আগে", "Fewest leaves left")}</option></select></div></div>
    <p class="mut sm bk-count" id="bk-count" aria-live="polite"></p><div class="bk-cards" id="bk-cards"></div>
    <div class="cq-pager" id="bk-pages" hidden><button class="btn" id="bk-prev" type="button">‹ ${bi("আগের", "Previous")}</button><span class="mut sm" id="bk-page"></span><button class="btn" id="bk-next" type="button">${bi("পরের", "Next")} ›</button></div>`;
  const q = $("#bk-search", host), sort = $("#bk-sort", host), list = $("#bk-cards", host), count = $("#bk-count", host);
  const pager = $("#bk-pages", host), prev = $("#bk-prev", host), next = $("#bk-next", host);
  const byAccount = (a, b) => a.b.code.localeCompare(b.b.code) || b.b.first - a.b.first;
  const byPriority = (a, b) => bookRisk(a) - bookRisk(b) || b.st.missingCount - a.st.missingCount || byAccount(a, b);
  const byRemaining = (a, b) => Number(b.b.status === "Active") - Number(a.b.status === "Active") || (a.st.remaining ?? Infinity) - (b.st.remaining ?? Infinity) || byAccount(a, b);
  const meta = (l, val) => `<div><dt>${l}</dt><dd>${val}</dd></div>`;
  const filtered = () => {
    const key = chequeSearchKey(F.query), tokens = chequeDigits(F.query).split(/\s+/).map(chequeSearchKey).filter(Boolean), serial = chequeNumber(F.query);
    return rows.filter(r => {
      const { b, st, account } = r;
      if (F.mode === "active" && b.status !== "Active" || F.mode === "low" && !lowBook(r) ||
          F.mode === "missing" && (b.status !== "Active" || !st.missingCount)) return false;
      if (!key || (serial >= b.first && serial <= st.end)) return true;
      const hay = chequeSearchKey([b.code, b.series, b.first, b.last, b.status, account?.holder, account?.bank].join(" "));
      return tokens.every(term => { const n = chequeNumber(term); return hay.includes(term) || (n >= b.first && n <= st.end); });
    }).sort(F.sort === "account" ? byAccount : F.sort === "remaining" ? byRemaining : byPriority);
  };
  const paint = () => {
    const visible = filtered(), pages = Math.max(1, Math.ceil(visible.length / size));
    F.page = Math.min(F.page, pages - 1);
    const start = F.page * size, end = Math.min(start + size, visible.length);
    count.textContent = visible.length ? bi(`${visible.length}টির মধ্যে ${start + 1}–${end}টি বই`, `${start + 1}–${end} of ${visible.length} books`) : "";
    pager.hidden = pages <= 1;
    prev.disabled = !F.page; next.disabled = F.page >= pages - 1;
    $("#bk-page", pager).textContent = `${F.page + 1} / ${pages}`;
    list.innerHTML = visible.length ? visible.slice(start, end).map(row => {
      const { b, st, account } = row, id = esc(b.id), active = b.status === "Active";
      const marks = st.hasMarks;
      const missingPreview = st.gaps.slice(0, 4).map(([a, z]) => a === z ? a : `${a}–${z}`).join(", ");
      const left = active && !S.marksOff ? st.remaining : null;
      return `<article class="card bk-card ${S.marksOff ? "" : active && st.missingCount ? "has-gap" : lowBook(row) ? "has-low" : ""}">
        <div class="bk-card-head"><div><h3>${esc(b.code)}${b.series ? ` <span class="mut">· ${esc(b.series)}</span>` : ""}</h3><div class="mut sm">${esc([account?.holder, account?.bank].filter(Boolean).join(" · "))}</div></div>
        <span class="tag ${active ? "ok" : ""}">${esc(b.status)}</span></div>
        <div class="bk-range"><span class="num">${b.first}–${b.last ?? "?"}</span>${!S.marksOff && lowBook(row) ? `<span class="tag bk-low">${bi("পাতা কম", "Low stock")}</span>` : ""}</div>
        <dl class="bk-metrics">${meta(bi("ব্যবহৃত", "Posted"), money0(st.used))}${meta(bi("বাকি", "Left"), left === null ? "—" : money0(left))}${meta(bi("হিসাবহীন", "Missing"), S.marksOff ? "—" : money0(st.missingCount))}</dl>
        ${active && left !== null && st.capacity > 0 ? `<progress class="bk-meter" aria-label="${bi("বাকি পাতা", "Leaves left")}" value="${left}" max="${st.capacity}"></progress>` : ""}
        ${!S.marksOff && st.missingCount ? `<div class="bk-gap sm"><b>${bi("হিসাবহীন পাতা", "Missing leaves")}</b><span class="num">${missingPreview}${st.gaps.length > 4 ? "…" : ""}</span></div>` : ""}
        <details class="bk-details"><summary>${bi("বইয়ের তথ্য", "Book details")}</summary>
          <dl>${meta(bi("ট্র্যাক শুরু", "Tracking from"), st.start)}${meta(bi("সর্বশেষ পোস্ট", "Latest posted"), st.maxUsed ?? "—")}${meta(bi("ট্র্যাক করা মার্ক", "Marks in tracking range"), st.marks.length)}</dl>
          ${b.note ? `<p class="sm">${esc(b.note)}</p>` : ""}
          ${active && b.last == null ? `<p class="mut sm">${bi("শেষ পাতা সেট করলে বাকি পাতার সংখ্যা দেখা যাবে।", "Set the last leaf to display the remaining count.")}</p>` : ""}
        </details>
        ${(admin || marks || (canMark && active && st.missingCount)) ? `<div class="bk-actions">
          ${canMark && active && st.missingCount ? `<button class="btn sm" type="button" data-mk="${id}">${ico("flag")} ${bi("পাতা মার্ক করুন", "Mark missing")}</button>` : ""}
          ${marks ? `<button class="btn sm" type="button" data-lf="${id}">${bi("পাতার রেজিস্টার", "Leaf register")}</button>` : ""}
          ${admin ? `<button class="btn sm" type="button" data-e="${id}">${bi("এডিট", "Edit book")}</button>` : ""}</div>` : ""}
      </article>`;
    }).join("") : `<div class="card empty">${rows.length ? bi("এই ফিল্টারে কোনো বই নেই", "No books match this filter") : bi("এখনো কোনো চেক বই যোগ করা হয়নি", "No cheque books added")}</div>`;
  };
  q.oninput = () => { F.query = q.value; F.page = 0; paint(); };
  sort.value = F.sort;
  sort.onchange = () => { F.sort = sort.value; F.page = 0; paint(); };
  const turn = n => { F.page += n; paint(); count.scrollIntoView({ block: "nearest" }); };
  prev.onclick = () => turn(-1); next.onclick = () => turn(1);
  list.onclick = e => {
    const btn = e.target.closest("button");
    const row = rows.find(r => r.b.id === (btn?.dataset.e || btn?.dataset.mk || btn?.dataset.lf));
    if (!row) return;
    if (btn.dataset.e) bookModal(row.b, draw);
    if (btn.dataset.mk) leafMarkModal(row.b, draw);
    if (btn.dataset.lf) {
      Object.assign(LF_F, { code: row.b.code, book: { first: row.b.first, end: row.st.end }, kind: "", st: "all", q: "" });
      LF_PF.m = "all";
      show("leaves", '.bk-tabs [data-t="leaves"]');
    }
  };
  paint();
}

/* mark leaves: one or many leaves of a book → blank stub / lost / cancelled / unused / other, optional stub photo */
function parseLeafList(txt) {
  const out = new Set(), bad = []; chequeDigits(txt).split(/[,\s;]+/).filter(Boolean).forEach(t => {
    const m = t.match(/^(\d+)(?:[-–](\d+))?$/); if (!m) return bad.push(t);
    const a = +m[1], z = m[2] ? +m[2] : a; if (!Number.isSafeInteger(a) || !Number.isSafeInteger(z) || a < 1 || z < a || z - a > 400) return bad.push(t);
    for (let n = a; n <= z; n++) out.add(n);
  }); return { nos: [...out], bad };
}
function leafMarkModal(book0, after) {
  const books = S.books.filter(b => b.status === "Active"); if (!books.length) return toast(bi("আগে একটি চেক বই যোগ করুন (Admin)", "Add a cheque book first (Admin)"), "err");
  const am = accMap(), st = { photo: null }, sel = new Set(); let kind = "blank";
  modal(`<h2>✂️ ${bi("পাতা মার্ক করুন", "Mark leaves")}</h2>
   <label class="f" for="lm-b">${bi("চেক বই", "Cheque book")}</label><select class="in" id="lm-b">${books.map(b => `<option value="${b.id}" ${book0 && book0.id === b.id ? "selected" : ""}>${esc(b.code)} · ${esc(b.series || "")} ${b.first}–${b.last ?? "?"} · ${esc((am[b.code] || {}).holder || "")}</option>`).join("")}</select>
   <div id="lm-info" class="mut sm" style="margin:6px 0 10px"></div>
   <label class="f">${bi("পাতা বাছুন (ট্যাপ করুন)", "Pick leaves (tap)")}</label><div class="row" style="gap:6px;margin-bottom:6px"><button class="btn sm" style="flex:none" id="lm-all">${bi("এই পাতার নম্বরগুলো বাছুন", "Select this page")}</button><button class="btn sm" style="flex:none" id="lm-none">${bi("কিছু না", "None")}</button></div>
   <div class="lm-chips" id="lm-ch"></div><div class="cq-pager" id="lm-pager" hidden><button type="button" class="btn sm" id="lm-prev" aria-label="${bi("আগের পাতা", "Previous page")}">‹</button><span id="lm-page" class="mut sm"></span><button type="button" class="btn sm" id="lm-next" aria-label="${bi("পরের পাতা", "Next page")}">›</button></div>
   <label class="f" for="lm-x" style="margin-top:10px">${bi("অন্য পাতা (নম্বর বা রেঞ্জ, যেমন 1223, 1230-1235)", "Other leaves (numbers or ranges, e.g. 1223, 1230-1235)")}</label><input class="in" id="lm-x" inputmode="numeric" autocomplete="off" placeholder="5291222, 5291230-5291235">
   <div id="lm-sum" class="b" style="margin:8px 0"></div>
   <label class="f">${bi("কারণ", "Reason")}</label><div class="rsn" id="lm-k">${LK_ORD.map(k => `<button type="button" class="rc ${k === kind ? "on" : ""}" data-k="${k}"><b>${LK[k].ic} ${lkName(k)}</b></button>`).join("")}</div>
   <label class="f" for="lm-n" style="margin-top:10px">${bi("মন্তব্য (ঐচ্ছিক)", "Note (optional)")}</label><input class="in" id="lm-n" placeholder="${bi("যেমন: মুড়ি ফাঁকা, কে নিয়েছে জানা নেই", "e.g. stub is blank, nobody knows who took it")}">
   <label class="f" style="margin-top:10px">${bi("মুড়ির ছবি (ঐচ্ছিক — সব পাতার জন্য একটি)", "Stub photo (optional — one photo for all selected leaves)")}</label>
   <div class="photo-in"><label class="btn" for="lm-pc">${ico("cam")} ${bi("ছবি তুলুন", "Camera")}</label><label class="btn" for="lm-pg">${ico("img")} ${bi("গ্যালারি", "Gallery")}</label><input type="file" id="lm-pc" accept="image/*" capture="environment" hidden><input type="file" id="lm-pg" accept="image/*" hidden><img id="lm-img" class="hide"><button class="btn sm ghost hide" id="lm-px">✕</button></div>
   <div class="modal-actions"><button class="btn pri" id="lm-ok">${ico("save")} ${bi("সেভ", "Save")}</button><button class="btn" id="lm-c">${bi("বাতিল", "Cancel")}</button></div>`, (root, close) => {
    const bk = () => S.books.find(b => b.id === $("#lm-b", root).value), manual = () => parseLeafList($("#lm-x", root).value);
    const get = id => $("#lm-" + id, root), size = 36, limit = 400;
    let page = 0, stats = bookStats(bk());
    const all = () => new Set([...sel, ...manual().nos]);
    const selectedText = () => {
      const n = all().size, m = manual();
      get("sum").textContent = bi(`${n}টি পাতা নির্বাচিত`, `${n} leaves selected`) +
        (m.bad.length ? bi(" · নম্বর বা রেঞ্জ ঠিক করুন", " · Check the number or range format") : "");
    };
    const visible = () => gapPage(stats.gaps, page * size, size);
    const chips = () => {
      const pages = Math.max(1, Math.ceil(stats.missingCount / size));
      get("info").textContent = bi(`${stats.missingCount}টি হিসাবহীন পাতা`, `${stats.missingCount} unaccounted leaves`);
      get("pager").hidden = pages === 1;
      get("prev").disabled = page === 0;
      get("next").disabled = page >= pages - 1;
      get("page").textContent = `${page + 1} / ${pages}`;
      get("all").disabled = !stats.missingCount;
      get("ch").innerHTML = visible().map(n => `<button type="button" class="chip ${sel.has(n) ? "on" : ""}" aria-pressed="${sel.has(n)}" data-n="${n}">${n}</button>`).join("");
      selectedText();
    };
    const add = n => {
      if (sel.size >= limit) return toast(bi("একবারে সর্বোচ্চ ৪০০টি পাতা বাছুন।", "Select up to 400 leaves at a time."), "err");
      sel.add(n);
    };
    get("ch").onclick = e => {
      const chip = e.target.closest("button[data-n]");
      if (!chip) return;
      const n = Number(chip.dataset.n);
      if (sel.has(n)) sel.delete(n); else add(n);
      chip.classList.toggle("on", sel.has(n));
      chip.setAttribute("aria-pressed", sel.has(n));
      selectedText();
    };
    get("b").onchange = () => { sel.clear(); get("x").value = ""; page = 0; stats = bookStats(bk()); chips(); };
    get("x").oninput = selectedText;
    get("prev").onclick = () => { page--; chips(); };
    get("next").onclick = () => { page++; chips(); };
    get("all").onclick = () => {
      const leaves = visible().filter(n => !sel.has(n));
      if (sel.size + leaves.length > limit) return toast(bi("একবারে সর্বোচ্চ ৪০০টি পাতা বাছুন।", "Select up to 400 leaves at a time."), "err");
      leaves.forEach(n => sel.add(n)); chips();
    };
    get("none").onclick = () => { sel.clear(); chips(); };
    chips();
    $$("#lm-k .rc", root).forEach(b => b.onclick = () => { kind = b.dataset.k; $$("#lm-k .rc", root).forEach(x => x.classList.toggle("on", x === b)); });
    photoPicker(root, st, { inp: "lm-pg", cam: "lm-pc", img: "lm-img", x: "lm-px" }); $("#lm-c", root).onclick = close;
    $("#lm-ok", root).onclick = async () => {
      const b = bk(), nos = [...all()].sort((x, y) => x - y), btn = get("ok");
      if (btn.disabled) return;
      const m = manual(); if (m.bad.length) return toast(bi("ভুল ফরম্যাট: ", "Bad format: ") + m.bad.join(", "), "err");
      const bound = bookStats(b).end;
      const out = nos.filter(n => n < b.first || n > bound); if (out.length) return toast(bi(`এই নম্বরগুলো এই বইয়ের বাইরে: ${out.slice(0, 6).join(", ")}`, `These numbers are outside this book: ${out.slice(0, 6).join(", ")}`), "err");
      if (!nos.length) return toast(bi("অন্তত একটি পাতা বাছুন", "Pick at least one leaf"), "err");
      if (nos.length > limit) return toast(bi("একবারে সর্বোচ্চ ৪০০টি পাতা বাছুন।", "Select up to 400 leaves at a time."), "err");
      const posted = new Set(S.cheques.filter(c => c.code === b.code).map(c => c.no));
      const used = nos.filter(n => posted.has(n)); if (used.length) return toast(bi(`এই পাতাগুলোর চেক এন্ট্রি আছে: ${used.slice(0, 6).join(", ")}`, `These leaves already have cheque entries: ${used.slice(0, 6).join(", ")}`), "err");
      const dup = nos.filter(n => markOf(b.code, n)); if (dup.length) return toast(bi(`আগেই মার্ক করা আছে: ${dup.slice(0, 6).join(", ")}`, `Already marked: ${dup.slice(0, 6).join(", ")}`), "err");
      if (nos.length > 20 && !ask(bi(`${nos.length}টি পাতা "${LK[kind].bn}" হিসেবে মার্ক করবেন?`, `Mark ${nos.length} leaves as "${LK[kind].en}"?`))) return;
      btn.disabled = true;
      try {
        let ph = null; if (st.photo) { if (!navigator.onLine && !DEMO) throw new Error(bi("ছবি সেভ করতে ইন্টারনেট লাগবে", "Internet is needed to save the photo")); ph = `leaf/${norm(b.code)}_${nos[0]}_${Date.now().toString(36)}.jpg`; await API.uploadPhoto(ph, st.photo); }
        await API.addMarks(nos.map(no => ({ code: b.code, no, kind, note: $("#lm-n", root).value.trim(), photo: ph })));
        await reload(); close(); Object.assign(LF_F, { code: b.code, book: { first: b.first, end: bookStats(b).end }, kind: "", st: "all", q: "" }); LF_PF.m = "all"; BK_TAB = "leaves"; after?.(); toast(bi(`✔ ${nos.length}টি পাতা মার্ক হয়েছে (${LK[kind].bn})`, `✔ ${nos.length} leaf(s) marked (${LK[kind].en})`));
      } catch (e) { toast(markErr(e), "err"); btn.disabled = false; }
    };
  });
}
function leafResolveModal(m, after) {
  const Q = [["ব্যাংক নিশ্চিত করেছে: উপস্থাপন হয়নি", "Bank confirmed: not presented"], ["Stop Payment দেওয়া হয়েছে", "Stop payment given"], ["খুঁজে পাওয়া গেছে", "Found"], ["ভুলে মুড়ি লেখা হয়নি, চেকটি ব্যবহৃত", "Used, stub was just not filled"]];
  modal(`<h2>${bi("নিষ্পত্তি করুন", "Close this trace")} · ${esc(acLabel(m.code))} · ${esc(leafLabel(m.code, m.no))}</h2><div style="margin-bottom:10px">${lkTag(m.kind)}</div>
   <label class="f">${bi("কীভাবে নিষ্পত্তি হলো?", "How was it settled?")}</label><input class="in" id="lr-n" autocomplete="off"><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">${Q.map((q, i) => `<span class="chip" data-i="${i}">${bi(q[0], q[1])}</span>`).join("")}</div>
   <div class="modal-actions"><button class="btn pri" id="lr-ok">${bi("নিষ্পত্তি", "Close trace")}</button><button class="btn" id="lr-c">${bi("বাতিল", "Cancel")}</button></div>`, (root, close) => {
    $$(".chip", root).forEach(c => c.onclick = () => { $("#lr-n", root).value = bi(Q[+c.dataset.i][0], Q[+c.dataset.i][1]); }); $("#lr-c", root).onclick = close;
    $("#lr-ok", root).onclick = async () => { try { await API.resolveMark(m.id, $("#lr-n", root).value.trim()); await reload(); close(); after && after(); toast(bi("✔ নিষ্পত্তি হয়েছে", "✔ Trace closed")); } catch (e) { toast(markErr(e), "err"); } };
  });
}
function leafPhotoModal(m) {
  modal(`<h2>${esc(acLabel(m.code))} · ${esc(leafLabel(m.code, m.no))}</h2><div style="margin-bottom:8px">${lkTag(m.kind)}</div><div id="lp-i" class="mut">…</div><div class="modal-actions"><button class="btn" id="lp-c">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    $("#lp-c", root).onclick = close;
    API.photoUrl(m.photo).then(u => $("#lp-i", root).innerHTML = `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="stub" style="width:100%;border-radius:12px;border:1px solid var(--line)"></a>`).catch(e => $("#lp-i", root).textContent = bi("ছবি লোড হয়নি: ", "Photo failed to load: ") + (e.message || e));
  });
}
const LF_F = { code: "", book: null, kind: "", st: "all", q: "" }, LF_PF = pbInit("all"), LF_PBO = { all: true };
function leafRegister(host, redraw) {
  const admin = S.me.role === "admin", am = accMap(), F = LF_F, PF = LF_PF;
  const codes = [...new Set([...S.marks.map(m => m.code), F.code].filter(Boolean))].sort();
  let page = 0;
  const size = 40;
  host.innerHTML = `<div class="card tbar noprint">${pbBar("lf", PF, LF_PBO)}<div class="grid g3" style="margin-top:10px;gap:10px">
     <div><label class="f" for="lf-c">A/C</label><select class="in" id="lf-c"><option value="">${bi("সব", "All")}</option>${codes.map(c => `<option ${c === F.code ? "selected" : ""} value="${esc(c)}">${esc(c)} · ${esc((am[c] || {}).holder || "")}</option>`).join("")}</select></div>
     <div><label class="f" for="lf-k">${bi("কারণ", "Reason")}</label><select class="in" id="lf-k"><option value="">${bi("সব", "All")}</option>${LK_ORD.map(k => `<option value="${k}" ${k === F.kind ? "selected" : ""}>${lkName(k)}</option>`).join("")}</select></div>
     <div><label class="f" for="lf-s">${bi("অবস্থা", "State")}</label><select class="in" id="lf-s"><option value="all" ${F.st === "all" ? "selected" : ""}>${bi("সব", "All")}</option><option value="open" ${F.st === "open" ? "selected" : ""}>${bi("খোলা (খুঁজতে হবে)", "Open (to trace)")}</option><option value="done" ${F.st === "done" ? "selected" : ""}>${bi("নিষ্পত্তি", "Closed")}</option></select></div></div>
     <div style="margin-top:10px"><input type="search" class="in" id="lf-q" aria-label="${bi("পাতা খুঁজুন", "Search leaves")}" placeholder="${bi("পাতার নম্বর / মন্তব্য খুঁজুন", "Search leaf no. / note")}" value="${esc(F.q)}"></div></div>
   <div id="lf-scope" class="bk-scope" ${F.book ? "" : "hidden"}><span>${F.book ? bi("বইয়ের সীমা", "Book range") + " · " + F.book.first + "–" + (Number.isFinite(F.book.end) ? F.book.end : "?") : ""}</span><button class="btn sm" type="button" id="lf-unscope">${bi("সব বই দেখুন", "All books")}</button></div>
   <div class="ksum" id="lf-sum"></div><div class="tb-act noprint"><button class="btn" id="lf-x">${ico("dl")} Excel</button><button class="btn" id="lf-p">${ico("print")} ${bi("প্রিন্ট", "Print")}</button></div>
   <p class="mut sm bk-count" id="lf-count" aria-live="polite"></p><div class="bk-cards" id="lf-list"></div>
   <div class="cq-pager" id="lf-pager" hidden><button class="btn" type="button" id="lf-prev">‹ ${bi("আগের", "Previous")}</button><span class="mut sm" id="lf-page"></span><button class="btn" type="button" id="lf-next">${bi("পরের", "Next")} ›</button></div>`;
  const filt = () => { const [a, b] = pbRange(PF), q = chequeDigits(F.q).toLowerCase(); return S.marks.filter(m => (!F.code || m.code === F.code) && (!F.book || (m.no >= F.book.first && m.no <= F.book.end)) && (!F.kind || m.kind === F.kind) && (F.st === "all" || (F.st === "open") === !m.resolved) && (PF.m === "all" || (m.at && m.at.slice(0, 10) >= a && m.at.slice(0, 10) <= b)) && (!q || String(m.no).includes(q) || (m.note || "").toLowerCase().includes(q) || m.code.toLowerCase().includes(q))).sort((x, y) => (y.at || "").localeCompare(x.at || "") || x.no - y.no); };
  const draw = () => {
    const arr = filt(), kc = (l, n, cls = "") => `<div class="kc ${cls}"><span>${l}</span><div class="kv"><b>${n}</b></div></div>`, c = k => arr.filter(m => m.kind === k).length;
    $("#lf-sum", host).innerHTML = kc(bi("খোলা (খুঁজতে হবে)", "Open (to trace)"), arr.filter(m => !m.resolved).length, "main") + kc(bi("মোট মার্ক", "Total marked"), arr.length) + LK_ORD.filter(k => c(k)).map(k => kc(`${LK[k].ic} ${lkName(k)}`, c(k))).join("") + kc(bi("নিষ্পত্তি", "Closed"), arr.filter(m => m.resolved).length, "st-cleared");
    const pages = Math.max(1, Math.ceil(arr.length / size));
    page = Math.min(page, pages - 1);
    const start = page * size, end = Math.min(start + size, arr.length);
    $("#lf-count", host).textContent = arr.length ? bi(`${arr.length}টির মধ্যে ${start + 1}–${end}টি পাতা`, `${start + 1}–${end} of ${arr.length} leaves`) : "";
    $("#lf-pager", host).hidden = pages <= 1;
    $("#lf-prev", host).disabled = !page;
    $("#lf-next", host).disabled = page >= pages - 1;
    $("#lf-page", host).textContent = `${page + 1} / ${pages}`;
    $("#lf-list", host).innerHTML = arr.length ? arr.slice(start, end).map(m => `<article class="card bk-card">
      <div class="bk-card-head"><div><h3>${esc(leafLabel(m.code, m.no))}</h3><div class="mut sm">${esc([m.code, am[m.code]?.holder].filter(Boolean).join(" · "))}</div></div><span class="tag ${m.resolved ? "ok" : "bk-low"}">${m.resolved ? bi("নিষ্পত্তি", "Closed") : bi("খোলা", "Open")}</span></div>
      <div class="bk-range">${lkTag(m.kind)}<span class="mut sm">${m.at ? dmy(m.at.slice(0, 10)) : "—"}${m.by ? " · " + esc(m.by) : ""}</span></div>
      ${m.note ? `<p class="bk-note sm">${esc(m.note)}</p>` : ""}
      ${m.resolved && (m.rnote || m.rby) ? `<p class="bk-note mut sm">✓ ${esc([m.rnote, m.rby, m.rat && dmy(m.rat.slice(0, 10))].filter(Boolean).join(" · "))}</p>` : ""}
      ${admin || m.photo ? `<div class="bk-actions">
        ${m.photo ? `<button class="btn sm" type="button" data-ph="${esc(m.id)}">${ico("img")} ${bi("মুড়ির ছবি", "Stub photo")}</button>` : ""}
        ${admin ? `${m.resolved ? `<button class="btn sm" type="button" data-ro="${esc(m.id)}">${bi("আবার খুলুন", "Reopen")}</button>` : `<button class="btn ok sm" type="button" data-rs="${esc(m.id)}">${bi("নিষ্পত্তি", "Close follow-up")}</button>`}<button class="btn bad sm" type="button" data-dl="${esc(m.id)}">${bi("মার্ক মুছুন", "Delete mark")}</button>` : ""}
      </div>` : ""}
    </article>`).join("") : `<div class="card empty">${S.marksOff ? bi("পাতার রেজিস্টার লোড হয়নি", "The leaf register could not load") : S.marks.length ? bi("এই ফিল্টারে কিছু নেই", "Nothing matches this filter") : bi("এখনো কোনো পাতা মার্ক করা হয়নি", "No leaves marked yet")}</div>`;
    const by = id => S.marks.find(m => m.id === id);
    $$("[data-ph]", host).forEach(b => b.onclick = () => leafPhotoModal(by(b.dataset.ph)));
    $$("[data-rs]", host).forEach(b => b.onclick = () => leafResolveModal(by(b.dataset.rs), redraw));
    $$("[data-ro]", host).forEach(b => b.onclick = async () => { try { await API.reopenMark(b.dataset.ro); await reload(); redraw(); } catch (e) { toast(markErr(e), "err"); } });
    $$("[data-dl]", host).forEach(b => b.onclick = async () => { const m = by(b.dataset.dl); if (!ask(bi(`${m.code} · ${leafLabel(m.code, m.no)}-এর মার্ক মুছবেন? (চেক পাতা মুছে যাবে না, শুধু এই রেকর্ড)`, `Delete the mark for ${m.code} · ${leafLabel(m.code, m.no)}? (only this record is removed)`))) return; try { await API.deleteMark(m.id); await reload(); redraw(); toast(bi("মুছে ফেলা হয়েছে", "Deleted")); } catch (e) { toast(markErr(e), "err"); } });
  };
  const turn = delta => { page += delta; draw(); $("#lf-count", host).scrollIntoView({ block: "nearest" }); };
  $("#lf-prev", host).onclick = () => turn(-1);
  $("#lf-next", host).onclick = () => turn(1);
  $("#lf-unscope", host).onclick = () => { F.book = null; F.code = ""; redraw(); };
  pbBind(host, "lf", PF, () => { page = 0; draw(); }, LF_PBO);
  [["lf-c", "code"], ["lf-k", "kind"], ["lf-s", "st"], ["lf-q", "q"]].forEach(([id, k]) => $("#" + id, host).addEventListener(id === "lf-q" ? "input" : "change", e => { F[k] = e.target.value; page = 0; if (k === "code" && F.book) { F.book = null; $("#lf-scope", host).hidden = true; } draw(); }));
  $("#lf-x", host).onclick = () => exportLeavesXlsx(filt(), `Leaf_Register_${PF.m === "all" ? today() : pbRange(PF).join("_to_")}.xlsx`, $("#lf-x", host));
  $("#lf-p", host).onclick = () => {
    const arr = filt().sort((x, y) => x.code.localeCompare(y.code) || x.no - y.no); if (!arr.length) return toast(bi("ডাটা নেই", "No data"), "err");
    const [pa, pb] = pbRange(PF), f = PF.m === "all" ? (arr.map(m => m.at?.slice(0, 10)).filter(Boolean).sort()[0] || today()) : pa, t = PF.m === "all" ? today() : pb, c = k => arr.filter(m => m.kind === k).length;
    printSheet(repSheet("lf-sheet", "Leaf Register · Missing / Blank-stub Cheque Leaves", f, t,
      repKpi([["Open (to trace)", arr.filter(m => !m.resolved).length, "k2"], ["Blank stub", c("blank"), ""], ["Lost / stolen", c("lost"), ""], ["Cancelled / Unused / Other", `${c("cancelled")} / ${c("unused")} / ${c("other")}`, ""]]),
      repOne(repBox(`Leaves (${arr.length})`, ["~A/C", "~Holder", "~Leaf no.", "~Reason", "~State", "~Note / settlement", "~Marked"], arr.map(m => `<tr><td><b>${esc(m.code)}</b></td><td>${esc((am[m.code] || {}).holder || "")}</td><td class="b">${esc(leafLabel(m.code, m.no))}</td><td>${esc(LK[m.kind].en)}</td><td>${m.resolved ? "Closed" : "<b>OPEN</b>"}</td><td>${esc(m.note || "")}${m.resolved && (m.rnote || m.rby) ? `<div class="mut" style="font-size:10px">${esc([m.rnote, m.rby && "by " + m.rby].filter(Boolean).join(" · "))}</div>` : ""}</td><td class="cd">${m.at ? dmy(m.at.slice(0, 10)) : "—"}<div class="mut" style="font-size:10px">${esc(m.by || "")}</div></td></tr>`).join(""))), ""), "Leaf_Register");
  };
  draw();
}
async function exportLeavesXlsx(rows, filename, btn) {
  if (!rows.length) return toast(bi("ডাটা নেই", "No data"), "err");
  const lbl = btn && btn.innerHTML, prog = t => { if (btn) btn.innerHTML = t; }, am = accMap();
  try { prog("⏳ …"); await loadScript("vendor/exceljs.min.js");
    const wb = new ExcelJS.Workbook(); wb.creator = "Nabiad"; const ws = wb.addWorksheet("Leaf register", { views: [{ state: "frozen", ySplit: 1 }] });
    const head = ["Marked on", "A/C Code", "Holder", "Bank", "Series", "Leaf No", "Reason", "State", "Note", "Marked by", "Settled by", "Settled on", "Settlement note", "Stub photo"], widths = [12, 12, 26, 22, 9, 12, 20, 9, 30, 16, 16, 12, 30, 34];
    ws.columns = head.map((h, i) => ({ header: h, key: "c" + i, width: widths[i] }));
    const hr = ws.getRow(1); hr.height = 22; hr.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }; c.alignment = { vertical: "middle" }; });
    const bkOf = m => bookForLeaf(m.code, m.no);
    rows.forEach(m => { const a = am[m.code] || {}, b = bkOf(m), r = ws.addRow([m.at ? dmy(m.at.slice(0, 10)) : "", m.code, a.holder || "", a.bank || "", b && b.series || "", m.no, LK[m.kind].en, m.resolved ? "Closed" : "OPEN", m.note || "", m.by || "", m.rby || "", m.rat ? dmy(m.rat.slice(0, 10)) : "", m.rnote || ""]); r.alignment = { vertical: "middle", wrapText: true }; if (!m.resolved) r.getCell(8).font = { bold: true, color: { argb: "FFDC2626" } }; });
    const withPh = rows.map((m, i) => [m, i]).filter(([m]) => m.photo); let done = 0, cache = {};
    const work = async ([m, i]) => { try { const t = await (cache[m.photo] ||= photoThumb(m.photo)), w = 230, h = Math.round(t.h * w / t.w), id = (t.id ??= wb.addImage({ base64: t.b64, extension: "jpeg" })); ws.getRow(i + 2).height = Math.max(20, h * 0.75 + 4); ws.addImage(id, { tl: { col: head.length - 1, row: i + 1 + 0.04 }, ext: { width: w, height: h } }); } catch { ws.getCell(i + 2, head.length).value = bi("(ছবি আনা যায়নি)", "(photo unavailable)"); } prog(`⏳ ${++done}/${withPh.length}`); };
    const q = [...withPh]; await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await work(q.shift()); }));
    const buf = await wb.xlsx.writeBuffer(); dlBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
    toast(bi(`✔ Excel তৈরি — ${rows.length}টি পাতা, ${withPh.length}টি ছবিসহ`, `✔ Excel ready — ${rows.length} leaf(s), ${withPh.length} with photo`));
  } catch (e) { console.error(e); toast(bi("Excel তৈরি হয়নি: ", "Excel failed: ") + (e.message || e), "err"); }
  finally { if (btn) btn.innerHTML = lbl; }
}

/* ---------- admin ---------- */
const BANKS = ["United Commercial Bank PLC|UCB", "BRAC Bank PLC|BBL", "Dutch-Bangla Bank PLC|DBBL", "Pubali Bank PLC|PBL", "Eastern Bank PLC|EBL", "National Bank PLC|NBL", "Islami Bank Bangladesh PLC|IBBL", "Standard Bank PLC|SBL", "IFIC Bank PLC|IFIC", "Mercantile Bank PLC|MBL", "Agrani Bank PLC|ABL", "Sonali Bank PLC|SONALI", "Janata Bank PLC|JANATA", "Rupali Bank PLC|RUPALI", "The City Bank PLC|CITY", "Prime Bank PLC|PRIME", "Bank Asia PLC|BAL", "Dhaka Bank PLC|DHAKA", "Jamuna Bank PLC|JBL", "Mutual Trust Bank PLC|MTBL", "Southeast Bank PLC|SEBL", "ONE Bank PLC|ONE", "Trust Bank PLC|TBL", "Uttara Bank PLC|UBL", "AB Bank PLC|AB", "NCC Bank PLC|NCC", "The Premier Bank PLC|PREMIER", "EXIM Bank PLC|EXIM", "Al-Arafah Islami Bank PLC|AIBL", "Shahjalal Islami Bank PLC|SJIBL", "First Security Islami Bank PLC|FSIBL", "Social Islami Bank PLC|SIBL", "Standard Chartered Bank|SCB", "HSBC|HSBC", "Bangladesh Krishi Bank|BKB", "Nagad (MFS)|NAGAD", "bKash (MFS)|BKASH"];
const AC_TYPES = ["Current", "Savings", "Al-Wadeeah Current (AWCA)", "Mudaraba Savings (MSA)", "Mudaraba Short Notice (MSNA)", "SND / Short Notice", "Current (VIP Banking)", "Savings (Imperial Priority)", "Savings (Islamic)", "OD", "CC / COD", "Term Loan", "FDR", "Credit Card Cheque", "MFS", "Other"];
function datalist(id, values) { const u = [...new Set(values.filter(Boolean).map(x => String(x).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 400); return `<datalist id="${id}">${u.map(x => `<option value="${esc(x)}">`).join("")}</datalist>`; }
/* ---------- bank details helpers: routing / SWIFT / completeness / share ---------- */
// commonly published SWIFT/BIC codes — only offered as a suggestion, always confirm with the bank
const SWIFT = { BBL: "BRAKBDDH", DBBL: "DBBLBDDH", IBBL: "IBBLBDDH", PBL: "PUBABDDH", EBL: "EBLDBDDH", UCB: "UCBLBDDH", CITY: "CIBLBDDH", PRIME: "PRBLBDDH", SCB: "SCBLBDDX", HSBC: "HSBCBDDH", SONALI: "BSONBDDH", JANATA: "JANBBDDH", ABL: "AGBKBDDH", RUPALI: "RUPBBDDH", NBL: "NBLBBDDH", SBL: "SDBLBDDH", IFIC: "IFICBDDH", MBL: "MBLBBDDH", BAL: "BALBBDDH", DHAKA: "DHBLBDDH", JBL: "JAMUBDDH", MTBL: "MTBLBDDH", SEBL: "SEBDBDDH", ONE: "ONEBBDDH", TBL: "TTBLBDDH", UBL: "UTBLBDDH", AB: "ABBLBDDH", NCC: "NCCLBDDH", PREMIER: "PRMRBDDH", EXIM: "EXBKBDDH", AIBL: "ALARBDDH", SJIBL: "SJBLBDDH", FSIBL: "FSEBBDDH", SIBL: "SOIVBDDH", BKB: "BKBABDDH" };
const bankPrefix = name => { const bk = BANKS.find(b => b.split("|")[0].toLowerCase() === String(name || "").trim().toLowerCase()); return bk ? bk.split("|")[1] : ""; };
const isMFS = a => /\bMFS\b|bkash|nagad|rocket/i.test(`${a.bank} ${a.type}`);
const ACC_FIELDS = [["holder", "হোল্ডারের নাম"], ["bank", "ব্যাংক"], ["acno", "A/C নং"], ["branch", "শাখা"], ["routing", "Routing নং"], ["type", "ধরন"]];
const accNeed = a => ACC_FIELDS.filter(([k]) => !(isMFS(a) && ["branch", "routing", "acno", "type"].includes(k)));
function accMissing(a) { return accNeed(a).filter(([k]) => !String(a[k] || "").trim()).map(([k, l]) => ({ k, l })); }
const accPct = a => { const need = accNeed(a).length; return Math.round((need - accMissing(a).length) / need * 100); };
const fmtAcno = s => String(s || "").replace(/\s+/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
function accText(list, opt = {}) {
  return list.map((a, i) => [list.length > 1 ? `${i + 1})` : "", a.bank && `Bank: ${a.bank}`, a.branch && `Branch: ${a.branch}`, !opt.cheque && a.routing && `Routing No: ${a.routing}`, !opt.cheque && a.swift && `SWIFT: ${a.swift}`, a.holder && `A/C Name: ${a.holder}`, a.acno && `A/C No: ${a.acno}`].filter(Boolean).join("\n")).join("\n\n");
}
async function copyText(t, msg = "কপি হয়েছে") { try { await navigator.clipboard.writeText(t); toast(msg); } catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch { toast("কপি করা যায়নি", "err"); } ta.remove(); } }
const bookBlob = async a => { const u = await API.photoUrl(a.book_photo); const r = await fetch(u); return await r.blob(); };
const pngOf = async blob => { const bm = await createImageBitmap(blob), cv = document.createElement("canvas"); cv.width = bm.width; cv.height = bm.height; cv.getContext("2d").drawImage(bm, 0, 0); return await new Promise(r => cv.toBlob(r, "image/png")); };
const dlBlob = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
function viewBookPhoto(a) {
  modal(`<h2>${ico("img")} Cheque book · ${esc(a.code)}</h2><div class="mut sm">${esc(a.holder || "")} · ${esc(a.bank || "")}</div><div id="bk-i" style="margin-top:10px"><div class="skel" style="height:200px"></div></div><div class="modal-actions"><button class="btn pri" id="bk-s">${ico("share")} শেয়ার</button><button class="btn fix" id="bk-x">বন্ধ</button></div>`, (root, close) => {
    API.photoUrl(a.book_photo).then(u => $("#bk-i", root).innerHTML = `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="cheque book" style="width:100%;border-radius:12px;border:1px solid var(--line)"></a>`).catch(e => $("#bk-i", root).innerHTML = `<div class="mut">${bi("ছবি লোড হয়নি: ", "Photo failed to load: ")}${esc(e.message || e)}</div>`);
    $("#bk-x", root).onclick = close; $("#bk-s", root).onclick = () => { close(); shareAccounts([a], "chq"); };
  });
}
function shareAccounts(list, startMode) {
  if (!list.length) return; let mode = startMode || "full", blobs = null;
  const withPh = () => list.filter(a => a.book_photo);
  const getBlobs = async () => blobs || (blobs = await Promise.all(withPh().map(async a => ({ a, blob: await bookBlob(a) }))));
  const cardHtml = () => `<div class="shc" id="sh-card">${list.map(a => { const b = brandOf(a); return `<div class="shc-i" style="--b1:${b.c1};--b2:${b.c2}"><div class="shc-h"><span class="blogo">${esc(b.s)}</span><b>${esc(a.bank || "")}</b></div><div class="shc-b"><div class="shc-n">${esc(a.holder || "")}</div><div class="shc-a">${esc(fmtAcno(a.acno) || "—")}</div><div class="shc-m">${[a.branch, a.routing && "Routing " + a.routing].filter(Boolean).map(esc).join(" · ")}</div></div></div>`; }).join("")}<div class="shc-f">NABIAD GROUP</div></div>`;
  modal(`<h2>${ico("share")} ব্যাংক তথ্য শেয়ার <span class="tag">${list.length}</span></h2>
   <div class="seg" id="sh-mode" style="margin-bottom:10px"><span class="chip" data-m="full">সব তথ্য</span><span class="chip" data-m="chq">A/C with Cheque</span></div>
   <label class="f">যা পাঠানো হবে <span class="mut">(চাইলে বদলাতে পারেন)</span></label><textarea class="in" id="sh-t" rows="${Math.min(14, list.length * 6 + 1)}" style="height:auto;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5"></textarea>
   <div id="sh-ph"></div><div id="sh-warn"></div>
   <div class="shgrid" id="sh-btns"></div>
   <div id="sh-prev" style="position:absolute;left:-9999px;top:0"></div>
   `, (root, close) => {
    const ta = $("#sh-t", root), btns = $("#sh-btns", root);
    const warn = () => {
      const miss = list.filter(a => accMissing(a).some(m => ["bank", "acno", "holder"].includes(m.k) || (mode === "full" && ["branch", "routing"].includes(m.k))));
      const nop = mode === "chq" ? list.filter(a => !a.book_photo) : [];
      $("#sh-warn", root).innerHTML = (miss.length ? `<div class="alert am" style="margin-top:8px">⚠ <span>কিছু তথ্য বাকি আছে: ${miss.map(a => `<b>${esc(a.code)}</b> (${accMissing(a).filter(m => ["bank", "acno", "holder", ...(mode === "full" ? ["branch", "routing"] : [])].includes(m.k)).map(m => `<span>${m.l}</span>`).join(", ")})`).join(" · ")}</span></div>` : "") + (nop.length ? `<div class="alert am" style="margin-top:8px">📷 <span>Cheque book-এর ছবি নেই: ${nop.map(a => `<b>${esc(a.code)}</b>`).join(", ")} — অ্যাকাউন্ট এডিটে ছবি যোগ করুন</span></div>` : "");
    };
    const phStrip = async () => {
      const box = $("#sh-ph", root); if (mode !== "chq") return box.innerHTML = ""; const w = withPh(); if (!w.length) return box.innerHTML = "";
      box.innerHTML = `<div class="phstrip ${w.length === 1 ? "one" : ""}">${w.map(a => `<div class="phi" data-v="${esc(a.code)}" title="বড় করে দেখুন"><img data-c="${esc(a.code)}" alt=""><span>${esc(a.code)}${w.length === 1 ? " · Cheque book" : ""}</span></div>`).join("")}</div>`;
      $$("[data-v]", box).forEach(el => el.onclick = () => { const a = list.find(x => x.code === el.dataset.v); if (a) viewBookPhoto(a); });
      for (const a of w) { try { const u = await API.photoUrl(a.book_photo); const im = $(`img[data-c="${CSS.escape(a.code)}"]`, box); if (im) im.src = u; } catch { } }
    };
    const draw = () => {
      $$("#sh-mode .chip", root).forEach(x => x.classList.toggle("on", x.dataset.m === mode));
      ta.value = accText(list, { cheque: mode === "chq" }); ta.rows = Math.max(4, Math.min(14, list.length * (mode === "chq" ? 5 : 6) - 1));
      const chq = mode === "chq", hasPh = withPh().length > 0;
      btns.innerHTML = (chq && hasPh ? `<button class="btn pri" data-s="withph">${ico("share")} ছবিসহ শেয়ার</button>` : "") +
        `<button class="btn sh-cp" data-s="copy">${ico("copy")} কপি</button>` +
        `<button class="btn wa" data-s="wa">${ico("share")} WhatsApp</button>` +
        (chq && hasPh ? `<button class="btn sh-im" data-s="cpimg">${ico("img")} ছবি কপি</button><button class="btn sh-im" data-s="dlimg">${ico("img")} ছবি ডাউনলোড</button>` : "") +
        (!chq && navigator.share ? `<button class="btn sh-ot" data-s="native">${ico("share")} অন্য অ্যাপে</button>` : "") +
        `<button class="btn sh-ml" data-s="mail">${ico("mail")} ইমেইল</button>` + (!chq ? `<button class="btn sh-im" data-s="img">${ico("img")} কার্ড ছবি</button>` : "") + `<button class="btn shclose" id="sh-x" type="button">✕ বন্ধ</button>`;
      warn(); phStrip();
    };
    draw();
    $$("#sh-mode .chip", root).forEach(c => c.onclick = () => { mode = c.dataset.m; draw(); });
    
    btns.onclick = async e => {
      if (e.target.closest("#sh-x")) return close();
      const b = e.target.closest("[data-s]"); if (!b) return; const t = ta.value.trim(), k = b.dataset.s;
      if (k === "copy") return copyText(t, "✔ কপি হয়েছে — যেখানে খুশি paste করুন");
      if (k === "wa") return window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank", "noopener");
      if (k === "mail") return location.href = `mailto:?subject=${encodeURIComponent("Bank details — " + (list[0].holder || ""))}&body=${encodeURIComponent(t)}`;
      if (k === "native") { try { await navigator.share({ title: "Bank details", text: t }); } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); } return; }
      b.disabled = true;
      try {
        if (k === "withph" || k === "dlimg" || k === "cpimg") {
          const bl = await getBlobs(), files = bl.map(x => new File([x.blob], `${x.a.code}_cheque.jpg`, { type: "image/jpeg" }));
          if (k === "withph") {
            if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, text: t, title: "Bank details" }); } catch (e) { if (e.name !== "AbortError") throw e; } }
            else { await copyText(t, "✔ টেক্সট কপি হয়েছে"); files.forEach(f => dlBlob(f, f.name)); toast("ছবি ডাউনলোড হয়েছে — WhatsApp-এ ছবি attach করে টেক্সট paste করুন"); }
          } else if (k === "dlimg") { files.forEach(f => dlBlob(f, f.name)); toast("ছবি ডাউনলোড হয়েছে"); }
          else { await navigator.clipboard.write([new ClipboardItem({ "image/png": await pngOf(bl[0].blob) })]); toast(bl.length > 1 ? "✔ প্রথম ছবিটি কপি হয়েছে (বাকিগুলো ডাউনলোড করুন)" : "✔ ছবি কপি হয়েছে — chat-এ paste করুন"); }
        } else if (k === "img") {
          const host = $("#sh-prev", root); host.innerHTML = cardHtml();
          await loadScript("vendor/html2canvas.min.js"); const cv = await html2canvas($("#sh-card", host), { scale: 2, backgroundColor: null }); const blob = await new Promise(r => cv.toBlob(r, "image/png")); const file = new File([blob], `Bank_details_${list[0].code}.png`, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: "Bank details" }); } catch (e) { if (e.name !== "AbortError") throw e; } }
          else { dlBlob(blob, file.name); toast("ছবি ডাউনলোড হয়েছে"); }
        }
      } catch (e) { toast(bi("ব্যর্থ: ", "Failed: ") + (e.message || e), "err"); }
      b.disabled = false;
    };
  });
}

/* ---------- account form (new / edit) with live preview ---------- */
function accountModal(a, after) {
  const isNew = !a; a = { code: "", holder: "", bank: "", branch: "", acno: "", type: "", routing: "", swift: "", note: "", daily: true, status: "Active", sort: Math.max(0, ...S.accounts.map(x => x.sort || 0)) + 1, ...(a || {}) };
  const banks = [...new Set([...BANKS.map(b => b.split("|")[0]), ...S.accounts.map(x => x.bank).filter(Boolean)])].sort();
  const quickTypes = ["Current", "Savings", "SND / Short Notice", "OD", "CC / COD", "MFS"];
  modal(`<div class="accf"><h2>${isNew ? "➕ নতুন অ্যাকাউন্ট" : "✏️ অ্যাকাউন্ট এডিট"}${isNew ? "" : ` <span class="tag" style="background:rgba(255,255,255,.22);color:#fff;border-color:rgba(255,255,255,.3)">${esc(a.code)}</span>`}</h2>
   <div class="accf-g"><div class="accf-form">
    <div class="fsec"><div class="fst"><i>1</i>ব্যাংক</div>
     <div class="fr2"><div><label class="f">ব্যাংক *</label><div><input class="in" id="a-b" value="${esc(a.bank || "")}" placeholder="টাইপ করুন: brac, dbbl, pubali…" autocomplete="off"></div></div>
     <div><label class="f">শাখা</label><input class="in" id="a-br" list="dl-branch" value="${esc(a.branch || "")}" placeholder="যেমন: Gulshan Branch, Dhaka" autocomplete="off"></div></div>
     <div class="fr2"><div><label class="f">Routing নং <span class="mut">(৯ ডিজিট)</span></label><input class="in num" id="a-r" value="${esc(a.routing || "")}" inputmode="numeric" maxlength="9" placeholder="চেকের নিচে / স্টেটমেন্টে থাকে" autocomplete="off"><div class="hint" id="a-rh"></div></div>
     <div><label class="f">SWIFT <span class="mut">(বিদেশি লেনদেনে)</span></label><input class="in" id="a-w" value="${esc(a.swift || "")}" placeholder="${bi("যেমন: ", "e.g. ")}BRAKBDDH" autocomplete="off" style="text-transform:uppercase"><div class="hint" id="a-wh"></div></div></div></div>
    <div class="fsec"><div class="fst"><i>2</i>অ্যাকাউন্ট</div>
     <div><label class="f">হোল্ডার (অ্যাকাউন্টের নাম) *</label><input class="in" id="a-h" list="dl-holder" value="${esc(a.holder || "")}" autocomplete="off"></div>
     <div class="fr2"><div><label class="f">A/C নং *</label><input class="in num" id="a-n" value="${esc(a.acno || "")}" inputmode="numeric" autocomplete="off"><div class="hint" id="a-nh"></div></div>
     <div><label class="f">Code <span class="mut">(BANK-শেষ ৩ ডিজিট)</span></label><input class="in" id="a-c" value="${esc(a.code)}" ${isNew ? "" : "disabled"} autocomplete="off" style="text-transform:uppercase"><div class="hint" id="a-ch"></div></div></div>
     <div><label class="f">ধরন</label><div class="chips" id="a-tq">${quickTypes.map(t => `<span class="chip" data-ty="${esc(t)}">${esc(t)}</span>`).join("")}</div><input class="in" id="a-t" list="dl-type" value="${esc(a.type || "")}" placeholder="অথবা লিখুন" autocomplete="off" style="margin-top:6px"></div></div>
    <div class="fsec"><div class="fst"><i>3</i>সেটিংস</div>
     <div class="fr3"><div><label class="f">দৈনিক ক্লোজিং-এ</label><label class="sw2"><input type="checkbox" id="a-d" ${a.daily ? "checked" : ""}><i></i><span>আসবে</span></label></div><div><label class="f">Status</label><div class="seg" id="a-s">${["Active", "Closed"].map(s => `<span class="chip ${s === a.status ? "on" : ""}" data-st="${s}">${s}</span>`).join("")}</div></div><div><label class="f">ক্রম</label><input class="in" id="a-o" value="${a.sort}" inputmode="numeric"></div></div>
     <div><label class="f">Cheque book-এর ছবি <span class="mut">(পার্টিকে পাঠানোর জন্য)</span></label><div class="bph"><div id="a-bphw" class="bph-w hide"><img id="a-bphi" alt=""></div><div class="row" style="gap:8px"><label class="btn sm" for="a-bpin">${ico("cam")} ছবি তুলুন / বাছুন</label><input type="file" id="a-bpin" accept="image/*" hidden><button class="btn sm ghost hide" id="a-bpx" type="button">মুছুন</button></div></div></div>
     <div><label class="f">নোট <span class="mut">(ঐচ্ছিক)</span></label><input class="in" id="a-note" value="${esc(a.note || "")}" placeholder="যেমন: OD limit 1.5 Cr, signatory…" autocomplete="off"></div></div>
   </div>
   <aside class="accf-side"><div class="mut xs" style="margin-bottom:6px">প্রিভিউ</div><div id="a-prev"></div><div id="a-comp" style="margin-top:12px"></div></aside></div>
   <div class="modal-actions"><button class="btn pri fix" id="a-ok">${ico("save")} সেভ</button><button class="btn fix" id="a-x">বাতিল</button>${isNew ? "" : `<button class="btn fix" id="a-sh">${ico("share")} শেয়ার</button>`}</div></div>
   ${datalist("dl-branch", S.accounts.map(x => x.branch))}${datalist("dl-holder", S.accounts.map(x => x.holder))}${datalist("dl-type", [...AC_TYPES, ...S.accounts.map(x => x.type)])}`, (root, close) => {
    root.querySelector(".modal").classList.add("wide");
    const g = id => $("#" + id, root); let touched = !isNew, status = a.status;
    suggest(g("a-b"), () => banks.map(b => ({ value: b, label: "", sub: bankPrefix(b) })), it => { if (it) { g("a-b").value = it.value; upd(); g("a-br").focus(); } });
    g("a-b").addEventListener("blur", () => setTimeout(() => { g("a-b").value = g("a-b").value.replace(/\s*\(\)\s*$/, ""); upd(); }, 150));
    g("a-c").addEventListener("input", () => touched = true);
    $$("#a-tq .chip", root).forEach(c => c.onclick = () => { g("a-t").value = c.dataset.ty; upd(); });
    $$("#a-s .chip", root).forEach(c => c.onclick = () => { status = c.dataset.st; $$("#a-s .chip", root).forEach(x => x.classList.toggle("on", x === c)); upd(); });
    const cur = () => ({ code: g("a-c").value.trim().toUpperCase(), holder: g("a-h").value.trim(), bank: g("a-b").value.replace(/\s*\(\)\s*$/, "").trim(), branch: g("a-br").value.trim(), acno: g("a-n").value.replace(/\s+/g, "").trim(), type: g("a-t").value.trim(), routing: g("a-r").value.replace(/\D/g, ""), swift: g("a-w").value.trim().toUpperCase(), note: g("a-note").value.trim(), daily: g("a-d").checked, status, sort: parseInt(g("a-o").value) || 0 });
    function upd() {
      const c = cur(), pre = bankPrefix(c.bank) || (S.accounts.find(x => x.bank === c.bank)?.code.split("-")[0] || ""), d = c.acno.replace(/\D/g, "");
      if (isNew && !touched && pre && d.length >= 3) { g("a-c").value = `${pre}-${d.slice(-3)}`; c.code = g("a-c").value; }
      const dup = isNew && c.code && S.accounts.find(x => x.code === c.code), dupNo = d && S.accounts.find(x => x.code !== a.code && (x.acno || "").replace(/\D/g, "") === d);
      g("a-ch").innerHTML = dup ? `<span class="rd">এই Code আগেই আছে (${esc(dup.holder)})</span>` : "";
      g("a-nh").innerHTML = dupNo ? `<span class="am">⚠ এই A/C নং আগেই আছে: ${esc(dupNo.code)}</span>` : d ? `<span class="mut">${esc(fmtAcno(d))} · ${d.length} ডিজিট</span>` : "";
      g("a-rh").innerHTML = !c.routing ? "" : c.routing.length === 9 ? `<span class="gr">✓ ঠিক আছে</span>` : `<span class="am">${c.routing.length}/9 ডিজিট</span>`;
      const sw = SWIFT[pre]; g("a-wh").innerHTML = sw && c.swift !== sw ? `<button class="btn sm ghost" id="a-ws">${ico("bulb")} ${bi(sw + " বসান", "Use " + sw)}</button> <span class="mut xs">${bi("ব্যাংক থেকে নিশ্চিত হয়ে নিন", "Confirm with the bank")}</span>` : "";
      $("#a-ws", root) && ($("#a-ws", root).onclick = e => { e.preventDefault(); g("a-w").value = sw; upd(); });
      $$("#a-tq .chip", root).forEach(x => x.classList.toggle("on", x.dataset.ty === c.type));
      const b = brandOf(c.code ? c : { bank: c.bank }), miss = accMissing(c), pct = accPct(c);
      g("a-prev").innerHTML = `<div class="card acc" style="--b1:${b.c1};--b2:${b.c2};margin:0"><div class="hd"><span class="blogo">${esc(b.s)}</span><span class="code">${esc(c.code || "CODE")}</span>${c.type ? `<span class="tag">${esc(c.type)}</span>` : ""}</div><div class="bd"><div class="b">${esc(c.holder || "হোল্ডারের নাম")}</div><div class="bk">${esc(c.bank || "ব্যাংক")}${c.branch ? " · " + esc(c.branch) : ""}</div><div class="no"><span>${esc(fmtAcno(c.acno) || "A/C নং")}</span></div><div class="mut xs">${[c.routing && "Routing " + c.routing, c.swift && "SWIFT " + c.swift].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div></div></div>`;
      g("a-comp").innerHTML = `<div class="cmp"><div class="cmp-t"><b>${bi("তথ্য " + pct + "% সম্পূর্ণ", "Details " + pct + "% complete")}</b></div><div class="bar"><i style="width:${pct}%;background:${pct === 100 ? "var(--g-green)" : pct >= 60 ? "var(--g-amber)" : "var(--g-red)"}"></i></div>${miss.length ? `<div class="mut xs" style="margin-top:6px">বাকি: ${miss.map(m => `<span>${m.l}</span>`).join(", ")}</div>` : `<div class="gr xs" style="margin-top:6px">✓ পার্টিকে শেয়ার করার জন্য প্রস্তুত</div>`}</div>`;
    }
    $$("input", root).forEach(i => i.addEventListener("input", upd)); g("a-d").addEventListener("change", upd); upd();
    const ph = { blob: null, remove: false }, showPh = src => { g("a-bphi").src = src; g("a-bphw").classList.remove("hide"); g("a-bpx").classList.remove("hide"); }, hidePh = () => { g("a-bphw").classList.add("hide"); g("a-bpx").classList.add("hide"); g("a-bphi").removeAttribute("src"); };
    if (a.book_photo) API.photoUrl(a.book_photo).then(showPh).catch(() => { });
    g("a-bpin").onchange = async () => { const f0 = g("a-bpin").files[0]; g("a-bpin").value = ""; if (!f0) return; const f = await pickImage(f0, { title: LANG === "en" ? "Crop cheque book photo" : "Cheque book-এর ছবি ক্রপ", aspect: null }, g("a-bpin")); if (!f) return; try { ph.blob = await compressImage(f); ph.remove = false; showPh(URL.createObjectURL(ph.blob)); } catch (e) { toast(e.message, "err"); } g("a-bpin").value = ""; };
    g("a-bpx").onclick = () => { ph.blob = null; ph.remove = true; hidePh(); };
    g("a-x").onclick = close;
    g("a-sh") && (g("a-sh").onclick = () => { close(); shareAccounts([{ ...a, ...cur(), code: a.code }]); });
    g("a-ok").onclick = async () => {
      const c = cur(); if (!c.bank) return toast("ব্যাংক বাছুন", "err"), g("a-b").focus(); if (!c.code) return toast("Code দিন", "err"), g("a-c").focus();
      if (isNew && S.accounts.some(x => x.code === c.code)) return toast("এই Code আগেই আছে", "err");
      if (c.routing && c.routing.length !== 9 && !ask("Routing নং ৯ ডিজিট নয়। তবুও সেভ করবেন?")) return;
      const b = g("a-ok"); b.disabled = true;
      try { const row = { ...c }; if (!isNew) row.code = a.code; if (ph.blob) { const pth = `books/${norm(row.code)}_${Date.now()}.jpg`; await API.uploadPhoto(pth, ph.blob); row.book_photo = pth; } else if (ph.remove && a.book_photo) row.book_photo = null; await API.upsertAccount(row); await reload(); close(); after && after(); toast("✔ সেভ হয়েছে"); }
      catch (e) { toast(/routing|swift|note|book_photo|column/i.test(e.message || "") ? "নতুন ঘর (Routing/SWIFT/নোট/ছবি) সেভ করতে schema_v5.sql চালাতে হবে" : e.message, "err"); b.disabled = false; }
    };
    g(isNew ? "a-b" : "a-h").focus();
  });
}

/* ---------- account directory: search · missing-info filter · select & share ---------- */
/* ---------- bulk import of cheque-book photos: file name  BANK-BRANCH-HOLDER-LAST3.jpg  →  account ---------- */
const FILE_PFX = { AGRANI: "ABL", BRAC: "BBL", DBBL: "DBBL", EBL: "EBL", IBBL: "IBBL", IFIC: "IFIC", MBL: "MBL", NBL: "NBL", PUBALI: "PBL", SIBPLC: "SBL", UCB: "UCB", ABL: "ABL", BBL: "BBL", PBL: "PBL", SBL: "SBL" };
function matchBookFile(fname) {
  const base = fname.replace(/\.[a-z0-9]+$/i, "").trim();
  if (/\(\d+\)\s*$/.test(base)) return { st: "dup" };
  const p = base.split("-").map(x => x.trim()); if (p.length < 3) return { st: "bad" };
  const pfx = FILE_PFX[p[0].toUpperCase()], last = p[p.length - 1].replace(/\D/g, ""), hold = norm(p.slice(2, -1).join(" "));
  if (!pfx || !last) return { st: "bad" };
  let c = S.accounts.filter(a => a.code.split("-")[0] === pfx && String(a.acno || "").replace(/\D/g, "").endsWith(last));
  if (c.length > 1) { const ex = c.filter(a => norm(a.holder) === hold); if (ex.length === 1) c = ex; else { const h1 = c.filter(a => norm(a.holder).includes(hold)); if (h1.length === 1) c = h1; else { const h2 = c.filter(a => hold.includes(norm(a.holder))); if (h2.length === 1) c = h2; } } }
  return c.length === 1 ? { st: "ok", a: c[0] } : { st: c.length ? "amb" : "none" };
}
function bookImportModal(after) {
  let items = [];
  modal(`<h2>${ico("cam")} Cheque book ছবি ইমপোর্ট</h2>
   <div class="mut sm" style="margin-bottom:10px">ফাইলের নাম <b>${bi("BANK-BRANCH-HOLDER-শেষ৩ডিজিট.jpg", "BANK-BRANCH-HOLDER-last3digits.jpg")}</b> ${bi("ধরনের হলে নিজে নিজে অ্যাকাউন্ট খুঁজে নেবে। একসাথে অনেক ছবি বাছুন।", "style names are matched to the account automatically. Select many photos at once.")}</div>
   <label class="btn" for="bi-f">${ico("cam")} ছবি বাছুন (একাধিক)</label><input type="file" id="bi-f" accept="image/*" multiple hidden>
   <div id="bi-l" style="margin-top:12px;max-height:48vh;overflow:auto"></div>
   <label class="sw2 hide" id="bi-rw" style="margin-top:8px"><input type="checkbox" id="bi-r"><i></i><span>যাদের ছবি আছে তাদেরটাও বদলান</span></label>
   <div class="modal-actions"><button class="btn pri fix hide" id="bi-ok">আপলোড</button><button class="btn fix" id="bi-x">বন্ধ</button></div>`, (root, close) => {
    const g = id => $("#" + id, root); g("bi-x").onclick = close;
    const list = () => {
      const ok = items.filter(x => x.m.st === "ok" && (g("bi-r").checked || !x.m.a.book_photo));
      g("bi-l").innerHTML = `<table class="tbl"><tbody>${items.map(x => `<tr><td class="sm">${esc(x.f.name.slice(0, 44))}</td><td>${x.m.st === "ok" ? `<b>${esc(x.m.a.code)}</b> <span class="mut xs">${esc(x.m.a.holder)}</span>${x.m.a.book_photo ? ` <span class="am xs">(ছবি আছে)</span>` : ""}` : x.m.st === "dup" ? `<span class="mut xs">ডুপ্লিকেট — বাদ</span>` : `<span class="rd xs">${x.m.st === "amb" ? "একাধিক মিলেছে" : "অ্যাকাউন্ট মেলেনি"}</span>`}</td><td>${x.done ? "✅" : x.err ? "❌" : ""}</td></tr>`).join("")}</tbody></table>`;
      g("bi-rw").classList.toggle("hide", !items.some(x => x.m.st === "ok" && x.m.a.book_photo)); g("bi-ok").classList.toggle("hide", !items.length);
      g("bi-ok").textContent = bi(`আপলোড (${ok.length}টি)`, `Upload (${ok.length})`); g("bi-ok").disabled = !ok.length; return ok;
    };
    g("bi-f").onchange = () => { items = [...g("bi-f").files].map(f => ({ f, m: matchBookFile(f.name) })); list(); };
    g("bi-r").onchange = list;
    g("bi-ok").onclick = async () => {
      const ok = list(); if (!ok.length) return; g("bi-ok").disabled = true; let n = 0;
      for (const x of ok) {
        try { const blob = await compressImage(x.f), pth = `books/${norm(x.m.a.code)}_${Date.now()}.jpg`; await API.uploadPhoto(pth, blob); await API.upsertAccount({ ...x.m.a, book_photo: pth }); x.done = true; n++; }
        catch (e) { x.err = true; console.warn(e); if (/book_photo|column/i.test(e.message || "")) { toast("schema_v5.sql চালাতে হবে", "err"); break; } }
        g("bi-ok").textContent = bi(`আপলোড হচ্ছে… ${n}/${ok.length}`, `Uploading… ${n}/${ok.length}`); list();
      }
      await reload(); toast(bi(`✔ ${n}টি ছবি যোগ হয়েছে`, `✔ ${n} photo(s) added`)); after && after(); g("bi-ok").textContent = "হয়ে গেছে"; 
    };
  });
}
async function vAccounts(v, F = { q: "", b: "", h: "", st: "Active", miss: "", view: "grid" }, sel = new Set()) {
  const admin = S.me.role === "admin";
  const compare = new Intl.Collator(LANG === "bn" ? "bn-BD" : "en", { sensitivity: "base", numeric: true }).compare;
  const bankName = a => String(a.bank || "").trim();
  const views = [["grid", "grid", bi("গ্রিড", "Grid")], ["list", "list", bi("তালিকা", "List")]];
  const selected = (value, active) => value === active ? " selected" : "";
  const banks = [...new Set(S.accounts.map(a => a.bank).filter(Boolean))].sort(compare), holders = [...new Set(S.accounts.map(a => a.holder).filter(Boolean))].sort(compare);
  if (!banks.includes(F.b)) F.b = "";
  if (!holders.includes(F.h)) F.h = "";
  v.innerHTML = head("অ্যাকাউন্ট খুঁজুন", admin ? `<button class="btn" id="acf-imp">${ico("cam")} ছবি ইমপোর্ট</button><button class="btn pri" id="acf-add">${ico("plus")} নতুন অ্যাকাউন্ট</button>` : "") + `<div class="card tbar noprint">
    ${searchBox("acf-q", "কোড, নাম, ব্যাংক, শাখা, A/C বা Routing নং — যেমন: 483, pubali")}
    <div class="acf-filters">
      <select class="in" id="acf-b" aria-label="${bi("ব্যাংক", "Bank")}"><option value="">সব ব্যাংক</option>${banks.map(b => `<option${selected(b, F.b)}>${esc(b)}</option>`).join("")}</select>
      <select class="in" id="acf-h" aria-label="${bi("অ্যাকাউন্ট হোল্ডার", "Account holder")}"><option value="">সব হোল্ডার</option>${holders.map(h => `<option${selected(h, F.h)}>${esc(h)}</option>`).join("")}</select>
      <select class="in" id="acf-s" aria-label="${bi("অ্যাকাউন্টের অবস্থা", "Account status")}"><option value="Active"${selected("Active", F.st)}>Active</option><option value=""${selected("", F.st)}>সব</option><option value="Closed"${selected("Closed", F.st)}>Closed</option></select>
      <div class="acf-view" role="group" aria-label="${bi("অ্যাকাউন্ট দেখার ধরন", "Account view")}">${views.map(([key, icon, label]) => `<button type="button" class="btn" data-acf-view="${key}" aria-controls="acf-out" aria-pressed="${F.view === key}"><span aria-hidden="true">${ico(icon)}</span>${label}</button>`).join("")}</div>
    </div>
    <div class="mchips" id="acf-m"></div></div>
   <div class="acf-results"><span class="mut sm" id="acf-n" role="status"></span><button type="button" class="lnkb" id="acf-all">${bi("দেখানো সব নির্বাচন", "Select all shown")}</button></div>
   <div id="acf-out"></div><div id="acf-selbar" class="selbar hide"></div>`;
  const out = $("#acf-out", v), query = $("#acf-q", v), selectAll = $("#acf-all", v);
  query.value = F.q;
  query.setAttribute("aria-label", bi("অ্যাকাউন্ট খুঁজুন", "Search accounts"));
  const refresh = () => { if (out.isConnected) vAccounts(v, F, sel); };
  const base = () => S.accounts.filter(a => (!F.b || a.bank === F.b) && (!F.h || a.holder === F.h) && (!F.st || a.status === F.st));
  const mf = { mfs: a => isMFS(a), inc: a => !isMFS(a) && accMissing(a).length > 0, ok: a => !isMFS(a) && !accMissing(a).length, acno: a => accMissing(a).some(m => m.k === "acno"), routing: a => accMissing(a).some(m => m.k === "routing"), branch: a => accMissing(a).some(m => m.k === "branch"), type: a => accMissing(a).some(m => m.k === "type"), nophoto: a => !isMFS(a) && !a.book_photo };
  const selbar = () => { const el = $("#acf-selbar", v); if (!sel.size) return el.classList.add("hide"); el.classList.remove("hide"); el.innerHTML = `<b>${sel.size}</b> <span>টি নির্বাচিত</span><button class="btn sm pri" id="sb-sh">${ico("share")} শেয়ার</button><button class="btn sm" id="sb-cp">${ico("copy")} কপি</button><button class="btn sm ghost" id="sb-x">✕</button>`;
    const list = () => S.accounts.filter(a => sel.has(a.code)); $("#sb-sh", el).onclick = () => shareAccounts(list()); $("#sb-cp", el).onclick = () => copyText(accText(list()), "✔ নির্বাচিত অ্যাকাউন্টের তথ্য কপি হয়েছে"); $("#sb-x", el).onclick = () => { sel.clear(); draw(); }; };
  const draw = () => {
    const q = chequeSearchKey(F.q), b0 = base(), cnt = k => b0.filter(mf[k]).length;
    $("#acf-m", v).innerHTML = [["", "সব", b0.length], ["inc", ico("flag") + " তথ্য অসম্পূর্ণ", cnt("inc")], ["ok", ico("check") + " সম্পূর্ণ", cnt("ok")], ["acno", "A/C নং নেই", cnt("acno")], ["routing", "Routing নেই", cnt("routing")], ["branch", "শাখা নেই", cnt("branch")], ["type", "ধরন নেই", cnt("type")], ["nophoto", ico("cam") + " ছবি নেই", cnt("nophoto")], ["mfs", ico("phone") + " মোবাইল ব্যাংকিং", cnt("mfs")]].filter(([k, , n]) => !k || n || F.miss === k).map(([k, l, n]) => `<span class="chip ${F.miss === k ? "on" : ""} ${k && k !== "ok" ? "warn" : ""}" data-mf="${k}"><span>${l}</span> <b>${n}</b></span>`).join("");
    $$("#acf-m [data-mf]", v).forEach(c => c.onclick = () => { F.miss = c.dataset.mf; draw(); });
    const arr = b0.filter(a => (!F.miss || mf[F.miss](a)) && (!q || chequeSearchKey([a.code, a.holder, a.bank, a.branch, a.acno, a.type, a.routing, a.swift].join(" ")).includes(q)));
    const listView = F.view === "list", byBank = new Map(), chequeCounts = new Map();
    if (listView) {
      for (const account of arr) {
        const name = bankName(account);
        const key = name.toLowerCase();
        if (!byBank.has(key)) byBank.set(key, { name, accounts: [] });
        byBank.get(key).accounts.push(account);
      }
    } else arr.sort((a, b) => Number(!bankName(a)) - Number(!bankName(b)) || compare(bankName(a), bankName(b)) || compare(a.code || "", b.code || ""));
    for (const c of S.cheques) chequeCounts.set(c.code, (chequeCounts.get(c.code) || 0) + 1);
    $("#acf-n", v).textContent = listView && arr.length
      ? bi(`${arr.length}টি অ্যাকাউন্ট · ${byBank.size}টি গ্রুপ · নাম অনুযায়ী A–Z`, `${arr.length} accounts · ${byBank.size} groups · Bank name A–Z`)
      : bi(`${arr.length}টি অ্যাকাউন্ট`, `${arr.length} accounts`);
    selectAll.hidden = !arr.length;
    const renderAccount = a => {
      const n = chequeCounts.get(a.code) || 0, br = brandOf(a), miss = accMissing(a), pct = accPct(a);
      return `<div class="card acc ${sel.has(a.code) ? "picked" : ""}" style="--b1:${br.c1};--b2:${br.c2}"><div class="hd"><label class="pick" title="নির্বাচন"><input type="checkbox" aria-label="${bi("নির্বাচন", "Select")} ${esc(a.code)}" data-sel="${esc(a.code)}" ${sel.has(a.code) ? "checked" : ""}><i></i></label><span class="blogo">${esc(br.s)}</span><span class="code">${esc(a.code)}</span>${a.status !== "Active" ? `<span class="tag cl">${esc(a.status)}</span>` : ""}<span style="flex:1"></span><span class="hacts">${a.book_photo ? `<button class="btn sm ghost" data-ph="${esc(a.code)}" title="Cheque ছবি">${ico("img")}</button>` : ""}<button class="btn sm ghost" data-sh="${esc(a.code)}" title="শেয়ার">${ico("share")}</button>${admin ? `<button class="btn sm ghost" data-e="${esc(a.code)}" title="এডিট">${ico("edit")}</button>` : ""}</span></div><div class="bd">
      <div class="acf-id"><div class="b">${esc(a.holder || "")}${a.type ? ` <span class="tag typ">${esc(a.type)}</span>` : ""}</div><div class="bk">${esc(a.bank || "")}${a.branch ? " · " + esc(a.branch) : ""}</div></div><div class="acf-details">
      ${a.acno ? `<div class="no"><span>${esc(fmtAcno(a.acno))}</span><button class="btn sm ghost" data-cp="${esc(a.acno)}" title="কপি">${ico("copy")} কপি</button></div>` : isMFS(a) ? `<div class="nomiss" style="color:var(--mut,#8b93a7)">${ico("phone")} মোবাইল ব্যাংকিং (শাখা/Routing/SWIFT প্রযোজ্য নয়)</div>` : `<div class="nomiss">A/C নং দেওয়া নেই</div>`}
      ${a.routing || a.swift ? `<div class="rt">${a.routing ? `<span>Routing <b>${esc(a.routing)}</b> <button class="lnkb" data-cp="${esc(a.routing)}">কপি</button></span>` : ""}${a.swift ? `<span>SWIFT <b>${esc(a.swift)}</b></span>` : ""}</div>` : ""}
      </div><div class="acf-meta">${miss.length ? `<div class="cmpl"><div class="bar"><i style="width:${pct}%"></i></div><div class="cmpl-t"><span class="am xs">${pct}% · <span>বাকি:</span> ${miss.map(m => `<span>${m.l}</span>`).join(", ")}</span>${admin ? `<button class="lnkb" data-e="${esc(a.code)}">পূরণ করুন</button>` : ""}</div></div>` : ""}
      <div class="mut sm">${n ? `${n}টি চেক · <a href="#/cheques" data-go="${esc(a.code)}">দেখুন</a>` : "এখনো চেক নেই"}${a.daily ? " · দৈনিক ক্লোজিং" : ""}${a.note ? ` · <span title="${esc(a.note)}">📝 ${esc(a.note.slice(0, 30))}</span>` : ""}</div></div></div></div></div>`;
    };
    const groups = [...byBank.values()].sort((a, b) => Number(!a.name) - Number(!b.name) || compare(a.name, b.name));
    out.className = listView ? "acf-list" : "acc-grid acf-grid";
    out.innerHTML = !arr.length ? `<div class="card empty acf-empty">${bi("ফিল্টারে কোনো অ্যাকাউন্ট মেলেনি", "No accounts match these filters")}</div>` :
      listView ? groups.map(({name, accounts}) => `<section class="acf-bank"><h2>${esc(name || bi("ব্যাংকের নাম নেই", "Bank name missing"))} <span class="tag num" aria-label="${bi(`${accounts.length}টি অ্যাকাউন্ট`, `${accounts.length} accounts`)}">${accounts.length}</span></h2>${accounts.sort((a, b) => compare(a.code, b.code)).map(renderAccount).join("")}</section>`).join("") :
      arr.map(renderAccount).join("");
    $$("[data-cp]", v).forEach(x => x.onclick = () => copyText(x.dataset.cp, "✔ কপি হয়েছে"));
    $$("[data-e]", v).forEach(x => x.onclick = () => accountModal(S.accounts.find(a => a.code === x.dataset.e), refresh));
    $$("[data-ph]", v).forEach(x => x.onclick = () => viewBookPhoto(S.accounts.find(a => a.code === x.dataset.ph)));
    $$("[data-sh]", v).forEach(x => x.onclick = () => shareAccounts([S.accounts.find(a => a.code === x.dataset.sh)]));
    $$("[data-go]", v).forEach(x => x.onclick = () => sessionStorage.setItem("nabiad_chq_ac", x.dataset.go));
    $$("[data-sel]", v).forEach(x => x.onchange = () => { x.checked ? sel.add(x.dataset.sel) : sel.delete(x.dataset.sel); x.closest(".acc").classList.toggle("picked", x.checked); selbar(); });
    selectAll.onclick = () => { arr.forEach(a => sel.add(a.code)); draw(); };
    selbar();
  };
  const viewButtons = $$("[data-acf-view]", v);
  viewButtons.forEach(btn => btn.onclick = () => {
    if (btn.dataset.acfView === F.view) return;
    F.view = btn.dataset.acfView;
    viewButtons.forEach(item => item.setAttribute("aria-pressed", String(item.dataset.acfView === F.view)));
    draw();
  });
  query.oninput = e => { F.q = e.target.value; draw(); }; $("#acf-b", v).onchange = e => { F.b = e.target.value; draw(); }; $("#acf-h", v).onchange = e => { F.h = e.target.value; draw(); }; $("#acf-s", v).onchange = e => { F.st = e.target.value; draw(); };
  $("#acf-imp", v) && ($("#acf-imp", v).onclick = () => bookImportModal(refresh));
  $("#acf-add", v) && ($("#acf-add", v).onclick = () => accountModal(null, refresh));
  draw();
}
const MODULE_ACCESS = [
  ["cheque", "চেক", "Cheque", "chq"],
  ["bank", "ব্যাংক", "Bank", "bank"],
  ["cash", "ক্যাশ", "Cash", "book"],
  ["collection", "কালেকশন", "Collection", "coins"],
  ["inventory", "ইনভেন্টরি", "Inventory", "grid"]
];
function moduleCan(key, action, fallback = S.me.role === "staff") {
  if (S.me.role === "admin") return true;
  return S.me.module_access == null ? fallback : S.me.module_access[key]?.[action] === true;
}
const moduleOpen = key => moduleCan(key, "entry") || moduleCan(key, "edit");
const writeDenied = () => new Error(bi("এই কাজের জন্য আপনার অনুমতি নেই।", "You do not have permission for this action."));
function moduleAccessModal(user, after) {
  const entryLabel = bi("এন্ট্রি", "Entry"), editLabel = bi("এডিট", "Edit");
  modal(`<h2>${bi("মডিউল অ্যাক্সেস", "Module access")} · ${esc(user.name || user.email || "")}</h2>
    <div class="adm-mode"><label class="f" for="ma-mode">${bi("অনুমতির ধরন", "Access mode")}</label><select class="in" id="ma-mode"><option value="default">${bi("রোলের ডিফল্ট", "Role defaults")}</option><option value="custom">${bi("মডিউল বেছে দিন", "Custom module access")}</option></select></div>
    <div id="ma-custom" hidden>
      <div class="adm-actions"><button class="btn sm" type="button" id="ma-all">${bi("সব অনুমতি দিন", "Allow all")}</button><button class="btn sm" type="button" id="ma-none">${bi("সব বন্ধ করুন", "Clear all")}</button></div>
      <div class="adm-access"><strong>${bi("মডিউল", "Module")}</strong><strong>${entryLabel}</strong><strong>${editLabel}</strong>
      ${MODULE_ACCESS.map(([key, bn, en, icon]) => {
        const name = bi(bn, en);
        return `<span>${ico(icon)} ${name}</span>${["entry", "edit"].map(action => `<label><input type="checkbox" data-module="${key}" data-action="${action}" aria-label="${name} · ${action === "entry" ? entryLabel : editLabel}" ${user.module_access?.[key]?.[action] === true ? "checked" : ""}></label>`).join("")}`;
      }).join("")}</div>
    </div>
    <p class="mut sm">${bi("রিপোর্ট দেখার অনুমতি রোল অনুযায়ী থাকে। ডিলিট, সেটআপ ও ব্যবহারকারী ব্যবস্থাপনা Admin-এর কাজ।", "Report visibility follows the role. Deletion, setup and user management remain Admin actions.")}</p>
    <div id="ma-error" class="hint rd" role="alert"></div>
    <div class="modal-actions"><button class="btn" type="button" id="ma-close">${bi("বাতিল", "Cancel")}</button><button class="btn pri" type="button" id="ma-save">${bi("সেভ", "Save")}</button></div>`, (root, close) => {
    const mode = $("#ma-mode", root), custom = $("#ma-custom", root), controls = $$("[data-module][data-action]", root);
    mode.value = user.module_access == null ? "default" : "custom";
    const sync = () => { custom.hidden = mode.value !== "custom"; };
    mode.onchange = sync; sync();
    $("#ma-all", root).onclick = () => controls.forEach(c => { c.checked = true; });
    $("#ma-none", root).onclick = () => controls.forEach(c => { c.checked = false; });
    const cancel = $("#ma-close", root), save = $("#ma-save", root), err = $("#ma-error", root);
    cancel.onclick = close;
    save.onclick = async () => {
      if (save.disabled) return;
      let config = null;
      if (mode.value === "custom") {
        config = Object.fromEntries(MODULE_ACCESS.map(([key]) => [key, {entry:false, edit:false}]));
        controls.forEach(c => { config[c.dataset.module][c.dataset.action] = c.checked; });
      }
      save.disabled = cancel.disabled = true;
      err.textContent = "";
      try {
        await API.setModuleAccess(user.id, config);
        close(); after(); toast(bi("অ্যাক্সেস সেভ হয়েছে", "Access saved"));
      } catch (e) { err.textContent = e.message || String(e); }
      finally { save.disabled = cancel.disabled = false; }
    };
  });
}

async function vAdmin(v) {
  const sections = [
    ["Overview", [["home", "grid", bi("সারসংক্ষেপ", "Overview")]]],
    [bi("ব্যবস্থাপনা", "Management"), [["acc", "bank", bi("অ্যাকাউন্ট", "Accounts")], ["usr", "users", bi("ব্যবহারকারী", "Users")], ["help", "sliders", bi("সেটআপ", "Setup")]]],
    [bi("অডিট ও সিকিউরিটি", "Audit & Security"), [["audit", "list", bi("অডিট লগ", "Audit log"), vAudit], ["backup", "save", bi("ব্যাকআপ ও রিস্টোর", "Backup & Restore"), vBackup], ["sec", "shield", bi("সিকিউরিটি", "Security"), vSec]]]
  ];
  const pages = new Map(sections.flatMap(([, entries]) => entries.map(([key, icon, label, view]) => [key, {icon, label, view}])));
  const requested = new URLSearchParams(location.hash.split("?")[1]).get("tab");
  let tab = pages.has(requested) ? requested : "home";
  let childCleanup, focusSection = false;
  const accountFilters = { q:"", status:"Active", bank:"", daily:"", sort:"order" };
  const userFilters = { q:"", role:"", status:"" };
  let importing = false;
  const metrics = rows => `<div class="adm-metrics">${rows.map(([name, value]) => `<div class="card"><span class="mut sm">${name}</span><strong class="num">${value}</strong></div>`).join("")}</div>`;
  const all = bi("সব", "All");
  let setupEvents;
  const draw = async options => {
    setupEvents?.abort();
    childCleanup?.();
    childCleanup = null;
    setupEvents = new AbortController();
    const setupSignal = setupEvents.signal;
    const nav = sections.map(([label, entries], index) => `<div class="adm-nav-group">
      ${index ? `<span class="mut xs adm-nav-label">${esc(label)}</span>` : ""}
      ${entries.map(([id, icon, name]) => `<a href="#/admin?tab=${id}" data-admin-tab="${id}" ${id === tab ? 'aria-current="page"' : ""}>${ico(icon)}${esc(name)}</a>`).join("")}</div>`).join("");
    v.innerHTML = head("অ্যাডমিন প্যানেল") + `<div class="adm-layout">
      <div class="adm-nav-wrap"><button class="btn adm-nav-toggle" id="adm-nav-toggle" type="button" aria-expanded="false" aria-controls="adm-nav">${ico("list")} ${esc(pages.get(tab).label)}</button>
      <nav id="adm-nav" class="card adm-nav" aria-label="${bi("অ্যাডমিন বিভাগ", "Admin sections")}">${nav}</nav></div>
      <div id="ad" class="adm-content" tabindex="-1"></div></div>`;
    const out = $("#ad", v), navToggle = $("#adm-nav-toggle", v);
    { const nv = $("#adm-nav", v), cur = $('[aria-current="page"]', nv); if (cur && nv.scrollWidth > nv.clientWidth) nv.scrollLeft = cur.offsetLeft - 12; }
    navToggle.onclick = () => {
      const expanded = navToggle.getAttribute("aria-expanded") !== "true";
      navToggle.setAttribute("aria-expanded", expanded);
      $("#adm-nav", v).classList.toggle("expanded", expanded);
    };
    const open = (key, options) => {
      if (!pages.has(key)) return;
      tab = key;
      focusSection = true;
      history.pushState(null, "", "#/admin?tab=" + key);
      window.scrollTo({top: 0, behavior: "smooth"});
      return draw(options);
    };
    $$("[data-admin-tab]", v).forEach(link => link.onclick = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (link.dataset.adminTab !== tab) open(link.dataset.adminTab);
    });
    if (focusSection) { out.focus({preventScroll: true}); focusSection = false; }
    const refresh = () => { if (out.isConnected) return draw(); };
    const page = pages.get(tab);
    if (page.view) {
      const dispose = await page.view(out, options, open);
      if (out.isConnected) childCleanup = dispose;
      else dispose?.();
      return;
    }
    if (tab === "home") {
      const destinations = [
        ["acc", bi("ব্যাংক অ্যাকাউন্ট ও দৈনিক ক্লোজিং সেটআপ", "Manage bank accounts and daily closing settings")],
        ["usr", bi("ব্যবহারকারী, রোল ও মডিউল অনুমতি", "Manage users, roles and module permissions")],
        ["help", bi("সিস্টেম পরীক্ষা ও পূর্বের ডাটা ইমপোর্ট", "Check system health and import historical records")],
        ["audit", bi("ব্যবহারকারী ও রেকর্ডের পরিবর্তন দেখুন", "Review changes to records and users")],
        ["backup", bi("Snapshot দেখুন, ডাউনলোড বা রিস্টোর করুন", "Review, export or restore database snapshots")],
        ["sec", bi("সাইন-ইন, সেশন ও দুই ধাপের যাচাই", "Review sign-ins, sessions and two-factor authentication")]
      ];
      out.innerHTML = metrics([
        [bi("ব্যাংক অ্যাকাউন্ট", "Bank accounts"), money0(S.accounts.length)],
        [bi("সক্রিয় অ্যাকাউন্ট", "Active accounts"), money0(S.accounts.filter(row => row.status === "Active").length)],
        [bi("শেষ ব্যাংক ক্লোজিং", "Latest bank closing"), dmy(S.lastBal) || "—"],
        [bi("শেষ ক্যাশ খাতা", "Latest Cash Book"), dmy(S.lastBook) || "—"]
      ]) + `<div class="adm-overview">${destinations.map(([key, description]) => {
        const {icon, label} = pages.get(key);
        return `<a class="card adm-destination" href="#/admin?tab=${key}"><span class="adm-destination-icon">${ico(icon)}</span><strong>${esc(label)}</strong><span class="mut sm">${esc(description)}</span></a>`;
      }).join("")}</div>
      <div class="pnl-grid" id="pnl-live">
        <div class="card pnl-c"><div class="ch"><h3>${ico("users")} ${bi("টিম ও অ্যাক্সেস", "Team & access")}</h3><a class="sm" href="#/admin?tab=usr">${bi("পরিচালনা →", "Manage →")}</a></div><div id="pnl-team" class="pnl-body"><div class="skel" style="height:64px"></div></div></div>
        <div class="card pnl-c"><div class="ch"><h3>${ico("save")} ${bi("ব্যাকআপ ও স্বাস্থ্য", "Backup & health")}</h3><a class="sm" href="#/admin?tab=backup">${bi("খুলুন →", "Open →")}</a></div><div id="pnl-bk" class="pnl-body"><div class="skel" style="height:64px"></div></div></div>
        <div class="card pnl-c pnl-wide"><div class="ch"><h3>${ico("list")} ${bi("সাম্প্রতিক কার্যকলাপ", "Recent activity")}</h3><a class="sm" href="#/admin?tab=audit">${bi("পুরো লগ →", "Full log →")}</a></div><div id="pnl-act" class="pnl-body"><div class="skel" style="height:96px"></div></div></div>
      </div>`;
      const live = () => out.isConnected && $("#pnl-live", out);
      API.users().then(us => { if (!live()) return; const by = r => us.filter(u => u.role === r).length, act = us.filter(u => u.active !== false).length;
        $("#pnl-team", out).innerHTML = `<div class="pnl-kv"><div><b class="num">${us.length}</b><small>${bi("মোট ব্যবহারকারী", "Users")}</small></div><div><b class="num gr">${act}</b><small>${bi("সক্রিয়", "Active")}</small></div><div><b class="num">${us.length - act}</b><small>${bi("নিষ্ক্রিয়", "Inactive")}</small></div></div><div class="pnl-roles">${[["admin", "Admin"], ["staff", "Staff"], ["boss", "Boss"]].map(([k, l]) => `<span class="tag">${l} <b class="num">${by(k)}</b></span>`).join("")}</div>`; }).catch(() => { if (live()) $("#pnl-team", out).innerHTML = `<div class="mut sm">—</div>`; });
      Promise.allSettled([API.backups(), API.offsiteRuns()]).then(([b, o]) => { if (!live()) return; const bl = b.value || [], last = bl[0], off = (o.value || [])[0], age = last ? Math.floor((Date.now() - new Date(last.at)) / 864e5) : null;
        $("#pnl-bk", out).innerHTML = `<div class="pnl-kv"><div><b class="num">${bl.length}</b><small>${bi("Snapshot", "Snapshots")}</small></div><div><b class="num ${age == null ? "rd" : age > 2 ? "am" : "gr"}">${age == null ? "—" : age === 0 ? bi("আজ", "Today") : age + bi(" দিন আগে", "d ago")}</b><small>${bi("শেষ Snapshot", "Last snapshot")}</small></div><div><b class="${off ? (off.ok ? "gr" : "rd") : "mut"}">${off ? (off.ok ? "OK" : bi("ব্যর্থ", "Failed")) : "—"}</b><small>${bi("অফসাইট", "Offsite")}</small></div></div><div class="mut xs">${age == null ? bi("এখনো কোনো ব্যাকআপ নেই — এখনই একটি নিন।", "No backup yet — take one now.") : age > 2 ? bi("ব্যাকআপ পুরনো হচ্ছে — নতুন Snapshot নিন।", "Backup is getting old — take a fresh snapshot.") : bi("ব্যাকআপ আপ-টু-ডেট।", "Backups are up to date.")}</div>`; });
      API.audit({ limit: 6 }).then(rs => { if (!live()) return; rs = (rs || []).slice(0, 6);
        $("#pnl-act", out).innerHTML = rs.length ? `<ul class="pnl-feed">${rs.map(r => `<li><span class="pnl-dot ${r.action === "delete" ? "rd" : r.action === "insert" ? "gr" : "am"}"></span><span class="pnl-tx"><b>${esc(AU_T[r.tbl] || r.tbl || "")}</b> <span class="mut">${esc(r.action || "")}</span> · ${esc(String(r.row_key || "").slice(0, 60))}</span><span class="mut xs">${esc(r.user_name || "")} · ${relTime(new Date(r.at).getTime())}</span></li>`).join("")}</ul>` : `<div class="mut sm">${bi("এখনো কোনো কার্যকলাপ নেই", "No activity yet")}</div>`; }).catch(() => { if (live()) $("#pnl-act", out).innerHTML = `<div class="mut sm">—</div>`; });
    } else if (tab === "acc") {
      const F = accountFilters;
      const compare = new Intl.Collator(LANG === "bn" ? "bn" : "en", {numeric:true, sensitivity:"base"}).compare;
      const banks = [...new Set(S.accounts.map(a => a.bank).filter(Boolean))].sort(compare);
      out.innerHTML = metrics([[bi("সব অ্যাকাউন্ট", "All accounts"), S.accounts.length], [bi("সক্রিয়", "Active"), S.accounts.filter(a => a.status === "Active").length], [bi("সক্রিয় দৈনিক ক্লোজিং", "Active in daily closing"), S.accounts.filter(a => a.status === "Active" && a.daily).length], [bi("সক্রিয় · তথ্য অসম্পূর্ণ", "Active · incomplete"), S.accounts.filter(a => a.status === "Active" && !isMFS(a) && accMissing(a).length).length]]) +
        `<div class="card adm-tools">
          <div class="adm-toolbar">${searchBox("aa-q", bi("কোড, হোল্ডার, ব্যাংক, A/C বা Routing", "Code, holder, bank, A/C or routing"))}<button class="btn pri" id="ac-add">${ico("plus")} ${bi("নতুন অ্যাকাউন্ট", "New account")}</button></div>
          <div class="adm-filters">
            <label><span class="f">${bi("অবস্থা", "Status")}</span><select class="in" id="aa-s"><option value="">${all}</option><option>Active</option><option>Closed</option></select></label>
            <label><span class="f">${bi("ব্যাংক", "Bank")}</span><select class="in" id="aa-bank"><option value="">${all}</option>${banks.map(bank => `<option value="${esc(bank)}">${esc(bank)}</option>`).join("")}</select></label>
            <label><span class="f">${bi("রেকর্ডের ধরন", "Account scope")}</span><select class="in" id="aa-d"><option value="">${all}</option><option value="daily">${bi("দৈনিক ক্লোজিং", "Daily closing")}</option><option value="missing">${bi("অসম্পূর্ণ", "Incomplete")}</option></select></label>
            <label><span class="f">${bi("সাজান", "Sort by")}</span><select class="in" id="aa-sort"><option value="order">${bi("এন্ট্রি ক্রম", "Account order")}</option><option value="bank">${bi("ব্যাংক A–Z", "Bank A–Z")}</option><option value="code">A/C A–Z</option></select></label>
          </div></div><div class="mut sm adm-count" id="aa-n" role="status"></div><div class="card flush"><div id="aa-out"></div></div>`;
      const list = () => {
        const q = chequeSearchKey(F.q);
        const arr = S.accounts.filter(a => {
          if (F.status && a.status !== F.status || F.bank && a.bank !== F.bank) return false;
          if (F.daily === "daily" && !a.daily || F.daily === "missing" && (isMFS(a) || !accMissing(a).length)) return false;
          return !q || chequeSearchKey([a.code,a.holder,a.bank,a.acno,a.branch,a.routing].join(" ")).includes(q);
        }).sort((a,b) => F.sort === "bank" ? compare(a.bank || "", b.bank || "") || compare(a.code,b.code)
          : F.sort === "code" ? compare(a.code,b.code) : (a.sort || 0) - (b.sort || 0));
        $("#aa-n", out).textContent = bi(`${arr.length}টি অ্যাকাউন্ট`, `${arr.length} accounts shown`);
        $("#aa-out", out).innerHTML = arr.map(a => {
          const brand = brandOf(a), missing = accMissing(a);
          return `<div class="adm-account" style="--bank-color:${brand.c1}"><div class="adm-account-ref"><span class="adm-brand">${esc(brand.s)}</span><div><b>${esc(a.code)}</b><div>${esc(a.holder || "—")}</div></div></div>
            <div class="adm-account-detail"><b>${esc(a.bank || "—")}</b><div class="mut sm">${esc([a.branch, a.acno && fmtAcno(a.acno)].filter(Boolean).join(" · "))}</div></div>
            <div class="adm-actions"><span class="tag">${esc(a.status || "—")}</span>${a.daily ? `<span class="tag t-chg">${bi("দৈনিক", "Daily")}</span>` : ""}${missing.length ? `<span class="tag adm-attention">${bi(`${missing.length} তথ্য বাকি`, `${missing.length} missing`)}</span>` : ""}</div>
            <button class="btn sm" type="button" data-a="${esc(a.code)}" aria-label="${bi("এডিট", "Edit")} ${esc(a.code)}">${ico("edit")} ${bi("এডিট", "Edit")}</button></div>`;
        }).join("") || `<div class="empty">${bi("কোনো অ্যাকাউন্ট মেলেনি", "No accounts match")}</div>`;
        $$("[data-a]", out).forEach(btn => btn.onclick = () => accountModal(S.accounts.find(a => a.code === btn.dataset.a), refresh));
      };
      for (const [id, key] of [["aa-q","q"],["aa-s","status"],["aa-bank","bank"],["aa-d","daily"],["aa-sort","sort"]]) {
        const el = $("#" + id, out); el.value = F[key]; el.oninput = () => { F[key] = el.value; list(); };
      }
      $("#aa-q", out).setAttribute("aria-label", bi("অ্যাকাউন্ট খুঁজুন", "Search accounts"));
      $("#ac-add", out).onclick = () => accountModal(null, refresh); list();
    } else if (tab === "usr") {
      out.innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
      let us, secM = {};
      try {
        const [users, security] = await Promise.all([API.users(), API.userSec().catch(() => [])]);
        if (!out.isConnected) return;
        us = users; security.forEach(x => secM[x.user_id] = x);
      } catch (e) { if (out.isConnected) out.innerHTML = `<div class="alert rd">${esc(e.message)}</div>`; return; }
      const accessReady = DEMO || us.some(u => Object.hasOwn(u, "module_access"));
      const F = userFilters;
      out.innerHTML = metrics([[bi("ব্যবহারকারী", "Users"), us.length], [bi("সক্রিয়", "Active"), us.filter(u => u.active).length], [bi("কাস্টম অ্যাক্সেস", "Custom access"), us.filter(u => u.role !== "admin" && u.module_access != null).length]]) +
        `<div class="card adm-tools"><div class="adm-toolbar">${searchBox("u-find", bi("নাম বা ইমেইল", "Name or email"))}<button class="btn pri" id="u-new">${ico("plus")}<span>${bi("নতুন ব্যবহারকারী", "New user")}</span></button></div>
          <div class="adm-actions"><select class="in" id="u-role" aria-label="${bi("রোল", "Role")}"><option value="">${bi("সব রোল", "All roles")}</option><option value="admin">Admin</option><option value="staff">Staff</option><option value="boss">Boss</option></select><select class="in" id="u-state" aria-label="${bi("অবস্থা", "Status")}"><option value="">${all}</option><option value="active">${bi("সক্রিয়", "Active")}</option><option value="inactive">${bi("নিষ্ক্রিয়", "Inactive")}</option></select></div></div>
          ${accessReady ? "" : `<div class="alert am adm-count">${bi("মডিউল অ্যাক্সেস চালু করতে schema_module_access.sql প্রয়োগ করুন।", "Apply schema_module_access.sql to enable module access.")}</div>`}
          <div class="mut sm adm-count" id="u-count" role="status"></div><div class="ulist" id="u-results"></div>`;
      const list = () => {
        const key = chequeSearchKey(F.q);
        const users = us.filter(u => (!F.role || u.role === F.role) && (!F.status || u.active === (F.status === "active")) &&
          (!key || chequeSearchKey([u.name,u.email].join(" ")).includes(key)));
        $("#u-count", out).textContent = bi(`${users.length} জন ব্যবহারকারী`, `${users.length} users shown`);
        $("#u-results", out).innerHTML = users.length ? `${users.map(u => `<div class="card uc ${u.active ? "" : "off"}" data-u="${u.id}"><div class="uh">${avaEl(u.id, u.name, u.email)}<div class="ue"><b>${esc(u.name || "—")}</b><div class="mut xs">${esc(u.email)}</div></div></div>
        <div class="row" style="gap:6px;margin-bottom:12px"><span class="pill">${esc(u.role)}</span><span class="tag ${u.active ? "ok" : "off"}">${u.active ? (LANG === "en" ? "Active" : "সক্রিয়") : (LANG === "en" ? "Inactive" : "নিষ্ক্রিয়")}</span>${secM[u.id]?.has_2fa ? `<span class="tag ok" title="2FA">${ico("lock")} 2FA</span>` : ""}${secM[u.id]?.sessions ? `<span class="tag" title="${LANG === "en" ? "Signed-in devices" : "লগইন ডিভাইস"}">${ico("phone")} ${secM[u.id].sessions}</span>` : ""}${u.role === "staff" ? `<span class="tag ${u.edit_days ? "ok" : "off"}" title="${LANG === "en" ? "Edit window for own entries" : "নিজের এন্ট্রি এডিটের সময়"}">✎ ${u.edit_days ? u.edit_days + (LANG === "en" ? " day" : " দিন") : (LANG === "en" ? "Edit off" : "এডিট বন্ধ")}</span>` : ""}${u.id === S.me.id ? `<span class="mut xs">${LANG === "en" ? "This is you" : "এটা আপনি"}</span>` : ""}</div>
        <div class="adm-user-access mut sm">${u.role === "admin" ? bi("পূর্ণ অ্যাডমিন অ্যাক্সেস", "Full Admin access") : u.module_access == null ? bi("রোলের ডিফল্ট", "Role defaults") :
          MODULE_ACCESS.filter(([key]) => u.module_access[key]?.entry || u.module_access[key]?.edit).map(([key,bn,en]) => esc(bi(bn,en) + " · " + [u.module_access[key].entry && bi("এন্ট্রি","Entry"),u.module_access[key].edit && bi("এডিট","Edit")].filter(Boolean).join(" + "))).join("<br>") || bi("এন্ট্রি ও এডিট বন্ধ", "Entry and edit disabled")}</div>
        <div class="adm-user-actions"><button class="btn pri sm fix" data-ed="${u.id}">${ico("edit")} ${LANG === "en" ? "Edit" : "এডিট"}</button><button class="btn sm fix" data-pw="${u.id}">${ico("key")} ${LANG === "en" ? "Reset password" : "পাসওয়ার্ড রিসেট"}</button><button class="btn sm fix" data-sc="${u.id}">${ico("shield")} ${LANG === "en" ? "Security" : "সিকিউরিটি"}</button>${accessReady && u.role !== "admin" ? `<button class="btn sm" data-ma="${esc(u.id)}">${ico("sliders")} ${bi("মডিউল অ্যাক্সেস", "Module access")}</button>` : ""}</div></div>`).join("")}` : `<div class="card empty">${bi("কোনো ব্যবহারকারী মেলেনি", "No users match")}</div>`;
        $$("[data-ed]", out).forEach(b => b.onclick = () => editUserModal(us.find(u => u.id === b.dataset.ed), refresh));
        $$("[data-sc]", out).forEach(b => b.onclick = () => userSecModal(us.find(u => u.id === b.dataset.sc), refresh));
        $$("[data-pw]", out).forEach(b => b.onclick = () => resetPwModal(us.find(u => u.id === b.dataset.pw)));
        $$("[data-ma]", out).forEach(b => b.onclick = () => moduleAccessModal(us.find(u => u.id === b.dataset.ma), refresh));
      };
      for (const [id,key] of [["u-find","q"],["u-role","role"],["u-state","status"]]) {
        const el = $("#" + id, out); el.value = F[key]; el.oninput = () => { F[key] = el.value; list(); };
      }
      $("#u-find", out).setAttribute("aria-label", bi("ব্যবহারকারী খুঁজুন","Search users"));
      $("#u-new", out).onclick = () => newUserModal(refresh);
      list();
    } else {
      out.innerHTML = `<div class="adm-setup"><section class="card" id="adm-status" aria-labelledby="adm-status-title">
        <div class="adm-setup-head"><h3 id="adm-status-title">${ico("pulse")} ${bi("সিস্টেম অবস্থা","System status")}</h3><button type="button" class="btn sm" id="adm-recheck">${bi("আবার পরীক্ষা","Recheck status")}</button></div>
        <div id="adm-offline"></div><div class="hcl" id="adm-health"></div>
      </section>
      <details class="card" id="adm-imports"><summary>${bi("পুরনো ডাটা ইমপোর্ট", "Historical imports")}</summary>
      <p class="mut sm">${bi("মূল Bank balance archive বা Tally voucher export থেকে প্রথমবার ডাটা আনতে ব্যবহার করুন।", "Use these tools to import the original bank balance archive or a raw Tally voucher export.")}</p>
      <section id="adm-history" aria-labelledby="adm-history-title"></section></details>
      <section class="card adm-setup-links"><h3>⚡ দ্রুত লিংক</h3><div class="qlinks"><a href="#/admin?tab=backup">${ico("shield")} ${bi("ব্যাকআপ ও রিস্টোর", "Backup & Restore")}</a><a href="#/books">${ico("book")} চেক বই</a><a href="#/settings">${ico("gear")} সেটিংস</a><a href="https://supabase.com/dashboard/project/mtzxcwuojiajsanearsz" target="_blank" rel="noopener">${ico("bank")} Supabase ড্যাশবোর্ড ↗</a><a href="https://github.com/ruhulaminrevens/nabiad" target="_blank" rel="noopener">${ico("copyt")} GitHub কোড ↗</a><button type="button" class="btn" id="adm-go-users">${ico("users")} ${bi("ব্যবহারকারী ব্যবস্থাপনা","Manage users")}</button></div></section></div>`;
      if (!DEMO) {
        $("#adm-history",out).insertAdjacentHTML("afterend", `<section class="adm-import-tally"><h3>${bi("Tally ভাউচার ইতিহাস","Tally voucher history")}</h3>
          <p class="mut sm">${bi("একবার import করলে Cash Register-এর Tally vouchers-এ সেভ করা ইতিহাস পাবেন।","Import once to view saved history under Cash Register → Tally vouchers.")}</p>
          <button type="button" class="btn" id="adm-tally-import">${ico("book")} ${bi("Tally ইতিহাস ইমপোর্ট","Import Tally history")}</button>
          <input type="file" hidden accept=".json,application/json" id="adm-tally-file"><p class="mut sm" role="status" id="adm-tally-result"></p></section>`);
        const input = $("#adm-tally-file",out), button = $("#adm-tally-import",out), status = $("#adm-tally-result",out);
        button.onclick = () => { if (navigator.onLine) input.click(); else toast(bi("ইন্টারনেট প্রয়োজন","Connect to the internet to import"),"err"); };
        input.onchange = async () => {
          const file = input.files[0]; input.value = ""; if (!file || button.disabled) return;
          button.disabled = true; status.textContent = bi("ফাইল যাচাই হচ্ছে…","Checking file…");
          try {
            const count = await cashTallyImport(file);
            status.textContent = count == null ? "" : bi(`${money0(count)}টি নতুন voucher যোগ হয়েছে।`,`${money0(count)} new vouchers added.`);
          } catch (error) {
            status.textContent = tallySchemaMissing(error) ? bi("schema_cash_tally.sql প্রয়োজন।","Apply schema_cash_tally.sql first.")
              : /cash_tally_voucher_conflict/.test(error.message || "") ? bi("আগের voucher-এর সঙ্গে অমিল। কোনো voucher যোগ হয়নি।","An existing voucher has a different ledger or amount. Nothing was imported.")
              : error.message || String(error);
          } finally { button.disabled = false; }
        };
      }
      $("#adm-go-users",out).onclick = () => open("usr");
      const history = $("#adm-history",out), health = $("#adm-health",out), offline = $("#adm-offline",out), recheck = $("#adm-recheck",out);
      const row = (ok, l, sub) => `<div class="hc ${ok ? "ok" : "no"}"><i>${ok ? "✓" : "✗"}</i><div><b>${l}</b>${sub ? `<div class="mut xs">${sub}</div>` : ""}</div></div>`;
      const renderOffline = () => paintOfflineStatus(offline,row);
      const check = async () => {
        recheck.disabled = true;
        health.textContent = bi("পরীক্ষা হচ্ছে…","Checking…");
        renderOffline();
        const chk = navigator.onLine || DEMO ? await API.health().catch(() => ({})) : null;
        if (!health.isConnected) return;
        health.innerHTML = chk ? `
          ${row(chk.db, "ডাটাবেস সংযোগ", DEMO ? bi("DEMO মোড", "DEMO mode") : "Supabase")}${row(chk.v2, "v2: ড্রাফট · রিমাইন্ডার · Audit · ছবি", chk.v2 ? "চালু" : "schema_v2.sql চালাতে হবে")}
          ${row(chk.v3, "v3: ক্যাশ · Backup · নিজের নাম", chk.v3 ? "চালু" : "schema_v3.sql চালাতে হবে")}${row(chk.v6, "v6: ডিস্ট্রিবিউশন কালেকশন", chk.v6 ? "চালু" : "schema_v6.sql চালাতে হবে")}
          ${row(chk.modules, bi("মডিউল অ্যাক্সেস","Module access"), chk.modules ? bi("ডাটাবেসে সক্রিয়","Enabled in database") : "schema_module_access.sql")}
          ${row(chk.inventory,bi("ইনভেন্টরি","Inventory"),chk.inventory ? bi("সক্রিয়","Active") : bi("স্ট্যাটাস পাওয়া যায়নি","Unavailable"))}
          ${row(chk.backup,"রাত ১২টার Backup",chk.backupAt ? esc(auditStamp(chk.backupAt)) : "এখনো হয়নি")}
          ${row(window.isSecureContext,"HTTPS",esc(location.host))}` : `<p class="mut sm">${bi("সার্ভারের অবস্থা দেখতে ইন্টারনেট লাগবে।","Connect to the internet to check server status.")}</p>`;
        health.insertAdjacentHTML("beforeend", `<span class="mut xs">${bi("সংস্করণ","Version")} · ${esc(RUN_V)}</span>`);
        recheck.disabled = false;
      };
      for (const event of ["pwa-state","online","offline"]) window.addEventListener(event, renderOffline, {signal:setupSignal});
      recheck.onclick = () => { if (navigator.onLine) preparePwa(true); check(); };
      check();
      history.innerHTML = `<h3 id="adm-history-title">${ico("dl")} ${bi("পুরনো ব্যাংক ব্যালেন্স ইতিহাস","Old bank balance history")}</h3><p class="mut sm">${bi("লোড হচ্ছে…","Loading…")}</p>`;
      const st = navigator.onLine || DEMO ? await API.balanceStats().catch(() => ({})) : {};
      if (!history.isConnected) return;
      history.innerHTML = `<h3 id="adm-history-title">${ico("dl")} ${bi("পুরনো ব্যাংক ব্যালেন্স ইতিহাস","Old bank balance history")}</h3>
        ${!navigator.onLine && !DEMO ? `<p class="mut sm">${bi("ইতিহাস দেখতে ও ইমপোর্ট করতে ইন্টারনেট লাগবে।","Connect to the internet to view and import history.")}</p>` : ""}
        <div class="grid g3" style="margin:12px 0"><div class="kv"><span>ডাটাবেসে রেকর্ড</span><b class="num">${st.n == null ? "—" : money0(st.n)}</b></div><div class="kv"><span>সবচেয়ে পুরনো তারিখ</span><b>${st.first ? dmy(st.first) : "—"}</b></div><div class="kv"><span>সর্বশেষ তারিখ</span><b>${st.last ? dmy(st.last) : "—"}</b></div></div>
        ${DEMO ? `<div class="alert gr">${bi("DEMO মোডে পুরনো ডাটা আগে থেকেই লোড আছে।", "In DEMO mode the old data is already loaded.")}</div>` : `<div class="imopt"><div><b>২০২৬ ডাটা পুনরুদ্ধার</b><div class="mut xs">২০২৬-এর সব রেকর্ড + ২০২৬-এর ঠিক আগের শেষ দিনটি (ওটাই ১ জানুয়ারির Opening)</div></div><button class="btn pri" id="im-26">⬆ শুধু ২০২৬</button></div>
        <div class="imopt"><div><b>সম্পূর্ণ ইতিহাস</b><div class="mut xs">০২-০৯-২০২৩ (প্রথম দিন) থেকে ফাইলের শেষ তারিখ পর্যন্ত সব</div></div><button class="btn" id="im-all">⬆ সম্পূর্ণ import</button></div>`}
        <div class="bar" style="margin-top:12px"><i id="im-bar" style="width:0"></i></div><div class="hint" id="im-t"></div>
        <div class="mut xs" style="margin-top:8px">শুধু যে তারিখ+A/C ডাটাবেসে নেই সেগুলোই যোগ হয় — আপনার app-এ সেভ/এডিট করা কোনো ব্যালেন্স বদলায় না, ডুপ্লিকেটও হয় না।</div>`;
      const run = async (mode) => {
        if (importing) return;
        importing = true;
        const b26 = $("#im-26", out), ball = $("#im-all", out);
        try {
          if (!navigator.onLine) throw new Error(bi("ইমপোর্ট করতে ইন্টারনেট লাগবে।","Connect to the internet to import history."));
          b26.disabled = ball.disabled = true;
          const all = await loadEncrypted("history.enc");
          if (!out.isConnected) return; const anchor = all.map(r => r[0]).filter(d => d < "2026-01-01").sort().pop() || "2026-01-01";
          const rows = mode === "26" ? all.filter(r => r[0] >= anchor) : all;
          if (!rows.length) throw new Error(bi("ইমপোর্টের রেকর্ড নেই", "No records to import"));
          if (!ask(bi(`${money0(rows.length)}টি রেকর্ড (${dmy(rows.reduce((m, r) => r[0] < m ? r[0] : m, rows[0][0]))} থেকে) import করবেন? যেগুলো আগে থেকেই আছে সেগুলো বদলাবে না।`, `Import ${money0(rows.length)} record(s) (from ${dmy(rows.reduce((m, r) => r[0] < m ? r[0] : m, rows[0][0]))})? Existing records will not be changed.`))) return;
          await API.importBalances(rows, (a, b) => { $("#im-bar", out).style.width = a / b * 100 + "%"; $("#im-t", out).textContent = `${a} / ${b}`; });
          balCache.clear(); toast("✔ import সম্পূর্ণ"); S.lastBal = await API.lastBalDate(); refresh();
        } catch (e) { toast(e.message, "err"); }
        finally { importing = false; b26.disabled = ball.disabled = false; }
      };
      $("#im-26", out) && ($("#im-26", out).onclick = () => run("26")); $("#im-all", out) && ($("#im-all", out).onclick = () => run("all"));

    }
  };
  await draw();
  return () => { setupEvents?.abort(); childCleanup?.(); };
}
Object.assign(SbAPI, {
  async health() {
    const t = async (tbl, col = "*") => { const { error } = await sb.from(tbl).select(col, { count: "exact", head: true }); return !error; };
    const [db, v2, v3, v6, modules, inventory] = await Promise.all([t("accounts", "code"), t("reminders", "id"), t("cash_records", "date"), t("dist_collections", "id"), t("profiles", "module_access"), t("inv_orders", "id")]);
    let backupAt = null; try { backupAt = (await this.backups())[0]?.at || null; } catch { }
    return { db, v2, v3, v6, modules, inventory, backup: !!backupAt && Date.now() - new Date(backupAt) < 36 * 36e5, backupAt };
  }
});
Object.assign(DemoAPI, { async health() { const b = (demoStore.backups || [])[0]; return { db: true, v2: true, v3: true, v6: true, modules: true, inventory: true, backup: !!b, backupAt: b?.at }; } });

/* ---------- "More" sheet: grouped tiles, ✕ / tap outside / swipe down / phone Back all close it ---------- */
let moreClose = null;
function openMore(keys, mob, bd, lo) {
  if (moreClose) return moreClose();
  const cur = (location.hash.match(/^#\/(\w+)/) || [])[1], dark = getTheme() === "dark";
  const groups = []; keys.filter(k => !mob.includes(k)).forEach(k => { const s = secOf(k); let g = groups.find(x => x.s === s); if (!g) groups.push(g = { s, ks: [] }); g.ks.push(k); });
  groups.sort((a, b) => (a.s === "more" ? 0 : 1) - (b.s === "more" ? 0 : 1));
  const MORE_ORDER = ["dash", "accounts", "books", "register", "dparty", "rem", "settings", "audit", "admin"]; const mg = groups.find(g => g.s === "more"); if (mg) mg.ks.sort((a, b) => (MORE_ORDER.indexOf(a) + 1 || 99) - (MORE_ORDER.indexOf(b) + 1 || 99));
  const el = document.createElement("div"); el.className = "sheet sheet2";
  el.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1"><div class="sh-hd"><div class="grab"></div><b id="drawer-title">সব পাতা</b><button class="iconbtn sh-x" data-x="close" title="বন্ধ">✕</button></div><div class="sh-body">
    ${groups.map(g => `<div class="sh-sec">${g.s === "more" ? "আরও" : SECS[g.s] || "মেনু"}</div><div class="sh-grid">${g.ks.map(k => `<a href="#/${k}" class="${k === cur ? "on" : ""}"><span class="ti">${ico(ROUTES[k].ic)}${bd[k] ? `<span class="badge">${bd[k]}</span>` : ""}</span><span class="tl">${k === "dash" ? "হোম" : ROUTES[k].t}</span></a>`).join("")}</div>`).join("")}
    <div class="sh-foot"><button data-x="th">${ico(dark ? "sun" : "moon")}<span>${dark ? "লাইট থিম" : "ডার্ক থিম"}</span></button><button data-x="lg">${ico("copyt")}<span>${LANG === "bn" ? "English" : "বাংলা"}</span></button><button data-x="ins">${ico("dl")}<span>${LANG === "en" ? "Install app" : "অ্যাপ ইনস্টল"}</span></button><button data-x="lo" class="lo">${ico("out")}<span>লগআউট</span></button></div>
    <div class="mut xs c" style="margin-top:8px">${esc(S.me.name)} · ${esc(S.me.role)}</div></div></div>`;
  document.body.appendChild(el); document.body.classList.add("noscroll");
  const trigger = $("#more"), panel = $(".box", el);
  trigger.setAttribute("aria-expanded", "true");
  $(".sh-x", el).focus({ preventScroll: true });
  history.pushState({ more: 1 }, "");
  let closed = false;
  const close = viaPop => {
    if (closed) return; closed = true; moreClose = null; window.removeEventListener("popstate", onPop);
    el.inert = true;
    el.classList.add("out"); document.body.classList.remove("noscroll");
    trigger.setAttribute("aria-expanded", "false");
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
    setTimeout(() => el.remove(), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
    if (!viaPop && history.state?.more) history.back();
  };
  const onPop = () => close(true);
  window.addEventListener("popstate", onPop);
  overlayKeys(panel, () => close());
  moreClose = () => close();
  el.addEventListener("click", ev => {
    if (ev.target === el) return close();
    const a = ev.target.closest("a[href^='#/']");
    if (a) { ev.preventDefault(); const h = a.getAttribute("href"); close(true); history.replaceState(null, "", h); route(); return; }
    const x = ev.target.closest("[data-x]"); if (!x) return;
    if (x.dataset.x === "close") close();
    else if (x.dataset.x === "th") { setTheme(dark ? "light" : "dark"); close(); }
    else if (x.dataset.x === "ins") { close(); setTimeout(installModal, 60); }
    else if (x.dataset.x === "lg") { close(); setTimeout(() => setLang(LANG === "bn" ? "en" : "bn"), 60); }
    else if (x.dataset.x === "lo") lo();
  });
  let y0 = null; const hd = $(".sh-hd", el);
  hd.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; }, { passive: true });
  hd.addEventListener("touchend", e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 50) close(); y0 = null; });
}


/* ---------- bank brand colours (approximate brand palettes; edit here if a shade looks off) ---------- */
const BRAND = {
  ABL: ["#00843d", "#d71920", "Agrani"], BBL: ["#0067b1", "#1b365d", "BRAC"], DBBL: ["#00703c", "#c8102e", "DBBL"], IFIC: ["#0054a6", "#ed1c24", "IFIC"],
  IBBL: ["#00693c", "#c9a227", "IBBL"], PBL: ["#00508f", "#e31b23", "Pubali"], UCB: ["#c8102e", "#6d0f1f", "UCB"], EBL: ["#00427a", "#f7931d", "EBL"],
  NBL: ["#ce1126", "#003b73", "NBL"], SBL: ["#006b3f", "#e30613", "SBL"], MBL: ["#0e3d8c", "#e2231a", "MBL"], SONALI: ["#f39200", "#1d3f8c", "Sonali"],
  JANATA: ["#004b93", "#e31e24", "Janata"], RUPALI: ["#00529b", "#7a8c99", "Rupali"], CITY: ["#e2231a", "#1c1c1c", "City"], PRIME: ["#00539b", "#00a3e0", "Prime"],
  BAL: ["#005ba4", "#e31b23", "B.Asia"], DHAKA: ["#00539f", "#00a0df", "Dhaka"], JBL: ["#004b87", "#00a651", "Jamuna"], MTBL: ["#ab1e36", "#1b3a6b", "MTB"],
  SEBL: ["#006c35", "#8dc63f", "SEBL"], ONE: ["#00529c", "#ed1c24", "ONE"], TBL: ["#006838", "#c99a2e", "Trust"], UBL: ["#00468b", "#00a1e4", "Uttara"],
  AB: ["#e31b23", "#00427a", "AB"], NCC: ["#003d7c", "#e31e24", "NCC"], PREMIER: ["#d71921", "#231f20", "Premier"], EXIM: ["#004990", "#00a859", "EXIM"],
  AIBL: ["#00843d", "#004b2d", "AIBL"], SJIBL: ["#006837", "#f6a01a", "SJIBL"], FSIBL: ["#00843f", "#1f3f73", "FSIBL"], SIBL: ["#00843d", "#ed1c24", "SIBL"],
  SCB: ["#0473ea", "#38d200", "SC"], HSBC: ["#db0011", "#4d4d4d", "HSBC"], BKB: ["#008540", "#f7a600", "BKB"], NAGAD: ["#ec1c24", "#f6921e", "Nagad"], BKASH: ["#e2136e", "#9c0d4c", "bKash"]
};
function brandOf(a) {
  let p = String(a?.code || "").split("-")[0].toUpperCase();
  if (!BRAND[p]) { const bk = BANKS.find(b => b.split("|")[0].toLowerCase() === String(a?.bank || "").toLowerCase()); if (bk) p = bk.split("|")[1]; }
  const b = BRAND[p]; return b ? { c1: b[0], c2: b[1], s: b[2] } : { c1: "#4f46e5", c2: "#7c3aed", s: p || "BANK" };
}

/* ---------- cheque photos ---------- */
async function compressImage(file, max = 1600, q = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("ছবি পড়া যায়নি")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement("canvas");
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise(r => cv.toBlob(r, "image/jpeg", q));
  } finally { URL.revokeObjectURL(url); }
}
const photoPath = (id, code, no, date) => `${(date || today()).slice(0, 4)}/${norm(code)}_${no}_${id.slice(0, 8)}_${Date.now().toString(36)}.jpg`;
/* v6.43 — who may edit a cheque: admin always; staff only own entries inside the per-user window (profiles.edit_days, 0 = off) */
const chqEditLeft = c => { if (S.me.role === "admin") return Infinity; if (S.me.role !== "staff") return 0; const d = S.me.edit_days || 0; if (!d || !c.at) return 0; if (c.uid !== S.me.id && !(DEMO && !c.uid && c.by === S.me.name)) return 0; return new Date(c.at).getTime() + d * 864e5 - Date.now(); };
const canEditChq = c => !c.pending && chqEditLeft(c) > 0 && moduleCan("cheque", "edit", true);
const leftTxt = ms => { const h = Math.floor(ms / 36e5); return h >= 24 ? Math.floor(h / 24) + (LANG === "en" ? "d " : " দিন ") + (h % 24) + (LANG === "en" ? "h" : " ঘণ্টা") : Math.max(1, h) + (LANG === "en" ? "h" : " ঘণ্টা"); };
async function showPhoto(el, c) {
  if (!c.photo) return; el.innerHTML = `<div class="skel" style="height:120px"></div>`;
  try { const u = await API.photoUrl(c.photo); el.innerHTML = `<a href="${esc(u)}" target="_blank" rel="noopener" class="chq-ph"><img src="${esc(u)}" alt="cheque"></a>`; }
  catch (e) { el.innerHTML = `<div class="mut sm">${bi("ছবি লোড হয়নি: ", "Photo failed to load: ")}${esc(e.message || e)}</div>`; }
}
/* v6.43 — admin: rename / delete cheque purposes (staff can only add) */
function purposeManage(onChange) {
  const en = LANG === "en";
  const used = p => (S.cheques || []).filter(c => pKey(c.purpose) === pKey(p)).length;
  const save = () => { try { if (!DEMO) localStorage.setItem("nb_purp_v2", JSON.stringify(PURP_X)); } catch (e) { } };
  modal(`<h2>⚙ ${en ? "Cheque purposes" : "চেকের খাত (Purpose)"}</h2>
    <div class="mut xs" style="margin-bottom:10px">${en ? "Renaming also updates old cheques. Deleting only removes it from the list — old cheques keep their purpose. Names starting with Cash / Own / Cancel / Blank / Supplier trigger special handling." : "নাম বদলালে পুরনো চেকের খাতও বদলে যায়। মুছলে শুধু তালিকা থেকে সরে — পুরনো চেকে খাত লেখাই থাকে। Cash / Own / Cancel / Blank / Supplier দিয়ে শুরু নামে বিশেষ নিয়ম (ক্যাশ-টেকার, To A/C, বাতিল) কাজ করে।"}</div>
    <div class="pm-list">${allPurposes().map((p, i) => `<div class="pm-row"><div class="pm-n"><b>${esc(p)}</b><span class="mut xs">${used(p)} ${en ? "cheques" : "টি চেক"}</span></div><button class="btn sm ghost" data-pe="${i}" title="${en ? "Rename" : "নাম বদলান"}">${ico("edit")}</button><button class="btn sm ghost" data-pd="${i}" title="${en ? "Delete" : "মুছুন"}">${ico("trash")}</button></div>`).join("") || `<div class="mut">${en ? "No purposes" : "কোনো খাত নেই"}</div>`}</div>
    <div class="modal-actions"><button class="btn pri" id="pm-x" type="button">${en ? "Done" : "হয়েছে"}</button></div>`, (root, close) => {
    const list = allPurposes();
    $("#pm-x", root).onclick = () => { close(); onChange && onChange(); };
    $$("[data-pe]", root).forEach(b => b.onclick = () => { const old = list[+b.dataset.pe];
      askText(en ? "Rename purpose" : "খাতের নাম বদলান", en ? "New name" : "নতুন নাম", old, async n => {
        if (n === old) return;
        if (allPurposes(true).some(x => x !== old && x.split(" (")[0].trim().toLowerCase() === n.split(" (")[0].trim().toLowerCase())) throw new Error(en ? "This purpose already exists" : "এই খাত আগেই আছে");
        const k = await API.purposeRename(old, n); PURP_X = allPurposes().map(x => x === old ? n : x); save();
        (S.cheques || []).forEach(c => { if (c.purpose === old) c.purpose = n; }); saveCache(); toast(en ? `✔ Renamed${k ? " · " + k + " cheques updated" : ""}` : `✔ নাম বদলেছে${k ? " · " + k + "টি চেক আপডেট" : ""}`);
        setTimeout(() => purposeManage(onChange), 0);
      }); });
    $$("[data-pd]", root).forEach(b => b.onclick = async () => { const nm = list[+b.dataset.pd], u = used(nm);
      if (!ask(en ? `Delete purpose "${nm}"?${u ? `\n${u} existing cheques keep this purpose.` : ""}` : `"${nm}" খাতটি তালিকা থেকে মুছবেন?${u ? `\nপুরনো ${u}টি চেকে এই খাত লেখাই থাকবে।` : ""}`)) return;
      try { await API.purposeDelete(nm); PURP_X = allPurposes().filter(x => x !== nm); save(); toast(en ? "✔ Deleted" : "✔ মোছা হয়েছে"); purposeManage(onChange); } catch (e) { toast(userErr(e), "err"); } });
  });
}
/* ---------- v6.45: OCR (assistive) — Tesseract.js, runs fully in the browser ---------- */
let OCRW = null;
async function ocrCheque(blob, onProg) {
  if (!OCRW) { await loadScript("vendor/ocr/tesseract.min.js"); OCRW = await Tesseract.createWorker("eng", 1, { workerPath: "vendor/ocr/worker.min.js", corePath: "vendor/ocr/core", langPath: "vendor/ocr/lang", gzip: true, workerBlobURL: false, logger: m => { if (m.status === "recognizing text" && onProg) onProg(m.progress); } }); }
  const { data } = await OCRW.recognize(blob); const text = data.text || "";
  const nos = [...new Set((text.replace(/[\s-]/g, " ").match(/\b\d{6,8}\b/g) || []))].slice(0, 6);
  const amts = [...new Set((text.match(/\b\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?\b|\b\d{4,9}(?:\.\d{1,2})?\b/g) || []).map(x => x.replace(/,/g, "")).filter(x => !nos.includes(x) && +x >= 100))].slice(0, 6);
  return { text, nos, amts };
}
async function runOcr(st, box, onNo, onAmt) {
  if (!st.photo) return; box.innerHTML = `<span class="mut xs">🔍 ${bi("পড়া হচ্ছে… (প্রথমবার ~১০ MB ডাউনলোড হতে পারে)", "Reading… (first run downloads ~10 MB)")}</span>`;
  try { const r = await ocrCheque(st.photo, p => { box.firstChild.textContent = `🔍 ${Math.round(p * 100)}%`; });
    const chip = (t, k) => `<span class="chip" data-o="${k}" data-v="${esc(t)}">${k === "n" ? "#" : "৳"} ${esc(k === "a" ? money(+t) : t)}</span>`;
    box.innerHTML = r.nos.length || r.amts.length ? `<div class="mut xs">${bi("সাজেশন — ট্যাপ করে বসান, তারপর নিজে মিলিয়ে নিন:", "Suggestions — tap to fill, then verify yourself:")}</div><div class="row" style="gap:6px;margin-top:4px;flex-wrap:wrap">${r.nos.map(x => chip(x, "n")).join("")}${r.amts.map(x => chip(x, "a")).join("")}</div>` : `<span class="mut xs">${bi("ছবি থেকে কিছু পড়া যায়নি — স্পষ্ট ছবি দিয়ে চেষ্টা করুন", "Nothing readable — try a clearer photo")}</span>`;
    $$("[data-o]", box).forEach(c => c.onclick = () => (c.dataset.o === "n" ? onNo : onAmt)(c.dataset.v));
  } catch (e) { box.innerHTML = `<span class="rd xs">OCR: ${esc(e.message || e)}</span>`; }
}
function photoPicker(root, st, ids, onChange) {
  const inp = $("#" + ids.inp, root), img = $("#" + ids.img, root), x = $("#" + ids.x, root);
  const onPick = async function () { const f0 = this.files[0]; this.value = ""; if (!f0) return; const f = await pickImage(f0, { title: LANG === "en" ? "Crop cheque photo" : "চেকের ছবি ক্রপ", aspect: null }, this); if (!f) return; try { st.photo = await compressImage(f); img.src = URL.createObjectURL(st.photo); img.classList.remove("hide"); x.classList.remove("hide"); onChange && onChange(); } catch (e) { toast(e.message, "err"); } this.value = ""; };
  inp.onchange = onPick; const cam = ids.cam && $("#" + ids.cam, root); if (cam) cam.onchange = onPick;
  x.onclick = e => { e.preventDefault(); st.photo = null; img.classList.add("hide"); x.classList.add("hide"); img.removeAttribute("src"); onChange && onChange(); };
  return () => x.onclick(new Event("click"));
}
function addPhotoModal(c, after) {
  const st = { photo: null };
  modal(`<h2>📷 চেকের ছবি · ${esc(acLabel(c.code))} · ${c.no}</h2><div class="photo-in"><label class="btn" for="p-in-c">${ico("cam")} ছবি তুলুন</label><label class="btn" for="p-in">${ico("img")} গ্যালারি</label><input type="file" id="p-in-c" accept="image/*" capture="environment" hidden><input type="file" id="p-in" accept="image/*" hidden><img id="p-img" class="hide"><button class="btn sm ghost hide" id="p-x">✕</button></div>
   <div class="modal-actions"><button class="btn pri" id="p-ok">${ico("save")} সেভ</button><button class="btn" id="p-c">বাতিল</button></div>`, (root, close) => {
    photoPicker(root, st, { inp: "p-in", cam: "p-in-c", img: "p-img", x: "p-x" }); $("#p-c", root).onclick = close;
    $("#p-ok", root).onclick = async () => {
      if (!st.photo) return toast("ছবি বাছুন", "err"); const b = $("#p-ok", root); b.disabled = true;
      try { const p = photoPath(c.id, c.code, c.no, c.date); await API.uploadPhoto(p, st.photo); await API.setPhoto(c.id, p); c.photo = p; saveCache(); close(); toast("✔ ছবি সেভ হয়েছে"); after && after(); }
      catch (e) { toast("ছবি সেভ হয়নি: " + (/edit_window_closed/.test(e.message || "") ? userErr(e) : (e.message || e)), "err"); b.disabled = false; }
    };
  });
}

/* ---------- reminders ---------- */
const REPEATS = { none: "একবার", hourly: "প্রতি ঘণ্টা", daily: "প্রতিদিন", weekly: "প্রতি সপ্তাহ", monthly: "প্রতি মাস" };
const FOR_ROLE = { me: "শুধু আমি", all: "সবাই", admin: "শুধু Admin" };
const remDue = r => new Date(r.snooze_until || r.due_at);
const dueList = () => (S.reminders || []).filter(r => !r.done && remDue(r) <= new Date());
const localDT = d => { const x = new Date(d); return [iso(x), `${pad(x.getHours())}:${pad(x.getMinutes())}`]; };
function nextOcc(r) {
  const d = new Date(r.due_at), now = Date.now();
  const step = () => { if (r.repeat === "hourly") d.setHours(d.getHours() + 1); else if (r.repeat === "daily") d.setDate(d.getDate() + 1); else if (r.repeat === "weekly") d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1); };
  let i = 0; do step(); while (d.getTime() <= now && ++i < 100000); return d.toISOString();
}
function relTime(d) {
  const m = Math.round((new Date(d) - Date.now()) / 6e4), a = Math.abs(m);
  if (LANG === "en") { const e = a < 60 ? `${a} min` : a < 1440 ? `${Math.round(a / 60)} h` : `${Math.round(a / 1440)} day${Math.round(a / 1440) === 1 ? "" : "s"}`; return m < 0 ? `${e} ago` : m === 0 ? "now" : `in ${e}`; }
  const s = a < 60 ? `${a} ${bi("মিনিট", "min")}` : a < 1440 ? `${Math.round(a / 60)} ${bi("ঘণ্টা", "h")}` : `${Math.round(a / 1440)} ${bi("দিন", "days")}`;
  return m < 0 ? `${s} আগে` : m === 0 ? "এখন" : `${s} পরে`;
}
function sysAlerts() {
  const o = [], t = today(), h = new Date().getHours();
  if (S.me.role !== "boss") {
    if (!isFri(t) && h >= (CFG.CLOSING_REMIND_HOUR ?? 17) && (!S.lastBal || S.lastBal < t)) o.push({ id: "closing-" + t, k: "rd", ic: "bank", t: "আজকের দৈনিক ক্লোজিং এখনো সেভ হয়নি", go: "#/closing", notify: true });
    if (!isFri(t) && h >= (CFG.CASH_REMIND_HOUR ?? 19) && S.lastCash !== t && S.lastBook !== t && !S.cashOff) o.push({ id: "cash-" + t, k: "rd", ic: "wallet", t: bi("আজকের ক্যাশ খাতা এখনো সেভ হয়নি", "Today's Cash Book is not saved yet"), go: "#/cash", notify: true });
    if (S.lastBal) { const g = workGap(S.lastBal, t); if (g > 0) o.push({ k: "am", ic: "bank", t: LANG === "en" ? `${g} working day${g > 1 ? "s" : ""} of closing pending (last saved: ${dmy(S.lastBal)})` : `${g} কর্মদিবসের ক্লোজিং বাকি (শেষ সেভ: ${dmy(S.lastBal)})`, go: "#/closing" }); }
    const dd = Draft.localDates().filter(d => !S.lastBal || d > S.lastBal); if (dd.length) o.push({ k: "vi", ic: "edit", t: `ড্রাফট আছে, ফাইনাল সেভ বাকি: ${dd.map(dmy).join(", ")}`, go: "#/closing" });
    if (!DEMO && Outbox.count()) o.push({ k: "am", ic: "clock", t: `${Outbox.count()}টি অফলাইন এন্ট্রি সিঙ্ক বাকি`, go: "" });
    if (!DEMO && Outbox.deadCount()) o.push({ k: "rd", ic: "alert", t: bi(`${Outbox.deadCount()}টি অফলাইন এন্ট্রি সার্ভার নেয়নি — সেটিংস-এ দেখুন`, `${Outbox.deadCount()} offline ${Outbox.deadCount() === 1 ? "entry was" : "entries were"} rejected by the server — see Settings`), go: "#/settings" });
  }
  const old = pendingOld(); if (old.length) o.push({ k: "am", ic: "clock", t: bi(`${old.length}টি চেক ${CFG.PENDING_ALERT_DAYS ?? 3} দিনের বেশি Pending`, `${old.length} cheques pending for more than ${CFG.PENDING_ALERT_DAYS ?? 3} days`), go: "#/status" });
  const miss = allMissing(); if (miss.length) o.push({ k: "am", ic: "book", t: bi(`মিসিং চেক পাতা আছে: ${miss.slice(0, 3).map(x => x.b.code).join(", ")}`, `Missing cheque leaves: ${miss.slice(0, 3).map(x => x.b.code).join(", ")}`), go: "#/books" });
  const om = openMarks(); if (om.length) o.push({ k: "am", ic: "book", t: bi(`${om.length}টি পাতা (মুড়ি ফাঁকা/হারানো) খুঁজে নিষ্পত্তি বাকি`, `${om.length} leaf(s) (blank stub / lost) still to be traced`), go: "#/books", pre: "leaves" });
  return o;
}
function updateBell() {
  const b = $("#bell"); if (!b || !S.me) return; const n = dueList().length, sys = sysAlerts();
  const bb = $(".bb", b); bb.textContent = n || ""; bb.className = "bb" + (n ? " on" : sys.length ? " dot" : "");
  b.title = bi(`${n}টি রিমাইন্ডার সময় হয়েছে · ${sys.length}টি সতর্কতা`, `${n} reminder(s) due · ${sys.length} alert(s)`);
}
function beep() { try { const C = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.22].forEach(t0 => { const o = C.createOscillator(), g = C.createGain(); o.frequency.value = 880; o.connect(g); g.connect(C.destination); g.gain.setValueAtTime(0.0001, C.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.25, C.currentTime + t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, C.currentTime + t0 + 0.18); o.start(C.currentTime + t0); o.stop(C.currentTime + t0 + 0.2); }); } catch { } }
async function sysNotify(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opt = { body: body || "", icon: "icon-192.png", badge: "badge-96.png", tag, data: { url: "#/rem" } };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return await reg.showNotification(title, opt); new Notification(title, opt); } catch { }
}
const SEEN_KEY = "nabiad_rem_seen";
function remTick() {
  if (!S.me || !$("#bell")) return; updateBell();
  let seen; try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { seen = {}; }
  const key = r => r.id + "|" + (r.snooze_until || r.due_at);
  const due = dueList().filter(r => !seen[key(r)]);
  const sysN = sysAlerts().filter(a => a.notify && !seen[a.id]);
  if (!due.length && !sysN.length) return;
  due.forEach(r => seen[key(r)] = Date.now()); sysN.forEach(a => seen[a.id] = Date.now());
  const cut = Date.now() - 60 * 864e5; for (const k in seen) if (seen[k] < cut) delete seen[k];
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { }
  if (PREFS.sound) beep();
  due.forEach(r => sysNotify("⏰ " + r.title, r.note || "Nabiad রিমাইন্ডার", "rem-" + r.id));
  sysN.forEach(a => sysNotify("⚠ " + a.t, "NABIAD Smart Finance Suite", a.id));
  if (due.length && !$(".mback")) dueModal(due); else if (sysN.length) toast(sysN[0].t, "err");
}
setInterval(remTick, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) remTick(); });
async function remDone(r) {
  const p = r.repeat && r.repeat !== "none" ? { due_at: nextOcc(r), snooze_until: null } : { done: true, done_at: new Date().toISOString(), snooze_until: null };
  await API.updateReminder(r.id, p); Object.assign(r, p); saveCache(); updateBell();
}
async function remSnooze(r, until) { const p = { snooze_until: until.toISOString() }; await API.updateReminder(r.id, p); Object.assign(r, p); saveCache(); updateBell(); }
const tomorrow10 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; };
function snoozeBtns(id) { return `<button class="btn sm" data-sz="${id}|10">১০ মিনিট</button><button class="btn sm" data-sz="${id}|60">১ ঘণ্টা</button><button class="btn sm" data-sz="${id}|tm">কাল ১০টা</button>`; }
function bindRemActions(root, after) {
  $$("[data-dn]", root).forEach(b => b.onclick = async () => { const r = S.reminders.find(x => x.id === b.dataset.dn); b.disabled = true; try { await remDone(r); toast(r.done ? "✔ সম্পন্ন" : `✔ পরের রিমাইন্ডার: ${new Date(r.due_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`); after(); } catch (e) { toast(e.message, "err"); b.disabled = false; } });
  $$("[data-sz]", root).forEach(b => b.onclick = async () => { const [id, m] = b.dataset.sz.split("|"); const r = S.reminders.find(x => x.id === id); try { await remSnooze(r, m === "tm" ? tomorrow10() : new Date(Date.now() + +m * 6e4)); toast("⏰ পরে মনে করিয়ে দেবে"); after(); } catch (e) { toast(e.message, "err"); } });
  $$("[data-oc]", root).forEach(b => b.onclick = () => { const c = S.cheques.find(x => x.id === b.dataset.oc); if (c) chequeModal(c, () => { }); else toast("চেক পাওয়া যায়নি", "err"); });
}
function dueModal(due) {
  modal(`<h2>⏰ রিমাইন্ডার <span class="tag">${due.length}</span></h2><div class="rem-list">${due.map(r => `<div class="rem due"><div class="rt"><b>${esc(r.title)}</b>${r.note ? `<div class="mut sm">${esc(r.note)}</div>` : ""}<div class="mut sm">${new Date(remDue(r)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${REPEATS[r.repeat] || ""}</div></div>
   <div class="ra"><button class="btn ok sm" data-dn="${r.id}">✓ সম্পন্ন</button>${snoozeBtns(r.id)}${r.cheque_id ? `<button class="btn sm" data-oc="${r.cheque_id}">চেক</button>` : ""}</div></div>`).join("")}</div>
   <div class="modal-actions"><a class="btn" href="#/rem" id="dm-all">সব রিমাইন্ডার</a><button class="btn" id="dm-x">বন্ধ</button></div>`, (root, close) => {
    $("#dm-x", root).onclick = close; $("#dm-all", root).onclick = close;
    bindRemActions(root, () => { const left = dueList(); if (!left.length) close(); else { close(); dueModal(left); } if (CUR === "rem") route(); });
  });
}
function icsFile(r) {
  const z = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const e = s => String(s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const rr = { hourly: "HOURLY", daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" }[r.repeat];
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nabiad//Reminder//BN", "BEGIN:VEVENT", `UID:${r.id}@nabiad`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(remDue(r))}`, `DTEND:${z(remDue(r).getTime() + 15 * 6e4)}`, `SUMMARY:${e(r.title)}`, `DESCRIPTION:${e((r.note || "") + "\nNABIAD Smart Finance Suite")}`, rr ? `RRULE:FREQ=${rr}` : "", "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", `DESCRIPTION:${e(r.title)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].filter(Boolean);
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([L.join("\r\n")], { type: "text/calendar" })); a.download = `reminder_${norm(r.title).slice(0, 20) || "nabiad"}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const remErrMsg = e => /relation|does not exist|schema cache|not find/i.test(e?.message || "") ? "রিমাইন্ডার টেবিল নেই — Supabase-এ schema_v2.sql চালাতে হবে" : (e?.message || String(e));

/* ---------- audit log ---------- */
const AU_T = { cheques: "চেক", cheque_status: "স্ট্যাটাস", balances: "ব্যালেন্স", accounts: "অ্যাকাউন্ট", books: "চেক বই", profiles: "ব্যবহারকারী", users: "ব্যবহারকারী" };
const AU_A = { insert: ["যোগ", "gr"], update: ["বদল", "am"], delete: ["মুছে ফেলা", "rd"] };
const AU_F = { chq_date: "তারিখ", code: "A/C", chq_no: "চেক নং", amount: "টাকা", purpose: "খাত", cash_taker: "কে তুলেছে", party: "পার্টি", to_ac: "To A/C", remarks: "মন্তব্য", new_status: "স্ট্যাটাস", status_date: "স্ট্যাটাস তারিখ", total: "ক্লোজিং", block: "Block", remark: "মন্তব্য", other_debit: "অন্য খরচ", other_deposit: "অন্য জমা", photo: "ছবি", holder: "হোল্ডার", bank: "ব্যাংক", acno: "A/C নং", status: "Status", role: "Role", active: "সক্রিয়", name: "নাম" };
const AU_SKIP = new Set(["created_at", "user_id", "id", "updated_at", "entered_by", "cheque_id"]);
const AU_IDENTIFIERS = new Set(["chq_no", "acno", "leaf_no", "routing", "first_leaf", "last_leaf", "track_from", "phone", "ref"]);
const auV = (value, key) => value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) :
  typeof value === "number" && !AU_IDENTIFIERS.has(key) ? money(value) : String(value);

/* =================== v6: API extensions =================== */
Object.assign(SbAPI, {
  async balancesRange(from, to, { preserveMissing = false } = {}) {
    let out = [], f = 0;
    for (;;) { const { data, error } = await sb.from("balances").select("date,code,total,block").gte("date", from).lte("date", to).order("date").order("code").range(f, f + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; f += 1000; }
    return out.map(r => ({ date: r.date, code: r.code, total: preserveMissing && r.total == null ? null : Number(r.total) || 0, block: Number(r.block) || 0 }));
  },
  async cashOn(d) { const { data, error } = await sb.from("cash_records").select("*").eq("date", d).maybeSingle(); if (error) throw error; return data; },
  async cashPrev(d) { const { data, error } = await sb.from("cash_records").select("*").lt("date", d).eq("status", "final").order("date", { ascending: false }).limit(1); if (error) throw error; return data?.[0] || null; },
  async cashSave(row) { const { error } = await sb.from("cash_records").upsert({ ...row, entered_by: S.me.name, updated_at: new Date().toISOString() }); if (error) throw error; },
  async cashRange(from, to) { const { data, error } = await sb.from("cash_records").select("*").gte("date", from).lte("date", to).order("date").limit(3000); if (error) throw error; return data; },
  async lastCashDate() { const { data, error } = await sb.from("cash_records").select("date").eq("status", "final").order("date", { ascending: false }).limit(1); if (error) throw error; return data?.[0]?.date || null; },
  async cbOn(d) { const { data, error } = await sb.from("cashbook_days").select("*").eq("date", d).maybeSingle(); if (error) throw error; return data; },
  async cbPrev(d) { const { data, error } = await sb.from("cashbook_days").select("*").lt("date", d).eq("status", "final").order("date", { ascending: false }).limit(1); if (error) throw error; return data?.[0] || null; },
  async cbSave(row) { const { error } = await sb.from("cashbook_days").upsert({ ...row, entered_by: S.me.name, updated_at: new Date().toISOString() }); if (error) throw error; },
  async cbRange(from, to) { const { data, error } = await sb.from("cashbook_days").select("*").gte("date", from).lte("date", to).order("date").limit(3000); if (error) throw error; return data; },
  async lastBookDate() { const { data, error } = await sb.from("cashbook_days").select("date").eq("status", "final").order("date", { ascending: false }).limit(1); if (error) throw error; return data?.[0]?.date || null; },
  async backups() { const { data, error } = await sb.from("backups").select("id,at,kind,size_rows").order("at", { ascending: false }).limit(60); if (error) throw error; return data; },
  async offsiteRuns() { const { data, error } = await sb.from("offsite_backup_runs").select("id,kind,ok,stamp,bytes,detail,at").order("at", { ascending: false }).limit(60); if (error) { if (tallySchemaMissing(error)) return null; throw error; } return data; },
  async backupData(id) { const { data, error } = await sb.from("backups").select("data").eq("id", id).single(); if (error) throw error; return data.data; },
  async restoreSnapshot(id, apply = false, tables = null) {
    const { data, error } = await sb.rpc("nabiad_restore_snapshot", {p_backup_id: id, p_apply: apply, p_tables: tables});
    if (error) throw error;
    return data;
  },
  async restoreUploadedBackup(backup, apply = false, tables = null) {
    const { data, error } = await sb.rpc("nabiad_restore_uploaded_backup", {p_data: backup, p_apply: apply, p_tables: tables});
    if (error) throw error;
    return data;
  },
  async backupNow() { const { data, error } = await sb.rpc("make_backup", { k: "manual" }); if (error) throw error; return data; },
  async setMyName(n) { const { error } = await sb.rpc("set_my_name", { n }); if (error) throw error; },
  async changePassword(p) { const { error } = await sb.auth.updateUser({ password: p }); if (error) throw error; },
  async signOutOthers() { const { error } = await sb.auth.signOut({ scope: "others" }); if (error) throw error; },
  async dumpAll() { const o = {}; for (const [t, order] of Object.entries(BACKUP_TABLES)) { try { o[t] = await fetchAll(t, order); } catch (e) { o[t] = { error: e.message }; } } return o; }
});
Object.assign(DemoAPI, {
  async balancesRange(from, to, { preserveMissing = false } = {}) { const h = await this.hist(), out = []; for (const [d, m] of h) if (d >= from && d <= to) for (const c in m) out.push({ date: d, code: c, total: preserveMissing && m[c].total == null ? null : Number(m[c].total) || 0, block: Number(m[c].block) || 0 }); return out.sort((a, b) => a.date.localeCompare(b.date)); },
  async cashOn(d) { return (demoStore.cash ||= {})[d] || null; },
  async cashPrev(d) { const c = demoStore.cash ||= {}; const k = Object.keys(c).filter(x => x < d && c[x].status === "final").sort().pop(); return k ? c[k] : null; },
  async cashSave(row) { const c = demoStore.cash ||= {}; if (c[row.date]) this.aud("cash_records", "update", row.date, c[row.date], row); c[row.date] = { ...row, entered_by: S.me.name, updated_at: new Date().toISOString() }; this.save(); },
  async cashRange(from, to) { const c = demoStore.cash ||= {}; return Object.values(c).filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date)); },
  async lastCashDate() { const c = demoStore.cash ||= {}; return Object.keys(c).filter(k => c[k].status === "final").sort().pop() || null; },
  async cbOn(d) { return (demoStore.cb ||= {})[d] || null; },
  async cbPrev(d) { const c = demoStore.cb ||= {}; const k = Object.keys(c).filter(x => x < d && c[x].status === "final").sort().pop(); return k ? c[k] : null; },
  async cbSave(row) { const c = demoStore.cb ||= {}; if (c[row.date]) this.aud("cashbook_days", "update", row.date, c[row.date], row); c[row.date] = { ...row, entered_by: S.me.name, updated_at: new Date().toISOString() }; this.save(); },
  async cbRange(from, to) { const c = demoStore.cb ||= {}; return Object.values(c).filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date)); },
  async lastBookDate() { const c = demoStore.cb ||= {}; return Object.keys(c).filter(k => c[k].status === "final").sort().pop() || null; },
  async backups() { return (demoStore.backups ||= []).map(({ data, ...b }) => b); },
  async offsiteRuns() { return []; },
  async backupData(id) { return (demoStore.backups || []).find(b => b.id === id)?.data; },
  async backupNow() { const b = { id: Date.now(), at: new Date().toISOString(), kind: "manual", size_rows: demoStore.cheques.length, data: { cheques: demoStore.cheques, cash: demoStore.cash } }; (demoStore.backups ||= []).unshift(b); this.save(); return b.id; },
  async setMyName(n) { S.me.name = n; sessionStorage.setItem("nabiad_demo_user", JSON.stringify(S.me)); },
  async changePassword() { }, async signOutOthers() { },
  async dumpAll() { return { ...demoStore, photos: undefined }; }
});

/* =================== v6: per-device settings =================== */
const PREF_KEY = "nabiad_prefs";
const PREF_DEF = { start: "dash", font: "normal", compact: false, sound: true, closingHour: CFG.CLOSING_REMIND_HOUR ?? 17, cashHour: 19, skipFri: CFG.SKIP_FRIDAY !== false, pendDays: CFG.PENDING_ALERT_DAYS ?? 3 };
let PREFS = (() => { try { return { ...PREF_DEF, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch { return { ...PREF_DEF }; } })();
function applyPrefs() {
  CFG.CLOSING_REMIND_HOUR = +PREFS.closingHour; CFG.CASH_REMIND_HOUR = +PREFS.cashHour; CFG.SKIP_FRIDAY = !!PREFS.skipFri; CFG.PENDING_ALERT_DAYS = +PREFS.pendDays;
  document.documentElement.dataset.font = PREFS.font; document.documentElement.classList.toggle("compact", !!PREFS.compact);
}
function savePrefs(p) { PREFS = { ...PREFS, ...p }; try { localStorage.setItem(PREF_KEY, JSON.stringify(PREFS)); } catch { } applyPrefs(); }
applyPrefs();

/* =================== v6: small chart helpers =================== */
const DCACHE = {};
async function cached(key, ttl, fn) { const c = DCACHE[key]; if (c && Date.now() - c.t < ttl) return c.v; const v = await fn(); DCACHE[key] = { t: Date.now(), v }; return v; }
const dropCache = p => Object.keys(DCACHE).forEach(k => k.startsWith(p) && delete DCACHE[k]);
function spark(vals, color = "#6366f1", h = 64) {
  if (vals.length < 2) return `<div class="mut sm" style="padding:18px 0">ট্রেন্ড দেখাতে আরও ডাটা লাগবে</div>`;
  const w = 300, mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
  const p = vals.map((v, i) => [i / (vals.length - 1) * w, h - 5 - (v - mn) / rg * (h - 10)]), d = p.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1)).join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark" style="height:${h}px"><path d="${d}L${w},${h}L0,${h}Z" fill="${color}" opacity=".13"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${p[p.length - 1][0]}" cy="${p[p.length - 1][1]}" r="3.5" fill="${color}"/></svg>`;
}
function bars2(rows, h = 90, names = ["Receipt", "Payment"], minCols = 12) {
  if (!rows.length) return `<div class="mut sm" style="padding:18px 0">এই সময়ে কোনো রেকর্ড নেই</div>`;
  const mx = Math.max(1, ...rows.flatMap(r => [r.a, r.b])), w = 300, bw = w / Math.max(rows.length, minCols);
  return `<svg viewBox="0 0 ${w} ${h + 14}" preserveAspectRatio="none" class="spark" style="height:${h + 14}px">${rows.map((r, i) => { const x = i * bw, ha = r.a / mx * h, hb = r.b / mx * h, q = Math.max(1, bw * 0.34); return `<rect x="${(x + bw * 0.14).toFixed(1)}" y="${(h - ha).toFixed(1)}" width="${q.toFixed(1)}" height="${ha.toFixed(1)}" rx="2" fill="#10b981"><title>${r.l} · ${names[0]} ${money0(r.a)}</title></rect><rect x="${(x + bw * 0.14 + q + 1).toFixed(1)}" y="${(h - hb).toFixed(1)}" width="${q.toFixed(1)}" height="${hb.toFixed(1)}" rx="2" fill="#f43f5e"><title>${r.l} · ${names[1]} ${money0(r.b)}</title></rect>`; }).join("")}<line x1="0" x2="${w}" y1="${h}" y2="${h}" stroke="currentColor" opacity=".15"/></svg>`;
}
const delta = (a, b) => { if (b == null || a == null) return ""; const d = a - b; if (Math.abs(d) < 1) return `<span class="dl0">— আগের মতো</span>`; return `<span class="${d > 0 ? "dlu" : "dld"}">${d > 0 ? "▲" : "▼"} ${money0(Math.abs(d))}</span>`; };
function balSeries(rows) {
  const am = accMap(), by = new Map();
  rows.forEach(r => { const a = am[r.code]; if (!a || !a.daily) return; const o = by.get(r.date) || { date: r.date, t: 0, b: 0, n: 0 }; o.t += r.total; o.b += r.block; o.n++; by.set(r.date, o); });
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* =================== v6: dashboard =================== */
const greet = () => { const h = new Date().getHours(); return h < 12 ? "শুভ সকাল" : h < 17 ? "শুভ দুপুর" : "শুভ সন্ধ্যা"; };
/* ---- dashboard helpers (v6.31) ---- */
function msp(vals) { // tiny white sparkline for KPI cards
  if (vals.length < 2) return "";
  const w = 120, h = 30, mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
  const d = vals.map((q, i) => (i ? "L" : "M") + (i / (vals.length - 1) * w).toFixed(1) + "," + (h - 3 - (q - mn) / rg * (h - 6)).toFixed(1)).join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="msp"><path d="${d}L${w},${h}L0,${h}Z" fill="#fff" opacity=".16"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
/* two lines on ONE scale + touch/hover tooltip */
function dashLine(el, rows) {
  if (rows.length < 2) { el.innerHTML = `<div class="mut sm" style="padding:22px 0">ট্রেন্ড দেখাতে আরও ডাটা লাগবে</div>`; return; }
  const w = 300, h = 110, all = rows.flatMap(r => [r.t, r.u]), mx = Math.max(...all), mn = Math.min(...all, 0) === 0 && Math.min(...all) > 0 ? Math.min(...all) * 0.92 : Math.min(...all), rg = mx - mn || 1;
  const X = i => i / (rows.length - 1) * w, Y = q => h - 6 - (q - mn) / rg * (h - 14);
  const path = k => rows.map((r, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(r[k]).toFixed(1)).join("");
  el.innerHTML = `<div class="dl-wrap"><div class="dl-tip hide"></div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark dl-svg" style="height:${h}px">
    <path d="${path("t")}L${w},${h}L0,${h}Z" fill="#6366f1" opacity=".12"/><path d="${path("u")}L${w},${h}L0,${h}Z" fill="#10b981" opacity=".10"/>
    <path d="${path("t")}" fill="none" stroke="#6366f1" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <path d="${path("u")}" fill="none" stroke="#10b981" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
    <i class="dl-cur hide"></i><i class="dl-dot a hide"></i><i class="dl-dot b hide"></i></div>`;
  const wrap = $(".dl-wrap", el), tip = $(".dl-tip", el), cur = $(".dl-cur", el), da = $(".dl-dot.a", el), db = $(".dl-dot.b", el);
  const show = e => {
    const r0 = wrap.getBoundingClientRect(), px = Math.min(Math.max((e.clientX - r0.left) / r0.width, 0), 1), i = Math.round(px * (rows.length - 1)), r = rows[i], lx = i / (rows.length - 1) * r0.width;
    [tip, cur, da, db].forEach(n => n.classList.remove("hide")); cur.style.left = lx + "px";
    da.style.cssText = `left:${lx}px;top:${Y(r.t) / h * r0.height}px`; db.style.cssText = `left:${lx}px;top:${Y(r.u) / h * r0.height}px`;
    tip.innerHTML = `<b>${dmy(r.date)}</b><span><i style="background:#6366f1"></i>Total ৳ ${money0(r.t)}</span><span><i style="background:#10b981"></i>Usable ৳ ${money0(r.u)}</span>`;
    tip.style.left = Math.min(Math.max(lx, 78), r0.width - 78) + "px";
  };
  const hide = () => [tip, cur, da, db].forEach(n => n.classList.add("hide"));
  wrap.addEventListener("pointermove", show); wrap.addEventListener("pointerdown", show); wrap.addEventListener("pointerleave", hide);
}
const SEG_C = { Pending: "#f59e0b", Cleared: "#10b981", Bounced: "#ef4444", Stopped: "#8b5cf6", Cancelled: "#94a3b8" };

async function vDash(v) {
  const t = today(), ym = t.slice(0, 7), boss = S.me.role === "boss", admin = S.me.role === "admin";
  const todayC = S.cheques.filter(c => c.date === t && isLive(c)), pend = S.cheques.filter(c => c.status === "Pending"), old = pendingOld();
  const mon = S.cheques.filter(c => c.date.startsWith(ym) && isLive(c)), due = dueList(), sys = sysAlerts();
  const upcoming = (S.reminders || []).filter(r => !r.done).sort((a, b) => remDue(a) - remDue(b)).slice(0, 5);
  const acts = boss ? [["crep", "img", "ব্যাংক সামারি", "qa1"], ["cashsum", "pulse", "ক্যাশ সামারি", "qa2"], ["reports", "chart", "ব্যাংক বিস্তারিত রিপোর্ট", "qa3"], ["dsum", "trend", "কালেকশন সামারি", "qa4"]]
    : [["entry", "plus", "চেক পোস্টিং", "qa1"], ["closing", "bank", "ব্যাংক ক্লোজিং", "qa2"], ["cash", "book", "ক্যাশ খাতা", "qa3"], ["dcol", "coins", "কালেকশন এন্ট্রি", "qa4"]];
  const bankDone = S.lastBal === t, cashDone = S.lastCash === t || S.lastBook === t, workday = !isFri(t);
  const st = (ok, l, go, sub) => `<a class="stchip ${ok ? "ok" : "no"}" href="${go}"><i>${ok ? "✓" : "!"}</i><span><b>${l}</b><small>${sub}</small></span></a>`;
  /* today's progress */
  const tasks = [...(boss ? [] : [[bankDone || !workday, "ব্যাংক ক্লোজিং"], [cashDone || !workday, "ক্যাশ খাতা"]]), [!due.length, "রিমাইন্ডার"], [!old.length, "পুরনো Pending"]];
  const tdone = tasks.filter(x => x[0]).length, tpct = Math.round(tdone / tasks.length * 100), left = tasks.filter(x => !x[0]).map(x => x[1]);
  const ring = `<svg class="pring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="rb" fill="none" style="fill:none"/><circle cx="22" cy="22" r="18" class="rf" fill="none" style="fill:none" stroke-dasharray="${(tpct * 1.131).toFixed(1)} 113.1" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle">${tpct}%</text></svg>`;
  /* cheque pipeline (this month) */
  const monAll = S.cheques.filter(c => c.date.startsWith(ym)), stc = {};
  monAll.forEach(c => { (stc[c.status] ||= { n: 0, a: 0 }); stc[c.status].n++; stc[c.status].a += c.amount; });
  const ORD = ["Pending", "Cleared", "Bounced", "Stopped", "Cancelled"], skeys = ORD.filter(k => stc[k]).concat(Object.keys(stc).filter(k => !ORD.includes(k)));
  const clearedPct = monAll.length ? Math.round((stc.Cleared?.n || 0) / monAll.length * 100) : 0;
  const pipeline = monAll.length ? `<div class="seg3">${skeys.map(k => `<i style="width:${stc[k].n / monAll.length * 100}%;background:${SEG_C[k] || "#64748b"}" title="${k}"></i>`).join("")}</div>
      <div class="lgl">${skeys.map(k => `<a class="lg" href="#/cheques"><i style="background:${SEG_C[k] || "#64748b"}"></i><span>${k}</span><b class="num">${stc[k].n}</b><em class="num">৳ ${money0(stc[k].a)}</em></a>`).join("")}</div>
      <div class="pfoot"><div><small>সব Pending (মোট)</small><b class="num">৳ ${money0(sumAmt(pend))}</b></div><div><small>আজকের চেক</small><b class="num">৳ ${money0(sumAmt(todayC))}</b></div><div><small>Clear হয়েছে</small><b class="num gr">${clearedPct}%</b></div></div>`
    : `<div class="empty" style="padding:22px 0">এই মাসে এখনো কোনো চেক নেই${boss ? "" : `<div style="margin-top:10px"><a class="btn sm pri" href="#/entry">${ico("plus")} চেক পোস্টিং</a></div>`}</div>`;
  /* attention panel */
  const att = [
    ...due.slice(0, 3).map(r => `<a class="att rd" href="#/rem"><span class="ai">⏰</span><span><b>${esc(r.title)}</b><small>${relTime(remDue(r))}</small></span><u>দেখুন</u></a>`),
    ...sys.map(a => `<a class="att ${a.k}" ${a.go ? `href="${a.go}"` : ""}><span class="ai">${ico(a.ic)}</span><span><b>${esc(a.t)}</b></span>${a.go ? "<u>খুলুন →</u>" : ""}</a>`)];
  v.innerHTML = `<div class="hero dash-hero magic-dot-pattern"><div class="hh"><h1>${greet()}, ${esc(S.me.name)} 👋</h1><p>${new Date().toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${workday ? "" : " · শুক্রবার (সাপ্তাহিক বন্ধ)"}</p>
        <div class="dprog">${ring}<div><b>${tdone === tasks.length ? "আজকের সব কাজ সম্পন্ন 🎉" : `আজকের কাজ ${tdone}/${tasks.length} সম্পন্ন`}</b><small>${tdone === tasks.length ? "দারুণ! সব কিছু আপ-টু-ডেট আছে" : `<span>বাকি:</span> ` + left.map(x => `<span>${x}</span>`).join(" · ")}</small><small id="d-streak"></small></div></div></div>
       <div class="qacts">${acts.map(([k, ic, l, c]) => `<a class="qa magic-card ${c}" href="#/${k}"><span class="qi">${ico(ic)}</span><span>${l}</span></a>`).join("")}</div></div>
     <div class="ststrip">${boss ? "" : st(bankDone, "ব্যাংক ক্লোজিং", "#/closing", bankDone ? "আজ সেভ হয়েছে" : S.lastBal ? "<span>শেষ:</span> " + dmy(S.lastBal) : "এখনো নেই")}${boss ? "" : st(cashDone, "ক্যাশ খাতা", "#/cash", cashDone ? "আজ সেভ হয়েছে" : (S.lastBook || S.lastCash) ? "<span>শেষ:</span> " + dmy([S.lastBook, S.lastCash].filter(Boolean).sort().pop()) : "এখনো নেই")}
       ${st(!due.length, "রিমাইন্ডার", "#/rem", due.length ? `${due.length}টি সময় হয়েছে` : `${upcoming.length}টি আসছে`)}${st(!old.length, "Pending চেক", "#/status", `${pend.length}টি · পুরনো ${old.length}`)}${admin ? `<span id="d-bk" class="stchip"><i>…</i><span><b>Backup</b><small>দেখা হচ্ছে…</small></span></span>` : ""}</div>
     ${att.length ? `<a class="dg-alert" href="#d-att" data-jump="d-att"><span class="dg-ai">${ico("flag")}</span><span><b>${bi(`${att.length}টি বিষয়ে মনোযোগ দরকার`, `${att.length} ${att.length > 1 ? "items need" : "item needs"} attention`)}</b><small>${esc((due[0]?.title) || sys[0]?.t || "")}</small></span><u>${bi("দেখুন", "View")} ↓</u></a>` : ""}
     <nav class="dg-jump noprint" id="dg-jump" aria-label="${bi("ড্যাশবোর্ডের অংশ", "Dashboard sections")}">${[["d-kpi", bi("সারসংক্ষেপ", "Overview")], ["d-sec-tr", bi("ট্রেন্ড", "Trends")], ["d-sec-bk", bi("ব্যাংক ও চেক", "Banks & cheques")], ["d-sec-col", bi("কালেকশন", "Collection")], ["d-att", bi("মনোযোগ", "Attention"), att.length], ["d-sec-ls", bi("সর্বশেষ", "Latest")]].map(([id, l, n]) => `<button type="button" data-jump="${id}">${l}${n ? ` <b>${n}</b>` : ""}</button>`).join("")}<button type="button" class="dg-find" id="dg-find" title="Ctrl K">${ico("search")}<span>${bi("খুঁজুন / যান…", "Search / jump…")}</span></button></nav>
     <div class="grid g4" id="d-kpi">
       <a class="kpi card magic-card k-vi" href="#/crep"><div class="l">ব্যাংক ব্যালেন্স<span class="ki">${ico("bank")}</span></div><div class="v num" id="d-bt">—</div><div class="s" id="d-bs">লোড হচ্ছে…</div><div id="d-sp1" class="kspw"></div></a>
       <a class="kpi card magic-card k-gr" href="#/reports"><div class="l">ব্যবহারযোগ্য (Usable)<span class="ki">${ico("coins")}</span></div><div class="v num" id="d-bu">—</div><div class="s" id="d-bb"></div><div id="d-sp2" class="kspw"></div></a>
       <a class="kpi card magic-card k-cy" href="#/cashsum"><div class="l">ক্যাশ ক্লোজিং<span class="ki">${ico("wallet")}</span></div><div class="v num" id="d-ct">—</div><div class="s" id="d-cs">লোড হচ্ছে…</div><div id="d-sp3" class="kspw"></div></a>
       <a class="kpi card magic-card k-am" href="#/cheques"><div class="l">চেক · এই মাস<span class="ki">${ico("list")}</span></div><div class="v num">${mon.length}</div><div class="s num">৳ ${money0(sumAmt(mon))} · <span>আজ</span> ${todayC.length} · Pending ${pend.length}</div><div class="kbar"><i style="width:${clearedPct}%"></i></div><div class="s" style="margin-top:3px">${clearedPct}% Clear</div></a>
     </div>
     <div class="dg-today" id="dg-today" aria-label="${bi("আজকের সারসংক্ষেপ", "Today at a glance")}">
       <a class="dg-t t-col" href="#/dcol"><span class="dg-i">${ico("coins")}</span><span class="dg-b"><small>${bi("আজকের কালেকশন", "Collection today")}</small><b class="num" id="dg-col">—</b><i id="dg-cols">${bi("লোড হচ্ছে…", "Loading…")}</i></span></a>
       <a class="dg-t t-cb" href="#/cash"><span class="dg-i">${ico("book")}</span><span class="dg-b"><small>${bi("আজকের ক্যাশ খাতা (নিট)", "Cash Book today (net)")}</small><b class="num" id="dg-cb">—</b><i id="dg-cbs">${bi("লোড হচ্ছে…", "Loading…")}</i></span></a>
       <a class="dg-t t-pd" href="#/status"><span class="dg-i">${ico("flag")}</span><span class="dg-b"><small>${bi("Pending চেক (মোট)", "Pending cheques (total)")}</small><b class="num">৳ ${money0(sumAmt(pend))}</b><i>${pend.length}${bi("টি", " cheques")} · ${bi("পুরনো", "old")} ${old.length}</i></span></a>
       <a class="dg-t t-rm" href="#/rem"><span class="dg-i">${ico("bell")}</span><span class="dg-b"><small>${bi("রিমাইন্ডার", "Reminders")}</small><b class="num">${due.length}</b><i>${due.length ? bi("সময় হয়েছে", "due now") : bi("কোনোটির সময় হয়নি", "none due")} · ${upcoming.length} ${bi("আসছে", "upcoming")}</i></span></a>
     </div>
     <div class="grid g2 dgap" id="d-sec-tr">
       <div class="card"><div class="ch" style="padding:0 0 8px"><h3>ব্যাংক ব্যালেন্স ট্রেন্ড</h3><div class="sp" style="flex:1"></div><div class="seg mini-seg" id="d-rng">${[[7, bi("৭দি", "7d")], [15, bi("১৫দি", "15d")], [30, bi("৩০দি", "30d")]].map(([n, l]) => `<span class="chip ${n === 30 ? "on" : ""}" data-n="${n}">${l}</span>`).join("")}</div></div>
         <div id="d-tr"><div class="skel" style="height:110px"></div></div><div class="mut sm" id="d-tr-s"></div><div class="lgd"><span><i style="background:#6366f1"></i>Total</span><span><i style="background:#10b981"></i>Usable</span><span class="mut" style="margin-left:auto">আঙুল/মাউস দিয়ে দেখুন</span><a class="sm" href="#/reports">রিপোর্ট →</a></div></div>
       <div class="card"><div class="ch" style="padding:0 0 8px"><h3>ক্যাশ: আয় বনাম ব্যয়</h3><span class="mut sm">১৪ দিন</span><div class="sp" style="flex:1"></div><a class="sm" href="#/cashsum">সামারি →</a></div><div id="d-cash"><div class="skel" style="height:90px"></div></div><div class="lgd"><span><i style="background:#10b981"></i>Receipt</span><span><i style="background:#ef4444"></i>Payment</span></div></div>
     </div>
     <div class="grid g2 dgap" id="d-sec-bk">
       <div class="card"><div class="ch" style="padding:0 0 10px"><h3>ব্যাংক-ওয়াইজ ব্যালেন্স</h3><span class="mut sm" id="d-bk-d"></span><div class="sp" style="flex:1"></div><a class="sm" href="#/crep">বিস্তারিত →</a></div><div id="d-banks"><div class="skel" style="height:150px"></div></div></div>
       <div class="card"><div class="ch" style="padding:0 0 10px"><h3>চেক পাইপলাইন · এই মাস</h3><span class="tag">${monAll.length}</span><div class="sp" style="flex:1"></div><a class="sm" href="#/cheques">সব →</a></div>${pipeline}</div>
     </div>
     <div class="grid g2 dgap" id="d-sec-col">
       <div class="card"><div class="ch" style="padding:0 0 10px"><h3>ডিস্ট্রিবিউশন কালেকশন</h3><span class="mut sm">৭ দিন</span><div class="sp" style="flex:1"></div><a class="sm" href="#/dsum">সামারি →</a></div><div id="d-col"><div class="skel" style="height:110px"></div></div></div>
       <div class="card" id="d-att"><div class="ch" style="padding:0 0 10px"><h3>মনোযোগ দরকার</h3><span class="tag ${att.length ? "t-due" : ""}">${att.length}</span></div>${att.length ? `<div class="attl">${att.join("")}</div>` : `<div class="allgood"><span>✨</span><b>সব ঠিক আছে!</b><small>কোনো জরুরি কাজ বা সতর্কতা নেই — দারুণ চলছে।</small></div>`}</div>
     </div>
     <div class="grid g3 dgap" id="d-sec-ls">
       <div class="card flush"><div class="ch"><h3>সর্বশেষ চেক এন্ট্রি</h3><div class="sp" style="flex:1"></div><a class="sm" href="#/cheques">সব →</a></div>${(() => { const r = [...S.cheques].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 6); return r.length ? `<div class="mini">${r.map(c => `<div class="mi" data-id="${c.id}"><div><b>${esc(c.code)} · ${c.no}</b>${chqIcons(c)}<div class="mut sm">${dmy(c.date)} · ${esc(c.purpose.split(" (")[0])}</div></div><div class="r"><b class="num">৳ ${money0(c.amount)}</b><div>${stTag(c.status)}</div></div></div>`).join("")}</div>` : `<div class="empty">এখনো কোনো চেক এন্ট্রি হয়নি${boss ? "" : `<div style="margin-top:10px"><a class="btn sm pri" href="#/entry">${ico("plus")} প্রথম চেক এন্ট্রি</a></div>`}</div>`; })()}</div>
       <div class="card flush"><div class="ch"><h3>আসন্ন রিমাইন্ডার</h3><div class="sp" style="flex:1"></div><a class="sm" href="#/rem">সব →</a></div>${upcoming.length ? `<div class="mini">${upcoming.map(r => `<a class="mi" href="#/rem"><div><b>${esc(r.title)}</b><div class="mut sm">${esc(r.note || REPEATS[r.repeat] || "")}</div></div><div class="r"><span class="tag ${remDue(r) <= new Date() ? "t-due" : ""}">${relTime(remDue(r))}</span></div></a>`).join("")}</div>` : `<div class="empty">কোনো রিমাইন্ডার নেই<div style="margin-top:10px"><button class="btn sm" id="d-addrem">${ico("plus")} রিমাইন্ডার দিন</button></div></div>`}</div>
       <div class="card flush"><div class="ch"><h3>পুরনো Pending চেক</h3><span class="tag">${old.length}</span></div>${old.length ? `<div class="mini">${old.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6).map(c => `<div class="mi" data-id="${c.id}"><div><b>${esc(c.code)} · ${c.no}</b><div class="mut sm">${esc(c.remarks || c.party || c.purpose.split(" (")[0])}</div></div><div class="r"><b class="num">৳ ${money0(c.amount)}</b><div class="rd sm b">${daysBetween(c.date, t)} দিন</div></div></div>`).join("")}</div>` : `<div class="empty">কোনো পুরনো Pending নেই 🎉</div>`}</div>
     </div>`;
  $$(".mi[data-id]", v).forEach(r => r.onclick = () => chequeModal(S.cheques.find(c => c.id === r.dataset.id), () => route()));
  { const rm = matchMedia("(prefers-reduced-motion: reduce)").matches, jb = $("#dg-jump", v);
    v.addEventListener("click", e => { const b = e.target.closest("[data-jump]"); if (!b) return; e.preventDefault(); const el = $("#" + b.dataset.jump, v); if (!el) return; el.scrollIntoView({ behavior: rm ? "auto" : "smooth", block: "start" }); el.classList.remove("dg-flash"); void el.offsetWidth; el.classList.add("dg-flash"); });
    $("#dg-find", v).onclick = () => palette();
    if ("IntersectionObserver" in window && jb) { const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { $$("[data-jump]", jb).forEach(x => x.classList.toggle("on", x.dataset.jump === en.target.id)); const on = $(".on", jb); if (on && jb.scrollWidth > jb.clientWidth) jb.scrollTo({ left: on.offsetLeft - 12, behavior: rm ? "auto" : "smooth" }); } }), { rootMargin: "-45% 0px -50% 0px" }); ["d-kpi", "d-sec-tr", "d-sec-bk", "d-sec-col", "d-att", "d-sec-ls"].forEach(id => { const el = $("#" + id, v); if (el) io.observe(el); }); } }
  (async () => {
    try {
      const rows = (await API.dcolRange(t, t)).filter(r => r.status !== "cancelled"); if (!$("#dg-col", v)) return;
      const ap = rows.filter(r => r.status === "approved"), pe = rows.filter(r => r.status === "pending");
      $("#dg-col", v).textContent = "৳ " + money0(dcSum(rows)); $("#dg-cols", v).textContent = rows.length ? `${bi("Approved", "Approved")} ${ap.length} · Pending ${pe.length}` : bi("আজ এখনো কোনো এন্ট্রি নেই", "No entries yet today");
    } catch { if ($("#dg-cols", v)) $("#dg-cols", v).textContent = "—"; }
    try {
      const b = await API.cbOn(t); if (!$("#dg-cb", v)) return; const sum = k => (b?.lines?.[k] || []).filter(l => !l.x).reduce((q, l) => q + (+l.a || 0), 0), R = sum("r"), P = sum("p");
      $("#dg-cb", v).textContent = b ? (R - P < 0 ? "−" : "") + "৳ " + money0(Math.abs(R - P)) : "—"; $("#dg-cbs", v).textContent = b ? `${bi("আয়", "In")} ${money0(R)} · ${bi("ব্যয়", "Out")} ${money0(P)}` : bi("আজ এখনো এন্ট্রি নেই", "No entries yet today");
    } catch { if ($("#dg-cbs", v)) $("#dg-cbs", v).textContent = "—"; }
  })();
  $("#d-addrem", v) && ($("#d-addrem", v).onclick = () => reminderModal(null, {}, () => route()));
  // bank figures + trend + bank-wise + streak
  (async () => {
    try {
      const rows = await cached("bal30", 60000, () => API.balancesRange(addDays(t, -45), t)); const ser = balSeries(rows);
      if (!$("#d-bt", v)) return;
      const last = ser[ser.length - 1], prev = ser[ser.length - 2];
      if (!last) { $("#d-bs", v).textContent = "কোনো ব্যালেন্স সেভ নেই"; $("#d-tr", v).innerHTML = `<div class="mut sm">ডাটা নেই</div>`; $("#d-banks", v).innerHTML = `<div class="mut sm">ডাটা নেই</div>`; return; }
      $("#d-bt", v).textContent = "৳ " + money0(last.t); $("#d-bs", v).innerHTML = `${dmy(last.date)} · ${delta(last.t, prev?.t)}`;
      $("#d-bu", v).textContent = "৳ " + money0(last.t - last.b); $("#d-bb", v).innerHTML = `Block ${money0(last.b)} · ${last.n} A/C · ${delta(last.t - last.b, prev ? prev.t - prev.b : null)}`;
      $("#d-sp1", v).innerHTML = msp(ser.slice(-14).map(x => x.t)); $("#d-sp2", v).innerHTML = msp(ser.slice(-14).map(x => x.t - x.b));
      const drawTr = n => {
        const s = ser.slice(-n), tt = s.map(x => x.t); dashLine($("#d-tr", v), s.map(x => ({ date: x.date, t: x.t, u: x.t - x.b })));
        const chg = s.length > 1 ? s[s.length - 1].t - s[0].t : 0, avg = tt.reduce((a, b) => a + b, 0) / tt.length;
        $("#d-tr-s", v).innerHTML = `${dmy(s[0].date)} → ${dmy(last.date)} · <b class="${chg >= 0 ? "gr" : "rd"}">${chg >= 0 ? "▲" : "▼"} ${money0(Math.abs(chg))}</b> · <span>গড়</span> ${money0(avg)} · <span>সর্বোচ্চ</span> ${money0(Math.max(...tt))} · <span>সর্বনিম্ন</span> ${money0(Math.min(...tt))}`;
      };
      drawTr(30); $$("#d-rng .chip", v).forEach(c => c.onclick = () => { $$("#d-rng .chip", v).forEach(x => x.classList.toggle("on", x === c)); drawTr(+c.dataset.n); });
      // streak of consecutive working days with a saved closing
      const have = new Set(ser.map(x => x.date)); let d = t, n = 0; if (!have.has(d) && !isFri(d)) d = addDays(d, -1);
      for (let i = 0; i < 45; i++) { if (isFri(d)) { d = addDays(d, -1); continue; } if (!have.has(d)) break; n++; d = addDays(d, -1); }
      if (n >= 2 && $("#d-streak", v)) $("#d-streak", v).textContent = bi(`🔥 টানা ${n} কর্মদিবস ব্যাংক ক্লোজিং সম্পন্ন`, `🔥 ${n} working days of bank closing in a row`);
      // bank-wise
      const bm = await balancesOn(last.date), am = accMap(), by = new Map();
      Object.entries(bm).forEach(([c, r]) => { const a = am[c]; if (!a || !a.daily || r.total == null) return; const k = (a.bank || "—").trim(), o = by.get(k) || { k, t: 0, b: 0, l: [] }; o.t += Number(r.total); o.b += Number(r.block || 0); o.l.push({ c, h: a.holder || "", t: Number(r.total) }); by.set(k, o); });
      const bl = [...by.values()].sort((a, b) => b.t - a.t), tot = bl.reduce((s, x) => s + x.t, 0) || 1, mxb = bl[0]?.t || 1;
      $("#d-bk-d", v).textContent = dmy(last.date);
      $("#d-banks", v).innerHTML = bl.length ? `<div class="bkl">${bl.slice(0, 8).map(b => `<details class="bk"><summary><span class="bn">${esc(b.k)}</span><b class="num">৳ ${money0(b.t)}</b><em>${(b.t / tot * 100).toFixed(0)}%</em><span class="bbar"><i style="width:${Math.max(3, b.t / mxb * 100)}%"></i></span></summary><div class="bkd">${b.l.sort((x, y) => y.t - x.t).map(a => `<div><span>${esc(a.c)}${a.h ? ` · ${esc(a.h)}` : ""}</span><b class="num">৳ ${money0(a.t)}</b></div>`).join("")}${b.b ? `<div class="mut"><span>Block</span><b class="num">৳ ${money0(b.b)}</b></div>` : ""}</div></details>`).join("")}</div>${bl.length > 8 ? `<div class="mut sm" style="margin-top:6px">${LANG === "en" ? `${bl.length - 8} more banks` : `আরও ${bl.length - 8}টি ব্যাংক`} — <a href="#/crep">সব দেখুন</a></div>` : ""}` : `<div class="mut sm">ডাটা নেই</div>`;
    } catch (e) { if ($("#d-bs", v)) { $("#d-bs", v).textContent = isNetErr(e) ? "অফলাইন" : "লোড হয়নি"; $("#d-tr", v).innerHTML = `<div class="mut sm">${isNetErr(e) ? "ইন্টারনেট নেই" : esc(e.message)}</div>`; $("#d-banks", v).innerHTML = ""; } }
  })();
  // cash figures
  (async () => {
    try {
      const rows = await cached("cash14", 60000, () => API.cashRange(addDays(t, -40), t)); if (!$("#d-ct", v)) return;
      const fin = rows.filter(r => r.status === "final"), last = fin[fin.length - 1], prev = fin[fin.length - 2];
      if (last) { $("#d-ct", v).textContent = "৳ " + money0(last.closing); $("#d-cs", v).innerHTML = `${dmy(last.date)} · হাতে ক্যাশ ${money0(last.cash_in_hand)} · ${delta(+last.closing, prev ? +prev.closing : null)}`; $("#d-sp3", v).innerHTML = msp(fin.slice(-14).map(r => +r.closing)); }
      else $("#d-cs", v).textContent = "এখনো কোনো ক্যাশ রেকর্ড নেই";
      const r14 = rows.filter(r => r.date > addDays(t, -14)); $("#d-cash", v).innerHTML = bars2(r14.map(r => ({ l: dmy(r.date), a: +r.total_receipt || 0, b: +r.total_payment || 0 }))) + (r14.length ? `<div class="mut sm">Receipt ৳ ${money0(r14.reduce((s, r) => s + (+r.total_receipt || 0), 0))} · Payment ৳ ${money0(r14.reduce((s, r) => s + (+r.total_payment || 0), 0))}</div>` : "");
    } catch (e) { if ($("#d-cs", v)) { $("#d-cs", v).textContent = /relation|does not exist|schema cache|not find/i.test(e.message || "") ? "SQL v3 চালানো বাকি" : isNetErr(e) ? "অফলাইন" : "লোড হয়নি"; $("#d-cash", v).innerHTML = ""; } }
  })();
  // distribution collection (last 7 days)
  (async () => {
    const el = $("#d-col", v);
    try {
      const rows = (await cached("dcol7", 60000, () => API.dcolRange(addDays(t, -6), t))).filter(r => r.status !== "cancelled"); if (!$("#d-col", v)) return;
      const days = [...Array(7)].map((_, i) => addDays(t, i - 6)), sm = (arr, f) => arr.filter(f).reduce((s, r) => s + r.amount, 0);
      const td = rows.filter(r => r.date === t), tot7 = sm(rows, () => true), ok7 = sm(rows, r => r.status === "approved"), pe7 = sm(rows, r => r.status === "pending");
      const per = days.map(d => ({ l: dmy(d), a: sm(rows, r => r.date === d && r.status === "approved"), b: sm(rows, r => r.date === d && r.status !== "approved") }));
      el.innerHTML = rows.length ? `<div class="colk"><div><small>আজ</small><b class="num">৳ ${money0(sm(td, () => true))}</b><em>${td.length}টি এন্ট্রি</em></div><div><small>৭ দিনে মোট</small><b class="num">৳ ${money0(tot7)}</b><em>${rows.length}টি এন্ট্রি</em></div><div><small>Approved</small><b class="num gr">৳ ${money0(ok7)}</b><em>${rows.filter(r => r.status === "approved").length}টি এন্ট্রি</em></div><div><small>Pending</small><b class="num am">৳ ${money0(pe7)}</b><em>${rows.filter(r => r.status === "pending").length}টি এন্ট্রি</em></div></div>${bars2(per, 64, ["Approved", "Pending"], 7)}<div class="bticks">${days.map(d => `<span>${d.slice(8)}</span>`).join("")}</div><div class="lgd"><span><i style="background:#10b981"></i>Approved</span><span><i style="background:#ef4444"></i>Pending</span></div>`
        : `<div class="empty" style="padding:18px 0">গত ৭ দিনে কোনো কালেকশন এন্ট্রি নেই${boss ? "" : `<div style="margin-top:10px"><a class="btn sm" href="#/dcol">${ico("plus")} কালেকশন এন্ট্রি</a></div>`}</div>`;
    } catch (e) { if (el) el.innerHTML = `<div class="mut sm" style="padding:14px 0">${isNetErr(e) ? "ইন্টারনেট নেই" : "কালেকশন ডাটা পাওয়া যায়নি"}</div>`; }
  })();
  if (admin) (async () => { const el = $("#d-bk", v); try { const b = (await API.backups())[0]; if (!el) return; const ok = b && Date.now() - new Date(b.at) < 36 * 36e5; el.className = "stchip " + (ok ? "ok" : "no"); el.innerHTML = `<i>${ok ? "✓" : "!"}</i><span><b>Backup</b><small>${b ? relTime(b.at) : "এখনো হয়নি"}</small></span>`; el.onclick = () => location.hash = "#/admin?tab=backup"; } catch { if (el) { el.className = "stchip no"; el.innerHTML = `<i>!</i><span><b>Backup</b><small>সেটআপ বাকি</small></span>`; } } })();
}

/* =================== v6: bank + cheque reports =================== */
/* =================== v6.131: Bank Reports — interactive dashboard =================== */
const BR_PAL = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#f97316", "#14b8a6"];
const brPct = (a, b) => b ? a / b * 100 : 0;
const brSgn = n => (n >= 0 ? "+" : "−") + money0(Math.abs(n));
const brSgnC = n => (n >= 0 ? "+" : "−") + compactN(Math.abs(n));
const brPc = p => p == null ? "" : `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`;
const brBankClr = name => brandOf(S.accounts.find(a => a.bank === name) || { bank: name }).c1;
function brSpark(vals, cls = "") {
  if (vals.length < 2) return "";
  const w = 100, h = 26, mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
  const d = vals.map((q, i) => (i ? "L" : "M") + (i / (vals.length - 1) * w).toFixed(1) + "," + (h - 2 - (q - mn) / rg * (h - 4)).toFixed(1)).join("");
  return `<svg class="br-sp ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${w},${h}L0,${h}Z" class="a"/><path d="${d}" class="l" vector-effect="non-scaling-stroke"/></svg>`;
}
function brDonut(items, total) {
  let cum = 0;
  const segs = items.map(it => { const p = brPct(it.amt, total), len = Math.max(0, p - .5); const s = `<circle class="br-seg" cx="21" cy="21" r="15.9155" fill="none" stroke="${it.c}" stroke-width="5" stroke-dasharray="${len.toFixed(2)} ${(100 - len).toFixed(2)}" stroke-dashoffset="${(25 - cum).toFixed(2)}"><title>${esc(it.k)} · ${p.toFixed(1)}%</title></circle>`; cum += p; return s; }).join("");
  return `<svg viewBox="0 0 42 42" class="br-donut" role="img" aria-label="${bi("ব্যাংক অনুযায়ী ভাগ", "Share by bank")}"><circle cx="21" cy="21" r="15.9155" fill="none" class="br-seg0" stroke-width="5"/>${segs}<text x="21" y="20.6" text-anchor="middle" class="br-dn">${compactN(total)}</text><text x="21" y="25.6" text-anchor="middle" class="br-dl">${bi("মোট", "Total")}</text></svg>`;
}
function brInsights(c) {
  const { L, To, openD, mx, mn, ser, byBank, accRows, movers } = c, out = [], chg = L.t - To, pct = To ? chg / Math.abs(To) * 100 : null, pp = pct == null ? "" : ` (${brPc(pct)})`;
  out.push([chg >= 0 ? "up" : "dn", bi(`${dmy(openD)}-এর তুলনায় মোট ব্যালেন্স ${brSgn(chg)}${pp}`, `Total moved ${brSgn(chg)}${pp} since ${dmy(openD)}`)]);
  if (ser.length > 1) out.push(["info", bi(`সর্বোচ্চ ${compactN(mx.t)} (${dmy(mx.date)}) · সর্বনিম্ন ${compactN(mn.t)} (${dmy(mn.date)})`, `Peak ${compactN(mx.t)} on ${dmy(mx.date)} · low ${compactN(mn.t)} on ${dmy(mn.date)}`)]);
  const tot = accRows.reduce((s, r) => s + Math.max(0, r.cl), 0), b0 = byBank[0];
  if (b0 && tot > 0) { const t3 = byBank.slice(0, 3).reduce((s, r) => s + Math.max(0, r.amt), 0); out.push(["info", bi(`সবচেয়ে বড় ব্যাংক ${b0.k} — মোটের ${brPct(b0.amt, tot).toFixed(1)}%; শীর্ষ ৩ ব্যাংকে ${brPct(t3, tot).toFixed(1)}%`, `Largest bank ${b0.k} holds ${brPct(b0.amt, tot).toFixed(1)}%; top 3 banks hold ${brPct(t3, tot).toFixed(1)}%`)]); }
  if (movers[0]) { const m = movers[0]; out.push([m.ch >= 0 ? "up" : "dn", bi(`সবচেয়ে বেশি পরিবর্তন: ${m.c} ${brSgn(m.ch)}`, `Biggest mover: ${m.c} ${brSgn(m.ch)}`)]); }
  if (L.b > 0) out.push(["warn", bi(`ব্লক ৳ ${money0(L.b)} (মোটের ${brPct(L.b, L.t).toFixed(1)}%) — ব্যবহারযোগ্য ৳ ${money0(L.t - L.b)}`, `Block ৳ ${money0(L.b)} is ${brPct(L.b, L.t).toFixed(1)}% of total — usable ৳ ${money0(L.t - L.b)}`)]);
  const neg = accRows.filter(r => r.cl < 0).length, idle = accRows.filter(r => r.ch === 0 && r.cl > 0).length;
  if (neg) out.push(["warn", bi(`${neg}টি অ্যাকাউন্টে নেগেটিভ ব্যালেন্স (ওভারড্রাফট)`, `${neg} account(s) with a negative balance (overdraft)`)]);
  if (idle) out.push(["info", bi(`${idle}টি অ্যাকাউন্টে পুরো সময়ে কোনো নড়াচড়া নেই`, `${idle} account(s) had no movement in this period`)]);
  return out;
}
function brDash(c, F) {
  const { from, to, ser, accRows, byBank, byHolder, L, To, openD, lastD, mx, mn, movers, hold } = c, chg = L.t - To, pct = To ? chg / Math.abs(To) * 100 : null;
  const rows = ser.map(x => ({ date: x.date, total: x.t, block: x.b })), G0 = hGroup(rows, "daily"), tots = ser.map(x => x.t);
  const share = L.t ? (L.t - L.b) / L.t * 100 : 0, tot = accRows.reduce((s, r) => s + Math.max(0, r.cl), 0);
  const kpi = (cls, ic, lab, val, sub, sp) => `<div class="br-k ${cls}"><div class="br-kt"><span class="br-ki">${ico(ic)}</span><span class="br-kl">${lab}</span></div><div class="br-kv num">${val}</div><div class="br-ks">${sub}</div>${sp || ""}</div>`;
  const kpis = [
    kpi("k1", "bank", bi("ক্লোজিং ব্যালেন্স", "Closing balance"), "৳ " + money0(L.t), dmy(lastD), brSpark(tots)),
    kpi(chg >= 0 ? "k3" : "k2", "trend", bi("নেট পরিবর্তন", "Net change"), `<span class="${chg >= 0 ? "gr" : "rd"}">${brSgn(chg)}</span>`, `${brPc(pct)} ${bi("বনাম", "vs")} ${dmy(openD)}`),
    kpi("k3", "wallet", bi("ব্যবহারযোগ্য", "Usable"), "৳ " + money0(L.t - L.b), `${share.toFixed(1)}% ${bi("মোটের", "of total")}`, brSpark(ser.map(x => x.t - x.b), "g")),
    kpi("k4", "shield", bi("ব্লক / লিয়েন", "Block / lien"), "৳ " + money0(L.b), `${brPct(L.b, L.t).toFixed(1)}% ${bi("মোটের", "of total")}`, brSpark(ser.map(x => x.b), "a")),
    kpi("", "chart", bi("সর্বোচ্চ", "Highest"), "৳ " + money0(mx.t), dmy(mx.date)),
    kpi("", "chart", bi("সর্বনিম্ন", "Lowest"), "৳ " + money0(mn.t), dmy(mn.date)),
    kpi("", "clock", bi("দৈনিক গড়", "Daily average"), "৳ " + money0(G0.avg), `${ser.length} ${bi("দিন সেভ", "saved days")}`),
    kpi("", "list", bi("ক্রেডিট / ডেবিট", "Credit / debit"), `<span class="gr">${brSgnC(G0.cre)}</span> <span class="mut">/</span> <span class="rd">−${compactN(G0.deb)}</span>`, `${G0.moves} ${bi("বার ব্যালেন্স বদলেছে", "balance changes")}`)
  ].join("");
  const ins = brInsights({ L, To, openD, mx, mn, ser, byBank, accRows, movers }).map(([k, t]) => `<li class="br-in ${k}"><i></i><span>${esc(t)}</span></li>`).join("");
  const posBank = byBank.filter(r => r.amt > 0), top = posBank.slice(0, 6), rest = posBank.slice(6).reduce((s, r) => s + r.amt, 0);
  const dItems = top.map(r => ({ k: r.k, amt: r.amt, c: brBankClr(r.k) })).concat(rest > 0 ? [{ k: bi("অন্যান্য", "Others"), amt: rest, c: "#94a3b8" }] : []);
  const dTot = dItems.reduce((s, r) => s + r.amt, 0);
  const bar = (rows, clr) => rows.length ? rows.map((r, i) => { const ch = r.amt - r.o, p = brPct(Math.max(0, r.amt), tot); return `<div class="br-row"><div class="br-rt"><i style="background:${clr(r, i)}"></i><b title="${esc(r.k)}">${esc(r.k)}</b><span class="mut">${r.n} A/C</span><span class="num br-ra">${money0(r.amt)}</span></div><div class="br-bar"><u style="width:${Math.min(100, p).toFixed(1)}%;background:${clr(r, i)}"></u></div><div class="br-rs"><span>${p.toFixed(1)}%</span><span class="${ch >= 0 ? "gr" : "rd"}">${ch ? brSgn(ch) : "—"}</span></div></div>`; }).join("") : `<div class="mut sm">—</div>`;
  const mv = (arr, cls) => arr.length ? arr.map(r => `<div class="br-mv"><i class="bdot" style="background:${brandOf(r.a).c1}"></i><span class="br-mn"><b>${esc(r.c)}</b><em>${esc(r.a?.holder || "")}</em></span><span class="num ${cls}">${brSgn(r.ch)}</span></div>`).join("") : `<div class="mut sm">${bi("কিছু নেই", "None")}</div>`;
  const gain = [...accRows].filter(r => r.ch > 0).sort((a, b) => b.ch - a.ch).slice(0, 6), lose = [...accRows].filter(r => r.ch < 0).sort((a, b) => a.ch - b.ch).slice(0, 6);
  const sg = (k, l) => `<button type="button" class="chip${F.bs === k ? " on" : ""}" data-bs="${k}">${l}</button>`;
  const gg = (k, l) => `<button type="button" class="chip${F.bg === k ? " on" : ""}" data-bg="${k}">${l}</button>`;
  return `<div class="br-chips"><span>${ico("cal")}${dmy(from)} → ${dmy(to)}</span><span>${ico("clock")}${ser.length} ${bi("দিন সেভ", "saved days")}</span><span>${ico("card")}${accRows.length} A/C</span><span>${ico("bank")}${byBank.length} ${bi("ব্যাংক", "banks")}</span>${hold ? `<span class="on">${ico("eye")}${hold}</span>` : ""}</div>
   <div class="br-kpis">${kpis}</div>
   <ul class="br-ins">${ins}</ul>
   <div class="br-g2">
    <section class="card br-card br-chartc"><div class="br-h"><h3>${bi("ব্যালেন্স ট্রেন্ড", "Balance trend")}</h3><div class="br-ctl"><div class="seg">${sg("t", bi("মোট", "Total"))}${sg("u", bi("ব্যবহারযোগ্য", "Usable"))}${sg("b", bi("ব্লক", "Block"))}</div><div class="seg">${gg("daily", bi("দিন", "Day"))}${gg("weekly", bi("সপ্তাহ", "Week"))}${gg("monthly", bi("মাস", "Month"))}</div></div></div><div id="br-chart"></div></section>
    <section class="card br-card"><div class="br-h"><h3>${bi("ব্যাংক অনুযায়ী ভাগ", "Share by bank")}</h3></div><div class="br-dw">${brDonut(dItems, dTot)}<ul class="br-lg">${dItems.map(r => `<li><i style="background:${r.c}"></i><span>${esc(r.k)}</span><b>${brPct(r.amt, dTot).toFixed(1)}%</b></li>`).join("")}</ul></div></section>
   </div>
   <div class="br-g2">
    <section class="card br-card"><div class="br-h"><h3>${bi("ব্যাংক অনুযায়ী (ক্লোজিং)", "By bank (closing)")}</h3><span class="mut sm">${byBank.length}</span></div><div class="br-list">${bar(byBank, r => brBankClr(r.k))}</div></section>
    <section class="card br-card"><div class="br-h"><h3>${bi("হোল্ডার অনুযায়ী (ক্লোজিং)", "By holder (closing)")}</h3><span class="mut sm">${byHolder.length}</span></div><div class="br-list">${bar(byHolder, (r, i) => BR_PAL[i % BR_PAL.length])}</div></section>
   </div>
   <div class="br-g2">
    <section class="card br-card"><div class="br-h"><h3>${ico("trend")}${bi("সবচেয়ে বেশি বেড়েছে", "Top gainers")}</h3></div>${mv(gain, "gr")}</section>
    <section class="card br-card"><div class="br-h"><h3>${bi("সবচেয়ে বেশি কমেছে", "Top losers")}</h3></div>${mv(lose, "rd")}</section>
   </div>
   <section class="card br-card br-acc"><div class="br-h"><h3>${bi("সব অ্যাকাউন্ট", "All accounts")}</h3><span class="mut sm" id="br-cnt"></span></div>
    <div class="br-tools"><label class="br-s">${ico("search")}<input class="in" id="br-q" type="search" placeholder="${bi("A/C, হোল্ডার, ব্যাংক খুঁজুন…", "Search A/C, holder, bank…")}" value="${esc(F.aq || "")}" autocomplete="off"></label><label class="keep"><input type="checkbox" id="br-z" ${F.az ? "checked" : ""}> ${bi("শূন্য ব্যালেন্স লুকাও", "Hide zero balances")}</label></div>
    <div class="br-tw"><table class="br-t"><thead id="br-th"></thead><tbody id="br-tb"></tbody><tfoot id="br-tf"></tfoot></table></div></section>`;
}
function brBind(root, c, F) {
  const { ser, accRows } = c, rows = ser.map(x => ({ date: x.date, total: x.t, block: x.b })), tot = accRows.reduce((s, r) => s + Math.max(0, r.cl), 0);
  const drawChart = () => {
    const m = F.bg, g = hGroup(rows, m).gs.map(x => F.bs === "t" ? x : { ...x, total: F.bs === "u" ? x.total - x.block : x.block, block: 0, deb: 0, cre: 0 });
    const box = $("#br-chart", root); box.innerHTML = hChart(g, m); hChartBind(box, g, m, F.bs === "t" ? "" : F.bs === "u" ? bi("ব্যবহারযোগ্য", "Usable") : bi("ব্লক", "Block"));
    $$("[data-bs]", root).forEach(b => b.classList.toggle("on", b.dataset.bs === F.bs)); $$("[data-bg]", root).forEach(b => b.classList.toggle("on", b.dataset.bg === F.bg));
  };
  $$("[data-bs]", root).forEach(b => b.onclick = () => { F.bs = b.dataset.bs; drawChart(); });
  $$("[data-bg]", root).forEach(b => b.onclick = () => { F.bg = b.dataset.bg; drawChart(); });
  drawChart();
  const COLS = [["c", bi("অ্যাকাউন্ট", "Account"), 0], ["bank", bi("ব্যাংক", "Bank"), 0, "hm"], ["o", bi("ওপেনিং", "Opening"), 1, "hm"], ["cl", bi("ক্লোজিং", "Closing"), 1], ["bl", bi("ব্লক", "Block"), 1, "hm"], ["ch", bi("পরিবর্তন", "Change"), 1], ["sh", bi("ভাগ", "Share"), 1, "hm"]];
  const val = (r, k) => k === "c" ? r.c : k === "bank" ? (r.a?.bank || "") : k === "sh" ? r.cl : r[k];
  const drawTable = () => {
    const q = (F.aq || "").trim().toLowerCase(), k = F.as, d = F.ad;
    let list = accRows.filter(r => (!F.az || r.cl !== 0) && (!q || `${r.c} ${r.a?.holder || ""} ${r.a?.bank || ""}`.toLowerCase().includes(q)));
    list = [...list].sort((a, b) => { const x = val(a, k), y = val(b, k); return (typeof x === "string" ? x.localeCompare(y) : x - y) * d; });
    $("#br-th", root).innerHTML = `<tr>${COLS.map(([key, l, r, hm]) => `<th class="${r ? "r" : ""} ${hm || ""} srt${key === k ? " on" : ""}" data-k="${key}" tabindex="0" role="button" aria-sort="${key === k ? (d > 0 ? "ascending" : "descending") : "none"}">${l}<i>${key === k ? (d > 0 ? "▲" : "▼") : ""}</i></th>`).join("")}</tr>`;
    $("#br-tb", root).innerHTML = list.length ? list.map(r => { const p = brPct(Math.max(0, r.cl), tot); return `<tr><td class="cd"><i class="bdot" style="background:${brandOf(r.a).c1}"></i><b>${esc(r.c)}</b> <span class="mut">${esc(r.a?.holder || "")}</span></td><td class="hm">${esc(r.a?.bank || "")}</td><td class="r num hm">${money0(r.o)}</td><td class="r num"><b>${money0(r.cl)}</b></td><td class="r num hm">${r.bl ? money0(r.bl) : "—"}</td><td class="r num ${r.ch >= 0 ? "gr" : "rd"}">${r.ch ? brSgn(r.ch) : "—"}</td><td class="r hm"><span class="br-mb"><u style="width:${Math.min(100, p * 2).toFixed(0)}%"></u></span><span class="num sm">${p.toFixed(1)}%</span></td></tr>`; }).join("") : `<tr><td colspan="7" class="z" style="text-align:center">${bi("কোনো অ্যাকাউন্ট মেলেনি", "No matching accounts")}</td></tr>`;
    const S2 = list.reduce((s, r) => ({ o: s.o + r.o, cl: s.cl + r.cl, bl: s.bl + r.bl, ch: s.ch + r.ch }), { o: 0, cl: 0, bl: 0, ch: 0 });
    $("#br-tf", root).innerHTML = list.length ? `<tr><td>${bi("মোট", "TOTAL")}</td><td class="hm"></td><td class="r num hm">${money0(S2.o)}</td><td class="r num">${money0(S2.cl)}</td><td class="r num hm">${money0(S2.bl)}</td><td class="r num ${S2.ch >= 0 ? "gr" : "rd"}">${brSgn(S2.ch)}</td><td class="hm"></td></tr>` : "";
    $("#br-cnt", root).textContent = `${list.length} / ${accRows.length}`;
    $$("#br-th th", root).forEach(th => { const go = () => { const key = th.dataset.k; if (F.as === key) F.ad = -F.ad; else { F.as = key; F.ad = key === "c" || key === "bank" ? 1 : -1; } drawTable(); }; th.onclick = go; th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
  };
  $("#br-q", root).oninput = e => { F.aq = e.target.value; drawTable(); };
  $("#br-z", root).onchange = e => { F.az = e.target.checked; drawTable(); };
  drawTable();
}

/* =================== v6.134: Cheque report — interactive dashboard =================== */
const CQ_CLR = { Pending: "#f59e0b", Cleared: "#10b981", Bounced: "#e11d48", "Returned-Cash": "#06b6d4", Cancelled: "#94a3b8", Stopped: "#8b5cf6" };
const cqSt = s => `<span class="cq-st" style="--c:${CQ_CLR[s] || "#64748b"}">${esc(s)}</span>`;
const cqPurpose = c => String(c.purpose || "").split(" (")[0] || "—";
function cqGroup(arr, kf) { const m = new Map(); arr.forEach(c => { const k = kf(c); if (k === "" || k == null) return; const o = m.get(k) || { k, n: 0, amt: 0 }; o.n++; o.amt += c.amount; m.set(k, o); }); return [...m.values()].sort((a, b) => b.amt - a.amt || b.n - a.n); }
function cqInsights(c) {
  const { live, real, all, byTaker, byBank, pend, oldest, blank, rate, busiest, bad } = c, out = [], tot = sumAmt(live);
  if (pend.length) out.push([oldest > 7 ? "warn" : "info", bi(`${pend.length}টি চেক পেন্ডিং (৳ ${money0(sumAmt(pend))}) — সবচেয়ে পুরনোটি ${oldest} দিনের`, `${pend.length} pending cheque(s) worth ৳ ${money0(sumAmt(pend))} — oldest is ${oldest} day(s) old`)]);
  else if (all.length) out.push(["up", bi("কোনো চেক পেন্ডিং নেই", "No pending cheques")]);
  if (bad.length) out.push(["dn", bi(`${bad.length}টি চেক বাউন্স/বাতিল/স্টপ (৳ ${money0(sumAmt(bad))})`, `${bad.length} cheque(s) bounced / cancelled / stopped (৳ ${money0(sumAmt(bad))})`)]);
  if (rate != null) out.push([rate >= 90 ? "up" : "info", bi(`ক্লিয়ারেন্স হার ${rate.toFixed(1)}% (বাতিল ও ব্ল্যাংক বাদে)`, `Clearance rate ${rate.toFixed(1)}% (excluding cancelled and blank stubs)`)]);
  if (byTaker[0] && sumAmt(live.filter(x => x.taker)) > 0) { const t = sumAmt(live.filter(x => x.taker)); out.push(["info", bi(`সবচেয়ে বেশি নগদ নিয়েছেন ${byTaker[0].k} — মোটের ${brPct(byTaker[0].amt, t).toFixed(1)}% (${byTaker[0].n}টি চেক)`, `Top cash taker ${byTaker[0].k} — ${brPct(byTaker[0].amt, t).toFixed(1)}% of cash taken (${byTaker[0].n} cheques)`)]); }
  if (byBank[0] && tot > 0) out.push(["info", bi(`সবচেয়ে বেশি চেক ${byBank[0].k} থেকে — ${brPct(byBank[0].amt, tot).toFixed(1)}%`, `Most value drawn on ${byBank[0].k} — ${brPct(byBank[0].amt, tot).toFixed(1)}%`)]);
  if (busiest && real.length > 1) out.push(["info", bi(`সবচেয়ে ব্যস্ত দিন ${dmy(busiest.k)}: ${busiest.n}টি চেক, ৳ ${money0(busiest.amt)}`, `Busiest day ${dmy(busiest.k)}: ${busiest.n} cheques, ৳ ${money0(busiest.amt)}`)]);
  if (blank) out.push(["info", bi(`${blank}টি ব্ল্যাংক স্টাব (টাকা ০)`, `${blank} blank stub(s) (zero amount)`)]);
  return out;
}
function cqDash(c, F) {
  const { from, to, all, live, real, am, hold, by } = c;
  const tot = sumAmt(live), cashL = live.filter(x => purposeKey(x.purpose) === "cash"), cl = by("Cleared"), pend = by("Pending");
  const badAll = all.filter(x => ["Bounced", "Cancelled", "Stopped"].includes(x.status));
  const blank = all.filter(x => !x.amount).length, avg = real.length ? tot / real.length : 0, big = real.reduce((a, b) => b.amount > a.amount ? b : a, real[0] || { amount: 0 });
  const oldest = pend.length ? Math.max(...pend.map(x => daysBetween(x.date, today()))) : 0;
  const den = all.filter(x => x.amount > 0 && x.status !== "Cancelled"), rate = den.length ? den.filter(x => x.status === "Cleared").length / den.length * 100 : null;
  const byDay = cqGroup(live, x => x.date), busiest = byDay.sort((a, b) => b.n - a.n || b.amt - a.amt)[0];
  const byTaker = cqGroup(live.filter(x => x.taker), x => x.taker), byBank = cqGroup(live, x => am[x.code]?.bank || ""), byPur = cqGroup(live, cqPurpose), byAcc = cqGroup(live, x => x.code);
  const dayAmt = [...new Map(cqGroup(live, x => x.date).map(r => [r.k, r])).values()].sort((a, b) => a.k.localeCompare(b.k)).map(r => r.amt);
  const stm = S.statementReady ? statementSummary(real) : null;
  const kpi = (cls, ic, lab, val, sub, sp) => `<div class="br-k ${cls}"><div class="br-kt"><span class="br-ki">${ico(ic)}</span><span class="br-kl">${lab}</span></div><div class="br-kv num">${val}</div><div class="br-ks">${sub}</div>${sp || ""}</div>`;
  const kpis = [
    kpi("k1", "list", bi("লাইভ চেক", "Live cheques"), "৳ " + money0(tot), `${real.length} ${bi("চেক", "cheques")}${blank ? ` · ${blank} ${bi("ব্ল্যাংক", "blank")}` : ""}`, brSpark(dayAmt)),
    kpi("", "wallet", bi("নগদ উত্তোলন", "Cash withdrawal"), "৳ " + money0(sumAmt(cashL)), `${cashL.length} ${bi("চেক", "cheques")} · ${brPct(sumAmt(cashL), tot).toFixed(1)}%`),
    kpi("k3", "shield", bi("ক্লিয়ার্ড", "Cleared"), "৳ " + money0(sumAmt(cl)), `${cl.length} ${bi("চেক", "cheques")}${rate == null ? "" : ` · ${rate.toFixed(1)}%`}`),
    kpi("k4", "clock", bi("পেন্ডিং", "Pending"), "৳ " + money0(sumAmt(pend)), pend.length ? `${pend.length} ${bi("চেক · সবচেয়ে পুরনো", "cheques · oldest")} ${oldest} ${bi("দিন", "d")}` : bi("কিছু পেন্ডিং নেই", "Nothing pending")),
    kpi(badAll.length ? "k2" : "", "flag", bi("সমস্যাযুক্ত চেক", "Problem cheques"), `${badAll.length}`, `${bi("বাউন্স", "Bounced")} ${all.filter(x => x.status === "Bounced").length} · ${bi("বাতিল", "Cancelled")} ${all.filter(x => x.status === "Cancelled").length} · ${bi("স্টপ", "Stopped")} ${all.filter(x => x.status === "Stopped").length}`),
    kpi("", "chart", bi("গড় চেক", "Average cheque"), "৳ " + money0(avg), `${real.length} ${bi("টাকার চেক", "paid cheques")}`),
    kpi("", "trend", bi("সবচেয়ে বড় চেক", "Largest cheque"), "৳ " + money0(big.amount), big.code ? `${esc(big.code)} · ${dmy(big.date)}` : "—"),
    stm ? kpi("k3", "shield", bi("স্টেটমেন্ট যাচাই", "Statement verified"), `${stm.count}<span class="mut"> / ${real.length}</span>`, `${brPct(stm.count, real.length).toFixed(1)}% · ৳ ${money0(stm.amount)}`) : kpi("", "cal", bi("সবচেয়ে ব্যস্ত দিন", "Busiest day"), busiest ? dmy(busiest.k) : "—", busiest ? `${busiest.n} ${bi("চেক", "cheques")} · ৳ ${money0(busiest.amt)}` : "")
  ].join("");
  const ins = cqInsights({ live, real, all, byTaker, byBank, pend, oldest, blank, rate, busiest, bad: badAll }).map(([k, t]) => `<li class="br-in ${k}"><i></i><span>${esc(t)}</span></li>`).join("");
  const stRows = STATUSES.map(s => ({ s, n: all.filter(x => x.status === s).length, amt: sumAmt(all.filter(x => x.status === s)) })).filter(r => r.n);
  const nAll = all.length || 1;
  const pipe = `<div class="cq-pipe" role="img" aria-label="${bi("স্ট্যাটাস অনুযায়ী চেক", "Cheques by status")}">${stRows.map(r => `<u style="width:${(r.n / nAll * 100).toFixed(2)}%;background:${CQ_CLR[r.s]}" title="${esc(r.s)} · ${r.n}"></u>`).join("")}</div><div class="cq-pl">${stRows.map(r => `<span><i style="background:${CQ_CLR[r.s]}"></i><b>${esc(r.s)}</b> ${r.n}<em>৳ ${money0(r.amt)}</em></span>`).join("")}</div>`;
  const bar = (rows, clr) => rows.length ? rows.map((r, i) => { const p = brPct(r.amt, tot); return `<div class="br-row"><div class="br-rt"><i style="background:${clr(r, i)}"></i><b title="${esc(r.k)}">${esc(r.k)}</b><span class="mut">${r.n} ${bi("চেক", "chq")}</span><span class="num br-ra">${money0(r.amt)}</span></div><div class="br-bar"><u style="width:${Math.min(100, p).toFixed(1)}%;background:${clr(r, i)}"></u></div><div class="br-rs"><span>${p.toFixed(1)}%</span><span></span></div></div>`; }).join("") : `<div class="mut sm">—</div>`;
  const pRows = [...pend].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8).map(x => { const d = daysBetween(x.date, today()); return `<div class="br-mv"><i class="bdot" style="background:${brandOf(am[x.code]).c1}"></i><span class="br-mn"><b>${esc(x.code)} · #${esc(x.no)}</b><em>${esc(am[x.code]?.holder || "")}${x.taker ? " · " + esc(x.taker) : ""}</em></span><span class="cq-age ${d > 7 ? "old" : ""}">${d} ${bi("দিন", "d")}</span><span class="num">${money0(x.amount)}</span></div>`; }).join("");
  const bRows = [...real].sort((a, b) => b.amount - a.amount).slice(0, 6).map(x => `<div class="br-mv"><i class="bdot" style="background:${brandOf(am[x.code]).c1}"></i><span class="br-mn"><b>${esc(x.code)} · #${esc(x.no)}</b><em>${dmy(x.date)} · ${esc(cqPurpose(x))}${x.taker ? " · " + esc(x.taker) : ""}</em></span>${cqSt(x.status)}<span class="num">${money0(x.amount)}</span></div>`).join("");
  const sg = (k, l) => `<button type="button" class="chip${F.cs === k ? " on" : ""}" data-cs="${k}">${l}</button>`, gg = (k, l) => `<button type="button" class="chip${F.cg === k ? " on" : ""}" data-cg="${k}">${l}</button>`, dd = (k, l) => `<button type="button" class="chip${F.cd === k ? " on" : ""}" data-cd="${k}">${l}</button>`;
  return `<div class="br-chips"><span>${ico("cal")}${dmy(from)} → ${dmy(to)}</span><span>${ico("list")}${all.length} ${bi("চেক এন্ট্রি", "entries")}</span><span>${ico("card")}${byAcc.length} A/C</span><span>${ico("bank")}${byBank.length} ${bi("ব্যাংক", "banks")}</span>${hold ? `<span class="on">${ico("eye")}${hold}</span>` : ""}</div>
   <div class="br-kpis">${kpis}</div>
   <ul class="br-ins">${ins}</ul>
   <section class="card br-card"><div class="br-h"><h3>${bi("স্ট্যাটাস পাইপলাইন", "Status pipeline")}</h3><span class="mut sm">${all.length}</span></div>${pipe}</section>
   <div class="br-g2">
    <section class="card br-card br-chartc"><div class="br-h"><h3>${bi("চেক ট্রেন্ড", "Cheque trend")}</h3><div class="br-ctl"><div class="seg">${sg("a", bi("টাকা", "Amount"))}${sg("n", bi("সংখ্যা", "Count"))}</div><div class="seg">${gg("daily", bi("দিন", "Day"))}${gg("weekly", bi("সপ্তাহ", "Week"))}${gg("monthly", bi("মাস", "Month"))}</div></div></div><div id="cq-chart"></div></section>
    <section class="card br-card"><div class="br-h"><h3>${bi("ভাগ", "Share")}</h3><div class="br-ctl"><div class="seg">${dd("pur", bi("খাত", "Purpose"))}${dd("st", bi("স্ট্যাটাস", "Status"))}${dd("bank", bi("ব্যাংক", "Bank"))}</div></div></div><div class="br-dw" id="cq-donut"></div></section>
   </div>
   <div class="br-g2">
    <section class="card br-card"><div class="br-h"><h3>${bi("খাত অনুযায়ী", "By purpose")}</h3><span class="mut sm">${byPur.length}</span></div><div class="br-list">${bar(byPur, (r, i) => BR_PAL[i % BR_PAL.length])}</div></section>
    <section class="card br-card"><div class="br-h"><h3>${bi("কে নগদ নিয়েছেন", "Cash taken by")}</h3><span class="mut sm">${byTaker.length}</span></div><div class="br-list">${bar(byTaker, (r, i) => BR_PAL[(i + 2) % BR_PAL.length])}</div></section>
   </div>
   <div class="br-g2">
    <section class="card br-card"><div class="br-h"><h3>${bi("ব্যাংক অনুযায়ী", "By bank")}</h3><span class="mut sm">${byBank.length}</span></div><div class="br-list">${bar(byBank, r => brBankClr(r.k))}</div></section>
    <section class="card br-card"><div class="br-h"><h3>${bi("অ্যাকাউন্ট অনুযায়ী (শীর্ষ ১০)", "By account (top 10)")}</h3><span class="mut sm">${byAcc.length}</span></div><div class="br-list">${bar(byAcc.slice(0, 10), r => brandOf(am[r.k]).c1)}</div></section>
   </div>
   <div class="br-g2">
    <section class="card br-card"><div class="br-h"><h3>${ico("clock")}${bi("পেন্ডিং ওয়াচলিস্ট", "Pending watchlist")}</h3></div>${pRows || `<div class="mut sm">${bi("কোনো চেক পেন্ডিং নেই ✓", "No pending cheques ✓")}</div>`}</section>
    <section class="card br-card"><div class="br-h"><h3>${ico("trend")}${bi("সবচেয়ে বড় চেক", "Largest cheques")}</h3></div>${bRows || `<div class="mut sm">—</div>`}</section>
   </div>
   <section class="card br-card br-acc"><div class="br-h"><h3>${bi("সব চেক", "All cheques")}</h3><span class="mut sm" id="cq-cnt"></span></div>
    <div class="br-tools"><label class="br-s">${ico("search")}<input class="in" id="cq-q" type="search" placeholder="${bi("A/C, হোল্ডার, চেক নং, পার্টি, নাম খুঁজুন…", "Search A/C, holder, cheque no, party, name…")}" value="${esc(F.qq || "")}" autocomplete="off"></label><select class="in cq-sel" id="cq-sf" aria-label="Status"><option value="">${bi("সব স্ট্যাটাস", "All statuses")}</option>${STATUSES.map(s => `<option ${F.qf === s ? "selected" : ""}>${s}</option>`).join("")}</select><label class="keep"><input type="checkbox" id="cq-z" ${F.qz ? "checked" : ""}> ${bi("ব্ল্যাংক স্টাব লুকাও", "Hide blank stubs")}</label></div>
    <div class="br-tw"><table class="br-t"><thead id="cq-th"></thead><tbody id="cq-tb"></tbody><tfoot id="cq-tf"></tfoot></table></div></section>`;
}
function cqBind(root, c, F) {
  const { live, all, am } = c, hasStm = !!S.statementReady;
  const drawChart = () => {
    const m = F.cg, mp = new Map();
    live.forEach(x => { const k = hKey(m, x.date), o = mp.get(k) || { k, rows: [], total: 0, block: 0, deb: 0, cre: 0 }; o.total += F.cs === "a" ? x.amount : 1; mp.set(k, o); });
    const g = [...mp.values()].sort((a, b) => a.k.localeCompare(b.k)), box = $("#cq-chart", root);
    box.innerHTML = g.length ? hChart(g, m) : `<div class="mut sm" style="padding:24px;text-align:center">—</div>`;
    if (g.length) hChartBind(box, g, m, F.cs === "a" ? bi("টাকা", "Amount") : bi("চেক", "Cheques"), F.cs === "a" ? "৳ " : "");
    $$("[data-cs]", root).forEach(b => b.classList.toggle("on", b.dataset.cs === F.cs)); $$("[data-cg]", root).forEach(b => b.classList.toggle("on", b.dataset.cg === F.cg));
  };
  $$("[data-cs]", root).forEach(b => b.onclick = () => { F.cs = b.dataset.cs; drawChart(); });
  $$("[data-cg]", root).forEach(b => b.onclick = () => { F.cg = F.cgU = b.dataset.cg; drawChart(); });
  drawChart();
  const dsets = () => {
    const k = F.cd, rows = k === "st" ? cqGroup(all.filter(x => x.amount > 0), x => x.status).map(r => ({ ...r, c: CQ_CLR[r.k] })) : k === "bank" ? cqGroup(live, x => am[x.code]?.bank || "").map(r => ({ ...r, c: brBankClr(r.k) })) : cqGroup(live, cqPurpose).map((r, i) => ({ ...r, c: BR_PAL[i % BR_PAL.length] }));
    const pos = rows.filter(r => r.amt > 0), top = pos.slice(0, 6), rest = pos.slice(6).reduce((s, r) => s + r.amt, 0);
    return top.concat(rest > 0 ? [{ k: bi("অন্যান্য", "Others"), amt: rest, c: "#94a3b8" }] : []);
  };
  const drawDonut = () => {
    const it = dsets(), t = it.reduce((s, r) => s + r.amt, 0);
    $("#cq-donut", root).innerHTML = t > 0 ? `${brDonut(it, t)}<ul class="br-lg">${it.map(r => `<li><i style="background:${r.c}"></i><span>${esc(r.k)}</span><b>${brPct(r.amt, t).toFixed(1)}%</b></li>`).join("")}</ul>` : `<div class="mut sm">—</div>`;
    $$("[data-cd]", root).forEach(b => b.classList.toggle("on", b.dataset.cd === F.cd));
  };
  $$("[data-cd]", root).forEach(b => b.onclick = () => { F.cd = b.dataset.cd; drawDonut(); });
  drawDonut();
  const COLS = [["date", bi("তারিখ", "Date"), 0], ["code", bi("অ্যাকাউন্ট", "Account"), 0], ["no", bi("চেক নং", "Cheque no"), 1, "hm"], ["amount", bi("টাকা", "Amount"), 1], ["purpose", bi("খাত", "Purpose"), 0, "hm"], ["taker", bi("গ্রহীতা", "Taken by"), 0, "hm"], ["status", bi("স্ট্যাটাস", "Status"), 0]];
  const val = (r, k) => k === "purpose" ? cqPurpose(r) : k === "taker" ? (r.taker || r.party || "") : r[k];
  const drawTable = () => {
    const q = (F.qq || "").trim().toLowerCase(), k = F.qss, d = F.qsd;
    let list = all.filter(r => (!F.qz || r.amount > 0) && (!F.qf || r.status === F.qf) && (!q || `${r.code} ${am[r.code]?.holder || ""} ${am[r.code]?.bank || ""} ${r.no} ${r.party || ""} ${r.taker || ""} ${r.purpose || ""} ${r.remarks || ""}`.toLowerCase().includes(q)));
    list = [...list].sort((a, b) => { const x = val(a, k), y = val(b, k); return (typeof x === "string" ? String(x).localeCompare(y) : (x ?? 0) - (y ?? 0)) * d || b.date.localeCompare(a.date); });
    const shown = list.slice(0, 500);
    $("#cq-th", root).innerHTML = `<tr>${COLS.map(([key, l, r, hm]) => `<th class="${r ? "r" : ""} ${hm || ""} srt${key === k ? " on" : ""}" data-k="${key}" tabindex="0" role="button" aria-sort="${key === k ? (d > 0 ? "ascending" : "descending") : "none"}">${l}<i>${key === k ? (d > 0 ? "▲" : "▼") : ""}</i></th>`).join("")}</tr>`;
    $("#cq-tb", root).innerHTML = shown.length ? shown.map(r => `<tr><td>${dmy(r.date)}</td><td class="cd"><i class="bdot" style="background:${brandOf(am[r.code]).c1}"></i><b>${esc(r.code)}</b> <span class="mut">${esc(am[r.code]?.holder || "")}</span></td><td class="r num hm">${esc(r.no)}</td><td class="r num"><b>${r.amount ? money0(r.amount) : "—"}</b></td><td class="hm">${esc(cqPurpose(r))}</td><td class="hm">${esc(r.taker || r.party || "")}</td><td>${cqSt(r.status)}${hasStm && statementVerification(r) ? ' <span class="cq-ok" title="Statement verified">✓</span>' : ""}</td></tr>`).join("") : `<tr><td colspan="7" class="z" style="text-align:center">${bi("কোনো চেক মেলেনি", "No matching cheques")}</td></tr>`;
    const S2 = list.reduce((s, r) => ({ n: s.n + 1, a: s.a + r.amount }), { n: 0, a: 0 });
    $("#cq-tf", root).innerHTML = list.length ? `<tr><td colspan="2">${bi("মোট", "TOTAL")} · ${S2.n}</td><td class="hm"></td><td class="r num">${money0(S2.a)}</td><td class="hm"></td><td class="hm"></td><td></td></tr>` : "";
    $("#cq-cnt", root).textContent = `${list.length} / ${all.length}${list.length > shown.length ? " · 500" : ""}`;
    $$("#cq-th th", root).forEach(th => { const go = () => { const key = th.dataset.k; if (F.qss === key) F.qsd = -F.qsd; else { F.qss = key; F.qsd = ["code", "purpose", "taker", "status"].includes(key) ? 1 : -1; } drawTable(); }; th.onclick = go; th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
  };
  $("#cq-q", root).oninput = e => { F.qq = e.target.value; drawTable(); };
  $("#cq-sf", root).onchange = e => { F.qf = e.target.value; drawTable(); };
  $("#cq-z", root).onchange = e => { F.qz = e.target.checked; drawTable(); };
  drawTable();
}

async function vReports(v) {
  const date = sessionStorage.getItem("nabiad_bank_report_date");
  sessionStorage.removeItem("nabiad_bank_report_date");
  const F = { ...pbInit("month"), ...(date ? { m: "day", d: date } : {}), tab: date ? "bank" : sessionStorage.getItem("nabiad_rep_tab") || "bank", holder: "", bank: "", bs: "t", bg: "weekly", as: "cl", ad: -1, aq: "", az: false, sheet: false, cs: "a", cg: "", cgU: "", cd: "pur", qq: "", qf: "", qz: false, qss: "date", qsd: -1 }; const holders = [...new Set(S.accounts.map(a => a.holder).filter(Boolean))].sort(), banksL = [...new Set(S.accounts.map(a => a.bank).filter(Boolean))].sort();
  v.innerHTML = head("ব্যাংক বিস্তারিত রিপোর্ট", `${repBtns("p")}<button class="btn" id="p-x">${ico("dl")} Excel</button>`) + `
   <div class="tabs noprint">${[["bank", ico("bank") + " ব্যাংক ব্যালেন্স"], ["chq", ico("list") + " চেক"]].map(([k, l]) => `<span class="chip ${k === F.tab ? "on" : ""}" data-tab="${k}">${l}</span>`).join("")}</div>
   <div class="card tbar noprint tb-inl">${pbBar("p", F)}
   <div class="row br-fl" ><div><label class="f">${bi("অ্যাকাউন্ট হোল্ডার", "Account holder")}</label><select class="in" id="p-h"><option value="">${bi("সব", "All")}</option>${holders.map(h => `<option>${esc(h)}</option>`).join("")}</select></div><div><label class="f">${bi("ব্যাংক", "Bank")}</label><select class="in" id="p-b"><option value="">${bi("সব", "All")}</option>${banksL.map(h => `<option>${esc(h)}</option>`).join("")}</select></div></div></div>
   <div id="p-dash" class="br-dash noprint"></div>
   <div class="br-sheetbar noprint" id="p-sheetbar" hidden><button type="button" class="btn" id="p-sheet-t" aria-expanded="false" aria-controls="p-sheetcard">${ico("print")}<span>${bi("A4 রিপোর্ট শিট — স্ক্রিনশট / PDF / শেয়ারের জন্য", "A4 report sheet — for screenshot / PDF / share")}</span><i class="br-chv"></i></button></div>
   <div class="card rep-wrap" id="p-sheetcard"><div class="rep-scroll"><div id="p-out"></div></div></div>`;
  let cur = null;
  const syncSheet = () => { const bank = (F.tab === "bank" && cur?.kind === "bank") || (F.tab === "chq" && cur?.kind === "chq"), bar = $("#p-sheetbar", v); bar.hidden = !bank; bar.classList.toggle("open", !!F.sheet); $("#p-sheetcard", v).classList.toggle("br-collapsed", bank && !F.sheet); $("#p-sheet-t", v).setAttribute("aria-expanded", String(!!F.sheet)); if (!bank || F.sheet) dcFit(v, "p-in"); };
  const setSheet = o => { F.sheet = o; syncSheet(); };
  const tbl = (title, rows, cols, total = true, fmt = r => [r.n, money0(r.amt)]) => { const T = rows.reduce((q, r) => ({ n: q.n + (r.n || 0), a: q.a + r.amt }), { n: 0, a: 0 });
    return repBox(title, cols, rows.map(r => `<tr><td>${r.k}</td>${fmt(r).map(x => `<td class="r num">${x}</td>`).join("")}</tr>`).join(""), total && rows.length ? `<tr class="tot"><td>TOTAL</td>${fmt({ n: T.n, amt: T.a }).map(x => `<td class="r num">${x}</td>`).join("")}</tr>` : ""); };
  const range = () => pbRange(F);
  async function draw() {
    const [from, to] = range(), am = accMap(), out = $("#p-out", v); const hOk = code => (!F.holder || (am[code] || {}).holder === F.holder) && (!F.bank || (am[code] || {}).bank === F.bank);
    const label = "", holdT = [F.holder, F.bank].filter(Boolean).join(" · "), hold = holdT ? ` · ${esc(holdT)}` : "", dash = $("#p-dash", v);
    if (F.tab === "bank") {
      out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`; dash.innerHTML = `<div class="skel" style="height:190px"></div>`;
      let rows; try { rows = (await cached(`br:${from}:${to}`, 120000, () => API.balancesRange(addDays(from, -10), to))).filter(r => hOk(r.code) && am[r.code]?.daily); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(isNetErr(e) ? "ইন্টারনেট নেই — ব্যাংক রিপোর্টের জন্য অনলাইন থাকতে হবে" : e.message)}</div>`; dash.innerHTML = ""; cur = null; syncSheet(); return; }
      const before = rows.filter(r => r.date < from), inR = rows.filter(r => r.date >= from);
      const ser = balSeries(inR); if (!ser.length) { const lastD0 = S.lastBal && (S.lastBal < from || S.lastBal > to) ? S.lastBal : ""; out.innerHTML = label + `<div class="card empty">${bi("এই সময়ে কোনো ব্যালেন্স সেভ নেই", "No saved balances in this period")}${lastD0 ? `<div style="margin-top:12px"><button type="button" class="btn" id="p-last">${bi("সর্বশেষ সেভ করা তারিখে যান", "Go to last saved date")} · ${dmy(lastD0)} ›</button></div>` : ""}</div>`; dash.innerHTML = ""; cur = null; syncSheet();
      const jb = $("#p-last", out); if (jb) jb.onclick = () => { F.d = lastD0; if (F.m === "custom") { F.f = addDays(lastD0, -29); F.t = lastD0; } $("#p", v).outerHTML = pbBar("p", F); pbBind(v, "p", F, draw); draw(); };
      return; }
      const firstD = ser[0].date, lastD = ser[ser.length - 1].date, openD = before.length ? before[before.length - 1].date : firstD;
      const mapOn = (arr, d) => Object.fromEntries(arr.filter(r => r.date === d).map(r => [r.code, r]));
      const O = mapOn(before.length ? before : inR, openD), C = mapOn(inR, lastD);
      const codes = [...new Set([...Object.keys(O), ...Object.keys(C)])].sort((a, b) => (am[a]?.sort || 0) - (am[b]?.sort || 0));
      const accRows = codes.map(c => ({ c, a: am[c], o: O[c]?.total || 0, cl: C[c]?.total || 0, bl: C[c]?.block || 0 })).map(r => ({ ...r, ch: r.cl - r.o }));
      const grp = kf => { const m = new Map(); accRows.forEach(r => { const k = kf(r) || "—"; const o = m.get(k) || { k, n: 0, amt: 0, o: 0, bl: 0 }; o.n++; o.amt += r.cl; o.o += r.o; o.bl += r.bl; m.set(k, o); }); return [...m.values()].sort((a, b) => b.amt - a.amt); };
      const byBank = grp(r => r.a?.bank), byHolder = grp(r => r.a?.holder);
      const L = ser[ser.length - 1], To = accRows.reduce((s, r) => s + r.o, 0), mx = ser.reduce((a, b) => b.t > a.t ? b : a), mn = ser.reduce((a, b) => b.t < a.t ? b : a);
      const movers = [...accRows].filter(r => Math.abs(r.ch) >= 1).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)).slice(0, 12);
      cur = { kind: "bank", from, to, ser, accRows, byBank, byHolder };
      out.innerHTML = repSheet("p-in", "Bank Balance Report · ব্যাংক ব্যালেন্স রিপোর্ট" + hold, from, to,
        repKpi([[`Closing Balance · ${dmy(lastD)}`, "৳ " + money0(L.t), "k1"], [`Change since ${dmy(openD)}`, (L.t - To >= 0 ? "+" : "−") + money0(Math.abs(L.t - To)), L.t - To >= 0 ? "k3" : "k2"], [`Usable · Block ${money0(L.b)}`, "৳ " + money0(L.t - L.b), "k3"], [`Highest · Lowest ${money0(mn.t)}`, "৳ " + money0(mx.t), ""]]),
        repOne(`<div class="dcs-t">Daily Total Balance (${ser.length} days)</div>${repLine([{ v: ser.map(x => x.t), c: "#6366f1", n: "Total" }, { v: ser.map(x => x.t - x.b), c: "#10b981", n: "Usable" }])}`) +
        repTwo(tbl("By Bank (closing)", byBank.map(r => ({ ...r, k: esc(r.k) })), ["Bank", "A/C", "Balance"]), tbl("By Holder (closing)", byHolder.map(r => ({ ...r, k: esc(r.k) })), ["Holder", "A/C", "Balance"])) +
        repOne(tbl("Biggest Movers", movers.map(r => ({ k: `<b>${esc(r.c)}</b> <span class="mut">${esc(r.a?.holder || "")}</span>`, n: money0(r.o), amt: r.ch, cl: r.cl })), ["Account", "Opening", "Closing", "Change"], false, r => [r.n, money0(r.cl), `<b class="${r.amt >= 0 ? "gr" : "rd"}">${r.amt >= 0 ? "+" : "−"}${money0(Math.abs(r.amt))}</b>`])) +
        repOne(tbl("All Accounts", accRows.map(r => ({ k: `<i class="bdot" style="background:${brandOf(r.a).c1}"></i><b>${esc(r.c)}</b> <span class="mut">${esc(r.a?.holder || "")}</span>`, n: money0(r.o), amt: r.cl, ch: r.ch, bl: r.bl })), ["Account", "Opening", "Closing", "Block", "Change"], false, r => [r.n, money0(r.amt), r.bl ? money0(r.bl) : "—", `<span class="${r.ch >= 0 ? "gr" : "rd"}">${Math.abs(r.ch) < 1 ? "—" : (r.ch >= 0 ? "+" : "−") + money0(Math.abs(r.ch))}</span>`])));
      const dctx = { from, to, ser, accRows, byBank, byHolder, L, To, openD, lastD, mx, mn, movers, hold: F.holder || F.bank ? esc([F.holder, F.bank].filter(Boolean).join(" · ")) : "" };
      dash.innerHTML = brDash(dctx, F); brBind(dash, dctx, F); syncSheet();
      return;
    }
    const all = S.cheques.filter(c => c.date >= from && c.date <= to && hOk(c.code)); const live = all.filter(isLive), by = s => all.filter(c => c.status === s);
    const monRows = group(live, c => c.date.slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({ ...r, k: (LANG === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : BN_M)[+r.k.slice(5) - 1] + " " + r.k.slice(0, 4) }));
    const T = { pur: group(live, c => c.purpose.split(" (")[0]).sort((a, b) => b.amt - a.amt), tak: group(live.filter(c => c.taker), c => c.taker).sort((a, b) => b.amt - a.amt), st: group(all, c => c.status).sort((a, b) => b.amt - a.amt), bank: group(live, c => (am[c.code] || {}).bank).sort((a, b) => b.amt - a.amt), acc: group(live, c => `${c.code} <span class="mut sm">${esc((am[c.code] || {}).holder || "")}</span>`).sort((a, b) => b.amt - a.amt), day: group(live, c => c.date).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({ ...r, k: dmy(r.k) })), mon: monRows };
    cur = { kind: "chq", from, to, all, live, T };
    if (!all.length) { dash.innerHTML = ""; out.innerHTML = label + `<div class="card empty">${bi("এই সময়ে কোনো চেক এন্ট্রি নেই।", "No cheque entries in this period.")}<div class="mut sm" style="margin-top:6px">${bi(`ডাটাবেসে মোট <b>${S.cheques.length}</b>টি চেক আছে। চেক এন্ট্রি করলে এখানে খাত, ব্যাংক, অ্যাকাউন্ট আর দিন অনুযায়ী হিসাব আসবে।`, `There are <b>${S.cheques.length}</b> cheque(s) in the database. Once cheques are entered, totals by purpose, bank, account and day will appear here.`)}</div>${S.me.role !== "boss" ? `<div style="margin-top:12px"><a class="btn pri sm" href="#/entry">${ico("plus")} চেক এন্ট্রি</a></div>` : ""}</div>`; cur = null; syncSheet(); return; }
    out.innerHTML = repSheet("p-in", "Cheque Report · চেক রিপোর্ট" + hold, from, to,
      repKpi([[`Live Cheques · ৳ ${money0(sumAmt(live))}`, live.length, "k1"], [`Cleared · ৳ ${money0(sumAmt(by("Cleared")))}`, by("Cleared").length, "k3"], [`Pending · ৳ ${money0(sumAmt(by("Pending")))}`, by("Pending").length, ""], [`Bounced / Cancelled · ৳ ${money0(sumAmt(by("Bounced")))}`, `${by("Bounced").length} / ${by("Cancelled").length}`, "k2"]]),
      repTwo(tbl("By Purpose", T.pur, ["Purpose", "Cheque", "Amount"]), tbl("Cash Taken By", T.tak, ["Name", "Cheque", "Amount"])) +
      repTwo(tbl("By Status", T.st, ["Status", "Cheque", "Amount"]), tbl("By Bank", T.bank, ["Bank", "Cheque", "Amount"])) +
      repOne(tbl("By Account", T.acc, ["Account", "Cheque", "Amount"])) + statementReportBlock(all) +
      repTwo(daysBetween(from, to) <= 62 ? tbl("By Day", T.day, ["Date", "Cheque", "Amount"]) : "", tbl("By Month", T.mon, ["Month", "Cheque", "Amount"])));
    const spanD = daysBetween(from, to) + 1; F.cg = F.cgU || (spanD <= 45 ? "daily" : spanD <= 200 ? "weekly" : "monthly");
    const cctx = { from, to, all, live, real: live.filter(c => c.amount > 0), am, by, hold: holdT ? esc(holdT) : "" };
    dash.innerHTML = cqDash(cctx, F); cqBind(dash, cctx, F); syncSheet();
    dcFit(v, "p-in");
  }
  $$(".chip[data-tab]", v).forEach(c => c.onclick = () => { F.tab = c.dataset.tab; sessionStorage.setItem("nabiad_rep_tab", F.tab); $$(".chip[data-tab]", v).forEach(x => x.classList.toggle("on", x === c)); draw(); });
  pbBind(v, "p", F, draw);
  $("#p-h", v).onchange = e => { F.holder = e.target.value; draw(); };
  $("#p-b", v).onchange = e => { F.bank = e.target.value; draw(); };
  $("#p-sheet-t", v).onclick = () => setSheet(!F.sheet);
  $("#p-x", v).onclick = () => {
    if (!cur) return toast("ডাটা নেই", "err"); const strip = s => String(s).replace(/<[^>]+>/g, "").trim();
    if (cur.kind === "bank") return exportXlsx({ Daily: [["Date", "Accounts", "Total", "Block", "Usable"], ...cur.ser.map(x => [dmy(x.date), x.n, x.t, x.b, x.t - x.b])], Accounts: [["Code", "Holder", "Bank", "Opening", "Closing", "Block", "Change"], ...cur.accRows.map(r => [r.c, r.a?.holder || "", r.a?.bank || "", r.o, r.cl, r.bl, r.ch])], "By Bank": [["Bank", "A/C", "Closing", "Block"], ...cur.byBank.map(r => [r.k, r.n, r.amt, r.bl])], "By Holder": [["Holder", "A/C", "Closing", "Block"], ...cur.byHolder.map(r => [r.k, r.n, r.amt, r.bl])] }, `Bank_Report_${cur.from}_${cur.to}.xlsx`);
    const sh = (rows, h) => [h, ...rows.map(r => [strip(r.k), r.n, r.amt])];
    exportXlsx({ Summary: [["Period", `${cur.from} → ${cur.to}`], ["Holder", F.holder || "All"], [], ["Live cheques", cur.live.length, sumAmt(cur.live)], ...statementSummaryExport(cur.all)], "By Purpose": sh(cur.T.pur, ["Purpose", "Count", "Amount"]), "By Cash Taker": sh(cur.T.tak, ["Name", "Count", "Amount"]), "By Status": sh(cur.T.st, ["Status", "Count", "Amount"]), "By Bank": sh(cur.T.bank, ["Bank", "Count", "Amount"]), "By Account": sh(cur.T.acc, ["Account", "Count", "Amount"]), "By Day": sh(cur.T.day, ["Date", "Count", "Amount"]), "By Month": sh(cur.T.mon, ["Month", "Count", "Amount"]), Details: [CHQ_HEAD, ...[...cur.all].sort((a, b) => a.date.localeCompare(b.date)).map(chqRow)] }, `Cheque_Report_${today()}.xlsx`);
  };
  await draw();
  const nm = () => `${cur?.kind === "chq" ? "Cheque" : "Bank"}_Report_${cur ? cur.from + "_" + cur.to : today()}`, tx = () => cur ? `${cur.kind === "chq" ? "Cheque" : "Bank balance"} report ${dmy(cur.from)} → ${dmy(cur.to)}` : "", el = () => $("#p-in", v);
  const via = fn => async () => { if (!cur) return toast("ডাটা নেই", "err"); const was = F.sheet, bank = true; if (bank && !was) { setSheet(true); await new Promise(r => setTimeout(r, 120)); } try { await fn(); } finally { if (bank && !was) setTimeout(() => setSheet(false), 800); } };
  $("#p-png", v).onclick = via(() => dcPng(el(), nm()));
  $("#p-pdf", v).onclick = via(() => dcPdf(el(), nm()));
  if ($("#p-sh", v)) $("#p-sh", v).onclick = via(() => dcShare(el(), nm(), tx()));
  const onRs = () => dcFit(v, "p-in"); window.addEventListener("resize", onRs); return () => window.removeEventListener("resize", onRs);
}

/* =================== v6: CASH — daily record =================== */
const CASH = {
  receipt: [{ g: "Chawkbazar", items: [["cz_cos", "Cosmetics Parties"], ["cz_food", "Food Parties"], ["cz_oth", "Others"]] }, { g: "", items: [["cz_chem", "Chemicals"], ["niramoy", "Niramoy"], ["dist", "Distribution"], ["suspense", "Suspense"], ["bank_in", "Bank"]] }],
  payment: [{ g: "", items: [["bank_out", "Bank"], ["lc", "LC/CC/OD"], ["loans", "Loans/Bills/Etc."], ["supp", "Suppliers"], ["p_oth", "Others"]] }]
};
const cashCategory = k => k === "cz_cash" ? "cz_oth" : k;
// Fold legacy daily totals on read without changing archived records.
function cashItems(items = {}) {
  if (!items?.cz_cash) return items || {};
  const { cz_cash: counter, cz_oth: others, ...rest } = items;
  const a = Math.round((+counter.a || 0) * 100) + Math.round((+others?.a || 0) * 100);
  const notes = [...new Set([counter.n, others?.n].filter(Boolean))];
  return { ...rest, cz_oth: { a: a / 100, ...(notes.length ? { n: notes.join(", ") } : {}) } };
}
const CASH_KEYS = t => CASH[t].flatMap(g => g.items.map(i => i[0]));
/* Bank lines (Receipt › Bank = cash withdrawn, Payment › Bank = cash deposited) are transfers between cash and bank: kept per A/C for Bank Closing / Cheque Posting, but NOT part of Total Receipt / Total Payment / Closing */
const CASH_MEMO = ["bank_in", "bank_out"];
const CASH_SUM_KEYS = t => CASH_KEYS(t).filter(k => !CASH_MEMO.includes(k));
const cashGroupNames = new Map();
const cashHead = (key, fallback) => cashGroupNames.get(cashCategory(key)) || fallback;
const cashLabel = k => { for (const t of ["receipt", "payment"]) for (const g of CASH[t]) for (const [kk, l] of g.items) if (kk === cashCategory(k)) return (g.g ? g.g + " · " : "") + cashHead(kk, l); return k; };
const cashType = k => CASH_KEYS("receipt").includes(cashCategory(k)) ? "receipt" : "payment";
function evalAmt(s) { s = String(s ?? "").replace(/[,৳\s]/g, ""); if (!s) return 0; if (!/^[-+]?\d*\.?\d+([+-]\d*\.?\d+)*$/.test(s)) return NaN; return s.match(/[+-]?\d*\.?\d+/g).reduce((a, b) => a + parseFloat(b), 0); }
function cashTotals(items) { items = cashItems(items); const sum = t => CASH_SUM_KEYS(t).reduce((s, k) => s + (+items?.[k]?.a || 0), 0); return { r: sum("receipt"), p: sum("payment") }; }
function cashFromBook(book, openingBank) {
  const { items } = cbGroup(book);
  const totals = cashTotals(items);
  const openingCash = Number(book.opening_cash) || 0;
  return {
    ...book, items, remarks: cbNotesText(book.remarks), opening_cash: openingCash, opening_bank: openingBank,
    total_receipt: totals.r, total_payment: totals.p,
    closing: openingBank == null ? null : openingCash + openingBank + totals.r - totals.p
  };
}

const cashUseBook = (book, legacy) => book && (book.status === "final" || legacy?.status !== "final");
const cashBankTotal = accounts => {
  const totals = Object.values(accounts).filter(row => row.total != null);
  return totals.length ? totals.reduce((sum, row) => sum + Number(row.total), 0) : null;
};

async function cashEff(date) {
  const [legacy, book] = await Promise.allSettled([API.cashOn(date), API.cbOn(date)]);
  let src = legacy.value || null;
  if (cashUseBook(book.value, src)) src = cashFromBook(book.value, null);
  return { src, ok: legacy.status === "fulfilled" && book.status === "fulfilled", state: src?.status || "none" };
}

async function cashGroupedRange(from, to) {
  if (from === "0000-01-01") from = "0001-01-01";
  const [legacy, books] = await Promise.all([API.cashRange(from, to), API.cbRange(from, to)]);
  const byDate = new Map(legacy.map(row => [row.date, row]));
  const relevant = books.filter(book => cashUseBook(book, byDate.get(book.date)));
  if (!relevant.length) return legacy;
  const historicalStart = from === "0001-01-01";
  const [previous, balances] = await Promise.all([
    historicalStart ? { map: {} } : API.prevBalances(from),
    API.balancesRange(from, to, { preserveMissing: true })
  ]);
  const dailyBank = new Map();
  for (const row of balances) {
    if (row.total != null) dailyBank.set(row.date, (dailyBank.get(row.date) || 0) + Number(row.total));
  }
  const dates = [...dailyBank.keys()].sort();
  let openingBank = cashBankTotal(previous.map), next = 0;
  for (const book of relevant.sort((a, b) => a.date.localeCompare(b.date))) {
    while (dates[next] && dates[next] < book.date) openingBank = dailyBank.get(dates[next++]);
    byDate.set(book.date, cashFromBook(book, openingBank));
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
const cashAccSum = (src, k) => { const m = {}; (src?.items?.[k]?.accs || []).forEach(z => { if (z.c) m[z.c] = (m[z.c] || 0) + (+z.a || 0); }); return m; };

async function vCash(v) {
  const todayDhaka = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Dhaka" });
  const last = [S.lastCash, S.lastBook].filter(Boolean).sort().pop();
  const date = sessionStorage.getItem("nabiad_cash_date") || (last && last < todayDhaka ? stepDay(last, 1) : todayDhaka);
  sessionStorage.removeItem("nabiad_cash_date");
  v.innerHTML = head(ROUTES[CUR].t, `<a class="btn" id="cs-register" href="#/register">${ico("list")}<span class="lb">${bi("রেজিস্টার", "Register")}</span></a>${allowed().includes("cash") ? `<a class="btn" id="cs-book" href="#/cash">${ico("book")}<span class="lb">${bi("ক্যাশ খাতা", "Cash Book")}</span></a>` : ""}<a class="btn" href="#/cashsum">${ico("chart")}<span class="lb">${bi("সামারি", "Summary")}</span></a>`)
    + `<div class="card tbar navcard cs-controls">${dateNav("cs", date > todayDhaka ? todayDhaka : date)}
      <button class="btn" id="cs-refresh" type="button">${bi("রিফ্রেশ", "Refresh")}</button></div><div id="cs-body" class="cs-workspace"></div>`;
  const body = $("#cs-body", v), dateInput = $("#cs-d", v), refresh = $("#cs-refresh", v);
  dateInput.max = todayDhaka;
  dateInput.setAttribute("aria-label", bi("ক্যাশ চেকারের তারিখ", "Cash Checker date"));
  $("#cs-register", v).onclick = () => sessionStorage.setItem("nabiad_register_date", dateInput.value);
  $("#cs-book", v)?.addEventListener("click", () => sessionStorage.setItem("nabiad_cash_date", dateInput.value));
  const amount = n => n == null ? "—" : "৳ " + money(n);
  const value = n => n == null ? null : Number(n);
  const round = n => Math.round(n * 100) / 100;
  const sum = (a, b) => a == null || b == null ? null : round(a + b);
  const line = (label, n, detail = "") => `<div class="cs-value"><dt>${esc(label)}${detail ? `<small>${esc(detail)}</small>` : ""}</dt><dd class="num">${amount(n)}</dd></div>`;
  const bankRows = map => Object.fromEntries(S.accounts.filter(a => a.daily && map?.[a.code]?.total != null).map(a => [a.code, map[a.code]]));
  const next = $("#cs-n", v);
  let revision = 0;

  async function draw() {
    const day = dateInput.value, request = ++revision;
    const current = () => request === revision && body.isConnected;
    refresh.disabled = false;
    next.disabled = !day || stepDay(day, 1) > todayDhaka;
    body.setAttribute("aria-busy", "false");
    if (!day || day > todayDhaka) {
      body.innerHTML = `<div class="alert am">${bi("আজ অথবা আগের একটি তারিখ বাছুন।", "Choose today or an earlier date.")}</div>`;
      return;
    }
    refresh.disabled = true;
    body.setAttribute("aria-busy", "true");
    body.innerHTML = `<div class="card empty" role="status">${bi("লোড হচ্ছে…", "Loading…")}</div>`;
    const [bookRead, legacyRead, prevBookRead, prevLegacyRead, prevBankRead, bankRead] = await Promise.allSettled([
      API.cbOn(day), API.cashOn(day), API.cbPrev(day), API.cashPrev(day), API.prevBalances(day), API.balancesOn(day), cashGroupLoad()
    ]);
    if (!current()) return;
    refresh.disabled = false;
    body.setAttribute("aria-busy", "false");
    const book = bookRead.value, legacy = legacyRead.value, record = book || legacy;
    const previousBook = prevBookRead.value, previousLegacy = prevLegacyRead.value;
    const previous = previousBook && (!previousLegacy || previousBook.date >= previousLegacy.date) ? previousBook : previousLegacy;
    const previousCounted = value(previous?.cash_in_hand);
    const openingCash = record ? value(record.opening_cash) : previousCounted;
    const previousBank = bankRows(prevBankRead.value?.map), savedBank = bankRows(bankRead.value);
    const openingBank = !book && legacy?.opening_bank != null ? value(legacy.opening_bank) : cashBankTotal(previousBank);
    const closingBank = cashBankTotal(savedBank);
    const partialBank = closingBank != null && Object.keys(previousBank).some(code => !savedBank[code] && S.accounts.some(a => a.code === code && a.status === "Active"));
    const grouped = book ? cbGroup(book) : null;
    const items = grouped?.items ?? cashItems(legacy?.items);
    const totals = cashTotals(items);
    const transfers = Object.fromEntries(CASH_MEMO.map(key => [key, value(items[key]?.a) ?? 0]));
    const cashMovement = round(totals.r - totals.p + transfers.bank_in - transfers.bank_out);
    const expectedCash = record && openingCash != null ? round(openingCash + cashMovement) : null;
    const countedCash = value(record?.cash_in_hand);
    const cashDiff = countedCash == null || expectedCash == null ? null : round(countedCash - expectedCash);
    const openingTotal = sum(openingCash, openingBank);
    const expectedTotal = record && openingTotal != null ? round(openingTotal + totals.r - totals.p) : null;
    const recordedTotal = partialBank ? null : sum(countedCash, closingBank);
    const combinedDiff = recordedTotal == null || expectedTotal == null ? null : round(recordedTotal - expectedTotal);
    const status = book ? (book.status === "final" ? bi("দিন বন্ধ", "Day closed") : bi("দিন খোলা", "Day open"))
      : record ? (record.status === "final" ? bi("ফাইনাল", "Final") : bi("ড্রাফট", "Draft"))
        : bookRead.status === "rejected" || legacyRead.status === "rejected" ? bi("যাচাই বাকি", "Data unavailable") : bi("এন্ট্রি নেই", "No entries");
    const source = book ? bi("ক্যাশ খাতা", "Cash Book") : legacy ? bi("পুরোনো ক্যাশ রেকর্ড", "Historical cash record") : bi("ক্যাশ ডাটা", "Cash data");
    const notices = [];
    const add = (lv, t) => notices.push({lv, t});
    if (bookRead.status === "rejected") add("err", bi("ক্যাশ খাতা লোড হয়নি। রিফ্রেশ করে আবার চেষ্টা করুন।", "Cash Book could not load. Refresh to try again."));
    else if (!book && legacyRead.status === "rejected") add("err", bi("পুরোনো রেকর্ড লোড হয়নি।", "Historical cash records could not load."));
    if (prevBookRead.status === "rejected" || prevLegacyRead.status === "rejected") add("warn", bi("আগের দিনের নগদ পুরোপুরি যাচাই করা যায়নি।", "Previous counted cash could not be fully verified."));
    if (prevBankRead.status === "rejected" || bankRead.status === "rejected") add("warn", bi("ব্যাংক ক্লোজিং ডাটা পুরোপুরি লোড হয়নি।", "Bank Closing data could not be fully loaded."));
    else if (partialBank) add("warn", bi("আগের ক্লোজিংয়ের কিছু সক্রিয় A/C এই তারিখে সেভ হয়নি।", "Some active accounts from the previous closing have no saved balance for this date."));
    else if (record && closingBank == null) add("info", bi("এই তারিখের ব্যাংক ক্লোজিং সেভ হলে বাস্তব ব্যাংক মোট দেখাবে।", "Actual bank balance appears after Bank Closing is saved for this date."));
    if (record && countedCash == null) add("info", bi("ক্যাশ খাতায় গুনে পাওয়া নগদ দিলে পার্থক্য দেখাবে।", "Enter counted cash in the Cash Book to calculate the difference."));
    if (cashDiff != null && cashDiff !== 0) add("err", bi("গুনে পাওয়া নগদ হিসাবের নগদের সঙ্গে মিলছে না।", "Counted cash differs from expected cash."));
    if (combinedDiff != null && combinedDiff !== 0) add("warn", bi("ক্যাশ ও ব্যাংকের মোট ক্লোজিং হিসাবের সঙ্গে মিলছে না।", "Recorded cash and bank closing differs from the expected total."));
    if (book && prevBookRead.status === "fulfilled" && prevLegacyRead.status === "fulfilled" && previousCounted != null && openingCash != null && round(openingCash - previousCounted) !== 0) {
      add("warn", bi(
        `Opening Cash ${amount(openingCash)} · ${dmy(previous.date)}-এর গুনে পাওয়া নগদ ${amount(previousCounted)}`,
        `Opening cash ${amount(openingCash)} · counted cash on ${dmy(previous.date)}: ${amount(previousCounted)}`
      ));
    }
    if (grouped?.warn.un) add("warn", bi(`${grouped.warn.un}টি লাইন Others-এ ধরা হয়েছে।`, `${grouped.warn.un} unmapped line(s) are counted under Others.`));
    if (grouped?.warn.noAc) add("err", bi(`${grouped.warn.noAc}টি Bank লাইনে A/C নেই।`, `${grouped.warn.noAc} bank line(s) have no account.`));
    // Compare available cash-book withdrawals with cheque postings by account.
    if (record && bookRead.status === "fulfilled") {
      const withdrawals = new Map(), posted = new Map();
      for (const entry of items.bank_in?.accs || []) {
        withdrawals.set(entry.c, (withdrawals.get(entry.c) || 0) + Number(entry.a || 0));
      }
      for (const cheque of S.cheques || []) {
        if (cheque.date === day && purposeKey(cheque.purpose) === "cash" && isLive(cheque) && cheque.amount > 0) {
          posted.set(cheque.code, (posted.get(cheque.code) || 0) + Number(cheque.amount));
        }
      }
      for (const code of new Set([...withdrawals.keys(), ...posted.keys()])) {
        const a = posted.get(code) || 0, b = withdrawals.get(code) || 0;
        if (round(a - b) !== 0) add("warn", bi(
          `${code || "—"} · চেক পোস্টিং ${amount(a)} ≠ ক্যাশ উত্তোলন ${amount(b)}`,
          `${code || "—"} · Cheque posting ${amount(a)} ≠ cash withdrawal ${amount(b)}`
        ));
      }
    }
    const diffLabel = n => n == null ? "—" : n === 0 ? bi("মিলেছে", "Matches") : amount(Math.abs(n)) + " · "
      + (n > 0 ? bi("বেশি", "Over") : bi("কম", "Short"));
    const receiptLabel = bi("মোট প্রাপ্তি", "Total Receipt"), paymentLabel = bi("মোট পরিশোধ", "Total Payment");
    const side = (type, title, cls, total) => `<section class="card csec ${cls}"><div class="csh"><h3>${title}</h3><b class="num">${amount(total)}</b></div>
      <dl>${CASH[type].map(group => {
        const heads = group.items.filter(([key]) => !CASH_MEMO.includes(key));
        const subtotal = heads.reduce((sum, [key]) => sum + (Number(items[key]?.a) || 0), 0);
        return (group.g ? `<div class="cs-value cs-group"><dt>${esc(group.g)}</dt><dd>${amount(subtotal)}</dd></div>` : "")
          + heads.map(([key, label]) => line(cashHead(key, label), Number(items[key]?.a) || 0)).join("");
      }).join("")}</dl></section>`;
    const transferPanel = record && (CASH_MEMO.some(key => transfers[key] || items[key]?.accs?.length)) ? `
      <section class="card csec cs-transfers"><div class="csh"><h3>${bi("ব্যাংক ট্রান্সফার", "Bank transfers")}</h3></div>
      <p class="mut sm">${bi("হাতে নগদের হিসাবে অন্তর্ভুক্ত। মোট প্রাপ্তি ও পরিশোধে ধরা হয় না।", "Included in expected cash. Excluded from receipt and payment totals.")}</p>
      <div class="cs-two">${CASH_MEMO.map((key, index) => `<dl>${line(index ? bi("ব্যাংকে জমা", "Bank deposits") : bi("ব্যাংক থেকে উত্তোলন", "Bank withdrawals"), transfers[key])}
        ${(items[key]?.accs || []).map(a => line(a.c || bi("A/C নেই", "Account missing"), value(a.a))).join("")}</dl>`).join("")}</div></section>` : "";
    const noRecord = !record && bookRead.status === "fulfilled" && legacyRead.status === "fulfilled";
    const counted = bi("গুনে পাওয়া নগদ", "Counted cash"), expected = bi("হিসাবের নগদ", "Expected cash");
    body.innerHTML = `
      <div class="card cs-source"><div role="status"><strong>${source}</strong><span class="tag ${record?.status === "final" ? "ok" : ""}">${status}</span><time datetime="${day}">${dmy(day)}</time></div>
      ${book?.updated_at ? `<small class="mut">${bi("সর্বশেষ আপডেট", "Last updated")} · ${esc(cbRegisterDate(book.updated_at))}</small>` : ""}</div>
      ${noRecord ? `<section class="card empty cs-empty"><strong>${bi("এই তারিখে কোনো ক্যাশ এন্ট্রি নেই", "No cash entries for this date")}</strong>
        ${$("#cs-book", v) ? `<a id="cs-open-book" href="#/cash" class="btn">${ico("book")} ${bi("ক্যাশ খাতা খুলুন", "Open Cash Book")}</a>` : ""}</section>` : ""}
      <div class="cs-metrics">${[[expected, amount(expectedCash), ""], [counted, amount(countedCash), ""],
        [bi("নগদে পার্থক্য", "Cash difference"), diffLabel(cashDiff), cashDiff == null ? "" : cashDiff === 0 ? "gr" : cashDiff < 0 ? "rd" : "am"],
        [bi("সেভ করা ব্যাংক ক্লোজিং", "Saved bank closing"), amount(closingBank), "",
          closingBank == null ? "" : Object.keys(savedBank).length + " " + bi("A/C", "accounts")]].map(([label, n, tone, detail]) =>
        `<div class="card"><span>${label}</span><strong class="num ${tone}">${n}</strong>${detail ? `<span>${detail}</span>` : ""}</div>`).join("")}</div>
      ${notices.length ? `<section class="card cbchk ${notices.some(x => x.lv === "err") ? "err" : notices.some(x => x.lv === "warn") ? "warn" : ""}">${cbChecksHtml(notices)}</section>` : ""}
      <div class="cs-two"><section class="card csec c-open"><div class="csh"><h3>${bi("শুরুর ব্যালেন্স", "Opening Balance")}</h3><b class="num">${amount(openingTotal)}</b></div>
        <dl>${line(bi("শুরুর নগদ", "Opening cash"), openingCash)}
        ${line(bi("শুরুর ব্যাংক", "Opening bank"), openingBank, openingBank != null && (book || legacy?.opening_bank == null) && prevBankRead.value?.date ? dmy(prevBankRead.value.date) : "")}</dl></section>
        <section class="card csec c-close"><div class="csh"><h3>${bi("ক্লোজিং ব্যালেন্স", "Closing Balance")}</h3><b class="num">${amount(recordedTotal)}</b></div>
        <dl>${line(bi("হিসাবের মোট ক্লোজিং", "Expected combined closing"), expectedTotal)}
        ${line(bi("গুনে পাওয়া নগদ + সেভ করা ব্যাংক", "Counted cash + saved bank"), recordedTotal)}
        ${line(bi("মোট ক্লোজিংয়ের পার্থক্য", "Combined difference"), combinedDiff)}
        ${!book && legacy?.closing != null ? line(bi("পুরোনো রেকর্ডের ক্লোজিং", "Historical closing"), value(legacy.closing)) : ""}</dl>
        ${record?.remarks ? `<p class="mut sm cs-remarks">${esc(record.remarks)}</p>` : ""}</section></div>
      ${record ? `<div class="cs-two">${side("receipt", receiptLabel, "c-rec", totals.r)}${side("payment", paymentLabel, "c-pay", totals.p)}</div>` : ""}
      ${transferPanel}`;
    $("#cs-open-book", body)?.addEventListener("click", () => sessionStorage.setItem("nabiad_cash_date", day));
  }
  refresh.onclick = draw;
  bindDateNav(v, "cs", draw);
  await draw();
  return () => { ++revision; };
}
/* =================== v6: CASH — summary board / history =================== */
const cashPeriod = F => pbRange(F);
const cashErr = e => /relation|does not exist|schema cache|not find/i.test(e.message || "") ? "ক্যাশ টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে" : isNetErr(e) ? "ইন্টারনেট নেই" : (e.message || String(e));
async function vCashSum(v) {
  const F = pbInit("month");
  v.innerHTML = head("ক্যাশ সামারি ও ইতিহাস", `${repBtns("cm")}<button class="btn" id="cm-x">${ico("dl")} Excel</button>${S.me.role !== "boss" ? `<a class="btn pri" href="#/cash">${ico("plus")} আজকের রেকর্ড</a>` : ""}`) + `<div class="card tbar noprint">${pbBar("cm", F)}</div><div class="card rep-wrap"><div class="rep-scroll"><div id="cm-out"></div></div></div>`;
  let rows = [];
  async function draw() {
    const [f, t] = cashPeriod(F), out = $("#cm-out", v); out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`;
    try { rows = await cashGroupedRange(f, t); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(cashErr(e))}</div>`; return; }
    const fin = rows.filter(r => r.status === "final"), R = fin.reduce((s, r) => s + (+r.total_receipt || 0), 0), P = fin.reduce((s, r) => s + (+r.total_payment || 0), 0), last = fin[fin.length - 1], first = fin[0];
    let miss = 0; for (let d = f; d <= (t > today() ? today() : t); d = addDays(d, 1)) if (!isFri(d) && !rows.some(r => r.date === d)) miss++;
    const drafts = rows.filter(r => r.status !== "final");
    const note = [drafts.length ? `${drafts.length} Draft record` : "", miss ? `${miss} working day(s) without a record` : ""].filter(Boolean).join(" · ");
    out.innerHTML = repSheet("cm-in", "Cash Summary · ক্যাশ সামারি", f, t,
      repKpi([[`Total Receipt · avg ${money0(fin.length ? R / fin.length : 0)}/day`, "৳ " + money0(R), "k3"], [`Total Payment · avg ${money0(fin.length ? P / fin.length : 0)}/day`, "৳ " + money0(P), "k2"], [`Net · ${fin.length} final days`, (R - P >= 0 ? "+" : "−") + money0(Math.abs(R - P)), "k1"], [last ? `Last Closing · ${dmy(last.date)}` : "Last Closing", "৳ " + money0(last?.closing), ""]]),
      repTwo(`<div class="dcs-box"><div class="dcs-t">Daily Receipt vs Payment</div>${repLine([{ v: fin.map(r => +r.total_receipt || 0), c: "#10b981", n: "Receipt" }, { v: fin.map(r => +r.total_payment || 0), c: "#f43f5e", n: "Payment" }], 80)}</div>`, `<div class="dcs-box"><div class="dcs-t">Closing &amp; Cash in Hand</div>${repLine([{ v: fin.map(r => +r.closing || 0), c: "#6366f1", n: "Closing" }, { v: fin.map(r => +r.cash_in_hand || 0), c: "#f59e0b", n: "Cash in hand" }], 80)}</div>`) +
      repOne(repBox(`Daily History (${rows.length})`, ["Date", "Opening", "Receipt", "Payment", "Closing", "Cash in hand", "Bank", "Status"], [...rows].reverse().map(r => `<tr><td class="cd">${dmy(r.date)} <span class="mut">${new Date(r.date + "T00:00").toLocaleDateString("en-GB", { weekday: "short" })}</span></td><td class="r num">${r.opening_bank == null ? "—" : money0(+r.opening_cash + +r.opening_bank)}</td><td class="r num gr">${money0(r.total_receipt)}</td><td class="r num rd">${money0(r.total_payment)}</td><td class="r num b">${r.closing == null ? "—" : money0(r.closing)}</td><td class="r num">${r.cash_in_hand == null ? "—" : money0(r.cash_in_hand)}</td><td class="r num">${r.cash_in_hand == null || r.closing == null ? "—" : money0(r.closing - r.cash_in_hand)}</td><td class="r">${r.status === "final" ? "Final" : "Draft"}</td></tr>`).join(""))), note);
    dcFit(v, "cm-in");
  }
  pbBind(v, "cm", F, draw); const unb = repBind(v, "cm", "cm-in", () => `Cash_Summary_${cashPeriod(F).join("_")}`, () => { const [a, b] = cashPeriod(F); return `Cash summary ${dmy(a)} → ${dmy(b)}`; });
  $("#cm-x", v).onclick = () => rows.length ? exportXlsx({ Daily: [["Date", "Opening Cash", "Opening Bank", "Receipt", "Payment", "Closing", "Cash in hand", "Bank", "Status", "By", "Remarks"], ...rows.map(r => [dmy(r.date), +r.opening_cash, r.opening_bank ?? "", +r.total_receipt, +r.total_payment, r.closing ?? "", r.cash_in_hand == null ? "" : +r.cash_in_hand, r.cash_in_hand == null || r.closing == null ? "" : r.closing - r.cash_in_hand, r.status, r.entered_by || "", r.remarks || ""])] }, `Cash_Summary_${today()}.xlsx`) : toast("ডাটা নেই", "err");
  await draw(); return unb;
}
/* read-only view of one day (used by Boss, who cannot open the entry page) */

/* =================== v6: CASH — reports (category breakdown) =================== */
async function vCashRep(v) {
  const routeToken = ROUTE_TOK;
  await cashGroupLoad();
  if (routeToken !== ROUTE_TOK) return;
  const F = pbInit("month");
  v.innerHTML = head("ক্যাশ রিপোর্ট", `${repBtns("cr")}<button class="btn" id="cr-x">${ico("dl")} Excel</button>`) + `<div class="card tbar noprint">${pbBar("cr", F)}</div><div class="card rep-wrap"><div class="rep-scroll"><div id="cr-out"></div></div></div>`;
  let cur = null;
  async function draw() {
    const [f, t] = cashPeriod(F), out = $("#cr-out", v); out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`;
    let rows; try { rows = (await cashGroupedRange(f, t)).filter(r => r.status === "final").map(r => ({ ...r, items: cashItems(r.items) })); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(cashErr(e))}</div>`; return; }
    if (!rows.length) { out.innerHTML = `<div class="card empty">এই সময়ে কোনো ফাইনাল ক্যাশ রেকর্ড নেই</div>`; cur = null; return; }
    const cat = k => rows.reduce((s, r) => s + (+r.items?.[k]?.a || 0), 0), days = k => rows.filter(r => +r.items?.[k]?.a).length;
    const R = rows.reduce((s, r) => s + +r.total_receipt, 0), P = rows.reduce((s, r) => s + +r.total_payment, 0);
    const block = (t, title, tot) => repBox(title, ["Category", "Days", "Amount", "%"], CASH_SUM_KEYS(t).map(k => { const a = cat(k); return `<tr><td>${esc(cashLabel(k))}</td><td class="r num">${days(k) || "—"}</td><td class="r num ${a ? "b" : "z"}">${money0(a)}</td><td class="r num">${tot ? (a / tot * 100).toFixed(1) : "0.0"}</td></tr>`; }).join("") + CASH_MEMO.filter(k => CASH_KEYS(t).includes(k)).map(k => `<tr class="mut"><td>${esc(cashLabel(k))} <span class="xs">(${bi("ট্রান্সফার — মোটে নেই", "transfer — not in total")})</span></td><td class="r num">${days(k) || "—"}</td><td class="r num">${money0(cat(k))}</td><td class="r num">—</td></tr>`).join(""), `<tr class="tot"><td>TOTAL</td><td></td><td class="r num">${money0(tot)}</td><td class="r num">100</td></tr>`);
    const months = [...new Set(rows.map(r => r.date.slice(0, 7)))].sort(), mName = m => (LANG === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : BN_M)[+m.slice(5) - 1] + " " + m.slice(2, 4);
    const mcat = (m, k) => rows.filter(r => r.date.startsWith(m)).reduce((s, r) => s + (+r.items?.[k]?.a || 0), 0);
    cur = { f, t, rows, cat, months, mcat };
    out.innerHTML = repSheet("cr-in", "Cash Report · ক্যাশ রিপোর্ট", f, t,
      repKpi([["Total Receipt", "৳ " + money0(R), "k3"], ["Total Payment", "৳ " + money0(P), "k2"], ["Net (Receipt − Payment)", (R - P >= 0 ? "+" : "−") + money0(Math.abs(R - P)), "k1"], ["Final Days", rows.length, ""]]),
      repTwo(block("receipt", "Receipt — by Category", R), block("payment", "Payment — by Category", P)) +
      (months.length > 1 ? repOne(repBox("By Month", ["Category", ...months.map(mName), "Total"], ["receipt", "payment"].map(t => CASH_SUM_KEYS(t).map(k => `<tr><td>${esc(cashLabel(k))}</td>${months.map(m => `<td class="r num">${money0(mcat(m, k)) || "—"}</td>`).join("")}<td class="r num b">${money0(cat(k))}</td></tr>`).join("") + `<tr class="tot"><td>Total ${t === "receipt" ? "Receipt" : "Payment"}</td>${months.map(m => `<td class="r num">${money0(CASH_SUM_KEYS(t).reduce((q, k) => q + mcat(m, k), 0))}</td>`).join("")}<td class="r num">${money0(t === "receipt" ? R : P)}</td></tr>`).join(""))) : ""));
    dcFit(v, "cr-in");
  }
  pbBind(v, "cr", F, draw); const unb = repBind(v, "cr", "cr-in", () => `Cash_Report_${cur ? cur.f + "_" + cur.t : today()}`, () => cur ? `Cash report ${dmy(cur.f)} → ${dmy(cur.t)}` : "");
  $("#cr-x", v).onclick = () => { if (!cur) return toast("ডাটা নেই", "err"); const all = [...CASH_KEYS("receipt"), ...CASH_KEYS("payment")]; exportXlsx({ Categories: [["Type", "Category", "Amount"], ...all.map(k => [cashType(k), cashLabel(k), cur.cat(k)])], Monthly: [["Category", ...cur.months, "Total"], ...all.map(k => [cashLabel(k), ...cur.months.map(m => cur.mcat(m, k)), cur.cat(k)])] }, `Cash_Report_${cur.f}_${cur.t}.xlsx`); };
  await draw(); return unb;
}

/* =================== Cash Register and Tally vouchers =================== */
Object.assign(SbAPI, {
  async cashTallyRange(from, to) {
    const records = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.from("cash_tally_vouchers").select("date,type,ref,ledger,amount")
        .gte("date", from).lte("date", to).order("date", {ascending:false}).order("type").order("ref").range(offset, offset + 999);
      if (error) throw error;
      records.push(...data.map(({date,type,ref,ledger,amount}) => ({date,type,ref,led:ledger,a:Number(amount),source:"tally"})));
      if (data.length < 1000) return records;
    }
  },
  async importCashTally(records) {
    const vouchers = records.map(({date,type,ref,led,a}) => ({date,type,ref,led,a}));
    const { data, error } = await sb.rpc("import_cash_tally", {vouchers});
    if (error) throw error;
    return data;
  }
});
Object.assign(DemoAPI, {
  async cashTallyRange(from, to) { return (demoStore.tally || []).filter(row => row.date >= from && row.date <= to); }
});
const tallyLedgerKey = name => String(name ?? "").trim().toLowerCase();
function tallyPurpose(row, ledgers) {
  const match = ledgers.get(tallyLedgerKey(row.led));
  if (!match || match.active === false) return "";
  const category = cashCategory(row.type === "receipt" ? match.cat_r : match.cat_p);
  return CASH_KEYS(row.type).includes(category) ? category : "";
}
function cashCheckerLedgerLabels(ledgers) {
  const byGroup = new Map();
  for (const row of ledgers.values()) {
    const led = row.name?.trim();
    if (!led) continue;
    for (const type of ["receipt", "payment"]) {
      const group = tallyPurpose({led, type}, ledgers);
      if (!group || CASH_MEMO.includes(group)) continue;
      byGroup.set(group, byGroup.has(group) ? "" : led);
    }
  }
  return byGroup;
}
const tallySchemaMissing = error => ["42P01", "42883", "PGRST202", "PGRST205"].includes(error?.code);
async function cashTallyImport(file) {
  const records = await cashTallyRows(file);
  const dates = records.map(r => r.date).sort();
  if (!ask(bi(`${money0(records.length)}টি voucher import করবেন? ${dmy(dates[0])} থেকে ${dmy(dates.at(-1))}।`,
    `Import ${money0(records.length)} vouchers from ${dmy(dates[0])} to ${dmy(dates.at(-1))}?`))) return null;
  const count = await API.importCashTally(records);
  await cbLedLoad(true);
  return count;
}
async function cashTallyRows(file) {
  if (file.size > 32 * 1024 * 1024) throw new Error(bi("ফাইলের সর্বোচ্চ আকার ৩২ MB।", "Choose a file up to 32 MB."));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
  let records;
  try { records = JSON.parse(new TextDecoder(encoding, {fatal: true}).decode(bytes))?.lvbody?.dspvchdetail; } catch { }
  if (!Array.isArray(records) || !records.length) throw new Error(bi("Tally Cash Book JSON-এ voucher পাওয়া যায়নি।", "No voucher rows found in the Tally Cash Book JSON."));
  const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
  const keys = new Set();
  return records.map((row, i) => {
    const type = row?.dspvchtype === "Rcpt" ? "receipt" : row?.dspvchtype === "Pymt" ? "payment" : "";
    const parts = /^(\d{1,2})-([a-z]{3})-(\d{2}|\d{4})$/i.exec(String(row?.dspvchdate ?? "").trim());
    const month = parts ? months.indexOf(parts[2].toLowerCase()) + 1 : 0;
    const date = month ? `${parts[3].length === 2 ? "20" + parts[3] : parts[3]}-${pad(month)}-${pad(Number(parts[1]))}` : "";
    const amount = type === "receipt" ? -row?.dspvchdramt : row?.dspvchcramt;
    const raw = type === "receipt" ? row?.dspvchdramt : row?.dspvchcramt;
    const led = typeof row?.dspvchledaccount === "string" ? row.dspvchledaccount.trim() : "";
    if (!type || !validChequeDate(date) || typeof raw !== "number" || !Number.isSafeInteger(Math.round(amount * 100)) || amount < 0 || !led) {
      throw new Error(bi(`${i + 1} নম্বর voucher লাইনে অসমর্থিত তথ্য আছে।`, `Unsupported data in voucher row ${i + 1}.`));
    }
    // An expanded voucher still has one top-level total. Its child entries are not separate cash movements.
    const ref = String(row.dspvchnumber?.dspvchnumber?.dspexplvchnumber ?? "").trim();
    const key = JSON.stringify([date,type,ref]);
    if (!ref || ref.length > 160 || led.length > 300 || keys.has(key)) {
      throw new Error(bi(`${i + 1} নম্বর লাইনে voucher no অনুপস্থিত, পুনরাবৃত্ত বা তথ্য বেশি দীর্ঘ।`,
        `Voucher row ${i + 1} has a missing or repeated voucher number or an overlong field.`));
    }
    keys.add(key);
    return {date, type, a: Math.round(amount * 100) / 100, led, ref, source: "tally"};
  });
}
async function vRegister(v) {
  const routeToken = ROUTE_TOK;
  const date = sessionStorage.getItem("nabiad_register_date");
  sessionStorage.removeItem("nabiad_register_date");
  await cashGroupLoad();
  if (routeToken !== ROUTE_TOK) return;
  const F = { ...pbInit("month"), ...(date ? { m: "day", d: date } : {}), q: "", type: "", k: "" };
  const canMap = ["admin","staff"].includes(S.me.role) && moduleOpen("cash");
  const canToggleLedger = canMap && moduleCan("cash", "edit");
  const ledgerTypes = { r: ["receipt", bi("প্রাপ্তি", "Receipt")], p: ["payment", bi("পরিশোধ", "Payment")], both: ["both", bi("উভয়", "Both")] };
  const ledgerHeadings = [bi("আইডি", "ID"), bi("ধরন", "Type"), bi("লেজার", "Ledger"), bi("খাত", "Purpose / Group"), bi("তারিখ", "Date"), bi("অবস্থা", "Status")];
  const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "2-digit", year: "numeric" });
  const ledgerDate = value => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)).replaceAll("/", "-") : "";
  const ungrouped = bi("খাত নির্ধারিত নয়","Unmapped");
  const categoryTotal = bi("খাতের মোট", "Category total");
  const mappedCategoryTotal = bi("ম্যাপ করা লেজার · খাতের মোট", "Mapped ledger · category total");
  const sources = { checker: bi("ক্যাশ চেকার", "Cash Checker"), book: bi("ক্যাশ খাতা", "Cash Book"), tally: "Tally" };
  const all = bi("সব", "All");
  v.innerHTML = head("ক্যাশ রেজিস্টার", `${canMap ? `<button type="button" class="btn" id="rg-map">${ico("sliders")} ${bi("লেজার খাত নির্ধারণ", "Ledger → Purpose/Group")}</button>` : ""}<button type="button" class="btn" id="rg-x">${ico("dl")} Excel</button>`) +
    `<div class="card tbar rg-tools noprint">
       <div class="rg-source chips" id="rg-source" role="group" aria-label="${bi("রেকর্ডের উৎস", "Record source")}">
         <button type="button" class="chip on" data-rg-source="app" aria-pressed="true">${bi("অ্যাপ রেকর্ড", "App records")}</button>
         <button type="button" class="chip" data-rg-source="ledgers" aria-pressed="false">${bi("Tally ভাউচার", "Tally vouchers")}</button>
       </div>
       <div class="chips" id="rg-tally-view" role="group" aria-label="${bi("Tally ভিউ", "Tally view")}" hidden>
         <button type="button" class="chip" data-rg-tally="ledgers" aria-pressed="true">${bi("লেজার তালিকা", "Ledger list")}</button>
         <button type="button" class="chip" data-rg-tally="tally" aria-pressed="false">${bi("ভাউচার ইতিহাস", "Voucher history")}</button>
       </div>
       <div id="rg-period">${pbBar("rg", F)}</div>
       <div class="rg-filters">
         <div><label class="f" for="rg-q" id="rg-query-label">${bi("লেজার, voucher, নোট বা অঙ্ক", "Ledger, voucher, note or amount")}</label><input class="in" id="rg-q" type="search" autocomplete="off"></div>
         <div><label class="f" for="rg-t">${bi("ধরন", "Type")}</label><select class="in" id="rg-t"><option value="">${all}</option><option value="receipt">Receipt</option><option value="payment">Payment</option></select></div>
         <div id="rg-purpose"><label class="f" for="rg-k">${bi("খাত", "Purpose")}</label><select class="in" id="rg-k"><option value="">${all}</option>${[...CASH_KEYS("receipt"), ...CASH_KEYS("payment")].map(k => `<option value="${k}">${esc(cashLabel(k))}</option>`).join("")}</select></div>
       </div>
     </div>
     <p class="iv-desc noprint" id="rg-desc"></p>
     <div id="rg-sum" class="rg-summary" role="status"></div>
     <div class="ir-viz noprint" id="rg-viz"></div>
     <div id="rg-notice"></div>
     <div class="card flush" id="rg-out"></div>
     <div class="cq-pager rg-pager" id="rg-pager" hidden><button type="button" class="btn" id="rg-prev">${bi("আগের", "Previous")}</button><span class="mut sm" id="rg-page"></span><button type="button" class="btn" id="rg-next">${bi("পরের", "Next")}</button></div>`;
  const g = id => $("#" + id, v), out = g("rg-out"), excel = g("rg-x");
  let source = "app", page = 0, version = 0, ready = false, lines = [], shown = [];
  let ledgerMap = new Map(), checkerLabels = new Map(), ledgerRows = [], shownLedgers = [];
  const toggling = new Set();
  function setLedgers(list) {
    ledgerRows = list;
    ledgerMap = new Map(list.map(row => [tallyLedgerKey(row.name), row]));
    checkerLabels = cashCheckerLedgerLabels(ledgerMap);
  }
  const pageSize = 75;
  function showNotice(message) {
    g("rg-notice").innerHTML = message ? `<div class="alert am">${esc(message)}</div>` : "";
  }
  async function load() {
    const versionAtStart = ++version, [f, t] = cashPeriod(F);
    const current = () => out.isConnected && versionAtStart === version;
    page = 0; ready = false; shown = []; shownLedgers = []; excel.disabled = true;
    g("rg-sum").textContent = ""; g("rg-pager").hidden = true; showNotice("");
    out.innerHTML = `<div class="empty">${bi("লোড হচ্ছে…", "Loading…")}</div>`;
    if (source === "ledgers") {
      const result = await cbLedLoad(true);
      if (!current()) return;
      if (result.err) {
        out.innerHTML = `<div class="alert rd">${esc(bi("লেজার তালিকা লোড হয়নি। আবার চেষ্টা করুন।", "Ledger list could not load. Try again."))}</div>`;
        return;
      }
      setLedgers(result.list);
      ready = true;
      draw();
      return;
    }
    if (source === "tally") {
      try {
        const [rows, ledgers] = await Promise.all([API.cashTallyRange(f,t), cbLedLoad()]);
        if (!current()) return;
        setLedgers(ledgers.list);
        lines = rows;
        if (ledgers.err) showNotice(bi("লেজারের খাত লোড হয়নি। আবার চেষ্টা করুন।","Ledger mappings could not load. Try again."));
        else if (!rows.length) showNotice(bi("এই সময়ে Tally voucher নেই। Admin Panel → Setup থেকে ইতিহাস import করা যায়।","No Tally vouchers for this period. Import history from Admin Panel → Setup."));
      } catch (error) {
        if (current()) out.innerHTML = `<div class="alert rd">${esc(tallySchemaMissing(error) ? bi("Tally history এখনো চালু হয়নি।","Tally history is not configured yet.") : cashErr(error))}</div>`;
        return;
      }
    } else {
      try {
        const [rows, allBooks, ledgers] = await Promise.all([
          API.cashRange(f, t).then(rows => rows.map(r => ({ ...r, items: cashItems(r.items) }))),
          API.cbRange(f, t).catch(() => null),
          cbLedLoad()
        ]);
        if (!current()) return;
        setLedgers(ledgers.list);
        const checkerDays = new Map(rows.map(r => [r.date, r]));
        const books = (allBooks || []).filter(b => ["r", "p"].some(tt => (b.lines?.[tt] || []).some(l => +l.a && !l.x)) && !(checkerDays.get(b.date)?.status === "final" && b.status !== "final"));
        const bookDays = new Set(books.map(b => b.date));
        const diffs = books.filter(b => {
          const c = checkerDays.get(b.date);
          if (c?.status !== "final" || b.status !== "final") return false;
          return [["r", "receipt"], ["p", "payment"]].some(([side, type]) => {
            const bookTotal = (b.lines?.[side] || []).filter(l => !l.x && !CASH_MEMO.includes(l.k)).reduce((sum, l) => sum + (+l.a || 0), 0);
            const checkerTotal = CASH_SUM_KEYS(type).reduce((sum, k) => sum + (+c.items?.[k]?.a || 0), 0);
            return Math.abs(bookTotal - checkerTotal) > 0.5;
          });
        });
        if (allBooks === null) showNotice(bi("Cash Book লোড হয়নি। আপাতত Cash Checker-এর খাতভিত্তিক মোট দেখানো হচ্ছে।", "Cash Book could not load. Showing Cash Checker category totals."));
        else if (diffs.length) showNotice(bi("Cash Book ও Cash Checker-এর মোটে অমিল · ", "Cash Book and Cash Checker totals differ · ") + diffs.map(b => dmy(b.date)).join(", "));
        const fromChecker = rows.filter(r => !bookDays.has(r.date)).flatMap(r => Object.entries(r.items || {}).filter(([, it]) => +it?.a).map(([k, it]) => ({
          date: r.date, k, type: cashType(k), a: +it.a, led: "", n: it.n, x: it.x,
          accounts: Array.isArray(it.accs) ? [...new Set(it.accs.filter(z => z?.c && +z.a).map(z => z.c))].join(", ") : "",
          st: r.status, by: r.entered_by, source: "checker"
        })));
        const fromBook = books.flatMap(b => [["r", "receipt"], ["p", "payment"]].flatMap(([side, type]) => (b.lines?.[side] || []).filter(l => +l.a && !l.x).map(l => ({
          date: b.date, k: CASH_KEYS(type).includes(cashCategory(l.k)) ? cashCategory(l.k) : side === "r" ? "cz_oth" : "p_oth",
          type, a: +l.a, led: l.n, ref: l.ref, n: l.note, x: l.x, accounts: l.c, st: b.status, by: b.entered_by, source: "book"
        }))));
        lines = [...fromChecker, ...fromBook];
      } catch (e) {
        if (current()) out.innerHTML = `<div class="alert rd">${esc(cashErr(e))}</div>`;
        return;
      }
    }
    lines.sort((a, b) => b.date.localeCompare(a.date));
    ready = true; draw();
  }
  const resetPage = () => { page = 0; draw(); };
  function paginate(count) {
    const pages = Math.max(1, Math.ceil(count / pageSize));
    page = Math.min(page, pages - 1);
    g("rg-pager").hidden = pages === 1;
    g("rg-page").textContent = `${page + 1} / ${pages}`;
    g("rg-prev").disabled = page === 0;
    g("rg-next").disabled = page + 1 === pages;
    excel.disabled = !count;
    return page * pageSize;
  }
  function ledgerFields(row) {
    const [type, typeLabel] = ledgerTypes[row.kind] || ledgerTypes.both;
    const groupFields = [["receipt", cbLedCat(row, "r")], ["payment", cbLedCat(row, "p")]]
      .filter(([side, key]) => CASH_KEYS(side).includes(key));
    const groups = groupFields.map(([side, key]) => `${side === "receipt" ? ledgerTypes.r[1] : ledgerTypes.p[1]}: ${cbCatName(key)}`);
    const dates = [[bi("তৈরি", "Created"), ledgerDate(row.created_at)], [bi("আপডেট", "Updated"), ledgerDate(row.updated_at)]]
      .filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
    return { type, typeLabel, groupFields, groups, dates, id: String(row.id).padStart(2, "0") };
  }
  const rgHl = txt => typeof ivHl === "function" ? ivHl(txt, F.q) : esc(txt);
  const rgDesc = () => { const d = g("rg-desc"); if (!d) return; d.innerHTML = ico("info") + "<span>" + (source === "ledgers" ? bi("Tally-র সব লেজার আর প্রতিটি লেজার কোন খাতে (Purpose / Group) যায়। “খাত নির্ধারিত নয়” লেজারগুলোর voucher রিপোর্টে আলাদা থাকে — উপরের “লেজার খাত নির্ধারণ” থেকে ঠিক করুন।", "Every Tally ledger and the purpose / group it maps to. Vouchers of “Unmapped” ledgers stay separate in reports — fix them with “Ledger → Purpose/Group” above.") : source === "tally" ? bi("Tally থেকে import করা Cash Book voucher — লেজারের খাত অনুযায়ী সাজানো।", "Cash Book vouchers imported from Tally, grouped by each ledger's purpose.") : bi("অ্যাপে লেখা ক্যাশের হিসাব: যেদিন Cash Book আছে সেদিনের লেজারভিত্তিক লাইন, না থাকলে Cash Checker-এর খাতভিত্তিক মোট।", "Cash recorded in the app: ledger lines from the Cash Book where a day has one, otherwise the Cash Checker category totals.")) + ` <kbd>/</kbd> ${bi("চাপলে সার্চ", "to search")}</span>`; };
  const tile = (label, value, cls, attr = "") => `<${attr ? `button type="button" ${attr}` : "div"} class="card${attr ? " rg-click" : ""}"><span class="mut sm">${label}</span><strong class="${cls}">${value}</strong></${attr ? "button" : "div"}>`;
  function rgViz(rows) {
    const box = g("rg-viz"); if (!box) return;
    if (source === "ledgers" || !rows.length) { box.innerHTML = ""; return; }
    const grp = type => { const m = new Map(); rows.filter(l => l.type === type).forEach(l => { const k = l.k || "unmapped", o = m.get(k) || { k, n: 0, amt: 0 }; o.n++; o.amt += l.a; m.set(k, o); }); return [...m.values()].sort((a, b) => b.amt - a.amt).slice(0, 7); };
    const bars = (arr, color) => { const mx = Math.max(1, ...arr.map(x => x.amt)); return arr.length ? `<ul class="ir-hb">${arr.map(x => `<li><button type="button" data-rgk="${esc(x.k)}" class="${F.k === x.k ? "on" : ""}" title="${esc(x.k === "unmapped" ? ungrouped : cashLabel(x.k))} · ${x.n} · ৳ ${money0(x.amt)}"><span class="ir-hl">${esc(x.k === "unmapped" ? ungrouped : cashLabel(x.k))}</span><i><s style="width:${(x.amt / mx * 100).toFixed(1)}%;background:${color}"></s></i><b class="num">${dcLakh(x.amt)}</b></button></li>`).join("")}</ul>` : `<div class="empty iv-empty">${bi("কিছু নেই", "Nothing")}</div>`; };
    const days = [...rows.reduce((m, l) => { const o = m.get(l.date) || { r: 0, p: 0 }; o[l.type === "receipt" ? "r" : "p"] += l.a; return m.set(l.date, o); }, new Map())].sort((a, b) => a[0].localeCompare(b[0])), mx = Math.max(1, ...days.flatMap(([, o]) => [o.r, o.p]));
    box.innerHTML = dcVcard(bi("প্রাপ্তি — খাত অনুযায়ী", "Receipts by purpose"), bi("ক্লিক করলে সেই খাত বাছাই হবে", "Click to filter by purpose"), bars(grp("receipt"), "linear-gradient(90deg,#10b981,#34d399)"))
      + dcVcard(bi("পরিশোধ — খাত অনুযায়ী", "Payments by purpose"), bi("ক্লিক করলে সেই খাত বাছাই হবে", "Click to filter by purpose"), bars(grp("payment"), "linear-gradient(90deg,#ef4444,#f97316)"))
      + (days.length > 1 ? dcVcard(bi("দিন অনুযায়ী প্রাপ্তি বনাম পরিশোধ", "Receipts vs payments per day"), `${days.length} ${bi("দিন", "days")}`, `<div class="rg-days">${days.map(([d, o]) => `<span title="${dmy(d)} · Receipt ৳ ${money0(o.r)} · Payment ৳ ${money0(o.p)}"><i class="r" style="--h:${(o.r / mx * 100).toFixed(1)}%"></i><i class="p" style="--h:${(o.p / mx * 100).toFixed(1)}%"></i></span>`).join("")}</div><div class="iv-bx"><span>${dmy(days[0][0])}</span><span>${dmy(days.at(-1)[0])}</span></div>`) : "");
  }
  const ledgerStatus = active => active ? bi("চালু", "Active") : bi("নিষ্ক্রিয়", "Inactive");
  const ledgerCmp = new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare;
  function drawLedgers() {
    const query = chequeSearchKey(F.q);
    shownLedgers = ledgerRows.map(row => ({ row, ...ledgerFields(row) })).filter(ledger => {
      const matchesGroup = !F.k || (F.k === "unmapped" ? !ledger.groupFields.length : ledger.groupFields.some(([, key]) => key === F.k));
      return matchesGroup && (!F.type || F.type === ledger.type) &&
        (!query || chequeSearchKey([ledger.id, ledger.row.name, ...ledger.groups].join(" ")).includes(query));
    });
    shownLedgers.sort((x, y) => ledgerCmp(x.row.name || "", y.row.name || ""));
    const first = paginate(shownLedgers.length);
    const activeCount = shownLedgers.filter(l => l.row.active !== false).length;
    const unm = shownLedgers.filter(l => !l.groupFields.length).length;
    g("rg-sum").innerHTML = tile(bi("লেজার", "Ledgers"), shownLedgers.length, "") + tile(bi("চালু", "Active"), activeCount, "gr") + tile(bi("নিষ্ক্রিয়", "Inactive"), shownLedgers.length - activeCount, "rd") + tile(bi("খাত নির্ধারিত নয়", "Unmapped"), unm, unm ? "am" : "", `data-rgk="unmapped" title="${bi("ক্লিক করলে শুধু এগুলো", "Click to show only these")}"`);
    rgViz([]); rgDesc();
    const details = values => values.length ? values.map(value => `<div>${esc(value)}</div>`).join("") : "—";
    out.innerHTML = `<div class="tw cards"><table class="rg-table rg-ledgers"><colgroup><col class="c-id"><col class="c-type"><col class="c-name"><col class="c-grp"><col class="c-date"><col class="c-st"></colgroup><thead><tr>${ledgerHeadings.map(label => `<th scope="col">${esc(label)}</th>`).join("")}</tr></thead><tbody>
      ${shownLedgers.slice(first, first + pageSize).map(({ row, id, typeLabel, groups, dates }) => {
        const active = row.active !== false, status = ledgerStatus(active);
        const tag = active ? "au-insert" : "au-delete";
        const act = active ? bi("নিষ্ক্রিয় করুন", "Disable") : bi("সক্রিয় করুন", "Activate");
        const control = canToggleLedger
          ? `<button type="button" class="tgl ${active ? "on" : "off"}" data-rg-ledger="${esc(row.id)}" aria-pressed="${active}" title="${esc(active ? bi("নিষ্ক্রিয় করতে ক্লিক করুন", "Click to disable") : bi("সক্রিয় করতে ক্লিক করুন", "Click to activate"))}" aria-label="${esc(`${act} · ${row.name}`)}"${toggling.has(String(row.id)) ? " disabled" : ""}>${esc(status)}</button>`
          : `<span class="tag ${tag}">${esc(status)}</span>`;
        return `<tr><td class="num">${esc(id)}</td><td><span class="tag ty-${esc(row.kind || "both")}">${esc(typeLabel)}</span></td><td><b>${rgHl(row.name)}</b></td><td>${groups.length ? details(groups) : `<span class="rg-unm">${esc(ungrouped)}</span>`}</td><td class="num sm">${details(dates)}</td><td>${control}</td></tr>`;
      }).join("")}
      </tbody></table></div>${shownLedgers.length ? "" : `<div class="empty">${bi("কোনো লেজার মেলেনি", "No ledgers match these filters")}</div>`}`;
  }
  out.addEventListener("click", async event => {
    const button = event.target.closest("[data-rg-ledger]");
    if (!button || !canToggleLedger || source !== "ledgers") return;
    const id = button.dataset.rgLedger;
    const row = ledgerRows.find(item => String(item.id) === id);
    if (!row || toggling.has(id)) return;
    toggling.add(id);
    button.disabled = true;
    try {
      const saved = await API.cbLedgerGroupSave(row.id, { active: row.active === false });
      const latest = CBLED?.list.find(item => String(item.id) === id);
      if (latest) Object.assign(latest, saved);
      Object.assign(row, saved);
      setLedgers(ledgerRows);
    } catch (error) {
      toast(esc(error.message || String(error)), "err");
    } finally {
      toggling.delete(id);
      if (source === "ledgers" && ready && out.isConnected) {
        draw();
        $$("[data-rg-ledger]", out).find(item => item.dataset.rgLedger === id)?.focus({ preventScroll: true });
      }
    }
  });
  function draw() {
    if (!ready || !out.isConnected) return;
    if (source === "ledgers") { drawLedgers(); return; }
    const q = chequeSearchKey(F.q), isTally = source === "tally";
    const rows = lines.map(row => {
      if (isTally) return {...row, k: tallyPurpose(row, ledgerMap)};
      const led = row.source === "checker" && checkerLabels.get(row.k);
      return led ? {...row, led} : row;
    });
    shown = rows.filter(l => (!F.type || l.type === F.type) && (!F.k || F.k === (l.k || "unmapped")) &&
      (!q || chequeSearchKey([l.led, l.k && cashLabel(l.k), l.n, l.accounts, l.ref, l.a, l.x].join(" ")).includes(q)));
    const sums = {receipt: 0, payment: 0};
    for (const l of shown) sums[l.type] += Math.round(l.a * 100);
    const net = (sums.receipt - sums.payment) / 100;
    g("rg-sum").innerHTML = tile(bi("লাইন", "Lines"), shown.length, "") + tile("Receipt", "৳ " + money(sums.receipt / 100), "gr", `data-rgt="receipt" title="${bi("ক্লিক করলে শুধু Receipt", "Click for receipts only")}"`) + tile("Payment", "৳ " + money(sums.payment / 100), "rd", `data-rgt="payment" title="${bi("ক্লিক করলে শুধু Payment", "Click for payments only")}"`) + tile(bi("নিট (প্রাপ্তি − পরিশোধ)", "Net (receipt − payment)"), (net < 0 ? "−" : "") + "৳ " + money(Math.abs(net)), net < 0 ? "rd" : "gr");
    rgViz(rows.filter(l => (!F.type || l.type === F.type) && (!q || chequeSearchKey([l.led, l.k && cashLabel(l.k), l.n, l.accounts, l.ref, l.a, l.x].join(" ")).includes(q)))); rgDesc();
    const first = paginate(shown.length);
    const ledger = bi("লেজার", "Ledger"), detail = bi("ভাউচার / নোট", "Voucher / note"), recordSource = bi("উৎস", "Source");
    out.innerHTML = shown.length ? `<div class="tw cards"><table class="rg-table"><thead><tr><th>তারিখ</th><th>ধরন</th><th>${ledger}</th><th>${bi("খাত","Purpose / Group")}</th><th class="r">টাকা</th><th>${detail}</th><th>${recordSource}</th></tr></thead><tbody>
      ${shown.slice(first, first + pageSize).map(l => `<tr><td>${dmy(l.date)}</td><td><span class="tag ${l.type === "receipt" ? "au-insert" : "au-delete"}">${l.type === "receipt" ? "Receipt" : "Payment"}</span></td>
      <td>${l.led ? `<b>${rgHl(l.led)}</b>${l.source === "checker" ? `<div class="mut xs">${mappedCategoryTotal}</div>` : ""}` : `<span class="mut" title="${esc(l.source === "checker" ? categoryTotal : bi("নাম দেওয়া হয়নি", "Unnamed entry"))}">—</span>`}</td>
      <td>${l.k ? esc(cashLabel(l.k)) : `<span class="rg-unm">${esc(ungrouped)}</span>`}</td><td class="r num b ${l.type === "receipt" ? "gr" : "rd"}">${money(l.a)}${l.x ? `<div class="mut xs">${esc(l.x)}</div>` : ""}</td>
      <td class="sm">${[l.ref, l.accounts && "A/C " + l.accounts, l.n].filter(Boolean).map(x => `<div>${esc(x)}</div>`).join("") || "—"}</td>
      <td class="mut sm">${sources[l.source]}${l.st ? ` · ${l.st === "final" ? bi("ফাইনাল", "Final") : bi("ড্রাফট", "Draft")}` : ""}${l.by ? " · " + esc(l.by) : ""}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">${bi("এই ফিল্টারে কোনো লাইন নেই", "No lines match these filters")}</div>`;
  }
  function setSource(next) {
    source = next;
    const isLedger = source === "ledgers", isTally = source !== "app";
    g("rg-period").hidden = isLedger;
    g("rg-tally-view").hidden = !isTally;
    g("rg-query-label").textContent = isLedger ? bi("আইডি, লেজার বা খাত", "ID, ledger or group") : bi("লেজার, voucher, নোট বা অঙ্ক", "Ledger, voucher, note or amount");
    const purpose = g("rg-k"), option = purpose.querySelector('option[value="unmapped"]');
    if (isTally && !option) purpose.add(new Option(ungrouped, "unmapped"));
    if (!isTally && option) {
      option.remove();
      if (F.k === "unmapped") { F.k = ""; purpose.value = ""; }
    }
    const type = g("rg-t"), both = type.querySelector('option[value="both"]');
    if (isLedger && !both) type.add(new Option(ledgerTypes.both[1], "both"));
    if (!isLedger && both) {
      both.remove();
      if (F.type === "both") { F.type = ""; type.value = ""; }
    }
    for (const btn of $$("[data-rg-source], [data-rg-tally]", v)) {
      const active = btn.dataset.rgTally ? btn.dataset.rgTally === source
        : btn.dataset.rgSource === (isTally ? "ledgers" : "app");
      btn.classList.toggle("on", active);
      btn.setAttribute("aria-pressed", active);
    }
    return load();
  }
  if (canMap) g("rg-map").onclick = () => cbLedgerModal(() => {
    if (!out.isConnected) return;
    setLedgers(CBLED?.list || []);
    [...g("rg-k").options].forEach(option => {
      if (CASH_KEYS("receipt").includes(option.value) || CASH_KEYS("payment").includes(option.value)) option.textContent = cashLabel(option.value);
    });
    resetPage();
  }, {mappingOnly:true});
  for (const btn of $$("[data-rg-source], [data-rg-tally]", v)) btn.onclick = () => {
    const next = btn.dataset.rgTally || btn.dataset.rgSource;
    if (source !== next) setSource(next);
  };
  let rgT = 0; g("rg-q").oninput = e => { clearTimeout(rgT); rgT = setTimeout(() => { F.q = e.target.value; resetPage(); }, 90); };
  const rgPick = e => { const b = e.target.closest("[data-rgk],[data-rgt]"); if (!b) return; if (b.dataset.rgt) { F.type = F.type === b.dataset.rgt ? "" : b.dataset.rgt; g("rg-t").value = F.type; } else { const k = b.dataset.rgk; if (k === "unmapped" && !g("rg-k").querySelector('option[value="unmapped"]')) g("rg-k").add(new Option(ungrouped, "unmapped")); F.k = F.k === k ? "" : k; g("rg-k").value = F.k; } resetPage(); };
  g("rg-sum").onclick = rgPick; g("rg-viz").onclick = rgPick;
  const rgSlash = e => { if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.querySelector(".mback")) { e.preventDefault(); g("rg-q")?.focus(); } };
  document.addEventListener("keydown", rgSlash);
  g("rg-t").onchange = e => { F.type = e.target.value; resetPage(); };
  g("rg-k").onchange = e => { F.k = e.target.value; resetPage(); };
  const changePage = delta => { page += delta; draw(); out.scrollIntoView({block: "start"}); };
  g("rg-prev").onclick = () => changePage(-1); g("rg-next").onclick = () => changePage(1);
  excel.onclick = () => {
    if (source === "ledgers") {
      if (shownLedgers.length) exportXlsx({ Ledgers: [ledgerHeadings, ...shownLedgers.map(({ row, id, typeLabel, groups, dates }) => [
        id, typeLabel, row.name, groups.join(" · ") || ungrouped, dates.join(" · "), ledgerStatus(row.active !== false)
      ])] }, "Cash_Register_Tally_Ledgers.xlsx");
      return;
    }
    const [from, to] = cashPeriod(F);
    if (shown.length) exportXlsx({ Register: [["Date", "Type", "Ledger", "Category", "Amount", "Expression", "Note", "Status", "By", "Voucher", "A/C", "Source"],
      ...shown.map(l => [dmy(l.date), l.type, l.led || "", l.k ? cashLabel(l.k) : l.source === "tally" ? ungrouped : "", l.a, l.x || "", l.n || "", l.st || "", l.by || "", l.ref || "", l.accounts || "", l.source === "checker" ? sources.checker + " · " + (l.led ? mappedCategoryTotal : categoryTotal) : sources[l.source]])] },
      `Cash_Register_${source}_${from}_to_${to}.xlsx`);
  };
  pbBind(v, "rg", F, load);
  await setSource("app");
  return () => document.removeEventListener("keydown", rgSlash);
}

/* =================== v6: reminders (photo + pick days + cheque link) =================== */
Object.assign(SbAPI, {
  async addReminder(r) { const row = { id: r.id || crypto.randomUUID(), title: r.title, note: r.note || null, due_at: r.due_at, repeat: r.repeat || "none", for_role: r.for_role || "me", kind: r.kind || "custom", cheque_id: r.cheque_id || null, created_by: S.me.name }; if (r.photo) row.photo = r.photo; const { data, error } = await sb.from("reminders").insert(row).select().single(); if (error) throw error; return data; }
});
const PICK_DAYS = [1, 2, 3, 5, 7, 10, 15, 30];
function reminderModal(r, opts = {}, after) {
  const isNew = !r; const def = opts.due ? new Date(opts.due) : (() => { const d = new Date(Date.now() + 36e5); d.setMinutes(0, 0, 0); return d; })();
  r = r || { title: opts.title || "", note: opts.note || "", due_at: def.toISOString(), repeat: "none", for_role: opts.for_role || "me", kind: opts.kind || "custom", cheque_id: opts.cheque_id || null, photo: null };
  const [d0, t0] = localDT(r.due_at), admin = S.me.role === "admin", canPhoto = S.me.role !== "boss", st = { photo: null };
  const chq = r.cheque_id && S.cheques.find(c => c.id === r.cheque_id);
  modal(`<h2>${isNew ? "⏰ নতুন রিমাইন্ডার" : "রিমাইন্ডার এডিট"}</h2><div class="grid" style="gap:12px">
   <div><label class="f">কী মনে করাবে *</label><input class="in" id="m-t" value="${esc(r.title)}" placeholder="${bi("যেমন: পার্টির চেক জমা দিন / পাস হয়েছে কি না দেখুন", "e.g. Deposit the party's cheque / check if it has cleared")}" autocomplete="off"></div>
   <div><label class="f">বিস্তারিত (পার্টি, টাকা, ব্যাংক…)</label><input class="in" id="m-n" value="${esc(r.note || "")}" autocomplete="off"></div>
   ${canPhoto ? `<div><label class="f">চেক / কাগজের ছবি <span class="mut">(ঐচ্ছিক)</span></label><div class="photo-in"><label class="btn" for="m-ph-c">${ico("cam")} ছবি তুলুন</label><label class="btn" for="m-ph">${ico("img")} গ্যালারি</label><input type="file" id="m-ph-c" accept="image/*" capture="environment" hidden><input type="file" id="m-ph" accept="image/*" hidden><img id="m-phv" class="hide" alt=""><button class="btn sm ghost hide" id="m-phx">✕</button>${r.photo ? `<span class="mut sm">ছবি আছে — নতুন দিলে বদলাবে</span>` : ""}</div></div>` : ""}
   <div><label class="f">কত দিন পরে (Pick days)</label><div class="chips" id="m-pd">${PICK_DAYS.map(n => `<span class="chip" data-pd="${n}">${n} ${bi("দিন", "days")}</span>`).join("")}</div></div>
   <div class="row"><div><label class="f">তারিখ</label><input class="in" type="date" id="m-d" value="${d0}"></div><div><label class="f">সময়</label><input class="in" type="time" id="m-tm" value="${t0}"></div></div>
   <div class="row"><div><label class="f">পুনরাবৃত্তি</label><select class="in" id="m-r">${Object.entries(REPEATS).map(([k, l]) => `<option value="${k}" ${k === r.repeat ? "selected" : ""}>${l}</option>`).join("")}</select></div>
   <div><label class="f">কার জন্য</label><select class="in" id="m-f">${Object.entries(FOR_ROLE).filter(([k]) => k !== "admin" || admin).map(([k, l]) => `<option value="${k}" ${k === r.for_role ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
   <div><label class="f">আমাদের চেকের সাথে যুক্ত করুন <span class="mut">(ঐচ্ছিক)</span></label><div><input class="in" id="m-c" placeholder="A/C বা চেক নং লিখুন" autocomplete="off"></div></div>
   <div class="modal-actions"><button class="btn pri fix" id="m-ok">${ico("save")} সেভ</button><button class="btn fix" id="m-x">বাতিল</button></div></div>`, (root, close) => {
    const g = id => $("#" + id, root);
    if (canPhoto) photoPicker(root, st, { inp: "m-ph", cam: "m-ph-c", img: "m-phv", x: "m-phx" });
    const cs = suggest(g("m-c"), () => [...S.cheques].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400).map(c => ({ value: `${c.code} · ${c.no}`, label: `৳ ${money0(c.amount)}`, sub: `${dmy(c.date)} · ${c.status}`, id: c.id })), () => { });
    if (chq) cs.setSilent({ value: `${chq.code} · ${chq.no}`, label: `৳ ${money0(chq.amount)}`, id: chq.id });
    $$("[data-pd]", root).forEach(c => c.onclick = () => { $$("[data-pd]", root).forEach(x => x.classList.toggle("on", x === c)); const d = new Date(); d.setDate(d.getDate() + +c.dataset.pd); g("m-d").value = iso(d); if (!g("m-tm").value || isNew) g("m-tm").value = "10:00"; });
    g("m-x").onclick = close; g("m-t").focus();
    g("m-ok").onclick = async () => {
      const title = g("m-t").value.trim(); if (!title) return toast("কী মনে করাবে লিখুন", "err");
      const due = new Date(`${g("m-d").value}T${g("m-tm").value || "10:00"}`); if (isNaN(due)) return toast("তারিখ/সময় ঠিক করুন", "err");
      const b = g("m-ok"); b.disabled = true;
      try {
        const id = r.id || crypto.randomUUID(); let photo;
        if (st.photo) { if (!navigator.onLine && !DEMO) throw new Error("ছবি সেভ করতে ইন্টারনেট লাগবে"); photo = `rem/${id.slice(0, 8)}_${Date.now()}.jpg`; await API.uploadPhoto(photo, st.photo); }
        const p = { title, note: g("m-n").value.trim(), due_at: due.toISOString(), repeat: g("m-r").value, for_role: g("m-f").value, snooze_until: null, cheque_id: cs.get()?.id || null, kind: cs.get() ? "cheque" : (r.kind || "custom"), ...(photo ? { photo } : {}) };
        if (isNew) { const row = await API.addReminder({ ...p, id }); (S.reminders ||= []).push(row); }
        else { await API.updateReminder(r.id, p); Object.assign(r, p); }
        S.reminders.sort((a, b) => remDue(a) - remDue(b)); saveCache(); updateBell(); close(); toast(`✔ ${bi("রিমাইন্ডার", "Reminder")}: ${due.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`); after && after();
      } catch (e) { toast(remErrMsg(e), "err"); b.disabled = false; }
    };
  });
}
const remBucket = (r, now) => { const d = remDue(r), t0 = new Date(now); t0.setHours(0, 0, 0, 0); const day = Math.floor((new Date(d).setHours(0, 0, 0, 0) - t0) / 864e5); return d <= now ? "ov" : day <= 0 ? "td" : day === 1 ? "tm" : day < 7 ? "wk" : "lt"; };
const REM_BK = () => ({ ov: [bi("সময় হয়েছে", "Due now"), "bell"], td: [bi("আজ", "Today"), "clock"], tm: [bi("আগামীকাল", "Tomorrow"), "cal"], wk: [bi("এই সপ্তাহে", "This week"), "list"], lt: [bi("পরে", "Later"), "list"] });
async function vRem(v) {
  let tab = "up", lv = "all", rq = "";
  const draw = () => {
    let lastG = null;
    const all = (S.reminders || []).slice().sort((a, b) => remDue(a) - remDue(b)), now = new Date(), sys = sysAlerts();
    const list = tab === "up" ? all.filter(r => !r.done) : tab === "done" ? all.filter(r => r.done).reverse() : all;
    const perm = "Notification" in window ? Notification.permission : "na", nUp = all.filter(r => !r.done).length, nDue = all.filter(r => !r.done && remDue(r) <= now).length;
    const LVN = { rd: bi("জরুরি", "Urgent"), am: bi("গুরুত্বপূর্ণ", "Important"), vi: bi("সাধারণ", "Normal") };
    const dueR = all.filter(r => !r.done && remDue(r) <= now);
    const items = [...dueR.map(r => ({ k: "rd", ic: "bell", t: r.title, sub: r.note || "", when: remDue(r), rid: r.id, cid: r.cheque_id, src: bi("রিমাইন্ডার", "Reminder") })), ...sys.map(a => ({ k: a.k === "gr" ? "vi" : a.k, ic: a.ic, t: a.t, go: a.go, src: bi("সিস্টেম", "System") }))];
    const cnt = k => items.filter(x => x.k === k).length, shown = lv === "all" ? items : items.filter(x => x.k === lv);
    const nbStats = () => `<div class="dcx-stats s4 nb-stats">${[["rd", "t", "bell"], ["am", "a", "clock"], ["vi", "p", "list"]].map(([k, c, ic]) => `<button class="dcx-stat ${c} kclick ${lv === k ? "on" : ""}" data-lv="${k}"><span class="si">${ico(ic)}</span><span><b>${cnt(k)}</b><small>${LVN[k]}</small></span></button>`).join("")}<button class="dcx-stat h kclick" data-t="up"><span class="si">${ico("list")}</span><span><b>${nUp}</b><small>${bi("চালু রিমাইন্ডার", "Active reminders")}</small></span></button></div>`;
    const nbBoard = () => `<div class="card nb"><div class="nb-hd"><h3>${ico("bell").replace("<svg", '<svg width="18" height="18"')} ${bi("নোটিফিকেশন বোর্ড", "Notification board")} <span class="tag">${items.length}</span></h3><div class="chips nb-f">${[["all", bi("সব", "All"), items.length], ["rd", LVN.rd, cnt("rd")], ["am", LVN.am, cnt("am")], ["vi", LVN.vi, cnt("vi")]].map(([k, l, n]) => `<span class="chip ${k === lv ? "on" : ""}" data-lv="${k}">${l} <b>${n}</b></span>`).join("")}</div></div>
      ${shown.length ? `<div class="nb-list">${shown.map(x => `<div class="nb-it lv-${x.k}" data-hay="${esc(norm([x.t, x.sub, x.src, LVN[x.k]].join(" ")))}"><div class="nb-ic">${ico(x.ic).replace("<svg", '<svg width="18" height="18"')}</div><div class="nb-b"><div class="nb-m"><span class="nb-tg">${LVN[x.k]}</span><span class="nb-src">${x.src}</span>${x.when ? `<span class="nb-tm">${relTime(x.when)}</span>` : ""}</div><b>${esc(x.t)}</b>${x.sub ? `<div class="mut sm">${esc(x.sub)}</div>` : ""}</div><div class="nb-a">${x.rid ? `<button class="btn ok sm" data-dn="${x.rid}">✓ ${bi("সম্পন্ন", "Done")}</button>${snoozeBtns(x.rid)}${x.cid ? `<button class="btn sm" data-oc="${x.cid}">${bi("চেক", "Cheque")}</button>` : ""}` : x.go ? `<a class="btn sm" href="${x.go}">${bi("খুলুন", "Open")} →</a>` : ""}</div></div>`).join("")}</div>` : `<div class="nb-ok">${ico("check").replace("<svg", '<svg width="22" height="22"')}<b>${bi("সব ঠিক আছে", "All clear")}</b><span class="mut sm">${bi("কোনো নোটিফিকেশন বা সতর্কতা নেই", "No notifications or alerts")}</span></div>`}</div>`;
    v.innerHTML = head(bi("রিমাইন্ডার ও নোটিফিকেশন", "Reminders & Notifications"), `<button class="btn pri" id="rm-add2">${ico("plus")} ${bi("নতুন রিমাইন্ডার", "New reminder")}</button>`) +
      `<p class="iv-desc">${ico("info")}<span>${bi("<b>বোর্ড</b>-এ থাকে যেসব রিমাইন্ডারের সময় হয়ে গেছে আর সিস্টেমের সতর্কতা (ব্যাংক ক্লোজিং বাকি, চেকের পাতা মিসিং, পুরনো Pending)। নিচের তালিকা আপনার নিজের রিমাইন্ডার — দিন অনুযায়ী সাজানো।", "The <b>board</b> shows reminders that are due now plus system alerts (bank closing pending, missing cheque leaves, old pending cheques). The list below is your own reminders, grouped by when they are due.")}</span></p>
      <div class="rem-find"><div class="ivd-find"><span class="ivd-find-i" aria-hidden="true">${ico("search")}</span><input class="in" id="rm-q" type="search" autocomplete="off" value="${esc(rq)}" placeholder="${bi("রিমাইন্ডার বা সতর্কতা খুঁজুন…", "Search reminders and alerts…")}" aria-label="${bi("খুঁজুন", "Search")}"></div><span class="mut sm" id="rm-qn" role="status"></span></div>` + nbStats() + nbBoard() +
      (S.remErr ? `<div class="alert rd" style="margin-bottom:12px">${esc(remErrMsg({ message: S.remErr }))}</div>` : "") +
      (perm === "default" ? `<div class="alert vi" style="margin-bottom:12px">${ico("bell")} <span>নোটিফিকেশন চালু করলে সময় হলে ফোনে জানাবে।</span><button class="btn sm pri" id="rm-perm" style="margin-left:auto">চালু করুন</button></div>` : perm === "denied" ? `<div class="alert am" style="margin-bottom:12px">${bi("ব্রাউজারে নোটিফিকেশন বন্ধ — সাইট সেটিং থেকে চালু করুন। অ্যাপের ভেতরে রিমাইন্ডার তবুও আসবে।", "Notifications are blocked in the browser — enable them in site settings. Reminders will still appear inside the app.")}</div>` : "") +
      `<div class="remtop"><div class="tabs" style="margin:0">${[["up", bi("চালু", "Active"), nUp], ["done", bi("সম্পন্ন", "Done"), null], ["all", bi("সব", "All"), null]].map(([k, l, n]) => `<span class="chip ${k === tab ? "on" : ""}" data-t="${k}"><span>${l}</span>${n != null ? ` <b>${n}</b>` : ""}</span>`).join("")}</div>${nDue ? `<span class="tag t-due">${nDue} <span>টির সময় হয়েছে</span></span>` : ""}</div>
      <div class="rem-list" style="margin-top:12px">${tab !== "done" ? `<button class="card rem-add" id="rm-add"><span class="ri">${ico("plus")}</span><span><b>নতুন রিমাইন্ডার</b><small>পার্টির চেক, পেমেন্ট, অডিট বা যেকোনো কাজ — ছবি ও দিন বেছে দিন</small></span></button>` : ""}
      ${list.length ? list.map(r => { const due = !r.done && remDue(r) <= now; const ch = r.cheque_id && S.cheques.find(c => c.id === r.cheque_id); const gk = tab !== "done" && !r.done ? remBucket(r, now) : null, gh = gk && gk !== lastG ? (lastG = gk, `<div class="rem-grp g-${gk}">${ico(REM_BK()[gk][1])}<b>${REM_BK()[gk][0]}</b><span class="rem-grp-n">${list.filter(x => !x.done && remBucket(x, now) === gk).length}</span></div>`) : ""; return gh + `<div class="card rem ${due ? "due" : ""} ${r.done ? "dn" : ""}" data-hay="${esc(norm([r.title, r.note, REPEATS[r.repeat], FOR_ROLE[r.for_role]].join(" ")))}"><div class="ri">${ico(r.kind === "cheque" ? "list" : r.photo ? "cam" : "bell")}</div><div class="rt"><b>${esc(r.title)}</b>${r.note ? `<div class="mut sm">${esc(r.note)}</div>` : ""}
        <div class="rmeta"><span class="tag ${due ? "t-due" : ""}">${ico("clock").replace("<svg", '<svg width="12" height="12"')} ${new Date(remDue(r)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${r.done ? "সম্পন্ন" : relTime(remDue(r))}</span>${r.repeat !== "none" ? `<span class="tag">${REPEATS[r.repeat] || ""}</span>` : ""}<span class="tag">${FOR_ROLE[r.for_role] || ""}</span>${ch ? `<span class="tag t-mv">${esc(ch.code)} · ${ch.no} ${stTag(ch.status)}</span>` : ""}<span class="mut xs">${esc(r.created_by || "")}</span></div>${r.photo ? `<div class="rph" data-ph="${esc(r.photo)}"></div>` : ""}</div>
        <div class="ra">${r.done ? "" : `<button class="btn ok sm" data-dn="${r.id}">✓ সম্পন্ন</button>${due ? snoozeBtns(r.id) : ""}`}${r.cheque_id ? `<button class="btn sm" data-oc="${r.cheque_id}">চেক</button>` : ""}<button class="btn sm" data-ics="${r.id}" title="ফোনের ক্যালেন্ডারে অ্যালার্ম সহ যোগ করুন">${ico("cal")}</button><button class="btn sm ghost" data-ed="${r.id}" title="এডিট">${ico("edit")}</button>${S.me.role === "admin" ? `<button class="btn sm ghost" data-rm="${r.id}" title="মুছুন">${ico("trash")}</button>` : ""}</div></div>`; }).join("") : `<div class="card empty">${tab === "done" ? bi("কোনো সম্পন্ন রিমাইন্ডার নেই", "No completed reminders") : bi("এখনো কোনো রিমাইন্ডার নেই — উপরের \"নতুন রিমাইন্ডার\" চাপুন।", "No reminders yet — tap \"New reminder\" above.")}</div>`}</div>
      <div class="mut sm" style="margin-top:12px">💡 অ্যাপ পুরো বন্ধ থাকলেও অ্যালার্ম চাইলে ${ico("cal").replace("<svg", '<svg width="13" height="13" style="vertical-align:-2px"')} বাটন চাপুন — ফোনের ক্যালেন্ডারে অ্যালার্মসহ যোগ হবে।</div>`;
    $$("[data-t]", v).forEach(c => c.onclick = () => { tab = c.dataset.t; draw(); });
    $$("[data-lv]", v).forEach(c => c.onclick = () => { lv = lv === c.dataset.lv && c.classList.contains("dcx-stat") ? "all" : c.dataset.lv; draw(); });
    $("#rm-add2", v) && ($("#rm-add2", v).onclick = () => reminderModal(null, {}, draw));
    $("#rm-add", v) && ($("#rm-add", v).onclick = () => reminderModal(null, {}, draw));
    $("#rm-perm", v) && ($("#rm-perm", v).onclick = async () => { const p = await Notification.requestPermission(); if (p === "granted") sysNotify("✔ নোটিফিকেশন চালু হয়েছে", "রিমাইন্ডারের সময় এখানে জানাবে", "test"); draw(); });
    bindRemActions(v, draw);
    const qIn = $("#rm-q", v), filt = () => { const q = norm(rq); let a = 0, b = 0; $$("[data-hay]", v).forEach(el => { const ok = !q || el.dataset.hay.includes(q); el.hidden = !ok; if (ok) el.classList.contains("nb-it") ? a++ : b++; }); $$(".rem-grp", v).forEach(g => { let n = g.nextElementSibling, vis = false; while (n && !n.classList.contains("rem-grp")) { if (n.matches("[data-hay]") && !n.hidden) vis = true; n = n.nextElementSibling; } g.hidden = !!q && !vis; }); $("#rm-qn", v).textContent = q ? bi(`বোর্ডে ${a}টি · তালিকায় ${b}টি মিলেছে`, `${a} on the board · ${b} in the list`) : ""; };
    qIn.oninput = () => { rq = qIn.value; filt(); }; filt();
    if (document.activeElement === document.body && rq && innerWidth > 800) qIn.focus();
    $$("[data-ics]", v).forEach(b => b.onclick = () => icsFile(S.reminders.find(r => r.id === b.dataset.ics)));
    $$("[data-ed]", v).forEach(b => b.onclick = () => reminderModal(S.reminders.find(r => r.id === b.dataset.ed), {}, draw));
    $$("[data-rm]", v).forEach(b => b.onclick = async () => { if (!ask("এই রিমাইন্ডার মুছবেন?")) return; try { await API.deleteReminder(b.dataset.rm); S.reminders = S.reminders.filter(r => r.id !== b.dataset.rm); saveCache(); updateBell(); draw(); } catch (e) { toast(e.message, "err"); } });
    $$("[data-ph]", v).forEach(el => showPhoto(el, { photo: el.dataset.ph }));
  };
  draw(); updateBell();
}

/* =================== v6: settings (everyone) =================== */
async function vSettings(v) {
  const admin = S.me.role === "admin"; const sel = (id, opts, val) => `<select class="in" id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(k) === String(val) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const hours = Array.from({ length: 15 }, (_, i) => i + 9).map(h => [h, `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`]);
  const starts = allowed().filter(k => !["admin", "settings", "audit"].includes(k)).map(k => [k, ROUTES[k].t]);
  const perm = "Notification" in window ? Notification.permission : "na";
  let used = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); used += (localStorage.getItem(k) || "").length + k.length; } } catch { }
  const secs = [["sx-pf", "users", bi("প্রোফাইল", "Profile")], ["sx-ap", "sliders", bi("চেহারা", "Appearance")], ["sx-al", "bell", bi("সতর্কতা", "Alerts")], ["sx-dt", "save", bi("অ্যাপ ও ডাটা", "App & data")], ["sx-sc", "shield", bi("নিরাপত্তা", "Security")]];
  v.innerHTML = head("সেটিংস") + `<div class="card st-sum"><div class="st-me">${avaEl(S.me.id, S.me.name, S.me.email, "xl")}<div><b>${esc(S.me.name)}</b><small>${esc(S.me.email)}</small><span class="pill">${esc(S.me.role)}</span></div></div>
    <div class="st-chips"><span class="stx ${navigator.onLine ? "ok" : "bad"}"><i></i>${navigator.onLine ? bi("অনলাইন", "Online") : bi("অফলাইন", "Offline")}</span><span class="stx"><i></i>${getTheme() === "dark" ? bi("ডার্ক", "Dark") : bi("লাইট", "Light")} · ${LANG === "en" ? "EN" : "বাংলা"}</span><span class="stx ${perm === "granted" ? "ok" : ""}"><i></i>${bi("নোটিফিকেশন", "Notifications")} ${perm === "granted" ? bi("চালু", "on") : bi("বন্ধ", "off")}</span><span class="stx"><i></i>${(used / 1024).toFixed(0)} KB ${bi("এই ডিভাইসে", "on device")}</span></div></div>
   <nav class="st-nav" aria-label="${bi("সেটিংস বিভাগ", "Settings sections")}">${secs.map(([id, ic, l]) => `<button type="button" class="chip" data-jump="${id}">${ico(ic)}<span>${l}</span></button>`).join("")}</nav>
   <div class="grid g2 setg">
   <div class="card" id="sx-pf"><h3>${ico("users")} ${bi("প্রোফাইল", "Profile")}</h3><div class="grid" style="gap:12px">
     <div class="pfp">${avaEl(S.me.id, S.me.name, S.me.email, "xl")}<div class="pfb"><b>${LANG === "en" ? "Profile picture" : "প্রোফাইল ছবি"}</b><div class="mut xs">${LANG === "en" ? "Shown in the sidebar and user lists. Square crop, JPG/PNG." : "সাইডবার ও ইউজার তালিকায় দেখা যাবে। মাঝখান থেকে চৌকো করে কাটা হয়।"}</div><div class="row" style="margin-top:8px"><button class="btn sm pri fix" id="pf-up" type="button">${ico("cam")} ${LANG === "en" ? "Upload photo" : "ছবি দিন"}</button><button class="btn sm fix ${avaMap()[S.me.id] ? "" : "hide"}" id="pf-rm" type="button">${ico("trash")} ${LANG === "en" ? "Remove" : "মুছুন"}</button><input type="file" id="pf-f" accept="image/*" hidden></div></div></div>
     <div><label class="f">আপনার নাম <span class="mut">(চেক/ক্লোজিং-এ "কে এন্ট্রি করেছে" হিসেবে বসে)</span></label><div class="row" style="flex-wrap:nowrap"><input class="in" id="st-nm" value="${esc(S.me.name || "")}"><button class="btn fix" id="st-nm-s">সেভ</button></div></div>
     <div class="mut sm">${esc(S.me.email)} · <span class="pill">${esc(S.me.role)}</span></div>
     ${DEMO ? "" : `<div><label class="f">নতুন পাসওয়ার্ড</label><div class="row" style="flex-wrap:nowrap"><input class="in" type="password" id="st-pw" autocomplete="new-password" placeholder="কমপক্ষে ১০ অক্ষর"><button class="btn fix" id="st-pw-s">বদলান</button></div></div>`}</div></div>
   <div class="card" id="sx-ap"><h3>${ico("sliders")} ${bi("দেখতে কেমন", "Appearance")}</h3><div class="grid" style="gap:12px">
     <div class="row"><div><label class="f">থিম</label>${sel("st-th", [["light", "লাইট"], ["dark", "ডার্ক"]], getTheme())}</div><div><label class="f">${bi("ভাষা", "Language")}</label>${sel("st-lg", [["bn", bi("বাংলা", "Bangla")], ["en", "English"]], LANG)}</div></div>
     <div class="row"><div><label class="f">লেখার আকার</label>${sel("st-fs", [["small", "ছোট"], ["normal", "স্বাভাবিক"], ["large", "বড়"]], PREFS.font)}</div><div><label class="f">টেবিল</label>${sel("st-cp", [["0", "আরামদায়ক"], ["1", "ঘন (বেশি সারি)"]], PREFS.compact ? 1 : 0)}</div></div>
     <div><label class="f">অ্যাপ খুললে কোন পাতা</label>${sel("st-start", starts, PREFS.start)}</div></div></div>
   <div class="card" id="sx-al"><h3>${ico("bell")} ${bi("রিমাইন্ডার ও সতর্কতা", "Reminders & alerts")}</h3><div class="grid" style="gap:12px">
     <div class="row"><div><label class="f">ব্যাংক ক্লোজিং বাকি থাকলে সতর্কতা</label>${sel("st-ch", hours, PREFS.closingHour)}</div><div><label class="f">ক্যাশ রেকর্ড বাকি থাকলে সতর্কতা</label>${sel("st-cs", hours, PREFS.cashHour)}</div></div>
     <div class="row"><div><label class="f">কত দিন Pending হলে সতর্কতা</label>${sel("st-pd", [[2, "২ দিন"], [3, "৩ দিন"], [5, "৫ দিন"], [7, "৭ দিন"]], PREFS.pendDays)}</div><div><label class="f">শব্দ</label>${sel("st-snd", [["1", "চালু"], ["0", "বন্ধ"]], PREFS.sound ? 1 : 0)}</div></div>
     <div class="row"><div><label class="f">শুক্রবার</label>${sel("st-fri", [["1", "বন্ধ দিন (আগের/পরের বাটনে বাদ)"], ["0", "কর্মদিবস"]], PREFS.skipFri ? 1 : 0)}</div></div>
     <div class="row"><button class="btn fix" id="st-np" ${perm === "granted" || perm === "na" ? "disabled" : ""}>${perm === "granted" ? "✓ নোটিফিকেশন চালু আছে" : perm === "denied" ? "নোটিফিকেশন ব্রাউজারে বন্ধ" : "নোটিফিকেশন চালু করুন"}</button><button class="btn fix" id="st-nt">পরীক্ষা করুন</button></div></div></div>
   <div class="card" id="sx-dt"><h3>${ico("save")} ${bi("অ্যাপ ও ডাটা", "App & data")}</h3><div class="grid" style="gap:10px">
     <div class="kv"><span>সংস্করণ</span><b>v6 · ${esc(document.querySelector('script[src^="app.js"]')?.getAttribute("src")?.split("v=")[1] || "")}</b></div>
     <div class="kv"><span>ইন্টারনেট</span><b class="${navigator.onLine ? "gr" : "rd"}">${navigator.onLine ? "অনলাইন" : "অফলাইন"}</b></div>
     <div class="kv"><span>সিঙ্ক বাকি</span><b>${DEMO ? "—" : Outbox.count()}</b></div>
     ${!DEMO && Outbox.deadCount() ? `<div class="kv"><span>${bi("সিঙ্ক ব্যর্থ (আটকে আছে)", "Rejected entries")}</span><b class="rd">${Outbox.deadCount()} <button class="btn fix" id="st-dead">${bi("দেখুন", "Review")}</button></b></div>` : ""}
     <div class="kv"><span>এই ডিভাইসে জমা ডাটা</span><b>${(used / 1024).toFixed(0)} KB</b></div>
     <div class="row" style="margin-top:6px"><button class="btn fix" id="st-sync">${ico("clock")} এখনই সিঙ্ক</button><button class="btn fix" id="st-upd">${ico("refresh")} ${bi("আপডেট দেখুন", "Check for update")}</button>${isStandalone() ? "" : `<button class="btn pri fix" id="st-inst">${ico("dl")} ${bi("অ্যাপ ইনস্টল", "Install app")}</button>`}<button class="btn bad fix" id="st-clr">ক্যাশ মুছে রিলোড</button></div>
     <div class="mut xs">"ক্যাশ মুছে রিলোড" শুধু এই ডিভাইসের জমা কপি মোছে — সার্ভারের ডাটা ঠিক থাকে। সিঙ্ক বাকি থাকলে আগে সিঙ্ক করুন।</div></div></div>
   <div class="card" id="sx-sc"><h3>${ico("shield")} ${LANG === "en" ? "Security" : "নিরাপত্তা"}</h3><div class="grid" style="gap:12px">
     <div><label class="f">${LANG === "en" ? "Auto-lock when idle" : "কিছুক্ষণ ব্যবহার না করলে অটো-লক"}</label>${sel("st-lk", [[0, LANG === "en" ? "Off" : "বন্ধ"], [1, LANG === "en" ? "1 minute" : "১ মিনিট"], [5, LANG === "en" ? "5 minutes" : "৫ মিনিট"], [10, LANG === "en" ? "10 minutes" : "১০ মিনিট"], [15, LANG === "en" ? "15 minutes" : "১৫ মিনিট"], [30, LANG === "en" ? "30 minutes" : "৩০ মিনিট"], [60, LANG === "en" ? "1 hour" : "১ ঘণ্টা"]], lockMin())}<div class="mut xs">${LANG === "en" ? "This device only. Unlock with your password. Shortcut: Ctrl+Shift+L." : "শুধু এই ডিভাইসে। পাসওয়ার্ড দিয়ে আনলক। শর্টকাট: Ctrl+Shift+L।"}</div></div>
     <div class="st-btns"><button class="btn" id="st-lock">${ico("shield")}<span>${LANG === "en" ? "Lock now" : "এখনই লক করুন"}</span></button></div>
     ${DEMO ? "" : `<div id="st-mfa" class="scrow"><div class="mut sm">…</div></div>`}</div></div>
   ${!DEMO && "serviceWorker" in navigator && "PushManager" in window ? `<div class="card"><h3>${ico("bell")} ${bi("পুশ নোটিফিকেশন", "Push notifications")}</h3><div id="st-push" class="scrow"><div class="mut sm">…</div></div><div class="mut xs" style="margin-top:6px">${bi("Boss/Admin চালু করলে প্রতিদিন রাত ৮টায় (বাংলাদেশ সময়) সারাংশ পাবেন। iPhone-এ আগে অ্যাপটি Home Screen-এ Add করতে হবে।", "Boss/Admin get a daily summary at 8 pm (Bangladesh time). On iPhone, add the app to the Home Screen first.")}</div></div>` : ""}
   ${admin ? `<div class="card" style="grid-column:1/-1"><h3>${ico("gear")} ${bi("Admin শর্টকাট", "Admin shortcuts")}</h3><div class="st-btns st-short"><a class="btn" href="#/admin">${ico("users")}<span>${bi("ব্যবহারকারী ও অ্যাকাউন্ট", "Users & accounts")}</span></a><a class="btn" href="#/admin?tab=audit">${ico("shield")}<span>${bi("অডিট ও ব্যাকআপ", "Audit & Backup")}</span></a><a class="btn" href="#/books">${ico("book")}<span>${bi("চেক বই", "Cheque Books")}</span></a></div></div>` : ""}</div>`;
  const g = id => $("#" + id, v);
  $$("[data-jump]", v).forEach(b => b.onclick = () => { const el = $("#" + b.dataset.jump, v); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("st-flash"); setTimeout(() => el.classList.remove("st-flash"), 1200); } });
  { const f = g("pf-f"), rm = g("pf-rm"); g("pf-up").onclick = () => f.click();
    f.onchange = async () => { const f0 = f.files[0]; f.value = ""; if (!f0) return; const file = await pickImage(f0, { title: LANG === "en" ? "Crop profile picture" : "প্রোফাইল ছবি ক্রপ", aspect: 1, aspects: [], circle: true, face: true, allowFull: false, maxSide: 512 }, f); if (!file) return; const b = g("pf-up"); b.disabled = true; try { const img = await imgToAvatar(file); await API.setAvatar(img); avaMap()[S.me.id] = img; try { localStorage.setItem("nabiad_ava_" + S.me.id, img); } catch { } refreshAvatars(); rm.classList.remove("hide"); toast(LANG === "en" ? "✔ Photo updated" : "✔ ছবি সেভ হয়েছে"); } catch (e) { toast(/function|does not exist/i.test(e.message) ? bi("schema_v6.sql-এর v6.41 অংশ চালানো হয়নি", "The v6.41 part of schema_v6.sql has not been run") : e.message, "err"); } b.disabled = false; };
    rm.onclick = async () => { if (!ask(LANG === "en" ? "Remove your profile picture?" : "প্রোফাইল ছবি মুছে ফেলবেন?")) return; try { await API.setAvatar(null); delete avaMap()[S.me.id]; try { localStorage.removeItem("nabiad_ava_" + S.me.id); } catch { } refreshAvatars(); rm.classList.add("hide"); toast(LANG === "en" ? "✔ Photo removed" : "✔ ছবি মুছে ফেলা হয়েছে"); } catch (e) { toast(e.message, "err"); } }; }
  g("st-nm-s").onclick = async () => { const n = g("st-nm").value.trim(); if (!n) return toast("নাম লিখুন", "err"); try { await API.setMyName(n); S.me.name = n; saveCache(); shell(); route(); toast("✔ নাম সেভ হয়েছে"); } catch (e) { toast(/function|does not exist/i.test(e.message) ? bi("schema_v3.sql চালানো বাকি", "schema_v3.sql has not been run yet") : e.message, "err"); } };
  g("st-pw-s") && (g("st-pw-s").onclick = async () => { const p = g("st-pw").value; if (p.length < 10) return toast(bi("পাসওয়ার্ড কমপক্ষে ১০ অক্ষর", "Password must be at least 10 characters"), "err"); try { await API.changePassword(p); g("st-pw").value = ""; toast("✔ পাসওয়ার্ড বদলানো হয়েছে"); } catch (e) { toast(e.message, "err"); } });
  g("st-th").onchange = e => setTheme(e.target.value); g("st-lg").onchange = e => setLang(e.target.value);
  g("st-lk").onchange = e => { try { localStorage.setItem(LOCK_KEY, e.target.value); } catch { } lastAct = Date.now(); toast(LANG === "en" ? "✔ Saved" : "✔ সেভ হয়েছে"); };
  g("st-lock").onclick = () => lockNow();
  if (g("st-push")) { const paintP = async () => { const box = g("st-push"); if (!box) return; let m = null; try { m = await API.pushMine(); } catch (e) { } const on = !!(m && m.row), denied = "Notification" in window && Notification.permission === "denied";
    box.innerHTML = `<div class="st-txt"><b>${bi("এই ডিভাইসে", "On this device")}: ${on ? bi("চালু", "ON") : bi("বন্ধ", "OFF")}</b>${denied ? `<div class="rd xs">${bi("ব্রাউজারে নোটিফিকেশন ব্লক করা আছে — সাইট সেটিংস থেকে Allow করুন", "Notifications are blocked — allow them in site settings")}</div>` : ""}${on ? `<label class="euac st-sw"><span>${bi("রাতের সারাংশ", "Nightly summary")}</span><span class="sw"><input type="checkbox" id="st-pushs" ${m.row.summary ? "checked" : ""}><i></i></span></label>` : ""}</div><div class="st-btns">${on ? `<button class="btn" id="st-pusht">${ico("bell")}<span>${bi("টেস্ট", "Test")}</span></button>` : ""}<button class="btn ${on ? "" : "pri"}" id="st-pushb"><span>${on ? bi("বন্ধ করুন", "Turn off") : bi("চালু করুন", "Turn on")}</span></button></div>`;
    g("st-pushb").onclick = async () => { try { if (on) { await API.pushOff(m.sub.endpoint); await m.sub.unsubscribe(); } else { const perm = await Notification.requestPermission(); if (perm !== "granted") { toast(bi("অনুমতি দেওয়া হয়নি", "Permission not granted"), "err"); return paintP(); } const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUB) }); await API.pushOn(sub); toast(bi("✔ নোটিফিকেশন চালু হয়েছে", "✔ Notifications on")); } } catch (e) { toast(e.message || String(e), "err"); } paintP(); };
    if (g("st-pusht")) g("st-pusht").onclick = async () => { try { const r = await API.pushTest(); toast(r && r.ok ? bi("✔ টেস্ট পাঠানো হয়েছে", "✔ Test sent") : bi("পাঠানো যায়নি — একটু পরে আবার চেষ্টা করুন", "Not delivered — try again"), r && r.ok ? "ok" : "err"); } catch (e) { toast(e.message || String(e), "err"); } };
    if (g("st-pushs")) g("st-pushs").onchange = async e => { try { await API.pushSummary(m.sub.endpoint, e.target.checked); } catch (er) { toast(er.message, "err"); } }; }; paintP(); }
  if (g("st-mfa")) { const en = LANG === "en", paint = async () => { const f = await API.mfaFactor().catch(() => null), box = g("st-mfa"); if (!box) return;
    box.innerHTML = `<div class="st-txt"><b>${en ? "2-step verification (2FA)" : "টু-স্টেপ ভেরিফিকেশন (2FA)"}: ${f ? (en ? "ON" : "চালু") : (en ? "OFF" : "বন্ধ")}</b><div class="mut xs">${en ? "Adds a 6-digit code from your phone at sign-in. Strongly recommended for Admin and Boss." : "লগইনের সময় ফোনের ৬ অঙ্কের কোড লাগে। Admin ও Boss-এর জন্য জোরালোভাবে সুপারিশ।"}</div></div><div class="st-btns"><button class="btn ${f ? "bad" : "pri"}" id="st-mfab">${f ? (en ? "Turn off" : "বন্ধ করুন") : (en ? "Turn on" : "চালু করুন")}</button></div>`;
    g("st-mfab").onclick = async () => { if (!f) return mfaEnrollModal(paint); if (!ask(en ? "Turn off 2FA?" : "2FA বন্ধ করবেন?")) return; try { const { error } = await sb.auth.mfa.unenroll({ factorId: f.id }); if (error) throw error; toast(en ? "✔ 2FA is off" : "✔ 2FA বন্ধ হয়েছে"); paint(); } catch (e) { toast(e.message || String(e), "err"); } }; }; paint(); }
  g("st-fs").onchange = e => savePrefs({ font: e.target.value }); g("st-cp").onchange = e => savePrefs({ compact: e.target.value === "1" }); g("st-start").onchange = e => { savePrefs({ start: e.target.value }); toast("✔ সেভ হয়েছে"); };
  g("st-ch").onchange = e => { savePrefs({ closingHour: +e.target.value }); updateBell(); }; g("st-cs").onchange = e => { savePrefs({ cashHour: +e.target.value }); updateBell(); };
  g("st-pd").onchange = e => { savePrefs({ pendDays: +e.target.value }); refreshBadges(); }; g("st-snd").onchange = e => savePrefs({ sound: e.target.value === "1" }); g("st-fri").onchange = e => savePrefs({ skipFri: e.target.value === "1" });
  g("st-np").onclick = async () => { await Notification.requestPermission(); vSettings(v); };
  g("st-nt").onclick = () => { if (PREFS.sound) beep(); sysNotify(bi("🔔 পরীক্ষা — Nabiad", "🔔 Test — Nabiad"), bi("নোটিফিকেশন ঠিকমতো কাজ করছে", "Notifications are working"), "test"); toast(bi("পরীক্ষার নোটিফিকেশন পাঠানো হয়েছে", "Test notification sent")); };
  g("st-dead") && (g("st-dead").onclick = deadModal);
  g("st-sync").onclick = async () => { if (DEMO) return toast(bi("DEMO মোড", "DEMO mode")); await Outbox.flush(); await reload(); toast("✔ সিঙ্ক ও রিফ্রেশ হয়েছে"); };
  g("st-upd").onclick = async () => { try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { } toast("নতুন সংস্করণ থাকলে রিলোড হচ্ছে…"); setTimeout(() => location.reload(), 900); };
  g("st-inst") && (g("st-inst").onclick = installModal);
  g("st-clr").onclick = () => { if (Outbox.count() && !ask(bi(`${Outbox.count()}টি এন্ট্রি এখনো সিঙ্ক হয়নি — মুছলে হারিয়ে যাবে। তবুও মুছবেন?`, `${Outbox.count()} entries are not synced yet — they will be lost if cleared. Clear anyway?`))) return; if (!ask(bi("এই ডিভাইসের জমা কপি মুছে রিলোড করবেন?", "Clear this device's saved copy and reload?"))) return; [CACHE_KEY, "nabiad_rem_seen"].forEach(k => localStorage.removeItem(k)); if (!Outbox.count()) localStorage.removeItem(OB_KEY); location.reload(); };
}

/* =================== v6: audit & security (tabs) =================== */

/* =================== v6.2: audit log =================== */
AU_F.event = "ঘটনা"; AU_T.cash_records = "ক্যাশ"; AU_T.audit_log = "Audit log";
const AU_IC = { insert: "plus", update: "edit", delete: "trash" };
const AUDIT_ZONE = "Asia/Dhaka";
const auditDate = value => new Intl.DateTimeFormat("en-CA", {timeZone:AUDIT_ZONE, year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
const auditStamp = (value, options = {dateStyle:"medium", timeStyle:"short"}) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString(LANG === "en" ? "en-GB" : "bn-BD", {...options,timeZone:AUDIT_ZONE}) : "—";
const auditTable = tbl => Object.hasOwn(AU_T,tbl) ? tr(AU_T[tbl]) : String(tbl || "—");
Object.assign(AU_T, {inv_orders:"Inventory order", inv_items:"Inventory item", inv_demand:"Inventory demand", rm_daily:"RM daily stock",
  rm_products:"RM product", cashbook_days:"Cash Book", cashbook_ledgers:"Cash ledgers", leaf_marks:"Cheque leaf", cheque_statement_verifications:"Statement verification"});
const auditActor = r => r.user_name || bi("সিস্টেম", "System");
const auditOrderLabels = {
  ch: ["চ্যানেল", "Channel"], rent: ["ভাড়া", "Rent"], lines: ["অর্ডার আইটেম", "Order items"],
  value: ["অর্ডারের মূল্য", "Order value"], total_qty: ["মোট পরিমাণ", "Total quantity"],
  vehicle: ["গাড়ি নম্বর", "Vehicle no."], transport: ["পরিবহন", "Transport"],
  delivery_date: ["ডেলিভারির তারিখ", "Delivery date"], free: ["ফ্রি অফার", "Free offer"]
};
function auditOrderItems(value, catalog) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  const isNumber = v => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v));
  if (!entries.every(([id,line]) => /^\d+$/.test(id) && line && isNumber(line.q) && isNumber(line.r))) return null;
  return entries.map(([id,line]) => {
    const item = catalog.get(id);
    return {id, name:item?.name || bi("আইটেম #" + id, "Item #" + id), unit:item?.unit || "", qty:Number(line.q), rate:Number(line.r)};
  });
}
function auditOrderText(items) {
  return items.length ? items.map(i => `${i.name} · ${bi("পরিমাণ","Qty")} ${money(i.qty)} ${i.unit} × ৳${money(i.rate)} = ৳${money(i.qty * i.rate)}`).join(" | ") : bi("কোনো আইটেম নেই","No items");
}
function auditOrderDetail(items) {
  if (!items.length) return `<b>${bi("কোনো আইটেম নেই","No items")}</b>`;
  return `<ul class="as-order-items">${items.map(i => `<li><strong>${esc(i.name)}</strong> ${i.name.endsWith("#" + i.id) ? "" : `<small class="mut">#${esc(i.id)}</small>`}
    <dl><div><dt>${bi("পরিমাণ","Quantity")}</dt><dd>${money(i.qty)} ${esc(i.unit)}</dd></div>
    <div><dt>${bi("দর","Unit rate")}</dt><dd>৳${money(i.rate)}</dd></div>
    <div><dt>${bi("মোট","Line amount")}</dt><dd>৳${money(i.qty * i.rate)}</dd></div></dl></li>`).join("")}</ul>`;
}
function auditValue(r, key, value) {
  if (r.tbl === "inv_orders") {
    if (key === "ch" && Object.hasOwn(IV_CH, value)) return bi(...IV_CH[value]);
    if (key === "status" && Object.hasOwn(IV_ST, value)) return bi(IV_ST[value][0], IV_ST[value][1]);
  }
  return auV(value,key);
}
function auditFields(r, catalog) {
  const old = r.old || {}, next = r.new || {}, changed = r.action === "update";
  const entry = r.action === "delete" ? old : next;
  return Object.keys(changed ? {...old,...next} : entry)
    .filter(k => !AU_SKIP.has(k) && (changed ? JSON.stringify(old[k]) !== JSON.stringify(next[k]) : entry[k] != null && entry[k] !== ""))
    .map(key => {
      const order = r.tbl === "inv_orders", label = order && Object.hasOwn(auditOrderLabels,key)
        ? bi(...auditOrderLabels[key]) : Object.hasOwn(AU_F,key) ? tr(AU_F[key]) : key;
      const format = value => {
        const items = order && key === "lines" ? auditOrderItems(value,catalog) : null;
        const text = items ? auditOrderText(items) : auditValue(r,key,value);
        return {text, items};
      };
      return {label, before:format(old[key]), after:format(next[key])};
    });
}
const auText = (r, catalog) => auditFields(r,catalog).map(f => `${f.label}: ${r.action === "update" ? f.before.text + " → " + f.after.text : r.action === "delete" ? f.before.text : f.after.text}`).join("; ");
function auChips(r, catalog) {
  const fields = auditFields(r,catalog);
  const short = ({text,items}) => items ? bi(`${items.length}টি আইটেম`, `${items.length} ${items.length === 1 ? "item" : "items"}`) : text.length > 72 ? text.slice(0, 69) + "…" : text;
  return fields.slice(0, 4).map(f => `<span class="auc"><span class="au-k">${esc(f.label)}</span>${r.action === "update" ? `<s>${esc(short(f.before))}</s><i>→</i>` : ""}<b>${esc(short(r.action === "delete" ? f.before : f.after))}</b></span>`).join("") +
    (fields.length > 4 ? `<span class="mut sm">+${fields.length - 4}</span>` : "");
}
function auditDetails(r, catalog) {
  const fields = auditFields(r,catalog);
  const detail = (label, value) => `<div><span class="mut xs">${label}</span>${value.items ? auditOrderDetail(value.items) : `<b>${esc(value.text)}</b>`}</div>`;
  modal(`<h2>${bi("পরিবর্তনের বিস্তারিত", "Change details")}</h2><div class="aim">${esc(auditTable(r.tbl))} · ${esc(auditActor(r))} · ${esc(auditStamp(r.at))}</div><p class="as-break">${esc(r.row_key || "—")}</p>
    ${fields.length ? `<dl class="as-field-diff">${fields.map(f => `<div><dt>${esc(f.label)}</dt><dd>${r.action !== "insert" ? detail(bi("আগে", "Before"),f.before) : ""}${r.action !== "delete" ? detail(bi("পরে", "After"),f.after) : ""}</dd></div>`).join("")}</dl>` : `<div class="empty">${bi("ফিল্ড পরিবর্তন নেই", "No field changes recorded")}</div>`}
    <div class="modal-actions"><button type="button" class="btn" id="au-detail-copy">${ico("copy")} ${bi("রেফারেন্স কপি", "Copy reference")}</button><button type="button" class="btn pri" id="au-detail-close">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    $("#au-detail-close", root).onclick = close;
    const copy = $("#au-detail-copy", root); copy.disabled = !r.row_key;
    copy.onclick = () => copyText(String(r.row_key),bi("রেফারেন্স কপি হয়েছে","Reference copied"));
  });
}
async function vAudit(v, options) {
  const admin = S.me.role === "admin", F = { ...pbInit("month"), tbl: "", act: "", who: "", q: "" };
  F.d = auditDate(Date.now());
  if (options?.deletions) { F.m = "custom"; F.t = auditDate(Date.now()); F.f = addDays(F.t,-6); F.act = "delete"; }
  v.innerHTML = head("Audit log", `<div class="dd"><button class="btn" id="au-dl">${ico("dl")} ডাউনলোড ▾</button><div class="ddm hide" id="au-menu"><button data-dl="xlsx">${ico("dl")} Excel (.xlsx)</button><button data-dl="csv">${ico("list")} CSV</button><button data-dl="print">${ico("print")} প্রিন্ট / PDF</button></div></div>${admin ? `<button class="btn rdo" id="au-clr">${ico("trash")} লগ পরিষ্কার</button>` : ""}`) + `
   <div class="card tbar noprint">${pbBar("au", F)}
    <div class="srch"><label class="si">${ico("search")}<input class="in" id="au-q" placeholder="${bi("রেফারেন্স, ব্যবহারকারী বা ফিল্ডের মান", "Reference, user or field value")}" aria-label="${bi("লগ খুঁজুন", "Search audit log")}" autocomplete="off" type="search"></label></div>
    <div class="aufl"><select class="in" id="au-t" aria-label="${bi("মডিউল", "Module")}"><option value="">সব জায়গা</option>${Object.entries({ ...AU_T, cash_records: "ক্যাশ" }).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select><select class="in" id="au-a" aria-label="${bi("কাজ", "Action")}"><option value="">সব কাজ</option>${Object.entries(AU_A).map(([k, l]) => `<option value="${k}">${l[0]}</option>`).join("")}</select><select class="in" id="au-w" aria-label="${bi("ব্যবহারকারী", "Actor")}"><option value="">সবাই</option></select></div></div>
   <div class="as-metrics au-k4" id="au-kpi"></div><div class="as-result"><p class="mut sm" id="au-total" role="status"></p><button class="btn sm" type="button" id="au-reset">${bi("ফিল্টার রিসেট", "Reset filters")}</button></div><div id="au-out" style="margin-top:12px"><div class="card empty">লোড হচ্ছে…</div></div>`;
  let rows = [], shown = [], more = false, busy = false, failed = false, revision = 0, cutoff;
  const batch = 100, out = $("#au-out", v), range = () => pbRange(F);
  let catalog = new Map(), catalogRequest;
  function loadCatalog() {
    if (catalogRequest) return;
    catalogRequest = API.auditItemCatalog().then(items => {
      catalog = new Map(items.map(item => [String(item.id),item]));
      if (out.isConnected) draw();
    }).catch(() => {});
  }
  async function load(append = false) {
    if (append && busy) return;
    const seq = ++revision, [from, to] = range();
    if (!append) { rows = []; shown = []; more = false; cutoff = new Date().toISOString(); }
    failed = false; busy = true; draw();
    try {
      const result = await API.audit({tbl:F.tbl, act:F.act, from, to, before:cutoff, offset:rows.length, limit:batch});
      if (!out.isConnected || seq !== revision) return;
      rows = rows.concat(result);
      if (result.some(r => r.tbl === "inv_orders")) loadCatalog();
      more = result.length === batch;
      const users = [...new Set(rows.map(auditActor))].sort();
      const ws = $("#au-w", v);
      ws.innerHTML = `<option value="">${bi("সবাই", "Everyone")}</option>` + users.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
      if (!users.includes(F.who)) F.who = "";
      ws.value = F.who;
    } catch { if (out.isConnected && seq === revision) failed = true; }
    finally { if (out.isConnected && seq === revision) { busy = false; draw(); } }
  }
  function draw() {
    const q = chequeSearchKey(F.q);
    shown = rows.filter(r => (!F.who || auditActor(r) === F.who) && (!q ||
      chequeSearchKey([auditActor(r), r.row_key, r.tbl, auditTable(r.tbl), JSON.stringify(r.old), JSON.stringify(r.new), r.tbl === "inv_orders" ? auText(r,catalog) : ""].join(" ")).includes(q)));
    const counts = {insert:0, update:0, delete:0};
    shown.forEach(r => { if (Object.hasOwn(counts,r.action)) counts[r.action]++; });
    const cards = [["",bi("মিলেছে", "Matching entries"),shown.length], ...Object.entries(AU_A).map(([key,[label,cls]]) => [key,tr(label),counts[key],cls])];
    $("#au-kpi", v).innerHTML = cards.map(([key,label,count,cls]) => `<button type="button" class="card as-kpi ${cls || ""}" data-au-action="${key}" aria-pressed="${key === F.act}"><span>${esc(label)}</span><strong class="num">${count}</strong></button>`).join("");
    $("#au-total", v).textContent = bi(`${rows.length}টি লোড হয়েছে · ${shown.length}টি মিলেছে · ঢাকা সময়`, `${rows.length} loaded · ${shown.length} match · Dhaka time`);
    $("#au-dl", v).disabled = busy || !shown.length;
    let last = "", html = "";
    shown.forEach((r, i) => {
      const d = auditDate(r.at), action = Object.hasOwn(AU_A,r.action) ? r.action : "update";
      if (d !== last) { last = d; html += `<div class="au-day">${auditStamp(r.at,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>`; }
      html += `<article class="aui a-${action}"><div class="aic">${ico(AU_IC[action])}</div><div class="aib"><div class="ait"><span class="tag au-${action}">${esc(tr((AU_A[action] || [action])[0]))}</span><b>${esc(auditTable(r.tbl))}</b><span class="aik">${esc(r.row_key || "")}</span></div>
        <div class="aim">${esc(auditStamp(r.at,{hour:"2-digit",minute:"2-digit"}))} · <b>${esc(auditActor(r))}</b></div><div class="aud">${auChips(r,catalog)}</div>
        <button class="btn sm" type="button" data-au-detail="${i}">${bi("বিস্তারিত", "Details")}</button></div></article>`;
    });
    const status = busy ? bi("লোড হচ্ছে…","Loading…") : failed ? bi("লগ লোড হয়নি","Audit entries could not be loaded") : bi("এই ফিল্টারে কোনো রেকর্ড মেলেনি","No entries match these filters");
    out.innerHTML = html ? `<div class="card au-list">${html}</div>` : `<div class="card empty">${status}</div>`;
    if (more || failed) out.insertAdjacentHTML("beforeend", `<div class="as-result"><span class="mut sm">${more ? bi("এই সময়ের আরও রেকর্ড আছে। এক্সপোর্টে লোড হওয়া রেকর্ড থাকবে।","More entries are available. Exports include loaded matches.") : status}</span><button class="btn" type="button" id="au-more" ${busy ? "disabled" : ""}>${failed ? bi("আবার চেষ্টা করুন","Retry") : bi("আরও লোড করুন","Load more")}</button></div>`);
    $("#au-more", v)?.addEventListener("click", () => load(rows.length > 0));
  }
  out.onclick = e => { const btn = e.target.closest("[data-au-detail]"); if (btn) auditDetails(shown[Number(btn.dataset.auDetail)],catalog); };
  $("#au-kpi", v).onclick = e => {
    const btn = e.target.closest("[data-au-action]"); if (!btn) return;
    F.act = btn.dataset.auAction; $("#au-a", v).value = F.act; load();
  };
  $("#au-reset", v).onclick = () => {
    F.q = F.tbl = F.act = F.who = "";
    for (const id of ["au-q","au-t","au-a","au-w"]) $("#" + id,v).value = "";
    load();
  };
  const fname = ext => `Audit_${range()[0]}_${range()[1]}.${ext}`;
  async function download(kind) {
    $("#au-menu", v).classList.add("hide"); if (!shown.length) return toast("ডাটা নেই", "err");
    const H = ["Time", "User", "Where", "Action", "Item", "Changes", "Old (JSON)", "New (JSON)"], R = shown.map(r => [auditStamp(r.at), r.user_name || "", AU_T[r.tbl] ? tr(AU_T[r.tbl]) : r.tbl, r.action, r.row_key || "", auText(r,catalog), r.old ? JSON.stringify(r.old) : "", r.new ? JSON.stringify(r.new) : ""]);
    if (kind === "xlsx") return exportXlsx({ Audit: [H, ...R] }, fname("xlsx"));
    if (kind === "csv") { const csv = "﻿" + [H, ...R].map(r => r.map(x => `"${String(x).replace(/^(?=[\s\uFEFF]*[=+@-])/, "\u0027").replace(/"/g, '""')}"`).join(",")).join("\r\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = fname("csv"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return; }
    const [f0, t0] = range(), cnt = a => shown.filter(r => r.action === a).length;
    const body = shown.map(r => `<tr><td>${esc(auditStamp(r.at,{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}))}</td><td>${esc(r.user_name || "")}</td><td>${esc(AU_T[r.tbl] ? tr(AU_T[r.tbl]) : (r.tbl === "cash_records" ? tr("ক্যাশ") : r.tbl))}</td><td>${esc((AU_A[r.action] || [r.action])[0])}</td><td>${esc(r.row_key || "")}</td><td>${esc(auText(r,catalog))}</td></tr>`).join("");
    printSheet(repSheet("au-sheet", "Audit Log · পরিবর্তনের লগ", f0, t0, repKpi([["Changes", shown.length], ["Added", cnt("insert")], ["Edited", cnt("update")], ["Deleted", cnt("delete")]]), repOne(repBox("Change history", ["~Time", "~User", "~Where", "~Action", "~Item", "~Changes"], body)), more ? "Note: only the loaded records are included." : ""), fname("pdf").replace(/\.pdf$/, ""));
  }
  $("#au-dl", v).onclick = e => { e.stopPropagation(); $("#au-menu", v).classList.toggle("hide"); };
  $$("#au-menu [data-dl]", v).forEach(b => b.onclick = () => download(b.dataset.dl).catch(e => toast(e.message || String(e), "err")));
  const hideMenu = () => $("#au-menu", v)?.classList.add("hide"); document.addEventListener("click", hideMenu);
  $("#au-clr", v) && ($("#au-clr", v).onclick = () => clearAuditModal(() => load()));
  pbBind(v, "au", F, () => load());
  $("#au-t", v).onchange = e => { F.tbl = e.target.value; load(); }; $("#au-a", v).onchange = e => { F.act = e.target.value; load(); }; $("#au-w", v).onchange = e => { F.who = e.target.value; draw(); };
  $("#au-q", v).oninput = e => { F.q = e.target.value; draw(); };
  $("#au-a", v).value = F.act;
  load();
  return () => { ++revision; document.removeEventListener("click", hideMenu); };
}
function clearAuditModal(after) {
  modal(`<h2>🧹 Audit log পরিষ্কার</h2><p class="mut sm" style="margin-top:-6px">পুরনো লগ মুছে জায়গা খালি করুন। মোছার পরেও "কে কখন পরিষ্কার করেছে" তার একটা রেকর্ড থেকে যাবে।</p>
   <div class="grid" style="gap:8px">${[["90", bi("৯০ দিনের বেশি পুরনো", "Older than 90 days")], ["30", bi("৩০ দিনের বেশি পুরনো", "Older than 30 days")], ["7", bi("৭ দিনের বেশি পুরনো", "Older than 7 days")], ["all", bi("সব লগ", "All logs")]].map(([k, l], i) => `<label class="rad"><input type="radio" name="clr" value="${k}" ${i === 0 ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
   <label class="rad" style="margin-top:12px"><input type="checkbox" id="clr-dl" checked><span>মোছার আগে সম্পূর্ণ JSON আর্কাইভ ডাউনলোড করুন</span></label>
   <div id="clr-all" class="hide" style="margin-top:10px"><label class="f">নিশ্চিত করতে <b>CLEAR</b> লিখুন</label><input class="in" id="clr-t" autocomplete="off"></div>
   <div class="modal-actions"><button class="btn bad fix" id="clr-ok">${ico("trash")} পরিষ্কার করুন</button><button class="btn fix" id="clr-x">বাতিল</button></div>`, (root, close) => {
    $$("[name=clr]", root).forEach(r => r.onchange = () => $("#clr-all", root).classList.toggle("hide", $("[name=clr]:checked", root).value !== "all"));
    $("#clr-x", root).onclick = close;
    $("#clr-ok", root).onclick = async () => {
      const k = $("[name=clr]:checked", root).value; if (k === "all" && $("#clr-t", root).value.trim().toUpperCase() !== "CLEAR") return toast("CLEAR লিখুন", "err");
      const before = k === "all" ? new Date().toISOString() : new Date(addDays(auditDate(Date.now()), -+k) + "T00:00:00+06:00").toISOString();
      const b = $("#clr-ok", root); b.disabled = true;
      try {
        if ($("#clr-dl", root).checked) {
          const archive = [], batch = 500;
          for (let offset = 0; ; offset += batch) {
            const page = await API.audit({before, offset, limit:batch});
            archive.push(...page);
            if (page.length < batch) break;
          }
          if (archive.length) dlBlob(new Blob([JSON.stringify({before,entries:archive})], {type:"application/json"}), `Audit_archive_${today()}.json`);
        }
        const n = await API.clearAudit(before); close(); toast(bi(`✔ ${n}টি পুরনো লগ মুছে ফেলা হয়েছে`, `✔ ${n} old log(s) deleted`)); after && after();
      } catch (e) { toast(/function|does not exist/i.test(e.message || "") ? "schema_v4.sql চালানো বাকি" : e.message, "err"); b.disabled = false; }
    };
  });
}

/* =================== v6.2: audit & security shell =================== */
async function vSecurity(v) {
  const tabs = [["audit","list",bi("অডিট লগ","Audit log"),vAudit],
    ...(S.me.role === "admin" ? [["backup","save","Backup",vBackup],["sec","shield","Security",vSec]] : [])];
  const requested = sessionStorage.getItem("nabiad_sec_tab");
  let tab = tabs.some(([key]) => key === requested) ? requested : "audit";
  let childCleanup, epoch = 0;
  v.innerHTML = `<div class="tabs ntabs adm-tabs as-tabs" role="group" aria-label="${bi("অডিট ও সিকিউরিটি বিভাগ","Audit and security sections")}">${tabs.map(([key, icon, label]) =>
    `<button type="button" class="chip" data-security-tab="${key}" aria-controls="sec-out" aria-pressed="false">${ico(icon)} ${label}</button>`).join("")}</div><div id="sec-out"></div>`;
  const panels = $("#sec-out", v), buttons = $$("[data-security-tab]", v);
  const open = (key, options) => {
    const visit = ++epoch;
    childCleanup?.(); childCleanup = null;
    tab = key;
    sessionStorage.setItem("nabiad_sec_tab", tab);
    buttons.forEach(btn => {
      const active = btn.dataset.securityTab === tab;
      btn.classList.toggle("on", active); btn.setAttribute("aria-pressed", active);
    });
    const panel = document.createElement("div");
    panels.replaceChildren(panel);
    Promise.resolve(tabs.find(([id]) => id === tab)[3](panel, options, open)).then(dispose => {
      if (visit !== epoch || !panel.isConnected) { dispose?.(); return; }
      childCleanup = dispose;
    }).catch(() => {
      if (panel.isConnected && visit === epoch) panel.innerHTML = `<div class="alert rd">${bi("এই বিভাগ লোড হয়নি","This section could not load")}</div>`;
    });
  };
  buttons.forEach(btn => btn.onclick = () => { if (btn.dataset.securityTab !== tab) open(btn.dataset.securityTab); });
  open(tab);
  return () => { ++epoch; childCleanup?.(); };
}
function securityMetrics(cards) {
  return `<div class="as-metrics">${cards.map(([label,value,sub]) => `<div class="card as-kpi"><span>${label}</span><strong>${esc(value)}</strong>${sub ? `<small class="mut">${esc(sub)}</small>` : ""}</div>`).join("")}</div>`;
}
const asUnavailable = () => bi("পাওয়া যায়নি","Unavailable");
function backupSheets(data) {
  const sheets = {};
  for (const [name, rows] of Object.entries(data || {})) {
    if (!Array.isArray(rows) || !rows.length) continue;
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    sheets[name] = [keys, ...rows.map(row => keys.map(key => row[key] != null && typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key]))];
  }
  if (!Object.keys(sheets).length) throw new Error(bi("এক্সপোর্টের রেকর্ড নেই","No records to export"));
  return sheets;
}
function backupDetails(r, data) {
  const entries = Object.entries(data || {}).filter(([,rows]) => Array.isArray(rows));
  const counts = entries.map(([name,rows]) => `<div class="kv"><span>${esc(auditTable(name))}</span><b class="num">${money0(rows.length)}</b></div>`).join("");
  modal(`<h2>${bi("ব্যাকআপের বিস্তারিত","Snapshot details")}</h2><p class="mut sm">${esc(auditStamp(r.at))} · ${bi("ঢাকা সময়","Dhaka time")}</p>
    ${counts || `<div class="empty">${bi("এই snapshot-এ টেবিল পাওয়া যায়নি","No tables found in this snapshot")}</div>`}
    <div class="modal-actions"><button class="btn pri" type="button" id="backup-detail-close">${bi("বন্ধ","Close")}</button></div>`,
    (root, close) => $("#backup-detail-close",root).onclick = close);
}
function backupRestoreModal(snapshot, preview, refresh, applyRestore = tables => API.restoreSnapshot(snapshot.id, true, tables)) {
  const exclusions = preview.excluded.map(auditTable).join(", ");
  const name = row => esc(auditTable(row.table));
  const candidate = row => !row.unavailable && row.missing > 0;
  const eligible = preview.tables.filter(candidate);
  modal(`<h2>${bi("রিস্টোর প্রিভিউ", "Restore preview")}</h2>
    <p class="mut sm">${esc(auditStamp(snapshot.at))}${snapshot.filename ? " · " + esc(snapshot.filename) : " · #" + esc(snapshot.id)}</p>
    <p>${bi("হারানো রেকর্ড যোগ হবে। বর্তমান রেকর্ড অক্ষত থাকবে। রিস্টোরের আগে বর্তমান ডাটার একটি snapshot নেওয়া হবে।",
      "Restore adds missing records and keeps existing records. A snapshot of current data is taken before applying changes.")}</p>
    <div class="tw cards"><table class="adm-restore-table"><thead><tr><th>${bi("বিভাগ", "Table")}</th><th>${bi("ব্যাকআপে", "In backup")}</th><th>${bi("অনুপস্থিত", "Missing")}</th></tr></thead><tbody>
    ${preview.tables.map(row => `<tr><td>${candidate(row) ? `<label><input type="checkbox" value="${esc(row.table)}" data-restore-table checked> ${name(row)}</label>` : name(row)}</td>
    <td>${row.unavailable ? "—" : money0(row.snapshot)}</td><td>${row.unavailable ? bi("টেবিল নেই", "Table unavailable") : money0(row.missing)}</td></tr>`).join("")}
    </tbody></table></div>
    ${exclusions ? `<p class="mut sm">${bi("আলাদা রিকভারি প্রয়োজন", "Requires separate recovery")} · ${esc(exclusions)}</p>` : ""}
    <p class="mut sm">${bi("প্রিভিউতে primary key ধরে গণনা হয়। অন্য unique key-এর অমিলে কিছু রেকর্ড বাদ যেতে পারে। লগইন ও ফাইল স্টোরেজ আলাদাভাবে রিকভার করতে হয়।",
      "Preview counts missing primary keys. Other unique conflicts can reduce the restored count. Sign-in credentials and stored files require separate recovery.")}</p>
    ${eligible.length ? `<label class="f">${bi("নিশ্চিত করতে RESTORE লিখুন", "Type RESTORE to confirm")}<input class="in" id="bk-restore-confirm" autocomplete="off" spellcheck="false"></label>`
      : `<p>${bi("রিস্টোর করার মতো অনুপস্থিত রেকর্ড নেই।", "There are no missing records to restore.")}</p>`}
    <div class="hint" id="bk-restore-result" role="status" aria-live="polite"></div>
    <div id="bk-restore-breakdown"></div>
    <div class="modal-actions"><button class="btn" type="button" id="bk-restore-close">${bi("বন্ধ", "Close")}</button>
    ${eligible.length ? `<button class="btn pri" type="button" id="bk-restore-apply" disabled>${bi("নির্বাচিত রেকর্ড রিস্টোর করুন", "Restore selected records")}</button>` : ""}</div>`, (root, close) => {
    const panel = $("#bk-restore-result", root), apply = $("#bk-restore-apply", root), closeButton = $("#bk-restore-close", root);
    const input = $("#bk-restore-confirm", root), tables = $$("[data-restore-table]", root);
    let busy = false, completed = false;
    closeButton.onclick = close;
    if (!apply) return;
    const update = () => { apply.disabled = busy || completed || input.value.trim() !== "RESTORE" || !tables.some(box => box.checked); };
    input.oninput = update;
    tables.forEach(box => box.onchange = update);
    apply.onclick = async () => {
      if (apply.disabled) return;
      busy = true; update();
      input.disabled = closeButton.disabled = true;
      tables.forEach(box => box.disabled = true);
      panel.textContent = bi("রিস্টোর চলছে…", "Restoring…");
      try {
        const result = await applyRestore(tables.filter(box => box.checked).map(box => box.value));
        completed = true;
        panel.textContent = bi(`${money0(result.inserted)}টি রেকর্ড রিস্টোর হয়েছে।`, `${money0(result.inserted)} records restored.`)
          + (result.restore_point ? " · " + bi("রিস্টোরের আগের snapshot", "Pre-restore snapshot") + " #" + result.restore_point : "");
        const actual = (result.tables || []).filter(row => !row.unavailable && row.missing > 0);
        if ($("#bk-restore-breakdown", root) && actual.length) {
          $("#bk-restore-breakdown", root).innerHTML = `<h3>${bi("রিস্টোরের ফলাফল", "Restore results")}</h3>${actual.map(row =>
            `<div class="kv"><span>${name(row)}</span><b class="num">${money0(row.inserted)} / ${money0(row.missing)}</b></div>`).join("")}`;
        }
        if (result.inserted) {
          balCache.clear(); CBLED = null; CBL = null;
          ["cash", "bal", "br", "inv", "dist"].forEach(key => dropCache(key));
          reload().then(refreshBadges).catch(() => {});
        }
        await refresh();
      } catch (error) {
        const message = error.message || String(error);
        panel.textContent = /restore_blocked_by_open_leaf_mark/.test(message)
          ? bi("একটি চেকের জন্য খোলা leaf mark আছে। চেক বাদ দিয়ে অন্য টেবিল রিস্টোর করতে পারেন।", "An open cheque leaf mark needs reconciliation. You can deselect Cheques and restore the other tables if they have no missing cheque dependencies.")
          : bi("রিস্টোর সম্পন্ন হয়নি। ", "Restore did not complete. ") + message;
      } finally {
        busy = false;
        closeButton.disabled = false;
        input.disabled = completed;
        tables.forEach(box => box.disabled = completed);
        update();
      }
    };
  });
}
/* Off-site backup status for the Backup page. runs: array (newest first) | null (log table not installed) | undefined (could not load) */
const OFFSITE_STALE_H = { db: 36, storage: 9 * 24 };
function offsiteStatus(runs, kind) {
  const label = kind === "db" ? bi("শেষ off-site (ডেটাবেস)", "Last off-site (database)") : bi("শেষ off-site (ছবি)", "Last off-site (photos)");
  if (runs === undefined) return { card: [label, asUnavailable(), ""], warn: "" };
  if (runs === null) return { card: [label, bi("সেটআপ হয়নি", "Not set up"), bi("schema_offsite_backup_runs.sql প্রয়োগ ও workflow চালু করুন", "Apply schema_offsite_backup_runs.sql and enable the workflow")], warn: kind === "db" ? bi("Off-site backup এখনো চালু নেই — ডেটাবেস নষ্ট হলে এই Backup-ও হারাবে।", "Off-site backup is not set up yet. If the database is lost, these backups are lost with it.") : "" };
  const mine = runs.filter(r => r.kind === kind), ok = mine.find(r => r.ok), last = mine[0];
  const failedLast = !!last && !last.ok;
  if (!ok) return { card: [label, "—", failedLast ? bi("শেষ run ব্যর্থ", "Last run failed") : bi("এখনো সফল run নেই", "No successful run yet")], warn: failedLast ? bi("শেষ off-site run ব্যর্থ হয়েছে।", "The last off-site run failed.") : "" };
  const hours = (Date.now() - Date.parse(ok.at)) / 36e5, stale = hours > OFFSITE_STALE_H[kind];
  const sub = [relTime(ok.at), stale ? "⚠ " + bi("পুরনো", "stale") : "", failedLast ? bi("শেষ run ব্যর্থ", "last run failed") : ""].filter(Boolean).join(" · ");
  return { card: [label, auditStamp(ok.at), sub], warn: stale || failedLast ? bi(`${kind === "db" ? "ডেটাবেস" : "ছবি"} off-site backup ${stale ? "সময়মতো হয়নি" : "শেষবার ব্যর্থ হয়েছে"} — GitHub Actions দেখুন।`, `${kind === "db" ? "Database" : "Photo"} off-site backup ${stale ? "is overdue" : "failed on its last run"}. Check GitHub Actions.`) : "" };
}
async function vBackup(out) {
  out.innerHTML = head(bi("ব্যাকআপ ও রিস্টোর", "Backup & Restore"), `${!DEMO ? `<button class="btn" type="button" id="bk-upload">${ico("plus")} ${bi("ব্যাকআপ আপলোড ও রিস্টোর", "Upload backup & restore")}</button>` : ""}<button class="btn pri" type="button" id="bk-now">${ico("save")} ${bi("এখনই Backup","Backup now")}</button><button class="btn" type="button" id="bk-dl">${ico("dl")} ${bi("বর্তমান ডাটা (Excel)","Current data (Excel)")}</button>`) +
    `${!DEMO ? `<input type="file" hidden id="bk-upload-file" accept=".json,application/json">
      <p class="mut sm" id="bk-upload-status" role="status"></p>` : ""}
      <div id="bk-kpi"></div><div class="card flush" id="bk-archive">
      <div class="ch"><h3>${bi("ব্যাকআপ তালিকা","Backup history")}</h3><span class="tag" id="bk-count" role="status"></span></div>
      <div class="as-result as-toolbar"><div class="chips" role="group" aria-label="${bi("ব্যাকআপের ধরন","Backup type")}">${[["",bi("সব","All")],["auto",bi("স্বয়ংক্রিয়","Automatic")],["manual",bi("ম্যানুয়াল","Manual")],["other",bi("অন্যান্য","Other")]].map(([key,label]) => `<button type="button" class="chip" data-bk-kind="${key}" aria-pressed="false">${label}</button>`).join("")}</div>
      <button type="button" class="btn sm" id="bk-refresh">${bi("রিফ্রেশ","Refresh")}</button></div>
      <div id="bk-list"></div></div>`;
  const g = id => $("#" + id,out), list = g("bk-list");
  const kind = value => ({auto:bi("স্বয়ংক্রিয়","Automatic"),manual:bi("ম্যানুয়াল","Manual"),restore_point:bi("রিস্টোরের আগের ব্যাকআপ","Pre-restore snapshot"),other:bi("অন্যান্য","Other")})[value] || bi("অন্যান্য","Other");
  let rows = [], selected = "", busy = false, offsite;
  const timestamp = row => row ? auditStamp(row.at) : "—";
  function draw() {
    const auto = rows.filter(r => r.kind === "auto"), manual = rows.filter(r => r.kind === "manual");
    const fresh = auto[0] && Date.now() - Date.parse(auto[0].at) < 36 * 3600000;
    const offDb = offsiteStatus(offsite, "db"), offSt = offsiteStatus(offsite, "storage"), warns = [offDb.warn, offSt.warn].filter(Boolean);
    g("bk-kpi").innerHTML = warns.map(w => `<div class="alert rd" role="alert">${esc(w)}</div>`).join("") + securityMetrics([
      [bi("শেষ স্বয়ংক্রিয়","Latest automatic"),timestamp(auto[0]),auto[0] ? (fresh ? relTime(auto[0].at) : bi("৩৬ ঘণ্টা পেরিয়েছে","Older than 36 hours")) : bi("স্বয়ংক্রিয় snapshot পাওয়া যায়নি","No automatic snapshot found")],
      [bi("শেষ ম্যানুয়াল","Latest manual"),timestamp(manual[0]),manual[0] ? bi("রেকর্ড ","Records ") + money0(manual[0].size_rows) : ""],
      [bi("সংরক্ষিত snapshot","Stored snapshots"),String(rows.length),bi("স্বয়ংক্রিয় ","Automatic ") + auto.length + " · " + bi("ম্যানুয়াল ","Manual ") + manual.length + " · " + bi("অন্যান্য ","Other ") + (rows.length-auto.length-manual.length)],
      [bi("নির্ধারিত সময়","Configured schedule"),bi("প্রতিদিন ০০:০০","Daily at 00:00"),bi("ঢাকা সময়","Dhaka time")],
      offDb.card, offSt.card
    ]);
    const visible = rows.filter(r => !selected || (["auto","manual"].includes(r.kind) ? r.kind : "other") === selected);
    g("bk-count").textContent = String(visible.length);
    $$("[data-bk-kind]",out).forEach(btn => {
      btn.classList.toggle("on",btn.dataset.bkKind === selected); btn.setAttribute("aria-pressed",btn.dataset.bkKind === selected);
    });
    list.innerHTML = visible.length ? visible.map(r => `<article class="bkr"><span class="bki ${r.kind === "auto" ? "auto" : "manual"}">${ico(r.kind === "auto" ? "clock" : "save")}</span>
      <div class="bkb"><b>${esc(auditStamp(r.at))}</b><div class="mut sm">${kind(r.kind)} · ${bi("রেকর্ড","Records")} ${money0(r.size_rows)}</div></div>
      <div class="bka"><button type="button" class="btn sm" data-backup="details" data-id="${esc(r.id)}">${bi("বিস্তারিত","Details")}</button><button type="button" class="btn sm" data-backup="json" data-id="${esc(r.id)}">JSON</button>
      ${!DEMO ? `<button type="button" class="btn sm" data-backup="restore" data-id="${esc(r.id)}">${bi("রিস্টোর দেখুন","Preview restore")}</button>` : ""}
      <button type="button" class="btn sm" data-backup="xlsx" data-id="${esc(r.id)}">Excel</button>
      ${r.kind === "manual" ? `<button class="btn sm rdo" type="button" data-backup="remove" data-id="${esc(r.id)}" aria-label="${bi("ম্যানুয়াল ব্যাকআপ মুছুন","Delete manual backup")}">${ico("trash")}</button>` : ""}</div></article>`).join("") :
      `<div class="empty">${bi("এই ধরনের কোনো snapshot নেই","No snapshots match this type")}</div>`;
  }
  async function refresh() {
    if (busy) return;
    busy = true; g("bk-refresh").disabled = true;
    list.innerHTML = `<div class="empty">${bi("লোড হচ্ছে…","Loading…")}</div>`;
    try {
      const [data, runs] = await Promise.all([API.backups(), API.offsiteRuns().catch(() => undefined)]);
      if (!out.isConnected) return;
      offsite = runs;
      rows = [...data].sort((a,b) => Date.parse(b.at)-Date.parse(a.at)); draw();
    } catch {
      if (out.isConnected) {
        g("bk-kpi").textContent = ""; g("bk-count").textContent = "";
        list.innerHTML = `<div class="empty">${bi("ব্যাকআপ তালিকা লোড হয়নি। রিফ্রেশ করে আবার চেষ্টা করুন।","Backup history could not load. Refresh to retry.")}</div>`;
      }
    } finally { busy = false; g("bk-refresh").disabled = false; }
  }
  let backupAction = false;
  async function runBackupAction(button, task) {
    if (backupAction) return;
    backupAction = true; button.disabled = true;
    try { await task(); }
    catch (e) { if (out.isConnected) toast(e.message || String(e),"err"); }
    finally { backupAction = false; button.disabled = false; }
  }
  $$("[data-bk-kind]",out).forEach(btn => btn.onclick = () => { selected = btn.dataset.bkKind; if (!busy && g("bk-count").textContent) draw(); });
  list.onclick = e => {
    const btn = e.target.closest("[data-backup]"); if (!btn) return;
    const r = rows.find(item => String(item.id) === btn.dataset.id), action = btn.dataset.backup;
    if (!r) return;
    runBackupAction(btn,async () => {
      if (action === "remove") {
        if (r.kind !== "manual" || !ask(bi("এই ম্যানুয়াল snapshot মুছবেন?","Delete this manual snapshot?"))) return;
        await API.deleteBackup(r.id); if (out.isConnected) await refresh(); return;
      }
      if (action === "restore") {
        const preview = await API.restoreSnapshot(r.id).catch(error => {
          if (tallySchemaMissing(error)) throw new Error(bi("আগে schema_admin_restore.sql প্রয়োগ করুন।", "Apply schema_admin_restore.sql to enable restore."));
          throw error;
        });
        if (out.isConnected) backupRestoreModal(r, preview, refresh);
        return;
      }
      const data = await API.backupData(r.id);
      if (!out.isConnected) return;
      if (!data || typeof data !== "object") throw new Error(bi("Snapshot পড়া যায়নি","Snapshot could not be read"));
      const filename = `nabiad_backup_${r.at.slice(0,19).replace(/[:T]/g,"-")}_${r.id}`;
      if (action === "details") backupDetails(r,data);
      else if (action === "json") dlBlob(new Blob([JSON.stringify(data)],{type:"application/json"}),filename+".json");
      else await exportXlsx(backupSheets(data),filename+".xlsx");
    });
  };
  const upload = g("bk-upload"), uploadFile = g("bk-upload-file"), uploadStatus = g("bk-upload-status");
  if (upload) {
    upload.onclick = () => uploadFile.click();
    uploadFile.onchange = () => {
      const file = uploadFile.files[0];
      uploadFile.value = "";
      if (!file) return;
      return runBackupAction(upload, async () => {
        uploadStatus.textContent = bi("ব্যাকআপ ফাইল যাচাই হচ্ছে…", "Checking backup file…");
        try {
          if (!file.name.toLowerCase().endsWith(".json") || file.size > 25 * 1024 * 1024) {
            throw new Error(bi("২৫ MB-এর মধ্যে NABIAD JSON ব্যাকআপ বাছুন।", "Choose a NABIAD JSON backup of 25 MB or less."));
          }
          let data;
          try { data = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); }
          catch { throw new Error(bi("JSON ফাইলটি পড়া যায়নি।", "This JSON file could not be read.")); }
          if (!data || Array.isArray(data) || typeof data.taken_at !== "string" || !Number.isFinite(Date.parse(data.taken_at))) {
            throw new Error(bi("Backup history থেকে export করা NABIAD JSON ফাইল বাছুন।", "Choose a NABIAD JSON file exported from Backup history."));
          }
          const preview = await API.restoreUploadedBackup(data);
          if (out.isConnected) backupRestoreModal({at: data.taken_at, filename: file.name}, preview, refresh,
            tables => API.restoreUploadedBackup(data, true, tables));
        } catch (error) {
          uploadStatus.textContent = tallySchemaMissing(error) ? bi("আগে schema_admin_restore.sql-এর নতুন সংস্করণ প্রয়োগ করুন।", "Apply the updated schema_admin_restore.sql to enable uploads.")
            : /invalid_backup_file/.test(error.message || "") ? bi("ব্যাকআপ ফরম্যাটটি গ্রহণযোগ্য নয়।", "This backup format is unsupported.") : error.message || String(error);
          return;
        }
        uploadStatus.textContent = "";
      });
    };
  }
  g("bk-refresh").onclick = refresh;
  g("bk-now").onclick = () => runBackupAction(g("bk-now"),async () => {
    await API.backupNow();
    if (out.isConnected) { toast(bi("ব্যাকআপ নেওয়া হয়েছে","Backup created")); await refresh(); }
  });
  g("bk-dl").onclick = () => runBackupAction(g("bk-dl"),async () => {
    const data = await API.dumpAll();
    if (!out.isConnected) return;
    const failed = Object.keys(data).filter(key => data[key]?.error);
    const sheets = backupSheets(data);
    if (failed.length) sheets["Export status"] = [["Table","Status"], ...failed.map(key => [key,"Unavailable"])];
    await exportXlsx(sheets,`Nabiad_${failed.length ? "Partial" : "Full"}_Data_${today()}.xlsx`);
    if (failed.length) toast(bi("আংশিক এক্সপোর্ট হয়েছে। বাদ পড়া টেবিল Export status-এ আছে।","Partial export. See the Export status sheet for unavailable tables."),"err");
  });
  await refresh();
}
async function vSec(out, _options, open) {
  const F = {q:"", mode:""};
  out.innerHTML = head("Security", `<button class="btn" type="button" id="sc-refresh">${bi("রিফ্রেশ","Refresh")}</button>`) +
    `<div id="sc-overview"></div><div class="grid g2 as-panels"><div class="card" id="sc-devices"></div><div class="card" id="sc-recent"></div></div>
      <section class="card flush" id="sc-directory"><div class="ch"><h3>${bi("ব্যবহারকারী ও সাইন-ইন","Users and sign-ins")}</h3><span id="sc-count" class="tag" role="status"></span></div>
      <div class="as-result as-toolbar">${searchBox("sc-query",bi("নাম বা ইমেইল","Name or email"))}<select id="sc-mode" class="in" aria-label="${bi("ব্যবহারকারী ফিল্টার","User filter")}">
      <option value="">${bi("সব ব্যবহারকারী","All users")}</option><option value="disabled">${bi("নিষ্ক্রিয়","Inactive")}</option><option value="mfa">${bi("সক্রিয় · 2FA বন্ধ","Active · 2FA off")}</option></select></div><div id="sc-users"></div></section>`;
  const g = id => $("#" + id,out), unknown = asUnavailable();
  let users = [], byId = new Map(), sessions = null, refreshing = false;
  g("sc-query").setAttribute("aria-label",bi("ব্যবহারকারী খুঁজুন","Search users"));
  function drawUsers() {
    const q = chequeSearchKey(F.q);
    const visible = users.filter(u => (!q || chequeSearchKey([u.name,u.email].join(" ")).includes(q)) &&
      (F.mode === "disabled" ? !u.active : F.mode === "mfa" ? u.active && byId.get(u.id)?.has_2fa === false : true));
    g("sc-count").textContent = String(visible.length);
    g("sc-users").innerHTML = visible.length ? visible.map(u => {
      const sec = byId.get(u.id);
      return `<article class="ur"><div class="as-user-ref">${avaEl(u.id,u.name,u.email)}<div class="ub"><b>${esc(u.name || "—")}</b> <span class="pill">${esc(u.role)}</span><div class="mut xs">${esc(u.email || "")}</div></div></div>
      <div class="as-user-state"><span class="tag">${u.active ? bi("সক্রিয়","Active") : bi("নিষ্ক্রিয়","Inactive")}</span><span class="tag">2FA · ${sec ? sec.has_2fa ? bi("চালু","On") : bi("বন্ধ","Off") : unknown}</span><span class="mut sm">${sec ? bi(`${sec.sessions} সেশন`,`${sec.sessions} sessions`) : ""}</span></div>
      <div class="ut"><span class="mut xs">${bi("শেষ সাইন-ইন","Last sign-in")}</span><b class="sm">${esc(auditStamp(u.last_sign_in_at || sec?.last_sign_in_at))}</b></div>
      ${u.id ? `<button type="button" class="btn sm" data-user-security="${esc(u.id)}">${bi("নিরাপত্তা","Manage security")}</button>` : ""}</article>`;
    }).join("") : `<div class="empty">${bi("কোনো ব্যবহারকারী মেলেনি","No users match")}</div>`;
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true; const button = g("sc-refresh"); button.disabled = true;
    const settled = await Promise.allSettled([API.userLogins(),API.userSec(),API.userSessions(S.me.id),API.backups(),API.audit({act:"delete",from:addDays(auditDate(Date.now()),-6),to:auditDate(Date.now()),limit:6})]);
    refreshing = false; button.disabled = false;
    if (!out.isConnected) return;
    const [logins, sec, own, backups, recent] = settled.map(r => r.status === "fulfilled" ? r.value : null);
    users = logins ?? [];
    byId = new Map((sec || []).map(u => [u.user_id,u]));
    sessions = own;
    const enrolled = users.filter(u => u.active && byId.get(u.id)?.has_2fa).length;
    const eligible = users.filter(u => u.active).length, known = users.filter(u => u.active && byId.has(u.id)).length;
    const auto = backups?.find(r => r.kind === "auto");
    g("sc-overview").innerHTML = securityMetrics([
      [bi("সংযোগ","Connection"),location.protocol === "https:" ? "HTTPS" : (DEMO ? "Demo" : "HTTP"),location.host],
      [bi("সক্রিয় অ্যাকাউন্টে 2FA","2FA on active accounts"),sec && logins && known===eligible ? `${enrolled} / ${eligible}` : unknown,""],
      [bi("আপনার সেশন","Your sessions"),own ? String(own.length) : unknown,""],
      [bi("শেষ স্বয়ংক্রিয় ব্যাকআপ","Latest automatic backup"),auto ? auditStamp(auto.at) : backups ? "—" : unknown,auto ? relTime(auto.at) : ""]
    ]);
    g("sc-devices").innerHTML = `<h3>${bi("আপনার সাইন-ইন সেশন","Your signed-in sessions")}</h3><p class="mut sm as-break">${esc(S.me.email || "")}</p>${own ? own.length ? own.map(row => `<div class="scrow">${sessionDevice(row)}
      ${!row.mine ? `<button type="button" class="btn sm" data-sc-device="${esc(row.id)}">${bi("লগআউট","Sign out")}</button>` : ""}</div>`).join("") : `<p class="mut sm">${bi("কোনো সক্রিয় সেশন নেই","No active sessions")}</p>` : `<p class="mut sm">${bi("সেশনের তথ্য লোড হয়নি","Session information could not load")}</p>`}
      <div class="adm-actions st-btns"><button type="button" class="btn" id="sc-oth" ${own && !own.some(row => !row.mine) ? "disabled" : ""}>${bi("অন্য সব ডিভাইস থেকে লগআউট","Sign out other devices")}</button><a class="btn" href="#/settings">${bi("পাসওয়ার্ড ও 2FA","Password and 2FA")}</a></div>`;
    g("sc-recent").innerHTML = `<h3>${bi("গত ৭ দিনের সাম্প্রতিক ডিলিট","Recent deletions · 7 days")}</h3>${recent ? recent.length ? recent.map(r => `<div class="scrow"><div class="as-break"><b>${esc(auditTable(r.tbl))} · ${esc(r.row_key || "—")}</b><div class="mut sm">${esc(auditActor(r))} · ${esc(auditStamp(r.at))}</div></div></div>`).join("") : `<p class="mut sm">${bi("এই সময়ে ডিলিট নেই","No deletions in this period")}</p>` : `<p class="mut sm">${bi("ডিলিটের রেকর্ড লোড হয়নি","Deletion activity could not load")}</p>`}
      <button type="button" class="btn sm" id="sc-audit-link">${bi("অডিট লগে দেখুন","View in Audit Log")}</button>`;
    g("sc-audit-link").onclick = () => open("audit",{deletions:true});
    if (logins) drawUsers();
    else { g("sc-count").textContent = ""; g("sc-users").innerHTML = `<div class="empty">${bi("ব্যবহারকারীর তালিকা লোড হয়নি","User sign-ins could not load")}</div>`; }
  }
  let revoking = false;
  g("sc-devices").onclick = async e => {
    const btn = e.target.closest("#sc-oth,[data-sc-device]");
    if (!btn || revoking || !ask(btn.id === "sc-oth" ? bi("অন্য ডিভাইসগুলো লগআউট করবেন?","Sign out other devices?") : bi("এই সেশনটি বন্ধ করবেন?","Sign out this session?"))) return;
    revoking = true; btn.disabled = true;
    try {
      if (btn.id === "sc-oth") await API.signOutOthers();
      else if (sessions?.some(r => !r.mine && String(r.id) === btn.dataset.scDevice)) await API.revokeSessions(S.me.id,btn.dataset.scDevice);
      if (out.isConnected) await refresh();
    } catch (err) { toast(err.message || String(err),"err"); }
    finally { revoking = false; btn.disabled = false; }
  };
  g("sc-users").onclick = e => {
    const btn = e.target.closest("[data-user-security]"), user = btn && users.find(u => String(u.id) === btn.dataset.userSecurity);
    if (user) userSecModal(user, () => { if (out.isConnected) refresh(); });
  };
  g("sc-query").oninput = e => { F.q = e.target.value; if (g("sc-count").textContent) drawUsers(); };
  g("sc-mode").onchange = e => { F.mode = e.target.value; if (g("sc-count").textContent) drawUsers(); };
  g("sc-refresh").onclick = refresh;
  await refresh();
}
Object.assign(SbAPI, {
  async auditItemCatalog() { return fetchAll("inv_items", "id", "id,name,unit"); },
  async audit(f) {
    const lim = f.limit || 500, off = f.offset || 0;
    let q = sb.from("audit_log").select("*").order("at",{ascending:false}).order("id",{ascending:false}).range(off, off + lim - 1);
    if (f.tbl) q = q.eq("tbl",f.tbl);
    if (f.act) q = q.eq("action",f.act);
    if (f.from) q = q.gte("at", f.from + "T00:00:00+06:00");
    if (f.to) q = q.lt("at", addDays(f.to,1) + "T00:00:00+06:00");
    if (f.before) q = q.lt("at", f.before);
    const {data,error} = await q; if (error) throw error; return data;
  },
  async clearAudit(before) { const { data, error } = await sb.rpc("clear_audit", { before }); if (error) throw error; return data; },
  async deleteBackup(id) { const { error } = await sb.rpc("delete_backup", { bid: id }); if (error) throw error; },
  async userLogins() { const { data, error } = await sb.rpc("user_logins"); if (error) throw error; return data; },
  async verifyPassword(p) { const { data, error } = await sb.rpc("verify_my_password", { p }); if (error) throw error; return !!data; },
  async userSec() { const { data, error } = await sb.rpc("admin_user_security"); if (error) throw error; return data || []; },
  async userSessions(id) { const { data, error } = await sb.rpc("admin_sessions", { p_user: id }); if (error) throw error; return data || []; },
  async revokeSessions(id, sid) { const { data, error } = await sb.rpc("admin_revoke_sessions", { p_user: id, p_session: sid || null }); if (error) throw error; return data; },
  async reset2fa(id) { const { error } = await sb.rpc("admin_reset_2fa", { p_user: id }); if (error) throw error; },
  async setUserEmail(id, e) { const { error } = await sb.rpc("admin_set_email", { p_user: id, p_email: e }); if (error) throw error; },
  async deleteUser(id) { const { error } = await sb.rpc("admin_delete_user", { p_user: id }); if (error) throw error; },
  async userActivity(id) { const { data, error } = await sb.from("audit_log").select("*").eq("user_id", id).order("at", { ascending: false }).limit(25); if (error) throw error; return data || []; },
  async pushMine() { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (!sub) return null; const { data } = await sb.from("push_subs").select("summary").eq("endpoint", sub.endpoint).maybeSingle(); return { sub, row: data }; },
  async pushOn(sub) { const j = sub.toJSON(), { data: { user } } = await sb.auth.getUser(); const { error } = await sb.from("push_subs").upsert({ user_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 160), summary: true }, { onConflict: "endpoint" }); if (error) throw error; },
  async pushOff(endpoint) { await sb.from("push_subs").delete().eq("endpoint", endpoint); },
  async pushSummary(endpoint, on) { const { error } = await sb.from("push_subs").update({ summary: on }).eq("endpoint", endpoint); if (error) throw error; },
  async pushTest() { const { data, error } = await sb.functions.invoke("notify", { body: {} }); if (error) throw error; return data; },
  async mfaNeeded() { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2"; },
  async mfaFactor() { const { data } = await sb.auth.mfa.listFactors(); return (data?.totp || []).find(f => f.status === "verified") || null; },
});
Object.assign(DemoAPI, {
  async audit(f) {
    const from = f.from ? Date.parse(f.from + "T00:00:00+06:00") : -Infinity;
    const to = f.to ? Date.parse(addDays(f.to,1) + "T00:00:00+06:00") : Infinity;
    const before = f.before ? Date.parse(f.before) : Infinity, off = f.offset || 0;
    return demoStore.audit.filter(r => {
      const at = Date.parse(r.at);
      return (!f.tbl || r.tbl === f.tbl) && (!f.act || r.action === f.act) && at >= from && at < to && at < before;
    }).sort((a,b) => Date.parse(b.at) - Date.parse(a.at) || Number(b.id) - Number(a.id)).slice(off, off + (f.limit || 500));
  },
  async clearAudit(before) { const n = demoStore.audit.filter(r => r.at < before).length; demoStore.audit = demoStore.audit.filter(r => r.at >= before); this.aud("audit_log", "delete", `${n} rows cleared`, null, null); this.save(); return n; },
  async deleteBackup(id) { demoStore.backups = (demoStore.backups || []).filter(b => b.id !== id); this.save(); },
  async userLogins() { return [{ email: "admin@demo", name: S.me.name, role: "admin", active: true, last_sign_in_at: new Date().toISOString() }]; },
  async verifyPassword() { return true; }, async userSec() { return []; },
  async auditItemCatalog() { return (await this.ivStore()).items; },
  async userSessions() { return [{ id: "d1", created_at: new Date().toISOString(), last_seen: new Date().toISOString(), user_agent: navigator.userAgent, ip: "demo", aal: "aal1", mine: true }]; },
  async revokeSessions() { return 0; }, async reset2fa() { }, async setUserEmail(id, e) { const u = (demoStore.users || []).find(x => x.id === id); if (u) { u.email = e; this.save(); } }, async deleteUser(id) { demoStore.users = (demoStore.users || []).filter(x => x.id !== id); this.save(); },
  async userActivity() { return []; }, async pushMine() { return null; }, async pushOn() {}, async pushOff() {}, async pushSummary() {}, async pushTest() { return { ok: 0 }; }, async mfaNeeded() { return false; }, async mfaFactor() { return null; },
});

/* =================== v6.15: Distribution Collection (daily record · approval · summary · report · parties) =================== */
Object.assign(ICON, {
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.5a6 6 0 0 1 3 5.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  map: '<path d="M9 4L3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4zM9 4v13M15 7v13"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  xmark: '<path d="M6 6l12 12M18 6L6 18"/>'
});
const DC_ST = { pending: "Pending", approved: "Approved", cancelled: "Cancelled" };
const DC_EXTRA = ["Cash", "Priyo Agro", "Unknown"];
const DP_KEY = "nabiad_dparty_v1";
const dcErr = e => /relation|does not exist|schema cache|not find|dist_/i.test(e.message || "") && !/permission|policy/i.test(e.message || "") ? "কালেকশন টেবিল নেই — Supabase-এ schema_v6.sql চালাতে হবে" : isNetErr(e) ? "ইন্টারনেট নেই" : (e.message || String(e));
const dcRow = r => ({ id: r.id, date: r.date, party_id: r.party_id || null, party: r.party, asm: r.asm || "", account: r.account || "", amount: Number(r.amount), status: r.status || "pending", remarks: r.remarks || "", decided_by: r.decided_by || null, decided_at: r.decided_at || null, decision_note: r.decision_note || "", entered_by: r.entered_by || "", created_at: r.created_at || "" });
const BD_DIV = {"Bagerhat":"Khulna","Bandarban":"Chattogram","Barguna":"Barishal","Barishal":"Barishal","Bhola":"Barishal","Bogura":"Rajshahi","Brahmanbaria":"Chattogram","Chandpur":"Chattogram","Chapai Nawabganj":"Rajshahi","Chattogram":"Chattogram","Chuadanga":"Khulna","Cox's Bazar":"Chattogram","Cumilla":"Chattogram","Dhaka":"Dhaka","Dinajpur":"Rangpur","Faridpur":"Dhaka","Feni":"Chattogram","Gaibandha":"Rangpur","Gazipur":"Dhaka","Gopalganj":"Dhaka","Habiganj":"Sylhet","Jamalpur":"Mymensingh","Jashore":"Khulna","Jhalokati":"Barishal","Jhenaidah":"Khulna","Joypurhat":"Rajshahi","Khagrachhari":"Chattogram","Khulna":"Khulna","Kishoreganj":"Dhaka","Kurigram":"Rangpur","Kushtia":"Khulna","Lakshmipur":"Chattogram","Lalmonirhat":"Rangpur","Madaripur":"Dhaka","Magura":"Khulna","Manikganj":"Dhaka","Meherpur":"Khulna","Moulvibazar":"Sylhet","Munshiganj":"Dhaka","Mymensingh":"Mymensingh","Naogaon":"Rajshahi","Narail":"Khulna","Narayanganj":"Dhaka","Narsingdi":"Dhaka","Natore":"Rajshahi","Netrakona":"Mymensingh","Nilphamari":"Rangpur","Noakhali":"Chattogram","Pabna":"Rajshahi","Panchagarh":"Rangpur","Patuakhali":"Barishal","Pirojpur":"Barishal","Rajbari":"Dhaka","Rajshahi":"Rajshahi","Rangamati":"Chattogram","Rangpur":"Rangpur","Satkhira":"Khulna","Shariatpur":"Dhaka","Sherpur":"Mymensingh","Sirajganj":"Rajshahi","Sunamganj":"Sylhet","Sylhet":"Sylhet","Tangail":"Dhaka","Thakurgaon":"Rangpur"};
const BD_AL = {"bogra":"Bogura","comilla":"Cumilla","chittagong":"Chattogram","ctg":"Chattogram","chattagram":"Chattogram","barisal":"Barishal","jessore":"Jashore","narayangonj":"Narayanganj","ngonj":"Narayanganj","bbaria":"Brahmanbaria","coxbazar":"Cox's Bazar","nawabganj":"Chapai Nawabganj","jaipurhat":"Joypurhat","jhalokathi":"Jhalokati","maulvibazar":"Moulvibazar","netrokona":"Netrakona","panchogor":"Panchagarh","thakurgoan":"Thakurgaon","munshigonj":"Munshiganj","manikgonj":"Manikganj","narshingdi":"Narsingdi","gopalgonj":"Gopalganj","kishorgonj":"Kishoreganj","hobiganj":"Habiganj","sunamgonj":"Sunamganj","khagrachari":"Khagrachhari","laxmipur":"Lakshmipur","jenaidah":"Jhenaidah","sirajgonj":"Sirajganj"};
const BD_DIST = Object.keys(BD_DIV).sort(), BD_DIVS = [...new Set(Object.values(BD_DIV))].sort();
const bdKey = {}; BD_DIST.forEach(d => bdKey[d.toLowerCase().replace(/[^a-z]/g, "")] = d); Object.assign(bdKey, BD_AL);
function bdGuess(name) {   // "Name-Upazila, District" → district (exact/alias match on the location part, last words first)
  const parts = String(name || "").split(/\s*[-,\/()&]\s*/).slice(1).reverse();
  for (const s of parts) { const k = s.toLowerCase().replace(/[^a-z]/g, ""); if (bdKey[k]) return bdKey[k]; }
  for (const s of parts) for (const w of s.split(/\s+/).reverse()) { const k = w.toLowerCase().replace(/[^a-z]/g, ""); if (k.length > 2 && bdKey[k]) return bdKey[k]; }
  return "";
}
const dpGeoMap = () => { const m = new Map(); (DPARTY || []).forEach(p => { m.set(p.id, p); m.set("n:" + norm(p.name), p); }); return m; };
const dpGeoOf = (m, r) => { const p = m.get(r.party_id) || m.get("n:" + norm(r.party)); return { district: p?.district || "", division: p?.division || "" }; };
const dpRow = p => ({ id: p.id, name: p.name, asm: p.asm || "", account: p.account || "", phone: p.phone || "", contact_person: p.contact_person || "", address: p.address || "", district: p.district || "", division: p.district ? (BD_DIV[p.district] || p.division || "") : "", note: p.note || "", active: p.active !== false });
const DC_INUSE = "আগের রেকর্ড আছে — মুছা যাবে না। এর বদলে নিষ্ক্রিয় করুন";
const dcDup = e => e && e.code === "23505" ? new Error("এই নামে পার্টি আগেই আছে") : e;
const dcShort = d => d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(2, 4)}` : "";

Object.assign(SbAPI, {
  async dparties() { return (await fetchAll("dist_parties", "name")).map(dpRow); },
  async dpartySave(p) {
    const row = { name: p.name, asm: p.asm || null, account: p.account || null, phone: p.phone || null, contact_person: p.contact_person || null, address: p.address || null, district: p.district || null, division: p.district ? (BD_DIV[p.district] || null) : null, note: p.note || null, active: p.active !== false };
    if (p.id) { const { data, error } = await sb.from("dist_parties").update(row).eq("id", p.id).select().single(); if (error) throw dcDup(error); return dpRow(data); }
    row.entered_by = S.me.name; const { data, error } = await sb.from("dist_parties").insert(row).select().single(); if (error) throw dcDup(error); return dpRow(data);
  },
  async dpartyDelete(id) { const { error } = await sb.from("dist_parties").delete().eq("id", id); if (error) throw error.code === "23503" ? new Error(DC_INUSE) : error; },
  async dpartyUsage(id) { const { count, error } = await sb.from("dist_collections").select("id", { count: "exact", head: true }).eq("party_id", id); if (error) throw error; return count || 0; },
  async asmUsage(name) { const { count, error } = await sb.from("dist_collections").select("id", { count: "exact", head: true }).eq("asm", name); if (error) throw error; return count || 0; },
  async asms() { try { return (await fetchAll("dist_asms", "name")).map(a => ({ id: a.id, name: a.name, active: a.active !== false })); } catch (e) { if (/dist_asms|relation|schema cache/i.test(e.message || "")) return []; throw e; } },
  async purposes() { try { const r = (await fetchAll("cheque_purposes", "created_at")).sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.created_at).localeCompare(String(b.created_at))); return r.map(a => a.name); } catch (e) { if (/cheque_purposes|relation|schema cache/i.test(e.message || "")) return PURP_X; throw e; } },
  async purposeDelete(name) { const { data, error } = await sb.from("cheque_purposes").delete().eq("name", name).select(); if (error) throw error; if (!data.length) throw new Error("admin_only"); },
  async purposeRename(o, n) { const { data, error } = await sb.rpc("purpose_rename", { p_old: o, p_new: n }); if (error) throw error; return data; },
  async purposeAdd(name) { const { error } = await sb.from("cheque_purposes").insert({ name, entered_by: S.me.name }); if (error) throw error.code === "23505" ? new Error("এই খাত আগেই আছে") : /cheque_purposes|relation|schema cache/i.test(error.message || "") ? new Error(bi("Supabase-এ schema_v6.sql-এর v6.24 অংশ চালানো হয়নি", "The v6.24 part of schema_v6.sql has not been run in Supabase")) : error; },
  async asmAdd(name) { const { data, error } = await sb.from("dist_asms").insert({ name, entered_by: S.me.name }).select().single(); if (error) throw error.code === "23505" ? new Error("এই নামে ASM আগেই আছে") : error; return { id: data.id, name: data.name, active: true }; },
  async asmRename(a, to) { if (a.id) { const { error } = await sb.from("dist_asms").update({ name: to }).eq("id", a.id); if (error) throw error.code === "23505" ? new Error("এই নামে ASM আগেই আছে") : error; } await this.dpartyRenameAsm(a.name, to); },
  async asmActive(id, on) { const { error } = await sb.from("dist_asms").update({ active: on }).eq("id", id); if (error) throw error; },
  async asmDelete(id) { const { error } = await sb.from("dist_asms").delete().eq("id", id); if (error) throw error.code === "23503" ? new Error(DC_INUSE) : error; },
  async dpartyRenameAsm(from, to) { const { error } = await sb.from("dist_parties").update({ asm: to || null }).eq("asm", from); if (error) throw error; },
  async dcolParty(id, from, to) { let out = [], f = 0; for (;;) { const { data, error } = await sb.from("dist_collections").select("*").eq("party_id", id).gte("date", from).lte("date", to).order("date").order("created_at").order("id").range(f, f + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; f += 1000; } return out.map(dcRow); },
  async dcolRange(from, to) {
    let out = [], f = 0;
    for (;;) { const { data, error } = await sb.from("dist_collections").select("*").gte("date", from).lte("date", to).order("date").order("created_at").order("id").range(f, f + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; f += 1000; }
    return out.map(dcRow);
  },
  async dcolAdd(c) {
    const row = { id: c.id || crypto.randomUUID(), date: c.date, party_id: c.party_id || null, party: c.party, asm: c.asm || null, account: c.account || null, amount: c.amount, remarks: c.remarks || null, status: "pending", entered_by: S.me.name };
    const local = () => ({ ...dcRow({ ...row, created_at: new Date().toISOString() }), pending_sync: true });
    if (!navigator.onLine) { Outbox.add("dcol", row); return local(); }
    const { data, error } = await sb.from("dist_collections").insert(row).select().single();
    if (error && isNetErr(error)) { Outbox.add("dcol", row); return local(); }
    if (error) throw error; return dcRow(data);
  },
  async dcolUpdate(id, p) {
    const row = {}; for (const k of ["date", "party_id", "party", "asm", "account", "amount", "remarks"]) if (k in p) row[k] = p[k] === "" ? null : p[k];
    const { error } = await sb.from("dist_collections").update(row).eq("id", id); if (error) throw error;
  },
  async dcolDelete(id) { const { error } = await sb.from("dist_collections").delete().eq("id", id); if (error) throw error; },
  async dcolStatus(ids, st, note) { const { data, error } = await sb.rpc("dist_set_status", { ids, st, note: note || null }); if (error) throw error; return data; }
});
Object.assign(DemoAPI, {
  async dparties() {
    if (!demoStore.dparties) { demoStore.dparties = []; try { demoStore.dparties = await (await fetch("dev/dist_parties.json")).json(); } catch { } this.save(); }
    demoStore.dcols ||= []; return demoStore.dparties.map(dpRow);
  },
  async dpartySave(p) {
    await this.dparties(); const list = demoStore.dparties, nm = norm(p.name);
    if (list.some(x => x.id !== p.id && norm(x.name) === nm)) throw new Error("এই নামে পার্টি আগেই আছে");
    const row = { name: p.name, asm: p.asm || "", account: p.account || "", phone: p.phone || "", contact_person: p.contact_person || "", address: p.address || "", district: p.district || "", division: p.district ? (BD_DIV[p.district] || "") : "", note: p.note || "", active: p.active !== false };
    if (p.id) { const o = list.find(x => x.id === p.id); this.aud("dist_parties", "update", "Party " + o.name, { ...o }, { ...o, ...row }); Object.assign(o, row); this.save(); return dpRow(o); }
    const n = { id: crypto.randomUUID(), ...row }; list.push(n); this.aud("dist_parties", "insert", "Party " + n.name, null, n); this.save(); return dpRow(n);
  },
  async dpartyUsage(id) { await this.dparties(); return demoStore.dcols.filter(r => r.party_id === id).length; },
  async asmUsage(name) { await this.dparties(); return demoStore.dcols.filter(r => r.asm === name).length; },
  async asms() { await this.dparties(); if (!demoStore.dasms) { demoStore.dasms = [...new Set(demoStore.dparties.map(p => p.asm).filter(Boolean))].map(n => ({ id: crypto.randomUUID(), name: n, active: true })); this.save(); } return demoStore.dasms.map(a => ({ ...a })); },
  async purposes() { if (!demoStore.purposes || !demoStore.purposes.length) demoStore.purposes = [...PURPOSES]; return [...demoStore.purposes]; },
  async purposeAdd(name) { await this.purposes(); demoStore.purposes = [...demoStore.purposes, name]; this.save(); },
  async purposeDelete(name) { await this.purposes(); demoStore.purposes = demoStore.purposes.filter(x => x !== name); this.save(); },
  async purposeRename(o, n) { await this.purposes(); demoStore.purposes = demoStore.purposes.map(x => x === o ? n : x); let k = 0; demoStore.cheques.forEach(c => { if (c.purpose === o) { c.purpose = n; k++; } }); this.save(); return k; },
  async asmAdd(name) { await this.asms(); if (demoStore.dasms.some(a => norm(a.name) === norm(name))) throw new Error("এই নামে ASM আগেই আছে"); const a = { id: crypto.randomUUID(), name, active: true }; demoStore.dasms.push(a); this.save(); return { ...a }; },
  async asmRename(a, to) { await this.asms(); if (demoStore.dasms.some(x => x.id !== a.id && norm(x.name) === norm(to))) throw new Error("এই নামে ASM আগেই আছে"); const o = demoStore.dasms.find(x => x.id === a.id); if (o) o.name = to; await this.dpartyRenameAsm(a.name, to); },
  async asmActive(id, on) { await this.asms(); const o = demoStore.dasms.find(x => x.id === id); if (o) o.active = on; this.save(); },
  async asmDelete(id) { await this.asms(); const o = demoStore.dasms.find(x => x.id === id); if (!o) return; if (demoStore.dparties.some(p => p.asm === o.name) || demoStore.dcols.some(r => r.asm === o.name)) throw new Error(DC_INUSE); demoStore.dasms = demoStore.dasms.filter(x => x.id !== id); this.save(); },
  async dpartyDelete(id) { await this.dparties(); if (demoStore.dcols.some(r => r.party_id === id)) throw new Error(DC_INUSE); const o = demoStore.dparties.find(x => x.id === id); o && this.aud("dist_parties", "delete", "Party " + o.name, o, null); demoStore.dparties = demoStore.dparties.filter(x => x.id !== id); this.save(); },
  async dpartyRenameAsm(from, to) { await this.dparties(); demoStore.dparties.forEach(p => { if (p.asm === from) p.asm = to; }); this.save(); },
  async dcolParty(id, from, to) { await this.dparties(); return demoStore.dcols.filter(r => r.party_id === id && r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date)).map(dcRow); },
  async dcolRange(from, to) { await this.dparties(); return demoStore.dcols.filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date) || (a.created_at || "").localeCompare(b.created_at || "")).map(dcRow); },
  async dcolAdd(c) { if (!moduleCan("collection", "entry")) throw writeDenied(); await this.dparties(); const row = { id: crypto.randomUUID(), date: c.date, party_id: c.party_id || null, party: c.party, asm: c.asm || "", account: c.account || "", amount: c.amount, remarks: c.remarks || "", status: "pending", entered_by: S.me.name, created_at: new Date().toISOString() }; demoStore.dcols.push(row); this.aud("dist_collections", "insert", `Collection ${row.date} · ${row.party} · ${row.amount}`, null, row); this.save(); return dcRow(row); },
  async dcolUpdate(id, p) { await this.dparties(); const o = demoStore.dcols.find(x => x.id === id); if (!o || !dcCanEdit(o)) throw writeDenied(); this.aud("dist_collections", "update", `Collection ${o.date} · ${o.party} · ${o.amount}`, { ...o }, { ...o, ...p }); Object.assign(o, p); this.save(); },
  async dcolDelete(id) { await this.dparties(); const o = demoStore.dcols.find(x => x.id === id); o && this.aud("dist_collections", "delete", `Collection ${o.date} · ${o.party} · ${o.amount}`, o, null); demoStore.dcols = demoStore.dcols.filter(x => x.id !== id); this.save(); },
  async dcolStatus(ids, st, note) {
    if (!moduleCan("collection", "edit")) throw writeDenied();
    await this.dparties(); let n = 0; const role = S.me.role;
    demoStore.dcols.forEach(r => { if (!ids.includes(r.id)) return; if (role !== "admin" && !["pending"].includes(r.status)) return; if (role !== "admin" && st === "pending") return; const o = { ...r }; r.status = st; r.decided_by = st === "pending" ? null : S.me.name; r.decided_at = st === "pending" ? null : new Date().toISOString(); r.decision_note = st === "pending" ? "" : (note || ""); this.aud("dist_collections", "update", `Collection ${r.date} · ${r.party} · ${r.amount}`, o, { ...r }); n++; });
    this.save(); return n;
  }
});
Object.assign(AU_T, { dist_collections: "কালেকশন", dist_parties: "ডিস্ট্রিবিউশন পার্টি" });
Object.assign(AU_F, { date: "তারিখ", asm: "ASM", account: "Account", decided_by: "কে সিদ্ধান্ত দিল", decision_note: "কারণ", phone: "ফোন", note: "নোট" });
["party_id", "decided_at"].forEach(k => AU_SKIP.add(k));

/* ---------- shared state + helpers ---------- */
let DPARTY = null, DPARTY_T = 0, DASM = [];
async function dpLoad(force) {
  if (DPARTY && !force && Date.now() - DPARTY_T < 300000) return DPARTY;
  try { const [pp, aa] = await Promise.all([API.dparties(), API.asms().catch(() => DASM)]); DPARTY = pp; DASM = aa; DPARTY_T = Date.now(); if (!DEMO) try { localStorage.setItem(DP_KEY, JSON.stringify({ u: S.me?.id, p: DPARTY })); } catch { } }
  catch (e) {
    if (DPARTY) return DPARTY;
    try { const c = JSON.parse(localStorage.getItem(DP_KEY) || "null"); if (c && c.u === S.me?.id) { DPARTY = c.p; return DPARTY; } } catch { }
    throw e;
  }
  return DPARTY;
}
const dcAccounts = () => [...new Set([...(S.accounts || []).map(a => a.code), ...DC_EXTRA, ...(DPARTY || []).map(p => p.account)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
const dcAsms = () => [...new Set([...DASM.filter(a => a.active).map(a => a.name), ...(DPARTY || []).map(p => p.asm)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
function askText(title, ph, def, cb) {
  modal(`<h2>${title}</h2><input class="in big" id="at-i" autocomplete="off" placeholder="${ph}" value="${esc(def || "")}"><div class="hint rd" id="at-e"></div><div class="modal-actions"><button class="btn pri" id="at-ok">${ico("save")} সেভ</button><button class="btn" id="at-x">বন্ধ</button></div>`, (root, close) => {
    const i = $("#at-i", root); i.focus(); i.select(); $("#at-x", root).onclick = close;
    const go = async () => { const v = i.value.replace(/\s+/g, " ").trim(); if (v.length < 2) return $("#at-e", root).textContent = "নাম লিখুন"; try { await cb(v); close(); } catch (e) { $("#at-e", root).textContent = dcErr(e); } };
    $("#at-ok", root).onclick = go; i.onkeydown = e => { if (e.key === "Enter") go(); };
  });
}
const dcCan = (r, to) => {
  if (r.pending_sync || r.status === to) return false;
  if (S.me.role === "admin") return true;
  return moduleCan("collection", "edit") && to !== "pending" && r.status === "pending";
};
const dcCanEdit = r => !r.pending_sync && (S.me.role === "admin" || (moduleCan("collection", "edit") && r.status === "pending"));
const dcBrand = code => { try { return brandOf({ code, bank: "" }).c1; } catch { return "#94a3b8"; } };
const dcStTag = r => `<span class="dst ${r.status}">${DC_ST[r.status]}</span>${r.pending_sync ? ` <span class="dst pending" title="ইন্টারনেট এলে সেভ হবে">⏳ সিঙ্ক বাকি</span>` : ""}`;
const dcGroup = (rows, kf) => { const m = new Map(); rows.forEach(r => { const k = kf(r) || "—"; const o = m.get(k) || { k, n: 0, amt: 0 }; o.n++; o.amt += r.amount; m.set(k, o); }); return [...m.values()].sort((a, b) => b.amt - a.amt); };
const dcSum = rows => rows.reduce((s, r) => s + r.amount, 0);
function dcPending() { return Outbox.list().filter(x => x.k === "dcol" && x.u === S.me?.id).map(x => ({ ...dcRow({ ...x.p, created_at: new Date(x.at).toISOString() }), pending_sync: true })); }

/* status change with optional reason */
function dcDecide(ids, st, after) {
  const run = async note => {
    try {
      const n = await API.dcolStatus(ids, st, note);
      if (n < ids.length) toast(bi(`${ids.length - n}টি রো বদলানো যায়নি (অনুমতি নেই)`, `${ids.length - n} row(s) could not be changed (no permission)`), "err");
      if (n) toast(bi(`✔ ${n}টি ${DC_ST[st]} করা হয়েছে`, `✔ ${n} marked ${DC_ST[st]}`));
      DCACHE.dcol = null; after && after(n);
    } catch (e) { toast(dcErr(e), "err"); }
  };
  if (st === "approved" || st === "pending") return run("");
  const L = "Cancel — বাতিল";
  modal(`<h2>${L} · ${ids.length}টি</h2><label class="f">কারণ / মন্তব্য <span class="mut">(ঐচ্ছিক)</span></label><input class="in" id="dd-n" autocomplete="off" placeholder="যেমন: স্টেটমেন্টে নেই / স্লিপ আসেনি"><div class="modal-actions"><button class="btn pri" id="dd-ok">নিশ্চিত করুন</button><button class="btn" id="dd-x">বাতিল</button></div>`, (root, close) => {
    const inp = $("#dd-n", root); inp.focus();
    const go = () => { close(); run(inp.value.trim()); };
    $("#dd-ok", root).onclick = go; $("#dd-x", root).onclick = close; inp.onkeydown = e => { if (e.key === "Enter") go(); };
  });
}

/* ---------- party add / edit ---------- */
function dpartyModal(p, after) {
  const isNew = !p.id, admin = S.me.role === "admin";
  const asmOpts = [...new Set([...DASM.filter(a => a.active).map(a => a.name), p.asm].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  modal(`<h2>${isNew ? "নতুন পার্টি" : "পার্টি এডিট"}</h2><div class="modal-body"><div class="fgrid">
   <div class="s4"><label class="f" for="dp-n">পার্টির নাম * <span class="mut">(নাম-এলাকা)</span></label><input class="in" id="dp-n" autocomplete="off" value="${esc(p.name || "")}" placeholder="${bi("যেমন: Rahim Store-Bogura", "e.g. Rahim Store-Bogura")}"><div class="dpx-dup" id="dp-dup" aria-live="polite"></div></div>
   <div class="s2"><label class="f" for="dp-a">ASM / Salesman</label><select class="in" id="dp-a"><option value="">— বাছুন —</option>${asmOpts.map(a => `<option ${a === p.asm ? "selected" : ""}>${esc(a)}</option>`).join("")}<option value="__new">＋ নতুন ASM যোগ করুন…</option></select><input class="in hide" id="dp-an" autocomplete="off" placeholder="নতুন ASM-এর নাম" style="margin-top:6px"></div>
   <div class="s2 dpx-h"><label class="f" for="dp-cp">Contact Person</label><input class="in" id="dp-cp" autocomplete="off" value="${esc(p.contact_person || "")}"></div>
   <div class="s1 dpx-h"><label class="f" for="dp-p">Contact No.</label><input class="in" id="dp-p" inputmode="tel" autocomplete="off" value="${esc(p.phone || "")}"></div>
   <div class="s3"><label class="f" for="dp-ad">Full Address</label><input class="in" id="dp-ad" autocomplete="off" value="${esc(p.address || "")}"></div>
   <div class="s2 dpx-h"><label class="f" for="dp-d">জেলা</label><input class="in" id="dp-d" list="dp-dl-d" autocomplete="off" value="${esc(p.district || "")}"></div>
   <div class="s2 dpx-h"><label class="f" for="dp-v">বিভাগ <span class="mut">(${bi("জেলা থেকে নিজে বসে", "filled from district")})</span></label><input class="in" id="dp-v" readonly tabindex="-1" value="${esc(p.district ? BD_DIV[p.district] || "" : "")}"></div>
   ${isNew ? "" : `<div class="s4"><label class="keep"><input type="checkbox" id="dp-act" ${p.active !== false ? "checked" : ""}> সক্রিয় পার্টি <span class="mut">(বন্ধ করলে নতুন এন্ট্রির সাজেশনে আসবে না; আগের রেকর্ড যেমন আছে থাকবে)</span></label></div>`}
  </div>${datalist("dp-dl-d", BD_DIST)}</div>
  <div class="modal-actions"><div class="hint rd" id="dp-err" role="status"></div><button class="btn pri" id="dp-ok">${ico("save")} সেভ</button><button class="btn" id="dp-x">বন্ধ</button>${!isNew && admin ? `<button class="btn dg" id="dp-del">${ico("trash")} মুছুন</button>` : ""}</div>`, (root, close) => {
    const err = m => $("#dp-err", root).textContent = m || ""; if (matchMedia("(pointer: fine)").matches) $("#dp-n", root).focus();
    $("#dp-x", root).onclick = close;
    const dI = $("#dp-d", root), vI = $("#dp-v", root), aS = $("#dp-a", root), aN = $("#dp-an", root);
    const syncV = () => { const d = BD_DIST.find(x => x.toLowerCase() === dI.value.trim().toLowerCase()); if (d) dI.value = d; vI.value = BD_DIV[dI.value] || ""; };
    dI.oninput = syncV; dI.onchange = syncV;
    { const nI = $("#dp-n", root), box = $("#dp-dup", root), words = t => norm(t).split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2);
      let tt = 0; nI.addEventListener("input", () => { clearTimeout(tt); tt = setTimeout(() => { const ws = words(nI.value); if (!ws.length) { box.innerHTML = ""; return; } const hits = (DPARTY || []).filter(x => x.id !== p.id).map(x => { const xw = words(x.name); return { x, sc: ws.filter(w => xw.some(y => y.startsWith(w) || w.startsWith(y))).length / ws.length }; }).filter(h => h.sc >= .6).sort((a, b) => b.sc - a.sc).slice(0, 3); box.innerHTML = hits.length ? `<span>${bi("একই রকম নামের পার্টি আছে", "Similar parties already exist")}:</span> ${hits.map(h => `<b>${esc(h.x.name)}</b>${h.x.asm ? ` <small>· ${esc(h.x.asm)}</small>` : ""}`).join(", ")}` : ""; }, 160); }); }
    $("#dp-n", root).onblur = () => { if (!dI.value.trim()) { dI.value = bdGuess($("#dp-n", root).value); syncV(); } };
    aS.onchange = () => { aN.classList.toggle("hide", aS.value !== "__new"); if (aS.value === "__new") aN.focus(); };
    $("#dp-ok", root).onclick = async () => {
      const name = $("#dp-n", root).value.replace(/\s+/g, " ").trim(); if (name.length < 2) return err("পার্টির নাম লিখুন");
      syncV(); const dist = dI.value.trim(); if (dist && !BD_DIV[dist]) return err("জেলার নাম লিস্ট থেকে বাছুন");
      try {
        let asm = aS.value;
        if (asm === "__new") {
          asm = aN.value.replace(/\s+/g, " ").trim(); if (asm.length < 2) return err("নতুন ASM-এর নাম লিখুন");
          const ex = DASM.find(a => norm(a.name) === norm(asm)); if (ex) asm = ex.name; else DASM.push(await API.asmAdd(asm));
        }
        const saved = await API.dpartySave({ id: p.id, name, asm, contact_person: $("#dp-cp", root).value.trim(), phone: $("#dp-p", root).value.trim(), address: $("#dp-ad", root).value.trim(), district: dist, account: p.account || "", note: p.note || "", active: isNew ? true : $("#dp-act", root).checked });
        await dpLoad(true); close(); toast("✔ পার্টি সেভ হয়েছে"); after && after(saved);
      } catch (e) { err(dcErr(e)); }
    };
    const del = $("#dp-del", root);
    if (del) del.onclick = async () => {
      err("");
      try {
        const n = await API.dpartyUsage(p.id);
        if (n > 0) return err(bi(`এই পার্টির ${n}টি কালেকশন রেকর্ড আছে — মুছা যাবে না। এর বদলে উপরের "সক্রিয় পার্টি" টিক তুলে সেভ করুন (আগের রেকর্ড অক্ষত থাকবে)।`, `This party has ${n} collection record(s) — it cannot be deleted. Untick "Active party" above and save instead (old records stay intact).`));
        if (!ask(bi(`"${p.name}" মুছে ফেলবেন? (কোনো কালেকশন রেকর্ড নেই, তাই নিরাপদ)`, `Delete "${p.name}"? (No collection records, so it is safe)`))) return;
        await API.dpartyDelete(p.id); await dpLoad(true); close(); toast("✔ মুছে ফেলা হয়েছে"); after && after(null);
      } catch (e) { err(dcErr(e)); }
    };
  });
}

/* =================== Daily Collection =================== */
async function vDcol(v) {
  let date = sessionStorage.getItem("nabiad_dc_date") || today(); sessionStorage.removeItem("nabiad_dc_date");
  const F = { st: "", ac: "", q: "" }; let rows = [], sel = new Set(), busy = false;
  v.innerHTML = head("কালেকশন এন্ট্রি", `<a class="btn" href="#/dsum">${ico("clock")} সামারি</a><a class="btn" href="#/drep">${ico("chart")} রিপোর্ট</a>`) + `
   <div class="card tbar dcx-bar"><div class="dcx-date">${dateNav("dc", date)}</div><div class="dcx-stats" id="dc-kpi"></div><div class="dcx-week noprint" id="dc-wk"></div></div>
   <p class="iv-desc noprint">${ico("info")}<span>${bi("পার্টি লিখে বাছুন → Account → টাকা → Enter চাপলেই যোগ হবে। নতুন এন্ট্রি Pending থাকে, Approve করলে হিসাবে ধরা হয়। <kbd>/</kbd> চাপলে সার্চ।", "Pick a party → account → amount → press Enter to add. New entries stay Pending until approved. Press <kbd>/</kbd> to search.")}</span></p>
   <div class="dcx-split">
   <div class="card dcx-entry" ${moduleCan("collection", "entry") ? "" : "hidden"}><div class="dcx-et"><h3>${ico("plus")} নতুন এন্ট্রি</h3></div>
    <div class="dcx-grid">
     <div class="dcx-p"><label class="f">পার্টি *</label><div><input class="in big" id="dc-pty" autocomplete="off" placeholder="পার্টির নাম লিখুন…"></div><div class="dcx-h" id="dc-ph"></div></div>
     <div class="dcx-a"><label class="f">ASM / Salesman</label><input class="in" id="dc-a" list="dc-dl-a" autocomplete="off" placeholder="অটো বসবে"></div>
     <div class="dcx-c"><label class="f">Account *</label><div><input class="in" id="dc-c" autocomplete="off" placeholder="Account খুঁজুন — DBBL-17"></div></div>
     <div class="dcx-m"><label class="f">টাকা *</label><input class="in big num" id="dc-m" inputmode="decimal" autocomplete="off" placeholder="0"><div class="dcx-h num" id="dc-mh"></div></div>
     <div class="dcx-r"><label class="f">মন্তব্য <span class="mut">(ঐচ্ছিক)</span></label><input class="in big" id="dc-r" autocomplete="off" placeholder="স্লিপ নং / নোট"></div>
     <div class="dcx-b entry-actions"><button class="btn big" type="button" id="dc-clear">${ico("x")} ${bi("পরিষ্কার", "Clear")}</button><button class="btn pri big" id="dc-add">${ico("plus")} যোগ করুন</button></div>
    </div><div class="hint rd" id="dc-err" style="min-height:0;margin-top:8px"></div><datalist id="dc-dl-a"></datalist></div>
   <div class="card flush dcx-list"><div class="ch"><h3>এই তারিখের কালেকশন</h3><span class="tag" id="dc-cnt">0</span></div>
    <div class="noprint dcx-tools"><div class="chips dcx-tabs" id="dc-sc"></div>${searchBox("dc-q", innerWidth < 560 ? bi("খুঁজুন…", "Search…") : "খুঁজুন — পার্টি, ASM, Account, টাকা…")}<button type="button" id="dc-register" class="btn pri">${ico("table")}<span>${bi("দেখুন / Export", "View / Export")}</span></button></div>
    <div class="chips dcx-acc noprint" id="dc-ac"></div>
    <div id="dc-list"></div></div></div><div id="dc-selbar" class="selbar hide"></div>`;
  const list = $("#dc-list", v), err = m => $("#dc-err", v).textContent = m || "";
  let parties = [];
  try { parties = await dpLoad(); } catch (e) { $("#dc-list", v).innerHTML = `<div class="alert rd" style="margin:12px">${esc(dcErr(e))}</div>`; }
  $("#dc-dl-a", v).innerHTML = dcAsms().map(a => `<option value="${esc(a)}">`).join("");
  const pIn = $("#dc-pty", v), aIn = $("#dc-a", v), cIn = $("#dc-c", v), mIn = $("#dc-m", v), rIn = $("#dc-r", v);
  const byName = n => parties.find(p => norm(p.name) === norm(n));
  const geoTxt = p => [p?.district, p?.division && p.division !== p.district ? p.division : ""].filter(Boolean).join(", ");
  const info = p => {
    if (!p) return ""; const td = rows.filter(r => r.party_id === p.id && r.status !== "cancelled");
    return `<div class="dcx-info"><span class="tg v">${ico("users")} ${esc(p.asm || "ASM নেই")}</span>${geoTxt(p) ? `<span class="tg">${ico("map")} ${esc(geoTxt(p))}</span>` : ""}${td.length ? `<span class="tg w">এই তারিখে আগেই ${td.length}টি · ৳ ${money0(dcSum(td))}</span>` : ""}${p.note ? `<span class="mut xs">${esc(p.note)}</span>` : ""}</div>`;
  };
  const qa = () => {};
  cIn.addEventListener("input", () => qa());
  const fill = p => { aIn.value = p?.asm || ""; $("#dc-ph", v).innerHTML = info(p); };
  const picker = suggest(pIn, () => parties.filter(p => p.active).map(p => ({ value: p.name, label: p.asm || "", sub: "", html: `<span class="sgn"><b>${esc(p.name)}</b><em>${esc([p.asm, p.district].filter(Boolean).join(" · "))}</em></span>` })), it => { if (it) { fill(byName(it.value)); } else { $("#dc-ph", v).innerHTML = ""; } });
  pIn.addEventListener("picked", () => cIn.focus());
  const accItems = () => dcAccounts().map(c => { const a = (S.accounts || []).find(x => x.code === c); return { value: c, label: a?.holder || "", sub: a?.bank || "", html: `<span class="sgn"><b><i class="bdot" style="background:${dcBrand(c)}"></i> ${esc(c)}</b><em>${esc([a?.holder, a?.bank].filter(Boolean).join(" · "))}</em></span>` }; });
  const cPick = suggest(cIn, accItems, it => { if (it) cIn.value = it.value; qa(); });
  cIn.addEventListener("picked", () => mIn.focus());
  cIn.addEventListener("keydown", e => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); if (cIn.value.trim()) mIn.focus(); else err("Account লিখুন বা বাছুন"); } });
  aIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); cIn.focus(); } });
  const newBtn = () => { const t = pIn.value.trim(); $("#dc-ph", v).innerHTML = t && !picker.get() && !byName(t) ? `<a href="#" id="dc-new" class="rd">+ "${esc(t.slice(0, 30))}" নতুন পার্টি তৈরি করুন</a>` : ($("#dc-ph", v).innerHTML && picker.get() ? $("#dc-ph", v).innerHTML : ""); const a = $("#dc-new", v); if (a) a.onclick = e => { e.preventDefault(); createParty(t); }; };
  pIn.addEventListener("input", newBtn);
  mIn.addEventListener("input", () => { const n = evalAmt(mIn.value); $("#dc-mh", v).textContent = mIn.value && !isNaN(n) && /[+-]/.test(mIn.value.replace(/^[-+]/, "")) ? "= " + money0(n) : isNaN(n) ? "অঙ্ক ঠিক নেই" : ""; });
  [mIn, rIn].forEach(x => x.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } }));
  $("#dc-add", v).onclick = add;
  const clearForm = () => { err(""); picker.set(null); cPick.set(null); pIn.value = ""; aIn.value = ""; cIn.value = ""; mIn.value = ""; rIn.value = ""; $("#dc-mh", v).textContent = ""; $("#dc-ph", v).innerHTML = ""; pIn.focus(); };
  $("#dc-clear", v).onclick = clearForm;
  function createParty(name) { dpartyModal({ name, asm: aIn.value, account: cIn.value }, saved => { if (!saved) return; parties = DPARTY; picker.set({ value: saved.name, label: saved.asm || "", sub: saved.account || "" }); fill(saved); mIn.focus(); }); }
  async function add() {
    if (!moduleCan("collection", "entry")) return err(writeDenied().message);
    if (busy) return; err("");
    const typed = pIn.value.trim(); let party = picker.get() ? byName(picker.get().value) : byName(typed);
    if (!typed) return err("পার্টি বাছুন"), pIn.focus();
    if (!party) { if (ask(bi(`"${typed}" পার্টি তালিকায় নেই। নতুন পার্টি তৈরি করবেন?`, `"${typed}" is not in the party list. Create a new party?`))) createParty(typed); return; }
    const amount = evalAmt(mIn.value), account = cIn.value.trim(), d = $("#dc-d", v).value;
    if (!d) return err("তারিখ দিন");
    if (!account) return err("Account লিখুন (যেমন DBBL-17)"), cIn.focus();
    if (isNaN(amount) || amount <= 0) return err("টাকার অঙ্ক ঠিক নেই"), mIn.focus();
    if (rows.some(r => r.party_id === party.id && r.amount === amount && r.status !== "cancelled") && !ask("এই তারিখে একই পার্টি, একই টাকা আগেই আছে। আবার যোগ করবেন?")) return;
    busy = true;
    try {
      const r = await API.dcolAdd({ date: d, party_id: party.id, party: party.name, asm: aIn.value.trim(), account, amount, remarks: rIn.value.trim() });
      rows.push(r); toast(bi(`✔ ${party.name} — ৳ ${money0(amount)} যোগ হয়েছে`, `✔ ${party.name} — ৳ ${money0(amount)} added`)); picker.set(null); cPick.set(null); pIn.value = ""; aIn.value = ""; cIn.value = ""; mIn.value = ""; rIn.value = ""; $("#dc-mh", v).textContent = ""; $("#dc-ph", v).innerHTML = ""; qa();
      DCACHE.dcol = null; draw(); pIn.focus();
    } catch (e) { err(dcErr(e)); } finally { busy = false; }
  }
  async function load() {
    date = $("#dc-d", v).value; if (!date) return; sel.clear(); list.innerHTML = `<div class="empty">লোড হচ্ছে…</div>`;
    try { rows = await API.dcolRange(date, date); } catch (e) { rows = []; list.innerHTML = `<div class="alert rd" style="margin:12px">${esc(dcErr(e))}</div>`; if (!isNetErr(e)) return; }
    const ids = new Set(rows.map(r => r.id)); dcPending().filter(r => r.date === date && !ids.has(r.id)).forEach(r => rows.push(r));
    draw();
  }
  let wkKey = "", wkRows = [];
  async function week() {
    const box = $("#dc-wk", v); if (!box) return; const f = addDays(date, -6), key = f + date;
    if (key !== wkKey) { try { wkRows = await API.dcolRange(f, date); wkKey = key; } catch { box.innerHTML = ""; return; } }
    const ds = Array.from({ length: 7 }, (_, i) => addDays(f, i)), live = r => r.status !== "cancelled";
    const byDay = ds.map(d => { const rs = (d === date ? rows : wkRows.filter(r => r.date === d)).filter(live); return { d, amt: dcSum(rs), n: rs.length }; }), mx = Math.max(1, ...byDay.map(x => x.amt)), wt = byDay.reduce((s2, x) => s2 + x.amt, 0);
    box.innerHTML = `<div class="dcx-wkh" title="${bi("Cancelled বাদে, সব Status", "All statuses except Cancelled")}"><span>${bi("শেষ ৭ দিন", "Last 7 days")} · ${bi("বারে চাপলে সেই দিন", "tap a bar to open")}</span><b class="num">৳ ${money0(wt)}</b></div><div class="dcx-wkb">${byDay.map(x => `<button type="button" data-wd="${x.d}" class="${x.d === date ? "on" : ""}${x.amt ? "" : " z"}" title="${dmy(x.d)} · ${x.n} · ৳ ${money0(x.amt)}"><i style="--h:${Math.max(4, x.amt / mx * 100).toFixed(1)}%"></i><small>${new Date(x.d + "T00:00:00").toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", { weekday: "short" })}</small></button>`).join("")}</div>`;
  }
  function visible() { const q = norm(F.q); return rows.filter(r => (!F.st || r.status === F.st) && (!F.ac || r.account === F.ac) && (!q || norm([r.party, r.asm, r.account, r.remarks, r.amount].join(" ")).includes(q))); }
  function selbar() {
    const el = $("#dc-selbar", v); sel = new Set([...sel].filter(id => rows.some(r => r.id === id))); if (!sel.size) return el.classList.add("hide");
    const rs = rows.filter(r => sel.has(r.id)), can = st => rs.some(r => dcCan(r, st));
    el.classList.remove("hide"); el.innerHTML = `<b>${sel.size}</b> <span>টি · ৳ ${money0(dcSum(rs))}</span>${can("approved") ? `<button class="btn sm pri" data-b="approved">${ico("check")} Approve</button>` : ""}${can("cancelled") ? `<button class="btn sm" data-b="cancelled">${ico("xmark")} Cancel</button>` : ""}${can("pending") ? `<button class="btn sm" data-b="pending">Pending</button>` : ""}<button class="btn sm ghost" data-b="x">✕</button>`;
    $$("[data-b]", el).forEach(b => b.onclick = () => { if (b.dataset.b === "x") { sel.clear(); return draw(); } const ids = rs.filter(r => dcCan(r, b.dataset.b)).map(r => r.id); sel.clear(); dcDecide(ids, b.dataset.b, load); });
  }
  function draw() {
    const live = rows.filter(r => r.status !== "cancelled"), by = s => rows.filter(r => r.status === s);
    const stat = (k, cls, ic, lab, arr) => `<button type="button" class="dcx-stat ${cls} ${F.st === k && k ? "on" : ""}" data-k="${k}"><span class="si">${ico(ic)}</span><span class="tx"><small>${lab}</small><b class="num">৳ ${money0(dcSum(arr))}</b><i>${arr.length}টি</i></span></button>`;
    $("#dc-kpi", v).innerHTML = stat("", "t", "wallet", bi("মোট", "Total") + (by("cancelled").length ? bi(` · ${by("cancelled").length} Cancelled বাদে`, ` · excl. ${by("cancelled").length} Cancelled`) : ""), live) + stat("approved", "a", "check", "Approved", by("approved")) + stat("pending", "p", "clock", "Pending", by("pending"));
    $$("#dc-kpi [data-k]", v).forEach(b => b.onclick = () => { F.st = F.st === b.dataset.k ? "" : b.dataset.k; draw(); });
    $("#dc-sc", v).innerHTML = [["", "সব"], ...Object.entries(DC_ST)].map(([k, l]) => `<span class="chip ${F.st === k ? "on" : ""}" data-s="${k}">${k ? `<i class="sdot ${k}"></i>` : ""}${l} <span class="cnt">${k ? by(k).length : rows.length}</span></span>`).join("");
    const acs = dcGroup(live, r => r.account); $("#dc-ac", v).innerHTML = acs.length ? `<span class="mut xs lbl">Account:</span>` + acs.map(a => `<span class="chip ${F.ac === a.k ? "on" : ""}" data-a="${esc(a.k)}"><i class="bdot" style="background:${dcBrand(a.k)}"></i>${esc(a.k)} · ${money0(a.amt)} <span class="mut">(${a.n})</span></span>`).join("") : "";
    $$("#dc-sc [data-s]", v).forEach(c => c.onclick = () => { F.st = c.dataset.s; draw(); }); $$("#dc-ac [data-a]", v).forEach(c => c.onclick = () => { F.ac = F.ac === c.dataset.a ? "" : c.dataset.a; draw(); });
    const vis = visible(); $("#dc-cnt", v).textContent = vis.length;
    const actionable = vis.filter(r => ["approved", "cancelled"].some(s => dcCan(r, s))), gm = dpGeoMap();
    list.innerHTML = vis.length ? `<div class="tw cards"><table><thead><tr><th style="width:34px">${actionable.length ? `<input type="checkbox" id="dc-all" title="সব বাছুন">` : ""}</th><th class="r">#</th><th>পার্টি</th><th>Account</th><th class="r">টাকা</th><th>অবস্থা</th><th>মন্তব্য</th><th class="r noprint">কাজ</th></tr></thead><tbody>${vis.map((r, i) => {
      const acts = [["approved", "check", "gr", "Approve (ঠিক আছে)"], ["cancelled", "xmark", "rd", "Cancel"]].filter(([s]) => dcCan(r, s)).map(([s, ic, c, t]) => `<button class="iconbtn sm cpi ${c}" data-st="${s}" data-id="${r.id}" title="${t}">${ico(ic)}</button>`).join("") + (r.status !== "pending" && dcCan(r, "pending") ? `<button class="iconbtn sm cpi vi" data-st="pending" data-id="${r.id}" title="Pending-এ ফেরত" aria-label="Pending-এ ফেরত">${ico("refresh")}</button>` : "");
      return `<tr class="dcr ${r.status}"><td>${dcCan(r, "approved") || dcCan(r, "cancelled") ? `<input type="checkbox" data-sel="${r.id}" ${sel.has(r.id) ? "checked" : ""}>` : ""}</td><td class="r mut">${i + 1}</td><td><b>${esc(r.party)}</b><div class="mut xs">${esc([r.asm || "—", dpGeoOf(gm, r).district].filter(Boolean).join(" · "))}</div></td><td class="b"><i class="bdot" style="background:${dcBrand(r.account)}"></i>${esc(r.account || "—")}</td><td class="r num b">${money0(r.amount)}</td><td>${dcStTag(r)}${r.decided_by ? `<div class="mut xs">${esc(r.decided_by)}${r.decision_note ? " · " + esc(r.decision_note) : ""}</div>` : ""}</td><td class="sm">${esc(r.remarks)}</td><td class="r noprint"><div class="dcacts">${acts}${dcCanEdit(r) ? `<button class="iconbtn sm cpi am" data-ed="${r.id}" title="এডিট" aria-label="এডিট">${ico("edit")}</button>` : ""}${S.me.role === "admin" && !r.pending_sync ? `<button class="iconbtn sm cpi rd" data-dl="${r.id}" title="মুছুন" aria-label="মুছুন">${ico("trash")}</button>` : ""}</div></td></tr>`;
    }).join("")}<tr class="tot"><td></td><td></td><td colspan="2">${bi("মোট (" + vis.filter(r => r.status !== "cancelled").length + "টি, Cancelled বাদে)", "Total (" + vis.filter(r => r.status !== "cancelled").length + " entries, excl. Cancelled)")}</td><td class="r num">${money0(dcSum(vis.filter(r => r.status !== "cancelled")))}</td><td colspan="3"></td></tr></tbody></table></div>` : `<div class="dcx-empty"><span class="ei">${ico("wallet")}</span><b>${rows.length ? "খোঁজার সাথে কিছু মেলেনি" : "এই তারিখে এখনো কোনো এন্ট্রি নেই"}</b><span class="mut">${rows.length ? "ফিল্টার বা সার্চ বদলে দেখুন" : "উপরের ফর্ম থেকে প্রথম কালেকশনটি যোগ করুন"}</span>${rows.length ? `<button class="btn sm" id="dc-clr">ফিল্টার মুছুন</button>` : ""}</div>`;
    labelTables(list); const cl = $("#dc-clr", list); if (cl) cl.onclick = () => { F.st = ""; F.ac = ""; F.q = ""; $("#dc-q", v).value = ""; draw(); };
    $$("[data-sel]", list).forEach(x => x.onchange = () => { x.checked ? sel.add(x.dataset.sel) : sel.delete(x.dataset.sel); selbar(); });
    const all = $("#dc-all", list); if (all) all.onchange = () => { actionable.forEach(r => all.checked ? sel.add(r.id) : sel.delete(r.id)); $$("[data-sel]", list).forEach(x => x.checked = all.checked); selbar(); };
    $$("[data-st]", list).forEach(b => b.onclick = () => dcDecide([b.dataset.id], b.dataset.st, load));
    $$("[data-ed]", list).forEach(b => b.onclick = () => dcEditModal(rows.find(r => r.id === b.dataset.ed), load));
    $$("[data-dl]", list).forEach(b => b.onclick = async () => { const r = rows.find(x => x.id === b.dataset.dl); if (!ask(bi(`"${r.party}" — ৳ ${money0(r.amount)} মুছে ফেলবেন?`, `Delete "${r.party}" — ৳ ${money0(r.amount)}?`))) return; try { await API.dcolDelete(r.id); DCACHE.dcol = null; toast("✔ মুছে ফেলা হয়েছে"); load(); } catch (e) { toast(dcErr(e), "err"); } });
    selbar(); qa(); week();
  }
  $("#dc-q", v).oninput = e => { F.q = e.target.value; draw(); };
  $("#dc-wk", v).onclick = e => { const b = e.target.closest("[data-wd]"); if (!b || b.dataset.wd === date) return; $("#dc-d", v).value = b.dataset.wd; load(); };
  const onSlash = e => { if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.querySelector(".mback")) { e.preventDefault(); $("#dc-q", v)?.focus(); } };
  document.addEventListener("keydown", onSlash);
  $("#dc-register", v).onclick = () => dcRegisterModal(rows, date);
  bindDateNav(v, "dc", load);
  window.__dcolRefresh = () => { if (CUR === "dcol" && !busy) load(); };
  await load(); if (innerWidth > 800 && moduleCan("collection", "entry")) pIn.focus();
  return () => { window.__dcolRefresh = null; document.removeEventListener("keydown", onSlash); };
}

/* ---------- Collection register: View / Export (Excel · PDF · Image · Print) ---------- */
const dcRegName = date => `Collection_Register_${dmy(date)}`;
function dcRegisterSheet(rows, date) {
  const gm = dpGeoMap(), live = rows.filter(r => r.status !== "cancelled"), by = k => rows.filter(r => r.status === k);
  const kpi = repKpi([[bi("মোট", "Total"), "৳ " + money0(dcSum(live)) + ` · ${live.length}`, "t"], ["Approved", "৳ " + money0(dcSum(by("approved"))) + ` · ${by("approved").length}`, "a"], ["Pending", "৳ " + money0(dcSum(by("pending"))) + ` · ${by("pending").length}`, "p"]]);
  const body = rows.length ? rows.map((r, i) => `<tr class="${r.status}"><td class="n">${i + 1}</td><td><b>${esc(r.party)}</b><div class="mut xs">${esc([r.asm || "—", dpGeoOf(gm, r).district].filter(Boolean).join(" · "))}</div></td><td class="cd"><i class="bdot" style="background:${dcBrand(r.account)}"></i>${esc(r.account || "—")}</td><td class="r num"><b>${money0(r.amount)}</b></td><td>${DC_ST[r.status] || esc(r.status)}</td><td class="rm">${esc(r.remarks || "")}</td></tr>`).join("") : `<tr><td colspan="6" class="z" style="text-align:center">${bi("এই তারিখে কোনো এন্ট্রি নেই", "No entries on this date")}</td></tr>`;
  const tot = `<tr class="tot"><td></td><td colspan="2">${bi(`মোট (${live.length}টি, Cancelled বাদে)`, `Total (${live.length} entries, excl. Cancelled)`)}</td><td class="r num">${money0(dcSum(live))}</td><td colspan="2"></td></tr>`;
  return `<div class="rep dc-register">${dcHead(LANG === "en" ? "Daily Collection Register" : "Daily Collection Register · দৈনিক কালেকশন রেজিস্টার", date, date, "NABIAD DISTRIBUTION")}${kpi}
   <div class="dcs-one"><table class="rep-t dc-reg-table"><thead><tr><th class="r">#</th><th>${bi("পার্টি", "Party")}</th><th>Account</th><th class="r">${bi("টাকা", "Amount")}</th><th>${bi("অবস্থা", "Status")}</th><th>${bi("মন্তব্য", "Remarks")}</th></tr></thead><tbody>${body}${rows.length ? tot : ""}</tbody></table></div>
   <div class="rep-ft cb-reg-foot"><span>${bi("কালেকশন", "Collection")}</span><span>${bi("তারিখ", "Date")}: <b>${dmy(date)}</b> | ${bi("পৃষ্ঠা নং", "Page No.")}: <b class="cb-pg">1</b></span><span>NABIAD Smart Finance Suite</span></div></div>`;
}
async function dcRegisterExcel(rows, date) {
  await loadScript("vendor/xlsx.min.js"); const gm = dpGeoMap(), live = rows.filter(r => r.status !== "cancelled");
  const cells = [["Daily Collection Register", date], [], ["#", "Party", "ASM", "District", "Account", "Amount", "Status", "Remarks"],
    ...rows.map((r, i) => [i + 1, r.party, r.asm || "", dpGeoOf(gm, r).district || "", r.account || "", Number(r.amount) || 0, DC_ST[r.status] || r.status, r.remarks || ""]),
    [], ["", "Total (excl. Cancelled)", "", "", "", dcSum(live), `${live.length} entries`]];
  const ws = XLSX.utils.aoa_to_sheet(cells);
  for (let r = 3; r < rows.length + 3; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 5 })]; if (c?.t === "n") c.z = "#,##0"; }
  const tc = ws[XLSX.utils.encode_cell({ r: rows.length + 4, c: 5 })]; if (tc) tc.z = "#,##0";
  ws["!cols"] = [6, 38, 24, 16, 16, 14, 12, 34].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Collection");
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
async function dcRegisterVisual(el, format) {
  await document.fonts?.ready;
  const stage = document.createElement("div"), paper = el.cloneNode(true);
  stage.className = "cb-export-stage"; stage.setAttribute("aria-hidden", "true"); stage.append(paper); document.body.append(stage);
  try {
    const blobOf = (cv, type) => new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error("render failed")), type, 0.92));
    if (format === "png") return blobOf(await dcCanvas(paper), "image/png");
    const pages = []; let pageNo = 0;
    const capture = async () => { const pg = $(".cb-pg", paper); if (pg) pg.textContent = String(++pageNo); const cv = await dcCanvas(paper); pages.push({ bytes: new Uint8Array(await (await blobOf(cv, "image/jpeg")).arrayBuffer()), width: cv.width, height: cv.height }); };
    const fits = () => { const { width, height } = paper.getBoundingClientRect(); return height <= width * 802 / (555 * 0.90); };
    const body = $(".dc-reg-table", paper).tBodies[0], all = [...body.rows], tot = all.find(r => r.classList.contains("tot")), rows = all.filter(r => r !== tot);
    if (fits()) { await capture(); return cbRegisterPdf(pages); }
    body.replaceChildren(); let n = 0;
    for (const row of rows) { body.append(row); if (n && !fits()) { row.remove(); await capture(); body.replaceChildren(row); n = 1; } else n++; }
    if (tot) { body.append(tot); if (n && !fits()) { tot.remove(); await capture(); body.replaceChildren(tot); } }
    await capture();
    return cbRegisterPdf(pages);
  } finally { stage.remove(); }
}
function dcRegisterModal(rows, date) {
  const name = dcRegName(date), closeLabel = bi("বন্ধ", "Close"), title = bi("কালেকশন রেজিস্টার", "Collection Register");
  const formats = [["xlsx", "table", "Excel"], ["pdf", "list", "PDF"], ["png", "img", bi("ছবি", "Image")]];
  modal(`<h2 aria-label="${title}"><span>${title}</span><button type="button" class="cb-register-close" data-register-close aria-label="${closeLabel}" title="${closeLabel}">${ico("x")}</button></h2>
    <div class="modal-body cb-register-preview">${dcRegisterSheet(rows, date)}</div>
    <div class="modal-actions cb-register-actions">
      ${formats.map(([f, ic, l]) => `<button type="button" class="btn cb-action" data-register-format="${f}">${ico(ic)}<span>${l}</span></button>`).join("")}
      <button type="button" class="btn cb-action" data-register-print>${ico("print")}<span>${bi("প্রিন্ট", "Print")}</span></button>
      <button type="button" class="btn cb-action" data-register-share hidden>${ico("share")}<span>${bi("ফাইল শেয়ার", "Share file")}</span></button>
      <span class="mut sm" data-register-status role="status"></span>
    </div>`, (root, close) => {
    root.querySelector(".modal").classList.add("cb-register-dialog");
    let file = null, loading = false;
    const exports = $$("[data-register-format], [data-register-print]", root), share = $("[data-register-share]", root), status = $("[data-register-status]", root);
    $("[data-register-close]", root).onclick = close;
    $("[data-register-print]", root).onclick = () => printSheet(dcRegisterSheet(rows, date), name, { left: bi("কালেকশন", "Collection"), center: `${bi("তারিখ", "Date")}: ${dmy(date)}  |  ${bi("পৃষ্ঠা নং", "Page No.")}: `, right: "NABIAD Smart Finance Suite" });
    share.onclick = async () => { try { if (file) await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); } };
    $$("[data-register-format]", root).forEach(btn => btn.onclick = async () => {
      if (loading) return; loading = true; exports.forEach(c => { c.disabled = true; }); share.hidden = true; file = null;
      status.textContent = bi("ফাইল তৈরি হচ্ছে…", "Preparing file…");
      try {
        const f = btn.dataset.registerFormat, blob = await (f === "xlsx" ? dcRegisterExcel(rows, date) : dcRegisterVisual($(".dc-register", root), f));
        if (!btn.isConnected) return;
        file = new File([blob], name + "." + f, { type: blob.type }); dlBlob(file, file.name);
        share.hidden = !navigator.canShare?.({ files: [file] }); status.textContent = file.name;
      } catch (e) { status.textContent = e.message; }
      finally { loading = false; exports.forEach(c => { c.disabled = false; }); }
    });
  });
}


/* ---------- Collection insights (v6.159): previous period + clickable insight strip (screen only) ---------- */
const dcPrevRange = (f, t) => {
  const mEnd = d => { const x = new Date(d.slice(0, 7) + "-01T00:00:00"); x.setMonth(x.getMonth() + 1); x.setDate(0); return iso(x); };
  if (f.endsWith("-01") && t === mEnd(f)) { const x = new Date(f + "T00:00:00"); x.setMonth(x.getMonth() - 1); const pf = iso(x); return [pf, mEnd(pf)]; }
  const n = Math.round((new Date(t + "T00:00:00") - new Date(f + "T00:00:00")) / 864e5) + 1, pt = addDays(f, -1); return [addDays(pt, -(n - 1)), pt];
};
const dcLakh = n => n >= 1e7 ? (n / 1e7).toFixed(2) + bi(" কোটি", " Cr") : n >= 1e5 ? (n / 1e5).toFixed(2) + bi(" লাখ", " L") : money0(n);
const dcVcard = (title, sub, body) => `<section class="ir-vc card"><div class="iv-section-head"><div><h3>${title}</h3>${sub ? `<p class="mut sm">${sub}</p>` : ""}</div></div>${body}</section>`;
const dcHbars = (arr, attr, cur, color) => { const mx = Math.max(1, ...arr.map(x => x.amt)); return `<ul class="ir-hb">${arr.map(x => `<li><button type="button" ${attr && x.k !== "—" ? `${attr}="${esc(x.k)}"` : "data-none"} class="${cur === x.k ? "on" : ""}" title="${esc(x.k)} · ${x.n} · ৳ ${money0(x.amt)}"><span class="ir-hl">${color ? `<i class="bdot" style="background:${color(x.k)}"></i>` : ""}${esc(x.k)}</span><i><s style="width:${(x.amt / mx * 100).toFixed(1)}%"></s></i><b class="num">${dcLakh(x.amt)}</b></button></li>`).join("")}</ul>`; };
function dcViz(rows, prev, f, t, o = {}) {
  if (!rows.length) return "";
  const tot = dcSum(rows), pt = dcSum(prev || []), d = pt ? (tot - pt) / pt * 100 : null, big = rows.reduce((a, r) => r.amount > a.amount ? r : a, rows[0]);
  const [pf, pe] = dcPrevRange(f, t), days = f !== t ? dcGroup(rows, r => r.date).sort((a, b) => a.k.localeCompare(b.k)) : [], mxD = Math.max(1, ...days.map(x => x.amt));
  const cmp = dcVcard(bi("এই সময়ের মোট", "Total this period"), prev ? `${bi("আগের সময়", "Previous")}: ${dcRangeLabel(pf, pe)}` : "", `<div class="dcv-big"><b class="num">৳ ${money0(tot)}</b>${d === null ? (prev ? `<span class="dcv-d mut">${bi("আগের সময়ে কিছু নেই", "Nothing in the previous period")}</span>` : "") : `<span class="dcv-d ${d >= 0 ? "up" : "dn"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%</span>`}</div>${prev ? `<p class="mut sm">${bi("আগের সময়ে", "Previous period")} ৳ ${money0(pt)} · ${prev.length} ${bi("টি", "entries")}</p>` : ""}<div class="ir-mini"><span><small class="mut">${bi("এন্ট্রি", "Entries")}</small><b class="num">${rows.length}</b></span><span><small class="mut">${bi("গড়/এন্ট্রি", "Avg / entry")}</small><b class="num">${dcLakh(tot / rows.length)}</b></span><span title="${esc(big.party)}"><small class="mut">${bi("সবচেয়ে বড়", "Largest")}</small><b class="num">${dcLakh(big.amount)}</b></span></div><p class="mut xs dcv-big-p">${bi("সবচেয়ে বড় এন্ট্রি", "Largest entry")}: ${esc(big.party)} · ${dcShort(big.date)}</p>`);
  const trend = days.length > 1 ? dcVcard(bi("দিন অনুযায়ী কালেকশন", "Collection per day"), o.click ? bi("কলামে ক্লিক করলে সেই দিনটা আলাদা দেখাবে", "Click a column to show only that day") : `${days.length} ${bi("দিন", "days")}`, `<div class="ir-cols dcv-cols" style="--n:${days.length}">${days.map(x => `<button type="button" ${o.click ? `data-day="${x.k}"` : ""} class="${o.day === x.k ? "on" : ""}" title="${dmy(x.k)} · ${x.n} · ৳ ${money0(x.amt)}" style="--h:${(x.amt / mxD * 100).toFixed(1)}%"></button>`).join("")}</div><div class="iv-bx"><span>${dcShort(days[0].k)}</span><span>${bi("সেরা দিন", "Best day")}: ${dcShort(days.reduce((a, x) => x.amt > a.amt ? x : a).k)}</span><span>${dcShort(days.at(-1).k)}</span></div>`) : "";
  const acc = dcVcard(bi("শীর্ষ Account", "Top accounts"), o.click ? bi("ক্লিক করলে সেই Account বাছাই হবে", "Click to filter by account") : "", dcHbars(dcGroup(rows, r => r.account || "—").slice(0, 6), o.click ? "data-ac" : "", o.ac, dcBrand));
  const asm = dcVcard(bi("শীর্ষ ASM", "Top ASM"), o.click ? bi("ক্লিক করলে সেই ASM বাছাই হবে", "Click to filter by ASM") : "", dcHbars(dcGroup(rows, r => r.asm || "—").slice(0, 6), o.click ? "data-asm" : "", o.asm));
  const pty = dcVcard(bi("শীর্ষ পার্টি", "Top parties"), o.click ? bi("ক্লিক করলে সেই পার্টি খুঁজবে", "Click to search that party") : "", dcHbars(dcGroup(rows, r => r.party).slice(0, 6), o.click ? "data-pq" : "", o.q));
  return cmp + trend + acc + asm + pty;
}

/* ---------- period bar shared by Summary and Report ---------- */
const dcPeriodBar = pbBar;
const dcEmptyPeriod = msg => `<div class="dcx-empty big"><span class="ei">${ico("chart")}</span><b>${msg}</b><span class="mut">${LANG === "en" ? "Try another period" : "অন্য সময় বেছে দেখুন"}</span><div class="chips" style="justify-content:center">${PB_M().filter(x => x[0] !== "day" && x[0] !== "week").map(([k, l]) => `<span class="chip" data-qp="${k}">${l}</span>`).join("")}</div></div>`;
const dcRange = pbRange, dcBindPeriod = pbBind;
const dcRangeLabel = (f, t) => f === t ? new Date(f + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : `${dmy(f)} → ${dmy(t)}`;
const dcStatLabel = s => ({ approved: "Approved", pending: "Pending", cancelled: "Cancelled", live: bi("All (Cancelled বাদে)", "All (excl. Cancelled)") }[s]);
const dcStatPass = (r, s) => s === "live" ? r.status !== "cancelled" : r.status === s;
const dcStatOpts = cur => ["approved", "pending", "live", "cancelled"].map(s => `<option value="${s}" ${s === cur ? "selected" : ""}>${dcStatLabel(s)}</option>`).join("");
async function dcCanvas(el) { await loadScript("vendor/html2canvas.min.js"); const z = el.style.zoom; el.style.zoom = ""; try { return await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", width: el.offsetWidth, windowWidth: 1200 }); } finally { el.style.zoom = z; } }
async function dcPng(el, name) { if (!el) return toast("ডাটা নেই", "err"); const cv = await dcCanvas(el); const a = document.createElement("a"); a.download = name + ".png"; a.href = cv.toDataURL("image/png"); a.click(); }
async function dcShare(el, name, text) {
  if (!el) return toast("ডাটা নেই", "err"); const cv = await dcCanvas(el), blob = await new Promise(r => cv.toBlob(r, "image/png")), file = new File([blob], name + ".png", { type: "image/png" });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name, text }); else await navigator.share({ title: name, text }); } catch (e) { if (e.name !== "AbortError") toast("শেয়ার করা যায়নি: " + e.message, "err"); }
}
function dcPdf(el, name) { if (!el) return toast("ডাটা নেই", "err"); document.body.classList.add("print-rep"); const t = document.title; document.title = name; window.print(); document.title = t; setTimeout(() => document.body.classList.remove("print-rep"), 500); }
function dcFit(v, id) { const el = $("#" + id, v); if (!el) return; el.style.zoom = ""; const w = el.parentElement.clientWidth - 8; if (w < 794) el.style.zoom = (w / 794).toFixed(3); }
const dcHead = (title, f, t, org = "NABIAD GROUP") => { if (LANG === "en" && title.includes(" · ")) title = title.split(" · ").filter((p, i) => i === 0 || !/[\u0980-\u09FF]/.test(p)).join(" · "); const one = f === t, d = new Date(f + "T00:00:00"); return `<div class="rep-hd"><div class="lg"><img src="icon-192.png" alt=""></div><div class="tt"><b>${org}</b><span>${title}</span></div><div class="dt"><b>${esc(dcRangeLabel(f, t))}</b><span>${one ? d.toLocaleDateString("en-GB", { weekday: "long" }) : ""}</span></div></div>`; };
const dcFoot = (extra = "") => `<div class="rep-ft"><span>Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${extra} · by ${esc(S.me.name)}</span><span>NABIAD Smart Finance Suite</span></div>`;

/* ---------- A4 standard sheet helpers (shared by every report) ---------- */
/* print any A4 sheet html directly (used where the page itself is not a sheet) */
function printSheet(html, name, foot) {
  const w = document.createElement("div"); w.className = "rep-wrap printonly"; w.innerHTML = `<div class="rep-scroll">${html}</div>`;
  document.body.appendChild(w); document.body.classList.add("print-sheet"); const t = document.title; document.title = name;
  let st = null;
  if (foot) { /* per-page footer via @page margin boxes: Cash Book | Date + Page No. | brand */
    const q = s => `"${String(s).replace(/[\\"]/g, "").replace(/\s+/g, " ")}"`;
    st = document.createElement("style");
    st.textContent = `@page{margin:8mm 8mm 16mm;@bottom-left{content:${q(foot.left)};font:600 9px sans-serif;color:#6b7280}@bottom-center{content:${q(foot.center)} counter(page) " / " counter(pages);font:600 9px sans-serif;color:#374151}@bottom-right{content:${q(foot.right)};font:600 9px sans-serif;color:#6b7280}}.print-sheet .cb-reg-foot{display:none!important}`;
    document.head.appendChild(st);
  }
  const done = () => { window.removeEventListener("afterprint", done); w.remove(); st?.remove(); document.body.classList.remove("print-sheet"); document.title = t; };
  window.addEventListener("afterprint", done); window.print();
}
const repKpi = a => `<div class="rep-kpi" style="grid-template-columns:repeat(${a.length},1fr)">${a.map(([l, v, c]) => `<div class="${c || ""}"><span>${l}</span><b>${v}</b></div>`).join("")}</div>`;
const repTwo = (...b) => `<div class="dcs-two">${b.join("")}</div>`;
const repOne = b => `<div class="dcs-one">${b}</div>`;
const repBox = (title, cols, body, foot) => `<div class="dcs-box"><div class="dcs-t">${title}</div><table class="rep-t"><thead><tr>${cols.map((c, i) => `<th class="${i && !c.startsWith("~") ? "r" : ""}">${c.replace(/^~/, "")}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="z" style="text-align:center">কিছু নেই</td></tr>`}${foot || ""}</tbody></table></div>`;
const repSheet = (id, title, f, t, kpi, body, note) => `<div class="rep" id="${id}">${dcHead(title, f, t)}${kpi}${note ? `<div class="dcs-note">${note}</div>` : ""}${body}${dcFoot()}</div>`;
function repLine(series, h = 84) {
  const W = 720, all = series.flatMap(x => x.v); if (!all.length) return `<div class="mut sm">—</div>`;
  const mx = Math.max(...all), mn0 = Math.min(...all), mn = mn0 - (mx - mn0) * 0.08, rg = (mx - mn) || 1, n = Math.max(...series.map(x => x.v.length));
  const pts = vals => vals.map((x, i) => `${(i / Math.max(1, n - 1) * W).toFixed(1)},${(h - 6 - (x - mn) / rg * (h - 14)).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block;background:#fafbff;border:1px solid #eef0f4;border-radius:6px"><line x1="0" x2="${W}" y1="${h - 6}" y2="${h - 6}" stroke="#e5e7eb"/>${series.map(x => `<polyline fill="none" stroke="${x.c}" stroke-width="2" vector-effect="non-scaling-stroke" points="${pts(x.v)}"/>`).join("")}</svg>
   <div class="rep-lg">${series.map(x => `<span><i style="background:${x.c}"></i>${x.n}</span>`).join("")}<span class="mut">max ${money0(mx)} · ${n} days</span></div>`;
}
/* one binder for Screenshot / PDF / Share on a report page: ids are <p>-png, <p>-pdf, <p>-sh */
function repBind(v, p, sheetId, name, text) {
  const el = () => $("#" + sheetId, v);
  $("#" + p + "-png", v) && ($("#" + p + "-png", v).onclick = () => dcPng(el(), name()));
  $("#" + p + "-pdf", v) && ($("#" + p + "-pdf", v).onclick = () => dcPdf(el(), name()));
  $("#" + p + "-sh", v) && ($("#" + p + "-sh", v).onclick = () => dcShare(el(), name(), text ? text() : ""));
  const onRs = () => dcFit(v, sheetId); window.addEventListener("resize", onRs); return () => window.removeEventListener("resize", onRs);
}
const repBtns = p => `<button class="btn" id="${p}-png">${ico("img")} স্ক্রিনশট</button><button class="btn" id="${p}-pdf">${ico("print")} PDF</button>${navigator.share ? `<button class="btn" id="${p}-sh">${ico("share")} শেয়ার</button>` : ""}`;

/* =================== Collection Summary (screenshot) =================== */
async function vDsum(v) {
  const SHK = "nb_dsum_show", SHD = { led: 1, bank: 1, asm: 1, div: 1, dist: 1, day: 1 };
  let show = { ...SHD }; try { show = { ...SHD, ...JSON.parse(localStorage.getItem(SHK) || "{}") }; } catch (e) { }
  const F = { ...pbInit("day"), s: "approved", all: false, lm: "entry" }; let cur = null, all = [];
  const SH = [["led", "Party ledger", "পার্টি লেজার"], ["bank", "Bank", "ব্যাংক"], ["asm", "ASM", "ASM"], ["div", "Division", "বিভাগ"], ["dist", "District", "জেলা"], ["day", "Per day", "দিন অনুযায়ী"]];
  v.innerHTML = head("কালেকশন সামারি", `<button class="btn" id="ds-png">${ico("img")} স্ক্রিনশট</button><button class="btn" id="ds-pdf">${ico("print")} PDF</button>${navigator.share ? `<button class="btn" id="ds-sh">${ico("share")} শেয়ার</button>` : ""}`) + `
   <div class="card tbar noprint dcx-filt fx2">
    <div class="fx2-r">${dcPeriodBar("ds", F)}<div class="fx2-g"><span class="dcx-per" id="ds-per"></span>
     <label class="fx-fld"><span class="fx-k">Status</span><select class="in" id="ds-s" title="${bi("কোন Status ধরব", "Status to include")}">${dcStatOpts(F.s)}</select></label>
     <label class="fx-fld dcx-lm" id="ds-lmw"><span class="fx-k">${bi("লেজার", "Ledger")}</span><select class="in" id="ds-lm"><option value="entry">${bi("এন্ট্রি অনুযায়ী", "Entry-wise")}</option><option value="party">${bi("পার্টি অনুযায়ী মোট", "Party-wise total")}</option></select></label></div></div>
    <div class="fx2-r dcx-tg" id="ds-tg"><span class="fx-lb">${ico("grid")}<span>${bi("সামারিতে দেখাও", "Show in Summary")}</span><em class="fx-n" id="ds-shn"></em></span>${SH.map(([k, en, bn]) => `<label class="keep"><input type="checkbox" data-sh="${k}" ${show[k] ? "checked" : ""}> ${bi(bn, en)}</label>`).join("")}<span class="fx-qa"><button type="button" class="fx-lnk" data-shall="1">${bi("সব", "All")}</button><button type="button" class="fx-lnk" data-shall="0">${bi("কোনোটি না", "None")}</button></span>
     <label class="fx-sw fx-end"><input type="checkbox" id="ds-z"><i class="swt"></i><span>${bi("০ টাকার Account/ASM-ও দেখাও", "Also show accounts/ASM with 0")}</span></label></div></div>
   <p class="iv-desc noprint">${ico("info")}<span>${bi("নিচের শীটটাই Screenshot / PDF / Share হয়। উপরের কার্ডগুলো শুধু স্ক্রিনে — আগের সময়ের সাথে তুলনা, দিনভিত্তিক গতি আর শীর্ষ Account / ASM / পার্টি দেখায়।", "The sheet below is what Screenshot / PDF / Share export. The cards above it are screen-only: comparison with the previous period, the daily trend and the top accounts, ASM and parties.")}</span></p>
   <div class="ir-viz noprint" id="ds-viz"></div>
   <div class="card rep-wrap"><div class="rep-scroll"><div id="ds-out"></div></div></div>`;
  const out = $("#ds-out", v); let prevAll = null;
  async function load() {
    const [f, t] = dcRange(F); out.innerHTML = `<div class="skel" style="height:160px"></div>`;
    const [pf, pt] = dcPrevRange(f, t); prevAll = null;
    try { await dpLoad().catch(() => { }); const pp = API.dcolRange(pf, pt).catch(() => null); all = await API.dcolRange(f, t); prevAll = await pp; } catch (e) { out.innerHTML = `<div class="alert rd">${esc(dcErr(e))}</div>`; cur = null; all = []; $("#ds-viz", v).innerHTML = ""; return; }
    draw();
  }
  function draw() {
    const [f, t] = dcRange(F), rows = all.filter(r => dcStatPass(r, F.s)), tot = dcSum(rows);
    { const vz = $("#ds-viz", v); vz.innerHTML = dcViz(rows, prevAll && prevAll.filter(r => dcStatPass(r, F.s)), f, t); vz.classList.remove("go"); void vz.offsetWidth; vz.classList.add("go"); }
    let banks = dcGroup(rows, r => r.account || "(No account)"), asms = dcGroup(rows, r => r.asm || "(No ASM)");
    if (F.all) { dcAccounts().forEach(a => { if (!banks.some(x => x.k === a)) banks.push({ k: a, n: 0, amt: 0 }); }); dcAsms().forEach(a => { if (!asms.some(x => x.k === a)) asms.push({ k: a, n: 0, amt: 0 }); }); }
    const days = t > f ? dcGroup(rows, r => r.date).sort((a, b) => a.k.localeCompare(b.k)) : [];
    const mx = a => Math.max(1, ...a.map(x => x.amt)), others = all.filter(r => !dcStatPass(r, F.s) && r.status !== "cancelled");
    const gm = dpGeoMap(), divs = dcGroup(rows, r => dpGeoOf(gm, r).division || "(No Division)"), dists = dcGroup(rows, r => dpGeoOf(gm, r).district || "(No District)").slice(0, 25);
    const nothing = `<tr><td colspan="3" class="z" style="text-align:center">${bi("কিছু নেই", "Nothing")}</td></tr>`;
    const tbl = (title, arr, nm) => `<div class="dcs-box"><div class="dcs-t">${title}</div><table class="rep-t"><thead><tr><th>${nm}</th><th class="r">Entry</th><th class="r">Amount</th></tr></thead><tbody>${arr.map(x => `<tr><td class="${nm === "Bank / Account" ? "cd" : "ho"}">${nm === "Bank / Account" ? `<i class="bdot" style="background:${dcBrand(x.k)}"></i>` : ""}${esc(x.k)}</td><td class="r num ${x.n ? "" : "z"}">${x.n || "—"}</td><td class="r num ${x.amt ? "us" : "z"}">${x.amt ? money0(x.amt) : "0"}</td></tr>`).join("") || nothing}<tr class="tot"><td>TOTAL</td><td class="r num">${arr.reduce((s, x) => s + x.n, 0)}</td><td class="r num">${money0(arr.reduce((s, x) => s + x.amt, 0))}</td></tr></tbody></table></div>`;
    /* party ledger */
    let led = "", ledN = 0;
    if (show.led && rows.length) {
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
      if (F.lm === "party") {
        const pg = dcGroup(rows, r => r.party), asmOf = new Map(); rows.forEach(r => { if (!asmOf.has(r.party)) asmOf.set(r.party, r.asm || ""); }); ledN = pg.length;
        led = `<div class="dcs-box dcs-led"><div class="dcs-t">Party Ledger · ${bi("পার্টি অনুযায়ী", "Party-wise")} <span class="dcs-c">${pg.length}</span></div><table class="rep-t"><thead><tr><th class="r">#</th><th>Party</th><th>ASM</th><th class="r">Entry</th><th class="r">Amount</th></tr></thead><tbody>${pg.map((x, i) => `<tr><td class="n">${i + 1}</td><td class="ho">${esc(x.k)}</td><td class="rm">${esc(asmOf.get(x.k) || "")}</td><td class="r num">${x.n}</td><td class="r num us">${money0(x.amt)}</td></tr>`).join("")}<tr class="tot"><td></td><td colspan="2">GRAND TOTAL</td><td class="r num">${rows.length}</td><td class="r num">${money0(tot)}</td></tr></tbody></table></div>`;
      } else {
        const multi = t > f; let n = 0, day = null, ds = 0, dn = 0, body = ""; ledN = sorted.length;
        const flush = () => { if (multi && day) body += `<tr class="dsub"><td></td><td colspan="3">${dcShort(day)} — ${dn}</td><td class="r num">${money0(ds)}</td></tr>`; ds = 0; dn = 0; };
        sorted.forEach(r => { if (multi && r.date !== day) { flush(); day = r.date; } n++; ds += r.amount; dn++; body += `<tr><td class="n">${n}</td><td class="cd">${dcShort(r.date)}</td><td class="ho">${esc(r.party)}${r.remarks ? `<span class="rm"> · ${esc(r.remarks)}</span>` : ""}</td><td class="cd"><i class="bdot" style="background:${dcBrand(r.account)}"></i>${esc(r.account || "—")}</td><td class="r num us">${money0(r.amount)}</td></tr>`; });
        flush();
        led = `<div class="dcs-box dcs-led"><div class="dcs-t">Party Ledger · ${bi("এন্ট্রি অনুযায়ী", "Entry-wise")} <span class="dcs-c">${sorted.length}</span></div><table class="rep-t"><thead><tr><th class="r">#</th><th>TxnDate</th><th>Party</th><th>Bank</th><th class="r">Amount</th></tr></thead><tbody>${body}<tr class="tot"><td></td><td colspan="3">GRAND TOTAL</td><td class="r num">${money0(tot)}</td></tr></tbody></table></div>`;
      }
    }
    const tabs = [show.bank && tbl("Per Bank", banks, "Bank / Account"), show.asm && tbl("Per Salesman / ASM", asms, "Salesman / ASM"), show.div && tbl("Per Division", divs, "Division"), show.dist && tbl(`Per District${dists.length >= 25 ? " (Top 25)" : ""}`, dists, "District")].filter(Boolean);
    const perDay = show.day && days.length ? `<div class="dcs-box dcs-day"><div class="dcs-t">Per Day</div><table class="rep-t"><thead><tr><th>Date</th><th class="r">Entry</th><th class="r">Amount</th><th style="width:50%"></th></tr></thead><tbody>${days.map(x => `<tr><td class="cd">${dcShort(x.k)}</td><td class="r num">${x.n}</td><td class="r num us">${money0(x.amt)}</td><td><div class="dcbar"><i style="width:${(x.amt / mx(days) * 100).toFixed(1)}%"></i></div></td></tr>`).join("")}</tbody></table></div>` : "";
    /* layout: small ledger sits beside the tables, a long one goes below them */
    const side = led && tabs.length && ledN <= 28, grid = tabs.length ? `<div class="dcs-two">${tabs.join("")}</div>` : "";
    const main = side ? `<div class="dcs-main sbs">${led}<div class="dcs-stk">${tabs.join("")}</div></div>` : `${grid}${led ? `<div class="dcs-one">${led}</div>` : ""}`;
    const none = !led && !tabs.length && !perDay ? `<div class="dcs-note">${bi("কিছু দেখানোর জন্য বাছা নেই — উপরে \"সামারিতে দেখাও\" থেকে বাছুন।", "Nothing selected — tick items under \"Show in Summary\" above.")}</div>` : "";
    cur = { f, t, rows, tot, banks, asms };
    $("#ds-lmw", v).style.display = show.led ? "" : "none";
    { const n = $("#ds-shn", v); if (n) n.textContent = SH.filter(([k]) => show[k]).length + "/" + SH.length; }
    out.innerHTML = rows.length || F.all ? `<div class="rep" id="ds-in">${dcHead("Distribution Collection Summary · " + bi("কালেকশন সামারি", "Collection Summary"), f, t, "NABIAD DISTRIBUTION")}
      <div class="rep-kpi" style="grid-template-columns:1.5fr repeat(4,1fr)"><div class="k1"><span>Total ${esc(dcStatLabel(F.s).split(" ")[0])}</span><b>৳ ${money0(tot)}</b></div><div><span>Entries</span><b>${rows.length}</b></div><div><span>Parties</span><b>${new Set(rows.map(r => r.party)).size}</b></div><div class="k3"><span>Accounts</span><b>${banks.filter(b => b.amt).length}</b></div><div class="k3"><span>ASM</span><b>${asms.filter(b => b.amt).length}</b></div></div>
      ${main}${perDay ? `<div class="dcs-one">${perDay}</div>` : ""}${none}
      ${others.length ? `<div class="dcs-note">${bi(`Note: এই সময়ে আরও ${others.length}টি এন্ট্রি (৳ ${money0(dcSum(others))}) অন্য Status-এ আছে — এখানে ধরা হয়নি।`, `Note: ${others.length} more entries (৳ ${money0(dcSum(others))}) in this period have another status and are not counted here.`)}</div>` : ""}${dcFoot()}</div>` : dcEmptyPeriod(bi(`এই সময়ে ${dcStatLabel(F.s)} কোনো কালেকশন নেই`, `No ${dcStatLabel(F.s)} collection in this period`));
    $$("[data-qp]", out).forEach(b => b.onclick = () => $(`#ds [data-m="${b.dataset.qp}"]`, v).click());
    const pe = $("#ds-per", v); if (pe) pe.textContent = f === t ? "" : dcRangeLabel(f, t);
    dcFit(v, "ds-in");
  }
  dcBindPeriod(v, "ds", F, load);
  $("#ds-s", v).onchange = e => { F.s = e.target.value; draw(); }; $("#ds-z", v).onchange = e => { F.all = e.target.checked; draw(); }; $("#ds-lm", v).onchange = e => { F.lm = e.target.value; draw(); };
  $$("[data-shall]", v).forEach(b => b.onclick = () => { const on = b.dataset.shall === "1" ? 1 : 0; SH.forEach(([k]) => { show[k] = on; }); $$("[data-sh]", v).forEach(c => { c.checked = !!on; }); try { localStorage.setItem(SHK, JSON.stringify(show)); } catch (e) { } draw(); });
  $$("[data-sh]", v).forEach(c => c.onchange = () => { show[c.dataset.sh] = c.checked ? 1 : 0; try { localStorage.setItem(SHK, JSON.stringify(show)); } catch (e) { } draw(); });
  const nm = () => `Collection_Summary_${cur ? cur.f + (cur.t !== cur.f ? "_" + cur.t : "") : today()}`;
  $("#ds-png", v).onclick = () => dcPng($("#ds-in", v), nm()); $("#ds-pdf", v).onclick = () => dcPdf($("#ds-in", v), nm());
  $("#ds-sh", v) && ($("#ds-sh", v).onclick = () => dcShare($("#ds-in", v), nm(), cur ? `Collection ${dcRangeLabel(cur.f, cur.t)} — Total ৳ ${money0(cur.tot)}` : ""));
  const onRs = () => dcFit(v, "ds-in"); window.addEventListener("resize", onRs);
  await load(); return () => window.removeEventListener("resize", onRs);
}

/* =================== Collection Report (screenshot / Excel) =================== */
async function vDrep(v) {
  const F = { ...pbInit("day"), s: "approved", asm: "", ac: "", dv: "", ds: "", q: "", ca: false, cd: false, cs: false, sub: true }; let cur = null, all = [];
  v.innerHTML = head("কালেকশন রিপোর্ট", `<button class="btn" id="dr-png">${ico("img")} স্ক্রিনশট</button><button class="btn" id="dr-pdf">${ico("print")} PDF</button><button class="btn" id="dr-xl">${ico("dl")} Excel</button>${navigator.share ? `<button class="btn" id="dr-sh">${ico("share")} শেয়ার</button>` : ""}`) + `
   <div class="card tbar noprint dcx-filt fx2">
    <div class="fx2-r">${dcPeriodBar("dr", F)}<div class="fx2-g"><div class="fx2-q"><input class="in" id="dr-q" type="search" autocomplete="off" aria-label="${bi("পার্টি খুঁজুন", "Search party")}" placeholder="${bi("পার্টি, টাকা, মন্তব্য খুঁজুন…", "Search party, amount…")}"></div></div></div>
    <div class="fx2-r fx2-sels"><label class="fx-fld"><span class="fx-k">Status</span><select class="in" id="dr-s">${dcStatOpts(F.s)}</select></label><div class="fx2-g"><select class="in" id="dr-asm" aria-label="ASM"><option value="">${bi("সব ASM", "All ASM")}</option></select><select class="in" id="dr-ac" aria-label="Account"><option value="">${bi("সব Account", "All accounts")}</option></select><select class="in" id="dr-dv" aria-label="${bi("বিভাগ", "Division")}"><option value="">${bi("সব বিভাগ", "All divisions")}</option></select><select class="in" id="dr-ds" aria-label="${bi("জেলা", "District")}"><option value="">${bi("সব জেলা", "All districts")}</option></select></div>
     <span class="fx-sepv"></span><span class="fx-lb">${bi("কলাম", "Columns")}</span><label class="keep"><input type="checkbox" id="dr-ca"> ASM</label><label class="keep"><input type="checkbox" id="dr-cd"> ${bi("জেলা", "District")}</label><label class="keep"><input type="checkbox" id="dr-cs"> Status</label><label class="keep"><input type="checkbox" id="dr-sub" checked> ${bi("দিনের সাবটোটাল", "Daily subtotal")}</label></div></div>
   <div class="dr-act noprint" id="dr-act"></div>
   <div class="ir-viz noprint" id="dr-viz"></div>
   <div class="card rep-wrap"><div class="rep-scroll"><div id="dr-out"></div></div></div>`;
  let prevAll = null;
  async function load() {
    const [f, t] = dcRange(F), out = $("#dr-out", v); out.innerHTML = `<div class="skel" style="height:160px"></div>`;
    const [pf, pt] = dcPrevRange(f, t); prevAll = null; F.day = "";
    try { await dpLoad().catch(() => { }); const pp = API.dcolRange(pf, pt).catch(() => null); all = await API.dcolRange(f, t); prevAll = await pp; } catch (e) { out.innerHTML = `<div class="alert rd">${esc(dcErr(e))}</div>`; cur = null; $("#dr-viz", v).innerHTML = ""; return; }
    const asmSel = $("#dr-asm", v), acSel = $("#dr-ac", v), a0 = asmSel.value, c0 = acSel.value;
    asmSel.innerHTML = `<option value="">${bi("সব ASM", "All ASM")}</option>` + [...new Set(all.map(r => r.asm).filter(Boolean))].sort().map(a => `<option ${a === a0 ? "selected" : ""}>${esc(a)}</option>`).join("");
    acSel.innerHTML = `<option value="">${bi("সব Account", "All accounts")}</option>` + [...new Set(all.map(r => r.account).filter(Boolean))].sort().map(a => `<option ${a === c0 ? "selected" : ""}>${esc(a)}</option>`).join("");
    F.asm = asmSel.value; F.ac = acSel.value; geoSel(); draw();
  }
  function geoSel() {
    const gm = dpGeoMap(), dvS = $("#dr-dv", v), dsS = $("#dr-ds", v), g = all.map(r => dpGeoOf(gm, r));
    dvS.innerHTML = `<option value="">${bi("সব বিভাগ", "All divisions")}</option>` + [...new Set(g.map(x => x.division).filter(Boolean))].sort().map(a => `<option ${a === F.dv ? "selected" : ""}>${esc(a)}</option>`).join("");
    const ds = [...new Set(g.filter(x => x.district && (!dvS.value || x.division === dvS.value)).map(x => x.district))].sort();
    dsS.innerHTML = `<option value="">${bi("সব জেলা", "All districts")}</option>` + ds.map(a => `<option ${a === F.ds ? "selected" : ""}>${esc(a)}</option>`).join("");
    F.dv = dvS.value; F.ds = dsS.value;
  }
  function draw() {
    const [f, t] = dcRange(F), out = $("#dr-out", v), q = norm(F.q);
    const gm = dpGeoMap(), gOf = r => dpGeoOf(gm, r);
    const base = all.filter(r => dcStatPass(r, F.s)), rows = all.filter(r => dcStatPass(r, F.s) && (!F.day || r.date === F.day) && (!F.asm || r.asm === F.asm) && (!F.ac || r.account === F.ac) && (!F.dv || gOf(r).division === F.dv) && (!F.ds || gOf(r).district === F.ds) && (!q || norm([r.party, r.amount, r.remarks, r.account].join(" ")).includes(q)));
    { const vz = $("#dr-viz", v), sc = vz.scrollLeft; vz.innerHTML = dcViz(rows.length ? rows : base, prevAll && prevAll.filter(r => dcStatPass(r, F.s)), f, t, { click: true, ac: F.ac, asm: F.asm, q: F.q, day: F.day }); vz.scrollLeft = sc; actBar(rows, base); }
    cur = { f, t, rows }; if (!rows.length) { out.innerHTML = dcEmptyPeriod(all.length ? "ফিল্টারের সাথে কোনো এন্ট্রি মেলেনি" : "এই সময়ে কোনো এন্ট্রি নেই"); $$("[data-qp]", out).forEach(b => b.onclick = () => $(`#dr [data-m="${b.dataset.qp}"]`, v).click()); return; }
    const multi = f !== t && F.sub, cols = 4 + (F.ca ? 1 : 0) + (F.cd ? 1 : 0) + (F.cs ? 1 : 0); let n = 0, html = "", day = null, dsum = 0, dn = 0;
    const flush = () => { if (multi && day) html += `<tr class="dsub"><td></td><td colspan="${cols - 2}">${dcShort(day)} — ${dn}টি</td><td class="r num">${money0(dsum)}</td>${F.cs ? "<td></td>" : ""}</tr>`; dsum = 0; dn = 0; };
    rows.forEach(r => { if (multi && r.date !== day) { flush(); day = r.date; } n++; dsum += r.amount; dn++; html += `<tr><td class="n">${n}</td><td class="cd">${dcShort(r.date)}</td><td class="ho">${esc(r.party)}${r.remarks ? `<span class="rm"> · ${esc(r.remarks)}</span>` : ""}</td>${F.ca ? `<td class="rm">${esc(r.asm)}</td>` : ""}${F.cd ? `<td class="rm">${esc(gOf(r).district)}</td>` : ""}<td class="cd"><i class="bdot" style="background:${dcBrand(r.account)}"></i>${esc(r.account)}</td><td class="r num">${money0(r.amount)}</td>${F.cs ? `<td><span class="dst ${r.status}">${DC_ST[r.status]}</span></td>` : ""}</tr>`; });
    flush(); const tot = dcSum(rows);
    out.innerHTML = `<div class="rep" id="dr-in">${dcHead(`Distribution Collection Report · ${esc(dcStatLabel(F.s))}${F.asm ? " · " + esc(F.asm) : ""}${F.ac ? " · " + esc(F.ac) : ""}${F.ds ? " · " + esc(F.ds) : F.dv ? " · " + esc(F.dv) : ""}`, f, t, "NABIAD DISTRIBUTION")}
     <div class="rep-kpi" style="grid-template-columns:repeat(3,1fr)"><div class="k1"><span>Total</span><b>৳ ${money0(tot)}</b></div><div><span>Entries</span><b>${rows.length}</b></div><div class="k3"><span>Parties</span><b>${new Set(rows.map(r => r.party)).size}</b></div></div>
     <table class="rep-t"><thead><tr><th class="r">#</th><th>TxnDate</th><th>Party</th>${F.ca ? "<th>ASM</th>" : ""}${F.cd ? "<th>District</th>" : ""}<th>Bank</th><th class="r">Amount</th>${F.cs ? "<th>Status</th>" : ""}</tr></thead><tbody>${html}<tr class="tot"><td></td><td colspan="${cols - 2}">GRAND TOTAL</td><td class="r num">${money0(tot)}</td>${F.cs ? "<td></td>" : ""}</tr></tbody></table>${dcFoot()}</div>`;
    dcFit(v, "dr-in");
  }
  function actBar(rows, base) {
    const gm = dpGeoMap(), chips = [F.day && ["day", bi("দিন", "Day") + ": " + dmy(F.day)], F.q && ["q", bi("খোঁজ", "Search") + ": “" + F.q + "”"], F.asm && ["asm", "ASM: " + F.asm], F.ac && ["ac", "Account: " + F.ac], F.dv && ["dv", bi("বিভাগ", "Division") + ": " + F.dv], F.ds && ["ds", bi("জেলা", "District") + ": " + F.ds]].filter(Boolean);
    $("#dr-act", v).innerHTML = `<span class="mut sm">${bi(`${base.length}টির মধ্যে ${rows.length}টি এন্ট্রি · ৳ ${money0(dcSum(rows))}`, `Showing ${rows.length} of ${base.length} entries · ৳ ${money0(dcSum(rows))}`)}</span>${chips.map(([k, l]) => `<button type="button" class="chip sm on dr-x" data-x="${k}" title="${bi("সরান", "Remove")}">${esc(l)} ✕</button>`).join("")}${chips.length > 1 ? `<button type="button" class="btn sm" data-x="all">${bi("সব মুছুন", "Clear all")}</button>` : ""}`;
    void gm;
  }
  const setSel = (id, val) => { const el = $("#" + id, v); if (el) el.value = val; };
  $("#dr-act", v).onclick = e => { const b = e.target.closest("[data-x]"); if (!b) return; const k = b.dataset.x; if (k === "all" || k === "day") F.day = ""; if (k === "all" || k === "q") { F.q = ""; setSel("dr-q", ""); } if (k === "all" || k === "asm") { F.asm = ""; setSel("dr-asm", ""); } if (k === "all" || k === "ac") { F.ac = ""; setSel("dr-ac", ""); } if (k === "all" || k === "dv") { F.dv = ""; F.ds = ""; geoSel(); } if (k === "ds") { F.ds = ""; geoSel(); } draw(); };
  $("#dr-viz", v).onclick = e => { let b;
    if ((b = e.target.closest("[data-day]"))) F.day = F.day === b.dataset.day ? "" : b.dataset.day;
    else if ((b = e.target.closest("[data-ac]"))) { F.ac = F.ac === b.dataset.ac ? "" : b.dataset.ac; setSel("dr-ac", F.ac); }
    else if ((b = e.target.closest("[data-asm]"))) { F.asm = F.asm === b.dataset.asm ? "" : b.dataset.asm; setSel("dr-asm", F.asm); }
    else if ((b = e.target.closest("[data-pq]"))) { F.q = F.q === b.dataset.pq ? "" : b.dataset.pq; setSel("dr-q", F.q); }
    else return; draw(); };
  dcBindPeriod(v, "dr", F, load);
  $("#dr-s", v).onchange = e => { F.s = e.target.value; draw(); }; $("#dr-asm", v).onchange = e => { F.asm = e.target.value; draw(); }; $("#dr-ac", v).onchange = e => { F.ac = e.target.value; draw(); };
  $("#dr-dv", v).onchange = e => { F.dv = e.target.value; F.ds = ""; geoSel(); draw(); }; $("#dr-ds", v).onchange = e => { F.ds = e.target.value; draw(); };
  $("#dr-q", v).oninput = e => { F.q = e.target.value; draw(); };
  [["ca", "dr-ca"], ["cd", "dr-cd"], ["cs", "dr-cs"], ["sub", "dr-sub"]].forEach(([k, id]) => $("#" + id, v).onchange = e => { F[k] = e.target.checked; draw(); });
  const nm = () => `Collection_Report_${cur ? cur.f + (cur.t !== cur.f ? "_" + cur.t : "") : today()}`;
  $("#dr-png", v).onclick = () => dcPng($("#dr-in", v), nm()); $("#dr-pdf", v).onclick = () => dcPdf($("#dr-in", v), nm());
  $("#dr-sh", v) && ($("#dr-sh", v).onclick = () => dcShare($("#dr-in", v), nm(), cur?.rows.length ? `Collection ${dcRangeLabel(cur.f, cur.t)} — ${cur.rows.length} entries · ৳ ${money0(dcSum(cur.rows))}` : ""));
  $("#dr-xl", v).onclick = () => cur?.rows.length ? exportXlsx({ Collection: [["TxnDate", "Party", "ASM", "District", "Division", "Bank", "Amount", "Status", "Remarks", "Entered By", "Decided By"], ...cur.rows.map(r => [dmy(r.date), r.party, r.asm, dpGeoOf(dpGeoMap(), r).district, dpGeoOf(dpGeoMap(), r).division, r.account, r.amount, DC_ST[r.status], r.remarks, r.entered_by, r.decided_by || ""])], "By Bank": [["Bank", "Entries", "Amount"], ...dcGroup(cur.rows, r => r.account || "(No account)").map(x => [x.k, x.n, x.amt])], "By ASM": [["ASM", "Entries", "Amount"], ...dcGroup(cur.rows, r => r.asm || "(No ASM)").map(x => [x.k, x.n, x.amt])], "By Division": [["Division", "Entries", "Amount"], ...dcGroup(cur.rows, r => dpGeoOf(dpGeoMap(), r).division || "(No Division)").map(x => [x.k, x.n, x.amt])], "By District": [["District", "Entries", "Amount"], ...dcGroup(cur.rows, r => dpGeoOf(dpGeoMap(), r).district || "(No District)").map(x => [x.k, x.n, x.amt])] }, nm() + ".xlsx") : toast("ডাটা নেই", "err");
  const onRs = () => dcFit(v, "dr-in"); window.addEventListener("resize", onRs);
  await load(); return () => window.removeEventListener("resize", onRs);
}

/* =================== Distribution Party (master list) =================== */
async function vDparty(v) {
  const admin = S.me.role === "admin", canAdd = S.me.role !== "boss"; const F = { q: "", asm: "", dv: "", ds: "", act: "1", lim: 200 }; let list = [];
  v.innerHTML = head("ডিস্ট্রিবিউশন পার্টি", `<button class="btn" id="dp-asm">${ico("users")} ASM তালিকা</button><button class="btn" id="dp-geo">${ico("map")} এলাকা অনুযায়ী</button><button class="btn" id="dp-xl">${ico("dl")} Excel</button>${canAdd ? `<button class="btn pri" id="dp-new">${ico("plus")} নতুন পার্টি</button>` : ""}`) + `<div class="card tbar tb-stack noprint"><div class="dcx-stats s4" id="dp-kpi"></div><div class="row pflt"><div class="pq"><label class="f">খুঁজুন</label><input class="in" id="dp-q" type="search" autocomplete="off" placeholder="পার্টি, ASM, জেলা, ফোন, ঠিকানা…"></div><div><label class="f">ASM</label><select class="in" id="dp-fa"></select></div><div><label class="f">বিভাগ</label><select class="in" id="dp-fv"></select></div><div><label class="f">জেলা</label><select class="in" id="dp-fd"></select></div><div><label class="f">অবস্থা</label><select class="in" id="dp-fs"><option value="1">সক্রিয়</option><option value="0">নিষ্ক্রিয়</option><option value="">সব</option></select></div></div></div>
   <p class="iv-desc noprint">${ico("info")}<span>${bi("উপরের কার্ডে চাপলে যেসব পার্টির ASM বা জেলা বসানো নেই শুধু সেগুলো দেখাবে। “ASM তালিকা” বা “এলাকা অনুযায়ী” থেকে কোনো নাম বা জেলায় চাপলে তালিকা সেটা দিয়ে ফিল্টার হবে।", "Tap a card above to see parties with no ASM or district. In “ASM list” or “By area”, tap a name or district to filter this list by it.")}</span></p>
   <div class="card flush"><div class="ch"><h3>পার্টি তালিকা</h3><span class="tag" id="dp-cnt">0</span><div class="sp"></div><button class="btn sm hide" id="dp-rs">${ico("x")} ${bi("ফিল্টার মুছুন", "Clear filters")}</button></div><div id="dp-out"></div></div>`;
  const out = $("#dp-out", v);
  try { list = await dpLoad(true); } catch (e) { out.innerHTML = `<div class="alert rd" style="margin:12px">${esc(dcErr(e))}</div>`; return; }
  function filters() {
    const fa = $("#dp-fa", v), fv = $("#dp-fv", v), fd = $("#dp-fd", v), a0 = F.asm;
    fa.innerHTML = `<option value="">সব ASM</option><option value="__none" ${a0 === "__none" ? "selected" : ""}>ASM নেই</option>` + dcAsms().map(a => `<option ${a === a0 ? "selected" : ""}>${esc(a)}</option>`).join("");
    fv.innerHTML = `<option value="">সব বিভাগ</option><option value="__none" ${F.dv === "__none" ? "selected" : ""}>বিভাগ নেই</option>` + BD_DIVS.map(a => `<option ${a === F.dv ? "selected" : ""}>${esc(a)}</option>`).join("");
    const ds = [...new Set(list.filter(p => p.district && (!F.dv || F.dv === "__none" || p.division === F.dv)).map(p => p.district))].sort(); if (F.ds && !ds.includes(F.ds) && F.ds !== "__none") F.ds = "";
    fd.innerHTML = `<option value="">সব জেলা</option><option value="__none" ${F.ds === "__none" ? "selected" : ""}>জেলা নেই</option>` + ds.map(a => `<option ${a === F.ds ? "selected" : ""}>${esc(a)}</option>`).join("");
  }
  function draw() {
    list = DPARTY || list; const q = norm(F.q);
    const vis = list.filter(p => (F.act === "" || (F.act === "1") === p.active) && (!F.asm || (F.asm === "__none" ? !p.asm : p.asm === F.asm)) && (!F.dv || (F.dv === "__none" ? !p.division : p.division === F.dv)) && (!F.ds || (F.ds === "__none" ? !p.district : p.district === F.ds)) && (!q || norm([p.name, p.asm, p.district, p.division, p.phone, p.contact_person, p.address, p.note].join(" ")).includes(q)));
    $("#dp-kpi", v).innerHTML = (() => { const tip = bi("ট্যাপ করলে শুধু এগুলো দেখাবে", "Tap to filter"), tile = (cls, ic, lab, val, sub, kf) => `<${kf ? "button type=\"button\"" : "div"} class="dcx-stat ${cls}${kf ? " kclick" : ""}"${kf ? ` data-kf="${kf}" title="${tip}"` : ""}><span class="si">${ico(ic)}</span><span class="tx"><small>${lab}</small><b class="num">${val}</b><i>${sub}</i></span></${kf ? "button" : "div"}>`; return tile("t", "users", bi("মোট পার্টি", "Total parties"), list.length, bi(`সক্রিয় ${list.filter(p => p.active).length}`, `Active ${list.filter(p => p.active).length}`)) + tile("a", "users", "ASM / Salesman", dcAsms().length, bi("জন", "people")) + tile("p", "flag", bi("ASM ঠিক করা নেই", "ASM not set"), list.filter(p => !p.asm).length, bi("পার্টি", "Party"), "asm") + tile("h", "flag", bi("জেলা ঠিক করা নেই", "District not set"), list.filter(p => !p.district).length, bi(`পার্টি · ${new Set(list.map(p => p.district).filter(Boolean)).size}টি জেলায় বাকিরা`, `Party · ${new Set(list.map(p => p.district).filter(Boolean)).size} districts among the rest`), "ds"); })();
    $("#dp-cnt", v).textContent = vis.length;
    $$(".kclick", v).forEach(k => k.onclick = () => { if (k.dataset.kf === "asm") F.asm = "__none"; else { F.ds = "__none"; F.dv = ""; } F.act = ""; $("#dp-fs", v).value = ""; F.lim = 200; filters(); draw(); window.scrollTo({ top: $("#dp-out", v).getBoundingClientRect().top + scrollY - 120, behavior: "smooth" }); });
    $("#dp-rs", v).classList.toggle("hide", !(F.q || F.asm || F.dv || F.ds || F.act !== "1"));
    out.innerHTML = vis.length ? `<div class="tw cards"><table class="ptab"><thead><tr><th class="r">#</th><th>পার্টি</th><th>ASM / Salesman</th><th>জেলা</th><th>বিভাগ</th><th>অবস্থা</th><th class="r noprint"></th></tr></thead><tbody>${vis.slice(0, F.lim).map((p, i) => `<tr class="${p.active ? "" : "dim"}"><td class="r mut">${i + 1}</td><td><b>${typeof ivHl === "function" ? ivHl(p.name, F.q) : esc(p.name)}</b>${[p.contact_person, p.phone].filter(Boolean).length ? `<div class="mut xs">${esc([p.contact_person, p.phone].filter(Boolean).join(" · "))}</div>` : ""}${p.address ? `<div class="mut xs">${esc(p.address)}</div>` : ""}</td><td>${esc(p.asm) || '<span class="am">—</span>'}</td><td>${p.district ? esc(p.district) : '<span class="am">—</span>'}</td><td>${p.division ? esc(p.division) : '<span class="am">—</span>'}</td><td>${p.active ? '<span class="dst approved">সক্রিয়</span>' : '<span class="dst cancelled">নিষ্ক্রিয়</span>'}</td><td class="r noprint pact"><div class="pa"><button class="iconbtn sm" data-lg="${p.id}" title="${bi("খাতা", "Ledger")}" aria-label="${bi("খাতা", "Ledger")}">${ico("ledger")}</button>${admin ? `<button class="iconbtn sm" data-ed="${p.id}" title="${bi("এডিট", "Edit")}" aria-label="${bi("এডিট", "Edit")}">${ico("edit")}</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>${vis.length > F.lim ? `<div style="padding:12px;text-align:center"><button class="btn" id="dp-more">আরও ${Math.min(200, vis.length - F.lim)}টি দেখান (মোট ${vis.length})</button></div>` : ""}` : `<div class="empty">কোনো পার্টি পাওয়া যায়নি</div>`;
    labelTables(out);
    $$("[data-ed]", out).forEach(b => b.onclick = () => dpartyModal(list.find(p => p.id === b.dataset.ed), () => { filters(); draw(); }));
    $$("[data-lg]", out).forEach(b => b.onclick = () => partyLedgerModal(list.find(p => p.id === b.dataset.lg)));
    const mb = $("#dp-more", out); if (mb) mb.onclick = () => { F.lim += 200; draw(); };
  }
  filters(); draw();
  $("#dp-rs", v).onclick = () => { Object.assign(F, { q: "", asm: "", dv: "", ds: "", act: "1", lim: 200 }); $("#dp-q", v).value = ""; $("#dp-fs", v).value = "1"; filters(); draw(); };
  $("#dp-q", v).oninput = e => { F.q = e.target.value; F.lim = 200; draw(); };
  $("#dp-fa", v).onchange = e => { F.asm = e.target.value; F.lim = 200; draw(); }; $("#dp-fv", v).onchange = e => { F.dv = e.target.value; F.ds = ""; F.lim = 200; filters(); draw(); }; $("#dp-fd", v).onchange = e => { F.ds = e.target.value; F.lim = 200; draw(); }; $("#dp-fs", v).onchange = e => { F.act = e.target.value; F.lim = 200; draw(); };
  const nw = $("#dp-new", v); if (nw) nw.onclick = () => dpartyModal({}, () => { filters(); draw(); });
  $("#dp-xl", v).onclick = () => exportXlsx({ Parties: [["Party", "ASM / Salesman", "Contact Person", "Contact No.", "Full Address", "District", "Division", "Active"], ...list.map(p => [p.name, p.asm, p.contact_person, p.phone, p.address, p.district, p.division, p.active ? "Yes" : "No"])] }, `Distribution_Parties_${today()}.xlsx`);
  $("#dp-geo", v).onclick = () => {
    const NO = bi("(বিভাগ নেই)", "(No division)"), dv = dcGroup(list, p => p.division || NO).map(x => ({ ...x, ds: dcGroup(list.filter(p => (p.division || NO) === x.k), p => p.district || "—") })), mx = Math.max(1, ...dv.map(x => x.n)), tot = list.length || 1;
    modal(`<h2>${bi("এলাকা অনুযায়ী পার্টি", "Parties by area")} <span class="tag">${list.length}</span></h2><p class="mut sm iv-mdesc">${bi("বিভাগে চাপলে খুলবে/বন্ধ হবে। জেলার নামে চাপলে শুধু সেই জেলার পার্টি দেখাবে।", "Tap a division to expand it. Tap a district to show only its parties.")}</p>
      <div class="ivd-find"><span class="ivd-find-i" aria-hidden="true">${ico("search")}</span><input class="in" id="gx-q" type="search" autocomplete="off" placeholder="${bi("বিভাগ বা জেলা খুঁজুন…", "Find division or district…")}"></div>
      <div class="gx-list">${dv.map(x => `<details class="gx-dv" ${dv.length <= 3 ? "open" : ""}><summary><span class="gx-n">${esc(x.k)}</span><i class="gx-bar"><s style="width:${(x.n / mx * 100).toFixed(1)}%"></s></i><b class="num">${x.n}</b><em>${Math.round(x.n / tot * 100)}%</em></summary><div class="gx-ds">${x.ds.map(d => `<button type="button" class="gx-d" data-gdv="${esc(x.k === NO ? "__none" : x.k)}" data-gds="${esc(d.k === "—" ? "__none" : d.k)}"><span>${esc(d.k)}</span><i class="gx-bar sm"><s style="width:${(d.n / x.n * 100).toFixed(1)}%"></s></i><b class="num">${d.n}</b></button>`).join("")}</div></details>`).join("")}</div>
      <div class="modal-actions"><button class="btn" id="gx-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
      $(".modal", root).classList.add("iv-modal");
      $("#gx-x", root).onclick = close;
      $("#gx-q", root).oninput = e => { const q = norm(e.target.value); $$(".gx-dv", root).forEach(d => { const dm = norm($(".gx-n", d).textContent).includes(q); let any = false; $$(".gx-d", d).forEach(b => { const ok = !q || dm || norm(b.textContent).includes(q); b.hidden = !ok; any ||= ok; }); d.hidden = !!q && !any; if (q && any) d.open = true; }); };
      $(".gx-list", root).onclick = e => { const b = e.target.closest(".gx-d"); if (!b) return; F.dv = b.dataset.gdv; F.ds = b.dataset.gds; F.act = ""; $("#dp-fs", v).value = ""; F.lim = 200; close(); filters(); draw(); window.scrollTo({ top: $("#dp-out", v).getBoundingClientRect().top + scrollY - 120, behavior: "smooth" }); };
    });
  };
  $("#dp-asm", v).onclick = function openAsm() {
    const canAdd = S.me.role !== "boss";
    const names = new Map(); DASM.forEach(a => names.set(a.name, { ...a, n: 0 })); list.forEach(p => { if (!p.asm) return; const o = names.get(p.asm) || { id: null, name: p.asm, active: true, n: 0 }; o.n++; names.set(p.asm, o); });
    const rows = [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
    modal(`<h2>ASM / Salesman তালিকা</h2><div class="mut sm" style="margin-bottom:8px">${admin ? bi("নাম বদলালে সংশ্লিষ্ট পার্টি আপডেট হবে। আগের কালেকশনে পুরনো নাম থাকবে।", "Renaming updates linked parties. Past collections keep the old name.") : ""}</div>${canAdd ? `<button class="btn pri sm" id="am-add" style="margin-bottom:10px">${ico("plus")} নতুন ASM</button>` : ""}<div class="ivd-find"><span class="ivd-find-i" aria-hidden="true">${ico("search")}</span><input class="in" id="am-q" type="search" autocomplete="off" placeholder="${bi("ASM খুঁজুন…", "Find ASM…")}"></div>
      <div class="iv-cg" id="am-f" style="margin:8px 0">${[["", bi("সব", "All"), rows.length], ["on", bi("সক্রিয়", "Active"), rows.filter(r => r.active).length], ["off", bi("নিষ্ক্রিয়", "Inactive"), rows.filter(r => !r.active).length], ["zero", bi("পার্টি নেই", "No parties"), rows.filter(r => !r.n).length]].map(([k, l, n]) => `<button type="button" class="chip sm${k ? "" : " on"}" data-amf="${k}">${l} <b>${n}</b></button>`).join("")}</div>
      <p class="mut xs" style="margin:0 0 8px">${bi("নামে চাপলে শুধু সেই ASM-এর পার্টি দেখাবে।", "Tap a name to show only that ASM's parties.")}</p>
      <div class="am-list">${rows.map((r, i) => { const mxn = Math.max(1, ...rows.map(x => x.n)); return `<div class="am-it${r.active ? "" : " dim"}" data-amq="${esc(norm(r.name))}" data-amk="${r.active ? "on" : "off"}${r.n ? "" : " zero"}"><button type="button" class="am-nm" data-amgo="${i}" title="${bi("এই ASM-এর পার্টি দেখুন", "Show this ASM's parties")}"><b>${esc(r.name)}</b><span class="am-meta"><i class="gx-bar sm"><s style="width:${(r.n / mxn * 100).toFixed(1)}%"></s></i><span class="num">${r.n} ${bi("পার্টি", r.n === 1 ? "party" : "parties")}</span>${r.active ? `<span class="dst approved">${bi("সক্রিয়", "Active")}</span>` : `<span class="dst cancelled">${bi("নিষ্ক্রিয়", "Inactive")}</span>`}</span></button>${admin ? `<div class="am-act"><button class="iconbtn sm" data-rn="${i}" title="${bi("নাম বদলান", "Rename")}" aria-label="${bi("নাম বদলান", "Rename")}">${ico("edit")}</button>${r.id ? `<button class="iconbtn sm ${r.active ? "" : "gr"}" data-ac="${i}" title="${r.active ? bi("নিষ্ক্রিয় করুন", "Mark inactive") : bi("সক্রিয় করুন", "Mark active")}" aria-label="${r.active ? bi("নিষ্ক্রিয় করুন", "Mark inactive") : bi("সক্রিয় করুন", "Mark active")}">${ico(r.active ? "xmark" : "check")}</button><button class="iconbtn sm rd" data-dl="${i}" title="${bi("মুছুন", "Delete")}" aria-label="${bi("মুছুন", "Delete")}">${ico("trash")}</button>` : ""}</div>` : ""}</div>`; }).join("") || `<div class="empty">${bi("কোনো ASM নেই", "No ASM yet")}</div>`}</div><div class="hint rd" id="am-e"></div><div class="row" style="margin-top:14px"><button class="btn" id="am-x">বন্ধ</button></div>`, (root, close) => {
      $("#am-x", root).onclick = close; const e = m => $("#am-e", root).textContent = m || "";
      $(".modal", root).classList.add("iv-modal");
      let amF = ""; const amFilt = () => { const q = norm($("#am-q", root).value); $$(".am-it", root).forEach(it => { it.hidden = !((!q || it.dataset.amq.includes(q)) && (!amF || it.dataset.amk.split(" ").includes(amF))); }); };
      $("#am-q", root).oninput = amFilt;
      $("#am-f", root).onclick = ev => { const b = ev.target.closest("[data-amf]"); if (!b) return; amF = b.dataset.amf; $$("#am-f .chip", root).forEach(x => x.classList.toggle("on", x === b)); amFilt(); };
      $$("[data-amgo]", root).forEach(b => b.onclick = () => { const r = rows[+b.dataset.amgo]; F.asm = r.name; F.act = ""; $("#dp-fs", v).value = ""; F.lim = 200; close(); filters(); draw(); window.scrollTo({ top: $("#dp-out", v).getBoundingClientRect().top + scrollY - 120, behavior: "smooth" }); });
      const again = async () => { await dpLoad(true); list = DPARTY; filters(); draw(); openAsm(); };
      const add = $("#am-add", root); if (add) add.onclick = () => askText("নতুন ASM / Salesman", "নাম লিখুন (যেমন: Rahim-ASM-Bogura)", "", async n => { if (names.has(n) || [...names.keys()].some(k => norm(k) === norm(n))) throw new Error("এই নামে ASM আগেই আছে"); await API.asmAdd(n); toast("✔ ASM যোগ হয়েছে"); again(); });
      $$("[data-rn]", root).forEach(b => b.onclick = () => { const r = rows[+b.dataset.rn]; askText("ASM-এর নাম বদলান", "নতুন নাম", r.name, async n => { if (n === r.name) return; await API.asmRename(r, n); toast("✔ ASM-এর নাম বদলানো হয়েছে"); again(); }); });
      $$("[data-ac]", root).forEach(b => b.onclick = async () => { const r = rows[+b.dataset.ac]; try { await API.asmActive(r.id, !r.active); toast(r.active ? "✔ নিষ্ক্রিয় করা হয়েছে" : "✔ সক্রিয় করা হয়েছে"); again(); } catch (x) { e(dcErr(x)); } });
      $$("[data-dl]", root).forEach(b => b.onclick = async () => {
        const r = rows[+b.dataset.dl]; e("");
        try {
          const c = await API.asmUsage(r.name);
          if (r.n > 0 || c > 0) return e(bi(`"${r.name}" — ${r.n}টি পার্টি ও ${c}টি কালেকশন রেকর্ডে আছে, মুছা যাবে না। "নিষ্ক্রিয়" করুন।`, `"${r.name}" is used by ${r.n} part${r.n === 1 ? "y" : "ies"} and ${c} collection record(s) — it cannot be deleted. Mark it "Inactive" instead.`));
          if (!ask(bi(`"${r.name}" মুছে ফেলবেন? (কোনো পার্টি বা রেকর্ড নেই)`, `Delete "${r.name}"? (No parties or records)`))) return;
          await API.asmDelete(r.id); toast("✔ মুছে ফেলা হয়েছে"); again();
        } catch (x) { e(dcErr(x)); }
      });
    });
  };
}

/* ---------- auto update: every open app notices a new release within minutes ---------- */
const RUN_V = document.querySelector('script[src^="app.js"]')?.getAttribute("src")?.split("v=")[1] || "";
const pwa = {phase:"checking", pending:null};
function pwaStatus(phase) {
  pwa.phase = phase;
  window.dispatchEvent(new Event("pwa-state"));
}
function verifyOfflineShell(worker, repair) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (ready = false) => { clearTimeout(timer); channel.port1.close(); resolve(ready); };
    const timer = setTimeout(finish, repair ? 12000 : 1800);
    channel.port1.onmessage = ({data}) => finish(data?.version === RUN_V && data.ready === true);
    try { worker.postMessage({type:"nabiad-offline-status", repair}, [channel.port2]); }
    catch { finish(); }
  });
}
function preparePwa(retry = false) {
  if (!navigator.serviceWorker || !window.isSecureContext) return pwaStatus("unsupported");
  if (pwa.pending) return pwa.pending;
  const sw = navigator.serviceWorker;
  pwa.pending = (async () => {
    try {
      pwaStatus("checking");
      const reg = navigator.onLine ? await sw.register("sw.js", {updateViaCache:"none"}) : await sw.getRegistration();
      if (retry && reg && navigator.onLine) await reg.update().catch(() => {});
      const installing = reg?.installing;
      if (installing) installing.addEventListener("statechange", () => {
        if (["activated","redundant"].includes(installing.state)) {
          Promise.resolve(pwa.pending).then(() => preparePwa());
        }
      });
      if (sw.controller && await verifyOfflineShell(sw.controller, retry && navigator.onLine)) return pwaStatus("ready");
      pwaStatus(installing && installing.state !== "redundant" ? "installing" : "unavailable");
    } catch {
      pwaStatus("unavailable");
    }
  })().finally(() => { pwa.pending = null; });
  return pwa.pending;
}
function paintOfflineStatus(target, row) {
  const cached = S.me?.id && readCache()?.u === S.me.id;
  const state = pwa.phase === "ready" && !cached ? "data" : pwa.phase;
  const messages = {
    ready: bi("অ্যাপ ও সর্বশেষ সিঙ্কের ডাটা এই ডিভাইসে প্রস্তুত।","App and last synced data are ready on this device."),
    data: bi("অফলাইন অ্যাপ প্রস্তুত। ডাটা রাখতে অনলাইনে সিঙ্ক করুন।","App cached. Sync online to keep a copy of your data."),
    installing: bi("অফলাইনের জন্য অ্যাপ প্রস্তুত হচ্ছে…","Preparing the app for offline use…"),
    checking: bi("অফলাইন ক্যাশ পরীক্ষা হচ্ছে…","Checking the offline cache…"),
    unsupported: bi("এই ব্রাউজারে HTTPS বা service worker পাওয়া যাচ্ছে না।","HTTPS or service worker support is unavailable in this browser."),
    unavailable: navigator.onLine ? bi("অফলাইন ক্যাশ প্রস্তুত হয়নি। আবার পরীক্ষা করুন।","Offline cache is not ready. Recheck status.")
      : bi("এই ডিভাইসের অফলাইন ক্যাশ যাচাই করতে ইন্টারনেট লাগবে।","Connect to the internet to check this device’s offline cache.")
  };
  target.innerHTML = row(state === "ready",bi("অফলাইন মোড (PWA)","Offline mode (PWA)"),messages[state]);
}
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  Promise.resolve(pwa.pending).then(() => preparePwa());
});
window.addEventListener("online", () => preparePwa());
preparePwa();

let updReady = "", updBusy = false, DIRTY = false;
document.addEventListener("input", e => { if (e.target.closest?.("#view, .modal")) DIRTY = true; }, true);
async function checkUpdate() {
  if (updBusy || updReady || !navigator.onLine || !RUN_V) return; updBusy = true;
  try { const t = await (await fetch("index.html?u=" + Date.now(), { cache: "no-store" })).text(); const m = t.match(/app\.js\?v=([\w.\-]+)/); if (m && m[1] !== RUN_V) onUpdate(m[1]); }
  catch { } finally { updBusy = false; }
}
function onUpdate(v) {
  updReady = v; navigator.serviceWorker?.getRegistration().then(r => r && r.update()).catch(() => { });
  if (document.hidden && !DIRTY && !Outbox.busy) return location.reload();   // nobody is looking and nothing is typed → update silently
  if ($("#updbar")) return;
  const el = document.createElement("div"); el.id = "updbar";
  el.innerHTML = `<span>🚀 <b>নতুন আপডেট এসেছে</b> <span class="mut xs">v${esc(v)}</span></span><button class="btn sm pri" id="upd-go">এখনই আপডেট</button><button class="iconbtn" id="upd-x" title="পরে">✕</button>`;
  document.body.appendChild(el);
  $("#upd-go").onclick = () => { if (DIRTY && !ask(bi("এই পাতায় লেখা কিছু সেভ হয়নি — আপডেট করলে তা হারাতে পারে (ক্লোজিং/ক্যাশের ড্রাফট নিরাপদ থাকবে)। আপডেট করবেন?", "Some of what you typed on this page is not saved — updating may lose it (Closing/Cash drafts stay safe). Update now?"))) return; location.reload(); };
  $("#upd-x").onclick = () => el.remove();
}
setTimeout(checkUpdate, 8000); setInterval(checkUpdate, 3 * 60 * 1000);
window.addEventListener("online", () => setTimeout(checkUpdate, 2000));
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (updReady && !DIRTY && !Outbox.busy) location.reload(); } else checkUpdate(); });

/* ---------- v6.45: Excel cheque import · party ledger ---------- */
const bi = (bn, en) => LANG === "en" ? en : bn;
const VAPID_PUB = "BAu_jln2X-7dGMt7X2w_GeqjYbgieXX1Db-4zBx5ff-U2e2y6951Gdov3pk8v9qTcJTZbybpi4Fi88ldkgGfAl0";
const b64u = s => { const p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
try { navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", e => { const g = e.data && e.data.go; if (g && /^#\//.test(g)) location.hash = g; }); } catch (e) { }
async function readSheetFile(file) { await loadScript("vendor/xlsx.min.js"); const wb = XLSX.read(await file.arrayBuffer(), { type: "array" }); const ws = wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }); }
function toIsoDate(v) {
  if (v === "" || v == null) return "";
  if (typeof v === "number") { if (!Number.isFinite(v) || v < 20000 || v > 80000) return ""; return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); }
  const s = chequeDigits(v); let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:$|[T ]\d)/), y, mo, d;
  if (m) { y = m[1]; mo = +m[2]; d = +m[3]; } else if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})(?:$|[T ]\d)/))) { d = +m[1]; mo = +m[2]; y = m[3].length === 2 ? "20" + m[3] : m[3]; } else return "";
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  return validChequeDate(date) ? date : "";
}
const colOf = (head, names) => { const hs = head.map(chequeSearchKey); for (const n of names) { const i = hs.indexOf(chequeSearchKey(n)); if (i >= 0) return i; } return -1; };
const findAcc = v => { const k = norm(v); if (!k) return null; return S.accounts.find(a => norm(a.code) === k) || S.accounts.find(a => a.acno && norm(a.acno) === k) || null; };
const findPurpose = v => { const k = String(v || "").split(" (")[0].trim().toLowerCase(); if (!k) return null; return allPurposes(true).find(p => p.split(" (")[0].trim().toLowerCase() === k) || null; };

function chequeImportModal(after) {
  const CH = ["Date", "A/C Code", "Cheque No", "Amount", "Purpose", "Cash Taker", "To A/C", "Remarks"];
  modal(`<h2>📥 ${bi("Excel থেকে চেক ইম্পোর্ট", "Import cheques from Excel")}</h2>
    <div class="row"><button class="btn" id="ci-t">${ico("dl")} ${bi("টেমপ্লেট", "Template")}</button><button class="btn pri" type="button" id="ci-pick">${ico("plus")} ${bi("ফাইল বাছুন", "Choose file")}</button><input type="file" id="ci-f" accept=".xlsx,.xls,.csv" hidden></div>
    <div id="ci-out" style="margin-top:12px"></div><p id="ci-msg" class="hint" role="status"></p>
    <div class="modal-actions"><button class="btn pri hide" id="ci-go">${ico("save")} <span id="ci-gl"></span></button><button class="btn" id="ci-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    const file = $("#ci-f", root), out = $("#ci-out", root), pick = $("#ci-pick", root);
    pick.onclick = () => file.click();
    const go = $("#ci-go", root), label = $("#ci-gl", root), message = $("#ci-msg", root);
    let readId = 0;
    $("#ci-x", root).onclick = close;
    $("#ci-t", root).onclick = () => exportXlsx({ Cheques: [CH, [today(), (S.accounts[0] || {}).code || "PBL-483", 1234567, 50000, "Supplier Payment", "", "", "bill 101"], [today(), (S.accounts[0] || {}).code || "PBL-483", 1234568, 0, "Cancelled/Spoiled", "", "", ""]], Notes: [["Purpose must match one of the purposes in the app (see Manage on Cheque Posting). Date: dd-mm-yyyy or yyyy-mm-dd. Cash Taker / To A/C only for cash withdrawal / own transfer rows."]] }, "Cheque_Import_Template.xlsx");
    file.onchange = async () => {
      const f = file.files[0]; file.value = ""; if (!f) return;
      const id = ++readId;
      go.classList.add("hide"); go.onclick = null;
      message.textContent = "";
      out.innerHTML = `<div class="mut">${bi("পড়া হচ্ছে…", "Reading…")}</div>`;
      let aoa;
      try { aoa = await readSheetFile(f); }
      catch (er) {
        if (id === readId && out.isConnected) out.innerHTML = `<div class="alert rd">${esc(er.message || er)}</div>`;
        return;
      }
      if (id !== readId || !out.isConnected) return;
      const hi = aoa.findIndex(r => r.some(c => ["chequeno", "chqno", "chequenumber"].includes(chequeSearchKey(c)))); if (hi < 0) return out.innerHTML = `<div class="alert rd">${bi("হেডার সারি পাওয়া যায়নি। টেমপ্লেটের কলাম নাম ব্যবহার করুন।", "Header row not found. Use the template column names.")}</div>`;
      const H = aoa[hi], c = { d: colOf(H, ["Date", "Cheque Date", "তারিখ"]), a: colOf(H, ["A/C Code", "AC Code", "Code", "Account"]), n: colOf(H, ["Cheque No", "Chq No", "Cheque Number"]), m: colOf(H, ["Amount", "Taka", "টাকা"]), p: colOf(H, ["Purpose", "খাত"]), t: colOf(H, ["Cash Taker", "Taker"]), o: colOf(H, ["To A/C", "To AC"]), r: colOf(H, ["Remarks", "Note", "মন্তব্য"]) };
      if (c.a < 0 || c.n < 0 || c.m < 0 || c.p < 0 || c.d < 0) return out.innerHTML = `<div class="alert rd">${bi("Date, A/C Code, Cheque No, Amount, Purpose কলাম লাগবে", "Columns Date, A/C Code, Cheque No, Amount, Purpose are required")}</div>`;
      const existing = new Set(S.cheques.map(row => `${row.code}|${row.no}`)), seen = new Set(), rows = [];
      aoa.slice(hi + 1).forEach((r, i) => {
        if (r.every(x => x === "")) return; const line = hi + i + 2, errs = [];
        const date = toIsoDate(r[c.d]); if (!date) errs.push(bi("তারিখ ঠিক নয়", "bad date"));
        const acc = findAcc(r[c.a]); if (!acc) errs.push(bi("A/C Code নেই", "unknown A/C"));
        const no = chequeNumber(r[c.n]); if (!no) errs.push(bi("চেক নং ঠিক নয়", "invalid cheque number"));
        const value = chequeDigits(r[c.m]), amount = chequeAmount(value);
        const purpose = findPurpose(r[c.p]); if (!purpose) errs.push(bi("খাত মেলেনি", "purpose not found"));
        const k = purpose ? purposeKey(purpose) : "";
        if (k === "cancel" ? value && amount !== 0 : !(amount > 0)) errs.push(bi("টাকার অঙ্ক ঠিক নয়", "invalid amount"));
        const taker = c.t >= 0 ? String(r[c.t]).trim() : "", toac = c.o >= 0 ? String(r[c.o]).trim() : "", rem = c.r >= 0 ? String(r[c.r]).trim() : "";
        if (k === "cash" && !taker) errs.push(bi("কে তুলেছে লিখুন", "Cash Taker required"));
        let toAcc = null; if (k === "own") { toAcc = findAcc(toac); if (!toAcc) errs.push(bi("To A/C দিন (নিজ অ্যাকাউন্ট)", "To A/C required")); else if (acc && toAcc.code === acc.code) errs.push(bi("From ও To একই", "From = To")); }
        if (acc && no) {
          const key = acc.code + "|" + no;
          if (existing.has(key)) errs.push(bi("আগেই এন্ট্রি আছে", "already exists"));
          else if (seen.has(key)) errs.push(bi("ফাইলে দুইবার", "duplicate in file"));
          if (!errs.length) seen.add(key);
        }
        rows.push({ raw: [r[c.d], r[c.a], r[c.n], r[c.m], r[c.p], taker, toac, rem], line, date, code: acc && acc.code, no, amount: k === "cancel" ? 0 : amount, purpose, taker: k === "cash" ? taker : "", toac: k === "own" && toAcc ? toAcc.code : "", remarks: rem, errs });
      });
      const ok = rows.filter(x => !x.errs.length), bad = rows.length - ok.length;
      out.innerHTML = `<div class="row" style="gap:8px"><span class="tag ok">✓ ${ok.length} ${bi("ঠিক", "valid")}</span><span class="tag ${bad ? "au-delete" : ""}">${bad ? "✗ " + bad : "—"} ${bi("সমস্যা", "problems")}</span>${bad ? `<button class="btn sm" id="ci-eb">${ico("dl")} ${bi("ভুল সারি Excel", "Problem rows")}</button>` : ""}</div>
        <div class="tw" style="max-height:300px;overflow:auto;margin-top:8px"><table><thead><tr><th>#</th><th>${bi("তারিখ", "Date")}</th><th>A/C</th><th>${bi("চেক নং", "Chq no")}</th><th class="r">${bi("টাকা", "Amount")}</th><th>${bi("খাত", "Purpose")}</th><th></th></tr></thead><tbody>${rows.slice(0, 300).map(x => `<tr class="${x.errs.length ? "dim" : ""}"><td class="mut">${x.line}</td><td>${x.date ? dmy(x.date) : "—"}</td><td>${esc(x.code || "—")}</td><td>${x.no || "—"}</td><td class="r num">${Number.isFinite(x.amount) ? money(x.amount) : "—"}</td><td>${esc((x.purpose || "—").split(" (")[0])}</td><td>${x.errs.length ? `<span class="rd xs">${esc(x.errs.join(", "))}</span>` : `<span class="gr">✓</span>`}</td></tr>`).join("")}</tbody></table></div>${rows.length > 300 ? `<div class="mut xs">${bi("প্রথম ৩০০টি দেখানো হয়েছে", "First 300 shown")}</div>` : ""}`;
      go.classList.toggle("hide", !ok.length); label.textContent = bi(`${ok.length}টি ইম্পোর্ট করুন`, `Import ${ok.length}`);
      const problemRows = () => exportXlsx({ Problems: [["Line", ...CH, "Problem"], ...rows.filter(x => x.errs.length).map(x => [x.line, ...x.raw, x.errs.join("; ")])] }, "Cheque_Import_Problems.xlsx");
      if ($("#ci-eb", root)) $("#ci-eb", root).onclick = problemRows;
      go.onclick = async () => {
        if (!ask(bi(`${ok.length}টি চেক পোস্ট করবেন?`, `Post ${ok.length} cheques?`))) return;
        file.disabled = pick.disabled = go.disabled = true;
        let n = 0, fail = 0;
        for (const x of ok) { try { const row = await API.addCheque({ id: crypto.randomUUID(), date: x.date, code: x.code, no: x.no, amount: x.amount, purpose: x.purpose, taker: x.taker, party: "", toac: x.toac, remarks: x.remarks }); S.cheques.push(derive(row)); n++; } catch (er) { fail++; x.errs.push(er.message || "error"); } label.textContent = `${n + fail}/${ok.length}…`; }
        saveCache(); refreshBadges(); after?.();
        file.disabled = pick.disabled = go.disabled = false; go.classList.add("hide");
        message.textContent = bi(`${n}টি পোস্ট হয়েছে${fail ? `, ${fail}টি হয়নি` : ""}।`, `${n} posted${fail ? `, ${fail} failed` : ""}.`);
        if (fail && out.isConnected) {
          if (!$("#ci-eb", out)) out.insertAdjacentHTML("afterbegin", `<button class="btn sm" id="ci-eb">${ico("dl")} ${bi("ভুল সারি Excel", "Problem rows")}</button>`);
          $("#ci-eb", out).onclick = problemRows;
        }
      };
    };
  });
}

function partyLedgerModal(p) {
  let f = today().slice(0, 4) + "-01-01", t = today(), data = [];
  const draw = root => {
    let run = 0; const live = data.filter(r => r.status !== "cancelled");
    const tot = live.reduce((a, r) => a + r.amount, 0), ap = data.filter(r => r.status === "approved").reduce((a, r) => a + r.amount, 0), pe = data.filter(r => r.status === "pending").reduce((a, r) => a + r.amount, 0);
    $("#pl-k", root).innerHTML = `<div class="grid g4" style="gap:8px"><div class="kpi card k-vi"><div class="l">${bi("মোট (বাতিল বাদে)", "Total (excl. cancelled)")}</div><div class="v num">${money(tot)}</div></div><div class="kpi card k-gr"><div class="l">Approved</div><div class="v num">${money(ap)}</div></div><div class="kpi card k-am"><div class="l">Pending</div><div class="v num">${money(pe)}</div></div><div class="kpi card"><div class="l">${bi("এন্ট্রি", "Entries")}</div><div class="v num">${data.length}</div></div></div>`;
    $("#pl-t", root).innerHTML = data.length ? `<div class="tw" style="max-height:48vh;overflow:auto"><table><thead><tr><th>${bi("তারিখ", "Date")}</th><th>Account</th><th>${bi("মন্তব্য", "Remarks")}</th><th>${bi("অবস্থা", "Status")}</th><th class="r">${bi("টাকা", "Amount")}</th><th class="r">${bi("জমা যোগফল", "Running")}</th></tr></thead><tbody>${data.map(r => { if (r.status !== "cancelled") run += r.amount; return `<tr class="${r.status === "cancelled" ? "dim" : ""}"><td>${dmy(r.date)}</td><td>${esc(r.account || "—")}</td><td class="mut">${esc(r.remarks || "")}</td><td><span class="dst ${r.status}">${esc(r.status)}</span></td><td class="r num">${money(r.amount)}</td><td class="r num">${r.status === "cancelled" ? "—" : money(run)}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">${bi("এই সময়ে কোনো কালেকশন নেই", "No collections in this period")}</div>`;
  };
  modal(`<h2>📒 ${bi("পার্টি খাতা", "Party ledger")} — ${esc(p.name)}</h2>
    <div class="mut xs" style="margin-bottom:8px">${esc([p.asm, p.district, p.contact_person, p.phone].filter(Boolean).join(" · "))}</div>
    <div class="row" style="align-items:end"><div><label class="f">${bi("থেকে", "From")}</label><input class="in" type="date" id="pl-f"></div><div><label class="f">${bi("পর্যন্ত", "To")}</label><input class="in" type="date" id="pl-t2"></div><button class="btn" id="pl-all" type="button">${bi("সব সময়", "All time")}</button></div>
    <div id="pl-k" style="margin:12px 0"></div><div id="pl-t"><div class="mut">…</div></div>
    <div class="modal-actions"><button class="btn" id="pl-xl">${ico("dl")} Excel</button><button class="btn" id="pl-pr">${ico("print")} ${bi("প্রিন্ট A4", "Print A4")}</button><button class="btn pri" id="pl-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    const load = async () => { $("#pl-f", root).value = f; $("#pl-t2", root).value = t; try { data = await API.dcolParty(p.id, f, t); } catch (e) { data = []; $("#pl-t", root).innerHTML = `<div class="alert rd">${esc(dcErr(e))}</div>`; return; } draw(root); };
    $("#pl-x", root).onclick = close; $("#pl-f", root).onchange = e => { f = e.target.value || f; load(); }; $("#pl-t2", root).onchange = e => { t = e.target.value || t; load(); };
    $("#pl-all", root).onclick = () => { f = "2000-01-01"; t = today(); load(); };
    $("#pl-xl", root).onclick = () => { let run = 0; exportXlsx({ Ledger: [["Date", "Account", "Remarks", "Status", "Amount", "Running (excl. cancelled)"], ...data.map(r => { if (r.status !== "cancelled") run += r.amount; return [dmy(r.date), r.account, r.remarks, r.status, r.amount, r.status === "cancelled" ? "" : run]; })] }, `Party_Ledger_${norm(p.name).slice(0, 24)}_${today()}.xlsx`); };
    $("#pl-pr", root).onclick = () => { let run = 0; const live = data.filter(r => r.status !== "cancelled"), tot = live.reduce((a, r) => a + r.amount, 0);
      const body = repBox(esc(p.name) + (p.asm ? " · " + esc(p.asm) : ""), ["~" + bi("তারিখ", "Date"), "~Account", "~" + bi("মন্তব্য", "Remarks"), "~" + bi("অবস্থা", "Status"), bi("টাকা", "Amount"), bi("জমা যোগফল", "Running")], data.map(r => { if (r.status !== "cancelled") run += r.amount; return `<tr><td>${dmy(r.date)}</td><td>${esc(r.account || "")}</td><td>${esc(r.remarks || "")}</td><td>${esc(r.status)}</td><td class="r">${money(r.amount)}</td><td class="r">${r.status === "cancelled" ? "—" : money(run)}</td></tr>`; }).join(""), "");
      printSheet(repSheet("pl-sheet", bi("পার্টি খাতা", "Party Ledger"), f, t, repKpi([[bi("মোট", "Total"), money(tot)], ["Approved", money(data.filter(r => r.status === "approved").reduce((a, r) => a + r.amount, 0))], ["Pending", money(data.filter(r => r.status === "pending").reduce((a, r) => a + r.amount, 0))], [bi("এন্ট্রি", "Entries"), data.length]]), body), `Ledger_${p.name}`); };
    load();
  });
}

/* ---------- v6.44 security: auto-lock, 2FA (TOTP), user sessions / activity / email / delete ---------- */
const LOCK_KEY = "nabiad_lock_min", LOCKED_KEY = "nabiad_locked";
const lockMin = () => { let v = null; try { v = localStorage.getItem(LOCK_KEY); } catch { } return v === null ? 15 : +v || 0; };
let lastAct = Date.now(), lockT = null, lockOn = false;
function lockInit() {
  if (lockT) return;
  const bump = () => { if (!lockOn) lastAct = Date.now(); };
  ["pointerdown", "keydown", "touchstart", "wheel", "scroll"].forEach(e => document.addEventListener(e, bump, { passive: true, capture: true }));
  const chk = () => { const m = lockMin(); if (m > 0 && S.me && !lockOn && Date.now() - lastAct > m * 6e4) lockNow(); };
  lockT = setInterval(chk, 15000);
  /* a force-logout from the admin ends the session on the server at once; notice it here and go to the login screen */
  const alive = async () => { if (DEMO || !S.me || !navigator.onLine || document.hidden) return; try { const { error } = await sb.auth.getUser(); if (error && (error.status === 401 || error.status === 403 || /session|jwt/i.test(error.message || ""))) { try { await sb.auth.signOut({ scope: "local" }); } catch { } try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(LOCKED_KEY); } catch { } location.hash = ""; location.reload(); } } catch { } };
  setInterval(alive, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) chk(); });
  document.addEventListener("keydown", e => { if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) { e.preventDefault(); lockNow(); } });
  try { if (localStorage.getItem(LOCKED_KEY) === "1") lockNow(); } catch { }
}
function lockOff() { lockOn = false; lastAct = Date.now(); try { localStorage.removeItem(LOCKED_KEY); } catch { } delete document.documentElement.dataset.lock; $("#lockroot")?.remove(); }
function lockNow() {
  if (!S.me || lockOn) return; lockOn = true; try { localStorage.setItem(LOCKED_KEY, "1"); } catch { }
  document.documentElement.dataset.lock = "1"; $("#modal-root").innerHTML = "";
  const en = LANG === "en"; let el = $("#lockroot"); if (!el) { el = document.createElement("div"); el.id = "lockroot"; document.body.appendChild(el); }
  el.innerHTML = `<div class="lkc card"><div style="display:grid;place-items:center">${avaEl(S.me.id, S.me.name, S.me.email, "xl")}</div><h2>🔒 ${en ? "Locked" : "লক করা আছে"}</h2><div class="mut sm">${esc(S.me.name || "")} · ${esc(S.me.email || "")}</div>
    <div class="mut xs" style="margin:8px 0 14px">${en ? "Locked for your safety. Enter your password to continue." : "নিরাপত্তার জন্য লক হয়েছে। চালিয়ে যেতে পাসওয়ার্ড দিন।"}</div>
    <input class="in big" id="lk-p" type="password" autocomplete="current-password" placeholder="${en ? "Password" : "পাসওয়ার্ড"}"><div class="hint rd" id="lk-e"></div>
    <div class="row" style="margin-top:12px;flex-wrap:nowrap"><button class="btn pri" id="lk-ok" style="flex:1">${en ? "Unlock" : "আনলক"}</button><button class="btn" id="lk-out">${en ? "Sign out" : "লগআউট"}</button></div></div>`;
  const p = $("#lk-p", el); setTimeout(() => p.focus(), 50);
  const go = async () => { const b = $("#lk-ok", el); b.disabled = true; $("#lk-e", el).textContent = ""; try { if (await API.verifyPassword(p.value)) return lockOff(); $("#lk-e", el).textContent = en ? "Wrong password" : "পাসওয়ার্ড ভুল"; p.select(); } catch (e) { $("#lk-e", el).textContent = /too_many/.test(e.message || "") ? userErr(e).message : (!navigator.onLine ? (en ? "No internet — needed to unlock" : "ইন্টারনেট নেই — আনলক করতে নেট লাগবে") : (e.message || "Error")); } b.disabled = false; };
  $("#lk-ok", el).onclick = go; p.onkeydown = e => { if (e.key === "Enter") go(); };
  $("#lk-out", el).onclick = async () => { await API.logout(); try { localStorage.removeItem(CACHE_KEY); } catch { } location.hash = ""; location.reload(); };
}
/* 2FA login gate — shown before any data loads when the account has 2FA and this session is not yet verified */
function mfaGate() {
  return new Promise(async res => {
    const en = LANG === "en"; const f = await API.mfaFactor(); if (!f) return res();
    $("#app").innerHTML = `<div class="login"><div class="card lkc"><div class="logo" style="margin:0 auto 10px"><img src="icon.svg" alt="Nabiad"></div><h2>🔐 ${en ? "Two-step verification" : "টু-স্টেপ ভেরিফিকেশন"}</h2>
      <div class="mut sm" style="margin:6px 0 14px">${en ? "Open your authenticator app and enter the 6-digit code." : "অথেন্টিকেটর অ্যাপ খুলে ৬ অঙ্কের কোডটি দিন।"}</div>
      <input class="in big" id="mf-c" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" style="text-align:center;letter-spacing:.4em;font-size:22px"><div class="hint rd" id="mf-e"></div>
      <div class="row"><button class="btn pri" id="mf-ok" style="flex:1">${en ? "Verify" : "ভেরিফাই"}</button><button class="btn" id="mf-out">${en ? "Sign out" : "লগআউট"}</button></div></div></div>`;
    const c = $("#mf-c"); c.focus();
    const go = async () => { const code = c.value.replace(/\D/g, ""); if (code.length !== 6) return $("#mf-e").textContent = en ? "Enter the 6-digit code" : "৬ অঙ্কের কোড দিন"; const b = $("#mf-ok"); b.disabled = true;
      try { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code }); if (error) throw error; res(); } catch (e) { $("#mf-e").textContent = en ? "Wrong or expired code" : "কোড ভুল বা মেয়াদ শেষ"; c.select(); b.disabled = false; } };
    $("#mf-ok").onclick = go; c.oninput = () => { if (c.value.replace(/\D/g, "").length === 6) go(); }; c.onkeydown = e => { if (e.key === "Enter") go(); };
    $("#mf-out").onclick = async () => { await API.logout(); try { localStorage.removeItem(CACHE_KEY); } catch { } location.hash = ""; location.reload(); };
  });
}
async function mfaEnrollModal(done) {
  const en = LANG === "en";
  let r; try { r = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Nabiad " + Date.now().toString(36) }); if (r.error) throw r.error; } catch (e) { return toast(e.message || String(e), "err"); }
  const d = r.data; let fin = false;
  modal(`<h2>🔐 ${en ? "Turn on 2FA" : "2FA চালু করুন"}</h2>
    <ol class="mut sm" style="margin:0 0 10px 18px;line-height:1.7"><li>${en ? "Install Google Authenticator / Microsoft Authenticator on your phone." : "ফোনে Google Authenticator বা Microsoft Authenticator ইনস্টল করুন।"}</li><li>${en ? "Scan this QR code (or type the key)." : "এই QR কোড স্ক্যান করুন (বা নিচের কী টাইপ করুন)।"}</li><li>${en ? "Enter the 6-digit code it shows." : "অ্যাপে যে ৬ অঙ্কের কোড দেখায় তা নিচে দিন।"}</li></ol>
    <div style="display:grid;place-items:center;margin:8px 0"><img src="${d.totp.qr_code}" alt="QR" style="width:200px;height:200px;background:#fff;border-radius:12px;padding:6px"></div>
    <div class="mono xs" style="text-align:center;word-break:break-all;margin-bottom:10px">${esc(d.totp.secret)}</div>
    <input class="in big" id="mf-c" inputmode="numeric" maxlength="6" placeholder="${en ? "6-digit code" : "৬ অঙ্কের কোড"}" style="text-align:center;letter-spacing:.3em"><div class="hint rd" id="mf-e"></div>
    <div class="modal-actions"><button class="btn pri" id="mf-ok">${ico("save")} ${en ? "Verify & turn on" : "ভেরিফাই করে চালু"}</button><button class="btn" id="mf-x">${en ? "Cancel" : "বাতিল"}</button></div>`, (root, close) => {
    const cancel = async () => { if (!fin) { try { await sb.auth.mfa.unenroll({ factorId: d.id }); } catch { } } close(); };
    $("#mf-x", root).onclick = cancel; $(".mback", root).onmousedown = e => { if (e.target.classList.contains("mback")) cancel(); };
    const go = async () => { const code = $("#mf-c", root).value.replace(/\D/g, ""); if (code.length !== 6) return $("#mf-e", root).textContent = en ? "Enter the 6-digit code" : "৬ অঙ্কের কোড দিন"; const b = $("#mf-ok", root); b.disabled = true;
      try { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: d.id, code }); if (error) throw error; fin = true; close(); toast(en ? "✔ 2FA is on" : "✔ 2FA চালু হয়েছে"); done && done(); } catch (e) { $("#mf-e", root).textContent = en ? "Wrong code — check your phone's clock and try again" : "কোড ভুল — ফোনের সময় ঠিক আছে কি না দেখে আবার দিন"; b.disabled = false; } };
    $("#mf-ok", root).onclick = go; $("#mf-c", root).onkeydown = e => { if (e.key === "Enter") go(); };
  });
}
function sessionDevice(row) {
  const ua = row.user_agent || "";
  const browser = /Edg(?:A|iOS)?\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera"
    : /SamsungBrowser\//.test(ua) ? "Samsung Internet" : /(?:Firefox|FxiOS)\//.test(ua) ? "Firefox"
    : /(?:Chrome|CriOS)\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const model = ua.match(/Android [^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?(?=[;)])/)?.[1]?.trim();
  const device = /Android/.test(ua) ? (model && !/^(?:K|wv|[a-z]{2}(?:-[A-Z]{2})?)$/.test(model) ? model : "Android")
    : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Windows/.test(ua) ? "Windows PC"
    : /CrOS/.test(ua) ? "Chromebook" : /Macintosh|Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const unknown = asUnavailable();
  return `<div class="as-session-device"><b>${esc(device || unknown)}</b>${row.mine ? ` <span class="tag ok">${bi("এই ডিভাইস","This device")}</span>` : ""}
    <dl class="as-session-meta">
      <div><dt>${bi("ব্রাউজার","Browser")}</dt><dd>${esc(browser || unknown)}</dd></div>
      <div><dt>${bi("আইপি ঠিকানা","IP address")}</dt><dd class="mono">${esc(row.ip || unknown)}</dd></div>
      <div><dt>${bi("শেষ ব্যবহার","Last seen")}</dt><dd>${esc(auditStamp(row.last_seen))}</dd></div>
    </dl></div>`;
}
async function userSecModal(u, after) {
  const en = LANG === "en", me = u.id === S.me.id;
  modal(`<h2>🛡 ${en ? "Security" : "সিকিউরিটি"} — ${esc(u.name || u.email)}</h2><div class="card empty">${en ? "Loading…" : "লোড হচ্ছে…"}</div>`);
  let ss = [], act = [], sec = null;
  try { [ss, act, sec] = await Promise.all([API.userSessions(u.id), API.userActivity(u.id), API.userSec().then(a => a.find(x => x.user_id === u.id) || null)]); } catch (e) { return modal(`<h2>🛡</h2><div class="alert rd">${esc(userErr(e).message)}</div><div class="row" style="margin-top:12px"><button class="btn" id="sx">${en ? "Close" : "বন্ধ"}</button></div>`, (r, c) => $("#sx", r).onclick = c); }
  const again = () => { userSecModal(u, after); after && after(); };
  modal(`<h2>🛡 ${en ? "Security" : "সিকিউরিটি"}</h2>
    <div class="uh2">${avaEl(u.id, u.name, u.email)}<div><b>${esc(u.name || "—")}</b><div class="mut xs">${esc(u.email)}</div></div></div>
    <h3 class="sch">${ico("phone")} ${en ? "Signed-in devices" : "লগইন করা ডিভাইস"} (${ss.length})</h3>
    ${ss.length ? ss.map(x => `<div class="scrow">${sessionDevice(x)}<button class="btn sm ghost" data-rs="${x.id}" title="${en ? "Sign this device out" : "এই ডিভাইস লগআউট"}">${en ? "Sign out" : "লগআউট"}</button></div>`).join("") : `<div class="mut sm">${en ? "No active sessions" : "কোনো সক্রিয় সেশন নেই"}</div>`}
    ${ss.length ? `<div class="mut xs" style="margin:6px 0">${en ? "Signing out takes effect immediately — the next request from that device is refused." : "লগআউট সাথে সাথে কার্যকর — ওই ডিভাইসের পরের রিকোয়েস্টই বন্ধ হয়ে যায়।"}</div><button class="btn sm bad" id="rs-all">${en ? "Sign out everywhere" : "সব ডিভাইস থেকে লগআউট"}</button>` : ""}
    <h3 class="sch">${ico("lock")} 2FA</h3>
    <div class="scrow"><div style="flex:1"><b>${sec?.has_2fa ? (en ? "On" : "চালু") : (en ? "Off" : "বন্ধ")}</b><div class="mut xs">${en ? "Each user turns 2FA on from their own Settings. If they lose their phone, reset it here." : "প্রত্যেক ইউজার নিজের সেটিংস থেকে 2FA চালু করেন। ফোন হারালে এখান থেকে রিসেট করুন।"}</div></div>${sec?.has_2fa ? `<button class="btn sm bad" id="r2fa">${en ? "Reset 2FA" : "2FA রিসেট"}</button>` : ""}</div>
    <h3 class="sch">🕘 ${en ? "Recent activity" : "সাম্প্রতিক কাজ"}</h3>
    ${act.length ? `<div class="sc-act">${act.map(r => `<div class="scrow" style="padding:6px 0"><span class="tag au-${r.action}">${esc((AU_A[r.action] || [r.action])[0])}</span><div style="flex:1;min-width:0"><b class="xs">${esc(AU_T[r.tbl] || r.tbl)} · ${esc(r.row_key || "")}</b></div><span class="mut xs">${relTime(r.at)}</span></div>`).join("")}</div>` : `<div class="mut sm">${en ? "No recorded activity" : "কোনো কাজের রেকর্ড নেই"}</div>`}
    <div class="mut xs" style="margin-top:4px">${en ? "Last sign-in" : "শেষ লগইন"}: ${sec?.last_sign_in_at ? new Date(sec.last_sign_in_at).toLocaleString("en-GB") : "—"}</div>
    <h3 class="sch">✉️ ${en ? "Account" : "অ্যাকাউন্ট"}</h3>
    <label class="f">${en ? "Change email (login id)" : "ইমেইল বদল (লগইন আইডি)"}</label><div class="row" style="flex-wrap:nowrap"><input class="in" id="se-e" value="${esc(u.email)}" autocomplete="off"><button class="btn fix" id="se-ok">${en ? "Change" : "বদলান"}</button></div>
    <div class="mut xs">${en ? "The user is signed out everywhere and must sign in with the new email." : "ইউজার সব ডিভাইস থেকে লগআউট হবেন, নতুন ইমেইলে লগইন করতে হবে।"}</div>
    <div class="scrow" style="margin-top:12px"><div style="flex:1"><b class="rd">${en ? "Delete user" : "ইউজার মুছুন"}</b><div class="mut xs">${me ? (en ? "You cannot delete yourself." : "নিজেকে মোছা যায় না।") : u.active ? (en ? "Deactivate the user first (Edit), then delete." : "আগে ইউজারকে নিষ্ক্রিয় করুন (এডিট), তারপর মুছুন।") : (en ? "Permanent. Old entries keep the user's name; the login is gone." : "স্থায়ী। পুরনো এন্ট্রিতে নাম থাকবে; লগইন থাকবে না।")}</div></div><button class="btn sm bad" id="su-del" ${me || u.active ? "disabled" : ""}>${ico("trash")} ${en ? "Delete" : "মুছুন"}</button></div>
    <div class="modal-actions"><button class="btn pri" id="sc-x">${en ? "Close" : "বন্ধ"}</button></div>`, (root, close) => {
    $("#sc-x", root).onclick = close;
    $$("[data-rs]", root).forEach(b => b.onclick = async () => { try { await API.revokeSessions(u.id, b.dataset.rs); toast(en ? "✔ Signed out" : "✔ লগআউট করা হয়েছে"); again(); } catch (e) { toast(userErr(e).message, "err"); } });
    $("#rs-all", root) && ($("#rs-all", root).onclick = async () => { if (!ask(en ? `Sign ${u.name || u.email} out of every device?${me ? "\nThis includes YOUR current device." : ""}` : `${u.name || u.email}-কে সব ডিভাইস থেকে লগআউট করবেন?${me ? "\nআপনার এই ডিভাইসও লগআউট হবে।" : ""}`)) return; try { await API.revokeSessions(u.id); toast(en ? "✔ Signed out everywhere" : "✔ সব ডিভাইস থেকে লগআউট"); if (me) return location.reload(); again(); } catch (e) { toast(userErr(e).message, "err"); } });
    $("#r2fa", root) && ($("#r2fa", root).onclick = async () => { if (!ask(en ? "Remove this user's 2FA? They will be signed out and can set it up again." : "এই ইউজারের 2FA সরিয়ে দেবেন? তিনি লগআউট হবেন এবং আবার সেটআপ করতে পারবেন।")) return; try { await API.reset2fa(u.id); toast(en ? "✔ 2FA reset" : "✔ 2FA রিসেট হয়েছে"); again(); } catch (e) { toast(userErr(e).message, "err"); } });
    $("#se-ok", root).onclick = async () => { const e = $("#se-e", root).value.trim().toLowerCase(); if (!e || e === u.email) return; if (!ask(en ? `Change login email to ${e}?` : `লগইন ইমেইল বদলে ${e} করবেন?`)) return; try { await API.setUserEmail(u.id, e); u.email = e; toast(en ? "✔ Email changed" : "✔ ইমেইল বদলেছে"); again(); } catch (er) { toast(userErr(er).message, "err"); } };
    $("#su-del", root).onclick = async () => { if (!ask(en ? `PERMANENTLY delete ${u.name || u.email}? This cannot be undone.` : `${u.name || u.email}-কে স্থায়ীভাবে মুছে ফেলবেন? এটা ফেরানো যাবে না।`)) return; try { await API.deleteUser(u.id); close(); toast(en ? "✔ User deleted" : "✔ ইউজার মোছা হয়েছে"); after && after(); } catch (er) { toast(userErr(er).message, "err"); } };
  });
}

/* admin/boss must have 2FA: a full-page gate that cannot be dismissed (sign out is the only other way out).
   Fails open if the enrolment API itself is unavailable, so a Supabase hiccup never locks the owner out of the app. */
function mfaForceEnroll() {
  return new Promise(async res => {
    const en = LANG === "en";
    let d;
    try {
      const all = (await sb.auth.mfa.listFactors()).data?.all || [];
      for (const f of all) if (f.factor_type === "totp" && f.status !== "verified") { try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch { } }
      const r = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Nabiad " + Date.now().toString(36) }); if (r.error) throw r.error; d = r.data;
    } catch (e) { console.warn("mfa enroll", e); toast(bi("2FA চালু করা যায়নি — পরে সেটিংস থেকে চালু করুন", "Could not start 2FA setup — turn it on later in Settings"), "err"); return res(); }
    $("#app").innerHTML = `<div class="login"><div class="card lkc"><div class="logo" style="margin:0 auto 10px"><img src="icon.svg" alt="Nabiad"></div><h2>🔐 ${en ? "2FA is required for your role" : "আপনার রোলের জন্য 2FA বাধ্যতামূলক"}</h2>
      <ol class="mut sm" style="margin:8px 0 10px 18px;line-height:1.7;text-align:left"><li>${en ? "Install Google Authenticator or Microsoft Authenticator on your phone." : "ফোনে Google Authenticator বা Microsoft Authenticator ইনস্টল করুন।"}</li><li>${en ? "Scan this QR code (or type the key)." : "এই QR কোড স্ক্যান করুন (বা নিচের কী টাইপ করুন)।"}</li><li>${en ? "Enter the 6-digit code it shows." : "অ্যাপে যে ৬ অঙ্কের কোড দেখাবে সেটি দিন।"}</li></ol>
      <div style="display:grid;place-items:center;margin:8px 0"><img src="${esc(d.totp.qr_code)}" alt="QR" style="width:200px;height:200px;background:#fff;border-radius:12px;padding:6px"></div>
      <div class="mono xs" style="text-align:center;word-break:break-all;margin-bottom:10px">${esc(d.totp.secret)}</div>
      <input class="in big" id="mf-c" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${en ? "6-digit code" : "৬ অঙ্কের কোড"}" style="text-align:center;letter-spacing:.4em;font-size:22px"><div class="hint rd" id="mf-e"></div>
      <div class="row"><button class="btn pri" id="mf-ok" style="flex:1">${en ? "Verify" : "ভেরিফাই"}</button><button class="btn" id="mf-out">${en ? "Sign out" : "লগআউট"}</button></div></div></div>`;
    const c = $("#mf-c"); c.focus();
    const go = async () => { const code = c.value.replace(/\D/g, ""); if (code.length !== 6) return $("#mf-e").textContent = en ? "Enter the 6-digit code" : "৬ অঙ্কের কোড দিন"; const b = $("#mf-ok"); b.disabled = true;
      try { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: d.id, code }); if (error) throw error; toast(en ? "✔ 2FA is on" : "✔ 2FA চালু হয়েছে"); res(); } catch (e) { $("#mf-e").textContent = en ? "Wrong code — check your phone's clock and try again" : "কোড ভুল — ফোনের সময় ঠিক আছে কি না দেখুন"; c.select(); b.disabled = false; } };
    $("#mf-ok").onclick = go; c.oninput = () => { if (c.value.replace(/\D/g, "").length === 6) go(); }; c.onkeydown = e => { if (e.key === "Enter") go(); };
    $("#mf-out").onclick = async () => { await API.logout(); try { localStorage.removeItem(CACHE_KEY); } catch { } location.hash = ""; location.reload(); };
  });
}
/* ---------- boot ---------- */
let inited = false;
function onLangChange() { if (S.me && $("#view")) { shell(); route(); } else if (!S.me) loginView(LANG); }
async function boot() {
  try {
    if (!inited) { startI18n(); await API.init(); inited = true; }
    if (!S.me) S.me = await API.session();
    if (!S.me) return loginView();
    if (!DEMO && navigator.onLine) { try { if (await API.mfaNeeded()) await mfaGate(); } catch (e) { console.warn("mfa", e); } }
    if (!DEMO && navigator.onLine && ["admin", "boss"].includes(S.me.role)) { try { if (!(await API.mfaFactor())) await mfaForceEnroll(); } catch (e) { console.warn("mfa force", e); } }
    lockInit();
    loadAvatars();
    let mo = null;
    const start = () => { if (!location.hash && PREFS.start && PREFS.start !== "dash" && allowed().includes(PREFS.start)) location.replace("#/" + PREFS.start); shell(); route(); setTimeout(remTick, 1500); if (!mo) { let q = 0; mo = new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; labelTables(document); }); }); mo.observe(document.body, { childList: true, subtree: true }); } };
    if (loadCache()) { start(); if (!navigator.onLine) return; reload().then(() => { refreshBadges(); const k = (location.hash.match(/^#\/(\w+)/) || [])[1] || "dash"; if (["dash", "cheques", "books", "accounts"].includes(k) && !document.querySelector(".mback,.pal") && !document.activeElement?.matches("input,select,textarea")) route(); }).catch(e => { if (!isNetErr(e)) toast(bi("রিফ্রেশ ব্যর্থ: ", "Refresh failed: ") + (e.message || e), "err"); }); Outbox.flush(); }
    else { $("#app").innerHTML = `<div class="boot"><div><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div class="mut">ডাটা লোড হচ্ছে…</div></div></div>`; await reload(); start(); Outbox.flush(); }
  } catch (e) { console.error(e); $("#app").innerHTML = `<div class="login"><div class="card"><div class="alert rd">${bi("শুরু করা যায়নি: ", "Could not start: ")}${esc(e.message || e)}</div><p class="mut sm">${bi("config.js এ Supabase URL ও key ঠিক আছে কি না এবং schema.sql চালানো হয়েছে কি না দেখুন।", "Check that the Supabase URL and key in config.js are correct and that schema.sql has been run.")}</p></div></div>`; }
}
window.addEventListener("hashchange", route);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
