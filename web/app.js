const app = document.querySelector("#app");
const h = (tag, a = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter((k) => k != null && k !== false));
  return e;
};
const link = (href, ...kids) => h("a", { href, "data-link": true }, ...kids);
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  return y + "-W" + String(Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, "0");
};

let items = [], marks = [];
let me = JSON.parse(localStorage.getItem("radar.me") || "null"); // { name, code }
const filt = { region: "", cat: "" };
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/* ---------- API ---------- */
const api = async (method, qs = "", body) => {
  const r = await fetch("/api/bookmarks" + qs, {
    method,
    headers: { "content-type": "application/json", "x-team-code": me?.code || "" },
    body: body && JSON.stringify(body),
  });
  if (r.status === 401) { me = null; localStorage.removeItem("radar.me"); renderMe(); throw new Error("Wrong team code"); }
  if (!r.ok) throw new Error("API error " + r.status);
  return r.json();
};
const loadMarks = async () => { try { marks = await api("GET"); } catch { marks = []; } };

/* ---------- identity modal ---------- */
const ask = () => new Promise((res) => {
  const name = h("input", { class: "bui-input", placeholder: "Your name" });
  const code = h("input", { class: "bui-input", type: "password", placeholder: "Team code (if set)" });
  const rem = h("input", { type: "checkbox", checked: true });
  const close = (v) => { box.remove(); res(v); };
  const ok = () => {
    if (!name.value.trim()) return name.focus();
    const m = { name: name.value.trim(), code: code.value };
    if (rem.checked) localStorage.setItem("radar.me", JSON.stringify(m));
    close(m);
  };
  const box = h("div", { style: "position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:200" },
    h("div", { class: "bui-card", style: "width:320px" },
      h("h3", { class: "bui-section-title" }, "Who's saving this?"),
      h("div", { class: "bui-field" }, h("label", { class: "bui-label" }, "Name"), name),
      h("div", { class: "bui-field" }, h("label", { class: "bui-label" }, "Team code"), code),
      h("label", { class: "bui-label", style: "display:flex;gap:6px;margin-bottom:12px" }, rem, "Remember me"),
      h("div", { style: "display:flex;gap:8px;justify-content:flex-end" },
        h("button", { class: "bui-btn", onclick: () => close(null) }, "Cancel"),
        h("button", { class: "bui-btn bui-btn-primary", onclick: ok }, "Continue"))));
  name.addEventListener("keydown", (e) => e.key === "Enter" && ok());
  document.body.append(box); name.focus();
});
const renderMe = () => { document.querySelector("#me").textContent = me ? me.name : "Sign in"; };
const ensureMe = async () => {
  if (!me) { me = await ask(); renderMe(); if (me) await loadMarks(); }
  return me;
};

const toggle = async (it) => {
  if (!(await ensureMe())) return;
  const mine = marks.some((m) => m.itemId === it.id && same(m.user, me.name));
  try {
    if (mine) await api("DELETE", `?itemId=${it.id}&user=${encodeURIComponent(me.name)}`);
    else await api("POST", "", { itemId: it.id, user: me.name });
    await loadMarks();
  } catch (e) { alert(e.message); }
  const y = scrollY; route(); scrollTo(0, y);
};

/* ---------- views ---------- */
const card = (it) => {
  const who = marks.filter((m) => m.itemId === it.id);
  const mine = me && who.some((m) => same(m.user, me.name));
  return h("div", { class: "contest-card" },
    h("div", {},
      h("a", { class: "contest-name", href: it.link, target: "_blank", rel: "noopener" }, it.title),
      h("div", { class: "contest-meta" }, `${it.source} · ${it.date.slice(0, 10)} · `, link(`/week/${it.week}`, it.week)),
      h("div", { class: "prob-tags", style: "margin-top:6px" }, it.tags.map((t) => link(`/tag/${t}`, h("span", { class: "prob-tag" }, "#" + t))))),
    h("div", { style: "display:flex;gap:8px;align-items:center;flex-shrink:0" },
      who.length ? h("span", { class: "bui-badge", "data-tooltip": who.map((m) => m.user).join(", ") }, `${who.length} saved`) : null,
      h("button", { class: "bui-btn bui-btn-sm" + (mine ? " bui-btn-primary" : ""), onclick: () => toggle(it) }, mine ? "★ Saved" : "☆ Save")));
};

const empty = () => h("div", { class: "bui-alert" }, "Nothing here yet.");

const view = (title, list) => {
  const sel = (key, opts) => h("select", { class: "bui-select", onchange: (e) => { filt[key] = e.target.value; route(); } },
    opts.map(([v, l]) => h("option", { value: v, selected: filt[key] === v }, l)));
  const shown = list.filter((i) => (!filt.region || i.region === filt.region) && (!filt.cat || i.tags.includes(filt.cat)));
  app.replaceChildren(
    h("div", { class: "page-header" }, h("h1", { class: "page-title" }, title), h("span", { class: "bui-badge" }, shown.length + " items")),
    h("div", { class: "filter-bar" },
      sel("region", [["", "All regions"], ["TR", "Türkiye"], ["Global", "Global"]]),
      sel("cat", [["", "All types"], ["competition", "Competitions"], ["grant", "Grants"], ["program", "Programs"], ["event", "Events"]])),
    ...(shown.length ? shown.map(card) : [empty()]));
};

const archive = () => {
  const count = (fn) => items.flatMap(fn).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {});
  const block = (title, c, base, keys) => [
    h("div", { class: "section-label" }, title),
    h("div", { class: "table-box", style: "padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px" },
      keys.map((k) => link(`/${base}/${k}`, h("span", { class: "bui-badge" }, `${k} · ${c[k]}`)))),
    h("div", { class: "gap" }),
  ];
  const m = count((i) => [i.date.slice(0, 7)]), w = count((i) => [i.week]), t = count((i) => i.tags);
  const rev = (c) => Object.keys(c).sort().reverse();
  app.replaceChildren(h("h1", { class: "page-title", style: "margin-bottom:14px" }, "Archive"),
    ...block("Months", m, "month", rev(m)), ...block("Weeks", w, "week", rev(w)),
    ...block("Tags", t, "tag", Object.keys(t).sort((a, b) => t[b] - t[a])));
};

const bookmarksView = (p) => {
  const mode = p.get("view") || "user";
  const groups = {};
  for (const m of marks) {
    const it = items.find((i) => i.id === m.itemId);
    if (it) (groups[mode === "user" ? m.user : isoWeek(new Date(m.createdAt))] ||= []).push(it);
  }
  const keys = Object.keys(groups).sort(mode === "user" ? undefined : (a, b) => b.localeCompare(a));
  const tab = (v, l) => h("button", { class: "bui-btn bui-btn-sm" + (mode === v ? " bui-btn-primary" : ""), onclick: () => go("/bookmarks?view=" + v) }, l);
  app.replaceChildren(
    h("div", { class: "page-header" }, h("h1", { class: "page-title" }, "Bookmarks"), h("div", { style: "display:flex;gap:6px" }, tab("user", "By user"), tab("week", "By week"))),
    ...(keys.length ? keys.flatMap((k) => [h("div", { class: "section-label" }, mode === "week" ? "Saved in " + k : k), ...groups[k].map(card), h("div", { class: "gap" })]) : [empty()]));
};

/* ---------- router ---------- */
const go = (p) => { history.pushState({}, "", p); route(); scrollTo(0, 0); };
function route() {
  const u = new URL(location.href), p = u.searchParams;
  const [a, b] = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  document.querySelectorAll(".nav-link").forEach((n) => n.classList.toggle("active", n.getAttribute("href") === "/" + (a || "")));
  if (a === "week") view("Week " + b, items.filter((i) => i.week === b));
  else if (a === "month") view("Month " + b, items.filter((i) => i.date.startsWith(b)));
  else if (a === "tag") view("#" + b, items.filter((i) => i.tags.includes(b)));
  else if (a === "search") {
    const raw = p.get("q") || "", words = raw.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/^#/, ""));
    view("Search: " + raw, items.filter((i) => {
      const t = `${i.title} ${i.summary} ${i.source} ${i.tags.join(" ")}`.toLowerCase();
      return words.every((w) => t.includes(w));
    }));
  } else if (a === "bookmarks") bookmarksView(p);
  else if (a === "archive") archive();
  else view("Latest · last 7 days", items.filter((i) => Date.now() - new Date(i.date) < 7 * 864e5));
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link],[data-go]");
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault(); go(a.dataset.go || a.getAttribute("href"));
});
document.querySelector("#q").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.value.trim()) go("/search?q=" + encodeURIComponent(e.target.value.trim()));
});
document.querySelector("#me").addEventListener("click", async () => { me = null; localStorage.removeItem("radar.me"); await ensureMe(); route(); });
addEventListener("popstate", route);

(async () => {
  renderMe();
  try {
    const man = await (await fetch("/data/manifest.json")).json();
    items = (await Promise.all(man.months.map((m) => fetch(`/data/items/${m}.json`).then((r) => r.json())))).flat()
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch { app.textContent = "No data yet. Run the daily fetch first."; return; }
  await loadMarks();
  route();
})();
