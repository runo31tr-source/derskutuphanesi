// Ders Kütüphanesi – Sorun Bildir köprüsü (Vercel sunucu fonksiyonu)
// Bildirimleri şu iki yoldan biriyle sana ulaştırır (Vercel > Settings > Environment Variables):
//   FORMSPREE_ID        -> formspree.io'daki formunun kimliği (örn. xyzabcd). Bildirimler e-postana gelir.
//   DISCORD_WEBHOOK_URL -> Discord kanalının webhook adresi. Bildirimler kanala mesaj olarak düşer.
// İkisi de yoksa site, kullanıcıya metni kopyalama seçeneği gösterir.
const LIMIT = new Map();
const clip = (v, n) => String(v || "").replace(/\s+$/g, "").slice(0, n);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const fs = process.env.FORMSPREE_ID, dw = process.env.DISCORD_WEBHOOK_URL;
  if (req.method === "GET") return res.status(200).json({ ok: !!(fs || dw) });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!fs && !dw) return res.status(503).json({ error: "not-configured" });

  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const now = Date.now(), r = LIMIT.get(ip) || { n: 0, t: now };
  if (now - r.t > 3600e3) { r.n = 0; r.t = now; }
  r.n++; LIMIT.set(ip, r);
  if (r.n > 10) return res.status(429).json({ error: "limit" });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (b["bot-field"]) return res.status(200).json({ ok: true }); // bot tuzağı
  const d = { tur: clip(b.tur, 80), konu: clip(b.konu, 200), aciklama: clip(b.aciklama, 2000), iletisim: clip(b.iletisim, 120), sayfa: clip(b.sayfa, 80), surum: clip(b.surum, 10) };
  if (!d.aciklama.trim()) return res.status(400).json({ error: "empty" });

  try {
    let ok = false;
    if (fs) {
      const r1 = await fetch("https://formspree.io/f/" + encodeURIComponent(fs), {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ _subject: "Ders Kütüphanesi – Sorun Bildirimi: " + d.tur, ...d })
      });
      ok = r1.ok;
    }
    if (!ok && dw) {
      const text = `⚠️ **Yeni sorun bildirimi** (sürüm ${d.surum || "?"})\n**Tür:** ${d.tur}\n**Konu:** ${d.konu || "-"}\n**Açıklama:** ${d.aciklama}\n**İletişim:** ${d.iletisim || "-"}\n**Sayfa:** ${d.sayfa || "-"}`;
      const r2 = await fetch(dw, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }) });
      ok = r2.ok;
    }
    return ok ? res.status(200).json({ ok: true }) : res.status(502).json({ error: "send" });
  } catch (e) {
    return res.status(502).json({ error: "send" });
  }
};
