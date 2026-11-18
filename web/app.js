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

let items = [], marks = [], votes = [], srcs = [];
let me = JSON.parse(localStorage.getItem("radar.me") || "null"); // { name, code }
const filt = { region: "", cat: "" };
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const TAG_TR = { competition: "yarışma", grant: "hibe", program: "program", event: "etkinlik", student: "öğrenci", free: "ücretsiz", "data-science": "veribilimi", ai: "yapayzeka", accelerator: "hızlandırıcı", deadline: "sonbaşvuru", gaming: "oyun", tr: "türkiye", global: "yurtdışı" };
const tl = (t) => TAG_TR[t] || t;
const fd = (d) => new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
const wl = (w) => w.replace(/^(\d+)-W(\d+)$/, "$1 · $2. hafta");
const ml = (m) => new Date(m + "-01").toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

/* ---------- API ---------- */
const api = async (kind, method, qs = "", body) => {
  const r = await fetch(`/api/${kind}` + qs, {
    method,
    headers: { "content-type": "application/json", "x-team-code": me?.code || "" },
    body: body && JSON.stringify(body),
  });
  if (r.status === 401) { me = null; localStorage.removeItem("radar.me"); renderMe(); throw new Error("Takım kodu yanlış"); }
  if (!r.ok) throw new Error("API hatası " + r.status);
  return r.json();
};
const loadMarks = async () => {
  try { [marks, votes] = await Promise.all([api("bookmarks", "GET"), api("votes", "GET")]); } catch { marks = []; votes = []; }
};

/* ---------- identity modal ---------- */
const ask = () => new Promise((res) => {
  const name = h("input", { class: "bui-input", placeholder: "Adın" });
  const code = h("input", { class: "bui-input", type: "password", placeholder: "Takım kodu (varsa)" });
  const rem = h("input", { type: "checkbox", checked: true });
  const close = (v) => { box.remove(); res(v); };
  const ok = () => {
    if (!name.value.trim()) return name.focus();
    const m = { name: name.value.trim(), code: code.value };
    if (rem.checked) localStorage.setItem("radar.me", JSON.stringify(m));
    close(m);
  };
  const box = h("div", { style: "position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:200" },
    h("div", { class: "bui-card", style: "width:min(320px,92vw)" },
      h("h3", { class: "bui-section-title" }, "Kim kaydediyor?"),
      h("div", { class: "bui-field" }, h("label", { class: "bui-label" }, "İsim"), name),
      h("div", { class: "bui-field" }, h("label", { class: "bui-label" }, "Takım kodu"), code),
      h("label", { class: "bui-label", style: "display:flex;gap:6px;margin-bottom:12px" }, rem, "Beni hatırla"),
      h("div", { style: "display:flex;gap:8px;justify-content:flex-end" },
        h("button", { class: "bui-btn", onclick: () => close(null) }, "Vazgeç"),
        h("button", { class: "bui-btn bui-btn-primary", onclick: ok }, "Devam"))));
  name.addEventListener("keydown", (e) => e.key === "Enter" && ok());
  document.body.append(box); name.focus();
});
const renderMe = () => { document.querySelector("#me").textContent = me ? me.name : "Giriş yap"; };
const ensureMe = async () => {
  if (!me) { me = await ask(); renderMe(); if (me) await loadMarks(); }
  return me;
};

const act = async (kind, it) => {
  if (!(await ensureMe())) return;
  const mine = (kind === "votes" ? votes : marks).some((m) => m.itemId === it.id && same(m.user, me.name));
  try {
    if (mine) await api(kind, "DELETE", `?itemId=${it.id}&user=${encodeURIComponent(me.name)}`);
    else await api(kind, "POST", "", { itemId: it.id, user: me.name, feed: it.feed || it.source });
    await loadMarks();
  } catch (e) { alert(e.message); }
  const y = scrollY; route(); scrollTo(0, y);
};

const OVERLAY = "position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:200";
const addRss = async () => {
  if (!(await ensureMe())) return;
  const url = h("input", { class: "bui-input", placeholder: "https://site.com/feed" });
  const name = h("input", { class: "bui-input", placeholder: "Kaynağın adı" });
  const region = h("select", { class: "bui-select" }, h("option", { value: "TR" }, "Türkiye"), h("option", { value: "Global" }, "Yurt dışı"));
  const msg = h("div", { class: "bui-alert bui-alert-error bui-hidden", style: "margin-bottom:12px" });
  const ok = async () => {
    msg.classList.add("bui-hidden");
    try {
      const u = new URL(url.value.trim());
      if (!/^https?:$/.test(u.protocol)) throw 0;
      await api("sources", "POST", "", { url: u.href, name: name.value.trim() || u.hostname, region: region.value, user: me.name });
      box.remove();
      alert("Eklendi! İçerikler bir sonraki çekmede (her sabah 08:00) gelir.");
    } catch (e) { msg.textContent = e?.message || "Geçerli bir adres gir (https://...)"; msg.classList.remove("bui-hidden"); }
  };
  const box = h("div", { style: OVERLAY },
    h("div", { class: "bui-card", style: "width:min(360px,92vw)" },
      h("h3", { class: "bui-section-title" }, "RSS kaynağı ekle"),
      msg,
      h("div", { class: "bui-field" }, h("label", { class: "bui-label" }, "RSS adresi"), url),
      h("div", { class: "bui-field" }, h("label", { class: "bui-label" }, "Ad"), name),
      h("div", { class: "bui-field" }, h("label", { class: "bui-label" }, "Bölge"), region),
      h("div", { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:12px" },
        h("button", { class: "bui-btn", onclick: () => box.remove() }, "Vazgeç"),
        h("button", { class: "bui-btn bui-btn-primary", onclick: ok }, "Ekle"))));
  document.body.append(box); url.focus();
};

/* ---------- views ---------- */
const card = (it) => {
  const who = marks.filter((m) => m.itemId === it.id);
  const mine = me && who.some((m) => same(m.user, me.name));
  const dn = votes.filter((v) => v.itemId === it.id);
  const dv = me && dn.some((v) => same(v.user, me.name));
  return h("div", { class: "contest-card", style: dv ? "opacity:.55" : null },
    h("div", {},
      h("a", { class: "contest-name", href: it.link, target: "_blank", rel: "noopener" }, it.title),
      h("div", { class: "contest-meta" }, `${it.source} · ${fd(it.date)} · `, link(`/week/${it.week}`, wl(it.week))),
      who.length ? h("div", { class: "contest-meta" }, "★ " + who.map((m) => m.user).join(", ")) : null,
      h("div", { class: "prob-tags", style: "margin-top:6px" }, it.tags.map((t) => link(`/tag/${t}`, h("span", { class: "prob-tag" }, "#" + tl(t)))))),
    h("div", { style: "display:flex;gap:8px;align-items:center;flex-shrink:0" },
      who.length ? h("span", { class: "bui-badge", "data-tooltip": who.map((m) => m.user).join(", ") }, `${who.length} kişi kaydetti`) : null,
      h("button", { class: "bui-btn bui-btn-sm" + (dv ? " bui-btn-primary" : ""), "data-tooltip": "Bu kaynak kalitesiz", onclick: () => act("votes", it) }, "▼" + (dn.length ? " " + dn.length : "")),
      h("button", { class: "bui-btn bui-btn-sm" + (mine ? " bui-btn-primary" : ""), onclick: () => act("bookmarks", it) }, mine ? "★ Kaydedildi" : "☆ Kaydet")));
};

const sourcesView = () => app.replaceChildren(
  h("div", { class: "page-header" }, h("h1", { class: "page-title" }, "Kaynaklar"), h("span", { class: "bui-badge" }, srcs.length + " kaynak")),
  h("div", { class: "table-box bui-table-wrap" }, h("table", { class: "bui-table" },
    h("thead", {}, h("tr", {}, ["Kaynak", "Bölge", "Son 7 gün ▼", "Durum"].map((t) => h("th", {}, t)))),
    h("tbody", {}, srcs.map((x) => h("tr", {},
      h("td", {}, x.name, x.custom ? h("span", { class: "bui-badge", style: "margin-left:6px" }, "eklenen") : null),
      h("td", {}, x.region === "TR" ? "Türkiye" : "Yurt dışı"),
      h("td", {}, String(x.votes)),
      h("td", {}, h("span", { class: "bui-badge " + (x.blocked ? "bui-badge-warn" : "bui-badge-active") }, x.blocked ? "Engellendi" : "Aktif"))))))),
  h("p", { class: "contest-meta", style: "margin-top:10px" }, "Bir kaynak 7 gün içinde 4'ten fazla ▼ alırsa çekilmez; oylar eskidikçe yeniden açılır. Durum günlük çekmede güncellenir."));

const empty = () => h("div", { class: "bui-alert" }, "Burada henüz bir şey yok.");

const view = (title, list) => {
  const sel = (key, opts) => h("select", { class: "bui-select", onchange: (e) => { filt[key] = e.target.value; route(); } },
    opts.map(([v, l]) => h("option", { value: v, selected: filt[key] === v }, l)));
  const shown = list.filter((i) => (!filt.region || i.region === filt.region) && (!filt.cat || i.tags.includes(filt.cat)));
  app.replaceChildren(
    h("div", { class: "page-header" }, h("h1", { class: "page-title" }, title), h("span", { class: "bui-badge" }, shown.length + " öğe")),
    h("div", { class: "filter-bar" },
      sel("region", [["", "Tüm bölgeler"], ["TR", "Türkiye"], ["Global", "Yurt dışı"]]),
      sel("cat", [["", "Tüm türler"], ["competition", "Yarışmalar"], ["grant", "Hibeler"], ["program", "Programlar"], ["event", "Etkinlikler"]])),
    ...(shown.length ? shown.map(card) : [empty()]));
};

const archive = () => {
  const count = (fn) => items.flatMap(fn).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {});
  const block = (title, c, base, keys) => [
    h("div", { class: "section-label" }, title),
    h("div", { class: "table-box", style: "padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px" },
      keys.map((k) => link(`/${base}/${k}`, h("span", { class: "bui-badge" }, `${base === "tag" ? tl(k) : base === "week" ? wl(k) : base === "month" ? ml(k) : k} · ${c[k]}`)))),
    h("div", { class: "gap" }),
  ];
  const m = count((i) => [i.date.slice(0, 7)]), w = count((i) => [i.week]), t = count((i) => i.tags);
  const rev = (c) => Object.keys(c).sort().reverse();
  app.replaceChildren(h("h1", { class: "page-title", style: "margin-bottom:14px" }, "Arşiv"),
    ...block("Aylar", m, "month", rev(m)), ...block("Haftalar", w, "week", rev(w)),
    ...block("Etiketler", t, "tag", Object.keys(t).sort((a, b) => t[b] - t[a])));
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
    h("div", { class: "page-header" }, h("h1", { class: "page-title" }, "Yer imleri"), h("div", { style: "display:flex;gap:6px" }, tab("user", "Kişiye göre"), tab("week", "Haftaya göre"))),
    ...(keys.length ? keys.flatMap((k) => [h("div", { class: "section-label" }, mode === "week" ? "Kaydedilen hafta: " + wl(k) : k), ...groups[k].map(card), h("div", { class: "gap" })]) : [empty()]));
};

/* ---------- router ---------- */
const go = (p) => { history.pushState({}, "", p); route(); scrollTo(0, 0); };
function route() {
  const u = new URL(location.href), p = u.searchParams;
  const [a, b] = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  document.querySelectorAll(".nav-link").forEach((n) => n.classList.toggle("active", n.getAttribute("href") === "/" + (a || "")));
  if (a === "week") view(wl(b), items.filter((i) => i.week === b));
  else if (a === "month") view(ml(b), items.filter((i) => i.date.startsWith(b)));
  else if (a === "tag") view("#" + tl(b), items.filter((i) => i.tags.includes(b)));
  else if (a === "search") {
    const raw = p.get("q") || "", words = raw.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/^#/, ""));
    view("Arama: " + raw, items.filter((i) => {
      const t = `${i.title} ${i.summary} ${i.source} ${i.tags.map((t) => t + " " + tl(t)).join(" ")}`.toLowerCase();
      return words.every((w) => t.includes(w));
    }));
  } else if (a === "bookmarks") bookmarksView(p);
  else if (a === "archive") archive();
  else if (a === "sources") sourcesView();
  else view("Son 7 gün", items.filter((i) => Date.now() - new Date(i.date) < 7 * 864e5));
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
document.querySelector("#addrss").addEventListener("click", addRss);

(async () => {
  renderMe();
  try {
    const man = await (await fetch("/data/manifest.json")).json();
    items = (await Promise.all(man.months.map((m) => fetch(`/data/items/${m}.json`).then((r) => r.json())))).flat()
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch { app.textContent = "Henüz veri yok. Önce günlük çekmeyi çalıştırın."; return; }
  try { srcs = await (await fetch("/data/sources-status.json")).json(); } catch {}
  await loadMarks();
  route();
})();
