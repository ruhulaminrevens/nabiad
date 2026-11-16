/* Nabiad — Cheque & Bank Control  (single-page app, no build step) */
"use strict";
const CFG = window.NABIAD_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL;
const STATUSES = ["Pending","Cleared","Bounced","Returned-Cash","Cancelled","Stopped"];
const PURPOSES = ["Cash Withdrawal (ক্যাশ উত্তোলন)","Own A/C Transfer (নিজ অ্যাকাউন্টে জমা)","Supplier Payment (সাপ্লায়ার পেমেন্ট)","Rent (ভাড়া)","Loan/EMI (লোন কিস্তি)","Inter-company (সহযোগী প্রতিষ্ঠান)","Zakat/Donation (যাকাত/দান)","Cancelled/Spoiled (বাতিল/নষ্ট পাতা)"];
/* v6.24 — user-added purposes (shared in DB table cheque_purposes, cached per device) */
let PURP_X = []; try { PURP_X = JSON.parse(localStorage.getItem("nb_purp_v2") || "[]"); } catch (e) {}
const allPurposes = (withUsed) => { const l = [...(PURP_X.length ? PURP_X : PURPOSES)]; if (withUsed) (S.cheques || []).forEach(c => { if (c.purpose && !l.includes(c.purpose)) l.push(c.purpose); }); return l; };
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
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const purposeKey = p => { const s = String(p || "").toLowerCase(); return s.startsWith("cash") ? "cash" : s.startsWith("own") ? "own" : s.startsWith("cancel") ? "cancel" : s.startsWith("supplier") ? "supplier" : "other"; };
function toast(msg, kind = "ok") { const t = document.createElement("div"); t.className = "toast " + kind; t.innerHTML = `<i>${kind === "err" ? "!" : "✓"}</i><span></span>`; t.lastChild.textContent = tr(String(msg)).replace(/^✔\s*/, ""); $("#toasts").appendChild(t); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, kind === "err" ? 6000 : 2800); }
const ask = m => confirm(tr(m));
function modal(html, onMount) {
  const root = $("#modal-root"); root.innerHTML = `<div class="mback"><div class="modal">${html}</div></div>`;
  const close = () => root.innerHTML = "";
  $(".mback", root).addEventListener("mousedown", e => { if (e.target.classList.contains("mback")) close(); });
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
function pwField(id, val = "") { const en = LANG === "en"; return `<div class="pwf"><input class="in" id="${id}" type="text" autocomplete="off" spellcheck="false" value="${esc(val)}" placeholder="${en ? "At least 10 characters" : "কমপক্ষে ১০ অক্ষর"}"><button type="button" class="btn sm" data-gen="${id}" title="${en ? "Generate a strong password" : "শক্তিশালী পাসওয়ার্ড বানান"}">🎲 ${en ? "Generate" : "জেনারেট"}</button><button type="button" class="btn sm" data-cp="${id}" title="${en ? "Copy" : "কপি"}">${ico("copy")}</button></div>`; }
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
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="nu-x">${en ? "Cancel" : "বাতিল"}</button><button class="btn pri" id="nu-ok">${ico("save")} ${en ? "Create user" : "তৈরি করুন"}</button></div>`, (root, close) => {
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
    <div class="row" style="justify-content:flex-end"><button class="btn pri" id="cr-cp">${ico("copy")} ${en ? "Copy details" : "সব কপি করুন"}</button><button class="btn" id="cr-x">${en ? "Done" : "হয়েছে"}</button></div>`, (root, close) => { $("#cr-cp", root).onclick = () => copyText(txt, en ? "Details copied" : "তথ্য কপি হয়েছে"); $("#cr-x", root).onclick = close; });
}
function editUserModal(u, after) {
  const en = LANG === "en", me = u.id === S.me.id, st = { av: undefined };
  const cur = () => st.av === undefined ? avaMap()[u.id] : st.av;
  modal(`<h2>✏️ ${en ? "Edit user" : "ব্যবহারকারী এডিট"}</h2>
    <div class="pfp"><div class="ava xl" id="eu-av"></div><div class="pfb"><b style="word-break:break-all">${esc(u.email)}</b>${me ? `<div class="mut xs">${en ? "This is you" : "এটা আপনি"}</div>` : ""}<div class="row" style="margin-top:8px"><button class="btn sm pri fix" id="eu-up" type="button">${ico("cam")} ${en ? "Photo" : "ছবি"}</button><button class="btn sm fix" id="eu-rm" type="button">${ico("trash")} ${en ? "Remove" : "মুছুন"}</button><input type="file" id="eu-f" accept="image/*" hidden></div></div></div>
    <div class="ug2" style="margin-top:14px"><div><label class="f">${en ? "Name" : "নাম"}</label><input class="in" id="eu-n" value="${esc(u.name || "")}" autocomplete="off"></div>
    <div><label class="f">Role</label><div class="seg rl" id="eu-r" style="display:flex;width:100%">${[["admin", "Admin"], ["staff", "Staff"], ["boss", "Boss"]].map(([r, l]) => `<span class="chip ${r === u.role ? "on" : ""}" data-r="${r}" style="flex:1;text-align:center">${l}</span>`).join("")}</div></div>
    <div class="euac" id="eu-edw" style="display:${u.role === "staff" ? "" : "none"}"><div style="flex:1"><b>${en ? "Edit window (own entries)" : "নিজের এন্ট্রি এডিটের সময়"}</b><div class="mut xs">${en ? "Lets this staff edit cheque entries they posted, for up to N days after posting. Staff can never delete anything." : "এই staff নিজের পোস্ট করা চেক এন্ট্রি পোস্টের পর সর্বোচ্চ N দিন এডিট করতে পারবেন। কোনো staff কখনোই কিছু মুছতে পারেন না।"}</div></div><select class="in" id="eu-ed" style="width:auto">${[0, 1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}" ${(u.edit_days || 0) === d ? "selected" : ""}>${d === 0 ? (en ? "OFF" : "বন্ধ") : d + (en ? " day" : " দিন")}</option>`).join("")}</select></div>
    <div class="euac"><div><b>${en ? "Active" : "সক্রিয়"}</b><div class="mut xs">${en ? "Inactive users cannot sign in or see any data." : "নিষ্ক্রিয় ইউজার লগইন করতে বা কোনো ডাটা দেখতে পারেন না।"}</div></div><label class="sw"><input type="checkbox" id="eu-ac" ${u.active ? "checked" : ""}><i></i></label></div></div>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" id="eu-x" type="button">${en ? "Cancel" : "বাতিল"}</button><button class="btn pri" id="eu-ok" type="button">${ico("save")} ${en ? "Save changes" : "সেভ করুন"}</button></div>`, (root, close) => {
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
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="rp-x">${en ? "Cancel" : "বাতিল"}</button><button class="btn pri" id="rp-ok">${ico("save")} ${en ? "Set password" : "পাসওয়ার্ড সেট করুন"}</button></div>`, (root, close) => {
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
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
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
  copyt: '<path d="M8 4h8M8 4a2 2 0 0 0-2 2v14h12V6a2 2 0 0 0-2-2M9 10h6M9 14h6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  ledger: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  recon: '<path d="M4 8h13l-3-3M20 16H7l3 3"/><circle cx="12" cy="12" r="1"/>',
  coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  pie: '<path d="M12 3v9h9a9 9 0 1 1-9-9z"/><path d="M16 3.5A9 9 0 0 1 20.5 8H16z"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  sliders: '<path d="M4 6h10M20 6h0M4 12h4M14 12h6M4 18h11M20 18h0"/><circle cx="17" cy="6" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'
};
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

/* ---------- state ---------- */
const S = { me: null, accounts: [], cheques: [], books: [], reminders: [], loaded: false, lastBal: null };
const accMap = () => Object.fromEntries(S.accounts.map(a => [a.code, a]));
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
async function fetchAll(table, order = "id") {
  let out = [], from = 0; const step = 1000;
  for (;;) {
    const { data, error } = await sb.from(table).select("*").order(order).range(from, from + step - 1);
    if (error) throw error; out = out.concat(data); if (data.length < step) break; from += step;
  }
  return out;
}
const SbAPI = {
  async init() { await loadScript("vendor/supabase.js"); sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); },
  async session() {
    const { data } = await sb.auth.getSession(); const u = data.session?.user;
    if (!u) { const c = readCache(); if (!navigator.onLine && c?.me) return c.me; return null; }
    const { data: p, error } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
    if (error && isNetErr(error)) { const c = readCache(); if (c?.me?.id === u.id) return c.me; }
    if (error || !p || !p.active) return null; return { id: u.id, email: p.email, name: p.name, role: p.role, edit_days: p.edit_days || 0 };
  },
  async login(email, pw) { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return this.session(); },
  async logout() { try { localStorage.removeItem("nabiad_locked"); } catch { } await sb.auth.signOut(); },
  async loadAll() {
    const [acc, ch, ev, bk] = await Promise.all([fetchAll("accounts", "sort"), fetchAll("cheques", "created_at"), fetchAll("cheque_status", "created_at"), fetchAll("books", "code")]);
    const by = {}; ev.forEach(e => (by[e.cheque_id] ||= []).push({ id: e.id, status: e.new_status, date: e.status_date, remarks: e.remarks, by: e.entered_by, at: e.created_at }));
    return {
      accounts: acc, books: bk.map(b => ({ id: b.id, code: b.code, series: b.series, first: Number(b.first_leaf), last: b.last_leaf == null ? null : Number(b.last_leaf), track: b.track_from == null ? null : Number(b.track_from), status: b.status, note: b.note })),
      cheques: ch.map(r => ({ id: r.id, date: r.chq_date, code: r.code, no: Number(r.chq_no), amount: Number(r.amount), purpose: r.purpose, taker: r.cash_taker, party: r.party, toac: r.to_ac, remarks: r.remarks, photo: r.photo || null, by: r.entered_by, uid: r.user_id || null, at: r.created_at, events: by[r.id] || [] }))
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
  async deleteCheque(id) { const { error } = await sb.from("cheques").delete().eq("id", id); if (error) throw /in_use/.test(error.message || "") ? new Error(bi("এই চেকের স্ট্যাটাস রেকর্ড আছে — মুছা যাবে না। \"Cancelled\" স্ট্যাটাস দিন", "This cheque has status records — it cannot be deleted. Set the status to \"Cancelled\" instead.")) : error; },
  async deleteStatus(id) { const { error } = await sb.from("cheque_status").delete().eq("id", id); if (error) throw error; },
  async lastBalDate() { const { data } = await sb.from("balances").select("date").order("date", { ascending: false }).limit(1); return data?.[0]?.date || null; },
  async balancesOn(d) { const { data, error } = await sb.from("balances").select("*").eq("date", d).limit(2000); if (error) throw error; return Object.fromEntries(data.map(r => [r.code, { total: r.total == null ? null : Number(r.total), block: r.block == null ? null : Number(r.block), remark: r.remark, od: r.other_debit, odp: r.other_deposit, by: r.entered_by }])); },
  async prevBalances(d) {
    const { data } = await sb.from("balances").select("date").lt("date", d).order("date", { ascending: false }).limit(1);
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
    const { data, error } = await sb.from("books").upsert(row).select().single(); if (error) throw error; return data.id;
  },
  async deleteBook(id) { const { error } = await sb.from("books").delete().eq("id", id); if (error) throw /in_use/.test(error.message || "") ? new Error(bi("এই বইয়ের পাতায় চেক এন্ট্রি আছে — মুছা যাবে না। স্ট্যাটাস Finished বা Lost দিন", "This book has cheque entries — it cannot be deleted. Set the status to Finished or Lost instead.")) : error; },
  async dataKey() { const { data, error } = await sb.from("app_secrets").select("v").eq("k", "data_key").maybeSingle(); if (error || !data) throw new Error("ডাটা কী পাওয়া যায়নি"); return data.v; },
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
  async session() { const s = sessionStorage.getItem("nabiad_demo_user"); return s ? JSON.parse(s) : null; },
  async login(role, name) { const u = { id: "demo-" + role, email: role + "@demo", name, role }; sessionStorage.setItem("nabiad_demo_user", JSON.stringify(u)); return u; },
  async logout() { try { localStorage.removeItem("nabiad_locked"); } catch { } sessionStorage.removeItem("nabiad_demo_user"); },
  async loadAll() {
    const ev = {}; demoStore.events.forEach(e => (ev[e.cheque_id] ||= []).push(e));
    return { accounts: demoStore.accounts, books: demoStore.books, cheques: demoStore.cheques.map(c => ({ ...c, events: ev[c.id] || [] })) };
  },
  async addCheque(c) {
    if (demoStore.cheques.some(x => x.code === c.code && x.no === c.no)) throw new Error("এই চেক নম্বর এই অ্যাকাউন্টে আগেই এন্ট্রি আছে");
    const row = { ...c, id: crypto.randomUUID(), by: S.me.name, at: new Date().toISOString() }; demoStore.cheques.push(row); this.save(); return { ...row, events: [] };
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
  async history(code, from, to) { const h = await this.hist(); const out = []; for (const [d, m] of [...h.entries()].sort()) if (d >= from && d <= to && m[code]) out.push({ date: d, total: m[code].total, block: m[code].block, remark: m[code].remark }); return out; },
  async balanceCount() { const h = await this.hist(); let n = 0; h.forEach(m => n += Object.keys(m).length); return n; },
  async balanceStats() { const h = await this.hist(), ds = [...h.keys()].sort(); return { first: ds[0] || null, last: ds.at(-1) || null, n: await this.balanceCount() }; },
  async importBalances() { }, 
  async upsertAccount(a) { const i = demoStore.accounts.findIndex(x => x.code === a.code); if (i >= 0) demoStore.accounts[i] = { ...demoStore.accounts[i], ...a }; else demoStore.accounts.push(a); this.save(); },
  async upsertBook(b) { if (b.id) { Object.assign(demoStore.books.find(x => x.id === b.id), b); } else { b.id = crypto.randomUUID(); demoStore.books.push(b); } this.save(); return b.id; },
  async deleteBook(id) { demoStore.books = demoStore.books.filter(b => b.id !== id); this.save(); },
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
function saveCache() { if (DEMO) return; try { const old = readCache() || {}; localStorage.setItem(CACHE_KEY, JSON.stringify({ u: S.me?.id, me: S.me, t: Date.now(), accounts: S.accounts, books: S.books, cheques: S.cheques.filter(c => !c.pending), reminders: S.reminders, lastBal: S.lastBal, lastCash: S.lastCash, snap: S.snap || old.snap || null })); } catch { } }
function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; } }
const isNetErr = e => !navigator.onLine || /fetch|network|load failed|timed? ?out|ERR_/i.test(String(e?.message || e || ""));

/* ---------- offline outbox: entries made without internet are kept here and synced automatically ---------- */
const OB_KEY = "nabiad_outbox_v1";
const Outbox = {
  list() { try { return JSON.parse(localStorage.getItem(OB_KEY) || "[]"); } catch { return []; } },
  save(a) { localStorage.setItem(OB_KEY, JSON.stringify(a)); syncBadge(); },
  add(kind, payload) { const a = this.list(); a.push({ k: kind, p: payload, at: Date.now(), u: S.me?.id }); this.save(a); },
  has(chequeId) { return this.list().some(x => x.k === "cheque" && x.p.id === chequeId); },
  count() { return this.list().length; },
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
        if (error && error.code !== "23505" && !/foreign key/i.test(error.message)) { if (/JWT|auth|permission|policy/i.test(error.message)) break; dropped.push(`${it.k}: ${error.message}`); }
        else if (error) {
          if (it.k === "cheque") { dropped.push(`${it.p.code} · ${it.p.chq_no} — আগেই অন্য কেউ এন্ট্রি করেছে`); a = a.filter((x, i) => i === 0 || !(x.k === "status" && x.p.cheque_id === it.p.id)); }
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
function syncBadge() {
  const el = $("#sync"); if (!el) return; const n = Outbox.count(), on = navigator.onLine;
  el.className = "sync " + (!on ? "off" : n ? "wait" : "ok");
  el.innerHTML = `<i></i><span>${!on ? "অফলাইন" : Outbox.busy ? "সিঙ্ক হচ্ছে…" : n ? "সিঙ্ক বাকি" : "অনলাইন"}${n ? ` · ${n}` : ""}</span>`;
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
function loadCache() { if (DEMO) return false; try { const c = readCache(); if (!c || c.u !== S.me?.id) return false; S.accounts = c.accounts; S.books = c.books; S.cheques = c.cheques.map(derive); S.reminders = c.reminders || []; S.lastBal = c.lastBal; S.lastCash = c.lastCash || null; S.snap = c.snap; S.loaded = true; mergeOutbox(); const pd = pendingBalDates().sort().pop(); if (pd && (!S.lastBal || pd > S.lastBal)) S.lastBal = pd; return true; } catch { return false; } }
const balCache = new Map();
async function balancesOn(d) {
  const pb = pendingBal(d);
  if (!navigator.onLine && !DEMO) return Object.keys(pb).length ? pb : (S.snap?.date === d ? S.snap.map : {});
  if (!balCache.has(d)) balCache.set(d, API.balancesOn(d).then(m => { if (!DEMO && d === S.lastBal) { S.snap = { date: d, map: m }; saveCache(); } return m; }).catch(e => { balCache.delete(d); throw e; }));
  const m = await balCache.get(d); return Object.keys(pb).length ? { ...m, ...pb } : m;
}
async function reload() {
  const [d, lb, lc, rm] = await Promise.all([API.loadAll(), API.lastBalDate(), API.lastCashDate().then(x => { S.cashOff = false; return x; }).catch(() => { S.cashOff = true; return S.lastCash || null; }), API.reminders().then(x => { S.remErr = null; return x; }).catch(e => { S.remErr = e.message || String(e); return null; })]);
  if (rm) S.reminders = rm; S.lastCash = lc;
  S.accounts = d.accounts; S.books = d.books; S.cheques = d.cheques.map(derive); S.lastBal = lb; S.loaded = true; saveCache(); setTimeout(() => typeof remTick === "function" && remTick(), 50);
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
function bookStats(b) {
  const start = b.track ?? b.first, end = b.last ?? Infinity;
  const used = new Set(), nos = [];
  S.cheques.forEach(c => { if (c.code === b.code && c.no >= start && c.no <= end) { used.add(c.no); nos.push(c.no); } });
  const maxUsed = nos.length ? Math.max(...nos) : null;
  const missing = []; if (maxUsed !== null && maxUsed - start < 5000) for (let n = start; n <= maxUsed; n++) if (!used.has(n)) missing.push(n);
  return { start, end, used: used.size, maxUsed, missing, remaining: b.last != null ? b.last - (maxUsed ?? start - 1) : null };
}
const allMissing = () => S.books.filter(b => b.status === "Active").map(b => ({ b, st: bookStats(b) })).filter(x => x.st.missing.length);
const nextNo = code => { const n = S.cheques.filter(c => c.code === code).map(c => c.no); return n.length ? Math.max(...n) + 1 : ""; };
const pendingOld = () => S.cheques.filter(c => c.status === "Pending" && daysBetween(c.date, today()) > (CFG.PENDING_ALERT_DAYS ?? 3));
const activeAccounts = () => S.accounts.filter(a => a.status === "Active");
const sumAmt = a => a.reduce((s, c) => s + c.amount, 0);

/* ---------- searchable combobox ---------- */
function suggest(input, getItems, onPick) {
  const wrap = input.parentElement; wrap.classList.add("suggest");
  const list = document.createElement("div"); list.className = "sg-list hide"; wrap.appendChild(list);
  let items = [], idx = 0, picked = null;
  const render = () => {
    const q = norm(input.value);
    const rank = it => { const v = norm(it.value); if (!q) return 0; if (v === q) return 0; if (v.startsWith(q)) return 1; if (v.includes(q)) return 2; return 3; };
    items = getItems().filter(it => !q || [it.value, it.label, it.sub].some(f => norm(f).includes(q)))
      .map(it => ({ it, r: rank(it) })).sort((a, b) => a.r - b.r).slice(0, 40).map(x => x.it);
    idx = 0; list.innerHTML = items.map((it, i) => `<div data-i="${i}" class="${i === 0 ? "on" : ""}">${it.html || `<span><b>${esc(it.value)}</b> ${esc(it.label)}</span>`}<small>${esc(it.sub || "")}</small></div>`).join("") || `<div class="mut">কিছু পাওয়া যায়নি</div>`;
    list.classList.toggle("hide", !items.length && !input.value);
  };
  const pick = it => { picked = it; input.value = `${it.value} (${it.label})`; list.classList.add("hide"); onPick && onPick(it); };
  input.addEventListener("input", () => { picked = null; onPick && onPick(null); render(); });
  input.addEventListener("focus", () => { input.select(); render(); });
  input.addEventListener("keydown", e => {
    if (list.classList.contains("hide") && ["ArrowDown", "ArrowUp"].includes(e.key)) render();
    if (e.key === "ArrowDown") { idx = Math.min(idx + 1, items.length - 1); e.preventDefault(); } else if (e.key === "ArrowUp") { idx = Math.max(idx - 1, 0); e.preventDefault(); }
    else if (e.key === "Enter" || e.key === "Tab") {
      const exact = items.find(it => norm(it.value) === norm(input.value));
      if (!picked && (exact || items.length) && !list.classList.contains("hide")) { pick(exact || items[idx]); if (e.key === "Enter") { e.preventDefault(); input.dispatchEvent(new CustomEvent("picked")); } }
      else if (picked && e.key === "Enter") { e.preventDefault(); input.dispatchEvent(new CustomEvent("picked")); }
      return;
    } else if (e.key === "Escape") { list.classList.add("hide"); return; } else return;
    $$("div", list).forEach((d, i) => d.classList.toggle("on", i === idx)); $$("div", list)[idx]?.scrollIntoView({ block: "nearest" });
  });
  list.addEventListener("mousedown", e => { const d = e.target.closest("[data-i]"); if (d) { e.preventDefault(); pick(items[+d.dataset.i]); input.dispatchEvent(new CustomEvent("picked")); } });
  input.addEventListener("blur", () => setTimeout(() => list.classList.add("hide"), 120));
  return { get: () => picked, set: it => { if (it) pick(it); else { picked = null; input.value = ""; } }, setSilent: it => { picked = it; input.value = it ? `${it.value} (${it.label})` : ""; } };
}
const acItems = (all = false) => (all ? S.accounts : activeAccounts()).map(a => ({ value: a.code, label: a.holder || "", sub: a.bank || "" }));

/* ---------- shell / router ---------- */
const ROUTES = {
  dash: { t: "ড্যাশবোর্ড", ic: "home", roles: "asb", sec: "top", f: () => vDash },
  entry: { t: "চেক পোস্টিং", ic: "plus", roles: "as", sec: "main", f: () => vEntry },
  status: { t: "চেক স্ট্যাটাস", ic: "flag", roles: "as", sec: "main", f: () => vStatus },
  cheques: { t: "চেক রেজিস্টার", ic: "list", roles: "asb", sec: "main", f: () => vCheques },
  closing: { t: "ব্যাংক ক্লোজিং", ic: "bank", roles: "as", sec: "bank", f: () => vClosing },
  recon: { t: "ব্যাংক মিলান", ic: "recon", roles: "as", sec: "bank", f: () => vRecon },
  crep: { t: "ব্যালেন্স স্ন্যাপশট", ic: "img", roles: "asb", sec: "bank", f: () => vCrep },
  reports: { t: "ব্যাংক রিপোর্ট", ic: "chart", roles: "asb", sec: "bank", f: () => vReports },
  cash: { t: "ক্যাশ এন্ট্রি", ic: "wallet", roles: "as", sec: "cash", f: () => vCash },
  cashsum: { t: "ক্যাশ সামারি", ic: "pulse", roles: "asb", sec: "cash", f: () => vCashSum },
  cashrep: { t: "ক্যাশ রিপোর্ট", ic: "pie", roles: "asb", sec: "cash", f: () => vCashRep },
  dcol: { t: "কালেকশন এন্ট্রি", ic: "coins", roles: "as", sec: "dist", f: () => vDcol },
  dsum: { t: "কালেকশন সামারি", ic: "trend", roles: "asb", sec: "dist", f: () => vDsum },
  drep: { t: "কালেকশন রিপোর্ট", ic: "table", roles: "asb", sec: "dist", f: () => vDrep },
  books: { t: "চেক বই", ic: "book", roles: "asb", sec: "more", f: () => vBooks },
  accounts: { t: "অ্যাকাউন্ট ফাইন্ডার", ic: "card", roles: "asb", sec: "more", f: () => vAccounts },
  register: { t: "ক্যাশ খাতা", ic: "ledger", roles: "asb", sec: "more", f: () => vRegister },
  dparty: { t: "পার্টি তালিকা", ic: "users", roles: "asb", sec: "more", f: () => vDparty },
  rem: { t: "রিমাইন্ডার", ic: "bell", roles: "asb", sec: "more", f: () => vRem },
  settings: { t: "সেটিংস", ic: "gear", roles: "asb", sec: "more", f: () => vSettings },
  audit: { t: "অডিট ও সিকিউরিটি", ic: "shield", roles: "ab", sec: "more", f: () => vSecurity },
  admin: { t: "অ্যাডমিন প্যানেল", ic: "sliders", roles: "a", sec: "more", f: () => vAdmin }
};
const SECS = { top: "", main: "চেক", bank: "ব্যাংক", cash: "ক্যাশ", dist: "ডিস্ট্রিবিউশন কালেকশন", more: "অন্যান্য" };
const roleKey = () => ({ admin: "a", staff: "s", boss: "b" }[S.me.role]);
const allowed = () => Object.keys(ROUTES).filter(k => ROUTES[k].roles.includes(roleKey()));
let cleanup = null;
const getTheme = () => document.documentElement.dataset.theme || "light";
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("nabiad_theme", t); } catch { } $$(".th-ic").forEach(e => e.innerHTML = ico(t === "dark" ? "sun" : "moon")); }
function badges() { return { status: pendingOld().length, books: allMissing().length, rem: typeof dueList === "function" ? dueList().length : 0 }; }
function sideMin(on, save = true) { document.documentElement.dataset.side = on ? "min" : ""; if (save) try { localStorage.setItem("nabiad_side", on ? "min" : "full"); } catch { } const b = $("#sbtog"); if (b) { const t = LANG === "en" ? (on ? "Expand sidebar" : "Minimize sidebar") : (on ? "সাইডবার বড় করুন" : "সাইডবার ছোট করুন"); b.title = t; b.setAttribute("aria-label", t); b.setAttribute("aria-expanded", on ? "false" : "true"); } }
function shell() {
  const keys = allowed(), bd = badges();
  const link = k => { const r = ROUTES[k]; const n = bd[k]; return `<a href="#/${k}" data-k="${k}" title="${esc(r.t)}">${ico(r.ic)}<span>${r.t}</span>${n ? `<span class="badge">${n}</span>` : ""}</a>`; };
  let nav = "", last = "";
  keys.forEach(k => { if (ROUTES[k].sec !== last) { last = ROUTES[k].sec; if (SECS[last]) nav += `<div class="sec">${SECS[last]}</div>`; } nav += link(k); });
  const TABS = (S.me.role === "boss" ? [["reports", "main", "চেক"], ["crep", "bank", "ব্যাংক"], ["cashsum", "cash", "ক্যাশ"], ["dsum", "dist", "কালেকশন"]] : [["entry", "main", "চেক"], ["closing", "bank", "ব্যাংক"], ["cash", "cash", "ক্যাশ"], ["dcol", "dist", "কালেকশন"]]).filter(t => keys.includes(t[0]));
  const mob = TABS.map(t => t[0]);
  $("#app").innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b>NABIAD</b><span>Smart Finance Suite</span></div><button class="sbtog" id="sbtog" type="button">${ico("chev")}</button></div>
      <nav class="nav">${nav}</nav>
      <div class="me">${avaEl(S.me.id, S.me.name, S.me.email)}<div class="who"><b>${esc(S.me.name)}</b><span class="mut">${esc(S.me.email)}</span></div><button class="iconbtn" id="logout" title="লগআউট">${ico("out")}</button></div></aside>
    <div class="mainwrap">
      <header class="topbar"><div class="tb-brand"><div class="logo" style="width:30px;height:30px"><img src="icon.svg" alt="Nabiad"></div>NABIAD</div><div class="crumb" id="crumb"></div><div class="sp"></div>
        <button class="searchbtn" id="qs">${ico("search").replace("<svg", '<svg width="16" height="16"')}<span class="lbl">চেক / অ্যাকাউন্ট খুঁজুন…</span><kbd>Ctrl K</kbd></button>
        <button class="iconbtn bell" id="bell" title="রিমাইন্ডার ও সতর্কতা">${ico("bell")}<span class="bb"></span></button>${DEMO ? "" : `<button class="sync" id="sync"></button>`}${langToggle()}<button class="iconbtn th-ic" id="theme" title="থিম">${ico(getTheme() === "dark" ? "sun" : "moon")}</button>
        <span class="pill" style="align-self:center">${esc(S.me.role)}${DEMO ? " · demo" : ""}</span></header>
      <main class="main"><div id="view"></div></main></div></div>
    <nav class="mnav">${TABS.map(([k, sec, lab]) => `<a href="#/${k}" data-tab="${k}" data-sec="${sec}"><span class="mi">${ico(ROUTES[k].ic)}</span><span class="ml">${lab}</span>${tabBadge(sec, bd)}</a>`).join("")}<a href="#" id="more" data-sec="more"><span class="mi">${ico("more")}</span><span class="ml">আরও</span>${tabBadge("more", bd)}</a></nav>`;
  const lo = async () => { await API.logout(); try { localStorage.removeItem(CACHE_KEY); } catch { } location.hash = ""; location.reload(); };
  $("#logout").onclick = lo;
  $("#sbtog").onclick = () => sideMin(document.documentElement.dataset.side !== "min");
  { let m = false; try { m = localStorage.getItem("nabiad_side") === "min"; } catch { } sideMin(m, false); }
  $("#theme").onclick = () => setTheme(getTheme() === "dark" ? "light" : "dark");
  $("#qs").onclick = palette; $("#bell").onclick = () => { const d = dueList(); if (d.length) dueModal(d); else location.hash = "#/rem"; }; updateBell();
  if ($("#sync")) { $("#sync").onclick = () => navigator.onLine ? Outbox.flush() : toast("ইন্টারনেট নেই — নেট এলে নিজে থেকে সিঙ্ক হবে", "err"); syncBadge(); }
  $("#lang").onclick = () => setLang(LANG === "bn" ? "en" : "bn");
  $("#more").onclick = e => { e.preventDefault(); openMore(keys, mob, bd, lo); };

}
const tabBadge = (sec, bd) => { const n = sec === "main" ? bd.status : sec === "more" ? (bd.books || 0) + (bd.rem || 0) : 0; return n ? `<span class="badge">${n}</span>` : ""; };
const secOf = k => { const x = ROUTES[k]?.sec; return !x || x === "top" ? "more" : x; };
function setTabActive(k) { $$(".mnav [data-sec]").forEach(a => a.classList.toggle("on", a.dataset.sec === secOf(k))); }
function refreshBadges() {
  const bd = badges();
  $$("[data-k]").forEach(a => { const n = bd[a.dataset.k]; let b = $(".badge", a); if (n) { if (!b) { b = document.createElement("span"); b.className = "badge"; a.appendChild(b); } b.textContent = n; } else b && b.remove(); });
  $$(".mnav [data-sec]").forEach(a => { const t = tabBadge(a.dataset.sec, bd); let b = $(".badge", a); if (t) { if (!b) { b = document.createElement("span"); b.className = "badge"; a.appendChild(b); } b.textContent = (t.match(/>(\d+)</) || [])[1]; } else b && b.remove(); });
}
/* label table cells so they can become cards on phones */
function labelTables(root) {
  $$("table", root).forEach(t => { const hs = $$("thead th", t).map(th => th.textContent.trim()); if (!hs.length) return; $$("tbody tr", t).forEach(tr => [...tr.children].forEach((td, i) => { if (!td.hasAttribute("data-l")) td.setAttribute("data-l", hs[i] || ""); })); });
}
async function route() {
  if (!S.me) return;
  if (updReady && navigator.onLine && !Outbox.busy) { location.reload(); return; }   // switching page = safe moment to load the new version
  DIRTY = false;
  let k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (!allowed().includes(k)) k = "dash";
  CUR = k; document.body.classList.remove("print-rep");
  if (cleanup) { cleanup(); cleanup = null; }
  $$("[data-k]").forEach(a => a.classList.toggle("on", a.dataset.k === k)); setTabActive(k);
  try { const on = $(".side .nav a.on"); if (on) { const n = on.closest(".nav"), r = on.getBoundingClientRect(), nr = n.getBoundingClientRect(); if (r.top < nr.top + 8 || r.bottom > nr.bottom - 16) n.scrollTop += (r.top < nr.top + 8 ? r.top - nr.top - 40 : r.bottom - nr.bottom + 40); } } catch { }
  const cr = $("#crumb"); if (cr) cr.textContent = ROUTES[k].t;
  document.title = tr(ROUTES[k].t) + " · Nabiad";
  const v = $("#view"); v.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div><div class="skel" style="margin-top:12px"></div><div class="skel" style="margin-top:12px;width:70%"></div></div>`;
  try { cleanup = await ROUTES[k].f()(v) || null; } catch (e) { console.error(e); v.innerHTML = `<div class="alert rd">ত্রুটি: ${esc(e.message || e)}</div>`; }
  window.scrollTo(0, 0);
}
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
      acc = S.accounts.filter(a => norm(a.code + a.holder + a.bank + (a.acno || "")).includes(n)).slice(0, 6).map(a => ({ g: "অ্যাকাউন্ট", ic: "card", t: `<b>${esc(a.code)}</b> · ${esc(a.holder || "")}`, s: `${esc(a.bank || "")} ${a.acno ? "· " + esc(a.acno) : ""}`, go: () => { location.hash = "#/accounts"; setTimeout(() => { const i = $("#ad-q"); if (i) { i.value = a.code; i.dispatchEvent(new Event("input")); } }, 60); } }));
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
const head = (title, extra = "") => `<div class="top"><div class="pic">${ico(ROUTES[CUR]?.ic || "home")}</div><h1>${title}</h1><div class="sp"></div>${extra ? `<div class="acts">${extra}</div>` : ""}</div>`;
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
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-x="close">${en ? "Close" : "বন্ধ করুন"}</button></div>`, (root, close) => {
    $$("[data-os]", root).forEach(c => c.onclick = () => { $$("[data-os]", root).forEach(x => x.classList.toggle("on", x === c)); $("#in-steps", root).innerHTML = steps(c.dataset.os); });
    $("#in-go", root) && ($("#in-go", root).onclick = async () => { try { installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === "accepted") { toast("✔ " + (en ? "Installing…" : "ইনস্টল হচ্ছে…")); close(); } } catch { } });
    $("#in-cp", root).onclick = async () => { try { await navigator.clipboard.writeText(url); } catch { $("#in-url", root).select(); document.execCommand("copy"); } toast("✔ " + (en ? "Link copied" : "লিংক কপি হয়েছে")); };
    $("#in-sh", root) && ($("#in-sh", root).onclick = () => navigator.share({ title: "Nabiad", url }).catch(() => { }));
    $("[data-x=close]", root).onclick = close;
  });
}

/* ---------- login ---------- */
function loginView() {
  const demoBox = DEMO ? `<div class="alert am" style="margin-top:14px"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("Supabase সেট করা হয়নি, ডাটা শুধু এই ব্রাউজারে থাকবে।", "Supabase is not configured; data stays in this browser only.")}</span></div>
    <div class="chips" style="margin-top:12px">${[["admin", "Ruhul"], ["staff", "Foysal"], ["boss", "Boss"]].map(([r, n]) => `<span class="chip" data-demo="${r}|${n}">${r} (${n})</span>`).join("")}</div>` : "";
  $("#app").innerHTML = `<div class="login"><div class="tl-l"><button class="iconbtn th-ic" id="theme" title="Theme">${ico(getTheme() === "dark" ? "sun" : "moon")}</button></div><div class="tl">${langToggle()}</div>
    <div class="art"><div class="brand" style="padding:0"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b>NABIAD</b><span>Cheque &amp; Bank Control</span></div></div>
      <div><h1>চেক রেজিস্টার, দৈনিক ব্যাংক ক্লোজিং আর রিপোর্ট — এক জায়গায়</h1><p>প্রতিটি চেক পাতার হিসাব, মিসিং পাতা ধরা, আর Boss-এর জন্য তাৎক্ষণিক এনকোয়ারি।</p>
      <ul><li>Staff শুধু যোগ করতে পারে, বদলাতে পারে শুধু Admin</li><li>দৈনিক ক্লোজিং রিপোর্ট — ছবি, PDF, Excel, WhatsApp</li><li>মোবাইল ও কম্পিউটার দুটোতেই চলে</li></ul></div>
      <div class="sm" style="opacity:.6">© ${new Date().getFullYear()} NABIAD Group</div></div>
    <div class="pane"><div class="card"><div class="brand" style="padding:0 0 22px"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b style="color:var(--txt)">NABIAD</b><span class="mut">Cheque &amp; Bank Control</span></div></div>
    <h2>লগইন করুন</h2><p class="mut">আপনার অফিস ইমেইল ও পাসওয়ার্ড দিন</p>
    ${DEMO ? "" : `<form id="lf"><label class="f">ইমেইল</label><input class="in" id="em" type="email" autocomplete="username" required>
    <label class="f" style="margin-top:14px">পাসওয়ার্ড</label><input class="in" id="pw" type="password" autocomplete="current-password" required>
    <button class="btn pri lg" style="width:100%;margin-top:20px" id="lb">লগইন</button><div class="hint" id="le"></div></form>`}${demoBox}${isStandalone() ? "" : `<button class="inst-link" id="lg-inst" type="button">${ico("dl")} ${LANG === "en" ? "Install the app — Android · iPhone · Windows" : "অ্যাপ ইনস্টল করুন — Android · iPhone · Windows"}</button>`}</div></div></div>`;
  $("#theme").onclick = () => setTheme(getTheme() === "dark" ? "light" : "dark"); $("#lg-inst") && ($("#lg-inst").onclick = installModal);
  $("#lang").onclick = () => setLang(LANG === "bn" ? "en" : "bn");
  const done = async u => { S.me = u; await boot(); };
  if (DEMO) $$("[data-demo]").forEach(c => c.onclick = async () => { const [r, n] = c.dataset.demo.split("|"); await done(await API.login(r, n)); });
  else $("#lf").onsubmit = async e => { e.preventDefault(); $("#lb").disabled = true; try { const u = await API.login($("#em").value.trim(), $("#pw").value); if (!u) throw new Error("প্রোফাইল পাওয়া যায়নি বা নিষ্ক্রিয়"); await done(u); } catch (er) { $("#le").textContent = "লগইন হয়নি: " + (er.message || er); $("#le").className = "hint rd"; $("#lb").disabled = false; } };
}

/* ---------- dashboard ---------- */

/* ---------- cheque entry ---------- */
async function setStatus(c, status, date, remarks) {
  const e = await API.addStatus(c.id, status, date, remarks); c.events.push(e); derive(c); saveCache(); refreshBadges(); return c;
}
async function vEntry(v) {
  const st = { purpose: null, photo: null };
  v.innerHTML = head("চেক পোস্টিং<span class=\"mut\">Enter চাপলে পরের ঘরে যাবে · শেষ ঘরে Enter = সেভ</span>", `<button class="btn" id="e-imp">${ico("dl")} ${bi("Excel ইম্পোর্ট", "Excel import")}</button>`) + `
  <div class="split">
   <div class="card">
    <div class="fgrid">
     <div class="s4 daterow"><div class="dr-d"><label class="f">চেকের তারিখ</label><input class="in big" type="date" id="e-date" value="${today()}"></div><div class="dr-p"><label class="f">চেকের ছবি <span class="mut">(ঐচ্ছিক)</span></label><div class="photo-in"><label class="btn big" for="e-ph-c" title="${bi("ক্যামেরায় ছবি তুলুন", "Take a photo with the camera")}">${ico("cam")} <span class="lbl">তুলুন</span></label><label class="btn big" for="e-ph" title="${bi("গ্যালারি থেকে বাছুন", "Choose from the gallery")}">${ico("img")} <span class="lbl">বাছুন</span></label><input type="file" id="e-ph-c" accept="image/*" capture="environment" hidden><input type="file" id="e-ph" accept="image/*" hidden><img id="e-phv" class="hide" alt=""><button class="btn sm ghost hide" id="e-phx" title="ছবি বাদ">✕</button></div></div></div>
     <div class="s4"><label class="f">A/C Code <span class="mut">(টাইপ করুন: pbl, 483, nabiad…)</span></label><div><input class="in big" id="e-ac" autocomplete="off" placeholder="PBL-483" autofocus></div><div class="hint" id="e-achint"></div></div>
     <div class="s2"><label class="f">চেক নং (শুধু সংখ্যা)</label><input class="in big" id="e-no" inputmode="numeric" autocomplete="off"><div class="hint" id="e-nohint"></div><div id="e-ocrw" class="hide noprint" style="margin-top:4px"><button type="button" class="btn sm" id="e-ocr">🔍 ${bi("ছবি থেকে পড়ুন", "Read from photo")}</button><div id="e-ocro" style="margin-top:4px"></div></div></div>
     <div class="s2"><label class="f">টাকা (বাতিল পাতা হলে 0)</label><input class="in big num" id="e-amt" inputmode="decimal" autocomplete="off"><div class="hint num" id="e-amthint"></div></div>
     <div class="s4"><label class="f">খাত</label><div class="chips" id="e-purp"></div></div>
     <div class="s2" id="x-cash" style="display:none"><label class="f">কে তুলেছে *</label><select class="in" id="e-taker"><option value=""></option>${TAKERS.map(t => `<option>${t}</option>`).join("")}</select></div>
     <div class="s2" id="x-own" style="display:none"><label class="f">কোন A/C তে জমা *</label><div><input class="in" id="e-toac" autocomplete="off" placeholder="যে অ্যাকাউন্টে টাকা গেছে"></div></div>
     <div class="s4"><label class="f">নোট / মন্তব্য / সাপ্লায়ার / অন্যান্য</label><input class="in" id="e-rem" autocomplete="off" list="dl-rem" placeholder="যেমন: সাপ্লায়ারের নাম — বিলের বিবরণ"></div>
     <div class="s4" id="e-sum" style="display:none"></div>
    </div>${datalist("dl-rem", [...S.cheques.map(c => c.remarks), ...S.cheques.map(c => c.party)])}
    <div class="fbar"><div class="fb2"><button class="btn pri lg" id="e-save">${ico("save")} সেভ করুন</button><button class="btn lg" id="e-clear">পরিষ্কার</button></div><div class="hint rd" id="e-err" style="margin:0"></div><div class="sp"></div><label class="keep"><input type="checkbox" id="keep" checked> A/C ও খাত ধরে রাখুন</label></div>
   </div>
   <div class="card flush"><div class="ch"><h3>আজকের এন্ট্রি</h3><span class="tag" id="e-cnt"></span></div><div id="e-list"></div></div>
  </div>`;
  const $e = id => $("#" + id, v);
  const ac = suggest($e("e-ac"), () => acItems(), it => {
    const a = it && accMap()[it.value]; $e("e-achint").innerHTML = a ? `${esc(a.bank)} ${a.branch ? "· " + esc(a.branch) : ""} ${a.acno ? "· " + esc(a.acno) : ""}` : "";
    if (it) { const n = nextNo(it.value); $e("e-no").value = n; const last = S.cheques.filter(c => c.code === it.value).sort((x, y) => y.no - x.no)[0]; $e("e-nohint").textContent = last ? `শেষ এন্ট্রি: ${last.no} (${dmy(last.date)})` : "এই অ্যাকাউন্টে এখনো এন্ট্রি নেই"; }
    sum();
  });
  const toac = suggest($e("e-toac"), () => acItems(true), () => sum());
  const clearPhoto = photoPicker(v, st, { inp: "e-ph", cam: "e-ph-c", img: "e-phv", x: "e-phx" }, () => { $e("e-ocrw").classList.toggle("hide", !st.photo); $e("e-ocro").innerHTML = ""; });
  $e("e-ocr").onclick = () => runOcr(st, $e("e-ocro"), val => { $e("e-no").value = val; $e("e-no").dispatchEvent(new Event("input")); }, val => { $e("e-amt").value = val; $e("e-amt").dispatchEvent(new Event("input")); });
  const purpKey = () => st.purpose ? purposeKey(st.purpose) : "";
  function drawPurp() {
    $e("e-purp").innerHTML = allPurposes().map(p => `<span class="chip" data-p="${esc(p)}">${esc(p.split(" (")[0])}</span>`).join("") + `<span class="chip add" id="e-padd" title="${bi("নতুন খাত যোগ করুন", "Add a new purpose")}">＋ নতুন</span>` + (S.me.role === "admin" ? `<span class="chip add" id="e-pmg" title="${LANG === "en" ? "Edit / delete purposes" : "খাত এডিট / মুছুন"}">⚙ ${LANG === "en" ? "Manage" : "ম্যানেজ"}</span>` : "");
    if ($e("e-pmg")) $e("e-pmg").onclick = () => purposeManage(() => { if (st.purpose && !allPurposes().includes(st.purpose)) st.purpose = ""; drawPurp(); });
    $$(".chip[data-p]", v).forEach(c => c.onclick = () => { st.purpose = c.dataset.p; applyPurpose(); if (purpKey() === "cash") $e("e-taker").focus(); else if (purpKey() === "own") $e("e-toac").focus(); else $e("e-rem").focus(); });
    $e("e-padd").onclick = () => askText("নতুন খাত (Purpose)", "খাতের নাম লিখুন (যেমন: Salary)", "", async n => {
      if (allPurposes(true).some(p => p.split(" (")[0].trim().toLowerCase() === n.split(" (")[0].trim().toLowerCase())) throw new Error("এই খাত আগেই আছে");
      await API.purposeAdd(n); PURP_X = [...allPurposes(), n]; if (!DEMO) localStorage.setItem("nb_purp_v2", JSON.stringify(PURP_X));
      st.purpose = n; drawPurp(); applyPurpose(); toast("✔ নতুন খাত যোগ হয়েছে");
    });
    applyPurpose();
  }
  function applyPurpose() {
    $$(".chip[data-p]", v).forEach(c => c.classList.toggle("on", c.dataset.p === st.purpose));
    const k = purpKey(); $e("x-cash").style.display = k === "cash" ? "" : "none"; $e("x-own").style.display = k === "own" ? "" : "none"; sum();
  }
  drawPurp(); loadPurposes().then(() => { if (v.isConnected) drawPurp(); });
  $e("e-imp").onclick = () => chequeImportModal(() => { list(); });
  function sum() {
    const code = ac.get()?.value, no = $e("e-no").value, amt = num($e("e-amt").value);
    $e("e-amthint").textContent = amt ? "৳ " + money(amt) : ""; const el = $e("e-sum");
    if (code && no) {
      const dup = S.cheques.find(c => c.code === code && c.no === +no);
      el.style.display = ""; el.className = "s4 sumbox" + (dup ? " dup" : "");
      el.innerHTML = dup ? `⛔ <b>${esc(code)} · ${no}</b> আগেই এন্ট্রি আছে (${dmy(dup.date)}, ৳ ${money(dup.amount)}, ${dup.status})` : `<span class="tag">${esc(code)}</span><span>চেক নং <b>${no}</b></span><span class="big num">৳ ${money(amt) || 0}</span><span class="mut">${esc((st.purpose || "খাত বাছুন").split(" (")[0])}</span>`;
    } else el.style.display = "none";
  }
  $$(".chip[data-p]", v).forEach(c => c.onclick = () => { st.purpose = c.dataset.p; applyPurpose(); if (purpKey() === "cash") $e("e-taker").focus(); else if (purpKey() === "own") $e("e-toac").focus(); else $e("e-rem").focus(); });
  ["e-no", "e-amt"].forEach(i => $e(i).addEventListener("input", sum));
  $e("e-ac").addEventListener("picked", () => $e("e-no").select() || $e("e-no").focus());
  $e("e-no").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $e("e-amt").focus(); } });
  $e("e-amt").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (st.purpose) save(); else $e("e-err").textContent = "খাত বাছুন"; } });
  $$("#e-taker,#e-rem", v).forEach(el => el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } }));
  $e("e-toac").addEventListener("picked", () => $e("e-rem").focus());
  function clearAll(full) {
    if (full || !$("#keep", v).checked) { ac.set(null); st.purpose = null; $e("e-taker").value = ""; $e("e-achint").textContent = ""; $e("e-nohint").textContent = ""; }
    toac.set(null); $e("e-no").value = ac.get() ? nextNo(ac.get().value) : ""; $e("e-amt").value = ""; $e("e-rem").value = ""; clearPhoto(); applyPurpose();
  }
  function list() {
    const t = today(), arr = S.cheques.filter(c => (c.at || "").slice(0, 10) === t || c.date === t).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    $e("e-cnt").textContent = arr.length;
    $e("e-list").innerHTML = arr.length ? `<div class="tw cards" style="max-height:66vh"><table><thead><tr><th>A/C · চেক</th><th class="r">টাকা</th><th>স্ট্যাটাস</th><th>কে</th></tr></thead><tbody>${arr.map(c => `<tr><td><div class="c1"><b>${esc(c.code)}</b> · ${c.no}${chqIcons(c)}<div class="mut sm">${esc(c.purpose.split(" (")[0])}${c.party ? " · " + esc(c.party) : ""}</div></div></td><td class="r num">${money(c.amount)}</td><td>${stTag(c.status)}${pendTag(c)}</td><td class="mut sm">${esc(c.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">আজ এখনো কোনো এন্ট্রি নেই</div>`;
  }
  let busy = false;
  async function save() {
    if (busy) return; const err = $e("e-err"); err.textContent = ""; err.className = "hint rd";
    const code = ac.get()?.value, no = parseInt($e("e-no").value), amount = num($e("e-amt").value), date = $e("e-date").value, k = purpKey();
    if (!code) return err.textContent = "A/C Code বাছুন", $e("e-ac").focus();
    if (!no || no < 1) return err.textContent = "চেক নং দিন", $e("e-no").focus();
    if (!st.purpose) return err.textContent = "খাত বাছুন";
    if (!date) return err.textContent = "তারিখ দিন";
    if (k !== "cancel" && !(amount > 0)) return err.textContent = "টাকার অঙ্ক দিন (বাতিল পাতা হলে খাত 'বাতিল/নষ্ট পাতা' বাছুন)", $e("e-amt").focus();
    if (k === "cash" && !$e("e-taker").value) return err.textContent = "কে তুলেছে — বাছুন", $e("e-taker").focus();
    if (k === "own" && !toac.get()) return err.textContent = "কোন A/C তে জমা — বাছুন", $e("e-toac").focus();
    if (k === "own" && toac.get().value === code) return err.textContent = "From ও To একই A/C হতে পারে না";
    if (S.cheques.some(c => c.code === code && c.no === no)) return err.textContent = "এই চেক আগেই এন্ট্রি আছে";
    const diff = daysBetween(date, today());
    if ((diff > 7 || diff < 0) && !ask(bi(`তারিখ ${dmy(date)} — আজ থেকে ${Math.abs(diff)} দিন ${diff > 0 ? "আগের" : "পরের"}। ঠিক আছে?`, `Date ${dmy(date)} is ${Math.abs(diff)} day(s) ${diff > 0 ? "before" : "after"} today. Is that right?`))) return;
    if (amount >= 1000000 && !ask(bi(`৳ ${money(amount)} — অঙ্ক ঠিক আছে?`, `৳ ${money(amount)} — is the amount right?`))) return;
    busy = true; $e("e-save").disabled = true;
    try {
      const id = crypto.randomUUID(); let photo = null, warn = "";
      if (st.photo) {
        if (!navigator.onLine && !DEMO) warn = " · ইন্টারনেট নেই, তাই ছবি সেভ হয়নি (পরে চেকের পাতা থেকে যোগ করুন)";
        else { try { const p = photoPath(id, code, no, date); await API.uploadPhoto(p, st.photo); photo = p; } catch (e) { if (!ask(bi("ছবি আপলোড হয়নি (", "Photo upload failed (") + (e.message || e) + bi(")।\nছবি ছাড়া চেক সেভ করবেন?", ").\nSave the cheque without a photo?"))) throw new Error(bi("ছবি আপলোড হয়নি — আবার চেষ্টা করুন", "Photo upload failed — try again")); warn = bi(" · ছবি সেভ হয়নি", " · photo not saved"); } }
      }
      const party = "";
      const row = await API.addCheque({ id, photo, date, code, no, amount: k === "cancel" ? 0 : amount, purpose: st.purpose, taker: k === "cash" ? $e("e-taker").value : "", party, toac: k === "own" ? toac.get().value : "", remarks: $e("e-rem").value.trim() });
      S.cheques.push(derive(row)); saveCache();
      if (warn) toast(warn.slice(3), /হয়নি/.test(warn) ? "err" : "ok"); toast(row.pending ? `✔ অফলাইনে জমা হয়েছে: ${code} · ${no} · ৳ ${money(row.amount)} — নেট এলে সিঙ্ক হবে` : `✔ সেভ হয়েছে: ${code} · ${no} · ৳ ${money(row.amount)}`); clearAll(false); list();
      const n = $e("e-no"); n.focus(); n.select();
    } catch (e) { err.textContent = e.message || String(e); toast(e.message || String(e), "err"); }
    finally { busy = false; $e("e-save").disabled = false; }
  }
  $e("e-save").onclick = save; $e("e-clear").onclick = () => { clearAll(true); $e("e-ac").focus(); };
  list(); const poll = setInterval(async () => { if (document.hidden) return; try { await reload(); list(); } catch { } }, 30000); return () => clearInterval(poll);
}

/* ---------- status update ---------- */
function statusModal(c, after) {
  const evs = (c.events || []);
  modal(`<h2>${esc(c.code)} · ${c.no} <span class="mut sm">৳ ${money(c.amount)}</span></h2><div class="mut sm" style="margin:-8px 0 12px">${dmy(c.date)} · ${esc(c.purpose)} ${c.party ? "· " + esc(c.party) : ""}</div>
   <div class="row"><div><label class="f">নতুন স্ট্যাটাস</label><select class="in" id="m-st">${STATUSES.map(s => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select></div><div><label class="f">তারিখ</label><input class="in" type="date" id="m-d" value="${today()}"></div></div>
   <label class="f" style="margin-top:12px">মন্তব্য (ঐচ্ছিক)</label><input class="in" id="m-r">
   <div class="mut sm" style="margin-top:12px">ইতিহাস: ${evs.length ? evs.map(e => `${e.status} (${dmy(e.date)}${e.by ? ", " + esc(e.by) : ""})`).join(" → ") : "—"}</div>
   <div class="row" style="margin-top:16px"><button class="btn pri" id="m-ok">সেভ</button><button class="btn" id="m-x">বাতিল</button></div>`, (root, close) => {
    $("#m-x", root).onclick = close; $("#m-ok", root).onclick = async () => {
      try { await setStatus(c, $("#m-st", root).value, $("#m-d", root).value, $("#m-r", root).value.trim()); toast(`✔ ${c.code} · ${c.no} → ${c.status}`); close(); after && after(); } catch (e) { toast(e.message, "err"); }
    };
  });
}
async function vStatus(v) {
  v.innerHTML = head("চেক স্ট্যাটাস আপডেট") + `<div class="card noprint" style="margin-bottom:14px"><div class="row">
    <div style="flex:2 1 260px"><label class="f">খুঁজুন (A/C বা চেক নং — যেমন: pbl 12565)</label><input class="in big" id="s-q" autocomplete="off" placeholder="চেক নং / কোড…" autofocus></div>
    <div class="fix" style="width:180px"><label class="f">স্ট্যাটাসের তারিখ (Quick বাটনে)</label><input class="in" type="date" id="s-d" value="${today()}"></div>
    <div class="fix"><label class="f">দেখান</label><select class="in" id="s-f"><option value="Pending">শুধু Pending</option><option value="">সব</option></select></div></div></div>
    <div id="s-list"></div>`;
  const q = $("#s-q", v);
  const draw = () => {
    const t = norm(q.value), f = $("#s-f", v).value;
    let arr = S.cheques.filter(c => (!f || c.status === f) && (!t || norm(c.code + c.no + (c.party || "")).includes(t) || String(c.no) === t));
    arr.sort((a, b) => f === "Pending" && !t ? a.date.localeCompare(b.date) : (b.at || "").localeCompare(a.at || ""));
    const tot = arr.length; arr = arr.slice(0, 80); const T = today();
    $("#s-list", v).innerHTML = tot ? `<div class="mut sm" style="margin-bottom:8px">${tot}${bi("টি চেক", " cheques")} ${tot > 80 ? bi("(প্রথম ৮০টি)", "(first 80)") : ""}</div><div class="card flush"><div class="tw cards"><table><thead><tr><th>তারিখ</th><th>A/C · চেক</th><th class="r">টাকা</th><th>বিবরণ</th><th>স্ট্যাটাস</th><th></th></tr></thead><tbody>${arr.map(c => { const d = daysBetween(c.date, T); return `<tr><td>${dmy(c.date)}${c.status === "Pending" && d > (CFG.PENDING_ALERT_DAYS ?? 3) ? `<div class="rd sm b">${d} ${bi("দিন", "days")}</div>` : ""}</td><td><div class="c1"><b>${esc(c.code)}</b> · ${c.no}</div></td><td class="r num">${money(c.amount)}</td><td class="mut sm">${esc(c.purpose.split(" (")[0])}${c.party || c.remarks ? " · " + esc(c.party || c.remarks) : ""}</td><td>${stTag(c.status)}${pendTag(c)}${c.sdate && c.status !== "Pending" ? `<div class="mut sm">${dmy(c.sdate)}</div>` : ""}</td>
      <td class="r" data-l="" style="white-space:nowrap"><button class="btn ok sm" data-q="Cleared" data-id="${c.id}" ${c.status === "Cleared" ? "disabled" : ""}>✓ Cleared</button> <button class="btn bad sm" data-q="Bounced" data-id="${c.id}" ${c.status === "Bounced" ? "disabled" : ""}>✗ Bounced</button> <button class="btn sm" data-m="${c.id}">${ico("more")}</button></td></tr>`; }).join("")}</tbody></table></div></div>` : `<div class="card empty">${S.cheques.length ? "কোনো চেক পাওয়া যায়নি" : "এখনো কোনো চেক এন্ট্রি হয়নি"}</div>`;
    $$("[data-q]", v).forEach(b => b.onclick = async () => { const c = S.cheques.find(x => x.id === b.dataset.id); b.disabled = true; try { await setStatus(c, b.dataset.q, $("#s-d", v).value, ""); toast(`✔ ${c.code} · ${c.no} → ${c.status}`); draw(); } catch (e) { toast(e.message, "err"); b.disabled = false; } });
    $$("[data-m]", v).forEach(b => b.onclick = () => statusModal(S.cheques.find(x => x.id === b.dataset.m), draw));
  };
  q.addEventListener("input", draw); $("#s-f", v).onchange = draw; draw();
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
  const lbl = btn && btn.innerHTML; const prog = t => { if (btn) btn.innerHTML = t; };
  try { prog("⏳ …"); await loadScript("vendor/exceljs.min.js");
    const wb = new ExcelJS.Workbook(); wb.creator = "Nabiad"; const ws = wb.addWorksheet("Cheques", { views: [{ state: "frozen", ySplit: 1 }] });
    const head = [...CHQ_HEAD, "Photo"], widths = [12, 12, 28, 12, 14, 26, 12, 18, 12, 11, 12, 26, 12, 34];
    ws.columns = head.map((h, i) => ({ header: h, key: "c" + i, width: widths[i] }));
    const hr = ws.getRow(1); hr.height = 22; hr.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }; c.alignment = { vertical: "middle" }; });
    rows.forEach(c => { const r = ws.addRow(chqRow(c)); r.alignment = { vertical: "middle", wrapText: true }; r.getCell(5).numFmt = "#,##0"; });
    const withPh = rows.map((c, i) => [c, i]).filter(([c]) => c.photo); let done = 0;
    const work = async ([c, i]) => { try { const t = await photoThumb(c.photo), w = 230, h = Math.round(t.h * w / t.w), id = wb.addImage({ base64: t.b64, extension: "jpeg" }); ws.getRow(i + 2).height = Math.max(20, h * 0.75 + 4); ws.addImage(id, { tl: { col: head.length - 1, row: i + 1 + 0.04 }, ext: { width: w, height: h } }); } catch { ws.getCell(i + 2, head.length).value = bi("(ছবি আনা যায়নি)", "(photo unavailable)"); } prog(`⏳ ${++done}/${withPh.length}`); };
    const q = [...withPh]; await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await work(q.shift()); }));
    const buf = await wb.xlsx.writeBuffer(); dlBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
    toast(bi(`✔ Excel তৈরি — ${rows.length}টি চেক, ${withPh.length}টি ছবিসহ`, `✔ Excel ready — ${rows.length} cheque(s), ${withPh.length} with photo`));
  } catch (e) { console.error(e); toast(bi("Excel তৈরি হয়নি: ", "Excel failed: ") + (e.message || e), "err"); }
  finally { if (btn) btn.innerHTML = lbl; }
}
const chqRow = c => [dmy(c.date), c.code, (accMap()[c.code] || {}).holder || "", c.no, c.amount, c.purpose, c.taker || "", c.party || "", c.toac || "", c.status, c.sdate ? dmy(c.sdate) : "", c.remarks || "", c.by || ""];
const CHQ_HEAD = ["Date", "A/C Code", "Holder", "Cheque No", "Amount", "Purpose", "Cash Taker", "Party", "To A/C", "Status", "Status Date", "Remarks", "Entered By"];

/* ---------- cheque list / enquiry ---------- */
function chequeModal(c, after) {
  const admin = S.me.role === "admin"; const a = accMap()[c.code] || {};
  modal(`<h2>${esc(c.code)} · ${c.no} ${stTag(c.status)}</h2>
   <div class="grid g2" style="gap:8px;font-size:14px"><div><span class="mut sm">তারিখ</span><br>${dmy(c.date)}</div><div><span class="mut sm">টাকা</span><br><b class="num">৳ ${money(c.amount)}</b></div>
   <div><span class="mut sm">A/C</span><br>${esc(a.holder || "")}<div class="mut sm">${esc(a.bank || "")}</div></div><div><span class="mut sm">খাত</span><br>${esc(c.purpose)}</div>
   ${c.taker ? `<div><span class="mut sm">কে তুলেছে</span><br>${esc(c.taker)}</div>` : ""}${c.toac ? `<div><span class="mut sm">To A/C</span><br>${esc(c.toac)}</div>` : ""}${c.party ? `<div><span class="mut sm">পার্টি</span><br>${esc(c.party)}</div>` : ""}${c.remarks ? `<div><span class="mut sm">মন্তব্য</span><br>${esc(c.remarks)}</div>` : ""}
   <div><span class="mut sm">এন্ট্রি</span><br>${esc(c.by || "")} <span class="mut sm">${c.at ? new Date(c.at).toLocaleString("en-GB") : ""}</span></div></div>
   <div id="c-ph" style="margin-top:12px"></div>
   ${(S.reminders || []).filter(r => r.cheque_id === c.id && !r.done).map(r => `<div class="alert vi" style="margin-top:10px">⏰ <span>${esc(r.title)} — ${new Date(remDue(r)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span></div>`).join("")}
   <h3 style="margin:16px 0 8px;font-size:13px;color:var(--mut)">স্ট্যাটাস ইতিহাস</h3>
   ${c.events.length ? c.events.map(e => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0">${stTag(e.status)} <span>${dmy(e.date)}</span> <span class="mut sm">${esc(e.by || "")} ${esc(e.remarks || "")}</span>${admin ? `<button class="btn bad sm" style="margin-left:auto" data-de="${e.id}">মুছুন</button>` : ""}</div>`).join("") : `<div class="mut sm">কোনো আপডেট নেই (ডিফল্ট: ${c.status})</div>`}
   <div class="row" style="margin-top:16px">${S.me.role !== "boss" ? `<button class="btn pri" id="c-st">স্ট্যাটাস দিন</button>` : ""}<button class="btn" id="c-rm">${ico("bell")} রিমাইন্ডার</button>${admin || (S.me.role === "staff" && (!c.photo || canEditChq(c))) ? `<button class="btn" id="c-ap">${ico("cam")} ${c.photo ? "ছবি বদলান" : "ছবি যোগ"}</button>` : ""}${admin ? `<button class="btn" id="c-ed">✎ এডিট</button><button class="btn bad" id="c-dl">🗑 মুছুন</button>` : canEditChq(c) ? `<button class="btn" id="c-ed">✎ এডিট</button>` : ""}<button class="btn" id="c-x">বন্ধ</button></div>${!admin && canEditChq(c) ? `<div class="mut xs" style="margin-top:8px">⏳ ${LANG === "en" ? "You can edit this entry for another " : "এই এন্ট্রি আরও এডিট করতে পারবেন: "}${leftTxt(chqEditLeft(c))}</div>` : ""}`, (root, close) => {
    $("#c-x", root).onclick = close; showPhoto($("#c-ph", root), c);
    $("#c-rm", root).onclick = () => { close(); reminderModal(null, { title: bi(`চেক ${c.code} · ${c.no} পাস হয়েছে কি না দেখুন`, `Check whether cheque ${c.code} · ${c.no} has cleared`), note: `৳ ${money(c.amount)}${c.party ? " · " + c.party : ""} · ${bi("চেকের তারিখ", "Cheque date")} ${dmy(c.date)}`, due: (() => { const d = new Date(addDays(c.date < today() ? today() : c.date, 3) + "T10:00"); return d; })(), kind: "cheque", cheque_id: c.id, for_role: "all" }, after); };
    $("#c-ap", root) && ($("#c-ap", root).onclick = () => { close(); addPhotoModal(c, after); });
    $("#c-st", root) && ($("#c-st", root).onclick = () => { close(); statusModal(c, after); });
    $$("[data-de]", root).forEach(b => b.onclick = async () => { if (!ask("এই স্ট্যাটাস এন্ট্রি স্থায়ীভাবে মুছবেন?")) return; await API.deleteStatus(b.dataset.de); await reload(); close(); after && after(); toast("মুছে ফেলা হয়েছে"); });
    $("#c-dl", root) && ($("#c-dl", root).onclick = async () => { if (c.events.length) return toast(bi(`এই চেকের ${c.events.length}টি স্ট্যাটাস রেকর্ড আছে — মুছা যাবে না। ভুল এন্ট্রি হলে "Cancelled" স্ট্যাটাস দিন`, `This cheque has ${c.events.length} status record(s) — it cannot be deleted. If it was entered by mistake, set the status to "Cancelled".`), "err"); if (!ask(bi(`চেক ${c.code} · ${c.no} স্থায়ীভাবে মুছবেন? (ফেরানো যাবে না)`, `Permanently delete cheque ${c.code} · ${c.no}? (cannot be undone)`))) return; try { await API.deleteCheque(c.id); await reload(); close(); after && after(); toast("চেক মুছে ফেলা হয়েছে"); } catch (e) { toast(e.message, "err"); } });
    $("#c-ed", root) && ($("#c-ed", root).onclick = () => { close(); editChequeModal(c, after); });
  });
}
function editChequeModal(c, after) {
  modal(`<h2>এডিট: ${esc(c.code)} · ${c.no}</h2><div class="grid" style="gap:10px">
   <div class="row"><div><label class="f">তারিখ</label><input class="in" type="date" id="x-d" value="${c.date}"></div><div><label class="f">A/C Code</label><select class="in" id="x-c">${S.accounts.map(a => `<option ${a.code === c.code ? "selected" : ""}>${esc(a.code)}</option>`).join("")}</select></div></div>
   <div class="row"><div><label class="f">চেক নং</label><input class="in" id="x-n" value="${c.no}"></div><div><label class="f">টাকা</label><input class="in" id="x-a" value="${c.amount}"></div></div>
   <div><label class="f">খাত</label><select class="in" id="x-p">${allPurposes(true).map(p => `<option ${p === c.purpose ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
   <div class="row"><div><label class="f">কে তুলেছে</label><input class="in" id="x-t" value="${esc(c.taker || "")}"></div><div><label class="f">To A/C</label><input class="in" id="x-o" value="${esc(c.toac || "")}"></div></div>
   <div class="row"><div><label class="f">পার্টি</label><input class="in" id="x-y" value="${esc(c.party || "")}"></div><div><label class="f">মন্তব্য</label><input class="in" id="x-r" value="${esc(c.remarks || "")}"></div></div>
   <div class="row"><button class="btn pri" id="x-ok">সেভ</button><button class="btn" id="x-x">বাতিল</button></div></div>`, (root, close) => {
    $("#x-x", root).onclick = close; $("#x-ok", root).onclick = async () => {
      try { await API.updateCheque(c.id, { date: $("#x-d", root).value, code: $("#x-c", root).value, no: parseInt($("#x-n", root).value), amount: num($("#x-a", root).value), purpose: $("#x-p", root).value, taker: $("#x-t", root).value.trim(), toac: $("#x-o", root).value.trim(), party: $("#x-y", root).value.trim(), remarks: $("#x-r", root).value.trim() }); await reload(); close(); after && after(); toast("আপডেট হয়েছে"); } catch (e) { toast(e.message, "err"); }
    };
  });
}
async function vCheques(v) {
  const F = { q: "", code: "", status: "", purpose: "", taker: "", page: 0 }, PF = pbInit("all"), PS = 100, PBO = { all: true };
  v.innerHTML = head("চেক তালিকা ও এনকোয়ারি", `<button class="btn" id="k-x">${ico("dl")} Excel</button><button class="btn" id="k-p">${ico("print")} প্রিন্ট</button>`) + `<div class="card noprint" style="margin-bottom:14px">${pbBar("k", PF, PBO)}<div class="row" style="margin-top:12px">
   <div style="flex:2 1 220px"><label class="f">খুঁজুন (কোড, চেক নং, পার্টি, মন্তব্য, টাকা)</label><input class="in" id="k-q" placeholder="যেকোনো কিছু লিখুন…"></div>
   <div style="flex:1 1 220px"><label class="f">A/C</label><select class="in" id="k-c"><option value="">সব</option>${S.accounts.map(a => `<option value="${esc(a.code)}">${esc(a.code)}${a.holder ? " · " + esc(a.holder) : ""}${a.bank ? " · " + esc(a.bank) : ""}</option>`).join("")}</select></div>
   <div><label class="f">স্ট্যাটাস</label><select class="in" id="k-s"><option value="">সব</option>${STATUSES.map(s => `<option>${s}</option>`).join("")}</select></div>
   <div><label class="f">খাত</label><select class="in" id="k-u"><option value="">সব</option>${allPurposes(true).map(p => `<option value="${esc(p)}">${esc(p.split(" (")[0])}</option>`).join("")}</select></div></div></div>
   <div id="k-sum" class="ksum"></div><div class="card flush"><div id="k-tab"></div></div><div id="k-pg" class="row noprint" style="margin-top:10px;justify-content:center"></div>`;
  const filt = () => { const t = norm(F.q), raw = F.q.trim(), [pa, pb] = pbRange(PF); return S.cheques.filter(c => c.date >= pa && c.date <= pb && (!F.code || c.code === F.code) && (!F.status || c.status === F.status) && (!F.purpose || c.purpose === F.purpose) && (!t || norm(c.code + c.no + (c.party || "") + (c.remarks || "") + (c.taker || "") + (c.toac || "")).includes(t) || String(c.amount) === raw.replace(/,/g, ""))).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no); };
  const draw = () => {
    const arr = filt(), pages = Math.max(1, Math.ceil(arr.length / PS)); F.page = Math.min(F.page, pages - 1); const part = arr.slice(F.page * PS, F.page * PS + PS), live = arr.filter(isLive);
    const kc = (l, n, a, cls = "") => `<div class="kc ${cls}"><span>${l}</span><div class="kv"><b>${n}</b>${a != null ? `<small class="num">৳ ${money0(a)}</small>` : ""}</div></div>`;
    $("#k-sum", v).innerHTML = kc(bi("মোট চেক", "Cheques"), arr.length, null) + kc(bi("কার্যকর মোট", "Live total"), live.length, sumAmt(live), "main") + ["Pending", "Cleared", "Bounced", "Cancelled"].map(s => { const x = arr.filter(c => c.status === s); return x.length ? kc(stTag(s), x.length, sumAmt(x)) : ""; }).join("");
    $("#k-tab", v).innerHTML = part.length ? `<div class="tw cards"><table><thead><tr><th>তারিখ</th><th>A/C · চেক</th><th>হোল্ডার</th><th class="r">টাকা</th><th>খাত / বিবরণ</th><th>স্ট্যাটাস</th><th>কে</th></tr></thead><tbody>${part.map(c => `<tr data-id="${c.id}" style="cursor:pointer"><td>${dmy(c.date)}</td><td><b>${esc(c.code)}</b> · ${c.no}${chqIcons(c)}</td><td class="mut sm">${esc((accMap()[c.code] || {}).holder || "")}</td><td class="r num">${money(c.amount)}</td><td>${esc(c.purpose.split(" (")[0])}<div class="mut sm">${esc([c.taker, c.party, c.toac && "→ " + c.toac, c.remarks].filter(Boolean).join(" · "))}</div></td><td>${stTag(c.status)}${pendTag(c)}${c.sdate && c.status !== "Pending" ? `<div class="mut sm">${dmy(c.sdate)}</div>` : ""}</td><td class="mut sm">${esc(c.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">কিছু পাওয়া যায়নি</div>`;
    $("#k-pg", v).innerHTML = pages > 1 ? `<button class="btn sm fix" id="pv" ${F.page ? "" : "disabled"}>‹ আগের</button><span class="mut fix">পাতা ${F.page + 1} / ${pages}</span><button class="btn sm fix" id="nx" ${F.page < pages - 1 ? "" : "disabled"}>পরের ›</button>` : "";
    $("#pv", v) && ($("#pv", v).onclick = () => { F.page--; draw(); }); $("#nx", v) && ($("#nx", v).onclick = () => { F.page++; draw(); });
    $$("tr[data-id]", v).forEach(r => r.onclick = () => chequeModal(S.cheques.find(c => c.id === r.dataset.id), draw));
  };
  const bind = (id, k) => { const el = $("#" + id, v); el.addEventListener("input", () => { F[k] = el.value; F.page = 0; draw(); }); };
  const pre = sessionStorage.getItem("nabiad_chq_ac"); if (pre) { sessionStorage.removeItem("nabiad_chq_ac"); F.code = pre; $("#k-c", v).value = pre; }
  pbBind(v, "k", PF, () => { F.page = 0; draw(); }, PBO); bind("k-q", "q"); bind("k-c", "code"); bind("k-s", "status"); bind("k-u", "purpose");
  $("#k-x", v).onclick = () => exportChequesXlsx(filt(), `Cheques_${PF.m === "all" ? today() : pbRange(PF).join("_to_")}.xlsx`, $("#k-x", v));
  $("#k-p", v).onclick = () => {
    const arr = filt().sort((x, y) => x.date.localeCompare(y.date) || x.code.localeCompare(y.code)), live = arr.filter(isLive), am = accMap(); if (!arr.length) return toast("ডাটা নেই", "err");
    const [pa, pb] = pbRange(PF), f = PF.m === "all" ? arr[0].date : pa, t = PF.m === "all" ? arr[arr.length - 1].date : pb, flt = [F.code, F.status, F.purpose && F.purpose.split(" (")[0], F.q && `"${esc(F.q)}"`].filter(Boolean).join(" · ");
    printSheet(repSheet("k-sheet", "Cheque List · চেক তালিকা" + (flt ? " · " + flt : ""), f, t,
      repKpi([[`Cheques · live`, `${live.length} <small>/ ${arr.length}</small>`, "k1"], ["Live Amount", "৳ " + money0(sumAmt(live)), "k3"], ["Pending", `${arr.filter(c => c.status === "Pending").length} · ৳ ${money0(sumAmt(arr.filter(c => c.status === "Pending")))}`, ""], ["Cleared", `${arr.filter(c => c.status === "Cleared").length} · ৳ ${money0(sumAmt(arr.filter(c => c.status === "Cleared")))}`, ""]]),
      repOne(repBox(`Cheques (${arr.length})`, ["~Date", "~A/C · Cheque", "~Holder", "Amount", "~Purpose / Detail", "Status"], arr.map(c => `<tr><td class="cd">${dmy(c.date)}</td><td><b>${esc(c.code)}</b> #${esc(c.no)}</td><td>${esc((am[c.code] || {}).holder || "")}</td><td class="r num b">${money0(c.amount)}</td><td>${esc(c.purpose.split(" (")[0])}${c.party || c.taker || c.remarks ? `<div class="mut" style="font-size:10px">${esc([c.party, c.taker, c.remarks].filter(Boolean).join(" · "))}</div>` : ""}</td><td class="r">${esc(c.status)}</td></tr>`).join(""), `<tr class="tot"><td colspan="3">TOTAL (live)</td><td class="r num">${money0(sumAmt(live))}</td><td colspan="2"></td></tr>`))), `Cheque_List_${f}_${t}`);
  };
  draw();
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
  saveLocal(d, rows) { try { localStorage.setItem(DRAFT_KEY(d), JSON.stringify({ rows, at: new Date().toISOString(), by: S.me.name, local: true })); } catch { } },
  dropLocal(d) { try { localStorage.removeItem(DRAFT_KEY(d)); } catch { } },
  localDates() { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("nabiad_draft_")) o.push(k.slice(13)); } return o.sort(); },
  async get(d) {
    const l = this.local(d); let s = null;
    if (navigator.onLine || DEMO) { try { s = await API.getDraft(d); } catch (e) { console.warn("draft", e); } }
    if (l && s) return new Date(l.at) > new Date(s.at) ? l : s; return l || s;
  },
  async save(d, rows) { this.saveLocal(d, rows); await API.saveDraft(d, rows); },
  async drop(d) { this.dropLocal(d); try { await API.deleteDraft(d); } catch { } }
};

async function vClosing(v) {
  const t = today(); let date = S.lastBal && S.lastBal < t ? stepDay(S.lastBal, 1) : t;
  if (date > t) date = t;
  v.innerHTML = head("ব্যাংক ক্লোজিং", `<span id="c-info" class="cinfo"></span>`) + `<div class="card navcard" style="margin-bottom:14px">${dateNav("c", date)}
   ${searchBox("c-q", "A/C খুঁজুন — কোড, হোল্ডার, ব্যাংক, A/C নং…", `<select class="in fix" id="c-f"><option value="">সব অ্যাকাউন্ট</option><option value="chg">শুধু আপডেট করা</option><option value="same">শুধু অপরিবর্তিত</option><option value="mv">আজ লেনদেন আছে</option></select>`)}
   <div id="c-msg" style="margin-top:10px"></div></div>
   <div class="card"><div id="c-body"><div class="empty">লোড হচ্ছে…</div></div></div>`;
  const body = $("#c-body", v); let autoT = null;
  async function draw() {
    date = $("#c-d", v).value; if (!date) return;
    body.innerHTML = `<div class="empty">লোড হচ্ছে…</div>`;
    let prev, ex;
    try { if (!navigator.onLine && !DEMO) throw new Error("offline"); [prev, ex] = await Promise.all([API.prevBalances(date), API.balancesOn(date)]); ex = { ...ex, ...pendingBal(date) }; }
    catch (e) {
      if (!isNetErr(e) && e.message !== "offline") throw e;
      const pds = pendingBalDates().filter(x => x < date).sort(), pd = pds.pop();
      prev = pd && (!S.snap || pd > S.snap.date) ? { date: pd, map: pendingBal(pd) } : S.snap && S.snap.date < date ? { date: S.snap.date, map: S.snap.map } : { date: null, map: {} };
      ex = pendingBal(date);
      if (!prev.date) { body.innerHTML = `<div class="alert am">ইন্টারনেট নেই এবং আগের দিনের ব্যালেন্স এই ডিভাইসে জমা নেই। একবার অনলাইনে ক্লোজিং পাতা খুললে পরে অফলাইনেও চলবে।</div>`; return; }
    }
    const accs = S.accounts.filter(a => a.daily && (a.status === "Active" || ex[a.code])).sort((a, b) => a.sort - b.sort);
    const has = Object.values(ex).some(r => r.total != null); const locked = has && (S.me.role !== "admin" || Object.values(ex).some(r => r.pending));
    const draft = has ? null : await Draft.get(date); const dr = draft?.rows || {};
    const cl = {}, tin = {}; S.cheques.forEach(c => { if (c.status === "Cleared" && c.sdate === date) { cl[c.code] = (cl[c.code] || 0) + c.amount; if (c.toac) tin[c.toac] = (tin[c.toac] || 0) + c.amount; } });
    const gap = prev.date ? workGap(prev.date, date) : 0;
    const msgs = [];
    if (has) msgs.push(`<div class="alert ${locked ? "rd" : "am"}">${locked ? "🔒 এই তারিখের ব্যালেন্স ফাইনাল সেভ হয়েছে। বদলাতে Admin কে বলুন।" : "⚠ এই তারিখ আগেই ফাইনাল সেভ আছে — সেভ করলে Admin হিসেবে নতুন মান বসবে।"}</div>`);
    else if (prev.date) msgs.push(`<div class="mut sm">আগের ডাটা: <b>${dmy(prev.date)}</b>${gap ? ` <b class="am">(${bi("মাঝে " + gap + " কর্মদিবসের ডাটা নেই", gap + " working days of data missing in between")})</b>` : ""} · ${bi("আগের দিনের ক্লোজিং নিজে থেকে বসানো আছে — শুধু যেগুলো বদলেছে সেগুলো লিখুন।", "Previous day's closing is pre-filled — only edit what changed.")}</div>`);
    if (draft) msgs.push(`<div class="alert vi">📝 <span>ড্রাফট লোড হয়েছে — ${esc(draft.by || "")} · ${new Date(draft.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${draft.local ? " (এই ডিভাইস)" : ""}</span><button class="btn sm" id="c-dd" style="margin-left:auto">ড্রাফট বাদ দিন</button></div>`);
    if (isFri(date) && !has) msgs.push(`<div class="alert am">শুক্রবার — সাধারণত ব্যাংক বন্ধ থাকে। দরকার না হলে "পরের ›" চাপুন।</div>`);
    $("#c-msg", v).innerHTML = msgs.join("");
    $("#c-dd", v) && ($("#c-dd", v).onclick = async () => { if (!ask("এই তারিখের ড্রাফট মুছে আগের দিনের ক্লোজিং থেকে নতুন করে শুরু করবেন?")) return; await Draft.drop(date); draw(); });
    const rows = accs.map(a => {
      const p = prev.map[a.code] || {}, e = ex[a.code] || {}, d = dr[a.code] || {};
      const src = has ? e : d;
      return { a, code: a.code, holder: a.holder, prevT: p.total || 0, prevB: p.block || 0, chq: cl[a.code] || 0, tin: tin[a.code] || 0, od: src.od || 0, odp: src.odp || 0,
        total: has ? e.total : (d.tot ?? null), block: has ? (e.block ?? 0) : (d.blk ?? p.block ?? 0), remark: src.remark ?? src.rem ?? "" };
    });
    const B = a => brandOf(a);
    body.innerHTML = `<div class="tw cards closing" style="max-height:72vh"><table id="ct"><thead><tr><th>#</th><th>A/C</th><th class="r">আগের ক্লোজিং</th><th class="r c-dr">চেক খরচ</th><th class="r c-dr">অন্য খরচ</th><th class="r c-cr">ট্রান্সফার জমা</th><th class="r c-cr">অন্য জমা</th><th class="r">হিসাব মতে</th><th class="r c-bk">ব্যাংক ক্লোজিং</th><th class="r">BLOCK</th><th class="r">USABLE</th><th class="r">Diff</th><th>মন্তব্য</th></tr></thead><tbody>
    ${rows.map((r, i) => { const b = B(r.a); return `<tr data-i="${i}" class="${r.chq || r.tin ? "mv" : ""}"><td class="mut">${i + 1}</td><td class="acc-c" style="--b1:${b.c1}"><b>${esc(r.code)}</b>${r.chq || r.tin ? ` <span class="mvdot" title="আজ অ্যাপে লেনদেন আছে — যাচাই করুন">●</span>` : ""}<div class="mut sm">${esc(r.holder)}</div></td><td class="r num">${money(r.prevT)}</td><td class="r num c-dr">${r.chq ? money(r.chq) : "-"}</td>
     <td class="c-dr"><input class="cell od" value="${fmtIn(r.od || "")}" inputmode="decimal" ${locked ? "disabled" : ""}></td><td class="r num c-cr">${r.tin ? money(r.tin) : "-"}</td><td class="c-cr"><input class="cell odp" value="${fmtIn(r.odp || "")}" inputmode="decimal" ${locked ? "disabled" : ""}></td>
     <td class="r num exp"></td><td class="c-bk"><input class="cell tot" value="${r.total == null ? "" : fmtIn(r.total)}" data-dirty="${r.total == null ? "" : "1"}" inputmode="decimal" ${locked ? "disabled" : ""}></td><td><input class="cell blk" value="${fmtIn(r.block || "")}" inputmode="decimal" ${locked ? "disabled" : ""}></td>
     <td class="r num usa b"></td><td class="r num dif"></td><td><input class="cell t rem" value="${esc(r.remark)}" ${locked ? "disabled" : ""}></td></tr>`; }).join("")}
    <tr class="tot"><td></td><td>মোট <span class="mut sm" id="T-n"></span></td><td class="r num" id="T0"></td><td class="r num c-dr" id="T1"></td><td class="r num c-dr" id="T2"></td><td class="r num c-cr" id="T3"></td><td class="r num c-cr" id="T4"></td><td class="r num" id="T5"></td><td class="r num c-bk t-bank" id="T6"></td><td class="r num" id="T7"></td><td class="r num t-usa" id="T8"></td><td class="r num t-diff" id="T9"></td><td></td></tr></tbody></table></div>
    ${locked ? "" : `<div class="cbar"><button class="btn lg fix" id="c-draft">${ico("edit")} ড্রাফট সেভ</button><button class="btn pri lg fix" id="c-save">${ico("save")} <span class="bl">ফাইনাল সেভ<small>${date === today() ? "আজকের" : dmy(date)}</small></span></button><div class="hint" id="c-err"></div><div class="sp"></div><span class="mut sm" id="c-auto"></span></div>`}
    <div class="legend"><span><i class="lg-chg"></i>নীল = আপডেট করা</span><span><i class="lg-same"></i>কালো = আগের দিনের মতোই</span><span><i class="lg-mv"></i>আজ অ্যাপে লেনদেন আছে</span><span><i class="lg-dr"></i>খরচ</span><span><i class="lg-cr"></i>জমা</span></div>
    <div class="mut sm" style="margin-top:6px">ফাইনাল সেভের পর Staff আর বদলাতে পারবে না। মাঝপথে থামতে "ড্রাফট সেভ" চাপুন — এই ডিভাইসে নিজে থেকেও জমা হয়। Diff ≠ 0 হলে মন্তব্য বাধ্যতামূলক।</div>`;
    const trs = $$("#ct tbody tr[data-i]", body);
    const calc = () => {
      const T = Array(10).fill(0); let nChg = 0, nMv = 0;
      trs.forEach(tr => {
        const r = rows[+tr.dataset.i]; const od = num($(".od", tr).value), odp = num($(".odp", tr).value), ti = $(".tot", tr), blkI = $(".blk", tr), blk = num(blkI.value);
        const exp = r.prevT - r.chq - od + r.tin + odp;
        if (!ti.dataset.dirty && document.activeElement !== ti) ti.value = fmtIn(exp);
        const tot = ti.value.trim() === "" ? exp : num(ti.value), diff = tot - exp, usa = tot - blk;
        const chg = !same(tot, exp) || (has && !same(tot, r.prevT) && !same(tot, exp));
        ti.classList.toggle("chg", chg); blkI.classList.toggle("chg", !same(blk, r.prevB));
        $(".od", tr).classList.toggle("chg", od !== 0); $(".odp", tr).classList.toggle("chg", odp !== 0);
        tr.classList.toggle("chgrow", chg); if (chg) nChg++; if (r.chq || r.tin) nMv++;
        $(".exp", tr).textContent = money(exp); $(".usa", tr).textContent = money(usa); const d = $(".dif", tr); d.textContent = diff ? money(diff) : "0"; d.className = "r num dif " + (Math.abs(diff) > 0.001 ? "diffx" : "diff0");
        [r.prevT, r.chq, od, r.tin, odp, exp, tot, blk, usa, diff].forEach((x, i) => T[i] += x);
        Object.assign(r, { _od: od, _odp: odp, _tot: tot, _blk: blk, _diff: diff, _exp: exp, _rem: $(".rem", tr).value.trim(), _chg: chg, _dirty: !!ti.dataset.dirty });
      });
      T.forEach((x, i) => $("#T" + i, body).textContent = money0(x));
      $("#T-n", body).textContent = `(${rows.length})`;
      $("#c-info", v).innerHTML = rows.length ? `<span class="tag t-chg">আপডেট করা ${nChg}</span><span class="tag">অপরিবর্তিত ${rows.length - nChg}</span>${nMv ? `<span class="tag t-mv">লেনদেন ${nMv}</span>` : ""}` : "";
      filter();
    };
    const filter = () => {
      const q = norm($("#c-q", v).value), f = $("#c-f", v).value;
      trs.forEach(tr => { const r = rows[+tr.dataset.i]; const ok = (!q || accHay(r.a).includes(q)) && (!f || (f === "chg" && r._chg) || (f === "same" && !r._chg) || (f === "mv" && (r.chq || r.tin))); tr.style.display = ok ? "" : "none"; });
    };
    const collect = () => Object.fromEntries(rows.map(r => [r.code, { od: r._od || 0, odp: r._odp || 0, tot: r._dirty ? r._tot : null, blk: r._blk || 0, rem: r._rem || "" }]));
    const autosave = () => { if (locked) return; clearTimeout(autoT); autoT = setTimeout(() => { Draft.saveLocal(date, collect()); const a = $("#c-auto", body); if (a) a.textContent = "✓ এই ডিভাইসে অটো-সেভ " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }, 700); };
    $$("#ct input", body).forEach(i => i.addEventListener("input", () => { if (i.classList.contains("tot")) i.dataset.dirty = i.value.trim() === "" ? "" : "1"; calc(); autosave(); }));
    $$("#ct input.cell:not(.rem)", body).forEach(inp => {
      inp.addEventListener("focus", () => inp.select());
      inp.addEventListener("blur", () => { if (inp.value.trim() !== "") inp.value = fmtIn(num(inp.value)); calc(); });
      inp.addEventListener("keydown", e => { if (e.key !== "Enter") return; e.preventDefault(); let tr = inp.closest("tr").nextElementSibling; while (tr && tr.style.display === "none") tr = tr.nextElementSibling; const cls = [...inp.classList].find(c => ["od", "odp", "tot", "blk"].includes(c)); const nx = tr && $("." + cls, tr); if (nx) nx.focus(); });
    });
    $("#c-q", v).oninput = filter; $("#c-f", v).onchange = filter;
    calc();
    if (locked) return;
    $("#c-draft", body).onclick = async () => {
      calc(); const b = $("#c-draft", body); b.disabled = true;
      try { await Draft.save(date, collect()); toast("✔ ড্রাফট সেভ হয়েছে — পরে যেকোনো ডিভাইস থেকে চালিয়ে যেতে পারবেন"); }
      catch (e) { toast(isNetErr(e) ? "ইন্টারনেট নেই — ড্রাফট শুধু এই ডিভাইসে জমা আছে" : "সার্ভারে ড্রাফট সেভ হয়নি (এই ডিভাইসে জমা আছে): " + (e.message || e), "err"); }
      finally { b.disabled = false; }
    };
    $("#c-save", body).onclick = async () => {
      calc(); const err = $("#c-err", body); err.className = "hint rd"; err.textContent = "";
      const bad = rows.filter(r => Math.abs(r._diff) > 0.001 && !r._rem);
      if (bad.length) { err.textContent = `Diff আছে কিন্তু মন্তব্য নেই: ${bad.map(r => r.code).join(", ")}`; $("#c-q", v).value = ""; $("#c-f", v).value = ""; filter(); trs[rows.indexOf(bad[0])].scrollIntoView({ block: "center" }); $(".rem", trs[rows.indexOf(bad[0])]).focus(); return; }
      const tot = rows.reduce((s, r) => s + r._tot, 0), blk = rows.reduce((s, r) => s + r._blk, 0), nChg = rows.filter(r => r._chg).length;
      if (!ask(bi(`${dmy(date)} — ফাইনাল সেভ\nমোট ক্লোজিং ৳ ${money0(tot)}, Block ${money0(blk)}, Usable ${money0(tot - blk)}\n${nChg}টি অ্যাকাউন্ট আপডেট, ${rows.length - nChg}টি আগের মতো।${S.me.role !== "admin" ? "\n\nসেভের পর আর বদলানো যাবে না (শুধু Admin পারবে)।" : ""}`, `${dmy(date)} — final save\nTotal closing ৳ ${money0(tot)}, Block ${money0(blk)}, Usable ${money0(tot - blk)}\n${nChg} account(s) updated, ${rows.length - nChg} unchanged.${S.me.role !== "admin" ? "\n\nAfter saving it cannot be changed (only an Admin can)." : ""}`))) return;
      $("#c-save", body).disabled = true;
      try {
        await API.saveBalances(date, rows.map(r => ({ code: r.code, total: r._tot, block: r._blk || null, remark: r._rem, od: r._od, odp: r._odp })), has && S.me.role === "admin");
        if (navigator.onLine && !Outbox.count()) S.lastBal = await API.lastBalDate(); else if (!S.lastBal || date > S.lastBal) S.lastBal = date;
        await Draft.drop(date); refreshBadges();
        toast(Outbox.count() ? "✔ অফলাইনে জমা হয়েছে — নেট এলে সিঙ্ক হবে" : "✔ ব্যালেন্স ফাইনাল সেভ হয়েছে");
        await draw();
        $("#c-msg", v).insertAdjacentHTML("afterbegin", `<div class="alert gr" style="margin-bottom:8px">✔ <span>${dmy(date)} ক্লোজিং সেভ হয়েছে।</span><a class="btn sm pri" style="margin-left:auto" href="#/crep" onclick="sessionStorage.setItem('nabiad_crep_date','${date}')">${ico("img")} রিপোর্ট দেখুন ও Boss-কে পাঠান</a></div>`);
      } catch (e) { err.textContent = e.message || String(e); toast(e.message || String(e), "err"); $("#c-save", body).disabled = false; }
    };
  }
  bindDateNav(v, "c", draw);
  await draw();
  return () => clearTimeout(autoT);
}

/* ---------- closing report + account history ---------- */
async function vCrep(v) {
  let date = sessionStorage.getItem("nabiad_crep_date") || S.lastBal || today(); sessionStorage.removeItem("nabiad_crep_date");
  const canShare = !!navigator.share;
  v.innerHTML = head("ব্যাংক ক্লোজিং রিপোর্ট", `<button class="btn" id="r-png">${ico("img")} ছবি</button><button class="btn" id="r-pdf">${ico("print")} PDF</button><button class="btn" id="r-xl">${ico("dl")} Excel</button>${canShare ? `<button class="btn" id="r-sh">${ico("share")} শেয়ার</button>` : ""}<button class="btn pri" id="r-em">${ico("mail")} Boss-কে ইমেইল</button>`) + `
   <div class="card noprint navcard" style="margin-bottom:14px">${dateNav("r", date)}${searchBox("r-q", "রিপোর্টে খুঁজুন — কোড, হোল্ডার, ব্যাংক…")}</div>
   <div class="card rep-wrap"><div class="rep-scroll"><div id="crep"></div></div></div>
   <div class="card noprint" style="margin-top:14px"><h3>অ্যাকাউন্ট ইতিহাস</h3><div class="row"><div style="flex:2 1 240px"><label class="f">A/C</label><div><input class="in" id="h-ac" placeholder="কোড টাইপ করুন"></div></div><div><label class="f">From</label><input class="in" type="date" id="h-f" value="${addDays(today(), -60)}"></div><div><label class="f">To</label><input class="in" type="date" id="h-t" value="${today()}"></div></div><div id="h-out" style="margin-top:12px"></div></div>`;
  let data = null, bm = {};
  async function load() { date = $("#r-d", v).value; bm = await balancesOn(date); draw(); }
  function draw() {
    const q = norm($("#r-q", v).value);
    const all = S.accounts.filter(a => a.daily && bm[a.code] && bm[a.code].total != null).sort((a, b) => a.sort - b.sort);
    const rows = all.filter(a => !q || accHay(a).includes(q)).map(a => ({ n: 0, a, total: bm[a.code].total, block: bm[a.code].block || 0, remark: bm[a.code].remark || "" }));
    rows.forEach((r, i) => r.n = i + 1); const T = rows.reduce((s, r) => ({ t: s.t + r.total, b: s.b + r.block }), { t: 0, b: 0 }); data = { rows, T, filtered: rows.length !== all.length, all: all.length };
    const wd = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" }), dl = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const usaN = rows.filter(r => r.total - r.block > 0).length, by = (bm[all[0]?.code] || {}).by;
    $("#crep", v).innerHTML = rows.length ? `<div class="rep" id="crep-in">
      ${dcHead("Daily Bank Closing Report · ব্যাংক ক্লোজিং রিপোর্ট" + (data.filtered ? ` · Filtered ${rows.length}/${all.length}` : ""), date, date)}
      <div class="rep-kpi"><div><span>Accounts</span><b>${rows.length}</b></div><div class="k1"><span>Total Balance</span><b>৳ ${money0(T.t)}</b></div><div class="k2"><span>Block / Lien</span><b>৳ ${money0(T.b)}</b></div><div class="k3"><span>Usable (${usaN} A/C)</span><b>৳ ${money0(T.t - T.b)}</b></div></div>
      <table class="rep-t"><thead><tr><th class="r">#</th><th>A/C Code</th><th>Account Holder</th><th class="r">Total</th><th class="r bk">Block</th><th class="r us">Usable</th><th>Remarks</th></tr></thead><tbody>
      ${rows.map(r => { const u = r.total - r.block; return `<tr><td class="n">${r.n}</td><td class="cd"><i class="bdot" style="background:${brandOf(r.a).c1}"></i>${esc(r.a.code)}</td><td class="ho">${esc(r.a.holder)}</td><td class="r num">${money0(r.total)}</td><td class="r num ${r.block ? "bk" : "z"}">${r.block ? money0(r.block) : "—"}</td><td class="r num ${u > 0 ? "us" : "z"}">${u > 0 ? money0(u) : u < 0 ? money0(u) : "0"}</td><td class="rm">${esc(r.remark)}</td></tr>`; }).join("")}
      <tr class="tot"><td></td><td colspan="2">GRAND TOTAL</td><td class="r num">${money0(T.t)}</td><td class="r num">${money0(T.b)}</td><td class="r num">${money0(T.t - T.b)}</td><td></td></tr></tbody></table>
      ${dcFoot(by ? " · Entered by " + esc(by) : "")}</div>` : `<div class="empty">${all.length ? "খোঁজার সাথে কিছু মেলেনি" : "এই তারিখে কোনো ব্যালেন্স সেভ নেই"}</div>`;
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
  $("#r-em", v).onclick = () => {
    if (!data?.rows.length) return toast("ডাটা নেই", "err"); const T = data.T;
    const L = [`Bank Closing — ${dmy(date)}`, "", `Total Balance: ${money0(T.t)}`, `Block / Lien: ${money0(T.b)}`, `Usable: ${money0(T.t - T.b)}`, `Accounts: ${data.rows.length}`, "", ...data.rows.map(r => `${r.n}. ${r.a.code} — ${r.a.holder}: ${money0(r.total)}${r.block ? ` (Block ${money0(r.block)})` : ""}${r.remark ? " · " + r.remark : ""}`), "", `— ${S.me.name}, NABIAD Cheque & Bank Control`];
    let body = L.join("\n"); if (body.length > 1800) body = L.slice(0, 7).join("\n") + "\n\n" + bi("(পূর্ণ রিপোর্ট PDF/ছবি সংযুক্ত করুন)", "(attach the full report PDF/image)") + "\n— " + S.me.name;
    location.href = `mailto:${encodeURIComponent(CFG.BOSS_EMAIL || "")}?subject=${encodeURIComponent(`Bank Closing ${dmy(date)} — Usable ${money0(T.t - T.b)}`)}&body=${encodeURIComponent(body)}`;
  };
  $("#r-xl", v).onclick = () => data?.rows.length ? exportXlsx({ Closing: [[dmy2(date), "A/C", "Code", "TOTAL", "BLOCK", "USABLE", "REMARKS"], ...data.rows.map(r => [r.n, r.a.holder, r.a.code, r.total, r.block, r.total - r.block, r.remark]), ["", "TOTAL", "", data.T.t, data.T.b, data.T.t - data.T.b, ""]] }, `Closing_${date}.xlsx`) : toast("ডাটা নেই", "err");
  const hAc = suggest($("#h-ac", v), () => acItems(true), () => hist());
  async function hist() {
    const c = hAc.get()?.value; if (!c) return; const rows = await API.history(c, $("#h-f", v).value, $("#h-t", v).value);
    if (!rows.length) { $("#h-out", v).innerHTML = `<div class="empty">ডাটা নেই</div>`; return; }
    const max = Math.max(...rows.map(r => r.total)), min = Math.min(...rows.map(r => r.total)), W = 700, H = 120, rg = max - min || 1;
    const pts = rows.map((r, i) => `${(i / Math.max(1, rows.length - 1) * W).toFixed(1)},${(H - 8 - (r.total - min) / rg * (H - 16)).toFixed(1)}`).join(" ");
    $("#h-out", v).innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:120px"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><polyline fill="none" stroke="url(#lg)" stroke-width="2.5" points="${pts}"/></svg>
     <div class="mut sm">সর্বোচ্চ ${money0(max)} · সর্বনিম্ন ${money0(min)} · ${rows.length} ${bi("দিন", "days")}</div><div class="tw" style="max-height:300px;margin-top:8px"><table><thead><tr><th>তারিখ</th><th class="r">Total</th><th class="r">Block</th><th class="r">Usable</th><th>মন্তব্য</th></tr></thead><tbody>${[...rows].reverse().map(r => `<tr><td>${dmy(r.date)}</td><td class="r num">${money0(r.total)}</td><td class="r num">${r.block ? money0(r.block) : ""}</td><td class="r num">${money0(r.total - (r.block || 0))}</td><td class="mut sm">${esc(r.remark || "")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  $("#h-f", v).onchange = hist; $("#h-t", v).onchange = hist; await load();
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
  modal(`<h2>${b.id ? bi("বই এডিট", "Edit cheque book") : bi("নতুন চেক বই", "New cheque book")}</h2><div class="grid" style="gap:10px">
   <div><label class="f">A/C Code <span class="mut">(${bi("টাইপ করুন: ibbl, 905, nabiad…", "type: ibbl, 905, nabiad…")})</span></label><div><input class="in big" id="b-c" autocomplete="off" placeholder="IBBL-905"></div><div class="hint" id="b-ach"></div></div>
   <div class="noprint"><label class="btn sm" for="b-ph">📷 ${bi("বইয়ের কভার স্ক্যান করে ভরুন", "Scan book cover to auto-fill")}</label><input type="file" id="b-ph" accept="image/*" hidden><div class="mut xs" id="b-ocro" style="margin-top:4px"></div></div>
   <div class="row"><div><label class="f">${bi("সিরিজ (CD/SB…)", "Series (CD/SB…)")}</label><input class="in" id="b-s" value="${esc(b.series || "")}" autocomplete="off" style="text-transform:uppercase"></div><div><label class="f">Status</label><select class="in" id="b-st">${["Active", "Finished", "Lost"].map(s => `<option ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
   <div class="row"><div><label class="f">${bi("প্রথম পাতা", "First leaf")}</label><input class="in" id="b-f" value="${b.first ?? ""}" inputmode="numeric" autocomplete="off"></div><div><label class="f">${bi("শেষ পাতা", "Last leaf")}</label><input class="in" id="b-l" value="${b.last ?? ""}" inputmode="numeric" autocomplete="off"></div></div>
   <div class="chips" id="b-q"><span class="mut xs" style="align-self:center">${bi("পাতার সংখ্যা:", "Leaves:")}</span>${[10, 25, 50, 100].map(n => `<span class="chip" data-n="${n}">${n}</span>`).join("")}</div>
   <div><label class="f">${bi("ট্র্যাক শুরু — পাতা নং (ঐচ্ছিক)", "Track from — leaf no. (optional)")}</label><div class="row" style="gap:8px"><input class="in" id="b-t" value="${b.track ?? ""}" inputmode="numeric" autocomplete="off" placeholder="${bi("ফাঁকা = প্রথম পাতা থেকে", "empty = from first leaf")}"><button type="button" class="btn sm fix" id="b-t1">${bi("= প্রথম পাতা", "= first leaf")}</button></div>
    <div class="mut xs" style="margin-top:4px">${bi("সিস্টেম চালুর আগে যে পাতাগুলো এন্ট্রি হয়নি সেগুলো মিসিং ধরা এড়াতে এখানে পাতার নম্বর (তারিখ নয়) দিন। ফাঁকা রাখলে প্রথম পাতা থেকেই গোনা হবে।", "To avoid flagging leaves used before go-live as missing, enter a leaf number here (not a date). Leave empty to count from the first leaf.")}</div></div>
   <div id="b-ex" class="mut xs"></div>
   <div id="b-info" class="hint" style="min-height:18px"></div>
   <div><label class="f">${bi("নোট", "Note")}</label><input class="in" id="b-n" value="${esc(b.note || "")}"></div>
   <div class="row"><button class="btn pri" id="b-ok">${bi("সেভ", "Save")}</button>${b.id ? `<button class="btn bad" id="b-dl">${bi("মুছুন", "Delete")}</button>` : ""}<button class="btn" id="b-x">${bi("বাতিল", "Cancel")}</button></div></div>`, (root, close) => {
    const g = id => $("#" + id, root), digits = x => String(x ?? "").trim().replace(/[,\s]/g, "");
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
      if (!/^\d+$/.test(fs) || (ls && !/^\d+$/.test(ls))) return out(2, bi("পাতার নম্বর শুধু সংখ্যা হবে", "Leaf numbers must be digits only"));
      const f = +fs, l = ls ? +ls : null;
      if (l !== null && l < f) return out(2, bi("শেষ পাতা প্রথম পাতার চেয়ে ছোট হতে পারে না", "Last leaf cannot be before the first leaf"));
      if (ts) { if (!/^\d+$/.test(ts)) return out(2, bi("ট্র্যাক শুরুতে পাতার নম্বর দিন — তারিখ নয়", "Track-from needs a leaf number — not a date")); if (+ts < f || (l !== null && +ts > l)) return out(2, bi(`ট্র্যাক শুরু ${f}–${l ?? "?"}-এর মধ্যে হতে হবে`, `Track-from must be between ${f} and ${l ?? "?"}`)); }
      const clash = S.books.find(x => x.code === code && x.id !== b.id && (x.series || "").toUpperCase() === ser && f <= (x.last ?? Infinity) && (l ?? f) >= x.first);
      if (clash) return out(2, bi(`এই অ্যাকাউন্টের আরেকটি বইয়ের সাথে মিলে যাচ্ছে: ${clash.series || ""} ${clash.first}–${clash.last ?? "?"}`, `Overlaps another book of this account: ${clash.series || ""} ${clash.first}–${clash.last ?? "?"}`));
      const n = l !== null ? l - f + 1 : null, used = S.cheques.filter(c => c.code === code && c.no >= f && (l === null || c.no <= l)).length;
      const warn = l !== null && (n > 500 || (fs.length !== ls.length)) ? bi(" · ⚠ সংখ্যা অস্বাভাবিক — মিলিয়ে নিন", " · ⚠ unusual range — please verify") : "";
      $$("#b-q .chip", root).forEach(c => c.classList.toggle("on", n === +c.dataset.n));
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
async function vBooks(v) {
  const admin = S.me.role === "admin";
  const draw = () => {
    const am = accMap(), rows = S.books.map(b => ({ b, st: bookStats(b) })), miss = rows.reduce((s, r) => s + (r.b.status === "Active" ? r.st.missing.length : 0), 0);
    v.innerHTML = head("চেক বই ও মিসিং পাতা", admin ? `<button class="btn pri" id="bk-add">${ico("plus")} নতুন বই</button>` : "") + (miss ? `<div class="alert rd" style="margin-bottom:14px">📚 মোট <b>${miss}</b>টি পাতা মিসিং — নিচের লাল তালিকা দেখুন।</div>` : `<div class="alert gr" style="margin-bottom:14px">✔ কোনো মিসিং পাতা নেই</div>`) +
      `<div class="card flush">${rows.length ? `<div class="tw cards"><table><thead><tr><th>A/C</th><th>সিরিজ</th><th class="r">প্রথম–শেষ</th><th class="r">ট্র্যাক</th><th class="r">ব্যবহৃত</th><th class="r">সর্বশেষ</th><th class="r">বাকি</th><th>মিসিং পাতা</th><th>Status</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.map(({ b, st }) => `<tr><td><b>${esc(b.code)}</b><div class="mut sm">${esc((am[b.code] || {}).holder || "")}</div></td><td>${esc(b.series || "")}</td><td class="r num">${b.first}–${b.last ?? "?"}</td><td class="r num">${b.track ?? "—"}</td><td class="r num">${st.used}</td><td class="r num">${st.maxUsed ?? "—"}</td><td class="r num">${st.remaining ?? "—"}</td>
       <td>${st.missing.length ? `<span class="rd b">${st.missing.length}টি:</span> <span class="sm">${st.missing.slice(0, 30).join(", ")}${st.missing.length > 30 ? "…" : ""}</span>` : `<span class="mut">—</span>`}</td><td>${esc(b.status)}</td>${admin ? `<td><button class="btn sm" data-e="${b.id}">✎</button></td>` : ""}</tr>`).join("")}</tbody></table></div>` : `<div class="empty">${bi("এখনো কোনো চেক বই যোগ করা হয়নি", "No cheque books added yet")}${admin ? bi(' — "+ নতুন বই" চাপুন', ' — tap "+ New book"') : ""}</div>`}</div>`;
    $("#bk-add", v) && ($("#bk-add", v).onclick = () => bookModal(null, draw)); $$("[data-e]", v).forEach(b => b.onclick = () => bookModal(S.books.find(x => x.id === b.dataset.e), draw));
  };
  draw();
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
  modal(`<h2>${ico("img")} Cheque book · ${esc(a.code)}</h2><div class="mut sm">${esc(a.holder || "")} · ${esc(a.bank || "")}</div><div id="bk-i" style="margin-top:10px"><div class="skel" style="height:200px"></div></div><div class="row" style="margin-top:12px"><button class="btn pri" id="bk-s">${ico("share")} শেয়ার</button><button class="btn fix" id="bk-x">বন্ধ</button></div>`, (root, close) => {
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
   <div class="row accf-bar"><button class="btn pri fix" id="a-ok">${ico("save")} সেভ</button><button class="btn fix" id="a-x">বাতিল</button>${isNew ? "" : `<button class="btn fix" id="a-sh" style="margin-left:auto">${ico("share")} শেয়ার</button>`}</div></div>
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
      const sw = SWIFT[pre]; g("a-wh").innerHTML = sw && c.swift !== sw ? `<button class="btn sm ghost" id="a-ws">💡 ${bi(sw + " বসান", "Use " + sw)}</button> <span class="mut xs">${bi("ব্যাংক থেকে নিশ্চিত হয়ে নিন", "Confirm with the bank")}</span>` : "";
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
   <div class="row" style="margin-top:12px"><button class="btn pri fix hide" id="bi-ok">আপলোড</button><button class="btn fix" id="bi-x">বন্ধ</button></div>`, (root, close) => {
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
async function vAccounts(v) {
  const admin = S.me.role === "admin", sel = new Set(); const F = { q: "", b: "", h: "", st: "Active", miss: "" };
  const banks = [...new Set(S.accounts.map(a => a.bank).filter(Boolean))].sort(), holders = [...new Set(S.accounts.map(a => a.holder).filter(Boolean))].sort();
  v.innerHTML = head("অ্যাকাউন্ট খুঁজুন", admin ? `<button class="btn" id="ad-imp">${ico("cam")} ছবি ইমপোর্ট</button><button class="btn pri" id="ad-add">${ico("plus")} নতুন অ্যাকাউন্ট</button>` : "") + `<div class="card noprint" style="margin-bottom:12px">
    ${searchBox("ad-q", "কোড, নাম, ব্যাংক, শাখা, A/C বা Routing নং — যেমন: 483, pubali")}
    <div class="aufl" style="margin-top:8px"><select class="in" id="ad-b"><option value="">সব ব্যাংক</option>${banks.map(b => `<option>${esc(b)}</option>`).join("")}</select><select class="in" id="ad-h"><option value="">সব হোল্ডার</option>${holders.map(b => `<option>${esc(b)}</option>`).join("")}</select><select class="in" id="ad-s"><option value="Active">Active</option><option value="">সব</option><option value="Closed">Closed</option></select></div>
    <div class="mchips" id="ad-m"></div></div>
   <div class="mut sm" id="ad-n" style="margin-bottom:8px"></div><div class="acc-grid" id="ad-out"></div><div id="ad-selbar" class="selbar hide"></div>`;
  const base = () => S.accounts.filter(a => (!F.b || a.bank === F.b) && (!F.h || a.holder === F.h) && (!F.st || a.status === F.st));
  const mf = { mfs: a => isMFS(a), inc: a => !isMFS(a) && accMissing(a).length > 0, ok: a => !isMFS(a) && !accMissing(a).length, acno: a => accMissing(a).some(m => m.k === "acno"), routing: a => accMissing(a).some(m => m.k === "routing"), branch: a => accMissing(a).some(m => m.k === "branch"), type: a => accMissing(a).some(m => m.k === "type"), nophoto: a => !isMFS(a) && !a.book_photo };
  const selbar = () => { const el = $("#ad-selbar", v); if (!sel.size) return el.classList.add("hide"); el.classList.remove("hide"); el.innerHTML = `<b>${sel.size}</b> <span>টি নির্বাচিত</span><button class="btn sm pri" id="sb-sh">${ico("share")} শেয়ার</button><button class="btn sm" id="sb-cp">${ico("copy")} কপি</button><button class="btn sm ghost" id="sb-x">✕</button>`;
    const list = () => S.accounts.filter(a => sel.has(a.code)); $("#sb-sh", el).onclick = () => shareAccounts(list()); $("#sb-cp", el).onclick = () => copyText(accText(list()), "✔ নির্বাচিত অ্যাকাউন্টের তথ্য কপি হয়েছে"); $("#sb-x", el).onclick = () => { sel.clear(); draw(); }; };
  const draw = () => {
    const q = norm(F.q), b0 = base(), cnt = k => b0.filter(mf[k]).length;
    $("#ad-m", v).innerHTML = [["", "সব", b0.length], ["inc", "⚠ তথ্য অসম্পূর্ণ", cnt("inc")], ["ok", "✓ সম্পূর্ণ", cnt("ok")], ["acno", "A/C নং নেই", cnt("acno")], ["routing", "Routing নেই", cnt("routing")], ["branch", "শাখা নেই", cnt("branch")], ["type", "ধরন নেই", cnt("type")], ["nophoto", "📷 ছবি নেই", cnt("nophoto")], ["mfs", "📱 মোবাইল ব্যাংকিং", cnt("mfs")]].filter(([k, , n]) => !k || n || F.miss === k).map(([k, l, n]) => `<span class="chip ${F.miss === k ? "on" : ""} ${k && k !== "ok" ? "warn" : ""}" data-mf="${k}"><span>${l}</span> <b>${n}</b></span>`).join("");
    $$("#ad-m [data-mf]", v).forEach(c => c.onclick = () => { F.miss = c.dataset.mf; draw(); });
    const arr = b0.filter(a => (!F.miss || mf[F.miss](a)) && (!q || norm([a.code, a.holder, a.bank, a.branch, a.acno, a.type, a.routing, a.swift].join(" ")).includes(q))).sort((x, y) => (x.sort || 0) - (y.sort || 0));
    $("#ad-n", v).innerHTML = `<b>${arr.length}</b>টি অ্যাকাউন্ট${arr.length ? ` · <a href="#" id="ad-all">সব নির্বাচন</a>` : ""}`;
    $("#ad-out", v).innerHTML = arr.map(a => { const n = S.cheques.filter(c => c.code === a.code).length, br = brandOf(a), miss = accMissing(a), pct = accPct(a); return `<div class="card acc ${sel.has(a.code) ? "picked" : ""}" style="--b1:${br.c1};--b2:${br.c2}"><div class="hd"><label class="pick" title="নির্বাচন"><input type="checkbox" data-sel="${esc(a.code)}" ${sel.has(a.code) ? "checked" : ""}><i></i></label><span class="blogo">${esc(br.s)}</span><span class="code">${esc(a.code)}</span>${a.status !== "Active" ? `<span class="tag cl">${esc(a.status)}</span>` : ""}<span style="flex:1"></span><span class="hacts">${a.book_photo ? `<button class="btn sm ghost" data-ph="${esc(a.code)}" title="Cheque ছবি">${ico("img")}</button>` : ""}<button class="btn sm ghost" data-sh="${esc(a.code)}" title="শেয়ার">${ico("share")}</button>${admin ? `<button class="btn sm ghost" data-e="${esc(a.code)}" title="এডিট">${ico("edit")}</button>` : ""}</span></div><div class="bd">
      <div class="b">${esc(a.holder || "")}${a.type ? ` <span class="tag typ">${esc(a.type)}</span>` : ""}</div><div class="bk">${esc(a.bank || "")}${a.branch ? " · " + esc(a.branch) : ""}</div>
      ${a.acno ? `<div class="no"><span>${esc(fmtAcno(a.acno))}</span><button class="btn sm ghost" data-cp="${esc(a.acno)}" title="কপি">${ico("copy")} কপি</button></div>` : isMFS(a) ? `<div class="nomiss" style="color:var(--mut,#8b93a7)">📱 মোবাইল ব্যাংকিং (শাখা/Routing/SWIFT প্রযোজ্য নয়)</div>` : `<div class="nomiss">A/C নং দেওয়া নেই</div>`}
      ${a.routing || a.swift ? `<div class="rt">${a.routing ? `<span>Routing <b>${esc(a.routing)}</b> <button class="lnkb" data-cp="${esc(a.routing)}">কপি</button></span>` : ""}${a.swift ? `<span>SWIFT <b>${esc(a.swift)}</b></span>` : ""}</div>` : ""}
      ${miss.length ? `<div class="cmpl"><div class="bar"><i style="width:${pct}%"></i></div><div class="cmpl-t"><span class="am xs">${pct}% · <span>বাকি:</span> ${miss.map(m => `<span>${m.l}</span>`).join(", ")}</span>${admin ? `<button class="lnkb" data-e="${esc(a.code)}">পূরণ করুন</button>` : ""}</div></div>` : ""}
      <div class="mut sm">${n ? `${n}টি চেক · <a href="#/cheques" data-go="${esc(a.code)}">দেখুন</a>` : "এখনো চেক নেই"}${a.daily ? " · দৈনিক ক্লোজিং" : ""}${a.note ? ` · <span title="${esc(a.note)}">📝 ${esc(a.note.slice(0, 30))}</span>` : ""}</div></div></div>`; }).join("") || `<div class="card empty" style="grid-column:1/-1">কিছু পাওয়া যায়নি</div>`;
    $$("[data-cp]", v).forEach(x => x.onclick = () => copyText(x.dataset.cp, "✔ কপি হয়েছে"));
    $$("[data-e]", v).forEach(x => x.onclick = () => accountModal(S.accounts.find(a => a.code === x.dataset.e), () => vAccounts(v)));
    $$("[data-ph]", v).forEach(x => x.onclick = () => viewBookPhoto(S.accounts.find(a => a.code === x.dataset.ph)));
    $$("[data-sh]", v).forEach(x => x.onclick = () => shareAccounts([S.accounts.find(a => a.code === x.dataset.sh)]));
    $$("[data-go]", v).forEach(x => x.onclick = () => sessionStorage.setItem("nabiad_chq_ac", x.dataset.go));
    $$("[data-sel]", v).forEach(x => x.onchange = () => { x.checked ? sel.add(x.dataset.sel) : sel.delete(x.dataset.sel); x.closest(".acc").classList.toggle("picked", x.checked); selbar(); });
    $("#ad-all", v) && ($("#ad-all", v).onclick = e => { e.preventDefault(); arr.forEach(a => sel.add(a.code)); draw(); });
    selbar();
  };
  $("#ad-q", v).oninput = e => { F.q = e.target.value; draw(); }; $("#ad-b", v).onchange = e => { F.b = e.target.value; draw(); }; $("#ad-h", v).onchange = e => { F.h = e.target.value; draw(); }; $("#ad-s", v).onchange = e => { F.st = e.target.value; draw(); };
  $("#ad-imp", v) && ($("#ad-imp", v).onclick = () => bookImportModal(() => vAccounts(v)));
  $("#ad-add", v) && ($("#ad-add", v).onclick = () => accountModal(null, () => vAccounts(v)));
  draw(); setTimeout(() => $("#ad-q", v)?.focus(), 50);
}
async function vAdmin(v) {
  let tab = sessionStorage.getItem("nabiad_admin_tab") || "acc";
  const draw = async () => {
    sessionStorage.setItem("nabiad_admin_tab", tab);
    v.innerHTML = head("অ্যাডমিন প্যানেল") + `<div class="tabs ntabs">${[["acc", "🏦", "অ্যাকাউন্ট"], ["usr", "👥", "ব্যবহারকারী"], ["imp", "📥", "পুরনো ডাটা"], ["help", "🧰", "সেটআপ"]].map(([k, i, l]) => `<span class="chip ${k === tab ? "on" : ""}" data-t="${k}"><i class="te">${i}</i> <span>${l}</span></span>`).join("")}</div><div id="ad"></div>`;
    $$("[data-t]", v).forEach(c => c.onclick = () => { tab = c.dataset.t; draw(); }); const out = $("#ad", v);
    if (tab === "acc") {
      const F = { q: "", st: "Active" };
      out.innerHTML = `<div class="card noprint" style="margin-bottom:12px"><div class="srch" style="margin-top:0"><label class="si">${ico("search")}<input class="in" id="aa-q" placeholder="কোড, হোল্ডার, ব্যাংক, A/C নং…" autocomplete="off" type="search"></label><select class="in fix" id="aa-s"><option value="Active">Active</option><option value="">সব</option><option value="Closed">Closed</option></select><button class="btn pri fix" id="ac-add">${ico("plus")} <span class="lbl2">নতুন</span></button></div></div><div class="mut sm" id="aa-n" style="margin-bottom:8px"></div><div class="card flush"><div class="alist" id="aa-out"></div></div>`;
      const list = () => {
        const q = norm(F.q), arr = S.accounts.filter(a => (!F.st || a.status === F.st) && (!q || accHay(a).includes(q))).sort((a, b) => (a.sort || 0) - (b.sort || 0));
        $("#aa-n", out).innerHTML = `<b>${arr.length}</b>টি অ্যাকাউন্ট · <span>দৈনিক ক্লোজিং-এ</span> ${arr.filter(a => a.daily).length}`;
        $("#aa-out", out).innerHTML = arr.map(a => { const b = brandOf(a); return `<div class="ar" style="--b1:${b.c1}"><span class="blg" style="background:${b.c1}">${esc(b.s)}</span><div class="acm"><div><b>${esc(a.code)}</b> <span class="mut sm">#${a.sort ?? ""}</span>${a.status !== "Active" ? ` <span class="tag cl">${esc(a.status)}</span>` : ""}${a.daily ? ` <span class="tag t-chg">দৈনিক</span>` : ""}</div><div class="sm">${esc(a.holder || "")}</div><div class="mut xs">${esc(a.bank || "")}${a.acno ? " · " + esc(a.acno) : ""}</div></div><button class="btn sm" data-a="${esc(a.code)}">${ico("edit")}</button></div>`; }).join("") || `<div class="empty">কিছু পাওয়া যায়নি</div>`;
        $$("[data-a]", out).forEach(b => b.onclick = () => accountModal(S.accounts.find(x => x.code === b.dataset.a), draw));
      };
      $("#aa-q", out).oninput = e => { F.q = e.target.value; list(); }; $("#aa-s", out).onchange = e => { F.st = e.target.value; list(); };
      $("#ac-add", out).onclick = () => accountModal(null, draw); list();
    } else if (tab === "usr") {
      out.innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
      let us = [], secM = {}; try { us = await API.users(); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(e.message)}</div>`; return; }
      try { (await API.userSec()).forEach(x => secM[x.user_id] = x); } catch { }
      out.innerHTML = `<div class="row ubar"><div><b>${us.length} ${LANG === "en" ? "users" : "জন ব্যবহারকারী"}</b><div class="mut xs">${LANG === "en" ? "Create accounts, edit profiles, set roles and reset passwords here" : "এখান থেকেই অ্যাকাউন্ট খোলা, প্রোফাইল এডিট, Role দেওয়া ও পাসওয়ার্ড রিসেট"}</div></div><button class="btn pri" id="u-new">${ico("plus")} ${LANG === "en" ? "New user" : "নতুন ব্যবহারকারী"}</button></div>
       <div class="ulist">${us.map(u => `<div class="card uc ${u.active ? "" : "off"}" data-u="${u.id}"><div class="uh">${avaEl(u.id, u.name, u.email)}<div class="ue"><b>${esc(u.name || "—")}</b><div class="mut xs">${esc(u.email)}</div></div></div>
        <div class="row" style="gap:6px;margin-bottom:12px"><span class="pill">${esc(u.role)}</span><span class="tag ${u.active ? "ok" : "off"}">${u.active ? (LANG === "en" ? "Active" : "সক্রিয়") : (LANG === "en" ? "Inactive" : "নিষ্ক্রিয়")}</span>${secM[u.id]?.has_2fa ? `<span class="tag ok" title="2FA">🔐 2FA</span>` : ""}${secM[u.id]?.sessions ? `<span class="tag" title="${LANG === "en" ? "Signed-in devices" : "লগইন ডিভাইস"}">📱 ${secM[u.id].sessions}</span>` : ""}${u.role === "staff" ? `<span class="tag ${u.edit_days ? "ok" : "off"}" title="${LANG === "en" ? "Edit window for own entries" : "নিজের এন্ট্রি এডিটের সময়"}">✎ ${u.edit_days ? u.edit_days + (LANG === "en" ? " day" : " দিন") : (LANG === "en" ? "Edit off" : "এডিট বন্ধ")}</span>` : ""}${u.id === S.me.id ? `<span class="mut xs">${LANG === "en" ? "This is you" : "এটা আপনি"}</span>` : ""}</div>
        <div class="row"><button class="btn pri sm fix" data-ed="${u.id}">✏️ ${LANG === "en" ? "Edit" : "এডিট"}</button><button class="btn sm fix" data-pw="${u.id}">🔑 ${LANG === "en" ? "Reset password" : "পাসওয়ার্ড রিসেট"}</button><button class="btn sm fix" data-sc="${u.id}">🛡 ${LANG === "en" ? "Security" : "সিকিউরিটি"}</button></div></div>`).join("")}</div>`;
      $("#u-new", out).onclick = () => newUserModal(draw);
      $$("[data-ed]", out).forEach(b => b.onclick = () => editUserModal(us.find(u => u.id === b.dataset.ed), draw));
      $$("[data-sc]", out).forEach(b => b.onclick = () => userSecModal(us.find(u => u.id === b.dataset.sc), draw));
      $$("[data-pw]", out).forEach(b => b.onclick = () => resetPwModal(us.find(u => u.id === b.dataset.pw)));
    } else if (tab === "imp") {
      out.innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
      let st = { n: 0, first: null, last: null }; try { st = await API.balanceStats(); } catch { }
      out.innerHTML = `<div class="card"><h3>📥 পুরনো ব্যাংক ব্যালেন্স ইতিহাস</h3>
        <div class="grid g3" style="margin:12px 0"><div class="kv"><span>ডাটাবেসে রেকর্ড</span><b class="num">${money0(st.n)}</b></div><div class="kv"><span>সবচেয়ে পুরনো তারিখ</span><b>${st.first ? dmy(st.first) : "—"}</b></div><div class="kv"><span>সর্বশেষ তারিখ</span><b>${st.last ? dmy(st.last) : "—"}</b></div></div>
        ${DEMO ? `<div class="alert gr">${bi("DEMO মোডে পুরনো ডাটা আগে থেকেই লোড আছে।", "In DEMO mode the old data is already loaded.")}</div>` : `<div class="imopt"><div><b>২০২৬ ডাটা পুনরুদ্ধার</b><div class="mut xs">২০২৬-এর সব রেকর্ড + ২০২৬-এর ঠিক আগের শেষ দিনটি (ওটাই ১ জানুয়ারির Opening)</div></div><button class="btn pri" id="im-26">⬆ শুধু ২০২৬</button></div>
        <div class="imopt"><div><b>সম্পূর্ণ ইতিহাস</b><div class="mut xs">০২-০৯-২০২৩ (প্রথম দিন) থেকে ফাইলের শেষ তারিখ পর্যন্ত সব</div></div><button class="btn" id="im-all">⬆ সম্পূর্ণ import</button></div>`}
        <div class="bar" style="margin-top:12px"><i id="im-bar" style="width:0"></i></div><div class="hint" id="im-t"></div>
        <div class="mut xs" style="margin-top:8px">শুধু যে তারিখ+A/C ডাটাবেসে নেই সেগুলোই যোগ হয় — আপনার app-এ সেভ/এডিট করা কোনো ব্যালেন্স বদলায় না, ডুপ্লিকেটও হয় না।</div></div>`;
      const run = async (mode) => {
        const b26 = $("#im-26", out), ball = $("#im-all", out);
        try {
          const all = await loadEncrypted("history.enc"); const anchor = all.map(r => r[0]).filter(d => d < "2026-01-01").sort().pop() || "2026-01-01";
          const rows = mode === "26" ? all.filter(r => r[0] >= anchor) : all;
          if (!ask(bi(`${money0(rows.length)}টি রেকর্ড (${dmy(rows.reduce((m, r) => r[0] < m ? r[0] : m, rows[0][0]))} থেকে) import করবেন? যেগুলো আগে থেকেই আছে সেগুলো বদলাবে না।`, `Import ${money0(rows.length)} record(s) (from ${dmy(rows.reduce((m, r) => r[0] < m ? r[0] : m, rows[0][0]))})? Existing records will not be changed.`))) return;
          b26.disabled = ball.disabled = true;
          await API.importBalances(rows, (a, b) => { $("#im-bar", out).style.width = a / b * 100 + "%"; $("#im-t", out).textContent = `${a} / ${b}`; });
          balCache.clear(); toast("✔ import সম্পূর্ণ"); S.lastBal = await API.lastBalDate(); draw();
        } catch (e) { toast(e.message, "err"); b26 && (b26.disabled = ball.disabled = false); }
      };
      $("#im-26", out) && ($("#im-26", out).onclick = () => run("26")); $("#im-all", out) && ($("#im-all", out).onclick = () => run("all"));
    } else {
      out.innerHTML = `<div class="card empty">সিস্টেম পরীক্ষা হচ্ছে…</div>`;
      const chk = await API.health().catch(() => ({}));
      const row = (ok, l, sub) => `<div class="hc ${ok ? "ok" : "no"}"><i>${ok ? "✓" : "✗"}</i><div><b>${l}</b>${sub ? `<div class="mut xs">${sub}</div>` : ""}</div></div>`;
      out.innerHTML = `<div class="grid g2"><div class="card"><h3>🩺 সিস্টেম অবস্থা</h3><div class="hcl">
        ${row(chk.db, "ডাটাবেস সংযোগ", DEMO ? bi("DEMO মোড", "DEMO mode") : "Supabase")}${row(chk.v2, "v2: ড্রাফট · রিমাইন্ডার · Audit · ছবি", chk.v2 ? "চালু" : "schema_v2.sql চালাতে হবে")}
        ${row(chk.v3, "v3: ক্যাশ · Backup · নিজের নাম", chk.v3 ? "চালু" : "schema_v3.sql চালাতে হবে")}${row(chk.v6, "v6: ডিস্ট্রিবিউশন কালেকশন", chk.v6 ? "চালু" : "schema_v6.sql চালাতে হবে")}${row(chk.backup, "রাত ১২টার Backup", chk.backupAt ? "শেষ: " + new Date(chk.backupAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "এখনো হয়নি")}
        ${row(location.protocol === "https:" || DEMO, "HTTPS", location.host)}${row(!!navigator.serviceWorker?.controller || DEMO, "অফলাইন মোড (PWA)", navigator.serviceWorker?.controller ? "চালু" : "রিলোড দিলে চালু হবে")}</div>
        <div class="mut xs" style="margin-top:10px">সংস্করণ v6 · ${esc(document.querySelector('script[src^="app.js"]')?.getAttribute("src")?.split("v=")[1] || "")}</div></div>
       <div class="card"><h3>👮 কে কী পারে</h3><table class="perm"><thead><tr><th></th><th>Admin</th><th>Staff</th><th>Boss</th></tr></thead><tbody>
        ${[["চেক / ক্লোজিং / ক্যাশ যোগ", 1, 1, 0], ["ফাইনাল সেভের পর বদলানো", 1, 0, 0], ["মুছে ফেলা", 1, 0, 0], ["রিপোর্ট দেখা", 1, 1, 1], ["Audit log", 1, 0, 1], ["Backup ও ব্যবহারকারী", 1, 0, 0]].map(([l, ...r]) => `<tr><td>${l}</td>${r.map(x => `<td class="c">${x ? `<b class="gr">✓</b>` : `<span class="mut">—</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table>
        <div class="mut xs" style="margin-top:8px">ভুল স্ট্যাটাস দিলে নতুন স্ট্যাটাস দিন — ইতিহাস থেকে যায়। এই নিয়ম ডাটাবেস (RLS) নিজেই আটকায়।</div></div>
       <div class="card" style="grid-column:1/-1"><h3>⚡ দ্রুত লিংক</h3><div class="qlinks"><a href="#/audit">${ico("shield")} Audit ও Backup</a><a href="#/books">${ico("book")} চেক বই</a><a href="#/settings">${ico("gear")} সেটিংস</a><a href="https://supabase.com/dashboard/project/mtzxcwuojiajsanearsz" target="_blank" rel="noopener">${ico("bank")} Supabase ড্যাশবোর্ড ↗</a><a href="https://github.com/ruhulaminrevens/nabiad" target="_blank" rel="noopener">${ico("copyt")} GitHub কোড ↗</a></div></div></div>`;
    }
  };
  await draw();
}
Object.assign(SbAPI, {
  async health() {
    const t = async (tbl, col = "*") => { const { error } = await sb.from(tbl).select(col, { count: "exact", head: true }); return !error; };
    const [db, v2, v3, v6] = await Promise.all([t("accounts", "code"), t("reminders", "id"), t("cash_records", "date"), t("dist_collections", "id")]);
    let backupAt = null; try { backupAt = (await this.backups())[0]?.at || null; } catch { }
    return { db, v2, v3, v6, backup: !!backupAt && Date.now() - new Date(backupAt) < 36 * 36e5, backupAt };
  }
});
Object.assign(DemoAPI, { async health() { const b = (demoStore.backups || [])[0]; return { db: true, v2: true, v3: true, v6: true, backup: !!b, backupAt: b?.at }; } });

/* ---------- "More" sheet: grouped tiles, ✕ / tap outside / swipe down / phone Back all close it ---------- */
let moreClose = null;
function openMore(keys, mob, bd, lo) {
  if (moreClose) return moreClose();
  const cur = (location.hash.match(/^#\/(\w+)/) || [])[1], dark = getTheme() === "dark";
  const groups = []; keys.filter(k => !mob.includes(k)).forEach(k => { const s = secOf(k); let g = groups.find(x => x.s === s); if (!g) groups.push(g = { s, ks: [] }); g.ks.push(k); });
  groups.sort((a, b) => (a.s === "more" ? 0 : 1) - (b.s === "more" ? 0 : 1));
  const MORE_ORDER = ["dash", "accounts", "books", "register", "dparty", "rem", "settings", "audit", "admin"]; const mg = groups.find(g => g.s === "more"); if (mg) mg.ks.sort((a, b) => (MORE_ORDER.indexOf(a) + 1 || 99) - (MORE_ORDER.indexOf(b) + 1 || 99));
  const el = document.createElement("div"); el.className = "sheet sheet2";
  el.innerHTML = `<div class="box"><div class="sh-hd"><div class="grab"></div><b>সব পাতা</b><button class="iconbtn sh-x" data-x="close" title="বন্ধ">✕</button></div><div class="sh-body">
    ${groups.map(g => `<div class="sh-sec">${g.s === "more" ? "আরও" : SECS[g.s] || "মেনু"}</div><div class="sh-grid">${g.ks.map(k => `<a href="#/${k}" class="${k === cur ? "on" : ""}"><span class="ti">${ico(ROUTES[k].ic)}${bd[k] ? `<span class="badge">${bd[k]}</span>` : ""}</span><span class="tl">${k === "dash" ? "হোম" : ROUTES[k].t}</span></a>`).join("")}</div>`).join("")}
    <div class="sh-foot"><button data-x="th">${ico(dark ? "sun" : "moon")}<span>${dark ? "লাইট থিম" : "ডার্ক থিম"}</span></button><button data-x="lg">${ico("copyt")}<span>${LANG === "bn" ? "English" : "বাংলা"}</span></button><button data-x="ins">${ico("dl")}<span>${LANG === "en" ? "Install app" : "অ্যাপ ইনস্টল"}</span></button><button data-x="lo" class="lo">${ico("out")}<span>লগআউট</span></button></div>
    <div class="mut xs c" style="margin-top:8px">${esc(S.me.name)} · ${esc(S.me.role)}</div></div></div>`;
  document.body.appendChild(el); document.body.classList.add("noscroll");
  history.pushState({ more: 1 }, "");
  let closed = false;
  const close = viaPop => {
    if (closed) return; closed = true; moreClose = null; window.removeEventListener("popstate", onPop); document.removeEventListener("keydown", onKey);
    el.classList.add("out"); document.body.classList.remove("noscroll"); setTimeout(() => el.remove(), 200);
    if (!viaPop && history.state?.more) history.back();
  };
  const onPop = () => close(true), onKey = e => { if (e.key === "Escape") close(); };
  window.addEventListener("popstate", onPop); document.addEventListener("keydown", onKey); moreClose = () => close();
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
const chqEditLeft = c => { if (S.me.role === "admin") return Infinity; if (S.me.role !== "staff") return 0; const d = S.me.edit_days || 0; if (!d || !c.at) return 0; if (c.uid ? c.uid !== S.me.id : c.by !== S.me.name) return 0; return new Date(c.at).getTime() + d * 864e5 - Date.now(); };
const canEditChq = c => chqEditLeft(c) > 0;
const leftTxt = ms => { const h = Math.floor(ms / 36e5); return h >= 24 ? Math.floor(h / 24) + (LANG === "en" ? "d " : " দিন ") + (h % 24) + (LANG === "en" ? "h" : " ঘণ্টা") : Math.max(1, h) + (LANG === "en" ? "h" : " ঘণ্টা"); };
async function showPhoto(el, c) {
  if (!c.photo) return; el.innerHTML = `<div class="skel" style="height:120px"></div>`;
  try { const u = await API.photoUrl(c.photo); el.innerHTML = `<a href="${esc(u)}" target="_blank" rel="noopener" class="chq-ph"><img src="${esc(u)}" alt="cheque"></a>`; }
  catch (e) { el.innerHTML = `<div class="mut sm">${bi("ছবি লোড হয়নি: ", "Photo failed to load: ")}${esc(e.message || e)}</div>`; }
}
/* v6.43 — admin: rename / delete cheque purposes (staff can only add) */
function purposeManage(onChange) {
  const en = LANG === "en";
  const used = p => (S.cheques || []).filter(c => c.purpose === p).length;
  const save = () => { try { if (!DEMO) localStorage.setItem("nb_purp_v2", JSON.stringify(PURP_X)); } catch (e) { } };
  modal(`<h2>⚙ ${en ? "Cheque purposes" : "চেকের খাত (Purpose)"}</h2>
    <div class="mut xs" style="margin-bottom:10px">${en ? "Renaming also updates old cheques. Deleting only removes it from the list — old cheques keep their purpose. Names starting with Cash / Own / Cancel / Supplier trigger special fields." : "নাম বদলালে পুরনো চেকের খাতও বদলে যায়। মুছলে শুধু তালিকা থেকে সরে — পুরনো চেকে খাত লেখাই থাকে। Cash / Own / Cancel / Supplier দিয়ে শুরু নামে বিশেষ ঘর (ক্যাশ-টেকার, To A/C) কাজ করে।"}</div>
    <div class="pm-list">${allPurposes().map((p, i) => `<div class="pm-row"><div class="pm-n"><b>${esc(p)}</b><span class="mut xs">${used(p)} ${en ? "cheques" : "টি চেক"}</span></div><button class="btn sm ghost" data-pe="${i}" title="${en ? "Rename" : "নাম বদলান"}">${ico("edit")}</button><button class="btn sm ghost" data-pd="${i}" title="${en ? "Delete" : "মুছুন"}">${ico("trash")}</button></div>`).join("") || `<div class="mut">${en ? "No purposes" : "কোনো খাত নেই"}</div>`}</div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn pri" id="pm-x">${en ? "Done" : "হয়েছে"}</button></div>`, (root, close) => {
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
  modal(`<h2>📷 চেকের ছবি · ${esc(c.code)} · ${c.no}</h2><div class="photo-in"><label class="btn" for="p-in-c">${ico("cam")} ছবি তুলুন</label><label class="btn" for="p-in">${ico("img")} গ্যালারি</label><input type="file" id="p-in-c" accept="image/*" capture="environment" hidden><input type="file" id="p-in" accept="image/*" hidden><img id="p-img" class="hide"><button class="btn sm ghost hide" id="p-x">✕</button></div>
   <div class="row" style="margin-top:16px"><button class="btn pri" id="p-ok">${ico("save")} সেভ</button><button class="btn" id="p-c">বাতিল</button></div>`, (root, close) => {
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
    if (!isFri(t) && h >= (CFG.CASH_REMIND_HOUR ?? 19) && S.lastCash !== t && !S.cashOff) o.push({ id: "cash-" + t, k: "rd", ic: "wallet", t: bi("আজকের ক্যাশ এন্ট্রি এখনো সেভ হয়নি", "Today's cash entry is not saved yet"), go: "#/cash", notify: true });
    if (S.lastBal) { const g = workGap(S.lastBal, t); if (g > 0) o.push({ k: "am", ic: "bank", t: LANG === "en" ? `${g} working day${g > 1 ? "s" : ""} of closing pending (last saved: ${dmy(S.lastBal)})` : `${g} কর্মদিবসের ক্লোজিং বাকি (শেষ সেভ: ${dmy(S.lastBal)})`, go: "#/closing" }); }
    const dd = Draft.localDates().filter(d => !S.lastBal || d > S.lastBal); if (dd.length) o.push({ k: "vi", ic: "edit", t: `ড্রাফট আছে, ফাইনাল সেভ বাকি: ${dd.map(dmy).join(", ")}`, go: "#/closing" });
    if (!DEMO && Outbox.count()) o.push({ k: "am", ic: "clock", t: `${Outbox.count()}টি অফলাইন এন্ট্রি সিঙ্ক বাকি`, go: "" });
  }
  const old = pendingOld(); if (old.length) o.push({ k: "am", ic: "clock", t: bi(`${old.length}টি চেক ${CFG.PENDING_ALERT_DAYS ?? 3} দিনের বেশি Pending`, `${old.length} cheques pending for more than ${CFG.PENDING_ALERT_DAYS ?? 3} days`), go: "#/status" });
  const miss = allMissing(); if (miss.length) o.push({ k: "am", ic: "book", t: `মিসিং চেক পাতা আছে: ${miss.slice(0, 3).map(x => x.b.code).join(", ")}`, go: "#/books" });
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
  const opt = { body: body || "", icon: "icon-192.png", badge: "icon-192.png", tag, data: { url: "#/rem" } };
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
  sysN.forEach(a => sysNotify("⚠ " + a.t, "NABIAD Cheque & Bank Control", a.id));
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
   <div class="row" style="margin-top:14px"><a class="btn" href="#/rem" id="dm-all">সব রিমাইন্ডার</a><button class="btn" id="dm-x">বন্ধ</button></div>`, (root, close) => {
    $("#dm-x", root).onclick = close; $("#dm-all", root).onclick = close;
    bindRemActions(root, () => { const left = dueList(); if (!left.length) close(); else { close(); dueModal(left); } if (CUR === "rem") route(); });
  });
}
function icsFile(r) {
  const z = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const e = s => String(s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const rr = { hourly: "HOURLY", daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" }[r.repeat];
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nabiad//Reminder//BN", "BEGIN:VEVENT", `UID:${r.id}@nabiad`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(remDue(r))}`, `DTEND:${z(remDue(r).getTime() + 15 * 6e4)}`, `SUMMARY:${e(r.title)}`, `DESCRIPTION:${e((r.note || "") + "\nNABIAD Cheque & Bank Control")}`, rr ? `RRULE:FREQ=${rr}` : "", "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", `DESCRIPTION:${e(r.title)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].filter(Boolean);
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([L.join("\r\n")], { type: "text/calendar" })); a.download = `reminder_${norm(r.title).slice(0, 20) || "nabiad"}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const remErrMsg = e => /relation|does not exist|schema cache|not find/i.test(e?.message || "") ? "রিমাইন্ডার টেবিল নেই — Supabase-এ schema_v2.sql চালাতে হবে" : (e?.message || String(e));

/* ---------- audit log ---------- */
const AU_T = { cheques: "চেক", cheque_status: "স্ট্যাটাস", balances: "ব্যালেন্স", accounts: "অ্যাকাউন্ট", books: "চেক বই", profiles: "ব্যবহারকারী", users: "ব্যবহারকারী" };
const AU_A = { insert: ["যোগ", "gr"], update: ["বদল", "am"], delete: ["মুছে ফেলা", "rd"] };
const AU_F = { chq_date: "তারিখ", code: "A/C", chq_no: "চেক নং", amount: "টাকা", purpose: "খাত", cash_taker: "কে তুলেছে", party: "পার্টি", to_ac: "To A/C", remarks: "মন্তব্য", new_status: "স্ট্যাটাস", status_date: "স্ট্যাটাস তারিখ", total: "ক্লোজিং", block: "Block", remark: "মন্তব্য", other_debit: "অন্য খরচ", other_deposit: "অন্য জমা", photo: "ছবি", holder: "হোল্ডার", bank: "ব্যাংক", acno: "A/C নং", status: "Status", role: "Role", active: "সক্রিয়", name: "নাম" };
const AU_SKIP = new Set(["created_at", "user_id", "id", "updated_at", "entered_by", "cheque_id"]);
const auV = x => x === null || x === undefined || x === "" ? "—" : typeof x === "number" || /^-?\d+(\.\d+)?$/.test(String(x)) && String(x).length > 3 ? money(x) : String(x);

/* =================== v6: API extensions =================== */
Object.assign(SbAPI, {
  async balancesRange(from, to) {
    let out = [], f = 0;
    for (;;) { const { data, error } = await sb.from("balances").select("date,code,total,block").gte("date", from).lte("date", to).order("date").order("code").range(f, f + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; f += 1000; }
    return out.map(r => ({ date: r.date, code: r.code, total: Number(r.total) || 0, block: Number(r.block) || 0 }));
  },
  async cashOn(d) { const { data, error } = await sb.from("cash_records").select("*").eq("date", d).maybeSingle(); if (error) throw error; return data; },
  async cashPrev(d) { const { data, error } = await sb.from("cash_records").select("*").lt("date", d).eq("status", "final").order("date", { ascending: false }).limit(1); if (error) throw error; return data?.[0] || null; },
  async cashSave(row) { const { error } = await sb.from("cash_records").upsert({ ...row, entered_by: S.me.name, updated_at: new Date().toISOString() }); if (error) throw error; },
  async cashRange(from, to) { const { data, error } = await sb.from("cash_records").select("*").gte("date", from).lte("date", to).order("date").limit(3000); if (error) throw error; return data; },
  async lastCashDate() { const { data, error } = await sb.from("cash_records").select("date").eq("status", "final").order("date", { ascending: false }).limit(1); if (error) throw error; return data?.[0]?.date || null; },
  async backups() { const { data, error } = await sb.from("backups").select("id,at,kind,size_rows").order("at", { ascending: false }).limit(60); if (error) throw error; return data; },
  async backupData(id) { const { data, error } = await sb.from("backups").select("data").eq("id", id).single(); if (error) throw error; return data.data; },
  async backupNow() { const { data, error } = await sb.rpc("make_backup", { k: "manual" }); if (error) throw error; return data; },
  async setMyName(n) { const { error } = await sb.rpc("set_my_name", { n }); if (error) throw error; },
  async changePassword(p) { const { error } = await sb.auth.updateUser({ password: p }); if (error) throw error; },
  async signOutOthers() { const { error } = await sb.auth.signOut({ scope: "others" }); if (error) throw error; },
  async dumpAll() { const T = ["accounts", "cheques", "cheque_status", "balances", "books", "reminders", "cash_records", "balance_drafts", "dist_parties", "dist_collections"], o = {}; for (const t of T) { try { o[t] = await fetchAll(t, t === "accounts" ? "code" : t === "balances" ? "date" : t === "balance_drafts" || t === "cash_records" ? "date" : t === "dist_parties" ? "name" : "id"); } catch (e) { o[t] = { error: e.message }; } } return o; }
});
Object.assign(DemoAPI, {
  async balancesRange(from, to) { const h = await this.hist(), out = []; for (const [d, m] of h) if (d >= from && d <= to) for (const c in m) out.push({ date: d, code: c, total: Number(m[c].total) || 0, block: Number(m[c].block) || 0 }); return out.sort((a, b) => a.date.localeCompare(b.date)); },
  async cashOn(d) { return (demoStore.cash ||= {})[d] || null; },
  async cashPrev(d) { const c = demoStore.cash ||= {}; const k = Object.keys(c).filter(x => x < d && c[x].status === "final").sort().pop(); return k ? c[k] : null; },
  async cashSave(row) { const c = demoStore.cash ||= {}; if (c[row.date]) this.aud("cash_records", "update", row.date, c[row.date], row); c[row.date] = { ...row, entered_by: S.me.name, updated_at: new Date().toISOString() }; this.save(); },
  async cashRange(from, to) { const c = demoStore.cash ||= {}; return Object.values(c).filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date)); },
  async lastCashDate() { const c = demoStore.cash ||= {}; return Object.keys(c).filter(k => c[k].status === "final").sort().pop() || null; },
  async backups() { return (demoStore.backups ||= []).map(({ data, ...b }) => b); },
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
  const acts = boss ? [["crep", "img", "ব্যালেন্স স্ন্যাপশট", "qa1"], ["cashsum", "pulse", "ক্যাশ সামারি", "qa2"], ["reports", "chart", "ব্যাংক রিপোর্ট", "qa3"], ["dsum", "trend", "কালেকশন সামারি", "qa4"]]
    : [["entry", "plus", "চেক পোস্টিং", "qa1"], ["closing", "bank", "ব্যাংক ক্লোজিং", "qa2"], ["cash", "wallet", "ক্যাশ এন্ট্রি", "qa3"], ["dcol", "coins", "কালেকশন এন্ট্রি", "qa4"]];
  const bankDone = S.lastBal === t, cashDone = S.lastCash === t, workday = !isFri(t);
  const st = (ok, l, go, sub) => `<a class="stchip ${ok ? "ok" : "no"}" href="${go}"><i>${ok ? "✓" : "!"}</i><span><b>${l}</b><small>${sub}</small></span></a>`;
  /* today's progress */
  const tasks = [...(boss ? [] : [[bankDone || !workday, "ব্যাংক ক্লোজিং"], [cashDone || !workday, "ক্যাশ এন্ট্রি"]]), [!due.length, "রিমাইন্ডার"], [!old.length, "পুরনো Pending"]];
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
  v.innerHTML = `<div class="hero dash-hero"><div class="hh"><h1>${greet()}, ${esc(S.me.name)} 👋</h1><p>${new Date().toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${workday ? "" : " · শুক্রবার (সাপ্তাহিক বন্ধ)"}</p>
        <div class="dprog">${ring}<div><b>${tdone === tasks.length ? "আজকের সব কাজ সম্পন্ন 🎉" : `আজকের কাজ ${tdone}/${tasks.length} সম্পন্ন`}</b><small>${tdone === tasks.length ? "দারুণ! সব কিছু আপ-টু-ডেট আছে" : `<span>বাকি:</span> ` + left.map(x => `<span>${x}</span>`).join(" · ")}</small><small id="d-streak"></small></div></div></div>
       <div class="qacts">${acts.map(([k, ic, l, c]) => `<a class="qa ${c}" href="#/${k}"><span class="qi">${ico(ic)}</span><span>${l}</span></a>`).join("")}</div></div>
     <div class="ststrip">${boss ? "" : st(bankDone, "ব্যাংক ক্লোজিং", "#/closing", bankDone ? "আজ সেভ হয়েছে" : S.lastBal ? "<span>শেষ:</span> " + dmy(S.lastBal) : "এখনো নেই")}${boss ? "" : st(cashDone, "ক্যাশ এন্ট্রি", "#/cash", cashDone ? "আজ সেভ হয়েছে" : S.lastCash ? "<span>শেষ:</span> " + dmy(S.lastCash) : "এখনো নেই")}
       ${st(!due.length, "রিমাইন্ডার", "#/rem", due.length ? `${due.length}টি সময় হয়েছে` : `${upcoming.length}টি আসছে`)}${st(!old.length, "Pending চেক", "#/status", `${pend.length}টি · পুরনো ${old.length}`)}${admin ? `<span id="d-bk" class="stchip"><i>…</i><span><b>Backup</b><small>দেখা হচ্ছে…</small></span></span>` : ""}</div>
     <div class="grid g4" id="d-kpi">
       <a class="kpi card k-vi" href="#/crep"><div class="l">ব্যাংক ব্যালেন্স<span class="ki">${ico("bank")}</span></div><div class="v num" id="d-bt">—</div><div class="s" id="d-bs">লোড হচ্ছে…</div><div id="d-sp1" class="kspw"></div></a>
       <a class="kpi card k-gr" href="#/reports"><div class="l">ব্যবহারযোগ্য (Usable)<span class="ki">${ico("coins")}</span></div><div class="v num" id="d-bu">—</div><div class="s" id="d-bb"></div><div id="d-sp2" class="kspw"></div></a>
       <a class="kpi card k-cy" href="#/cashsum"><div class="l">ক্যাশ ক্লোজিং<span class="ki">${ico("wallet")}</span></div><div class="v num" id="d-ct">—</div><div class="s" id="d-cs">লোড হচ্ছে…</div><div id="d-sp3" class="kspw"></div></a>
       <a class="kpi card k-am" href="#/cheques"><div class="l">চেক · এই মাস<span class="ki">${ico("list")}</span></div><div class="v num">${mon.length}</div><div class="s num">৳ ${money0(sumAmt(mon))} · <span>আজ</span> ${todayC.length} · Pending ${pend.length}</div><div class="kbar"><i style="width:${clearedPct}%"></i></div><div class="s" style="margin-top:3px">${clearedPct}% Clear</div></a>
     </div>
     <div class="grid g2 dgap">
       <div class="card"><div class="ch" style="padding:0 0 8px"><h3>ব্যাংক ব্যালেন্স ট্রেন্ড</h3><div class="sp" style="flex:1"></div><div class="seg mini-seg" id="d-rng">${[[7, bi("৭দি", "7d")], [15, bi("১৫দি", "15d")], [30, bi("৩০দি", "30d")]].map(([n, l]) => `<span class="chip ${n === 30 ? "on" : ""}" data-n="${n}">${l}</span>`).join("")}</div></div>
         <div id="d-tr"><div class="skel" style="height:110px"></div></div><div class="mut sm" id="d-tr-s"></div><div class="lgd"><span><i style="background:#6366f1"></i>Total</span><span><i style="background:#10b981"></i>Usable</span><span class="mut" style="margin-left:auto">আঙুল/মাউস দিয়ে দেখুন</span><a class="sm" href="#/reports">রিপোর্ট →</a></div></div>
       <div class="card"><div class="ch" style="padding:0 0 8px"><h3>ক্যাশ: আয় বনাম ব্যয়</h3><span class="mut sm">১৪ দিন</span><div class="sp" style="flex:1"></div><a class="sm" href="#/cashsum">সামারি →</a></div><div id="d-cash"><div class="skel" style="height:90px"></div></div><div class="lgd"><span><i style="background:#10b981"></i>Receipt</span><span><i style="background:#ef4444"></i>Payment</span></div></div>
     </div>
     <div class="grid g2 dgap">
       <div class="card"><div class="ch" style="padding:0 0 10px"><h3>ব্যাংক-ওয়াইজ ব্যালেন্স</h3><span class="mut sm" id="d-bk-d"></span><div class="sp" style="flex:1"></div><a class="sm" href="#/crep">বিস্তারিত →</a></div><div id="d-banks"><div class="skel" style="height:150px"></div></div></div>
       <div class="card"><div class="ch" style="padding:0 0 10px"><h3>চেক পাইপলাইন · এই মাস</h3><span class="tag">${monAll.length}</span><div class="sp" style="flex:1"></div><a class="sm" href="#/cheques">সব →</a></div>${pipeline}</div>
     </div>
     <div class="grid g2 dgap">
       <div class="card"><div class="ch" style="padding:0 0 10px"><h3>ডিস্ট্রিবিউশন কালেকশন</h3><span class="mut sm">৭ দিন</span><div class="sp" style="flex:1"></div><a class="sm" href="#/dsum">সামারি →</a></div><div id="d-col"><div class="skel" style="height:110px"></div></div></div>
       <div class="card"><div class="ch" style="padding:0 0 10px"><h3>মনোযোগ দরকার</h3><span class="tag ${att.length ? "t-due" : ""}">${att.length}</span></div>${att.length ? `<div class="attl">${att.join("")}</div>` : `<div class="allgood"><span>✨</span><b>সব ঠিক আছে!</b><small>কোনো জরুরি কাজ বা সতর্কতা নেই — দারুণ চলছে।</small></div>`}</div>
     </div>
     <div class="grid g3 dgap">
       <div class="card flush"><div class="ch"><h3>সর্বশেষ চেক এন্ট্রি</h3><div class="sp" style="flex:1"></div><a class="sm" href="#/cheques">সব →</a></div>${(() => { const r = [...S.cheques].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 6); return r.length ? `<div class="mini">${r.map(c => `<div class="mi" data-id="${c.id}"><div><b>${esc(c.code)} · ${c.no}</b>${chqIcons(c)}<div class="mut sm">${dmy(c.date)} · ${esc(c.purpose.split(" (")[0])}</div></div><div class="r"><b class="num">৳ ${money0(c.amount)}</b><div>${stTag(c.status)}</div></div></div>`).join("")}</div>` : `<div class="empty">এখনো কোনো চেক এন্ট্রি হয়নি${boss ? "" : `<div style="margin-top:10px"><a class="btn sm pri" href="#/entry">${ico("plus")} প্রথম চেক এন্ট্রি</a></div>`}</div>`; })()}</div>
       <div class="card flush"><div class="ch"><h3>আসন্ন রিমাইন্ডার</h3><div class="sp" style="flex:1"></div><a class="sm" href="#/rem">সব →</a></div>${upcoming.length ? `<div class="mini">${upcoming.map(r => `<a class="mi" href="#/rem"><div><b>${esc(r.title)}</b><div class="mut sm">${esc(r.note || REPEATS[r.repeat] || "")}</div></div><div class="r"><span class="tag ${remDue(r) <= new Date() ? "t-due" : ""}">${relTime(remDue(r))}</span></div></a>`).join("")}</div>` : `<div class="empty">কোনো রিমাইন্ডার নেই<div style="margin-top:10px"><button class="btn sm" id="d-addrem">${ico("plus")} রিমাইন্ডার দিন</button></div></div>`}</div>
       <div class="card flush"><div class="ch"><h3>পুরনো Pending চেক</h3><span class="tag">${old.length}</span></div>${old.length ? `<div class="mini">${old.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6).map(c => `<div class="mi" data-id="${c.id}"><div><b>${esc(c.code)} · ${c.no}</b><div class="mut sm">${esc(c.remarks || c.party || c.purpose.split(" (")[0])}</div></div><div class="r"><b class="num">৳ ${money0(c.amount)}</b><div class="rd sm b">${daysBetween(c.date, t)} দিন</div></div></div>`).join("")}</div>` : `<div class="empty">কোনো পুরনো Pending নেই 🎉</div>`}</div>
     </div>`;
  $$(".mi[data-id]", v).forEach(r => r.onclick = () => chequeModal(S.cheques.find(c => c.id === r.dataset.id), () => route()));
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
  if (admin) (async () => { const el = $("#d-bk", v); try { const b = (await API.backups())[0]; if (!el) return; const ok = b && Date.now() - new Date(b.at) < 36 * 36e5; el.className = "stchip " + (ok ? "ok" : "no"); el.innerHTML = `<i>${ok ? "✓" : "!"}</i><span><b>Backup</b><small>${b ? relTime(b.at) : "এখনো হয়নি"}</small></span>`; el.onclick = () => location.hash = "#/audit"; } catch { if (el) { el.className = "stchip no"; el.innerHTML = `<i>!</i><span><b>Backup</b><small>সেটআপ বাকি</small></span>`; } } })();
}

/* =================== v6: bank + cheque reports =================== */
async function vReports(v) {
  const F = { ...pbInit("month"), tab: sessionStorage.getItem("nabiad_rep_tab") || "bank", holder: "" }; const holders = [...new Set(S.accounts.map(a => a.holder).filter(Boolean))].sort();
  v.innerHTML = head("রিপোর্ট", `${repBtns("p")}<button class="btn" id="p-x">${ico("dl")} Excel</button>`) + `
   <div class="tabs noprint">${[["bank", "🏦 ব্যাংক ব্যালেন্স"], ["chq", "🧾 চেক"]].map(([k, l]) => `<span class="chip ${k === F.tab ? "on" : ""}" data-tab="${k}">${l}</span>`).join("")}</div>
   <div class="card noprint" style="margin-bottom:14px">${pbBar("p", F)}
   <div class="row" style="margin-top:10px"><div style="flex:1 1 200px"><label class="f">অ্যাকাউন্ট হোল্ডার</label><select class="in" id="p-h"><option value="">সব</option>${holders.map(h => `<option>${esc(h)}</option>`).join("")}</select></div></div></div><div class="card rep-wrap"><div class="rep-scroll"><div id="p-out"></div></div></div>`;
  let cur = null;
  const tbl = (title, rows, cols, total = true, fmt = r => [r.n, money0(r.amt)]) => { const T = rows.reduce((q, r) => ({ n: q.n + (r.n || 0), a: q.a + r.amt }), { n: 0, a: 0 });
    return repBox(title, cols, rows.map(r => `<tr><td>${r.k}</td>${fmt(r).map(x => `<td class="r num">${x}</td>`).join("")}</tr>`).join(""), total && rows.length ? `<tr class="tot"><td>TOTAL</td>${fmt({ n: T.n, amt: T.a }).map(x => `<td class="r num">${x}</td>`).join("")}</tr>` : ""); };
  const range = () => pbRange(F);
  async function draw() {
    const [from, to] = range(), am = accMap(), out = $("#p-out", v); const hOk = code => !F.holder || (am[code] || {}).holder === F.holder;
    const label = "", hold = F.holder ? ` · ${esc(F.holder)}` : "";
    if (F.tab === "bank") {
      out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`;
      let rows; try { rows = (await cached(`br:${from}:${to}`, 120000, () => API.balancesRange(addDays(from, -10), to))).filter(r => hOk(r.code) && am[r.code]?.daily); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(isNetErr(e) ? "ইন্টারনেট নেই — ব্যাংক রিপোর্টের জন্য অনলাইন থাকতে হবে" : e.message)}</div>`; return; }
      const before = rows.filter(r => r.date < from), inR = rows.filter(r => r.date >= from);
      const ser = balSeries(inR); if (!ser.length) { out.innerHTML = label + `<div class="card empty">এই সময়ে কোনো ব্যালেন্স সেভ নেই</div>`; cur = null; return; }
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
      dcFit(v, "p-in");
      return;
    }
    const all = S.cheques.filter(c => c.date >= from && c.date <= to && hOk(c.code)); const live = all.filter(isLive), by = s => all.filter(c => c.status === s);
    const monRows = group(live, c => c.date.slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({ ...r, k: (LANG === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : BN_M)[+r.k.slice(5) - 1] + " " + r.k.slice(0, 4) }));
    const T = { pur: group(live, c => c.purpose.split(" (")[0]).sort((a, b) => b.amt - a.amt), tak: group(live.filter(c => c.taker), c => c.taker).sort((a, b) => b.amt - a.amt), st: group(all, c => c.status).sort((a, b) => b.amt - a.amt), bank: group(live, c => (am[c.code] || {}).bank).sort((a, b) => b.amt - a.amt), acc: group(live, c => `${c.code} <span class="mut sm">${esc((am[c.code] || {}).holder || "")}</span>`).sort((a, b) => b.amt - a.amt), day: group(live, c => c.date).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({ ...r, k: dmy(r.k) })), mon: monRows };
    cur = { kind: "chq", from, to, all, live, T };
    if (!all.length) { out.innerHTML = label + `<div class="card empty">${bi("এই সময়ে কোনো চেক এন্ট্রি নেই।", "No cheque entries in this period.")}<div class="mut sm" style="margin-top:6px">${bi(`ডাটাবেসে মোট <b>${S.cheques.length}</b>টি চেক আছে। চেক এন্ট্রি করলে এখানে খাত, ব্যাংক, অ্যাকাউন্ট আর দিন অনুযায়ী হিসাব আসবে।`, `There are <b>${S.cheques.length}</b> cheque(s) in the database. Once cheques are entered, totals by purpose, bank, account and day will appear here.`)}</div>${S.me.role !== "boss" ? `<div style="margin-top:12px"><a class="btn pri sm" href="#/entry">${ico("plus")} চেক এন্ট্রি</a></div>` : ""}</div>`; return; }
    out.innerHTML = repSheet("p-in", "Cheque Report · চেক রিপোর্ট" + hold, from, to,
      repKpi([[`Live Cheques · ৳ ${money0(sumAmt(live))}`, live.length, "k1"], [`Cleared · ৳ ${money0(sumAmt(by("Cleared")))}`, by("Cleared").length, "k3"], [`Pending · ৳ ${money0(sumAmt(by("Pending")))}`, by("Pending").length, ""], [`Bounced / Cancelled · ৳ ${money0(sumAmt(by("Bounced")))}`, `${by("Bounced").length} / ${by("Cancelled").length}`, "k2"]]),
      repTwo(tbl("By Purpose", T.pur, ["Purpose", "Cheque", "Amount"]), tbl("Cash Taken By", T.tak, ["Name", "Cheque", "Amount"])) +
      repTwo(tbl("By Status", T.st, ["Status", "Cheque", "Amount"]), tbl("By Bank", T.bank, ["Bank", "Cheque", "Amount"])) +
      repOne(tbl("By Account", T.acc, ["Account", "Cheque", "Amount"])) +
      repTwo(daysBetween(from, to) <= 62 ? tbl("By Day", T.day, ["Date", "Cheque", "Amount"]) : "", tbl("By Month", T.mon, ["Month", "Cheque", "Amount"])));
    dcFit(v, "p-in");
  }
  $$(".chip[data-tab]", v).forEach(c => c.onclick = () => { F.tab = c.dataset.tab; sessionStorage.setItem("nabiad_rep_tab", F.tab); $$(".chip[data-tab]", v).forEach(x => x.classList.toggle("on", x === c)); draw(); });
  pbBind(v, "p", F, draw);
  $("#p-h", v).onchange = e => { F.holder = e.target.value; draw(); };
  $("#p-x", v).onclick = () => {
    if (!cur) return toast("ডাটা নেই", "err"); const strip = s => String(s).replace(/<[^>]+>/g, "").trim();
    if (cur.kind === "bank") return exportXlsx({ Daily: [["Date", "Accounts", "Total", "Block", "Usable"], ...cur.ser.map(x => [dmy(x.date), x.n, x.t, x.b, x.t - x.b])], Accounts: [["Code", "Holder", "Bank", "Opening", "Closing", "Block", "Change"], ...cur.accRows.map(r => [r.c, r.a?.holder || "", r.a?.bank || "", r.o, r.cl, r.bl, r.ch])], "By Bank": [["Bank", "A/C", "Closing", "Block"], ...cur.byBank.map(r => [r.k, r.n, r.amt, r.bl])], "By Holder": [["Holder", "A/C", "Closing", "Block"], ...cur.byHolder.map(r => [r.k, r.n, r.amt, r.bl])] }, `Bank_Report_${cur.from}_${cur.to}.xlsx`);
    const sh = (rows, h) => [h, ...rows.map(r => [strip(r.k), r.n, r.amt])];
    exportXlsx({ Summary: [["Period", `${cur.from} → ${cur.to}`], ["Holder", F.holder || "All"], [], ["Live cheques", cur.live.length, sumAmt(cur.live)]], "By Purpose": sh(cur.T.pur, ["Purpose", "Count", "Amount"]), "By Cash Taker": sh(cur.T.tak, ["Name", "Count", "Amount"]), "By Status": sh(cur.T.st, ["Status", "Count", "Amount"]), "By Bank": sh(cur.T.bank, ["Bank", "Count", "Amount"]), "By Account": sh(cur.T.acc, ["Account", "Count", "Amount"]), "By Day": sh(cur.T.day, ["Date", "Count", "Amount"]), "By Month": sh(cur.T.mon, ["Month", "Count", "Amount"]), Details: [CHQ_HEAD, ...[...cur.all].sort((a, b) => a.date.localeCompare(b.date)).map(chqRow)] }, `Cheque_Report_${today()}.xlsx`);
  };
  await draw();
  return repBind(v, "p", "p-in", () => `${cur?.kind === "chq" ? "Cheque" : "Bank"}_Report_${cur ? cur.from + "_" + cur.to : today()}`, () => cur ? `${cur.kind === "chq" ? "Cheque" : "Bank balance"} report ${dmy(cur.from)} → ${dmy(cur.to)}` : "");
}

/* =================== v6: CASH — daily record =================== */
const CASH = {
  receipt: [{ g: "Chawkbazar", items: [["cz_cos", "Cosmetics Parties"], ["cz_food", "Food Parties"], ["cz_chem", "Chemicals"], ["cz_oth", "Others"]] }, { g: "", items: [["niramoy", "Niramoy"], ["dist", "Distribution"], ["bank_in", "Total Bank"]] }],
  payment: [{ g: "", items: [["bank_out", "Bank"], ["lc", "LC/CC/OD"], ["loans", "Loans/Bills/Etc."], ["supp", "Suppliers"], ["p_oth", "Others"]] }]
};
const CASH_KEYS = t => CASH[t].flatMap(g => g.items.map(i => i[0]));
const cashLabel = k => { for (const t of ["receipt", "payment"]) for (const g of CASH[t]) for (const [kk, l] of g.items) if (kk === k) return (g.g ? g.g + " · " : "") + l; return k; };
const cashType = k => CASH_KEYS("receipt").includes(k) ? "receipt" : "payment";
function evalAmt(s) { s = String(s ?? "").replace(/[,৳\s]/g, ""); if (!s) return 0; if (!/^[-+]?\d*\.?\d+([+-]\d*\.?\d+)*$/.test(s)) return NaN; return s.match(/[+-]?\d*\.?\d+/g).reduce((a, b) => a + parseFloat(b), 0); }
function cashTotals(items) { const sum = t => CASH_KEYS(t).reduce((s, k) => s + (+items?.[k]?.a || 0), 0); return { r: sum("receipt"), p: sum("payment") }; }
const CASH_DRAFT = d => "nabiad_cash_draft_" + d;

async function vCash(v) {
  const t = today(); let date = sessionStorage.getItem("nabiad_cash_date") || (S.lastCash && S.lastCash < t ? stepDay(S.lastCash, 1) : t); sessionStorage.removeItem("nabiad_cash_date"); if (date > t) date = t;
  v.innerHTML = head("ক্যাশ এন্ট্রি", `<a class="btn" href="#/cashsum">${ico("chart")} সামারি</a>`) + `<div class="card navcard" style="margin-bottom:14px">${dateNav("cs", date)}<div id="cs-msg" style="margin-top:10px"></div></div><div id="cs-body"><div class="card empty">লোড হচ্ছে…</div></div>`;
  const body = $("#cs-body", v); let autoT = null;
  async function draw() {
    date = $("#cs-d", v).value; if (!date) return; body.innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
    let ex = null, prev = null, bankRef = null;
    try { [ex, prev] = await Promise.all([API.cashOn(date), API.cashPrev(date)]); } catch (e) {
      body.innerHTML = `<div class="alert rd">${/relation|does not exist|schema cache|not find/i.test(e.message || "") ? "ক্যাশ টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে" : isNetErr(e) ? "ইন্টারনেট নেই — ক্যাশ রেকর্ডের জন্য অনলাইন থাকতে হবে (এই ডিভাইসে লেখা ড্রাফট জমা থাকবে)" : esc(e.message)}</div>`; if (!isNetErr(e)) return;
    }
    try { const bm = await balancesOn(date); const am = accMap(); let tot = 0, n = 0; Object.entries(bm).forEach(([c, r]) => { if (am[c] && r.total != null) { tot += r.total; n++; } }); if (n) bankRef = tot; } catch { }
    const final = ex?.status === "final", admin = S.me.role === "admin", locked = (final && !admin) || S.me.role === "boss";
    let local = null; try { local = JSON.parse(localStorage.getItem(CASH_DRAFT(date)) || "null"); } catch { }
    let src = ex; let fromLocal = false;
    if (!final && local && (!ex || new Date(local.updated_at) > new Date(ex.updated_at))) { src = local; fromLocal = true; }
    const oc = src ? +src.opening_cash || 0 : (prev ? +prev.cash_in_hand || 0 : 0), ob = src ? +src.opening_bank || 0 : (prev ? (+prev.closing || 0) - (+prev.cash_in_hand || 0) : 0);
    const items = src?.items || {};
    const msgs = [];
    if (final) msgs.push(`<div class="alert ${locked ? "rd" : "am"}">${locked ? "🔒 এই তারিখের ক্যাশ রেকর্ড ফাইনাল সেভ হয়েছে।" : "⚠ ফাইনাল সেভ করা আছে — Admin হিসেবে বদলাতে পারবেন।"} <span class="mut sm">${esc(ex.entered_by || "")}</span></div>`);
    else if (src) msgs.push(`<div class="alert vi">📝 <span>ড্রাফট লোড হয়েছে${fromLocal ? " (এই ডিভাইস)" : ""} — ${esc(src.entered_by || S.me.name)} · ${new Date(src.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>${!locked ? `<button class="btn sm" id="cs-dd" style="margin-left:auto">ড্রাফট বাদ দিন</button>` : ""}</div>`);
    if (!src && prev) msgs.push(`<div class="mut sm">Opening নেওয়া হয়েছে <b>${dmy(prev.date)}</b>-এর ক্লোজিং থেকে${workGap(prev.date, date) ? ` · <b class="am">মাঝে ${workGap(prev.date, date)} কর্মদিবসের রেকর্ড নেই</b>` : ""}</div>`);
    if (!src && !prev) msgs.push(`<div class="mut sm">এটা প্রথম রেকর্ড — Opening Cash ও Bank নিজে লিখুন।</div>`);
    if (!locked) msgs.push(`<div class="mut xs">💡 একই খাতে কয়েকটা অঙ্ক থাকলে + দিয়ে লিখুন, যেমন 5000+12000</div>`);
    $("#cs-msg", v).innerHTML = msgs.join("");
    $("#cs-dd", v) && ($("#cs-dd", v).onclick = async () => { if (!ask("এই তারিখের ড্রাফট মুছবেন?")) return; localStorage.removeItem(CASH_DRAFT(date)); if (ex && !final) { try { await API.cashSave({ date, opening_cash: oc, opening_bank: ob, items: {}, total_receipt: 0, total_payment: 0, closing: oc + ob, cash_in_hand: null, remarks: null, status: "draft" }); } catch { } } draw(); });
    const dis = locked ? "disabled" : "";
    const row = (k, l) => { const it = items[k] || {}; return `<div class="crow cr2" data-k="${k}"><label>${esc(l)}</label><div class="cv"><input class="cell camt" value="${esc(it.x ?? (it.a ? fmtIn(it.a) : ""))}" inputmode="decimal" placeholder="0" ${dis}><span class="cval num"></span></div></div>`; };
    const side = (t, title, cls) => `<div class="card csec ${cls}"><div class="csh"><h3>${title}</h3><b class="num" id="cs-T${t[0]}">0</b></div>${CASH[t].map(g => `${g.g ? `<div class="cgrp"><span>${g.g}</span><b class="num" data-g="${g.g}">0</b></div>` : ""}<div class="${g.g ? "cin" : ""}">${g.items.map(([k, l]) => row(k, l)).join("")}</div>`).join("")}</div>`;
    body.innerHTML = `<div class="card csec c-open"><div class="csh"><h3>Opening Balance <span class="mut sm">(Cash in hand + Bank)</span></h3><b class="num" id="cs-OT">0</b></div>
       <div class="crow"><label>Cash in hand</label><input class="cell" id="cs-oc" value="${fmtIn(oc)}" inputmode="decimal" ${dis}></div><div class="crow"><label>Bank</label><input class="cell" id="cs-ob" value="${fmtIn(ob)}" inputmode="decimal" ${dis}></div></div>
      <div class="grid g2" style="margin-top:14px">${side("receipt", "Total Receipt", "c-rec")}${side("payment", "Total Payment", "c-pay")}</div>
      <div class="card csec c-close" style="margin-top:14px"><div class="csh"><h3>Closing Balance</h3><b class="num big" id="cs-CL">0</b></div>
       <div class="cbox"><div><span>Opening</span><b class="num" id="cs-x1"></b></div><div class="gr"><span>+ Receipt</span><b class="num" id="cs-x2"></b></div><div class="rd"><span>− Payment</span><b class="num" id="cs-x3"></b></div><div class="eq"><span>= Closing</span><b class="num" id="cs-x4"></b></div></div>
       <div class="crow hl"><label>Cash in hand <span class="mut xs">(গুনে লিখুন)</span></label><input class="cell" id="cs-ch" value="${src?.cash_in_hand == null ? "" : fmtIn(src.cash_in_hand)}" inputmode="decimal" placeholder="হাতে নগদ" ${dis}></div>
       <div class="crow"><label>Bank <span class="mut xs">(Closing − Cash)</span></label><b class="num" id="cs-cb"></b></div>
       ${bankRef != null ? `<div class="crow"><label class="mut">Daily Bank Closing (${dmy(date)})</label><span class="num mut">৳ ${money0(bankRef)}</span></div>` : ""}
       <div class="crow"><label>মন্তব্য</label><input class="cell t" id="cs-rm" value="${esc(src?.remarks || "")}" ${dis}></div></div>
      ${locked ? "" : `<div class="cbar"><button class="btn lg fix" id="cs-draft">${ico("edit")} ড্রাফট সেভ</button><button class="btn pri lg fix" id="cs-save">${ico("save")} <span class="bl">ফাইনাল সেভ<small>${dmy(date)}</small></span></button><div class="hint" id="cs-err"></div><div class="sp"></div><span class="mut sm" id="cs-auto"></span></div>`}`;
    const collect = () => {
      const it = {}; let bad = null;
      $$(".crow[data-k]", body).forEach(r => { const k = r.dataset.k, x = $(".camt", r).value.trim(), n = items[k]?.n || "", a = evalAmt(x); r.classList.toggle("err", isNaN(a)); if (isNaN(a)) bad ||= k; $(".cval", r).textContent = /[+-]/.test(x.replace(/^[-+]/, "")) && !isNaN(a) ? "= " + money0(a) : ""; $(".camt", r).classList.toggle("chg", !!a); if (a || n) it[k] = { a: isNaN(a) ? 0 : a, ...(x && /[+-]/.test(x.replace(/^[-+]/, "")) ? { x } : {}), ...(n ? { n } : {}) }; });
      const T = cashTotals(it), oc = num($("#cs-oc", body).value), ob = num($("#cs-ob", body).value), cl = oc + ob + T.r - T.p, chv = $("#cs-ch", body).value.trim();
      return { bad, row: { date, opening_cash: oc, opening_bank: ob, items: it, total_receipt: T.r, total_payment: T.p, closing: cl, cash_in_hand: chv === "" ? null : num(chv), remarks: $("#cs-rm", body).value.trim() || null } };
    };
    const calc = () => {
      const { row: r } = collect();
      $("#cs-OT", body).textContent = money0(r.opening_cash + r.opening_bank); $("#cs-Tr", body).textContent = money0(r.total_receipt); $("#cs-Tp", body).textContent = money0(r.total_payment);
      CASH.receipt.filter(g => g.g).forEach(g => { const el = $(`[data-g="${g.g}"]`, body); if (el) el.textContent = money0(g.items.reduce((s, [k]) => s + (r.items[k]?.a || 0), 0)); });
      $("#cs-CL", body).textContent = "৳ " + money0(r.closing); $("#cs-x1", body).textContent = money0(r.opening_cash + r.opening_bank); $("#cs-x2", body).textContent = money0(r.total_receipt); $("#cs-x3", body).textContent = money0(r.total_payment); $("#cs-x4", body).textContent = money0(r.closing);
      const cb = $("#cs-cb", body); cb.textContent = r.cash_in_hand == null ? "—" : money0(r.closing - r.cash_in_hand); cb.className = "num " + (r.cash_in_hand != null && r.closing - r.cash_in_hand < 0 ? "rd b" : "");
      return r;
    };
    const autosave = () => { if (locked) return; clearTimeout(autoT); autoT = setTimeout(() => { const { row } = collect(); try { localStorage.setItem(CASH_DRAFT(date), JSON.stringify({ ...row, status: "draft", entered_by: S.me.name, updated_at: new Date().toISOString() })); } catch { } const a = $("#cs-auto", body); if (a) a.textContent = "✓ এই ডিভাইসে অটো-সেভ " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }, 700); };
    $$("input", body).forEach(i => { i.addEventListener("input", () => { calc(); autosave(); }); if (!i.classList.contains("t") && !i.classList.contains("cnote")) { i.addEventListener("focus", () => i.select()); i.addEventListener("blur", () => { if (i.classList.contains("camt") && /[+-]/.test(i.value.replace(/^[-+]/, ""))) return; if (i.value.trim() !== "" && !isNaN(evalAmt(i.value))) i.value = fmtIn(evalAmt(i.value)); calc(); }); } });
    const amts = $$("input.camt, #cs-oc, #cs-ob, #cs-ch", body); amts.forEach((i, n) => i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const nx = amts[n + 1]; nx ? nx.focus() : $("#cs-save", body)?.focus(); } }));
    calc();
    if (locked) return;
    const save = async status => {
      const { row, bad } = collect(), err = $("#cs-err", body); err.className = "hint rd"; err.textContent = "";
      if (bad) { err.textContent = `ভুল অঙ্ক: ${cashLabel(bad)} — শুধু সংখ্যা আর + / − লিখুন`; return; }
      if (status === "final") {
        if (row.cash_in_hand == null) { err.textContent = "Cash in hand লিখুন (হাতে কত নগদ আছে)"; $("#cs-ch", body).focus(); return; }
        if (row.cash_in_hand > row.closing && !ask(bi("Cash in hand Closing-এর চেয়ে বেশি — Bank ঋণাত্মক হবে। তবুও সেভ করবেন?", "Cash in hand is more than Closing — Bank will be negative. Save anyway?"))) return;
        if (!ask(bi(`${dmy(date)} — ক্যাশ ফাইনাল সেভ\nReceipt ৳ ${money0(row.total_receipt)} · Payment ৳ ${money0(row.total_payment)}\nClosing ৳ ${money0(row.closing)} · Cash in hand ৳ ${money0(row.cash_in_hand)}${S.me.role !== "admin" ? "\n\nসেভের পর আর বদলানো যাবে না (শুধু Admin পারবে)।" : ""}`, `${dmy(date)} — cash final save\nReceipt ৳ ${money0(row.total_receipt)} · Payment ৳ ${money0(row.total_payment)}\nClosing ৳ ${money0(row.closing)} · Cash in hand ৳ ${money0(row.cash_in_hand)}${S.me.role !== "admin" ? "\n\nAfter saving it cannot be changed (only an Admin can)." : ""}`))) return;
      }
      const b = $(status === "final" ? "#cs-save" : "#cs-draft", body); b.disabled = true;
      try {
        await API.cashSave({ ...row, status }); localStorage.removeItem(CASH_DRAFT(date)); dropCache("cash");
        if (status === "final") { S.lastCash = await API.lastCashDate().catch(() => date); saveCache(); refreshBadges(); toast("✔ ক্যাশ রেকর্ড ফাইনাল সেভ হয়েছে"); } else toast("✔ ড্রাফট সেভ হয়েছে");
        await draw();
      } catch (e) { toast(isNetErr(e) ? "ইন্টারনেট নেই — এই ডিভাইসে জমা আছে, নেট এলে আবার সেভ করুন" : e.message || String(e), "err"); b.disabled = false; }
    };
    $("#cs-draft", body).onclick = () => save("draft"); $("#cs-save", body).onclick = () => save("final");
  }
  bindDateNav(v, "cs", draw); await draw(); return () => clearTimeout(autoT);
}

/* =================== v6: CASH — summary board / history =================== */
const cashPeriod = F => pbRange(F);
const cashErr = e => /relation|does not exist|schema cache|not find/i.test(e.message || "") ? "ক্যাশ টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে" : isNetErr(e) ? "ইন্টারনেট নেই" : (e.message || String(e));
async function vCashSum(v) {
  const F = pbInit("month");
  v.innerHTML = head("ক্যাশ সামারি ও ইতিহাস", `${repBtns("cm")}<button class="btn" id="cm-x">${ico("dl")} Excel</button>${S.me.role !== "boss" ? `<a class="btn pri" href="#/cash">${ico("plus")} আজকের রেকর্ড</a>` : ""}`) + `<div class="card noprint" style="margin-bottom:14px">${pbBar("cm", F)}</div><div class="card rep-wrap"><div class="rep-scroll"><div id="cm-out"></div></div></div>`;
  let rows = [];
  async function draw() {
    const [f, t] = cashPeriod(F), out = $("#cm-out", v); out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`;
    try { rows = await API.cashRange(f, t); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(cashErr(e))}</div>`; return; }
    const fin = rows.filter(r => r.status === "final"), R = fin.reduce((s, r) => s + (+r.total_receipt || 0), 0), P = fin.reduce((s, r) => s + (+r.total_payment || 0), 0), last = fin[fin.length - 1], first = fin[0];
    let miss = 0; for (let d = f; d <= (t > today() ? today() : t); d = addDays(d, 1)) if (!isFri(d) && !rows.some(r => r.date === d)) miss++;
    const drafts = rows.filter(r => r.status !== "final");
    const note = [drafts.length ? `${drafts.length} Draft record` : "", miss ? `${miss} working day(s) without a record` : ""].filter(Boolean).join(" · ");
    out.innerHTML = repSheet("cm-in", "Cash Summary · ক্যাশ সামারি", f, t,
      repKpi([[`Total Receipt · avg ${money0(fin.length ? R / fin.length : 0)}/day`, "৳ " + money0(R), "k3"], [`Total Payment · avg ${money0(fin.length ? P / fin.length : 0)}/day`, "৳ " + money0(P), "k2"], [`Net · ${fin.length} final days`, (R - P >= 0 ? "+" : "−") + money0(Math.abs(R - P)), "k1"], [last ? `Last Closing · ${dmy(last.date)}` : "Last Closing", "৳ " + money0(last?.closing), ""]]),
      repTwo(`<div class="dcs-box"><div class="dcs-t">Daily Receipt vs Payment</div>${repLine([{ v: fin.map(r => +r.total_receipt || 0), c: "#10b981", n: "Receipt" }, { v: fin.map(r => +r.total_payment || 0), c: "#f43f5e", n: "Payment" }], 80)}</div>`, `<div class="dcs-box"><div class="dcs-t">Closing &amp; Cash in Hand</div>${repLine([{ v: fin.map(r => +r.closing || 0), c: "#6366f1", n: "Closing" }, { v: fin.map(r => +r.cash_in_hand || 0), c: "#f59e0b", n: "Cash in hand" }], 80)}</div>`) +
      repOne(repBox(`Daily History (${rows.length})`, ["Date", "Opening", "Receipt", "Payment", "Closing", "Cash in hand", "Bank", "Status"], [...rows].reverse().map(r => `<tr><td class="cd">${dmy(r.date)} <span class="mut">${new Date(r.date + "T00:00").toLocaleDateString("en-GB", { weekday: "short" })}</span></td><td class="r num">${money0(+r.opening_cash + +r.opening_bank)}</td><td class="r num gr">${money0(r.total_receipt)}</td><td class="r num rd">${money0(r.total_payment)}</td><td class="r num b">${money0(r.closing)}</td><td class="r num">${r.cash_in_hand == null ? "—" : money0(r.cash_in_hand)}</td><td class="r num">${r.cash_in_hand == null ? "—" : money0(r.closing - r.cash_in_hand)}</td><td class="r">${r.status === "final" ? "Final" : "Draft"}</td></tr>`).join(""))), note);
    dcFit(v, "cm-in");
  }
  pbBind(v, "cm", F, draw); const unb = repBind(v, "cm", "cm-in", () => `Cash_Summary_${cashPeriod(F).join("_")}`, () => { const [a, b] = cashPeriod(F); return `Cash summary ${dmy(a)} → ${dmy(b)}`; });
  $("#cm-x", v).onclick = () => rows.length ? exportXlsx({ Daily: [["Date", "Opening Cash", "Opening Bank", "Receipt", "Payment", "Closing", "Cash in hand", "Bank", "Status", "By", "Remarks"], ...rows.map(r => [dmy(r.date), +r.opening_cash, +r.opening_bank, +r.total_receipt, +r.total_payment, +r.closing, r.cash_in_hand == null ? "" : +r.cash_in_hand, r.cash_in_hand == null ? "" : r.closing - r.cash_in_hand, r.status, r.entered_by || "", r.remarks || ""])] }, `Cash_Summary_${today()}.xlsx`) : toast("ডাটা নেই", "err");
  await draw(); return unb;
}
/* read-only view of one day (used by Boss, who cannot open the entry page) */

/* =================== v6: CASH — reports (category breakdown) =================== */
async function vCashRep(v) {
  const F = pbInit("month");
  v.innerHTML = head("ক্যাশ রিপোর্ট", `${repBtns("cr")}<button class="btn" id="cr-x">${ico("dl")} Excel</button>`) + `<div class="card noprint" style="margin-bottom:14px">${pbBar("cr", F)}</div><div class="card rep-wrap"><div class="rep-scroll"><div id="cr-out"></div></div></div>`;
  let cur = null;
  async function draw() {
    const [f, t] = cashPeriod(F), out = $("#cr-out", v); out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`;
    let rows; try { rows = (await API.cashRange(f, t)).filter(r => r.status === "final"); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(cashErr(e))}</div>`; return; }
    if (!rows.length) { out.innerHTML = `<div class="card empty">এই সময়ে কোনো ফাইনাল ক্যাশ রেকর্ড নেই</div>`; cur = null; return; }
    const cat = k => rows.reduce((s, r) => s + (+r.items?.[k]?.a || 0), 0), days = k => rows.filter(r => +r.items?.[k]?.a).length;
    const R = rows.reduce((s, r) => s + +r.total_receipt, 0), P = rows.reduce((s, r) => s + +r.total_payment, 0);
    const block = (t, title, tot) => repBox(title, ["Category", "Days", "Amount", "%"], CASH_KEYS(t).map(k => { const a = cat(k); return `<tr><td>${esc(cashLabel(k))}</td><td class="r num">${days(k) || "—"}</td><td class="r num ${a ? "b" : "z"}">${money0(a)}</td><td class="r num">${tot ? (a / tot * 100).toFixed(1) : "0.0"}</td></tr>`; }).join(""), `<tr class="tot"><td>TOTAL</td><td></td><td class="r num">${money0(tot)}</td><td class="r num">100</td></tr>`);
    const months = [...new Set(rows.map(r => r.date.slice(0, 7)))].sort(), mName = m => (LANG === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : BN_M)[+m.slice(5) - 1] + " " + m.slice(2, 4);
    const mcat = (m, k) => rows.filter(r => r.date.startsWith(m)).reduce((s, r) => s + (+r.items?.[k]?.a || 0), 0);
    cur = { f, t, rows, cat, months, mcat };
    out.innerHTML = repSheet("cr-in", "Cash Report · ক্যাশ রিপোর্ট", f, t,
      repKpi([["Total Receipt", "৳ " + money0(R), "k3"], ["Total Payment", "৳ " + money0(P), "k2"], ["Net (Receipt − Payment)", (R - P >= 0 ? "+" : "−") + money0(Math.abs(R - P)), "k1"], ["Final Days", rows.length, ""]]),
      repTwo(block("receipt", "Receipt — by Category", R), block("payment", "Payment — by Category", P)) +
      (months.length > 1 ? repOne(repBox("By Month", ["Category", ...months.map(mName), "Total"], ["receipt", "payment"].map(t => CASH_KEYS(t).map(k => `<tr><td>${esc(cashLabel(k))}</td>${months.map(m => `<td class="r num">${money0(mcat(m, k)) || "—"}</td>`).join("")}<td class="r num b">${money0(cat(k))}</td></tr>`).join("") + `<tr class="tot"><td>Total ${t === "receipt" ? "Receipt" : "Payment"}</td>${months.map(m => `<td class="r num">${money0(CASH_KEYS(t).reduce((q, k) => q + mcat(m, k), 0))}</td>`).join("")}<td class="r num">${money0(t === "receipt" ? R : P)}</td></tr>`).join(""))) : ""));
    dcFit(v, "cr-in");
  }
  pbBind(v, "cr", F, draw); const unb = repBind(v, "cr", "cr-in", () => `Cash_Report_${cur ? cur.f + "_" + cur.t : today()}`, () => cur ? `Cash report ${dmy(cur.f)} → ${dmy(cur.t)}` : "");
  $("#cr-x", v).onclick = () => { if (!cur) return toast("ডাটা নেই", "err"); const all = [...CASH_KEYS("receipt"), ...CASH_KEYS("payment")]; exportXlsx({ Categories: [["Type", "Category", "Amount"], ...all.map(k => [cashType(k), cashLabel(k), cur.cat(k)])], Monthly: [["Category", ...cur.months, "Total"], ...all.map(k => [cashLabel(k), ...cur.months.map(m => cur.mcat(m, k)), cur.cat(k)])] }, `Cash_Report_${cur.f}_${cur.t}.xlsx`); };
  await draw(); return unb;
}

/* =================== v6: Cash Register (every line of every day) =================== */
async function vRegister(v) {
  const F = { ...pbInit("month"), q: "", type: "", k: "" };
  v.innerHTML = head("ক্যাশ রেজিস্টার", `<button class="btn" id="rg-x">${ico("dl")} Excel</button>`) + `<div class="card noprint" style="margin-bottom:14px">${pbBar("rg", F)}<div class="row" style="margin-top:10px"><div style="flex:2 1 220px"><label class="f">খুঁজুন (নোট, খাত, অঙ্ক)</label><input class="in" id="rg-q" type="search" autocomplete="off"></div><div><label class="f">ধরন</label><select class="in" id="rg-t"><option value="">সব</option><option value="receipt">Receipt</option><option value="payment">Payment</option></select></div><div><label class="f">খাত</label><select class="in" id="rg-k"><option value="">সব</option>${[...CASH_KEYS("receipt"), ...CASH_KEYS("payment")].map(k => `<option value="${k}">${esc(cashLabel(k))}</option>`).join("")}</select></div></div></div><div id="rg-sum" class="mut sm" style="margin-bottom:8px"></div><div class="card flush" id="rg-out"></div>`;
  let lines = [], shown = [];
  async function load() {
    const [f, t] = cashPeriod(F); $("#rg-out", v).innerHTML = `<div class="empty">লোড হচ্ছে…</div>`;
    try { const rows = await API.cashRange(f, t); lines = rows.flatMap(r => Object.entries(r.items || {}).filter(([, it]) => it.a).map(([k, it]) => ({ date: r.date, k, type: cashType(k), a: +it.a, n: it.n || "", x: it.x || "", st: r.status, by: r.entered_by }))).sort((a, b) => b.date.localeCompare(a.date)); }
    catch (e) { $("#rg-out", v).innerHTML = `<div class="alert rd" style="margin:12px">${esc(cashErr(e))}</div>`; return; }
    draw();
  }
  function draw() {
    const q = norm(F.q); shown = lines.filter(l => (!F.type || l.type === F.type) && (!F.k || l.k === F.k) && (!q || norm(cashLabel(l.k) + l.n + l.a + l.x).includes(q)));
    const R = shown.filter(l => l.type === "receipt").reduce((s, l) => s + l.a, 0), P = shown.filter(l => l.type === "payment").reduce((s, l) => s + l.a, 0);
    $("#rg-sum", v).innerHTML = `<b>${shown.length}</b>টি লাইন · <span class="gr">Receipt ৳ ${money0(R)}</span> · <span class="rd">Payment ৳ ${money0(P)}</span>`;
    $("#rg-out", v).innerHTML = shown.length ? `<div class="tw cards"><table><thead><tr><th>তারিখ</th><th>ধরন</th><th>খাত</th><th class="r">টাকা</th><th>নোট</th><th>অবস্থা</th></tr></thead><tbody>${shown.slice(0, 1000).map(l => `<tr><td>${dmy(l.date)}</td><td><span class="tag ${l.type === "receipt" ? "au-insert" : "au-delete"}">${l.type === "receipt" ? "Receipt" : "Payment"}</span></td><td>${esc(cashLabel(l.k))}</td><td class="r num b ${l.type === "receipt" ? "gr" : "rd"}">${money0(l.a)}${l.x ? `<div class="mut xs">${esc(l.x)}</div>` : ""}</td><td class="sm">${esc(l.n)}</td><td class="mut sm">${l.st === "final" ? "ফাইনাল" : "ড্রাফট"} · ${esc(l.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">কিছু পাওয়া যায়নি</div>`;
  }
  pbBind(v, "rg", F, load); $("#rg-q", v).oninput = e => { F.q = e.target.value; draw(); }; $("#rg-t", v).onchange = e => { F.type = e.target.value; draw(); }; $("#rg-k", v).onchange = e => { F.k = e.target.value; draw(); };
  $("#rg-x", v).onclick = () => shown.length ? exportXlsx({ Register: [["Date", "Type", "Category", "Amount", "Expression", "Note", "Status", "By"], ...shown.map(l => [dmy(l.date), l.type, cashLabel(l.k), l.a, l.x, l.n, l.st, l.by || ""])] }, `Cash_Register_${today()}.xlsx`) : toast("ডাটা নেই", "err");
  await load();
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
   <div class="row"><button class="btn pri fix" id="m-ok">${ico("save")} সেভ</button><button class="btn fix" id="m-x">বাতিল</button></div></div>`, (root, close) => {
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
async function vRem(v) {
  let tab = "up";
  const draw = () => {
    const all = (S.reminders || []).slice().sort((a, b) => remDue(a) - remDue(b)), now = new Date(), sys = sysAlerts();
    const list = tab === "up" ? all.filter(r => !r.done) : tab === "done" ? all.filter(r => r.done).reverse() : all;
    const perm = "Notification" in window ? Notification.permission : "na", nUp = all.filter(r => !r.done).length, nDue = all.filter(r => !r.done && remDue(r) <= now).length;
    v.innerHTML = head("রিমাইন্ডার ও সতর্কতা") +
      (S.remErr ? `<div class="alert rd" style="margin-bottom:12px">${esc(remErrMsg({ message: S.remErr }))}</div>` : "") +
      (perm === "default" ? `<div class="alert vi" style="margin-bottom:12px">🔔 <span>নোটিফিকেশন চালু করলে সময় হলে ফোনে জানাবে।</span><button class="btn sm pri" id="rm-perm" style="margin-left:auto">চালু করুন</button></div>` : perm === "denied" ? `<div class="alert am" style="margin-bottom:12px">${bi("ব্রাউজারে নোটিফিকেশন বন্ধ — সাইট সেটিং থেকে চালু করুন। অ্যাপের ভেতরে রিমাইন্ডার তবুও আসবে।", "Notifications are blocked in the browser — enable them in site settings. Reminders will still appear inside the app.")}</div>` : "") +
      `<div class="remtop"><div class="tabs" style="margin:0">${[["up", "চালু", nUp], ["done", "সম্পন্ন", null], ["all", "সব", null]].map(([k, l, n]) => `<span class="chip ${k === tab ? "on" : ""}" data-t="${k}"><span>${l}</span>${n != null ? ` <b>${n}</b>` : ""}</span>`).join("")}</div>${nDue ? `<span class="tag t-due">${nDue} <span>টির সময় হয়েছে</span></span>` : ""}</div>
      <div class="rem-list" style="margin-top:12px">${tab !== "done" ? `<button class="card rem-add" id="rm-add"><span class="ri">${ico("plus")}</span><span><b>নতুন রিমাইন্ডার</b><small>পার্টির চেক, পেমেন্ট, অডিট বা যেকোনো কাজ — ছবি ও দিন বেছে দিন</small></span></button>` : ""}
      ${list.length ? list.map(r => { const due = !r.done && remDue(r) <= now; const ch = r.cheque_id && S.cheques.find(c => c.id === r.cheque_id); return `<div class="card rem ${due ? "due" : ""} ${r.done ? "dn" : ""}"><div class="ri">${ico(r.kind === "cheque" ? "list" : r.photo ? "cam" : "bell")}</div><div class="rt"><b>${esc(r.title)}</b>${r.note ? `<div class="mut sm">${esc(r.note)}</div>` : ""}
        <div class="rmeta"><span class="tag ${due ? "t-due" : ""}">${ico("clock").replace("<svg", '<svg width="12" height="12"')} ${new Date(remDue(r)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${r.done ? "সম্পন্ন" : relTime(remDue(r))}</span>${r.repeat !== "none" ? `<span class="tag">${REPEATS[r.repeat] || ""}</span>` : ""}<span class="tag">${FOR_ROLE[r.for_role] || ""}</span>${ch ? `<span class="tag t-mv">${esc(ch.code)} · ${ch.no} ${stTag(ch.status)}</span>` : ""}<span class="mut xs">${esc(r.created_by || "")}</span></div>${r.photo ? `<div class="rph" data-ph="${esc(r.photo)}"></div>` : ""}</div>
        <div class="ra">${r.done ? "" : `<button class="btn ok sm" data-dn="${r.id}">✓ সম্পন্ন</button>${due ? snoozeBtns(r.id) : ""}`}${r.cheque_id ? `<button class="btn sm" data-oc="${r.cheque_id}">চেক</button>` : ""}<button class="btn sm" data-ics="${r.id}" title="ফোনের ক্যালেন্ডারে অ্যালার্ম সহ যোগ করুন">${ico("cal")}</button><button class="btn sm ghost" data-ed="${r.id}" title="এডিট">${ico("edit")}</button>${S.me.role === "admin" ? `<button class="btn sm ghost" data-rm="${r.id}" title="মুছুন">${ico("trash")}</button>` : ""}</div></div>`; }).join("") : `<div class="card empty">${tab === "done" ? bi("কোনো সম্পন্ন রিমাইন্ডার নেই", "No completed reminders") : bi("এখনো কোনো রিমাইন্ডার নেই — উপরের \"নতুন রিমাইন্ডার\" চাপুন।", "No reminders yet — tap \"New reminder\" above.")}</div>`}</div>
      <div class="card" style="margin-top:14px"><div class="ch" style="padding:0 0 10px"><h3>সিস্টেম সতর্কতা</h3><span class="tag">${sys.length}</span></div>${sys.length ? `<div class="grid" style="gap:8px">${sys.map(a => `<div class="alert ${a.k}">${ico(a.ic).replace("<svg", '<svg width="18" height="18"')}<span>${esc(a.t)}</span>${a.go ? `<a class="btn sm" style="margin-left:auto" href="${a.go}">খুলুন →</a>` : ""}</div>`).join("")}</div>` : `<div class="alert gr">✔ কোনো সতর্কতা নেই</div>`}</div>
      <div class="mut sm" style="margin-top:12px">💡 অ্যাপ পুরো বন্ধ থাকলেও অ্যালার্ম চাইলে ${ico("cal").replace("<svg", '<svg width="13" height="13" style="vertical-align:-2px"')} বাটন চাপুন — ফোনের ক্যালেন্ডারে অ্যালার্মসহ যোগ হবে।</div>`;
    $$("[data-t]", v).forEach(c => c.onclick = () => { tab = c.dataset.t; draw(); });
    $("#rm-add", v) && ($("#rm-add", v).onclick = () => reminderModal(null, {}, draw));
    $("#rm-perm", v) && ($("#rm-perm", v).onclick = async () => { const p = await Notification.requestPermission(); if (p === "granted") sysNotify("✔ নোটিফিকেশন চালু হয়েছে", "রিমাইন্ডারের সময় এখানে জানাবে", "test"); draw(); });
    bindRemActions(v, draw);
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
  v.innerHTML = head("সেটিংস") + `<div class="grid g2 setg">
   <div class="card"><h3>👤 প্রোফাইল</h3><div class="grid" style="gap:12px">
     <div class="pfp">${avaEl(S.me.id, S.me.name, S.me.email, "xl")}<div class="pfb"><b>${LANG === "en" ? "Profile picture" : "প্রোফাইল ছবি"}</b><div class="mut xs">${LANG === "en" ? "Shown in the sidebar and user lists. Square crop, JPG/PNG." : "সাইডবার ও ইউজার তালিকায় দেখা যাবে। মাঝখান থেকে চৌকো করে কাটা হয়।"}</div><div class="row" style="margin-top:8px"><button class="btn sm pri fix" id="pf-up" type="button">${ico("cam")} ${LANG === "en" ? "Upload photo" : "ছবি দিন"}</button><button class="btn sm fix ${avaMap()[S.me.id] ? "" : "hide"}" id="pf-rm" type="button">${ico("trash")} ${LANG === "en" ? "Remove" : "মুছুন"}</button><input type="file" id="pf-f" accept="image/*" hidden></div></div></div>
     <div><label class="f">আপনার নাম <span class="mut">(চেক/ক্লোজিং-এ "কে এন্ট্রি করেছে" হিসেবে বসে)</span></label><div class="row" style="flex-wrap:nowrap"><input class="in" id="st-nm" value="${esc(S.me.name || "")}"><button class="btn fix" id="st-nm-s">সেভ</button></div></div>
     <div class="mut sm">${esc(S.me.email)} · <span class="pill">${esc(S.me.role)}</span></div>
     ${DEMO ? "" : `<div><label class="f">নতুন পাসওয়ার্ড</label><div class="row" style="flex-wrap:nowrap"><input class="in" type="password" id="st-pw" autocomplete="new-password" placeholder="কমপক্ষে ১০ অক্ষর"><button class="btn fix" id="st-pw-s">বদলান</button></div></div>`}</div></div>
   <div class="card"><h3>🎨 দেখতে কেমন</h3><div class="grid" style="gap:12px">
     <div class="row"><div><label class="f">থিম</label>${sel("st-th", [["light", "লাইট"], ["dark", "ডার্ক"]], getTheme())}</div><div><label class="f">${bi("ভাষা", "Language")}</label>${sel("st-lg", [["bn", bi("বাংলা", "Bangla")], ["en", "English"]], LANG)}</div></div>
     <div class="row"><div><label class="f">লেখার আকার</label>${sel("st-fs", [["small", "ছোট"], ["normal", "স্বাভাবিক"], ["large", "বড়"]], PREFS.font)}</div><div><label class="f">টেবিল</label>${sel("st-cp", [["0", "আরামদায়ক"], ["1", "ঘন (বেশি সারি)"]], PREFS.compact ? 1 : 0)}</div></div>
     <div><label class="f">অ্যাপ খুললে কোন পাতা</label>${sel("st-start", starts, PREFS.start)}</div></div></div>
   <div class="card"><h3>🔔 রিমাইন্ডার ও সতর্কতা</h3><div class="grid" style="gap:12px">
     <div class="row"><div><label class="f">ব্যাংক ক্লোজিং বাকি থাকলে সতর্কতা</label>${sel("st-ch", hours, PREFS.closingHour)}</div><div><label class="f">ক্যাশ রেকর্ড বাকি থাকলে সতর্কতা</label>${sel("st-cs", hours, PREFS.cashHour)}</div></div>
     <div class="row"><div><label class="f">কত দিন Pending হলে সতর্কতা</label>${sel("st-pd", [[2, "২ দিন"], [3, "৩ দিন"], [5, "৫ দিন"], [7, "৭ দিন"]], PREFS.pendDays)}</div><div><label class="f">শব্দ</label>${sel("st-snd", [["1", "চালু"], ["0", "বন্ধ"]], PREFS.sound ? 1 : 0)}</div></div>
     <div class="row"><div><label class="f">শুক্রবার</label>${sel("st-fri", [["1", "বন্ধ দিন (আগের/পরের বাটনে বাদ)"], ["0", "কর্মদিবস"]], PREFS.skipFri ? 1 : 0)}</div></div>
     <div class="row"><button class="btn fix" id="st-np" ${perm === "granted" || perm === "na" ? "disabled" : ""}>${perm === "granted" ? "✓ নোটিফিকেশন চালু আছে" : perm === "denied" ? "নোটিফিকেশন ব্রাউজারে বন্ধ" : "নোটিফিকেশন চালু করুন"}</button><button class="btn fix" id="st-nt">পরীক্ষা করুন</button></div></div></div>
   <div class="card"><h3>📱 অ্যাপ ও ডাটা</h3><div class="grid" style="gap:10px">
     <div class="kv"><span>সংস্করণ</span><b>v6 · ${esc(document.querySelector('script[src^="app.js"]')?.getAttribute("src")?.split("v=")[1] || "")}</b></div>
     <div class="kv"><span>ইন্টারনেট</span><b class="${navigator.onLine ? "gr" : "rd"}">${navigator.onLine ? "অনলাইন" : "অফলাইন"}</b></div>
     <div class="kv"><span>সিঙ্ক বাকি</span><b>${DEMO ? "—" : Outbox.count()}</b></div>
     <div class="kv"><span>এই ডিভাইসে জমা ডাটা</span><b>${(used / 1024).toFixed(0)} KB</b></div>
     <div class="row" style="margin-top:6px"><button class="btn fix" id="st-sync">${ico("clock")} এখনই সিঙ্ক</button><button class="btn fix" id="st-upd">↻ আপডেট দেখুন</button>${isStandalone() ? "" : `<button class="btn pri fix" id="st-inst">⬇ অ্যাপ ইনস্টল</button>`}<button class="btn bad fix" id="st-clr">ক্যাশ মুছে রিলোড</button></div>
     <div class="mut xs">"ক্যাশ মুছে রিলোড" শুধু এই ডিভাইসের জমা কপি মোছে — সার্ভারের ডাটা ঠিক থাকে। সিঙ্ক বাকি থাকলে আগে সিঙ্ক করুন।</div></div></div>
   <div class="card"><h3>🔐 ${LANG === "en" ? "Security" : "নিরাপত্তা"}</h3><div class="grid" style="gap:12px">
     <div><label class="f">${LANG === "en" ? "Auto-lock when idle" : "কিছুক্ষণ ব্যবহার না করলে অটো-লক"}</label>${sel("st-lk", [[0, LANG === "en" ? "Off" : "বন্ধ"], [1, LANG === "en" ? "1 minute" : "১ মিনিট"], [5, LANG === "en" ? "5 minutes" : "৫ মিনিট"], [10, LANG === "en" ? "10 minutes" : "১০ মিনিট"], [15, LANG === "en" ? "15 minutes" : "১৫ মিনিট"], [30, LANG === "en" ? "30 minutes" : "৩০ মিনিট"], [60, LANG === "en" ? "1 hour" : "১ ঘণ্টা"]], lockMin())}<div class="mut xs">${LANG === "en" ? "This device only. Unlock with your password. Shortcut: Ctrl+Shift+L." : "শুধু এই ডিভাইসে। পাসওয়ার্ড দিয়ে আনলক। শর্টকাট: Ctrl+Shift+L।"}</div></div>
     <div class="row"><button class="btn fix" id="st-lock">🔒 ${LANG === "en" ? "Lock now" : "এখনই লক করুন"}</button></div>
     ${DEMO ? "" : `<div id="st-mfa" class="scrow"><div class="mut sm">…</div></div>`}</div></div>
   ${!DEMO && "serviceWorker" in navigator && "PushManager" in window ? `<div class="card"><h3>🔔 ${bi("পুশ নোটিফিকেশন", "Push notifications")}</h3><div id="st-push" class="scrow"><div class="mut sm">…</div></div><div class="mut xs" style="margin-top:6px">${bi("Boss/Admin চালু করলে প্রতিদিন রাত ৮টায় (বাংলাদেশ সময়) সারাংশ পাবেন। iPhone-এ আগে অ্যাপটি Home Screen-এ Add করতে হবে।", "Boss/Admin get a daily summary at 8 pm (Bangladesh time). On iPhone, add the app to the Home Screen first.")}</div></div>` : ""}
   ${admin ? `<div class="card" style="grid-column:1/-1"><h3>🛡 Admin শর্টকাট</h3><div class="row"><a class="btn fix" href="#/admin">${ico("gear")} ব্যবহারকারী ও অ্যাকাউন্ট</a><a class="btn fix" href="#/audit">${ico("shield")} Audit ও Backup</a><a class="btn fix" href="#/books">${ico("book")} চেক বই</a></div></div>` : ""}</div>`;
  const g = id => $("#" + id, v);
  { const f = g("pf-f"), rm = g("pf-rm"); g("pf-up").onclick = () => f.click();
    f.onchange = async () => { const f0 = f.files[0]; f.value = ""; if (!f0) return; const file = await pickImage(f0, { title: LANG === "en" ? "Crop profile picture" : "প্রোফাইল ছবি ক্রপ", aspect: 1, aspects: [], circle: true, face: true, allowFull: false, maxSide: 512 }, f); if (!file) return; const b = g("pf-up"); b.disabled = true; try { const img = await imgToAvatar(file); await API.setAvatar(img); avaMap()[S.me.id] = img; try { localStorage.setItem("nabiad_ava_" + S.me.id, img); } catch { } refreshAvatars(); rm.classList.remove("hide"); toast(LANG === "en" ? "✔ Photo updated" : "✔ ছবি সেভ হয়েছে"); } catch (e) { toast(/function|does not exist/i.test(e.message) ? bi("schema_v6.sql-এর v6.41 অংশ চালানো হয়নি", "The v6.41 part of schema_v6.sql has not been run") : e.message, "err"); } b.disabled = false; };
    rm.onclick = async () => { if (!ask(LANG === "en" ? "Remove your profile picture?" : "প্রোফাইল ছবি মুছে ফেলবেন?")) return; try { await API.setAvatar(null); delete avaMap()[S.me.id]; try { localStorage.removeItem("nabiad_ava_" + S.me.id); } catch { } refreshAvatars(); rm.classList.add("hide"); toast(LANG === "en" ? "✔ Photo removed" : "✔ ছবি মুছে ফেলা হয়েছে"); } catch (e) { toast(e.message, "err"); } }; }
  g("st-nm-s").onclick = async () => { const n = g("st-nm").value.trim(); if (!n) return toast("নাম লিখুন", "err"); try { await API.setMyName(n); S.me.name = n; saveCache(); shell(); route(); toast("✔ নাম সেভ হয়েছে"); } catch (e) { toast(/function|does not exist/i.test(e.message) ? bi("schema_v3.sql চালানো বাকি", "schema_v3.sql has not been run yet") : e.message, "err"); } };
  g("st-pw-s") && (g("st-pw-s").onclick = async () => { const p = g("st-pw").value; if (p.length < 10) return toast(bi("পাসওয়ার্ড কমপক্ষে ১০ অক্ষর", "Password must be at least 10 characters"), "err"); try { await API.changePassword(p); g("st-pw").value = ""; toast("✔ পাসওয়ার্ড বদলানো হয়েছে"); } catch (e) { toast(e.message, "err"); } });
  g("st-th").onchange = e => setTheme(e.target.value); g("st-lg").onchange = e => setLang(e.target.value);
  g("st-lk").onchange = e => { try { localStorage.setItem(LOCK_KEY, e.target.value); } catch { } lastAct = Date.now(); toast(LANG === "en" ? "✔ Saved" : "✔ সেভ হয়েছে"); };
  g("st-lock").onclick = () => lockNow();
  if (g("st-push")) { const paintP = async () => { const box = g("st-push"); if (!box) return; let m = null; try { m = await API.pushMine(); } catch (e) { } const on = !!(m && m.row), denied = "Notification" in window && Notification.permission === "denied";
    box.innerHTML = `<div style="flex:1"><b>${bi("এই ডিভাইসে", "On this device")}: ${on ? bi("চালু", "ON") : bi("বন্ধ", "OFF")}</b>${denied ? `<div class="rd xs">${bi("ব্রাউজারে নোটিফিকেশন ব্লক করা আছে — সাইট সেটিংস থেকে Allow করুন", "Notifications are blocked — allow them in site settings")}</div>` : ""}${on ? `<label class="euac" style="margin-top:6px"><input type="checkbox" id="st-pushs" ${m.row.summary ? "checked" : ""}><span class="sw"></span> ${bi("রাতের সারাংশ", "Nightly summary")}</label>` : ""}</div><div class="row">${on ? `<button class="btn sm" id="st-pusht">${bi("টেস্ট", "Test")}</button>` : ""}<button class="btn sm ${on ? "" : "pri"}" id="st-pushb">${on ? bi("বন্ধ করুন", "Turn off") : bi("চালু করুন", "Turn on")}</button></div>`;
    g("st-pushb").onclick = async () => { try { if (on) { await API.pushOff(m.sub.endpoint); await m.sub.unsubscribe(); } else { const perm = await Notification.requestPermission(); if (perm !== "granted") { toast(bi("অনুমতি দেওয়া হয়নি", "Permission not granted"), "err"); return paintP(); } const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUB) }); await API.pushOn(sub); toast(bi("✔ নোটিফিকেশন চালু হয়েছে", "✔ Notifications on")); } } catch (e) { toast(e.message || String(e), "err"); } paintP(); };
    if (g("st-pusht")) g("st-pusht").onclick = async () => { try { const r = await API.pushTest(); toast(r && r.ok ? bi("✔ টেস্ট পাঠানো হয়েছে", "✔ Test sent") : bi("পাঠানো যায়নি — একটু পরে আবার চেষ্টা করুন", "Not delivered — try again"), r && r.ok ? "ok" : "err"); } catch (e) { toast(e.message || String(e), "err"); } };
    if (g("st-pushs")) g("st-pushs").onchange = async e => { try { await API.pushSummary(m.sub.endpoint, e.target.checked); } catch (er) { toast(er.message, "err"); } }; }; paintP(); }
  if (g("st-mfa")) { const en = LANG === "en", paint = async () => { const f = await API.mfaFactor().catch(() => null), box = g("st-mfa"); if (!box) return;
    box.innerHTML = `<div style="flex:1"><b>${en ? "2-step verification (2FA)" : "টু-স্টেপ ভেরিফিকেশন (2FA)"}: ${f ? (en ? "ON" : "চালু") : (en ? "OFF" : "বন্ধ")}</b><div class="mut xs">${en ? "Adds a 6-digit code from your phone at sign-in. Strongly recommended for Admin and Boss." : "লগইনের সময় ফোনের ৬ অঙ্কের কোড লাগে। Admin ও Boss-এর জন্য জোরালোভাবে সুপারিশ।"}</div></div><button class="btn sm ${f ? "bad" : "pri"} fix" id="st-mfab">${f ? (en ? "Turn off" : "বন্ধ করুন") : (en ? "Turn on" : "চালু করুন")}</button>`;
    g("st-mfab").onclick = async () => { if (!f) return mfaEnrollModal(paint); if (!ask(en ? "Turn off 2FA?" : "2FA বন্ধ করবেন?")) return; try { const { error } = await sb.auth.mfa.unenroll({ factorId: f.id }); if (error) throw error; toast(en ? "✔ 2FA is off" : "✔ 2FA বন্ধ হয়েছে"); paint(); } catch (e) { toast(e.message || String(e), "err"); } }; }; paint(); }
  g("st-fs").onchange = e => savePrefs({ font: e.target.value }); g("st-cp").onchange = e => savePrefs({ compact: e.target.value === "1" }); g("st-start").onchange = e => { savePrefs({ start: e.target.value }); toast("✔ সেভ হয়েছে"); };
  g("st-ch").onchange = e => { savePrefs({ closingHour: +e.target.value }); updateBell(); }; g("st-cs").onchange = e => { savePrefs({ cashHour: +e.target.value }); updateBell(); };
  g("st-pd").onchange = e => { savePrefs({ pendDays: +e.target.value }); refreshBadges(); }; g("st-snd").onchange = e => savePrefs({ sound: e.target.value === "1" }); g("st-fri").onchange = e => savePrefs({ skipFri: e.target.value === "1" });
  g("st-np").onclick = async () => { await Notification.requestPermission(); vSettings(v); };
  g("st-nt").onclick = () => { if (PREFS.sound) beep(); sysNotify(bi("🔔 পরীক্ষা — Nabiad", "🔔 Test — Nabiad"), bi("নোটিফিকেশন ঠিকমতো কাজ করছে", "Notifications are working"), "test"); toast(bi("পরীক্ষার নোটিফিকেশন পাঠানো হয়েছে", "Test notification sent")); };
  g("st-sync").onclick = async () => { if (DEMO) return toast(bi("DEMO মোড", "DEMO mode")); await Outbox.flush(); await reload(); toast("✔ সিঙ্ক ও রিফ্রেশ হয়েছে"); };
  g("st-upd").onclick = async () => { try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { } toast("নতুন সংস্করণ থাকলে রিলোড হচ্ছে…"); setTimeout(() => location.reload(), 900); };
  g("st-inst") && (g("st-inst").onclick = installModal);
  g("st-clr").onclick = () => { if (Outbox.count() && !ask(bi(`${Outbox.count()}টি এন্ট্রি এখনো সিঙ্ক হয়নি — মুছলে হারিয়ে যাবে। তবুও মুছবেন?`, `${Outbox.count()} entries are not synced yet — they will be lost if cleared. Clear anyway?`))) return; if (!ask(bi("এই ডিভাইসের জমা কপি মুছে রিলোড করবেন?", "Clear this device's saved copy and reload?"))) return; [CACHE_KEY, "nabiad_rem_seen"].forEach(k => localStorage.removeItem(k)); if (!Outbox.count()) localStorage.removeItem(OB_KEY); location.reload(); };
}

/* =================== v6: audit & security (tabs) =================== */

/* =================== v6.2: audit log =================== */
AU_F.event = "ঘটনা"; AU_T.cash_records = "ক্যাশ"; AU_T.audit_log = "Audit log";
const AU_IC = { insert: "plus", update: "edit", delete: "trash" };
const auText = r => { const o = r.old || {}, n = r.new || {}; if (r.action === "update") return Object.keys({ ...o, ...n }).filter(k => !AU_SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])).map(k => `${AU_F[k] || k}: ${auV(o[k])} → ${auV(n[k])}`).join("; "); const x = r.action === "delete" ? o : n; return Object.entries(x).filter(([k, val]) => !AU_SKIP.has(k) && val !== null && val !== "").map(([k, val]) => `${AU_F[k] || k}: ${auV(val)}`).join("; "); };
function auChips(r, all) {
  const o = r.old || {}, n = r.new || {}, L = k => `<span class="au-k">${esc(AU_F[k] || k)}</span>`;
  if (r.action === "update") { const ks = Object.keys({ ...o, ...n }).filter(k => !AU_SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])); return ks.map(k => `<span class="auc">${L(k)}<s>${esc(auV(o[k]))}</s><i>→</i><b>${esc(auV(n[k]))}</b></span>`).join("") || `<span class="mut xs">—</span>`; }
  const x = r.action === "delete" ? o : n, es = Object.entries(x).filter(([k, val]) => !AU_SKIP.has(k) && val !== null && val !== "" && typeof val !== "object");
  return es.slice(0, all ? 99 : 4).map(([k, val]) => `<span class="auc">${L(k)}<b>${esc(auV(val))}</b></span>`).join("") + (!all && es.length > 4 ? `<button class="btn sm ghost au-more">+${es.length - 4}</button>` : "");
}
async function vAudit(v) {
  const admin = S.me.role === "admin", F = { ...pbInit("month"), tbl: "", act: "", who: "", q: "" };
  v.innerHTML = head("Audit log", `<div class="dd"><button class="btn" id="au-dl">${ico("dl")} ডাউনলোড ▾</button><div class="ddm hide" id="au-menu"><button data-dl="xlsx">${ico("dl")} Excel (.xlsx)</button><button data-dl="csv">${ico("list")} CSV</button><button data-dl="print">${ico("print")} প্রিন্ট / PDF</button></div></div>${admin ? `<button class="btn rdo" id="au-clr">${ico("trash")} লগ পরিষ্কার</button>` : ""}`) + `
   <div class="card noprint" style="margin-bottom:12px">${pbBar("au", F)}
    <div class="srch"><label class="si">${ico("search")}<input class="in" id="au-q" placeholder="খুঁজুন — A/C, চেক নং, ইমেইল…" autocomplete="off" type="search"></label></div>
    <div class="aufl"><select class="in" id="au-t"><option value="">সব জায়গা</option>${Object.entries({ ...AU_T, cash_records: "ক্যাশ" }).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select><select class="in" id="au-a"><option value="">সব কাজ</option>${Object.entries(AU_A).map(([k, l]) => `<option value="${k}">${l[0]}</option>`).join("")}</select><select class="in" id="au-w"><option value="">সবাই</option></select></div></div>
   <div class="grid g4 au-k4" id="au-kpi"></div><div id="au-out" style="margin-top:12px"><div class="card empty">লোড হচ্ছে…</div></div>`;
  let rows = [], shown = [], more = false;
  const range = () => pbRange(F);
  async function load(append) {
    const [from, to] = range(); if (!append) $("#au-out", v).innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
    try { const r = await API.audit({ tbl: F.tbl, act: F.act, from, to, offset: append ? rows.length : 0 }); rows = append ? rows.concat(r) : r; more = r.length >= 500; }
    catch (e) { $("#au-out", v).innerHTML = `<div class="alert rd">${/relation|does not exist|schema cache|not find/i.test(e.message || "") ? "Audit log টেবিল নেই — Supabase-এ schema_v2.sql চালাতে হবে" : esc(e.message || e)}</div>`; return; }
    const users = [...new Set(rows.map(r => r.user_name).filter(Boolean))].sort(); const ws = $("#au-w", v), cur = ws.value; ws.innerHTML = `<option value="">সবাই</option>` + users.map(u => `<option ${u === cur ? "selected" : ""}>${esc(u)}</option>`).join("");
    draw();
  }
  function draw() {
    const q = norm(F.q); shown = rows.filter(r => (!F.who || r.user_name === F.who) && (!q || norm([r.user_name, r.row_key, r.tbl, JSON.stringify(r.new || r.old)].join(" ")).includes(q)));
    const c = a => shown.filter(r => r.action === a).length, top = Object.entries(shown.reduce((m, r) => (m[r.user_name] = (m[r.user_name] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0];
    $("#au-kpi", v).innerHTML = `<div class="kpi card k-vi"><div class="l">মোট পরিবর্তন</div><div class="v num">${shown.length}${more ? "+" : ""}</div><div class="s">${top ? `<span>সবচেয়ে বেশি:</span> ${esc(top[0])} (${top[1]})` : "—"}</div></div><div class="kpi card k-gr"><div class="l">যোগ</div><div class="v num">${c("insert")}</div></div><div class="kpi card k-am"><div class="l">বদল</div><div class="v num">${c("update")}</div></div><div class="kpi card k-rd"><div class="l">মুছে ফেলা</div><div class="v num">${c("delete")}</div></div>`;
    if (!shown.length) { $("#au-out", v).innerHTML = `<div class="card empty">এই সময়ে কোনো পরিবর্তন নেই</div>`; return; }
    let last = "", html = "";
    shown.forEach((r, i) => { const d = r.at.slice(0, 10), ld = new Date(r.at); if (d !== last) { last = d; html += `<div class="au-day">${ld.toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>`; }
      html += `<div class="aui a-${r.action}" data-i="${i}"><div class="aic">${ico(AU_IC[r.action] || "edit")}</div><div class="aib"><div class="ait"><span class="tag au-${r.action}">${(AU_A[r.action] || [r.action])[0]}</span><b>${esc(AU_T[r.tbl] || (r.tbl === "cash_records" ? "ক্যাশ" : r.tbl))}</b><span class="aik">${esc(r.row_key || "")}</span></div><div class="aim">${ico("clock").replace("<svg", '<svg width="12" height="12"')} ${ld.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · <b>${esc(r.user_name || "system")}</b></div><div class="aud">${auChips(r)}</div></div></div>`; });
    $("#au-out", v).innerHTML = `<div class="card au-list">${html}</div>${more ? `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn fix" id="au-more">আরও লোড করুন</button></div>` : ""}`;
    $$(".au-more", v).forEach(b => b.onclick = e => { e.stopPropagation(); const r = shown[+b.closest(".aui").dataset.i]; b.closest(".aud").innerHTML = auChips(r, true); });
    $("#au-more", v) && ($("#au-more", v).onclick = () => load(true));
  }
  const fname = ext => `Audit_${range()[0]}_${range()[1]}.${ext}`;
  async function download(kind) {
    $("#au-menu", v).classList.add("hide"); if (!shown.length) return toast("ডাটা নেই", "err");
    const H = ["Time", "User", "Where", "Action", "Item", "Changes", "Old (JSON)", "New (JSON)"], R = shown.map(r => [new Date(r.at).toLocaleString("en-GB"), r.user_name || "", AU_T[r.tbl] ? tr(AU_T[r.tbl]) : r.tbl, r.action, r.row_key || "", auText(r), r.old ? JSON.stringify(r.old) : "", r.new ? JSON.stringify(r.new) : ""]);
    if (kind === "xlsx") return exportXlsx({ Audit: [H, ...R] }, fname("xlsx"));
    if (kind === "csv") { const csv = "﻿" + [H, ...R].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = fname("csv"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return; }
    const [f0, t0] = range(), cnt = a => shown.filter(r => r.action === a).length;
    const body = shown.map(r => `<tr><td>${esc(new Date(r.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}</td><td>${esc(r.user_name || "")}</td><td>${esc(AU_T[r.tbl] ? tr(AU_T[r.tbl]) : (r.tbl === "cash_records" ? tr("ক্যাশ") : r.tbl))}</td><td>${esc((AU_A[r.action] || [r.action])[0])}</td><td>${esc(r.row_key || "")}</td><td>${esc(auText(r))}</td></tr>`).join("");
    printSheet(repSheet("au-sheet", "Audit Log · পরিবর্তনের লগ", f0, t0, repKpi([["Changes", shown.length], ["Added", cnt("insert")], ["Edited", cnt("update")], ["Deleted", cnt("delete")]]), repOne(repBox("Change history", ["~Time", "~User", "~Where", "~Action", "~Item", "~Changes"], body)), more ? "Note: only the loaded records are included." : ""), fname("pdf").replace(/\.pdf$/, ""));
  }
  $("#au-dl", v).onclick = e => { e.stopPropagation(); $("#au-menu", v).classList.toggle("hide"); };
  $$("#au-menu [data-dl]", v).forEach(b => b.onclick = () => download(b.dataset.dl));
  const hideMenu = () => $("#au-menu", v)?.classList.add("hide"); document.addEventListener("click", hideMenu);
  $("#au-clr", v) && ($("#au-clr", v).onclick = () => clearAuditModal(() => load()));
  pbBind(v, "au", F, load);
  $("#au-t", v).onchange = e => { F.tbl = e.target.value; load(); }; $("#au-a", v).onchange = e => { F.act = e.target.value; load(); }; $("#au-w", v).onchange = e => { F.who = e.target.value; draw(); };
  $("#au-q", v).oninput = e => { F.q = e.target.value; draw(); };
  await load();
  return () => document.removeEventListener("click", hideMenu);
}
function clearAuditModal(after) {
  modal(`<h2>🧹 Audit log পরিষ্কার</h2><p class="mut sm" style="margin-top:-6px">পুরনো লগ মুছে জায়গা খালি করুন। মোছার পরেও "কে কখন পরিষ্কার করেছে" তার একটা রেকর্ড থেকে যাবে।</p>
   <div class="grid" style="gap:8px">${[["90", bi("৯০ দিনের বেশি পুরনো", "Older than 90 days")], ["30", bi("৩০ দিনের বেশি পুরনো", "Older than 30 days")], ["7", bi("৭ দিনের বেশি পুরনো", "Older than 7 days")], ["all", bi("সব লগ", "All logs")]].map(([k, l], i) => `<label class="rad"><input type="radio" name="clr" value="${k}" ${i === 0 ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
   <label class="rad" style="margin-top:12px"><input type="checkbox" id="clr-dl" checked><span>মোছার আগে Excel কপি ডাউনলোড করুন</span></label>
   <div id="clr-all" class="hide" style="margin-top:10px"><label class="f">নিশ্চিত করতে <b>CLEAR</b> লিখুন</label><input class="in" id="clr-t" autocomplete="off"></div>
   <div class="row" style="margin-top:16px"><button class="btn bad fix" id="clr-ok">${ico("trash")} পরিষ্কার করুন</button><button class="btn fix" id="clr-x">বাতিল</button></div>`, (root, close) => {
    $$("[name=clr]", root).forEach(r => r.onchange = () => $("#clr-all", root).classList.toggle("hide", $("[name=clr]:checked", root).value !== "all"));
    $("#clr-x", root).onclick = close;
    $("#clr-ok", root).onclick = async () => {
      const k = $("[name=clr]:checked", root).value; if (k === "all" && $("#clr-t", root).value.trim().toUpperCase() !== "CLEAR") return toast("CLEAR লিখুন", "err");
      const before = k === "all" ? new Date(Date.now() + 60000).toISOString() : new Date(addDays(today(), -+k) + "T00:00:00").toISOString();
      const b = $("#clr-ok", root); b.disabled = true;
      try {
        if ($("#clr-dl", root).checked) { const old = await API.audit({ from: "2000-01-01", to: k === "all" ? today() : addDays(today(), -+k - 1), limit: 20000 }); if (old.length) await exportXlsx({ Audit: [["Time", "User", "Where", "Action", "Item", "Changes"], ...old.map(r => [new Date(r.at).toLocaleString("en-GB"), r.user_name || "", r.tbl, r.action, r.row_key || "", auText(r)])] }, `Audit_archive_${today()}.xlsx`); }
        const n = await API.clearAudit(before); close(); toast(bi(`✔ ${n}টি পুরনো লগ মুছে ফেলা হয়েছে`, `✔ ${n} old log(s) deleted`)); after && after();
      } catch (e) { toast(/function|does not exist/i.test(e.message || "") ? "schema_v4.sql চালানো বাকি" : e.message, "err"); b.disabled = false; }
    };
  });
}

/* =================== v6.2: audit & security shell =================== */
async function vSecurity(v) {
  const admin = S.me.role === "admin"; let tab = sessionStorage.getItem("nabiad_sec_tab") || "audit"; if (!admin && tab !== "audit") tab = "audit";
  const tabs = [["audit", "📜", "Audit log"], ...(admin ? [["backup", "💾", "Backup"], ["sec", "🔐", "Security"]] : [])];
  v.innerHTML = `<div class="tabs ntabs" style="margin-bottom:12px">${tabs.map(([k, i, l]) => `<span class="chip ${k === tab ? "on" : ""}" data-st="${k}"><i class="te">${i}</i> <span>${l}</span></span>`).join("")}</div><div id="sec-out"></div>`;
  $$("[data-st]", v).forEach(c => c.onclick = () => { sessionStorage.setItem("nabiad_sec_tab", c.dataset.st); if (cleanup) { cleanup(); cleanup = null; } vSecurity(v).then(f => { cleanup = f || null; }); });
  const out = $("#sec-out", v);
  if (tab === "audit") return vAudit(out);
  if (tab === "backup") return vBackup(out);
  return vSec(out);
}
function nextMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d; }
async function vBackup(out) {
  out.innerHTML = head("Backup", `<button class="btn pri" id="bk-now">${ico("save")} এখনই Backup</button><button class="btn" id="bk-dl">${ico("dl")} পুরো ডাটা (Excel)</button>`) + `<div class="grid g4" id="bk-kpi"><div class="kpi card"><div class="skel"></div></div><div class="kpi card"><div class="skel"></div></div><div class="kpi card"><div class="skel"></div></div><div class="kpi card"><div class="skel"></div></div></div>
   <div class="card flush" style="margin-top:12px" id="bk-list"><div class="empty">লোড হচ্ছে…</div></div>
   <div class="card" style="margin-top:12px"><h3>ℹ️ Backup কীভাবে কাজ করে</h3><ul class="chk"><li>🕛 প্রতি রাত ১২টায় (বাংলাদেশ সময়) ডাটাবেস নিজে থেকে Backup নেয় — কাউকে কিছু করতে হয় না।</li><li>🗂 স্বয়ংক্রিয় Backup শেষ ১৪ দিনের রাখা হয়, হাতে নেওয়া Backup শেষ ১০টি।</li><li>⬇ যেকোনো Backup JSON বা Excel হিসেবে ডাউনলোড করে নিজের কম্পিউটার / Google Drive-এ রাখুন — মাসে অন্তত একবার।</li><li>♻ ডাটা ফেরত আনতে হলে Admin ডাউনলোড করা ফাইল দিয়ে Supabase-এ restore করতে পারে।</li></ul></div>`;
  const toXlsx = async (d, name) => { const sheets = {}; for (const [t, rows] of Object.entries(d || {})) { if (!Array.isArray(rows) || !rows.length) continue; const keys = [...new Set(rows.flatMap(r => Object.keys(r)))]; sheets[t.slice(0, 31)] = [keys, ...rows.map(r => keys.map(k => r[k] !== null && typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k]))]; } if (!Object.keys(sheets).length) return toast("ডাটা নেই", "err"); await exportXlsx(sheets, name); };
  const list = async () => {
    let rows; try { rows = await API.backups(); } catch (e) { $("#bk-list", out).innerHTML = `<div class="alert rd" style="margin:12px">${/relation|does not exist|schema cache|not find/i.test(e.message || "") ? "Backup টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে" : esc(e.message)}</div>`; $("#bk-kpi", out).innerHTML = ""; return; }
    const lastA = rows.find(r => r.kind === "auto"), lastM = rows.find(r => r.kind === "manual"), nm = nextMidnight(), ok = lastA && Date.now() - new Date(lastA.at) < 36 * 36e5;
    $("#bk-kpi", out).innerHTML = `<div class="kpi card ${ok ? "k-gr" : "k-am"}"><div class="l">শেষ স্বয়ংক্রিয়</div><div class="v" style="font-size:17px">${lastA ? new Date(lastA.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "এখনো হয়নি"}</div><div class="s">${lastA ? relTime(lastA.at) : "আজ রাতে প্রথমটি হবে"}</div></div>
      <div class="kpi card k-vi"><div class="l">পরের Backup</div><div class="v" style="font-size:17px">${nm.toLocaleString("en-GB", { day: "2-digit", month: "short" })}, 12:00 AM</div><div class="s">${relTime(nm)}</div></div>
      <div class="kpi card k-cy"><div class="l">মোট Backup</div><div class="v num">${rows.length}</div><div class="s"><span>স্বয়ংক্রিয়</span> ${rows.filter(r => r.kind === "auto").length} · <span>হাতে</span> ${rows.filter(r => r.kind === "manual").length}</div></div>
      <div class="kpi card"><div class="l">শেষ হাতে-নেওয়া</div><div class="v" style="font-size:17px">${lastM ? new Date(lastM.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</div><div class="s">${rows[0] ? `<span>রেকর্ড</span> ${money0(rows[0].size_rows)}` : ""}</div></div>`;
    $("#bk-list", out).innerHTML = `<div class="ch"><h3>Backup তালিকা</h3><span class="tag">${rows.length}</span></div>` + (rows.length ? `<div class="bkl">${rows.map(r => `<div class="bkr"><div class="bki ${r.kind}">${ico(r.kind === "auto" ? "clock" : "save")}</div><div class="bkb"><b>${new Date(r.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</b><div class="mut xs"><span>${r.kind === "auto" ? "স্বয়ংক্রিয়" : "হাতে"}</span> · ${money0(r.size_rows)} <span>রেকর্ড</span> · ${relTime(r.at)}</div></div><div class="bka"><button class="btn sm" data-j="${r.id}" data-at="${r.at}" title="JSON">JSON</button><button class="btn sm" data-x="${r.id}" data-at="${r.at}" title="Excel">${ico("dl")} Excel</button>${r.kind === "manual" ? `<button class="btn sm ghost" data-del="${r.id}" title="মুছুন">${ico("trash")}</button>` : ""}</div></div>`).join("")}</div>` : `<div class="empty">এখনো কোনো Backup নেই — "এখনই Backup" চাপুন</div>`);
    const fn = (at, ext) => `nabiad_backup_${at.slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
    $$("[data-j]", out).forEach(b => b.onclick = async () => { b.disabled = true; try { const d = await API.backupData(+b.dataset.j || b.dataset.j); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: "application/json" })); a.download = fn(b.dataset.at, "json"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch (e) { toast(e.message, "err"); } b.disabled = false; });
    $$("[data-x]", out).forEach(b => b.onclick = async () => { b.disabled = true; try { await toXlsx(await API.backupData(+b.dataset.x || b.dataset.x), fn(b.dataset.at, "xlsx")); } catch (e) { toast(e.message, "err"); } b.disabled = false; });
    $$("[data-del]", out).forEach(b => b.onclick = async () => { if (!ask("এই হাতে-নেওয়া Backup মুছবেন?")) return; try { await API.deleteBackup(+b.dataset.del || b.dataset.del); toast("✔ মুছে ফেলা হয়েছে"); list(); } catch (e) { toast(/function|does not exist/i.test(e.message || "") ? "schema_v4.sql চালানো বাকি" : e.message, "err"); } });
  };
  $("#bk-now", out).onclick = async () => { const b = $("#bk-now", out); b.disabled = true; try { await API.backupNow(); toast("✔ Backup নেওয়া হয়েছে"); await list(); } catch (e) { toast(e.message, "err"); } b.disabled = false; };
  $("#bk-dl", out).onclick = async () => { const b = $("#bk-dl", out); b.disabled = true; toast("ডাটা আনা হচ্ছে… একটু সময় লাগবে"); try { await toXlsx(await API.dumpAll(), `Nabiad_Full_Data_${today()}.xlsx`); } catch (e) { toast(e.message, "err"); } b.disabled = false; };
  await list();
}
async function vSec(out) {
  out.innerHTML = head("Security") + `<div class="card empty">লোড হচ্ছে…</div>`;
  const [logins, bks, recent] = await Promise.all([API.userLogins().catch(() => null), API.backups().catch(() => []), API.audit({ act: "delete", from: addDays(today(), -6), to: today() }).catch(() => [])]);
  let us = logins; if (!us) { try { us = (await API.users()).map(u => ({ ...u, last_sign_in_at: null })); } catch { us = []; } }
  const perm = "Notification" in window ? Notification.permission : "na", lastB = bks.find(b => b.kind === "auto"), noName = us.filter(u => !u.name || u.name === (u.email || "").split("@")[0]).length;
  const checks = [[true, "ডাটাবেস নিরাপত্তা (RLS) চালু", "Staff শুধু যোগ করতে পারে; বদলানো ও মোছা শুধু Admin"], [true, "নতুন কেউ নিজে অ্যাকাউন্ট খুলতে পারে না", "শুধু Admin ব্যবহারকারী যোগ করে"], [location.protocol === "https:" || DEMO, "নিরাপদ সংযোগ (HTTPS)", location.host],
    [!!lastB && Date.now() - new Date(lastB.at) < 36 * 36e5, "দৈনিক Backup", lastB ? relTime(lastB.at) : "এখনো স্বয়ংক্রিয় Backup হয়নি"], [true, "সব পরিবর্তনের রেকর্ড (Audit log)", "কে, কখন, আগে কী ছিল"], [true, "চেকের ছবি সুরক্ষিত", "লগইন ছাড়া দেখা যায় না"],
    [perm === "granted", "এই ডিভাইসে নোটিফিকেশন", perm === "granted" ? "চালু" : "সেটিংস থেকে চালু করুন"], [!noName, "সব ব্যবহারকারীর নাম দেওয়া", noName ? `${noName} জনের নাম ঠিক করা বাকি` : "ঠিক আছে"]];
  const score = Math.round(checks.filter(c => c[0]).length / checks.length * 100);
  out.innerHTML = head("Security") + `<div class="grid g2">
    <div class="card"><div class="secs"><div class="ring" style="--p:${score}"><b>${score}%</b></div><div><h3 style="margin:0">নিরাপত্তা স্কোর</h3><div class="mut sm">${checks.filter(c => c[0]).length} / ${checks.length} <span>ঠিক আছে</span></div></div></div>
      <div class="hcl">${checks.map(([ok, l, s]) => `<div class="hc ${ok ? "ok" : "no"}"><i>${ok ? "✓" : "!"}</i><div><b>${l}</b><div class="mut xs">${esc(s)}</div></div></div>`).join("")}</div></div>
    <div class="grid" style="gap:14px;align-content:start"><div class="card"><h3>💻 এই ডিভাইস</h3><div class="kv"><span>লগইন ইমেইল</span><b class="sm">${esc(S.me.email)}</b></div><div class="kv"><span>Role</span><b>${esc(S.me.role)}</b></div><div class="kv"><span>ডিভাইস</span><b class="sm">${esc((navigator.userAgentData?.platform || navigator.platform || "") + " · " + (/Mobi/.test(navigator.userAgent) ? "Mobile" : "Desktop"))}</b></div>
       <div class="row" style="margin-top:12px"><button class="btn fix" id="sc-oth">${ico("out")} অন্য সব ডিভাইস থেকে লগআউট</button><a class="btn fix" href="#/settings">${ico("gear")} পাসওয়ার্ড বদলান</a></div><div class="mut xs" style="margin-top:6px">ফোন হারালে বা পাসওয়ার্ড অন্য কেউ জানলে আগে "অন্য সব ডিভাইস থেকে লগআউট" চাপুন, তারপর পাসওয়ার্ড বদলান।</div></div>
      <div class="card"><h3>🗑 গত ৭ দিনে মুছে ফেলা</h3>${recent.length ? `<div class="mini">${recent.slice(0, 6).map(r => `<div class="mi"><div><b>${esc(AU_T[r.tbl] || r.tbl)} · ${esc(r.row_key || "")}</b><div class="mut xs">${esc(r.user_name || "")} · ${new Date(r.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</div></div></div>`).join("")}</div><a class="btn sm" style="margin-top:8px" href="#/audit" onclick="sessionStorage.setItem('nabiad_sec_tab','audit')">সব দেখুন →</a>` : `<div class="alert gr">✔ গত ৭ দিনে কিছু মোছা হয়নি</div>`}</div></div>
    <div class="card flush" style="grid-column:1/-1"><div class="ch"><h3>👥 ব্যবহারকারী ও শেষ লগইন</h3><span class="tag">${us.length}</span><div class="sp" style="flex:1"></div><a class="sm" href="#/admin" onclick="sessionStorage.setItem('nabiad_admin_tab','usr')">বদলান →</a></div>
      <div class="ulr">${us.map(u => `<div class="ur">${avaEl(u.id, u.name, u.email)}<div class="ub"><b>${esc(u.name || "—")}</b> <span class="pill sm">${esc(u.role)}</span>${u.active ? "" : ` <span class="tag cl">নিষ্ক্রিয়</span>`}<div class="mut xs">${esc(u.email)}</div></div><div class="ut"><span class="mut xs">শেষ লগইন</span><b class="sm">${u.last_sign_in_at ? relTime(u.last_sign_in_at) : "—"}</b></div></div>`).join("")}</div>
      ${logins ? "" : `<div class="mut xs" style="padding:0 16px 12px">শেষ লগইনের সময় দেখাতে schema_v4.sql চালাতে হবে।</div>`}</div></div>`;
  $("#sc-oth", out).onclick = async () => { if (!ask(bi("অন্য সব ডিভাইস থেকে লগআউট করবেন? (এই ডিভাইস লগইন থাকবে)", "Sign out all other devices? (This device stays signed in)"))) return; try { await API.signOutOthers(); toast(bi("✔ অন্য ডিভাইস থেকে লগআউট হয়েছে", "✔ Other devices signed out")); } catch (e) { toast(e.message, "err"); } };
}
Object.assign(SbAPI, {
  async audit(f) { const lim = f.limit || 500, off = f.offset || 0; let q = sb.from("audit_log").select("*").order("at", { ascending: false }).range(off, off + lim - 1); if (f.tbl) q = q.eq("tbl", f.tbl); if (f.act) q = q.eq("action", f.act); if (f.from) q = q.gte("at", new Date(f.from + "T00:00:00").toISOString()); if (f.to) q = q.lt("at", new Date(addDays(f.to, 1) + "T00:00:00").toISOString()); const { data, error } = await q; if (error) throw error; return data; },
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
  async audit(f) { const off = f.offset || 0, lim = f.limit || 500; return demoStore.audit.filter(r => (!f.tbl || r.tbl === f.tbl) && (!f.act || r.action === f.act) && (!f.from || r.at.slice(0, 10) >= f.from) && (!f.to || r.at.slice(0, 10) <= f.to)).slice(off, off + lim); },
  async clearAudit(before) { const n = demoStore.audit.filter(r => r.at < before).length; demoStore.audit = demoStore.audit.filter(r => r.at >= before); this.aud("audit_log", "delete", `${n} rows cleared`, null, null); this.save(); return n; },
  async deleteBackup(id) { demoStore.backups = (demoStore.backups || []).filter(b => b.id !== id); this.save(); },
  async userLogins() { return [{ email: "admin@demo", name: S.me.name, role: "admin", active: true, last_sign_in_at: new Date().toISOString() }]; },
  async verifyPassword() { return true; }, async userSec() { return []; },
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
  async dcolAdd(c) { await this.dparties(); const row = { id: crypto.randomUUID(), date: c.date, party_id: c.party_id || null, party: c.party, asm: c.asm || "", account: c.account || "", amount: c.amount, remarks: c.remarks || "", status: "pending", entered_by: S.me.name, created_at: new Date().toISOString() }; demoStore.dcols.push(row); this.aud("dist_collections", "insert", `Collection ${row.date} · ${row.party} · ${row.amount}`, null, row); this.save(); return dcRow(row); },
  async dcolUpdate(id, p) { await this.dparties(); const o = demoStore.dcols.find(x => x.id === id); this.aud("dist_collections", "update", `Collection ${o.date} · ${o.party} · ${o.amount}`, { ...o }, { ...o, ...p }); Object.assign(o, p); this.save(); },
  async dcolDelete(id) { await this.dparties(); const o = demoStore.dcols.find(x => x.id === id); o && this.aud("dist_collections", "delete", `Collection ${o.date} · ${o.party} · ${o.amount}`, o, null); demoStore.dcols = demoStore.dcols.filter(x => x.id !== id); this.save(); },
  async dcolStatus(ids, st, note) {
    await this.dparties(); let n = 0; const role = S.me.role;
    demoStore.dcols.forEach(r => { if (!ids.includes(r.id)) return; if (role !== "admin" && !["pending"].includes(r.status)) return; if (role === "staff" && st === "pending") return; const o = { ...r }; r.status = st; r.decided_by = st === "pending" ? null : S.me.name; r.decided_at = st === "pending" ? null : new Date().toISOString(); r.decision_note = st === "pending" ? "" : (note || ""); this.aud("dist_collections", "update", `Collection ${r.date} · ${r.party} · ${r.amount}`, o, { ...r }); n++; });
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
  modal(`<h2>${title}</h2><input class="in big" id="at-i" autocomplete="off" placeholder="${ph}" value="${esc(def || "")}"><div class="hint rd" id="at-e"></div><div class="row" style="margin-top:14px"><button class="btn pri" id="at-ok">${ico("save")} সেভ</button><button class="btn" id="at-x">বন্ধ</button></div>`, (root, close) => {
    const i = $("#at-i", root); i.focus(); i.select(); $("#at-x", root).onclick = close;
    const go = async () => { const v = i.value.replace(/\s+/g, " ").trim(); if (v.length < 2) return $("#at-e", root).textContent = "নাম লিখুন"; try { await cb(v); close(); } catch (e) { $("#at-e", root).textContent = dcErr(e); } };
    $("#at-ok", root).onclick = go; i.onkeydown = e => { if (e.key === "Enter") go(); };
  });
}
const dcCan = (r, to) => {
  if (r.pending_sync || r.status === to) return false;
  if (S.me.role === "admin") return true;
  return S.me.role === "staff" && to !== "pending" && ["pending"].includes(r.status);
};
const dcCanEdit = r => !r.pending_sync && (S.me.role === "admin" || (S.me.role === "staff" && r.status === "pending"));
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
  modal(`<h2>${L} · ${ids.length}টি</h2><label class="f">কারণ / মন্তব্য <span class="mut">(ঐচ্ছিক)</span></label><input class="in" id="dd-n" autocomplete="off" placeholder="যেমন: স্টেটমেন্টে নেই / স্লিপ আসেনি"><div class="row" style="margin-top:14px"><button class="btn pri" id="dd-ok">নিশ্চিত করুন</button><button class="btn" id="dd-x">বাতিল</button></div>`, (root, close) => {
    const inp = $("#dd-n", root); inp.focus();
    const go = () => { close(); run(inp.value.trim()); };
    $("#dd-ok", root).onclick = go; $("#dd-x", root).onclick = close; inp.onkeydown = e => { if (e.key === "Enter") go(); };
  });
}

/* ---------- party add / edit ---------- */
function dpartyModal(p, after) {
  const isNew = !p.id, admin = S.me.role === "admin";
  const asmOpts = [...new Set([...DASM.filter(a => a.active).map(a => a.name), p.asm].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  modal(`<h2>${isNew ? "নতুন পার্টি" : "পার্টি এডিট"}</h2><div class="fgrid">
   <div class="s4"><label class="f">পার্টির নাম * <span class="mut">(নাম-এলাকা, যেমন: Alam Store-Nawabagonj, Dinajpur)</span></label><input class="in" id="dp-n" autocomplete="off" value="${esc(p.name || "")}"></div>
   <div class="s2"><label class="f">ASM / Salesman</label><select class="in" id="dp-a"><option value="">— বাছুন —</option>${asmOpts.map(a => `<option ${a === p.asm ? "selected" : ""}>${esc(a)}</option>`).join("")}<option value="__new">＋ নতুন ASM যোগ করুন…</option></select><input class="in hide" id="dp-an" autocomplete="off" placeholder="নতুন ASM-এর নাম" style="margin-top:6px"></div>
   <div class="s2"><label class="f">Contact Person</label><input class="in" id="dp-cp" autocomplete="off" value="${esc(p.contact_person || "")}"></div>
   <div class="s1"><label class="f">Contact No.</label><input class="in" id="dp-p" inputmode="tel" autocomplete="off" value="${esc(p.phone || "")}"></div>
   <div class="s3"><label class="f">Full Address</label><input class="in" id="dp-ad" autocomplete="off" value="${esc(p.address || "")}"></div>
   <div class="s2"><label class="f">জেলা <span class="mut">(নাম থেকে নিজে বসে)</span></label><input class="in" id="dp-d" list="dp-dl-d" autocomplete="off" value="${esc(p.district || "")}"></div>
   <div class="s2"><label class="f">বিভাগ <span class="mut">${bi("(জেলা থেকে নিজে বসে)", "(filled in from the district)")}</span></label><input class="in" id="dp-v" readonly tabindex="-1" value="${esc(p.district ? BD_DIV[p.district] || "" : "")}"></div>
   ${isNew ? "" : `<div class="s4"><label class="keep"><input type="checkbox" id="dp-act" ${p.active !== false ? "checked" : ""}> সক্রিয় পার্টি <span class="mut">(বন্ধ করলে নতুন এন্ট্রির সাজেশনে আসবে না; আগের রেকর্ড যেমন আছে থাকবে)</span></label></div>`}
  </div>${datalist("dp-dl-d", BD_DIST)}<div class="hint rd" id="dp-err"></div>
  <div class="row" style="margin-top:14px"><button class="btn pri" id="dp-ok">${ico("save")} সেভ</button><button class="btn" id="dp-x">বন্ধ</button>${!isNew && admin ? `<button class="btn dg" id="dp-del" style="margin-left:auto">${ico("trash")} মুছুন</button>` : ""}</div>`, (root, close) => {
    const err = m => $("#dp-err", root).textContent = m || ""; $("#dp-n", root).focus();
    $("#dp-x", root).onclick = close;
    const dI = $("#dp-d", root), vI = $("#dp-v", root), aS = $("#dp-a", root), aN = $("#dp-an", root);
    const syncV = () => { const d = BD_DIST.find(x => x.toLowerCase() === dI.value.trim().toLowerCase()); if (d) dI.value = d; vI.value = BD_DIV[dI.value] || ""; };
    dI.oninput = syncV; dI.onchange = syncV;
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
   <div class="card dcx-bar"><div class="dcx-date">${dateNav("dc", date)}</div><div class="dcx-stats" id="dc-kpi"></div></div>
   <div class="dcx-split">
   <div class="card dcx-entry"><div class="dcx-et"><h3>${ico("plus")} নতুন এন্ট্রি</h3><span class="mut xs">${bi("শুধু Enter চাপুন: পার্টি → Account → টাকা → যোগ হবে · টাকার ঘরে <b>50000+300</b> লেখা যায়", "Just press Enter: Party → Account → Amount → Add · you can type <b>50000+300</b> in the amount box")}</span></div>
    <div class="dcx-grid">
     <div class="dcx-p"><label class="f">পার্টি *</label><div><input class="in big" id="dc-pty" autocomplete="off" placeholder="পার্টির নাম লিখুন…"></div><div class="dcx-h" id="dc-ph"></div></div>
     <div class="dcx-a"><label class="f">ASM / Salesman</label><input class="in" id="dc-a" list="dc-dl-a" autocomplete="off" placeholder="অটো বসবে"></div>
     <div class="dcx-c"><label class="f">Account *</label><div><input class="in" id="dc-c" autocomplete="off" placeholder="Account খুঁজুন — DBBL-17"></div></div>
     <div class="dcx-m"><label class="f">টাকা *</label><input class="in big num" id="dc-m" inputmode="decimal" autocomplete="off" placeholder="0"><div class="dcx-h num" id="dc-mh"></div></div>
     <div class="dcx-r"><label class="f">মন্তব্য <span class="mut">(ঐচ্ছিক)</span></label><input class="in big" id="dc-r" autocomplete="off" placeholder="স্লিপ নং / নোট"></div>
     <div class="dcx-b"><button class="btn pri big" id="dc-add">${ico("plus")} যোগ করুন</button></div>
    </div><div class="hint rd" id="dc-err" style="min-height:0;margin-top:8px"></div><datalist id="dc-dl-a"></datalist></div>
   <div class="card flush dcx-list"><div class="ch"><h3>এই তারিখের কালেকশন</h3><span class="tag" id="dc-cnt">0</span></div>
    <div class="noprint dcx-tools"><div class="chips dcx-tabs" id="dc-sc"></div>${searchBox("dc-q", "খুঁজুন — পার্টি, ASM, Account, টাকা…")}</div>
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
  function createParty(name) { dpartyModal({ name, asm: aIn.value, account: cIn.value }, saved => { if (!saved) return; parties = DPARTY; picker.set({ value: saved.name, label: saved.asm || "", sub: saved.account || "" }); fill(saved); mIn.focus(); }); }
  async function add() {
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
      const acts = [["approved", "check", "gr", "Approve (ঠিক আছে)"], ["cancelled", "xmark", "rd", "Cancel"]].filter(([s]) => dcCan(r, s)).map(([s, ic, c, t]) => `<button class="iconbtn sm dca ${c}" data-st="${s}" data-id="${r.id}" title="${t}">${ico(ic)}</button>`).join("") + (r.status !== "pending" && dcCan(r, "pending") ? `<button class="btn sm" data-st="pending" data-id="${r.id}" title="Pending-এ ফেরত">↺</button>` : "");
      return `<tr class="dcr ${r.status}"><td>${dcCan(r, "approved") || dcCan(r, "cancelled") ? `<input type="checkbox" data-sel="${r.id}" ${sel.has(r.id) ? "checked" : ""}>` : ""}</td><td class="r mut">${i + 1}</td><td><b>${esc(r.party)}</b><div class="mut xs">${esc([r.asm || "—", dpGeoOf(gm, r).district].filter(Boolean).join(" · "))}</div></td><td class="b"><i class="bdot" style="background:${dcBrand(r.account)}"></i>${esc(r.account || "—")}</td><td class="r num b">${money0(r.amount)}</td><td>${dcStTag(r)}${r.decided_by ? `<div class="mut xs">${esc(r.decided_by)}${r.decision_note ? " · " + esc(r.decision_note) : ""}</div>` : ""}</td><td class="sm">${esc(r.remarks)}</td><td class="r noprint"><div class="dcacts">${acts}${dcCanEdit(r) ? `<button class="iconbtn sm" data-ed="${r.id}" title="এডিট">${ico("edit")}</button>` : ""}${S.me.role === "admin" && !r.pending_sync ? `<button class="iconbtn sm rd" data-dl="${r.id}" title="মুছুন">${ico("trash")}</button>` : ""}</div></td></tr>`;
    }).join("")}<tr class="tot"><td></td><td></td><td colspan="2">${bi("মোট (" + vis.filter(r => r.status !== "cancelled").length + "টি, Cancelled বাদে)", "Total (" + vis.filter(r => r.status !== "cancelled").length + " entries, excl. Cancelled)")}</td><td class="r num">${money0(dcSum(vis.filter(r => r.status !== "cancelled")))}</td><td colspan="3"></td></tr></tbody></table></div>` : `<div class="dcx-empty"><span class="ei">${ico("wallet")}</span><b>${rows.length ? "খোঁজার সাথে কিছু মেলেনি" : "এই তারিখে এখনো কোনো এন্ট্রি নেই"}</b><span class="mut">${rows.length ? "ফিল্টার বা সার্চ বদলে দেখুন" : "উপরের ফর্ম থেকে প্রথম কালেকশনটি যোগ করুন"}</span>${rows.length ? `<button class="btn sm" id="dc-clr">ফিল্টার মুছুন</button>` : ""}</div>`;
    labelTables(list); const cl = $("#dc-clr", list); if (cl) cl.onclick = () => { F.st = ""; F.ac = ""; F.q = ""; $("#dc-q", v).value = ""; draw(); };
    $$("[data-sel]", list).forEach(x => x.onchange = () => { x.checked ? sel.add(x.dataset.sel) : sel.delete(x.dataset.sel); selbar(); });
    const all = $("#dc-all", list); if (all) all.onchange = () => { actionable.forEach(r => all.checked ? sel.add(r.id) : sel.delete(r.id)); $$("[data-sel]", list).forEach(x => x.checked = all.checked); selbar(); };
    $$("[data-st]", list).forEach(b => b.onclick = () => dcDecide([b.dataset.id], b.dataset.st, load));
    $$("[data-ed]", list).forEach(b => b.onclick = () => dcEditModal(rows.find(r => r.id === b.dataset.ed), load));
    $$("[data-dl]", list).forEach(b => b.onclick = async () => { const r = rows.find(x => x.id === b.dataset.dl); if (!ask(bi(`"${r.party}" — ৳ ${money0(r.amount)} মুছে ফেলবেন?`, `Delete "${r.party}" — ৳ ${money0(r.amount)}?`))) return; try { await API.dcolDelete(r.id); DCACHE.dcol = null; toast("✔ মুছে ফেলা হয়েছে"); load(); } catch (e) { toast(dcErr(e), "err"); } });
    selbar(); qa();
  }
  $("#dc-q", v).oninput = e => { F.q = e.target.value; draw(); };
  bindDateNav(v, "dc", load);
  window.__dcolRefresh = () => { if (CUR === "dcol" && !busy) load(); };
  await load(); if (innerWidth > 800) pIn.focus();
  return () => { window.__dcolRefresh = null; };
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
const dcHead = (title, f, t, org = "NABIAD GROUP") => { const one = f === t, d = new Date(f + "T00:00:00"); return `<div class="rep-hd"><div class="lg"><img src="icon-192.png" alt=""></div><div class="tt"><b>${org}</b><span>${title}</span></div><div class="dt"><b>${esc(dcRangeLabel(f, t))}</b><span>${one ? d.toLocaleDateString("en-GB", { weekday: "long" }) : ""}</span></div></div>`; };
const dcFoot = (extra = "") => `<div class="rep-ft"><span>Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${extra} · by ${esc(S.me.name)}</span><span>NABIAD Cheque &amp; Bank Control</span></div>`;

/* ---------- A4 standard sheet helpers (shared by every report) ---------- */
/* print any A4 sheet html directly (used where the page itself is not a sheet) */
function printSheet(html, name) {
  const w = document.createElement("div"); w.className = "rep-wrap printonly"; w.innerHTML = `<div class="rep-scroll">${html}</div>`;
  document.body.appendChild(w); document.body.classList.add("print-sheet"); const t = document.title; document.title = name;
  const done = () => { window.removeEventListener("afterprint", done); w.remove(); document.body.classList.remove("print-sheet"); document.title = t; };
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
  const F = { ...pbInit("day"), s: "approved", all: false }; let cur = null;
  v.innerHTML = head("কালেকশন সামারি", `<button class="btn" id="ds-png">${ico("img")} স্ক্রিনশট</button><button class="btn" id="ds-pdf">${ico("print")} PDF</button>${navigator.share ? `<button class="btn" id="ds-sh">${ico("share")} শেয়ার</button>` : ""}`) + `
   <div class="card noprint dcx-filt">${dcPeriodBar("ds", F)}<div class="dcx-frow"><div class="dcx-fs"><label class="f">কোন Status ধরব</label><select class="in" id="ds-s">${dcStatOpts(F.s)}</select></div><label class="keep dcx-keep"><input type="checkbox" id="ds-z"> ০ টাকার Account/ASM-ও দেখাও</label><span class="dcx-per mut" id="ds-per"></span></div></div>
   <div class="card rep-wrap"><div class="rep-scroll"><div id="ds-out"></div></div></div>`;
  async function draw() {
    const [f, t] = dcRange(F), out = $("#ds-out", v); out.innerHTML = `<div class="skel" style="height:160px"></div>`; let all;
    try { await dpLoad().catch(() => { }); all = await API.dcolRange(f, t); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(dcErr(e))}</div>`; cur = null; return; }
    const rows = all.filter(r => dcStatPass(r, F.s)), tot = dcSum(rows);
    let banks = dcGroup(rows, r => r.account || "(No account)"), asms = dcGroup(rows, r => r.asm || "(No ASM)");
    if (F.all) { dcAccounts().forEach(a => { if (!banks.some(x => x.k === a)) banks.push({ k: a, n: 0, amt: 0 }); }); dcAsms().forEach(a => { if (!asms.some(x => x.k === a)) asms.push({ k: a, n: 0, amt: 0 }); }); }
    const days = t > f ? dcGroup(rows, r => r.date).sort((a, b) => a.k.localeCompare(b.k)) : [];
    const mx = a => Math.max(1, ...a.map(x => x.amt)), others = all.filter(r => !dcStatPass(r, F.s) && r.status !== "cancelled");
    const gm = dpGeoMap(), divs = dcGroup(rows, r => dpGeoOf(gm, r).division || "(No Division)"), dists = dcGroup(rows, r => dpGeoOf(gm, r).district || "(No District)").slice(0, 25);
    const tbl = (title, arr, nm) => `<div class="dcs-box"><div class="dcs-t">${title}</div><table class="rep-t"><thead><tr><th>${nm}</th><th class="r">Entry</th><th class="r">Amount</th></tr></thead><tbody>${arr.map(x => `<tr><td class="${nm === "Bank / Account" ? "cd" : "ho"}">${nm === "Bank / Account" ? `<i class="bdot" style="background:${dcBrand(x.k)}"></i>` : ""}${esc(x.k)}</td><td class="r num ${x.n ? "" : "z"}">${x.n || "—"}</td><td class="r num ${x.amt ? "us" : "z"}">${x.amt ? money0(x.amt) : "0"}</td></tr>`).join("") || `<tr><td colspan="3" class="z" style="text-align:center">কিছু নেই</td></tr>`}<tr class="tot"><td>TOTAL</td><td class="r num">${arr.reduce((s, x) => s + x.n, 0)}</td><td class="r num">${money0(arr.reduce((s, x) => s + x.amt, 0))}</td></tr></tbody></table></div>`;
    cur = { f, t, rows, tot, banks, asms };
    out.innerHTML = rows.length || F.all ? `<div class="rep" id="ds-in">${dcHead("Distribution Collection Summary · কালেকশন সামারি", f, t, "NABIAD DISTRIBUTION")}
      <div class="rep-kpi"><div class="k1"><span>Total ${esc(dcStatLabel(F.s).split(" ")[0])}</span><b>৳ ${money0(tot)}</b></div><div><span>Entries</span><b>${rows.length}</b></div><div><span>Parties</span><b>${new Set(rows.map(r => r.party)).size}</b></div><div class="k3"><span>Accounts · ASM</span><b>${banks.filter(b => b.amt).length} · ${asms.filter(b => b.amt).length}</b></div></div>
      <div class="dcs-two">${tbl("Per Bank", banks, "Bank / Account")}${tbl("Per Salesman / ASM", asms, "Salesman / ASM")}</div>
      <div class="dcs-two">${tbl("Per Division", divs, "Division")}${tbl(`Per District${dists.length >= 25 ? " (Top 25)" : ""}`, dists, "District")}</div>
      ${days.length ? `<div class="dcs-box" style="margin:0 16px 12px"><div class="dcs-t">Per Day</div><table class="rep-t"><thead><tr><th>Date</th><th class="r">Entry</th><th class="r">Amount</th><th style="width:50%"></th></tr></thead><tbody>${days.map(x => `<tr><td class="cd">${dcShort(x.k)}</td><td class="r num">${x.n}</td><td class="r num us">${money0(x.amt)}</td><td><div class="dcbar"><i style="width:${(x.amt / mx(days) * 100).toFixed(1)}%"></i></div></td></tr>`).join("")}</tbody></table></div>` : ""}
      ${others.length ? `<div class="dcs-note">Note: এই তারিখে আরও ${others.length}টি এন্ট্রি (৳ ${money0(dcSum(others))}) অন্য Status-এ আছে — এখানে ধরা হয়নি।</div>` : ""}${dcFoot()}</div>` : dcEmptyPeriod(`এই সময়ে ${esc(dcStatLabel(F.s))} কোনো কালেকশন নেই`);
    $$("[data-qp]", out).forEach(b => b.onclick = () => $(`#ds [data-m="${b.dataset.qp}"]`, v).click());
    const pe = $("#ds-per", v); if (pe) pe.textContent = dcRangeLabel(f, t);
    dcFit(v, "ds-in");
  }
  dcBindPeriod(v, "ds", F, draw);
  $("#ds-s", v).onchange = e => { F.s = e.target.value; draw(); }; $("#ds-z", v).onchange = e => { F.all = e.target.checked; draw(); };
  const nm = () => `Collection_Summary_${cur ? cur.f + (cur.t !== cur.f ? "_" + cur.t : "") : today()}`;
  $("#ds-png", v).onclick = () => dcPng($("#ds-in", v), nm()); $("#ds-pdf", v).onclick = () => dcPdf($("#ds-in", v), nm());
  $("#ds-sh", v) && ($("#ds-sh", v).onclick = () => dcShare($("#ds-in", v), nm(), cur ? `Collection ${dcRangeLabel(cur.f, cur.t)} — Total ৳ ${money0(cur.tot)}` : ""));
  const onRs = () => dcFit(v, "ds-in"); window.addEventListener("resize", onRs);
  await draw(); return () => window.removeEventListener("resize", onRs);
}

/* =================== Collection Report (screenshot / Excel) =================== */
async function vDrep(v) {
  const F = { ...pbInit("day"), s: "approved", asm: "", ac: "", dv: "", ds: "", q: "", ca: false, cd: false, cs: false, sub: true }; let cur = null, all = [];
  v.innerHTML = head("কালেকশন রিপোর্ট", `<button class="btn" id="dr-png">${ico("img")} স্ক্রিনশট</button><button class="btn" id="dr-pdf">${ico("print")} PDF</button><button class="btn" id="dr-xl">${ico("dl")} Excel</button>${navigator.share ? `<button class="btn" id="dr-sh">${ico("share")} শেয়ার</button>` : ""}`) + `
   <div class="card noprint dcx-filt">${dcPeriodBar("dr", F)}
    <div class="dcx-fgrid"><div><label class="f">Status</label><select class="in" id="dr-s">${dcStatOpts(F.s)}</select></div><div><label class="f">ASM</label><select class="in" id="dr-asm"><option value="">সব ASM</option></select></div><div><label class="f">Account</label><select class="in" id="dr-ac"><option value="">সব Account</option></select></div><div><label class="f">বিভাগ</label><select class="in" id="dr-dv"><option value="">সব বিভাগ</option></select></div><div><label class="f">জেলা</label><select class="in" id="dr-ds"><option value="">সব জেলা</option></select></div><div class="dcx-q"><label class="f">পার্টি খুঁজুন</label><input class="in" id="dr-q" type="search" autocomplete="off" placeholder="পার্টির নাম / টাকা / মন্তব্য"></div></div>
    <div class="dcx-tg"><span class="mut xs">রিপোর্টে দেখাও:</span><label class="keep"><input type="checkbox" id="dr-ca"> ASM কলাম</label><label class="keep"><input type="checkbox" id="dr-cd"> জেলা কলাম</label><label class="keep"><input type="checkbox" id="dr-cs"> Status কলাম</label><label class="keep"><input type="checkbox" id="dr-sub" checked> দিন অনুযায়ী সাবটোটাল</label></div></div>
   <div class="card rep-wrap"><div class="rep-scroll"><div id="dr-out"></div></div></div>`;
  async function load() {
    const [f, t] = dcRange(F), out = $("#dr-out", v); out.innerHTML = `<div class="skel" style="height:160px"></div>`;
    try { await dpLoad().catch(() => { }); all = await API.dcolRange(f, t); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(dcErr(e))}</div>`; cur = null; return; }
    const asmSel = $("#dr-asm", v), acSel = $("#dr-ac", v), a0 = asmSel.value, c0 = acSel.value;
    asmSel.innerHTML = `<option value="">সব ASM</option>` + [...new Set(all.map(r => r.asm).filter(Boolean))].sort().map(a => `<option ${a === a0 ? "selected" : ""}>${esc(a)}</option>`).join("");
    acSel.innerHTML = `<option value="">সব Account</option>` + [...new Set(all.map(r => r.account).filter(Boolean))].sort().map(a => `<option ${a === c0 ? "selected" : ""}>${esc(a)}</option>`).join("");
    F.asm = asmSel.value; F.ac = acSel.value; geoSel(); draw();
  }
  function geoSel() {
    const gm = dpGeoMap(), dvS = $("#dr-dv", v), dsS = $("#dr-ds", v), g = all.map(r => dpGeoOf(gm, r));
    dvS.innerHTML = `<option value="">সব বিভাগ</option>` + [...new Set(g.map(x => x.division).filter(Boolean))].sort().map(a => `<option ${a === F.dv ? "selected" : ""}>${esc(a)}</option>`).join("");
    const ds = [...new Set(g.filter(x => x.district && (!dvS.value || x.division === dvS.value)).map(x => x.district))].sort();
    dsS.innerHTML = `<option value="">সব জেলা</option>` + ds.map(a => `<option ${a === F.ds ? "selected" : ""}>${esc(a)}</option>`).join("");
    F.dv = dvS.value; F.ds = dsS.value;
  }
  function draw() {
    const [f, t] = dcRange(F), out = $("#dr-out", v), q = norm(F.q);
    const gm = dpGeoMap(), gOf = r => dpGeoOf(gm, r);
    const rows = all.filter(r => dcStatPass(r, F.s) && (!F.asm || r.asm === F.asm) && (!F.ac || r.account === F.ac) && (!F.dv || gOf(r).division === F.dv) && (!F.ds || gOf(r).district === F.ds) && (!q || norm([r.party, r.amount, r.remarks, r.account].join(" ")).includes(q)));
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
  v.innerHTML = head("ডিস্ট্রিবিউশন পার্টি", `<button class="btn" id="dp-asm">${ico("users")} ASM তালিকা</button><button class="btn" id="dp-geo">${ico("map")} এলাকা অনুযায়ী</button><button class="btn" id="dp-xl">${ico("dl")} Excel</button>${canAdd ? `<button class="btn pri" id="dp-new">${ico("plus")} নতুন পার্টি</button>` : ""}`) + `<div id="dp-kpi"></div>
   <div class="card noprint" style="margin:14px 0"><div class="row"><div style="flex:2 1 240px"><label class="f">খুঁজুন</label><input class="in" id="dp-q" type="search" autocomplete="off" placeholder="পার্টি, ASM, জেলা, ফোন, ঠিকানা…"></div><div><label class="f">ASM</label><select class="in" id="dp-fa"></select></div><div><label class="f">বিভাগ</label><select class="in" id="dp-fv"></select></div><div><label class="f">জেলা</label><select class="in" id="dp-fd"></select></div><div><label class="f">অবস্থা</label><select class="in" id="dp-fs"><option value="1">সক্রিয়</option><option value="0">নিষ্ক্রিয়</option><option value="">সব</option></select></div></div></div>
   <div class="card flush"><div class="ch"><h3>পার্টি তালিকা</h3><span class="tag" id="dp-cnt">0</span></div><div id="dp-out"></div></div>`;
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
    $("#dp-kpi", v).innerHTML = `<div class="grid g4"><div class="kpi card k-vi"><div class="l">মোট পার্টি<span class="ki">${ico("users")}</span></div><div class="v num">${list.length}</div><div class="s">সক্রিয় ${list.filter(p => p.active).length}</div></div><div class="kpi card k-gr"><div class="l">ASM / Salesman<span class="ki">${ico("users")}</span></div><div class="v num">${dcAsms().length}</div><div class="s">জন</div></div><div class="kpi card k-am"><div class="l">ASM ঠিক করা নেই<span class="ki">${ico("flag")}</span></div><div class="v num">${list.filter(p => !p.asm).length}</div><div class="s">পার্টি</div></div><div class="kpi card"><div class="l">জেলা ঠিক করা নেই<span class="ki">${ico("flag")}</span></div><div class="v num">${list.filter(p => !p.district).length}</div><div class="s">পার্টি · ${new Set(list.map(p => p.district).filter(Boolean)).size}টি জেলায় বাকিরা</div></div></div>`;
    $("#dp-cnt", v).textContent = vis.length;
    out.innerHTML = vis.length ? `<div class="tw cards"><table><thead><tr><th class="r">#</th><th>পার্টি</th><th>ASM / Salesman</th><th>জেলা</th><th>বিভাগ</th><th>অবস্থা</th><th class="r noprint"></th></tr></thead><tbody>${vis.slice(0, F.lim).map((p, i) => `<tr class="${p.active ? "" : "dim"}"><td class="r mut">${i + 1}</td><td><b>${esc(p.name)}</b>${[p.contact_person, p.phone].filter(Boolean).length ? `<div class="mut xs">${esc([p.contact_person, p.phone].filter(Boolean).join(" · "))}</div>` : ""}${p.address ? `<div class="mut xs">${esc(p.address)}</div>` : ""}</td><td>${esc(p.asm) || '<span class="am">—</span>'}</td><td>${p.district ? esc(p.district) : '<span class="am">—</span>'}</td><td>${p.division ? esc(p.division) : '<span class="am">—</span>'}</td><td>${p.active ? '<span class="dst approved">সক্রিয়</span>' : '<span class="dst cancelled">নিষ্ক্রিয়</span>'}</td><td class="r noprint"><button class="iconbtn sm" data-lg="${p.id}" title="${bi("খাতা", "Ledger")}">${ico("ledger")}</button>${admin ? `<button class="iconbtn sm" data-ed="${p.id}" title="এডিট">${ico("edit")}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>${vis.length > F.lim ? `<div style="padding:12px;text-align:center"><button class="btn" id="dp-more">আরও ${Math.min(200, vis.length - F.lim)}টি দেখান (মোট ${vis.length})</button></div>` : ""}` : `<div class="empty">কোনো পার্টি পাওয়া যায়নি</div>`;
    labelTables(out);
    $$("[data-ed]", out).forEach(b => b.onclick = () => dpartyModal(list.find(p => p.id === b.dataset.ed), () => { filters(); draw(); }));
    $$("[data-lg]", out).forEach(b => b.onclick = () => partyLedgerModal(list.find(p => p.id === b.dataset.lg)));
    const mb = $("#dp-more", out); if (mb) mb.onclick = () => { F.lim += 200; draw(); };
  }
  filters(); draw();
  $("#dp-q", v).oninput = e => { F.q = e.target.value; F.lim = 200; draw(); };
  $("#dp-fa", v).onchange = e => { F.asm = e.target.value; F.lim = 200; draw(); }; $("#dp-fv", v).onchange = e => { F.dv = e.target.value; F.ds = ""; F.lim = 200; filters(); draw(); }; $("#dp-fd", v).onchange = e => { F.ds = e.target.value; F.lim = 200; draw(); }; $("#dp-fs", v).onchange = e => { F.act = e.target.value; F.lim = 200; draw(); };
  const nw = $("#dp-new", v); if (nw) nw.onclick = () => dpartyModal({}, () => { filters(); draw(); });
  $("#dp-xl", v).onclick = () => exportXlsx({ Parties: [["Party", "ASM / Salesman", "Contact Person", "Contact No.", "Full Address", "District", "Division", "Active"], ...list.map(p => [p.name, p.asm, p.contact_person, p.phone, p.address, p.district, p.division, p.active ? "Yes" : "No"])] }, `Distribution_Parties_${today()}.xlsx`);
  $("#dp-geo", v).onclick = () => {
    const dv = dcGroup(list, p => p.division || "(বিভাগ নেই)").map(x => ({ ...x, ds: dcGroup(list.filter(p => (p.division || "(বিভাগ নেই)") === x.k), p => p.district || "—") }));
    modal(`<h2>এলাকা অনুযায়ী পার্টি</h2><div class="tw"><table><thead><tr><th>বিভাগ / জেলা</th><th class="r">পার্টি</th></tr></thead><tbody>${dv.map(x => `<tr class="dsub"><td><b>${esc(x.k)}</b></td><td class="r num"><b>${x.n}</b></td></tr>` + x.ds.map(d => `<tr><td style="padding-left:22px">${esc(d.k)}</td><td class="r num">${d.n}</td></tr>`).join("")).join("")}</tbody></table></div><div class="row" style="margin-top:14px"><button class="btn" id="gx-x">বন্ধ</button></div>`, (root, close) => { $("#gx-x", root).onclick = close; });
  };
  $("#dp-asm", v).onclick = function openAsm() {
    const canAdd = S.me.role !== "boss";
    const names = new Map(); DASM.forEach(a => names.set(a.name, { ...a, n: 0 })); list.forEach(p => { if (!p.asm) return; const o = names.get(p.asm) || { id: null, name: p.asm, active: true, n: 0 }; o.n++; names.set(p.asm, o); });
    const rows = [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
    modal(`<h2>ASM / Salesman তালিকা</h2><div class="mut sm" style="margin-bottom:8px">${admin ? bi("নাম বদলালে ওই ASM-এর সব পার্টির ASM বদলে যাবে (আগের কালেকশন রেকর্ড আগের নামেই থাকবে)। যে ASM-এর পার্টি বা রেকর্ড আছে তাকে মুছা যায় না — নিষ্ক্রিয় করুন।", "Renaming changes the ASM of all that ASM's parties (earlier collection records keep the old name). An ASM with parties or records cannot be deleted — mark it Inactive.") : ""}</div>${canAdd ? `<button class="btn pri sm" id="am-add" style="margin-bottom:10px">${ico("plus")} নতুন ASM</button>` : ""}<div class="tw"><table><thead><tr><th>ASM</th><th class="r">পার্টি</th><th>অবস্থা</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.active ? "" : "dim"}"><td>${esc(r.name)}</td><td class="r num">${r.n}</td><td>${r.active ? '<span class="dst approved">সক্রিয়</span>' : '<span class="dst cancelled">নিষ্ক্রিয়</span>'}</td>${admin ? `<td class="r"><div class="dcacts"><button class="btn sm" data-rn="${i}">নাম বদলান</button>${r.id ? `<button class="btn sm" data-ac="${i}">${r.active ? "নিষ্ক্রিয়" : "সক্রিয়"}</button><button class="iconbtn sm rd" data-dl="${i}" title="মুছুন">${ico("trash")}</button>` : ""}</div></td>` : ""}</tr>`).join("") || `<tr><td colspan="4" class="mut" style="text-align:center">কোনো ASM নেই</td></tr>`}</tbody></table></div><div class="hint rd" id="am-e"></div><div class="row" style="margin-top:14px"><button class="btn" id="am-x">বন্ধ</button></div>`, (root, close) => {
      $("#am-x", root).onclick = close; const e = m => $("#am-e", root).textContent = m || "";
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

/* ---------- v6.45: Excel cheque import · party ledger · bank reconciliation ---------- */
const bi = (bn, en) => LANG === "en" ? en : bn;
const VAPID_PUB = "BAu_jln2X-7dGMt7X2w_GeqjYbgieXX1Db-4zBx5ff-U2e2y6951Gdov3pk8v9qTcJTZbybpi4Fi88ldkgGfAl0";
const b64u = s => { const p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
try { navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", e => { const g = e.data && e.data.go; if (g && /^#\//.test(g)) location.hash = g; }); } catch (e) { }
async function readSheetFile(file) { await loadScript("vendor/xlsx.min.js"); const wb = XLSX.read(await file.arrayBuffer(), { type: "array" }); const ws = wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }); }
function toIsoDate(v) {
  if (v === "" || v == null) return "";
  if (typeof v === "number") { if (v < 20000 || v > 80000) return ""; return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); }
  const s = String(v).trim(); let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/), y, mo, d;
  if (m) { y = m[1]; mo = +m[2]; d = +m[3]; } else if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) { d = +m[1]; mo = +m[2]; y = m[3].length === 2 ? "20" + m[3] : m[3]; } else return "";
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return ""; return `${y}-${pad(mo)}-${pad(d)}`;
}
const colOf = (head, names) => { const hs = head.map(h => norm(h)); for (const n of names) { const i = hs.indexOf(norm(n)); if (i >= 0) return i; } return -1; };
const findAcc = v => { const k = norm(v); if (!k) return null; return S.accounts.find(a => norm(a.code) === k) || S.accounts.find(a => a.acno && norm(a.acno) === k) || null; };
const findPurpose = v => { const k = String(v || "").split(" (")[0].trim().toLowerCase(); if (!k) return null; return allPurposes(true).find(p => p.split(" (")[0].trim().toLowerCase() === k) || null; };

function chequeImportModal(after) {
  const CH = ["Date", "A/C Code", "Cheque No", "Amount", "Purpose", "Cash Taker", "To A/C", "Remarks"];
  let rows = [];
  modal(`<h2>📥 ${bi("Excel থেকে চেক ইম্পোর্ট", "Import cheques from Excel")}</h2>
    <div class="mut sm" style="margin-bottom:10px">${bi("একসাথে অনেক চেক পোস্ট করুন। আগে টেমপ্লেট নামিয়ে পূরণ করুন, তারপর ফাইল বাছুন। শুধু সঠিক সারি ইম্পোর্ট হয়; ভুল সারির কারণ দেখানো হয়।", "Post many cheques at once. Download the template, fill it, then choose the file. Only valid rows are imported; problems are listed per row.")}</div>
    <div class="row"><button class="btn" id="ci-t">${ico("dl")} ${bi("টেমপ্লেট", "Template")}</button><label class="btn pri" for="ci-f">${ico("plus")} ${bi("ফাইল বাছুন", "Choose file")}</label><input type="file" id="ci-f" accept=".xlsx,.xls,.csv" hidden></div>
    <div id="ci-out" style="margin-top:12px"></div>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn pri hide" id="ci-go">${ico("save")} <span id="ci-gl"></span></button><button class="btn" id="ci-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    $("#ci-x", root).onclick = close;
    $("#ci-t", root).onclick = () => exportXlsx({ Cheques: [CH, [today(), (S.accounts[0] || {}).code || "PBL-483", 1234567, 50000, "Supplier Payment", "", "", "bill 101"], [today(), (S.accounts[0] || {}).code || "PBL-483", 1234568, 0, "Cancelled/Spoiled", "", "", ""]], Notes: [["Purpose must match one of the purposes in the app (see Manage on Cheque Posting). Date: dd-mm-yyyy or yyyy-mm-dd. Cash Taker / To A/C only for cash withdrawal / own transfer rows."]] }, "Cheque_Import_Template.xlsx");
    $("#ci-f", root).onchange = async e => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return; const out = $("#ci-out", root); out.innerHTML = `<div class="mut">${bi("পড়া হচ্ছে…", "Reading…")}</div>`;
      let aoa; try { aoa = await readSheetFile(f); } catch (er) { return out.innerHTML = `<div class="alert rd">${esc(er.message || er)}</div>`; }
      const hi = aoa.findIndex(r => r.some(c => norm(c) === "chequeno" || norm(c) === "chqno")); if (hi < 0) return out.innerHTML = `<div class="alert rd">${bi("হেডার সারি পাওয়া যায়নি — টেমপ্লেটের কলাম নাম ব্যবহার করুন (Date, A/C Code, Cheque No, Amount, Purpose…)", "Header row not found — use the template column names")}</div>`;
      const H = aoa[hi], c = { d: colOf(H, ["Date", "Cheque Date", "তারিখ"]), a: colOf(H, ["A/C Code", "AC Code", "Code", "Account"]), n: colOf(H, ["Cheque No", "Chq No", "Cheque Number"]), m: colOf(H, ["Amount", "Taka", "টাকা"]), p: colOf(H, ["Purpose", "খাত"]), t: colOf(H, ["Cash Taker", "Taker"]), o: colOf(H, ["To A/C", "To AC"]), r: colOf(H, ["Remarks", "Note", "মন্তব্য"]) };
      if (c.a < 0 || c.n < 0 || c.m < 0 || c.p < 0 || c.d < 0) return out.innerHTML = `<div class="alert rd">${bi("Date, A/C Code, Cheque No, Amount, Purpose কলাম লাগবে", "Columns Date, A/C Code, Cheque No, Amount, Purpose are required")}</div>`;
      const seen = new Set(); rows = [];
      aoa.slice(hi + 1).forEach((r, i) => {
        if (r.every(x => x === "")) return; const line = hi + i + 2, errs = [];
        const date = toIsoDate(r[c.d]); if (!date) errs.push(bi("তারিখ ঠিক নয়", "bad date"));
        const acc = findAcc(r[c.a]); if (!acc) errs.push(bi("A/C Code নেই", "unknown A/C"));
        const noS = String(r[c.n]).replace(/\D/g, ""), no = parseInt(noS); if (!no || String(r[c.n]).trim() !== String(no) && !/^\d+(\.0+)?$/.test(String(r[c.n]).trim())) errs.push(bi("চেক নং ঠিক নয়", "bad cheque no"));
        const amount = num(r[c.m]); const purpose = findPurpose(r[c.p]); if (!purpose) errs.push(bi("খাত মেলেনি", "purpose not found")); const k = purpose ? purposeKey(purpose) : "";
        if (purpose && k !== "cancel" && !(amount > 0)) errs.push(bi("টাকা দিন", "amount required")); if (amount < 0) errs.push(bi("টাকা ঋণাত্মক", "negative amount"));
        const taker = c.t >= 0 ? String(r[c.t]).trim() : "", toac = c.o >= 0 ? String(r[c.o]).trim() : "", rem = c.r >= 0 ? String(r[c.r]).trim() : "";
        let toAcc = null; if (k === "own") { toAcc = findAcc(toac); if (!toAcc) errs.push(bi("To A/C দিন (নিজ অ্যাকাউন্ট)", "To A/C required")); else if (acc && toAcc.code === acc.code) errs.push(bi("From ও To একই", "From = To")); }
        if (acc && no) { const key = acc.code + "|" + no; if (S.cheques.some(x => x.code === acc.code && x.no === no)) errs.push(bi("আগেই এন্ট্রি আছে", "already exists")); else if (seen.has(key)) errs.push(bi("ফাইলে দুইবার", "duplicate in file")); seen.add(key); }
        rows.push({ line, date, code: acc && acc.code, no, amount: k === "cancel" ? 0 : amount, purpose, taker: k === "cash" ? taker : "", toac: k === "own" && toAcc ? toAcc.code : "", remarks: rem, errs });
      });
      const ok = rows.filter(x => !x.errs.length), bad = rows.length - ok.length;
      out.innerHTML = `<div class="row" style="gap:8px"><span class="tag ok">✓ ${ok.length} ${bi("ঠিক", "valid")}</span><span class="tag ${bad ? "au-delete" : ""}">${bad ? "✗ " + bad : "—"} ${bi("সমস্যা", "problems")}</span>${bad ? `<button class="btn sm" id="ci-eb">${ico("dl")} ${bi("ভুল সারি Excel", "Problem rows")}</button>` : ""}</div>
        <div class="tw" style="max-height:300px;overflow:auto;margin-top:8px"><table><thead><tr><th>#</th><th>${bi("তারিখ", "Date")}</th><th>A/C</th><th>${bi("চেক নং", "Chq no")}</th><th class="r">${bi("টাকা", "Amount")}</th><th>${bi("খাত", "Purpose")}</th><th></th></tr></thead><tbody>${rows.slice(0, 300).map(x => `<tr class="${x.errs.length ? "dim" : ""}"><td class="mut">${x.line}</td><td>${x.date ? dmy(x.date) : "—"}</td><td>${esc(x.code || "—")}</td><td>${x.no || "—"}</td><td class="r num">${money(x.amount)}</td><td>${esc((x.purpose || "—").split(" (")[0])}</td><td>${x.errs.length ? `<span class="rd xs">${esc(x.errs.join(", "))}</span>` : `<span class="gr">✓</span>`}</td></tr>`).join("")}</tbody></table></div>${rows.length > 300 ? `<div class="mut xs">${bi("প্রথম ৩০০টি দেখানো হয়েছে", "First 300 shown")}</div>` : ""}`;
      const go = $("#ci-go", root); go.classList.toggle("hide", !ok.length); $("#ci-gl", root).textContent = bi(`${ok.length}টি ইম্পোর্ট করুন`, `Import ${ok.length}`);
      if ($("#ci-eb", root)) $("#ci-eb", root).onclick = () => exportXlsx({ Problems: [["Line", ...CH, "Problem"], ...rows.filter(x => x.errs.length).map(x => [x.line, x.date, x.code, x.no, x.amount, x.purpose, x.taker, x.toac, x.remarks, x.errs.join("; ")])] }, "Cheque_Import_Problems.xlsx");
      go.onclick = async () => {
        if (!ask(bi(`${ok.length}টি চেক পোস্ট করবেন?`, `Post ${ok.length} cheques?`))) return; go.disabled = true; let n = 0, fail = 0;
        for (const x of ok) { try { const row = await API.addCheque({ id: crypto.randomUUID(), date: x.date, code: x.code, no: x.no, amount: x.amount, purpose: x.purpose, taker: x.taker, party: "", toac: x.toac, remarks: x.remarks }); S.cheques.push(derive(row)); n++; } catch (er) { fail++; x.errs.push(er.message || "error"); } $("#ci-gl", root).textContent = `${n + fail}/${ok.length}…`; }
        saveCache(); toast(bi(`✔ ${n}টি চেক পোস্ট হয়েছে${fail ? `, ${fail}টি হয়নি` : ""}`, `✔ ${n} cheques posted${fail ? `, ${fail} failed` : ""}`), fail ? "err" : "ok"); close(); after && after();
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
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="pl-xl">${ico("dl")} Excel</button><button class="btn" id="pl-pr">${ico("print")} ${bi("প্রিন্ট A4", "Print A4")}</button><button class="btn pri" id="pl-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
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

/* ----- bank reconciliation page ----- */
async function vRecon(v) {
  const st = { tab: "bal", aoa: null, name: "" };
  const draw = () => {
    v.innerHTML = head(bi("ব্যাংক মিলান", "Bank reconciliation")) + `<div class="seg noprint" style="margin:6px 0 14px"><span class="chip ${st.tab === "bal" ? "on" : ""}" data-tab="bal">${bi("ব্যালেন্স মিলান", "Balances")}</span><span class="chip ${st.tab === "chq" ? "on" : ""}" data-tab="chq">${bi("চেক পাস মিলান", "Cleared cheques")}</span></div><div id="rc-body"></div>`;
    $$("[data-tab]", v).forEach(c => c.onclick = () => { st.tab = c.dataset.tab; st.aoa = null; draw(); });
    (st.tab === "bal" ? reconBal : reconChq)($("#rc-body", v));
  };
  const pickFile = (box, hint, cb) => {
    box.innerHTML = `<div class="card"><div class="mut sm" style="margin-bottom:10px">${hint}</div><div class="row"><label class="btn pri" for="rc-f">${ico("plus")} ${bi("স্টেটমেন্ট ফাইল (Excel/CSV)", "Statement file (Excel/CSV)")}</label><input type="file" id="rc-f" accept=".xlsx,.xls,.csv" hidden></div><div id="rc-map" style="margin-top:12px"></div><div id="rc-res" style="margin-top:12px"></div></div>`;
    $("#rc-f", box).onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { st.aoa = (await readSheetFile(f)).filter(r => r.some(c => c !== "")); st.name = f.name; } catch (er) { return toast(er.message || String(er), "err"); } cb(box); };
  };
  const colSel = (id, head, guess) => `<select class="in" id="${id}"><option value="-1">—</option>${head.map((h, i) => `<option value="${i}" ${i === guess ? "selected" : ""}>${esc(String(h).slice(0, 30) || "col " + (i + 1))}</option>`).join("")}</select>`;
  function reconBal(box) {
    pickFile(box, bi("ব্যাংক স্টেটমেন্ট/ক্লোজিং তালিকা দিন — প্রতি সারিতে তারিখ ও ব্যালেন্স (সাথে A/C কোড, অথবা একটি অ্যাকাউন্টের স্টেটমেন্ট হলে নিচে অ্যাকাউন্ট বাছুন)। অ্যাপের ক্লোজিং ব্যালেন্সের সাথে মেলানো হবে।", "Upload a statement / closing list — a date and balance per row (plus A/C code, or choose one account below for a single-account statement). Compared with the app's closing balances."), b => {
      const A = st.aoa, hi = Math.max(0, A.findIndex(r => r.filter(c => c !== "").length >= 2)), H = A[hi].map(String), g = names => colOf(H, names);
      $("#rc-map", b).innerHTML = `<div class="row"><div><label class="f">${bi("তারিখ কলাম", "Date column")}</label>${colSel("rm-d", H, g(["Date", "Txn Date", "Value Date", "তারিখ"]))}</div><div><label class="f">${bi("ব্যালেন্স কলাম", "Balance column")}</label>${colSel("rm-b", H, g(["Balance", "Closing Balance", "Running Balance", "Total", "ব্যালেন্স"]))}</div><div><label class="f">${bi("A/C কোড কলাম (ঐচ্ছিক)", "A/C column (optional)")}</label>${colSel("rm-a", H, g(["A/C Code", "Code", "Account", "AC", "A/C No"]))}</div><div><label class="f">${bi("অথবা একটাই অ্যাকাউন্ট", "Or single account")}</label><select class="in" id="rm-s"><option value="">—</option>${S.accounts.map(a => `<option>${esc(a.code)}</option>`).join("")}</select></div></div><div class="row" style="margin-top:10px"><button class="btn pri" id="rm-go">${bi("মিলান", "Reconcile")}</button><span class="mut xs">${esc(st.name)} · ${A.length - hi - 1} ${bi("সারি", "rows")}</span></div>`;
      $("#rm-go", b).onclick = async () => {
        const ci = { d: +$("#rm-d", b).value, b: +$("#rm-b", b).value, a: +$("#rm-a", b).value }, single = $("#rm-s", b).value;
        if (ci.d < 0 || ci.b < 0 || (ci.a < 0 && !single)) return toast(bi("তারিখ, ব্যালেন্স ও (A/C কলাম বা অ্যাকাউন্ট) দিন", "Choose date, balance and (A/C column or account)"), "err");
        const items = []; A.slice(hi + 1).forEach(r => { const d = toIsoDate(r[ci.d]), bal = typeof r[ci.b] === "number" ? r[ci.b] : num(r[ci.b]), acc = single ? findAcc(single) : findAcc(r[ci.a]); if (d && acc && r[ci.b] !== "") items.push({ d, code: acc.code, bal, raw: single ? "" : String(r[ci.a]) }); });
        if (!items.length) return $("#rc-res", b).innerHTML = `<div class="alert rd">${bi("মেলানোর মতো সারি পাওয়া যায়নি (তারিখ/অ্যাকাউন্ট চেনা যায়নি)", "No usable rows (dates / accounts not recognised)")}</div>`;
        const desc = items.length > 1 && items[0].d > items[items.length - 1].d, last = new Map(); (desc ? [...items].reverse() : items).forEach(x => last.set(x.d + "|" + x.code, x));   // keep the day's closing balance of a running-balance statement
        const list = [...last.values()], from = list.reduce((m, x) => x.d < m ? x.d : m, "9999"), to = list.reduce((m, x) => x.d > m ? x.d : m, "0000");
        let app = []; try { app = await API.balancesRange(from, to); } catch (e) { return toast(e.message, "err"); }
        const am = new Map(app.map(x => [x.date + "|" + x.code, x])); const res = list.map(x => { const a = am.get(x.d + "|" + x.code), has = a && a.total != null; const diff = has ? x.bal - a.total : null; return { ...x, app: has ? a.total : null, diff, s: !has ? "miss" : Math.abs(diff) <= 1 ? "ok" : "diff" }; }).sort((a, b) => a.d.localeCompare(b.d) || a.code.localeCompare(b.code));
        const n = k => res.filter(x => x.s === k).length;
        $("#rc-res", b).innerHTML = `<div class="row" style="gap:8px"><span class="tag ok">✓ ${n("ok")} ${bi("মিলেছে", "match")}</span><span class="tag ${n("diff") ? "au-delete" : ""}">≠ ${n("diff")} ${bi("গরমিল", "differ")}</span><span class="tag">∅ ${n("miss")} ${bi("অ্যাপে নেই", "not in app")}</span><button class="btn sm" id="rr-xl">${ico("dl")} Excel</button></div>
          <div class="tw" style="max-height:52vh;overflow:auto;margin-top:8px"><table><thead><tr><th>${bi("তারিখ", "Date")}</th><th>A/C</th><th class="r">${bi("স্টেটমেন্ট", "Statement")}</th><th class="r">${bi("অ্যাপ", "App")}</th><th class="r">${bi("পার্থক্য", "Diff")}</th><th></th></tr></thead><tbody>${res.slice(0, 500).map(x => `<tr class="${x.s === "ok" ? "" : x.s === "diff" ? "" : "dim"}"><td>${dmy(x.d)}</td><td>${esc(x.code)}</td><td class="r num">${money(x.bal)}</td><td class="r num">${x.app == null ? "—" : money(x.app)}</td><td class="r num ${x.s === "diff" ? "rd" : ""}">${x.diff == null ? "—" : money(x.diff)}</td><td>${x.s === "ok" ? '<span class="gr">✓</span>' : x.s === "diff" ? '<span class="rd">≠</span>' : '<span class="am">∅</span>'}</td></tr>`).join("")}</tbody></table></div>`;
        $("#rr-xl", b).onclick = () => exportXlsx({ Reconcile: [["Date", "A/C", "Statement", "App", "Diff", "Result"], ...res.map(x => [dmy(x.d), x.code, x.bal, x.app, x.diff, x.s])] }, `Balance_Reconcile_${today()}.xlsx`);
      };
    });
  }
  function reconChq(box) {
    pickFile(box, bi("ব্যাংকে পাস হওয়া চেকের তালিকা দিন (চেক নং ও টাকা; তারিখ/A/C কোড থাকলে আরও নির্ভুল)। অ্যাপের চেক রেজিস্টারের সাথে মিলিয়ে দেখাবে — কোনটা অ্যাপে নেই, কোনটা পাস হয়নি, টাকা ভিন্ন।", "Upload the bank's cleared-cheque list (cheque no. and amount; date / A/C code make it more exact). Compared with the cheque register: not in app, not marked cleared, amount differs."), b => {
      const A = st.aoa, hi = Math.max(0, A.findIndex(r => r.filter(c => c !== "").length >= 2)), H = A[hi].map(String), g = names => colOf(H, names);
      $("#rc-map", b).innerHTML = `<div class="row"><div><label class="f">${bi("চেক নং কলাম", "Cheque no column")}</label>${colSel("rc-n", H, g(["Cheque No", "Chq No", "Cheque Number", "Instrument No", "Chq"]))}</div><div><label class="f">${bi("টাকা কলাম", "Amount column")}</label>${colSel("rc-m", H, g(["Amount", "Debit", "Withdrawal", "Taka"]))}</div><div><label class="f">${bi("A/C কোড কলাম (ঐচ্ছিক)", "A/C column (optional)")}</label>${colSel("rc-a", H, g(["A/C Code", "Code", "Account", "AC"]))}</div><div><label class="f">${bi("অথবা একটাই অ্যাকাউন্ট", "Or single account")}</label><select class="in" id="rc-s"><option value="">—</option>${S.accounts.map(a => `<option>${esc(a.code)}</option>`).join("")}</select></div></div><div class="row" style="margin-top:10px"><button class="btn pri" id="rc-go">${bi("মিলান", "Reconcile")}</button><span class="mut xs">${esc(st.name)} · ${A.length - hi - 1} ${bi("সারি", "rows")}</span></div>`;
      $("#rc-go", b).onclick = () => {
        const ci = { n: +$("#rc-n", b).value, m: +$("#rc-m", b).value, a: +$("#rc-a", b).value }, single = $("#rc-s", b).value;
        if (ci.n < 0) return toast(bi("চেক নং কলাম দিন", "Choose the cheque-no column"), "err");
        const res = []; A.slice(hi + 1).forEach(r => { const no = parseInt(String(r[ci.n]).replace(/\D/g, "")); if (!no) return; const amt = ci.m >= 0 ? (typeof r[ci.m] === "number" ? r[ci.m] : num(r[ci.m])) : null, code = single ? (findAcc(single) || {}).code : ci.a >= 0 ? (findAcc(r[ci.a]) || {}).code : null;
          const cands = S.cheques.filter(c => c.no === no && (!code || c.code === code)); let s, c = null; if (!cands.length) s = "miss"; else if (cands.length > 1 && !code) { c = cands[0]; s = "multi"; } else { c = cands[0]; s = c.status !== "Cleared" ? "notclr" : (amt != null && amt > 0 && Math.abs(c.amount - amt) > 1) ? "amt" : "ok"; }
          res.push({ no, amt, c, s }); });
        const L = { ok: bi("✓ মিলেছে", "✓ OK"), miss: bi("অ্যাপে নেই", "not in app"), notclr: bi("অ্যাপে পাস হয়নি", "not cleared in app"), amt: bi("টাকা ভিন্ন", "amount differs"), multi: bi("একাধিক A/C-তে আছে", "in several A/Cs") }, n = k => res.filter(x => x.s === k).length;
        const bankNos = new Set(res.map(x => x.no)), code = single ? (findAcc(single) || {}).code : null; const unseen = S.cheques.filter(c => c.status === "Cleared" && purposeKey(c.purpose) !== "cash" && purposeKey(c.purpose) !== "own" && (!code || c.code === code) && !bankNos.has(c.no));
        $("#rc-res", b).innerHTML = `<div class="row" style="gap:8px;flex-wrap:wrap"><span class="tag ok">✓ ${n("ok")}</span><span class="tag ${n("miss") ? "au-delete" : ""}">${bi("অ্যাপে নেই", "not in app")} ${n("miss")}</span><span class="tag ${n("notclr") ? "au-update" : ""}">${bi("পাস হয়নি", "not cleared")} ${n("notclr")}</span><span class="tag ${n("amt") ? "au-delete" : ""}">${bi("টাকা ভিন্ন", "amount")} ${n("amt")}</span><button class="btn sm" id="rc-xl">${ico("dl")} Excel</button></div>
          <div class="tw" style="max-height:48vh;overflow:auto;margin-top:8px"><table><thead><tr><th>${bi("চেক নং", "Chq no")}</th><th>A/C</th><th class="r">${bi("ব্যাংক", "Bank")}</th><th class="r">${bi("অ্যাপ", "App")}</th><th>${bi("ফলাফল", "Result")}</th></tr></thead><tbody>${res.slice(0, 500).map(x => `<tr class="${x.s === "ok" ? "" : ""}"><td>${x.no}</td><td>${esc(x.c ? x.c.code : "—")}</td><td class="r num">${x.amt == null ? "—" : money(x.amt)}</td><td class="r num">${x.c ? money(x.c.amount) : "—"}</td><td class="${x.s === "ok" ? "gr" : "rd"}">${L[x.s]}${x.s === "notclr" ? ` (${esc(x.c.status)})` : ""}</td></tr>`).join("")}</tbody></table></div>
          ${unseen.length ? `<div class="mut sm" style="margin-top:10px">${bi(`অ্যাপে Cleared কিন্তু এই স্টেটমেন্টে নেই: ${unseen.length}টি (সব সময়ের মধ্যে — স্টেটমেন্টের সময়সীমার বাইরেরগুলোও থাকতে পারে)`, `Cleared in app but not in this statement: ${unseen.length} (may include cheques outside the statement period)`)}</div>` : ""}`;
        $("#rc-xl", b).onclick = () => exportXlsx({ Cheques: [["Cheque No", "A/C", "Bank amount", "App amount", "Result"], ...res.map(x => [x.no, x.c && x.c.code, x.amt, x.c && x.c.amount, L[x.s]])], "Cleared in app, not in statement": [["A/C", "Cheque No", "Amount", "Date"], ...unseen.map(c => [c.code, c.no, c.amount, dmy(c.date)])] }, `Cheque_Reconcile_${today()}.xlsx`);
      };
    });
  }
  draw();
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
      <div class="row" style="margin-top:12px;flex-wrap:nowrap"><button class="btn pri" id="mf-ok" style="flex:1">${en ? "Verify" : "ভেরিফাই"}</button><button class="btn" id="mf-out">${en ? "Sign out" : "লগআউট"}</button></div></div></div>`;
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
    <div class="row" style="margin-top:12px"><button class="btn pri" id="mf-ok">${ico("save")} ${en ? "Verify & turn on" : "ভেরিফাই করে চালু"}</button><button class="btn" id="mf-x">${en ? "Cancel" : "বাতিল"}</button></div>`, (root, close) => {
    const cancel = async () => { if (!fin) { try { await sb.auth.mfa.unenroll({ factorId: d.id }); } catch { } } close(); };
    $("#mf-x", root).onclick = cancel; $(".mback", root).onmousedown = e => { if (e.target.classList.contains("mback")) cancel(); };
    const go = async () => { const code = $("#mf-c", root).value.replace(/\D/g, ""); if (code.length !== 6) return $("#mf-e", root).textContent = en ? "Enter the 6-digit code" : "৬ অঙ্কের কোড দিন"; const b = $("#mf-ok", root); b.disabled = true;
      try { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: d.id, code }); if (error) throw error; fin = true; close(); toast(en ? "✔ 2FA is on" : "✔ 2FA চালু হয়েছে"); done && done(); } catch (e) { $("#mf-e", root).textContent = en ? "Wrong code — check your phone's clock and try again" : "কোড ভুল — ফোনের সময় ঠিক আছে কি না দেখে আবার দিন"; b.disabled = false; } };
    $("#mf-ok", root).onclick = go; $("#mf-c", root).onkeydown = e => { if (e.key === "Enter") go(); };
  });
}
const uaName = ua => { ua = ua || ""; const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser"; const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : ""; return b + (o ? " · " + o : ""); };
async function userSecModal(u, after) {
  const en = LANG === "en", me = u.id === S.me.id;
  modal(`<h2>🛡 ${en ? "Security" : "সিকিউরিটি"} — ${esc(u.name || u.email)}</h2><div class="card empty">${en ? "Loading…" : "লোড হচ্ছে…"}</div>`);
  let ss = [], act = [], sec = null;
  try { [ss, act, sec] = await Promise.all([API.userSessions(u.id), API.userActivity(u.id), API.userSec().then(a => a.find(x => x.user_id === u.id) || null)]); } catch (e) { return modal(`<h2>🛡</h2><div class="alert rd">${esc(userErr(e).message)}</div><div class="row" style="margin-top:12px"><button class="btn" id="sx">${en ? "Close" : "বন্ধ"}</button></div>`, (r, c) => $("#sx", r).onclick = c); }
  const again = () => { userSecModal(u, after); after && after(); };
  modal(`<h2>🛡 ${en ? "Security" : "সিকিউরিটি"}</h2>
    <div class="uh2">${avaEl(u.id, u.name, u.email)}<div><b>${esc(u.name || "—")}</b><div class="mut xs">${esc(u.email)}</div></div></div>
    <h3 class="sch">📱 ${en ? "Signed-in devices" : "লগইন করা ডিভাইস"} (${ss.length})</h3>
    ${ss.length ? ss.map(x => `<div class="scrow"><div style="flex:1;min-width:0"><b>${esc(uaName(x.user_agent))}</b>${x.mine ? ` <span class="tag ok">${en ? "this device" : "এই ডিভাইস"}</span>` : ""}<div class="mut xs">${esc(x.ip || "")} · ${en ? "last seen" : "শেষ ব্যবহার"} ${relTime(x.last_seen)}</div></div><button class="btn sm ghost" data-rs="${x.id}" title="${en ? "Sign this device out" : "এই ডিভাইস লগআউট"}">${en ? "Sign out" : "লগআউট"}</button></div>`).join("") : `<div class="mut sm">${en ? "No active sessions" : "কোনো সক্রিয় সেশন নেই"}</div>`}
    ${ss.length ? `<div class="mut xs" style="margin:6px 0">${en ? "Signing out takes effect immediately — the next request from that device is refused." : "লগআউট সাথে সাথে কার্যকর — ওই ডিভাইসের পরের রিকোয়েস্টই বন্ধ হয়ে যায়।"}</div><button class="btn sm bad" id="rs-all">${en ? "Sign out everywhere" : "সব ডিভাইস থেকে লগআউট"}</button>` : ""}
    <h3 class="sch">🔐 2FA</h3>
    <div class="scrow"><div style="flex:1"><b>${sec?.has_2fa ? (en ? "On" : "চালু") : (en ? "Off" : "বন্ধ")}</b><div class="mut xs">${en ? "Each user turns 2FA on from their own Settings. If they lose their phone, reset it here." : "প্রত্যেক ইউজার নিজের সেটিংস থেকে 2FA চালু করেন। ফোন হারালে এখান থেকে রিসেট করুন।"}</div></div>${sec?.has_2fa ? `<button class="btn sm bad" id="r2fa">${en ? "Reset 2FA" : "2FA রিসেট"}</button>` : ""}</div>
    <h3 class="sch">🕘 ${en ? "Recent activity" : "সাম্প্রতিক কাজ"}</h3>
    ${act.length ? `<div class="sc-act">${act.map(r => `<div class="scrow" style="padding:6px 0"><span class="tag au-${r.action}">${esc((AU_A[r.action] || [r.action])[0])}</span><div style="flex:1;min-width:0"><b class="xs">${esc(AU_T[r.tbl] || r.tbl)} · ${esc(r.row_key || "")}</b></div><span class="mut xs">${relTime(r.at)}</span></div>`).join("")}</div>` : `<div class="mut sm">${en ? "No recorded activity" : "কোনো কাজের রেকর্ড নেই"}</div>`}
    <div class="mut xs" style="margin-top:4px">${en ? "Last sign-in" : "শেষ লগইন"}: ${sec?.last_sign_in_at ? new Date(sec.last_sign_in_at).toLocaleString("en-GB") : "—"}</div>
    <h3 class="sch">✉️ ${en ? "Account" : "অ্যাকাউন্ট"}</h3>
    <label class="f">${en ? "Change email (login id)" : "ইমেইল বদল (লগইন আইডি)"}</label><div class="row" style="flex-wrap:nowrap"><input class="in" id="se-e" value="${esc(u.email)}" autocomplete="off"><button class="btn fix" id="se-ok">${en ? "Change" : "বদলান"}</button></div>
    <div class="mut xs">${en ? "The user is signed out everywhere and must sign in with the new email." : "ইউজার সব ডিভাইস থেকে লগআউট হবেন, নতুন ইমেইলে লগইন করতে হবে।"}</div>
    <div class="scrow" style="margin-top:12px"><div style="flex:1"><b class="rd">${en ? "Delete user" : "ইউজার মুছুন"}</b><div class="mut xs">${me ? (en ? "You cannot delete yourself." : "নিজেকে মোছা যায় না।") : u.active ? (en ? "Deactivate the user first (Edit), then delete." : "আগে ইউজারকে নিষ্ক্রিয় করুন (এডিট), তারপর মুছুন।") : (en ? "Permanent. Old entries keep the user's name; the login is gone." : "স্থায়ী। পুরনো এন্ট্রিতে নাম থাকবে; লগইন থাকবে না।")}</div></div><button class="btn sm bad" id="su-del" ${me || u.active ? "disabled" : ""}>🗑 ${en ? "Delete" : "মুছুন"}</button></div>
    <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn pri" id="sc-x">${en ? "Close" : "বন্ধ"}</button></div>`, (root, close) => {
    $("#sc-x", root).onclick = close;
    $$("[data-rs]", root).forEach(b => b.onclick = async () => { try { await API.revokeSessions(u.id, b.dataset.rs); toast(en ? "✔ Signed out" : "✔ লগআউট করা হয়েছে"); again(); } catch (e) { toast(userErr(e).message, "err"); } });
    $("#rs-all", root) && ($("#rs-all", root).onclick = async () => { if (!ask(en ? `Sign ${u.name || u.email} out of every device?${me ? "\nThis includes YOUR current device." : ""}` : `${u.name || u.email}-কে সব ডিভাইস থেকে লগআউট করবেন?${me ? "\nআপনার এই ডিভাইসও লগআউট হবে।" : ""}`)) return; try { await API.revokeSessions(u.id); toast(en ? "✔ Signed out everywhere" : "✔ সব ডিভাইস থেকে লগআউট"); if (me) return location.reload(); again(); } catch (e) { toast(userErr(e).message, "err"); } });
    $("#r2fa", root) && ($("#r2fa", root).onclick = async () => { if (!ask(en ? "Remove this user's 2FA? They will be signed out and can set it up again." : "এই ইউজারের 2FA সরিয়ে দেবেন? তিনি লগআউট হবেন এবং আবার সেটআপ করতে পারবেন।")) return; try { await API.reset2fa(u.id); toast(en ? "✔ 2FA reset" : "✔ 2FA রিসেট হয়েছে"); again(); } catch (e) { toast(userErr(e).message, "err"); } });
    $("#se-ok", root).onclick = async () => { const e = $("#se-e", root).value.trim().toLowerCase(); if (!e || e === u.email) return; if (!ask(en ? `Change login email to ${e}?` : `লগইন ইমেইল বদলে ${e} করবেন?`)) return; try { await API.setUserEmail(u.id, e); u.email = e; toast(en ? "✔ Email changed" : "✔ ইমেইল বদলেছে"); again(); } catch (er) { toast(userErr(er).message, "err"); } };
    $("#su-del", root).onclick = async () => { if (!ask(en ? `PERMANENTLY delete ${u.name || u.email}? This cannot be undone.` : `${u.name || u.email}-কে স্থায়ীভাবে মুছে ফেলবেন? এটা ফেরানো যাবে না।`)) return; try { await API.deleteUser(u.id); close(); toast(en ? "✔ User deleted" : "✔ ইউজার মোছা হয়েছে"); after && after(); } catch (er) { toast(userErr(er).message, "err"); } };
  });
}

/* ---------- boot ---------- */
let inited = false;
function onLangChange() { if (S.me && $("#view")) { shell(); route(); } else if (!S.me) loginView(); }
async function boot() {
  try {
    if (!inited) { startI18n(); await API.init(); inited = true; }
    if (!S.me) S.me = await API.session();
    if (!S.me) return loginView();
    if (!DEMO && navigator.onLine) { try { if (await API.mfaNeeded()) await mfaGate(); } catch (e) { console.warn("mfa", e); } }
    lockInit();
    loadAvatars();
    let mo = null;
    const start = () => { if (!location.hash && PREFS.start && PREFS.start !== "dash" && allowed().includes(PREFS.start)) location.replace("#/" + PREFS.start); shell(); route(); setTimeout(remTick, 1500); if (!mo) { let q = 0; mo = new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; labelTables(document); }); }); mo.observe(document.body, { childList: true, subtree: true }); } };
    if (loadCache()) { start(); reload().then(() => { refreshBadges(); const k = (location.hash.match(/^#\/(\w+)/) || [])[1] || "dash"; if (["dash", "cheques", "books", "accounts"].includes(k) && !document.querySelector(".mback,.pal") && !document.activeElement?.matches("input,select,textarea")) route(); }).catch(e => { if (!isNetErr(e)) toast(bi("রিফ্রেশ ব্যর্থ: ", "Refresh failed: ") + (e.message || e), "err"); }); Outbox.flush(); }
    else { $("#app").innerHTML = `<div class="boot"><div><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div class="mut">ডাটা লোড হচ্ছে…</div></div></div>`; await reload(); start(); Outbox.flush(); }
  } catch (e) { console.error(e); $("#app").innerHTML = `<div class="login"><div class="card"><div class="alert rd">${bi("শুরু করা যায়নি: ", "Could not start: ")}${esc(e.message || e)}</div><p class="mut sm">${bi("config.js এ Supabase URL ও key ঠিক আছে কি না এবং schema.sql চালানো হয়েছে কি না দেখুন।", "Check that the Supabase URL and key in config.js are correct and that schema.sql has been run.")}</p></div></div>`; }
}
window.addEventListener("hashchange", route);
boot();
