import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
export const config = { path: ["/api/bookmarks", "/api/votes", "/api/sources"] };

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const enc = (s) => encodeURIComponent(String(s).trim().toLowerCase());

export default async (req) => {
  const code = process.env.TEAM_CODE;
  if (code && req.headers.get("x-team-code") !== code) return json({ error: "bad team code" }, 401);
  const url = new URL(req.url), kind = url.pathname.split("/").pop();
  const store = getStore(kind);
  const key = (o) => (kind === "sources" ? createHash("sha1").update(o.url).digest("hex").slice(0, 16) : `${o.itemId}~${enc(o.user)}`);

  if (req.method === "GET") {
    const { blobs } = await store.list();
    return json((await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean));
  }
  if (req.method === "POST") {
    const b = await req.json();
    const user = String(b.user || "").trim().slice(0, 40);
    if (!user) return json({ error: "user required" }, 400);
    let rec = { user, createdAt: new Date().toISOString() };
    if (kind === "sources") {
      let u; try { u = new URL(b.url); } catch {}
      if (!u || !/^https?:$/.test(u.protocol)) return json({ error: "valid http(s) url required" }, 400);
      rec = { ...rec, url: u.href, name: String(b.name || u.hostname).trim().slice(0, 60), region: b.region === "Global" ? "Global" : "TR" };
    } else {
      if (!/^[a-f0-9]{10}$/.test(b.itemId || "")) return json({ error: "itemId required" }, 400);
      rec = { ...rec, itemId: b.itemId };
      if (kind === "votes") rec.feed = String(b.feed || "").slice(0, 80);
    }
    await store.setJSON(key(rec), rec);
    return json(rec, 201);
  }
  if (req.method === "DELETE") {
    const q = url.searchParams;
    const o = kind === "sources" ? { url: q.get("url") } : { itemId: q.get("itemId"), user: q.get("user") };
    if (Object.values(o).some((v) => !v)) return json({ error: "missing params" }, 400);
    await store.delete(key(o));
    return json({ ok: true });
  }
  return json({ error: "method not allowed" }, 405);
};
