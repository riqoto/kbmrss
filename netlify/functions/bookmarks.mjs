import { getStore } from "@netlify/blobs";
export const config = { path: "/api/bookmarks" };

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const key = (id, user) => `${id}~${encodeURIComponent(String(user).trim().toLowerCase())}`;

export default async (req) => {
  const code = process.env.TEAM_CODE;
  if (code && req.headers.get("x-team-code") !== code) return json({ error: "bad team code" }, 401);
  const store = getStore("bookmarks");
  const q = new URL(req.url).searchParams;

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const rows = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    return json(rows.filter(Boolean));
  }
  if (req.method === "POST") {
    const { itemId, user } = await req.json();
    if (!/^[a-f0-9]{10}$/.test(itemId || "") || !user?.trim()) return json({ error: "itemId and user required" }, 400);
    const b = { itemId, user: user.trim().slice(0, 40), createdAt: new Date().toISOString() };
    await store.setJSON(key(itemId, b.user), b);
    return json(b, 201);
  }
  if (req.method === "DELETE") {
    const id = q.get("itemId"), user = q.get("user");
    if (!id || !user) return json({ error: "itemId and user required" }, 400);
    await store.delete(key(id, user));
    return json({ ok: true });
  }
  return json({ error: "method not allowed" }, 405);
};
