import { XMLParser } from "fast-xml-parser";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const SOURCES_FILE = process.env.SOURCES_FILE || "sources.json";
const MAX_AGE_DAYS = 30;
const SITE_URL = process.env.URL || "";

const CATS = [
  ["Yarışma", /hackathon|datathon|ideathon|yarışma|competition|challenge|contest|pitch/i],
  ["Hibe/Destek", /hibe|destek|grant|funding|fellowship|scholarship|burs|bigg|kosgeb|tübitak|teknogirişim/i],
  ["Program/Eğitim", /hızlandır|kuluçka|accelerator|incubator|bootcamp|eğitim|workshop|course|mentor|başvuru|applications? open|apply/i],
  ["Etkinlik", /etkinlik|zirve|konferans|summit|conference|meetup|webinar|demo day|fuar|expo/i],
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const str = (x) => (x == null ? "" : typeof x === "object" ? String(x["#text"] ?? "") : String(x));
const clean = (s) => str(s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function linkOf(e) {
  if (typeof e.link === "string") return e.link;
  const links = arr(e.link);
  const alt = links.find((l) => l["@_rel"] === "alternate") || links[0];
  if (alt) return alt["@_href"] || str(alt);
  return str(e.guid);
}

function parseFeed(xml) {
  const o = parser.parse(xml);
  const entries = arr(o?.rss?.channel?.item).length ? arr(o.rss.channel.item)
    : arr(o?.feed?.entry).length ? arr(o.feed.entry)
    : arr(o?.["rdf:RDF"]?.item);
  return entries.map((e) => {
    const d = new Date(str(e.pubDate || e.published || e.updated || e["dc:date"]));
    return {
      title: clean(e.title),
      link: linkOf(e).trim(),
      summary: clean(e.description || e.summary || e.content || e["content:encoded"]).slice(0, 240),
      date: isNaN(d) ? new Date() : d,
      pub: clean(e.source),
    };
  });
}

function urlOf(s) {
  if (s.gnews) {
    const { q, lang } = s.gnews;
    const [hl, gl] = lang === "tr" ? ["tr", "TR"] : ["en", "US"];
    return `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:14d")}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl}`;
  }
  return s.url;
}

async function load(s) {
  const url = urlOf(s);
  const xml = url.startsWith("file:")
    ? await readFile(url.slice(5), "utf8")
    : await (await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (girisim-radar RSS aggregator)" },
        signal: AbortSignal.timeout(15000),
      })).text();
  return parseFeed(xml);
}

const baseSrc = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
const siteBase = process.env.SITE_URL || process.env.URL;
const remote = async (kind) => {
  if (!siteBase) return [];
  try {
    const r = await fetch(`${siteBase}/api/${kind}`, { headers: { "x-team-code": process.env.TEAM_CODE || "" }, signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.json() : [];
  } catch { return []; }
};
const custom = (await remote("sources")).map((c) => ({ name: c.name, url: c.url, region: c.region, custom: true }));
const down = {};
for (const v of await remote("votes")) if (Date.now() - new Date(v.createdAt) < 7 * 864e5) down[v.feed] = (down[v.feed] || 0) + 1;
const status = [...baseSrc, ...custom].map((s) => ({ name: s.name, region: s.region, custom: !!s.custom, votes: down[s.name] || 0, blocked: (down[s.name] || 0) > 4 }));
status.filter((s) => s.blocked).forEach((s) => console.log(`⛔ ${s.name}: 7 günde ${s.votes} ▼, atlandı`));
await mkdir("data", { recursive: true });
await writeFile("data/sources-status.json", JSON.stringify(status));
const sources = [...baseSrc, ...custom].filter((s) => !status.find((x) => x.name === s.name)?.blocked);
const settled = await Promise.allSettled(sources.map(load));
const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
const seen = new Set();
const items = [];

settled.forEach((r, i) => {
  const s = sources[i];
  if (r.status === "rejected") { console.warn(`✗ ${s.name}: ${r.reason?.message || r.reason}`); return; }
  let kept = 0;
  for (const it of r.value) {
    if (!it.title || !it.link || it.date.getTime() < cutoff) continue;
    const cat = (CATS.find(([, re]) => re.test(it.title + " " + it.summary)) || [])[0];
    if (s.filter && !cat) continue;
    const key = it.title.toLowerCase().replace(/\s+-\s+[^-]+$/, "").replace(/\W+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title: it.title, link: it.link, summary: it.summary, date: it.date.toISOString(),
      source: it.pub || s.name, feed: s.name, region: s.region, cat: cat || "Diğer" });
    kept++;
  }
  console.log(`✓ ${s.name}: ${kept} öğe`);
});

const TAGS = {
  hackathon: /hackathon|datathon|ideathon/i,
  ai: /yapay zeka|artificial intelligence|\bAI\b|\bLLM|machine learning|makine öğren/i,
  "data-science": /veri bilim|data scien|datathon|istatistik|analytics/i,
  student: /öğrenci|üniversit|student|campus|genç/i,
  free: /ücretsiz|\bfree\b/i,
  online: /online|çevrimiçi|virtual|webinar/i,
  istanbul: /istanbul|i̇stanbul/i,
  ankara: /ankara/i,
  tubitak: /tübitak|tubitak|bigg|teknogirişim/i,
  kosgeb: /kosgeb/i,
  grant: /hibe|grant|fellowship|\bburs\b|scholarship/i,
  accelerator: /hızlandır|accelerator|incubator|kuluçka/i,
  fintech: /fintech|finans/i,
  gaming: /oyun|gaming|\bgame/i,
  deadline: /son başvuru|deadline|applications? (open|close)/i,
};
const CAT_TAG = { "Yarışma": "competition", "Hibe/Destek": "grant", "Program/Eğitim": "program", "Etkinlik": "event" };
const iso = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, "0")}`;
};

await mkdir("data/items", { recursive: true });
const all = new Map();
for (const f of (await readdir("data/items")).filter((f) => f.endsWith(".json")))
  for (const it of JSON.parse(await readFile(`data/items/${f}`, "utf8"))) all.set(it.id, it);

let added = 0;
for (const i of items) {
  const id = createHash("sha1").update(i.link).digest("hex").slice(0, 10);
  if (all.has(id)) continue;
  const text = `${i.title} ${i.summary}`;
  const tags = [...new Set([CAT_TAG[i.cat], i.region.toLowerCase(), ...Object.keys(TAGS).filter((t) => TAGS[t].test(text))].filter(Boolean))];
  all.set(id, { id, ...i, tags, week: iso(new Date(i.date)) });
  added++;
}

const byMonth = {};
for (const it of all.values()) (byMonth[it.date.slice(0, 7)] ||= []).push(it);
for (const [m, list] of Object.entries(byMonth))
  await writeFile(`data/items/${m}.json`, JSON.stringify(list.sort((a, b) => b.date.localeCompare(a.date)), null, 1));
await writeFile("data/manifest.json", JSON.stringify({ months: Object.keys(byMonth).sort().reverse(), updatedAt: new Date().toISOString() }));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const latest = [...all.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
await writeFile("data/feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Girişim Radarı</title><link>${esc(SITE_URL || "https://example.netlify.app")}</link><description>Girişim ekosistemi: yarışma, hibe, program, etkinlik</description>
${latest.map((i) => `<item><title>${esc(`[${i.cat}] ${i.title}`)}</title><link>${esc(i.link)}</link><guid isPermaLink="false">${i.id}</guid><pubDate>${new Date(i.date).toUTCString()}</pubDate><description>${esc(i.summary)}</description></item>`).join("\n")}
</channel></rss>`);
console.log(`${added} yeni öğe, arşivde toplam ${all.size}`);
