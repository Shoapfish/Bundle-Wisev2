const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const CUR = "₱"; // change to "$", "€", etc.
const fmt = n => CUR + Number(n || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
const LOW = 5; // "low stock" at or below this
let installEvt = null; // the browser's "install app" prompt, when it offers one
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
window.addEventListener("appinstalled", () => { installEvt = null; document.querySelectorAll(".getapp").forEach(x => x.remove()); flash("Bundle Wise is installed on your phone."); });
async function installApp(){
  if (installEvt){ installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  alert(ios ? "To install on your iPhone or iPad:\n1. Tap the Share button in Safari.\n2. Tap \"Add to Home Screen\".\n3. Tap Add."
            : "To install on your phone:\n1. Open this site in Chrome.\n2. Tap the menu (three dots).\n3. Tap \"Install app\" or \"Add to Home screen\".");
}
const SEED = [
  {id:1,name:"Notebook",price:45,stock:30,em:"📓"},{id:2,name:"Ballpen set",price:60,stock:25,em:"🖊️"},
  {id:3,name:"Backpack",price:850,stock:8,em:"🎒"},{id:4,name:"Water bottle",price:220,stock:12,em:"🧴"},
  {id:5,name:"Lunch box",price:180,stock:10,em:"🍱"},{id:6,name:"Calculator",price:320,stock:6,em:"🧮"}
];
const ICON = {
  grid:'<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  list:'<path d="M2 4h12M2 8h12M2 12h8"/>',
  cart:'<path d="M3 3h10l-1.5 7H4.5L3 3z"/><circle cx="6" cy="13" r="1"/><circle cx="11" cy="13" r="1"/>',
  info:'<circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5h.01"/>',
  users:'<circle cx="6" cy="5" r="2.5"/><path d="M1.5 13.5c0-2.6 2-4 4.5-4s4.5 1.4 4.5 4"/><circle cx="11.5" cy="5.5" r="1.8"/><path d="M12 9.3c1.8.2 2.8 1.4 2.8 3.4"/>',
  trophy:'<path d="M5 2h6v4a3 3 0 01-6 0V2zM5 3.5H2.5V4A2.5 2.5 0 005 6.5M11 3.5h2.5V4A2.5 2.5 0 0111 6.5M8 9v3M5 14h6"/>',
  chart:'<path d="M2 2v12h12M5 11V8M8 11V5M11 11V7"/>',
  tag:'<path d="M2 2h6l6 6-6 6-6-6V2z"/><circle cx="5.2" cy="5.2" r="1"/>',
  chat:'<path d="M2 3h12v8H7l-3 3v-3H2V3z"/>'
};
const MENU = {
  admin: [["dashboard","Dashboard","grid"],["products","Products","list"],["categories","Categories","tag"],["bundles","Bundles","grid"],["orders","Orders","cart"],["analytics","Analytics","chart"],["chat","Chat","chat"],["about","About us","info"]],
  customer: [["order","Order","cart"],["my-orders","My Orders","list"],["about","About us","info"]]
};

let C = null;
try { C = await import("./cloud.js"); } catch (e) { C = null; }

// ---------- state ----------
let user = null, role = null, profile = null;
let products = [], discount = {type:"percent", value:0}, about = {}, orders = [];
let cart = {}, bundleName = "", note = "";
let bundles = [], activeDisc = null, bform = null, cartBundles = {}; // saved bundles, discount of the chosen bundle, admin bundle form
const MODE = document.body.dataset.mode === "admin" ? "admin" : "customer"; // which page this is: index.html or admin.html
let subs = [], dirty = false, regMode = false, authNote = "";
let categories = [], catFilter = "all"; // product categories (admin manages them, customers browse them)
let customers = [], chats = [], selChat = null, selMsgs = [], threadUnsub = null; // admin: customer accounts, chat threads, open thread
let chatMsgs = [], myChat = null, chatOpen = false; // customer: own chat messages and thread info
let aRange = 30; // analytics date range: 7, 30 or 365 (see RANGES). The revenue chart follows it.

const flash = t => { const el = $("toast"); el.textContent = t; el.classList.add("on"); setTimeout(() => el.classList.remove("on"), 2800); };
const show = w => { $("boot").hidden = true; $("auth").hidden = w !== "auth"; $("app").hidden = w !== "app"; };
const ts = o => o.createdAt?.toMillis?.() ?? Date.now();
const when = o => { const ms = o.createdAt?.toMillis?.(); return ms ? new Date(ms).toLocaleString([], {dateStyle:"medium", timeStyle:"short"}) : "Just now"; };
const sortedOrders = () => [...orders].sort((a, b) => ts(b) - ts(a));

function totals(){
  let sub = 0, count = 0;
  for (const p of products){ const q = cart[p.id] || 0; sub += q * p.price; count += q; }
  const d = curDisc(), v = Math.max(0, d.value || 0);
  let disc = d.type === "percent" ? sub * Math.min(v, 100) / 100 : Math.min(v, sub);
  for (const [id, q] of Object.entries(cartBundles)){ const b = bundles.find(x => x.id === id); if (!b) continue; const c = bundleCalc(b);
    sub += c.sub * q; disc += c.disc * q; count += c.items.reduce((n, x) => n + x.qty, 0) * q; }
  return {sub, count, disc, final: sub - disc};
}
const need = id => { let n = cart[id] || 0; for (const [bid, q] of Object.entries(cartBundles)){ const it = bundles.find(x => x.id === bid)?.items?.find(i => i.id == id); if (it) n += it.qty * q; } return n; };
const needed = () => products.filter(p => need(p.id) > 0);
const hasLoose = () => products.some(p => cart[p.id] > 0), hasBundles = () => Object.keys(cartBundles).length > 0;
const discText = () => hasBundles() ? (hasLoose() ? "store + bundle promo" : "bundle promo") : discLabel();
const titleName = () => bundleName.trim() || (Object.keys(cartBundles).length === 1 && !hasLoose() ? (bundles.find(b => b.id === Object.keys(cartBundles)[0])?.name || "Bundle Deal") : "Bundle Deal");
// ---------- stock check (nothing is deducted here; stock only changes when an order is marked Ready) ----------
function stockCheck(){
  const lines = needed().map(p => {
    const q = need(p.id), left = p.stock - q;
    return {p, q, left, state: left < 0 ? "bad" : left <= LOW ? "low" : "ok"};
  });
  const bad = lines.filter(l => l.state === "bad"), low = lines.filter(l => l.state === "low");
  return {lines, bad, low, state: bad.length ? "bad" : low.length ? "low" : "ok", canFulfil: !bad.length};
}
const STOCK_MSG = {
  ok: ["Available", "Sufficient stock."],
  low: ["Low stock", "Only a few units remaining."],
  bad: ["Insufficient stock", "Selected quantity exceeds available stock."]
};
const lineMsg = l => l.state === "bad" ? `Only ${l.p.stock} in stock` : l.state === "low" ? `Only ${l.left} left after this` : "";

const curDisc = () => activeDisc || discount;
const discLabel = () => { const d = curDisc(); return d.type === "percent" ? d.value + "% off" : fmt(d.value) + " off"; };

// ---------- login / register ----------
function renderAuth(){
  const admin = MODE === "admin", login = admin || !regMode;
  $("auth").innerHTML = `<div class="authwrap"><div class="card auth">
    <div class="brandbig"><img src="images/logo.png" alt="Bundle Wise" class="logobig"></div>
    ${admin ? '<h2 style="text-align:center">Admin login</h2>' : ""}
    ${login ? `<div class="stack">
      <div><label for="lemail">Email</label><input id="lemail" type="email" autocomplete="username"></div>
      <div><label for="lpw">Password</label><input id="lpw" type="password" autocomplete="current-password"></div>
      <button class="primary" style="width:100%" data-act="login">${admin ? "Log in as admin" : "Log in"}</button></div>
      ${admin ? "" : '<div class="center"><a href="#" data-act="toreg">Create a customer account</a></div>'}`
    : `<div class="stack">
      <div><label for="rname">Full name</label><input id="rname" autocomplete="name"></div>
      <div><label for="rcontact">Contact number (optional)</label><input id="rcontact" type="tel"></div>
      <div><label for="remail">Email</label><input id="remail" type="email" autocomplete="username"></div>
      <div><label for="rpw">Password (6 or more characters)</label><input id="rpw" type="password" autocomplete="new-password"></div>
      <div><label for="rpw2">Confirm password</label><input id="rpw2" type="password" autocomplete="new-password"></div>
      <button class="primary" style="width:100%" data-act="register">Create account</button></div>
      <div class="center"><a href="#" data-act="tolog">Back to log in</a></div>`}
    <div class="msg" id="authmsg" role="alert">${esc(authNote)}</div>
    ${admin ? "" : '<div class="center"><button class="getapp" data-act="install">Install app on your phone</button></div>'}
  </div></div>`;
  authNote = "";
}
const authMsg = t => { const el = $("authmsg"); if (el) el.textContent = t; };

async function doLogin(){
  const email = $("lemail").value.trim(), pw = $("lpw").value;
  authMsg("");
  try {
    await C.logIn(email, pw);
  } catch (e) { authMsg("Wrong email or password. Try again."); }
}
async function doRegister(){
  const name = $("rname").value.trim(), contact = $("rcontact").value.trim(), email = $("remail").value.trim(), pw = $("rpw").value, pw2 = $("rpw2").value;
  if (!name || !email || pw.length < 6){ authMsg("Enter your name, email and a password of 6 or more characters."); return; }
  if (pw !== pw2){ authMsg("Passwords do not match."); return; }
  try { profile = {name, contact}; await C.register(name, contact, email, pw); }
  catch (e) { profile = null; authMsg(e.code === "auth/email-already-in-use" ? "That email already has an account. Try logging in." : "Could not create the account. Check your details and try again."); }
}

// ---------- session ----------
async function handleUser(u){
  subs.forEach(f => f()); subs = []; threadUnsub?.(); threadUnsub = null; selChat = null; selMsgs = []; user = u;
  if (!u){ role = null; profile = null; products = []; orders = []; bundles = []; categories = []; catFilter = "all"; cart = {}; cartBundles = {}; activeDisc = null; customers = []; chats = []; seenPend = null; seenUnread = null; chatMsgs = []; myChat = null; chatOpen = false; $("cw")?.remove(); show("auth"); renderAuth(); return; }
  try { role = (await C.isAdmin(u.uid)) ? "admin" : "customer"; if (!profile) profile = await C.getProfile(u.uid); }
  catch (e) { role = "customer"; }
  if (role !== MODE){ // keep the two logins separate: admins only on admin.html, customers only on index.html
    authNote = MODE === "admin" ? "This account is not an admin account." : "Admin accounts must log in on the admin page.";
    await C.logOut(); return;
  }
  subs.push(
    C.watchProducts(l => { products = l; for (const id in cart){ const p = products.find(x => x.id == id); if (!p || p.stock <= 0) delete cart[id]; } refresh(); }),
    C.watchCategories(l => { categories = l.sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id)); refresh(); }),
    C.watchDiscount(d => { discount = d || {type:"percent", value:0}; refresh(); }),
    C.watchAbout(a => { about = a || {}; refresh(); }),
    C.watchBundles(l => { bundles = l.sort((a, b) => a.id.localeCompare(b.id)); for (const id in cartBundles) if (!bundles.find(b => b.id === id)) delete cartBundles[id]; refresh(); }),
    role === "admin" ? C.watchAllOrders(l => { orders = l; refresh(); }) : C.watchMyOrders(u.uid, l => { orders = l; refresh(); }),
    ...(role === "admin" ? [
      C.watchCustomers(l => { customers = l; refresh(); }),
      C.watchChats(l => { chats = l; if (selChat && !l.find(c => c.id === selChat)){ threadUnsub?.(); threadUnsub = null; selChat = null; selMsgs = []; if (current() === "chat"){ route(); return; } } if (selChat && current() === "chat" && chats.find(c => c.id === selChat)?.adminUnread > 0) C.markChatRead(selChat, "admin"); refresh(); })
    ] : [
      C.watchMessages(u.uid, l => { chatMsgs = l; renderCW(); }),
      C.watchChat(u.uid, c => { myChat = c; renderCW(); })
    ])
  );
  if (role === "customer") ensureCW();
  $("whoName").textContent = profile?.name || u.email;
  $("roleBadge").textContent = role === "admin" ? "ADMIN" : "CUSTOMER";
  show("app"); route();
}

// ---------- navigation ----------
const current = () => { const m = MENU[role].map(x => x[0]); const r = location.hash.slice(1); return m.includes(r) ? r : m[0]; };
let seenPend = null, seenUnread = null; // last counts, so a toast shows only when something NEW arrives
function nav(){
  const pend = role === "admin" ? orders.filter(o => o.status === "Pending").length : 0, cur = current();
  const unread = role === "admin" ? chats.reduce((n, c) => n + (c.adminUnread || 0), 0) : 0;
  if (role === "admin"){
    if (seenPend !== null && pend > seenPend) flash("New order received");
    if (seenUnread !== null && unread > seenUnread && cur !== "chat") flash("New message from a customer");
    seenPend = pend; seenUnread = unread;
    document.title = (pend + unread ? "(" + (pend + unread) + ") " : "") + "Bundle Wise Admin";
  }
  const link = ([id, label, ic]) => `<a href="#${id}" class="${cur===id?"on":""}"><svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${ICON[ic]}</svg>${label}${id==="orders" && pend ? `<span class="nb ping" title="${pend} new order(s)">${pend}</span>` : ""}${id==="chat" && unread ? `<span class="nb ping" title="${unread} unread message(s)">${unread}</span>` : ""}</a>`;
  const html = MENU[role].map(link).join("");
  $("side").innerHTML = html; $("bottom").innerHTML = html;
}
function route(){ if (!user) return; nav(); $("main").innerHTML = PAGES[current()](); if (current() === "chat" && $("amsgs")) $("amsgs").scrollTop = $("amsgs").scrollHeight; }
function refresh(){
  if (!user || !role) return;
  if (role === "admin" && current() === "chat" && $("chatlist")){ renderChatParts(); nav(); return; } // chat updates without redrawing the typing box
  const a = document.activeElement;
  if (a && $("main").contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)){ dirty = true; nav(); return; }
  route();
}
window.addEventListener("hashchange", route);
document.addEventListener("focusout", () => { if (dirty) setTimeout(() => { dirty = false; refresh(); }, 0); });

// ---------- pages ----------
const stat = (label, n) => `<div class="stat"><span class="muted">${label}</span><b>${n}</b></div>`;
const itemsText = o => [...(o.bundles || []).map(b => `${b.qty} × ${esc(b.name)}`), ...(o.items || []).filter(i => !i.bundle).map(i => `${i.qty} × ${esc(i.name)}`)].join(", ");
const orderLines = o => (o.bundles || []).map(b => `<li><span><b>${b.qty} × ${esc(b.name)}</b><br><small class="muted">Includes: ${(b.items || []).map(x => x.qty * b.qty + " " + esc(x.name)).join(", ")}</small></span><span>${fmt(b.price * b.qty)}</span></li>`).join("") + (o.items || []).filter(i => !i.bundle).map(i => `<li><span>${i.qty} × ${esc(i.name)}</span><span>${fmt(i.subtotal)}</span></li>`).join("");

function pgDashboard(){
  const low = products.filter(p => p.stock > 0 && p.stock <= LOW), out = products.filter(p => p.stock <= 0);
  const pend = orders.filter(o => o.status === "Pending").sort((a, b) => ts(b) - ts(a));
  return `<h1>Dashboard</h1>
  <div class="stats">${stat("Products", products.length)}${stat("Total stock", products.reduce((s, p) => s + p.stock, 0))}${stat("Low stock", low.length)}${stat("Out of stock", out.length)}${stat("New orders", pend.length)}</div>
  <section class="card"><div class="cardhead"><h2>New orders</h2><a class="btn" href="#orders">View orders</a></div>
    ${pend.length ? pend.slice(0, 5).map(o => `<div class="line"><span><b>${esc(o.customerName)}</b><br><span class="muted">${itemsText(o)}</span></span><b>${fmt(o.total)}</b></div>`).join("") : '<p class="muted">No new orders right now.</p>'}</section>
  <section class="card"><div class="cardhead"><h2>Needs restocking</h2><a class="btn" href="#products">Manage products</a></div>
    ${low.length + out.length ? [...out, ...low].map(p => `<div class="line"><span>${esc(p.name)}</span><span class="badge ${p.stock<=0?"out":"low"}">${p.stock<=0?"Out of stock":p.stock+" left"}</span></div>`).join("") : '<p class="muted">Everything is well stocked.</p>'}</section>`;
}

function orderCard(o, admin){
  return `<article class="card"><div class="cardhead"><div><b>${esc(o.customerName)}</b><div class="muted">${when(o)}</div></div><span class="st ${esc(o.status)}">${esc(o.status)}</span></div>
    <ul class="lines">${orderLines(o)}</ul>
    ${o.bundleName ? `<div class="muted">Bundle: ${esc(o.bundleName)}</div>` : ""}${o.note ? `<div class="muted">Note: ${esc(o.note)}</div>` : ""}
    ${o.discount > 0 ? `<div class="sum save"><span>Discount (${esc(o.discountLabel)})</span><span>-${fmt(o.discount)}</span></div>` : ""}
    <div class="sum"><b>Total</b><b>${fmt(o.total)}</b></div>
    ${o.status === "Cancelled" ? `<div class="cxnote">${o.cancelledBy === "customer" ? (admin ? "Cancelled by the customer" : "You cancelled this order") : "Cancelled by the store"}${o.cancelReason ? ` · Reason: ${esc(o.cancelReason)}` : ""}</div>` : ""}
    ${!admin && o.status === "Pending" ? `<div class="acts"><button class="danger" data-act="cancelorder" data-id="${o.id}">Cancel order</button></div>` : ""}
    ${!admin && (o.status === "Preparing" || o.status === "Ready") ? `<p class="muted" style="font-size:.85rem;margin:8px 0 0">This order is already being prepared, so it can't be cancelled here. <a href="#" data-act="chatopen">Message customer service</a></p>` : ""}
    ${admin ? `<div class="acts">${[["Preparing","Preparing"],["Ready","Ready"],["Completed","Complete"],["Cancelled","Cancel"]].map(([s, l]) => `<button data-act="status" data-id="${o.id}" data-s="${s}" ${o.status===s?"disabled":""}>${l}</button>`).join("")}<button class="danger" data-act="delorder" data-id="${o.id}">Delete</button></div>` : ""}</article>`;
}
const pgOrders = () => `<h1>Orders</h1>${orders.length ? sortedOrders().map(o => orderCard(o, true)).join("") : '<p class="muted">No orders yet. New pre-orders will show up here.</p>'}`;
const pgMyOrders = () => `<h1>My Orders</h1>${orders.length ? sortedOrders().map(o => orderCard(o, false)).join("") : '<div class="card"><p class="muted">You have no orders yet.</p><a class="btn primary" href="#order">Order now</a></div>'}`;

function pgAbout(){
  const f = [["owner","Owner"],["contact","Contact #"],["facebookAccount","Facebook account"],["facebookPage","Facebook page"],["address","Address"]];
  if (role !== "admin") return `<h1>About us</h1><section class="card about">${about.description ? `<p class="adesc">${esc(about.description)}</p>` : ""}<dl>${f.map(([k, l]) => `<dt>${l}</dt><dd>${esc(about[k]) || "—"}</dd>`).join("")}</dl></section>`;
  return `<h1>About us</h1><section class="card stack"><p class="muted">Customers see this page. Edit it here.</p>
    <div><label for="ab_description">Description (shown first)</label><textarea id="ab_description" rows="5" maxlength="1000" placeholder="Tell customers about your shop and what makes your bundles special.">${esc(about.description)}</textarea></div>
    ${f.map(([k, l]) => `<div><label for="ab_${k}">${l}</label><input id="ab_${k}" value="${esc(about[k])}"></div>`).join("")}
    <button class="primary" data-act="saveabout">Save</button></section>`;
}

function pgProducts(){
  const badge = s => s <= 0 ? '<div class="badge out">Out of stock</div>' : s <= LOW ? '<div class="badge low">Low stock</div>' : '<div class="badge"></div>';
  return `<h1>Products</h1>
  <section class="card"><h2>Bundle discount</h2>
    <div class="disc"><div><label for="dtype">Discount type</label><select id="dtype"><option value="percent" ${discount.type==="percent"?"selected":""}>Percent (%)</option><option value="fixed" ${discount.type==="fixed"?"selected":""}>Fixed amount</option></select></div>
    <div><label for="dval">Discount value</label><input id="dval" type="number" min="0" step="0.01" value="${discount.value}"></div>
    <button class="primary" data-act="savedisc">Save discount</button></div></section>
  <section class="card"><h2>Add a new item</h2>
    <div class="add"><div><label for="nn">Name</label><input id="nn" placeholder="e.g. Highlighter"></div><div><label for="np">Price</label><input id="np" type="number" min="0" step="0.01"></div>
    <div><label for="ns">Starting stock</label><input id="ns" type="number" min="0" step="1"></div><div><label for="nc">Category</label><select id="nc">${catOptions("")}</select></div><div><label for="nf">Photo (optional)</label><input id="nf" type="file" accept="image/*"></div>
    <button class="primary" data-act="addprod">Add item</button></div></section>
  <section class="card"><h2>Inventory</h2>
    ${products.length ? `<div class="row head"><span>Photo</span><span>Name</span><span>Price</span><span>Stock</span><span></span></div>` + products.map(p => `<div class="row">
      <div class="pic"><div class="thumb">${p.img ? `<img src="${esc(p.img)}" alt="">` : esc(p.em || "📦")}</div>
        <label>${p.img ? "Change photo" : "Add photo"}<input type="file" accept="image/*" data-pic="${p.id}" aria-label="Photo for ${esc(p.name)}"></label>${p.img ? `<button data-act="rmpic" data-id="${p.id}">Remove</button>` : ""}</div>
      <div><input data-f="name" data-id="${p.id}" value="${esc(p.name)}" aria-label="Name"><select data-f="cat" data-id="${p.id}" aria-label="Category of ${esc(p.name)}" style="margin-top:4px">${catOptions(p.cat || "")}</select></div>
      <input data-f="price" data-id="${p.id}" type="number" min="0" step="0.01" value="${p.price}" aria-label="Price of ${esc(p.name)}">
      <div><div class="stockcell"><input data-f="stock" data-id="${p.id}" type="number" min="0" step="1" value="${p.stock}" aria-label="Stock of ${esc(p.name)}"><button data-act="addstock" data-n="1" data-id="${p.id}">+1</button><button data-act="addstock" data-n="10" data-id="${p.id}">+10</button></div>${badge(p.stock)}</div>
      <div><button class="danger" data-act="delprod" data-id="${p.id}">Delete</button></div></div>`).join("")
    : '<p class="muted">No items yet. Add one above, or load a few samples.</p><button data-act="seed">Load sample items</button>'}</section>`;
}

// ---------- product categories ----------
const catOf = id => categories.find(c => c.id === id);
const catPic = c => c.img ? `<img src="${esc(c.img)}" alt="">` : esc(c.em || "🏷️");
// customers only see products whose category is active (products without a category are always shown)
const shownProducts = () => products.filter(p => !p.cat || !catOf(p.cat) || catOf(p.cat).active !== false)
  .filter(p => catFilter === "all" || p.cat === catFilter);
const catBar = () => { const act = categories.filter(c => c.active !== false); if (!act.length) return "";
  if (catFilter !== "all" && !act.find(c => c.id === catFilter)) catFilter = "all";
  return `<div class="catbar" role="tablist" aria-label="Categories"><button class="chip ${catFilter === "all" ? "on" : ""}" data-act="catfilter" data-id="all"><span class="cp">🛍️</span>All</button>${act.map(c => `<button class="chip ${catFilter === c.id ? "on" : ""}" data-act="catfilter" data-id="${esc(c.id)}"><span class="cp">${catPic(c)}</span>${esc(c.name)}</button>`).join("")}</div>`; };
const catOptions = sel => `<option value="">No category</option>${categories.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? "selected" : ""}>${esc(c.name)}${c.active === false ? " (inactive)" : ""}</option>`).join("")}`;
const DEFAULT_CATS = [["School Supplies","📚"],["Bags & Backpacks","🎒"],["Writing Tools","🖊️"],["Notebooks & Paper","📓"],["Art & Crafts","🎨"],["Calculators & Gadgets","🧮"],["Drinkware & Lunch","🍱"],["Office Supplies","🗂️"],["Uniforms & Accessories","👕"],["Others","📦"]];
function pgCategories(){
  const n = id => products.filter(p => p.cat === id).length;
  return `<h1>Product Categories</h1><p class="muted">Add, rename, hide or delete categories. Customers see every change right away.</p>
  <section class="card"><h2>Add a category</h2>
    <div class="add catadd"><div><label for="cn">Category name</label><input id="cn" placeholder="e.g. Art & Crafts"></div><div><label for="cf">Logo or picture (optional)</label><input id="cf" type="file" accept="image/*"></div><button class="primary" data-act="addcat">Add category</button></div>
    ${categories.length ? "" : '<p class="muted" style="margin-bottom:8px">Or start with a ready-made set of 10 categories.</p><button data-act="seedcats">Load 10 default categories</button>'}</section>
  <section class="card"><h2>All categories (${categories.length})</h2>
    ${categories.length ? categories.map(c => `<div class="catrow ${c.active === false ? "off" : ""}">
      <div class="pic"><div class="thumb">${catPic(c)}</div><label>${c.img ? "Change picture" : "Add picture"}<input type="file" accept="image/*" data-cpic="${esc(c.id)}" aria-label="Picture for ${esc(c.name)}"></label>${c.img ? `<button data-act="rmcpic" data-id="${esc(c.id)}">Remove</button>` : ""}</div>
      <div><input data-cname="${esc(c.id)}" value="${esc(c.name)}" aria-label="Category name"><small class="muted">${n(c.id)} product${n(c.id) === 1 ? "" : "s"}</small></div>
      <label class="switch"><input type="checkbox" data-cact="${esc(c.id)}" ${c.active !== false ? "checked" : ""}><span>${c.active !== false ? "Active" : "Inactive"}</span></label>
      <button class="danger" data-act="delcat" data-id="${esc(c.id)}">Delete</button></div>`).join("") : '<p class="muted">No categories yet.</p>'}</section>`;
}

// ---------- saved bundles (e.g. Back to School, Summer) ----------
function bundleCalc(b){
  const items = (b.items || []).map(i => ({p: prod(i.id), qty: i.qty})).filter(x => x.p);
  const sub = items.reduce((t, x) => t + x.p.price * x.qty, 0);
  const d = b.value > 0 ? {type: b.type, value: b.value} : discount, v = Math.max(0, d.value || 0);
  let disc = d.type === "percent" ? sub * Math.min(v, 100) / 100 : Math.min(v, sub);
  const bad = items.filter(x => x.p.stock < x.qty), low = items.filter(x => x.p.stock >= x.qty && x.p.stock - x.qty <= LOW);
  return {items, sub, disc, final: sub - disc, state: bad.length ? "bad" : low.length ? "low" : "ok", bad};
}
const bundleCard = b => { const c = bundleCalc(b), m = STOCK_MSG[c.state];
  return `<div class="prod bcard">${b.img ? `<img class="pimg" src="${esc(b.img)}" alt="" loading="lazy">` : ""}<span class="kick">SPECIAL BUNDLE OFFER</span><b style="font-size:1.1rem">${esc(b.name)}</b>
    <ul class="blist">${c.items.map(x => `<li>${x.qty} ${esc(x.p.name)}</li>`).join("")}</ul>
    ${c.disc > 0 ? `<span class="was">Regular price: ${fmt(c.sub)}</span><span class="save">Save ${fmt(c.disc)}</span>` : ""}<span class="price">${fmt(c.final)}</span>
    <span class="sbadge ${c.state}">${m[0]}${c.state === "bad" ? " · " + c.bad.map(x => esc(x.p.name)).join(", ") : ""}</span>
    <button class="primary" data-act="usebundle" data-id="${esc(b.id)}" ${c.state === "bad" || !c.items.length ? "disabled" : ""}>Use this bundle</button></div>`; };
const bundleSection = () => bundles.length ? `<section class="card"><h2>Ready-made bundles</h2><p class="muted" style="margin-top:0">Pick one, then change the items if you like.</p><div class="grid">${bundles.map(bundleCard).join("")}</div></section>` : "";

function pgBundles(){
  const f = bform;
  const form = f ? `<section class="card stack"><h2>${f.id ? "Edit bundle" : "New bundle"}</h2>
    <div><label for="bfn">Bundle name</label><input id="bfn" value="${esc(f.name)}" placeholder="e.g. Back to School, Summer"></div>
    <div class="pic"><div class="thumb">${f.img ? `<img src="${esc(f.img)}" alt="">` : "🎁"}</div><label>${f.img ? "Change photo" : "Add photo"}<input type="file" accept="image/*" data-bpic="1" aria-label="Bundle photo"></label>${f.img ? '<button data-act="rmbpic">Remove</button>' : ""}</div>
    <div class="disc"><div><label for="bft">Promo discount type</label><select id="bft"><option value="percent" ${f.type === "percent" ? "selected" : ""}>Percent (%)</option><option value="fixed" ${f.type === "fixed" ? "selected" : ""}>Fixed amount</option></select></div>
    <div><label for="bfv">Promo discount (0 = use the store discount)</label><input id="bfv" type="number" min="0" step="0.01" value="${f.value}"></div><span></span></div>
    <div><label>Items in this bundle (quantity, 0 = not included)</label>${products.map(p => `<div class="line"><span>${esc(p.name)} <span class="muted">${fmt(p.price)}</span></span><input data-bq="${p.id}" type="number" min="0" step="1" value="${f.qty[p.id] || 0}" style="width:80px" aria-label="Quantity of ${esc(p.name)}"></div>`).join("") || '<p class="muted">Add products first.</p>'}</div>
    <div class="acts"><button class="primary" data-act="savebundle">Save bundle</button><button data-act="cancelbundle">Cancel</button></div></section>`
    : `<div class="acts" style="margin-bottom:14px"><button class="primary" data-act="newbundle">+ New bundle</button>${bundles.length ? "" : '<button data-act="seedbundles">Load sample bundles</button>'}</div>`;
  return `<h1>Bundles</h1><p class="muted">Make as many promo bundles as you like (Back to School, Summer, ...). Customers see them on the Order page.</p>${form}
  ${bundles.length ? `<div class="grid">${bundles.map(b => bundleCard(b).replace(/<button class="primary" data-act="usebundle"[^>]*>Use this bundle<\/button>/, `<div class="acts"><button data-act="editbundle" data-id="${esc(b.id)}">Edit</button><button class="danger" data-act="delbundle" data-id="${esc(b.id)}">Delete</button></div>`)).join("")}</div>` : '<p class="muted">No bundles yet.</p>'}`;
}

const stockBanner = () => { const sc = stockCheck(); if (!sc.lines.length) return "";
  return `<div class="chk ${sc.state}" role="status"><b>${STOCK_MSG[sc.state][0]}</b>${sc.state === "bad" ? `Selected quantity exceeds available stock for ${sc.bad.map(l => esc(l.p.name)).join(", ")}.` : sc.state === "low" ? `${STOCK_MSG.low[1]} (${sc.low.map(l => esc(l.p.name)).join(", ")})` : STOCK_MSG.ok[1]}</div>`; };
const cardWarn = p => { const q = need(p.id), left = p.stock - q;
  if (p.stock <= 0) return ""; if (q && left < 0) return `<span class="sbadge bad">Insufficient stock · only ${p.stock} available</span>`;
  if (left <= LOW) return `<span class="sbadge low">Low stock · ${left} left</span>`; return ""; };
const prodCard = p => { const left = p.stock - need(p.id);
  return `<div class="prod">${p.img ? `<img class="pimg" src="${esc(p.img)}" alt="" loading="lazy">` : `<span class="em" aria-hidden="true">${esc(p.em || "📦")}</span>`}<b>${esc(p.name)}</b><span class="price">${fmt(p.price)}</span><span class="meta">${p.stock<=0 ? "Out of stock" : left<=0 ? "No more available" : left + " in stock"}</span>${cardWarn(p)}<button data-act="add" data-id="${p.id}" ${left<=0?"disabled":""}>Add to bundle</button></div>`; };
function panelHtml(){
  const t = totals(), ls = products.filter(p => cart[p.id]), sc = stockCheck(), cb = Object.entries(cartBundles).map(([id, q]) => ({b: bundles.find(x => x.id === id), q})).filter(x => x.b);
  const bundleLine = ({b, q}) => { const c = bundleCalc(b), badNames = c.items.filter(x => sc.bad.some(l => l.p.id === x.p.id)).map(x => esc(x.p.name));
    return `<li><span><b>${esc(b.name)}</b><br><small class="muted">Includes: ${c.items.map(x => x.qty + " " + esc(x.p.name)).join(", ")}</small>${badNames.length ? `<br><small class="sbadge bad">Insufficient stock · ${badNames.join(", ")}</small>` : ""}</span>
    <span class="qty"><button data-act="bdec" data-id="${esc(b.id)}" aria-label="Remove one ${esc(b.name)}">−</button><span>${q}</span><button data-act="binc" data-id="${esc(b.id)}" aria-label="Add one ${esc(b.name)}">+</button></span><b>${fmt(c.final * q)}</b></li>`; };
  const looseLine = p => `<li><span>${esc(p.name)}<br><small class="muted">${fmt(p.price)} each</small>${(() => { const l = sc.lines.find(x => x.p.id === p.id); return l && l.state !== "ok" ? `<br><small class="sbadge ${l.state}">${STOCK_MSG[l.state][0]} · ${lineMsg(l)}</small>` : ""; })()}</span>
    <span class="qty"><button data-act="dec" data-id="${p.id}" aria-label="Remove one ${esc(p.name)}">−</button><span>${cart[p.id]}</span><button data-act="inc" data-id="${p.id}" aria-label="Add one ${esc(p.name)}" ${need(p.id)>=p.stock?"disabled":""}>+</button></span><b>${fmt(cart[p.id]*p.price)}</b></li>`;
  return `<h2>Your bundle</h2><div class="muted" style="margin-bottom:8px">Ordering as ${esc(profile?.name || user.email)}</div>
  <label for="bn">Bundle name (optional)</label><input id="bn" value="${esc(bundleName)}" placeholder="e.g. Back-to-school pack" style="margin-bottom:12px">
  <ul class="items">${cb.length || ls.length ? cb.map(bundleLine).join("") + ls.map(looseLine).join("") : '<li class="muted" style="display:block">Your bundle is empty. Pick a ready-made bundle or add products.</li>'}</ul>
  ${sc.lines.length ? `<div class="chk ${sc.state}" role="status"><b>${STOCK_MSG[sc.state][0]}</b>${sc.state === "bad" ? `Selected quantity exceeds available stock for ${sc.bad.map(l => esc(l.p.name)).join(", ")}.` : STOCK_MSG[sc.state][1]}<small>Stock is only deducted when an order is processed, not while you build a bundle.</small></div>` : ""}
  ${ls.length ? `<div class="sum"><span>Items</span><span>${t.count}</span></div><div class="sum"><span>Subtotal</span><span>${fmt(t.sub)}</span></div>
  <div class="sum save"><span>${t.disc > 0 ? "Discount (" + esc(discText()) + ")" : "Discount"}</span><span>-${fmt(t.disc)}</span></div>` : ""}
  <div class="tag"><div><small>${cb.length && !ls.length ? "Bundle price" : "Final bundle price"}</small><small>${t.disc > 0 ? "You save " + fmt(t.disc) : ""}</small></div><div class="price">${fmt(t.final)}</div></div>
  <label for="note">Note / special request</label><textarea id="note">${esc(note)}</textarea>
  <div class="acts"><button class="primary" data-act="place" ${!t.count || !sc.canFulfil ? "disabled" : ""}>Place pre-order</button><button data-act="summary" ${!t.count ? "disabled" : ""}>Customer summary</button><button data-act="clearcart">Clear</button></div>`;
}
const pgOrder = () => `<h1>Order</h1><div id="bundlesec">${bundleSection()}</div><div id="sbanner">${stockBanner()}</div><div id="catbar">${catBar()}</div><div class="two"><div><div class="grid" id="pgrid">${shownProducts().length ? shownProducts().map(prodCard).join("") : '<p class="muted">No products yet. Please check back soon.</p>'}</div></div><aside class="card" id="bpanel">${panelHtml()}</aside></div>`;
const renderOrderParts = () => { if ($("pgrid")){ $("pgrid").innerHTML = shownProducts().map(prodCard).join("") || '<p class="muted">No products in this category yet.</p>'; if ($("catbar")) $("catbar").innerHTML = catBar(); $("bpanel").innerHTML = panelHtml(); if ($("sbanner")) $("sbanner").innerHTML = stockBanner(); if ($("bundlesec")) $("bundlesec").innerHTML = bundleSection(); } };

// ---------- reports and analytics (admin) ----------
const DAY = 864e5, RANGES = [[7, "1 week"], [30, "1 month"], [365, "12 months"]]; // date range choices, in this order
const live = () => orders.filter(o => o.status !== "Cancelled"); // cancelled orders are never counted
const between = (l, a, b) => l.filter(o => { const t = ts(o); return t >= a && t < b; });
const sum = (l, f) => l.reduce((n, x) => n + f(x), 0);
const fmtK = n => CUR + (n >= 1e12 ? +(n / 1e12).toFixed(1) + "T" : n >= 1e9 ? +(n / 1e9).toFixed(1) + "B" : n >= 1e6 ? +(n / 1e6).toFixed(1) + "M" : n >= 1e3 ? +(n / 1e3).toFixed(1) + "K" : +n.toFixed(0));
const pc = (c, p) => p ? (c - p) / p * 100 : null;
const pf = v => Math.abs(v) > 999 ? ">999" : Math.abs(v).toFixed(1); // keep huge growth numbers from overflowing

const delta = (c, p) => { const v = pc(c, p); if (v === 0) return '<span class="dl">0.0%</span>'; return v === null ? (c ? '<span class="dl up">New</span>' : '<span class="dl">–</span>') : `<span class="dl ${v >= 0 ? "up" : "down"}">${v >= 0 ? "↑" : "↓"} ${pf(v)}%</span>`; };
const bigIc = k => `<span class="kic"><svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${ICON[k]}</svg></span>`;
// bundles sold in a list of orders: only the bundles the admin created (items picked by hand are not counted)
function sold(l){
  const m = new Map(), add = (key, name, id, qty, rev) => { const r = m.get(key) || {name, id, qty: 0, rev: 0}; r.qty += qty; r.rev += rev; m.set(key, r); };
  for (const o of l){
    for (const b of o.bundles || []){ const rev = b.price * b.qty; add(b.id || b.name, b.name, b.id, b.qty, rev); }
  }
  return [...m.values()].sort((a, b) => b.qty - a.qty || b.rev - a.rev);
}
function niceStep(x){ if (x <= 0) return 100; const mag = 10 ** Math.floor(Math.log10(x)), r = x / mag; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag; }
function trendChart(pts){
  const W = 600, H = 280, L = 64, R = 26, T = 28, B = 34, iw = W - L - R, ih = H - T - B;
  const step = niceStep(Math.max(...pts.map(p => p.value), 0) / 4), max = step * 4, every = pts.length > 14 ? 5 : 1; // on long ranges label every 5th day
  const x = i => pts.length > 1 ? L + iw * i / (pts.length - 1) : L + iw / 2, y = v => T + ih - v / max * ih;
  const line = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1)).join(" ");
  const area = line + ` L${x(pts.length - 1).toFixed(1)} ${T + ih} L${x(0).toFixed(1)} ${T + ih} Z`;
  const last = pts[pts.length - 1], lx = x(pts.length - 1), ly = y(last.value), tw = Math.max(110, fmt(last.value).length * 9.5 + 24), tx = Math.min(Math.max(lx - tw / 2, 4), W - tw - 4), ty = ly - 38 < 0 ? ly + 12 : ly - 38;
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue trend">
    <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--teal);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--teal);stop-opacity:.03"/></linearGradient></defs>
    ${[0, 1, 2, 3, 4].map(i => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(step * i)}" y2="${y(step * i)}"/><text class="ax" x="${L - 8}" y="${y(step * i) + 4}" text-anchor="end">${fmtK(step * i)}</text>`).join("")}
    ${pts.map((p, i) => (pts.length - 1 - i) % every === 0 ? `<text class="ax" x="${x(i)}" y="${H - 10}" text-anchor="middle">${p.label}</text>` : "").join("")}
    <path d="${area}" fill="url(#rg)"/><path class="ln" d="${line}"/>
    ${pts.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="${i === pts.length - 1 ? 6 : pts.length > 14 ? 3 : 4}"><title>${esc(p.full)}: ${fmt(p.value)}</title></circle>`).join("")}
    <g class="tip"><rect x="${tx}" y="${ty}" width="${tw}" height="26" rx="8"/><text x="${tx + tw / 2}" y="${ty + 18}" text-anchor="middle">${fmt(last.value)}</text></g></svg>`;
}
function pgAnalytics(){
  const d0 = new Date(), all = live(), year = aRange >= 365;
  // the window is whole calendar days (or whole months for 12 months), compared with the same-length window before it
  const start = year ? +new Date(d0.getFullYear(), d0.getMonth() - 11, 1) : +new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - (aRange - 1));
  const prevStart = year ? +new Date(d0.getFullYear(), d0.getMonth() - 23, 1) : +new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - (2 * aRange - 1));
  const cur = between(all, start, Infinity), prev = between(all, prevStart, start), lbl = RANGES.find(r => r[0] === aRange)[1];
  const rangeName = "last " + lbl;
  // customers
  const born = c => c.createdAt?.toMillis?.() ?? 0, totalCust = customers.length, newCust = aRange ? customers.filter(c => born(c) >= start).length : 0;
  // bundles
  const top = sold(cur), best = top[0], imgOf = r => bundles.find(b => b.id === r.id)?.img;
  // revenue trend follows the date range: one dot per day (1 week, 1 month) or per month (12 months)
  const pts = [], revNow = sum(cur, o => o.total), revPrev = sum(prev, o => o.total), mg = pc(revNow, revPrev);
  if (year){
    for (let i = 11; i >= 0; i--){ const a = new Date(d0.getFullYear(), d0.getMonth() - i, 1), b = new Date(d0.getFullYear(), d0.getMonth() - i + 1, 1);
      pts.push({label: a.toLocaleDateString(undefined, {month: "short"}), full: a.toLocaleDateString(undefined, {month: "long", year: "numeric"}), value: sum(between(all, +a, +b), o => o.total)}); }
  } else {
    for (let i = aRange - 1; i >= 0; i--){ const a = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - i), b = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - i + 1);
      pts.push({label: a.toLocaleDateString(undefined, aRange === 7 ? {weekday: "short"} : {month: "short", day: "numeric"}), full: a.toLocaleDateString(undefined, {month: "long", day: "numeric", year: "numeric"}), value: sum(between(all, +a, +b), o => o.total)}); }
  }
  // recent daily performance (last 7 days)
  const days = [];
  for (let i = 0; i < 7; i++){ const a = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - i), b = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - i + 1), l = between(all, +a, +b);
    days.push({date: a.toLocaleDateString(undefined, {month: "short", day: "numeric", year: "numeric"}), n: l.length, rev: sum(l, o => o.total), best: sold(l)[0]?.name || "–"}); }
  const medal = i => `<span class="medal${i < 3 ? " m" + (i + 1) : ""}">${i + 1}</span>`;
  const growth = pc(totalCust, totalCust - newCust);
  return `<div class="an-head"><div><h1>Reports and Analytics</h1><p class="muted" style="margin:0">Track performance. Make data-driven decisions. Cancelled orders are not counted.</p></div>
    <div><label for="arange">Date range</label><select id="arange">${RANGES.map(([v, l]) => [v, "Last " + l]).map(([v, l]) => `<option value="${v}" ${aRange === v ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
  <div class="kpis">
    <div class="card kpi">${bigIc("users")}<div><span class="muted">Total Customers</span><div class="kv"><b>${totalCust.toLocaleString()}</b>${aRange ? delta(totalCust, totalCust - newCust) : ""}</div><small class="muted">${aRange ? newCust + " new in the " + rangeName : "All registered customers"}</small></div></div>
    <div class="card kpi">${bigIc("cart")}<div><span class="muted">Total Sales</span><div class="kv"><b>${cur.length.toLocaleString()}</b>${aRange ? delta(cur.length, prev.length) : ""}</div><small class="muted">${fmt(sum(cur, o => o.total))} from orders, ${rangeName}</small></div></div>
    <div class="card kpi">${bigIc("trophy")}<div><span class="muted">Best-Selling Bundle</span><div class="kv"><b class="bn">${best ? esc(best.name) : "–"}</b></div><small class="muted">${best ? best.qty.toLocaleString() + " sold" : "No sales yet"}</small></div></div>
  </div>
  <div class="an-grid">
    <section class="card"><div class="cardhead"><h2>Monthly Revenue Monitoring</h2><small class="muted">${rangeName}</small></div>
      <div class="kv"><b class="big">${fmt(revNow)}</b>${delta(revNow, revPrev)}</div><small class="muted">Revenue for the ${rangeName}, compared with the ${lbl} before</small>
      <div class="chartbox">${trendChart(pts)}</div></section>
    <section class="card"><div class="cardhead"><h2>Top Performing Bundles</h2><small class="muted">${rangeName}</small></div>
      ${top.length ? top.slice(0, 10).map((r, i) => `<div class="rk">${medal(i)}<span class="rthumb">${imgOf(r) ? `<img src="${esc(imgOf(r))}" alt="">` : "🎁"}</span><b class="rn">${esc(r.name)}</b><span class="muted rs">${r.qty.toLocaleString()} sold</span><b class="rr">${fmt(r.rev)}</b></div>`).join("") : '<p class="muted">No bundle sales in this period yet.</p>'}</section>
  </div>
  <div class="an-grid b">
    <section class="card"><h2>Recent Daily Performance</h2><div class="tscroll"><table class="tbl"><thead><tr><th>Date</th><th class="r">Total Sales</th><th class="r">Revenue</th><th>Best-Selling Bundle</th></tr></thead>
      <tbody>${days.map(d => `<tr><td>${d.date}</td><td class="r">${d.n}</td><td class="r">${fmt(d.rev)}</td><td>${esc(d.best)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="card"><h2>Key Insights</h2><div class="ins">
      <div>${bigIc("chart")}<b class="${!mg ? "" : mg > 0 ? "up" : "down"}">${mg === null ? "–" : (mg > 0 ? "+" : mg < 0 ? "-" : "") + pf(mg) + "%"}</b><span class="muted">${mg === null ? "Not enough data yet to compare with the previous period." : `Revenue ${mg >= 0 ? "increased" : "decreased"} by ${pf(mg)}% compared to the ${lbl} before.`}</span></div>
      <div>${bigIc("users")}<b class="${aRange && growth ? (growth > 0 ? "up" : "down") : ""}">${aRange ? (growth === null ? (newCust ? "New" : "–") : (growth > 0 ? "+" : growth < 0 ? "-" : "") + pf(growth) + "%") : totalCust}</b><span class="muted">${aRange ? (newCust ? `Total customers grew by ${growth === null ? newCust : pf(growth) + "%"} in the ${rangeName}.` : `No new customers in the ${rangeName}.`) : "Registered customers in total."}</span></div>
      <div>${bigIc("trophy")}<b>${best ? esc(best.name) : "–"}</b><span class="muted">${best ? `is the top seller with ${best.qty.toLocaleString()} orders.` : "No sales yet."}</span></div></div></section>
  </div>`;
}

// ---------- customer service chat ----------
const tsOf = x => x?.toMillis?.() ?? Date.now();
const timeOf = m => new Date(ts(m)).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
const bubbles = (l, mine) => [...l].sort((a, b) => ts(a) - ts(b)).map(m => `<div class="bub ${m.from === mine ? "me" : "them"}">${esc(m.text)}<small>${timeOf(m)}</small></div>`).join("");
const sortedChats = () => [...chats].sort((a, b) => tsOf(b.lastAt) - tsOf(a.lastAt));
const chatListHtml = () => sortedChats().length ? sortedChats().map(c => `<button class="thread ${c.id === selChat ? "on" : ""}" data-act="openchat" data-id="${esc(c.id)}"><span class="tn"><span>${esc(c.customerName || "Customer")}</span>${c.adminUnread > 0 ? `<span class="nb">${c.adminUnread}</span>` : `<small>${new Date(tsOf(c.lastAt)).toLocaleDateString([], {month: "short", day: "numeric"})}</small>`}</span><small>${c.lastFrom === "admin" ? "You: " : ""}${esc(c.lastMessage || "")}</small></button>`).join("") : '<p class="muted" style="padding:10px">No conversations yet. When a customer messages you, it shows up here.</p>';
function pgChat(){
  const c = chats.find(x => x.id === selChat);
  return `<h1>Customer chat</h1><div class="chatwrap ${selChat ? "open" : ""}">
    <section class="card chatlist" id="chatlist">${chatListHtml()}</section>
    <section class="card chatpane">${selChat ? `<div class="chathead"><button class="backbtn" data-act="closechat" aria-label="Back to conversations">←</button><b>${esc(c?.customerName || "Customer")}</b><button class="danger" style="margin-left:auto" data-act="delchat">Delete conversation</button></div>
      <div class="msgs" id="amsgs">${bubbles(selMsgs, "admin") || '<p class="muted">No messages yet.</p>'}</div>
      <div class="cform"><input id="ain" placeholder="Type a reply…" maxlength="1000" autocomplete="off" aria-label="Reply"><button class="primary" data-act="adminsend">Send</button></div>`
      : '<p class="muted" style="margin:auto;text-align:center">Select a conversation to read and reply.</p>'}</section></div>`;
}
function renderChatParts(){
  if ($("chatlist")) $("chatlist").innerHTML = chatListHtml();
  const el = $("amsgs"); if (el){ const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80; el.innerHTML = bubbles(selMsgs, "admin") || '<p class="muted">No messages yet.</p>'; if (bottom) el.scrollTop = el.scrollHeight; }
}
// customer chat button + window (lives outside the page so it never resets while typing)
function ensureCW(){
  if ($("cw")) return;
  const w = document.createElement("div"); w.id = "cw";
  w.innerHTML = `<section class="cpanel" id="cpanel" hidden role="dialog" aria-label="Customer service chat"><header><div><b>Customer service</b><small>We usually reply within the day</small></div><span><button id="cdel" data-act="delmychat" aria-label="Delete conversation" title="Delete conversation">🗑</button><button data-act="chattoggle" aria-label="Close chat">✕</button></span></header>
    <div class="msgs" id="cmsgs"></div><div class="cform"><input id="cin" placeholder="Type your message…" maxlength="1000" autocomplete="off" aria-label="Message"><button class="primary" data-act="chatsend">Send</button></div></section>
    <button class="cfab" data-act="chattoggle" aria-label="Chat with customer service"><svg viewBox="0 0 16 16" aria-hidden="true">${ICON.chat}</svg><span class="cbadge" id="cbadge" hidden></span></button>`;
  document.body.appendChild(w); renderCW();
}
function renderCW(){
  if (role !== "customer" || !$("cw")) return;
  const n = myChat?.customerUnread || 0, b = $("cbadge"); b.textContent = n; b.hidden = chatOpen || !n;
  $("cpanel").hidden = !chatOpen; $("cdel").hidden = !chatMsgs.length;
  const el = $("cmsgs"), bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  el.innerHTML = bubbles(chatMsgs, "customer") || '<p class="muted" style="margin:auto;text-align:center">Hi! Ask us anything about your order or our bundles.</p>';
  if (bottom) el.scrollTop = el.scrollHeight;
  if (chatOpen && n > 0) C.markChatRead(user.uid, "customer");
}

const PAGES = {dashboard: pgDashboard, products: pgProducts, categories: pgCategories, bundles: pgBundles, orders: pgOrders, analytics: pgAnalytics, chat: pgChat, about: pgAbout, order: pgOrder, "my-orders": pgMyOrders};

// ---------- actions ----------
function toDataUrl(file, max = 320){
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onerror = reject;
    r.onload = () => { const im = new Image(); im.onerror = reject;
      im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); resolve(c.toDataURL("image/jpeg", 0.8)); };
      im.src = r.result; };
    r.readAsDataURL(file);
  });
}
const prod = id => products.find(p => p.id == id);
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); flash("That did not save. Check your internet and login."); } };

async function setStatus(o, s){
  const patch = {status: s};
  if (s === "Cancelled") patch.cancelledBy = "admin";
  const tot = {}; for (const i of o.items || []) tot[i.id] = (tot[i.id] || 0) + i.qty;
  if (s === "Ready" && !o.deducted){ for (const id in tot){ const p = prod(id); if (p) await C.setProduct({...p, stock: Math.max(0, p.stock - tot[id])}); } patch.deducted = true; }
  if (s === "Cancelled" && o.deducted){ for (const id in tot){ const p = prod(id); if (p) await C.setProduct({...p, stock: p.stock + tot[id]}); } patch.deducted = false; }
  await C.updateOrder(o.id, patch);
}
async function place(){
  const t = totals(); if (!t.count){ flash("Add at least one product first."); return; }
  const short = needed().find(p => need(p.id) > p.stock); if (short){ flash("Insufficient stock: " + short.name + " (only " + short.stock + " left)."); return; }
  const items = products.filter(p => cart[p.id]).map(p => ({id: p.id, name: p.name, price: p.price, qty: cart[p.id], subtotal: p.price * cart[p.id]}));
  const bl = [];
  for (const [id, q] of Object.entries(cartBundles)){ const b = bundles.find(x => x.id === id); if (!b) continue; const c = bundleCalc(b);
    bl.push({id, name: b.name, qty: q, regular: c.sub, price: c.final, items: c.items.map(x => ({name: x.p.name, qty: x.qty}))});
    c.items.forEach(x => items.push({id: x.p.id, name: x.p.name, price: 0, qty: x.qty * q, subtotal: 0, bundle: b.name})); }
  await C.placeOrder({uid: user.uid, customerName: profile?.name || user.email, items, bundles: bl, bundleName: bundleName.trim(), note: note.trim(), subtotal: t.sub, discount: t.disc, discountLabel: discText(), total: t.final, status: "Pending"});
  cart = {}; cartBundles = {}; activeDisc = null; bundleName = ""; note = ""; flash("Order placed! Track it in My Orders."); location.hash = "my-orders";
}
async function addProd(){
  const name = $("nn").value.trim(), price = parseFloat($("np").value), stock = parseInt($("ns").value, 10);
  if (!name || isNaN(price) || price < 0 || isNaN(stock) || stock < 0){ flash("Enter a name, a price and a starting stock."); return; }
  const item = {id: Date.now(), name, price, stock, em: "📦"}, file = $("nf").files[0];
  if ($("nc")?.value) item.cat = $("nc").value;
  if (file){ try { item.img = await toDataUrl(file); } catch (e) { flash("Photo could not be used. Item added without it."); } }
  await C.setProduct(item); flash(name + " added.");
}

function offerText(){
  const t = totals(), ls = needed();
  const strike = str => [...str].map(c => c + "\u0336").join("");
  const out = ["SPECIAL BUNDLE OFFER", titleName(), "", "What's included?"];
  ls.forEach(p => out.push(`• ${need(p.id)} ${p.name}`));
  out.push("");
  if (t.disc > 0){ out.push("Regular price: " + strike(fmt(t.sub))); out.push("Save " + fmt(t.disc)); }
  out.push("Bundle price: " + fmt(t.final));
  const c = [about.contact && "Contact: " + about.contact, about.facebookPage && "Facebook: " + about.facebookPage].filter(Boolean);
  if (c.length) out.push("", ...c);
  return out.join("\n");
}
function offerHtml(){
  const t = totals(), ls = needed();
  return `<div class="offer" role="dialog" aria-modal="true" aria-label="Customer-ready bundle summary"><div class="kick">SPECIAL BUNDLE OFFER</div><h3>${esc(titleName())}</h3>
    <b>What's included?</b><ul>${ls.map(p => `<li>${need(p.id)} ${esc(p.name)}</li>`).join("")}</ul>
    ${t.disc > 0 ? `<div class="was">Regular price: ${fmt(t.sub)}</div><div class="save">Save ${fmt(t.disc)}</div>` : ""}
    <div class="now">${fmt(t.final)}</div>
    ${about.contact || about.facebookPage ? `<div class="contact">${about.contact ? "Contact: " + esc(about.contact) + "<br>" : ""}${about.facebookPage ? "Facebook: " + esc(about.facebookPage) : ""}</div>` : ""}
    <div class="acts"><button class="primary" data-act="copysum">Copy to send</button><button data-act="closesum">Close</button></div></div>`;
}
async function copyText(txt){
  try { await navigator.clipboard.writeText(txt); return true; }
  catch (e) { const ta = document.createElement("textarea"); ta.value = txt; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (_) {} ta.remove(); return ok; }
}

const CANCEL_REASONS = ["Changed my mind", "Ordered by mistake", "Found a better price", "Taking too long", "Other"];
const ACT = {
  cancelorder: el => {
    const o = orders.find(x => x.id === el.dataset.id); if (!o || o.status !== "Pending"){ flash("This order can no longer be cancelled."); return; }
    const m = document.createElement("div"); m.id = "cxModal"; m.className = "modal";
    m.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-label="Cancel order"><h2>Cancel this order?</h2><p class="muted" style="margin-top:0">You can only cancel while the order is still Pending. This cannot be undone.</p>
      <label for="cxr">Reason</label><select id="cxr">${CANCEL_REASONS.map(r => `<option>${r}</option>`).join("")}</select>
      <div style="margin-top:10px"><label for="cxn">Anything to add? (optional)</label><textarea id="cxn" maxlength="200"></textarea></div>
      <div class="acts"><button class="danger" data-act="docancel" data-id="${esc(o.id)}">Yes, cancel order</button><button data-act="closecx">Keep order</button></div></div>`;
    document.body.appendChild(m);
  },
  closecx: () => $("cxModal")?.remove(),
  docancel: guard(async el => {
    const o = orders.find(x => x.id === el.dataset.id), r = $("cxr").value, n = $("cxn").value.trim();
    if (!o || o.status !== "Pending"){ $("cxModal")?.remove(); flash("This order can no longer be cancelled."); return; }
    await C.cancelOrder(o.id, n ? r + " - " + n : r); $("cxModal")?.remove(); flash("Your order was cancelled.");
  }),
  chattoggle: () => { chatOpen = !chatOpen; renderCW(); if (chatOpen){ $("cmsgs").scrollTop = $("cmsgs").scrollHeight; $("cin").focus(); } },
  chatopen: () => { chatOpen = true; renderCW(); $("cmsgs").scrollTop = $("cmsgs").scrollHeight; $("cin").focus(); },
  chatsend: guard(async () => { const i = $("cin"), t = i.value.trim(); if (!t) return; i.value = "";
    try { await C.sendMessage(user.uid, "customer", t, profile?.name || user.email); } catch (e) { i.value = t; throw e; } }),
  openchat: el => { selChat = el.dataset.id; selMsgs = []; threadUnsub?.(); threadUnsub = C.watchMessages(selChat, l => { selMsgs = l; renderChatParts(); }); C.markChatRead(selChat, "admin"); route(); },
  closechat: () => { threadUnsub?.(); threadUnsub = null; selChat = null; selMsgs = []; route(); },
  delchat: guard(async () => { if (!selChat || !confirm("Delete this whole conversation? It will also disappear for the customer.")) return;
    const id = selChat; await C.deleteChat(id); threadUnsub?.(); threadUnsub = null; selChat = null; selMsgs = []; route(); flash("Conversation deleted."); }),
  delmychat: guard(async () => { if (!chatMsgs.length || !confirm("Delete this conversation? Customer service will no longer see it either.")) return;
    await C.deleteChat(user.uid); flash("Conversation deleted."); }),
  adminsend: guard(async () => { const i = $("ain"), t = i.value.trim(); if (!t || !selChat) return; i.value = "";
    try { await C.sendMessage(selChat, "admin", t); } catch (e) { i.value = t; throw e; } }),
  summary: () => {
    const sc = stockCheck();
    if (!totals().count){ flash("Add at least one product first."); return; }
    if (!sc.canFulfil){ flash("Cannot prepare this bundle: " + sc.bad.map(l => l.p.name).join(", ") + " has insufficient stock."); return; }
    const m = document.createElement("div"); m.id = "sumModal"; m.innerHTML = offerHtml(); document.body.appendChild(m);
  },
  closesum: () => $("sumModal")?.remove(),
  usebundle: el => { const b = bundles.find(x => x.id === el.dataset.id); if (!b) return;
    const bad = (b.items || []).map(i => ({p: prod(i.id), qty: i.qty})).filter(x => x.p && need(x.p.id) + x.qty > x.p.stock);
    if (bad.length){ flash("Insufficient stock: " + bad.map(x => x.p.name).join(", ")); return; }
    cartBundles[b.id] = (cartBundles[b.id] || 0) + 1; flash(b.name + " added to your order."); renderOrderParts(); },
  binc: el => ACT.usebundle(el),
  bdec: el => { const id = el.dataset.id; cartBundles[id] = (cartBundles[id] || 0) - 1; if (cartBundles[id] <= 0) delete cartBundles[id]; renderOrderParts(); },
  newbundle: () => { bform = {id: "", name: "", type: "percent", value: 0, qty: {}, img: ""}; route(); },
  rmbpic: () => { bform.img = ""; route(); },
  cancelbundle: () => { bform = null; route(); },
  editbundle: el => { const b = bundles.find(x => x.id === el.dataset.id); bform = {id: b.id, name: b.name, type: b.type || "percent", value: b.value || 0, img: b.img || "", qty: Object.fromEntries((b.items || []).map(i => [i.id, i.qty]))}; route(); window.scrollTo(0, 0); },
  savebundle: guard(async () => {
    const name = bform.name.trim(), items = Object.entries(bform.qty).filter(([, q]) => q > 0).map(([id, qty]) => ({id: +id, qty}));
    if (!name || !items.length){ flash("Enter a name and at least one item."); return; }
    if (bform.type === "percent" && bform.value > 100){ flash("Percent cannot be over 100."); return; }
    await C.setBundle({id: bform.id || "bundle_" + Date.now(), name, type: bform.type, value: bform.value, items, ...(bform.img ? {img: bform.img} : {})});
    flash(name + " saved."); bform = null; route();
  }),
  delbundle: guard(el => confirm("Delete this bundle?") && C.removeBundle(el.dataset.id)),
  seedbundles: guard(async () => {
    await C.setBundle({id: "bundle_1", name: "Back-to-School Essentials", type: "fixed", value: 55, items: [{id:1, qty:1}, {id:2, qty:1}, {id:3, qty:1}]});
    await C.setBundle({id: "bundle_2", name: "Summer Bundle", type: "percent", value: 10, items: [{id:4, qty:1}, {id:5, qty:1}]});
  }),
  copysum: async () => { flash(await copyText(offerText()) ? "Summary copied. Paste it in a message." : "Could not copy. Please try again."); },
  toreg: () => { regMode = true; renderAuth(); }, tolog: () => { regMode = false; renderAuth(); },
  install: installApp,
  login: doLogin, register: doRegister, logout: () => C.logOut(),
  add: el => { const p = prod(el.dataset.id); if (!p || p.stock <= 0){ flash("Out of stock."); return; } if (need(p.id) >= p.stock){ flash("Insufficient stock: only " + p.stock + " " + p.name + " available."); renderOrderParts(); return; } cart[p.id] = (cart[p.id] || 0) + 1; if (p.stock - cart[p.id] <= LOW) flash("Low stock: only " + (p.stock - cart[p.id]) + " " + p.name + " left."); renderOrderParts(); },
  inc: el => ACT.add(el),
  dec: el => { const id = el.dataset.id; cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; renderOrderParts(); },
  clearcart: () => { cart = {}; cartBundles = {}; activeDisc = null; bundleName = ""; note = ""; renderOrderParts(); },
  place: guard(place),
  status: guard(el => setStatus(orders.find(o => o.id === el.dataset.id), el.dataset.s)),
  delorder: guard(el => confirm("Delete this order?") && C.removeOrder(el.dataset.id)),
  addprod: guard(addProd),
  addstock: guard(el => { const p = prod(el.dataset.id); return C.setProduct({...p, stock: p.stock + +el.dataset.n}); }),
  delprod: guard(el => { const p = prod(el.dataset.id); return confirm("Delete " + p.name + "?") && C.removeProduct(p.id); }),
  rmpic: guard(el => { const {img, ...p} = prod(el.dataset.id); return C.setProduct(p); }),
  seed: guard(async () => { for (const p of SEED) await C.setProduct(p); }),
  catfilter: el => { catFilter = el.dataset.id; renderOrderParts(); },
  addcat: guard(async () => {
    const name = $("cn").value.trim(), file = $("cf").files[0];
    if (!name){ flash("Enter a category name."); return; }
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())){ flash("That category already exists."); return; }
    const c = {id: "category_" + Date.now(), name, active: true, order: Date.now()};
    if (file){ try { c.img = await toDataUrl(file, 200); } catch (e) { flash("Picture could not be used. Category added without it."); } }
    await C.setCategory(c); flash(name + " added."); }),
  seedcats: guard(async () => {
    const stamp = Date.now(), made = [];
    for (let i = 0; i < DEFAULT_CATS.length; i++){ const c = {id: "category_" + (stamp + i), name: DEFAULT_CATS[i][0], em: DEFAULT_CATS[i][1], active: true, order: stamp + i}; made.push(c); await C.setCategory(c); }
    const guess = {"notebook": "Notebooks & Paper", "ballpen set": "Writing Tools", "backpack": "Bags & Backpacks", "water bottle": "Drinkware & Lunch", "lunch box": "Drinkware & Lunch", "calculator": "Calculators & Gadgets"};
    for (const p of products){ const c = !p.cat && made.find(m => m.name === guess[p.name.toLowerCase()]); if (c) await C.setProduct({...p, cat: c.id}); }
    flash("10 categories added."); }),
  rmcpic: guard(el => { const {img, ...c} = catOf(el.dataset.id); return C.setCategory(c); }),
  delcat: guard(async el => { const c = catOf(el.dataset.id), used = products.filter(p => p.cat === c.id);
    if (!confirm("Delete " + c.name + "?" + (used.length ? " Its " + used.length + " product(s) will become uncategorized." : ""))) return;
    for (const p of used){ const {cat, ...rest} = p; await C.setProduct(rest); }
    await C.removeCategory(c.id); flash(c.name + " deleted."); }),
  savedisc: guard(async () => {
    const type = $("dtype").value, value = parseFloat($("dval").value);
    if (isNaN(value) || value < 0 || (type === "percent" && value > 100)){ flash("Enter a valid discount."); return; }
    await C.setDiscount({type, value}); flash("Discount saved.");
  }),
  saveabout: guard(async () => {
    const o = {description: $("ab_description").value.trim()}; for (const k of ["owner","contact","facebookAccount","facebookPage","address"]) o[k] = $("ab_" + k).value.trim();
    await C.setAbout(o); flash("Saved.");
  })
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.tagName === "A") e.preventDefault();
  ACT[el.dataset.act]?.(el);
});
document.addEventListener("input", e => { const t = e.target; if (bform){ if (t.id === "bfn") bform.name = t.value; if (t.id === "bft") bform.type = t.value; if (t.id === "bfv") bform.value = Math.max(0, parseFloat(t.value) || 0); if (t.dataset.bq) bform.qty[t.dataset.bq] = Math.max(0, parseInt(t.value, 10) || 0); }
  if (e.target.id === "bn") bundleName = e.target.value; if (e.target.id === "note") note = e.target.value; });
document.addEventListener("keydown", e => { if (e.key === "Enter" && !regMode && ["lemail", "lpw"].includes(e.target.id)) doLogin();
  if (e.key === "Enter" && e.target.id === "cin") ACT.chatsend(); if (e.key === "Enter" && e.target.id === "ain") ACT.adminsend(); });
document.addEventListener("change", guard(async e => {
  const t = e.target;
  if (t.id === "arange"){ aRange = +t.value; route(); return; }
  if (t.dataset.cname){ const c = catOf(t.dataset.cname), name = t.value.trim();
    if (!name){ t.value = c.name; flash("A category needs a name."); return; }
    if (categories.some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())){ t.value = c.name; flash("That name is already used."); return; }
    await C.setCategory({...c, name}); flash("Renamed."); return; }
  if (t.dataset.cact){ const c = catOf(t.dataset.cact); await C.setCategory({...c, active: t.checked}); flash(c.name + (t.checked ? " is now visible to customers." : " is now hidden from customers.")); return; }
  if (t.dataset.cpic && t.files[0]){ const c = catOf(t.dataset.cpic); try { await C.setCategory({...c, img: await toDataUrl(t.files[0], 200)}); } catch (e) { flash("Picture could not be used."); } return; }
  if (t.dataset.f){ const p = prod(t.dataset.id); let v = t.value;
    if (t.dataset.f === "cat"){ const {cat, ...rest} = p; await C.setProduct(v ? {...rest, cat: v} : rest); return; }
    if (t.dataset.f === "price") v = Math.max(0, parseFloat(v) || 0); else if (t.dataset.f === "stock") v = Math.max(0, parseInt(v, 10) || 0); else v = v.trim() || p.name;
    await C.setProduct({...p, [t.dataset.f]: v}); }
  else if (t.dataset.bpic && t.files[0] && bform){ try { bform.img = await toDataUrl(t.files[0], 480); route(); } catch (e) { flash("Photo could not be used."); } }
  else if (t.dataset.pic && t.files[0]){ const p = prod(t.dataset.pic); await C.setProduct({...p, img: await toDataUrl(t.files[0])}); }
}));

// ---------- start ----------
if (!C || !C.configured){ $("boot").textContent = C ? "Cloud is not set up yet. Fill in cloud.js first." : "Cannot reach the cloud. Check your internet and refresh."; }
else { C.onUser(handleUser); }
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
