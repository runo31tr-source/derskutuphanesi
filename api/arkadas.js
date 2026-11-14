// Ders Kütüphanesi – Kullanıcı adıyla arkadaş bulma (Vercel sunucu fonksiyonu)
// Çalışması için bir Upstash Redis veritabanı gerekir (Vercel > Storage > Upstash for Redis, ücretsiz plan).
// Bağlanınca Vercel şu değişkenleri kendisi ekler: KV_REST_API_URL ve KV_REST_API_TOKEN
// (ya da UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN).
// Kısa kod: 6 haneli, 15 dakika geçerli; süre bitince kendiliğinden silinir.
// Güvenlik: Sadece tam kullanıcı adıyla arama yapılır (listeleme ya da kısmi arama yok),
// yalnızca takma ad, avatar ve çalışma özeti saklanır; mesajlaşma yoktur.
const crypto = require("crypto");
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LIMIT = new Map();
const KEEP = 60 * 60 * 24 * 180; // 180 gün kullanılmayan kullanıcı adları silinir
const BAD = ["admin", "yonetici", "ogretmen", "derskutuphanesi", "destek", "moderator"];

async function cmd(...args) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOK, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error("db");
  return (await r.json()).result;
}
const norm = u => String(u || "").trim().toLowerCase();
const ok = u => /^[a-z0-9_]{3,16}$/.test(u) && !BAD.includes(u);
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const num = v => Math.max(0, Math.min(1e7, Math.round(+v || 0)));
function clean(c) {
  c = c || {};
  return { id: String(c.id || "").slice(0, 12), n: String(c.n || "Arkadaş").slice(0, 20), av: String(c.av || "🙂").slice(0, 4),
    a: num(c.a), c: num(c.c), k: num(c.k), s: num(c.s), r: num(c.r), w: num(c.w), d: String(c.d || "").slice(0, 10) };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOK) return req.method === "GET" && !(req.query && req.query.u) ? res.status(200).json({ ok: false }) : res.status(503).json({ error: "not-configured" });

  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const now = Date.now(), r = LIMIT.get(ip) || { n: 0, t: now };
  if (now - r.t > 3600e3) { r.n = 0; r.t = now; }
  r.n++; LIMIT.set(ip, r);
  if (r.n > 120) return res.status(429).json({ error: "limit" });

  try {
    if (req.method === "GET") {
      const k = String((req.query && req.query.k) || "").replace(/\D/g, "");
      if (k) {
        if (k.length !== 6) return res.status(200).json({ card: null });
        const v = await cmd("GET", "dk:k:" + k);
        return res.status(200).json({ card: v ? clean(JSON.parse(v)) : null });
      }
      const u = norm(req.query && req.query.u);
      if (!u) return res.status(200).json({ ok: true });
      if (!ok(u)) return res.status(200).json({ card: null });
      const v = await cmd("GET", "dk:u:" + u);
      if (!v) return res.status(200).json({ card: null });
      const o = JSON.parse(v);
      return res.status(200).json({ card: clean(o.card) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    b = b || {};
    if (b.op === "code") { // 15 dakika geçerli 6 haneli kısa arkadaş kodu
      for (let i = 0; i < 8; i++) {
        const k = String(crypto.randomInt(100000, 1000000));
        const r2 = await cmd("SET", "dk:k:" + k, JSON.stringify(clean(b.card)), "NX", "EX", 900);
        if (r2 === "OK") return res.status(200).json({ k, sure: 900 });
      }
      return res.status(503).json({ error: "busy" });
    }
    const u = norm(b.u), secret = String(b.secret || "");
    if (!ok(u) || secret.length < 10) return res.status(400).json({ error: "bad" });
    const key = "dk:u:" + u, cur = await cmd("GET", key), h = sha(secret);
    if (cur) { const o = JSON.parse(cur); if (o.h !== h) return res.status(409).json({ error: "taken" }); }
    if (b.op === "delete") { await cmd("DEL", key); return res.status(200).json({ ok: true }); }
    if (b.op === "claim" || b.op === "update") {
      if (b.op === "update" && !cur) return res.status(404).json({ error: "none" });
      await cmd("SET", key, JSON.stringify({ h, card: clean(b.card) }), "EX", KEEP);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "op" });
  } catch (e) {
    return res.status(502).json({ error: "db" });
  }
};
