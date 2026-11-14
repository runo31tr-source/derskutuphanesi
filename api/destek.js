// Ders Kütüphanesi – Canlı Destek yapay zekâ köprüsü (Vercel sunucu fonksiyonu)
// Çalışması için Vercel > Settings > Environment Variables bölümüne ANTHROPIC_API_KEY eklenmelidir.
// Anahtar yoksa site kendi içindeki ücretsiz yardım asistanıyla çalışmaya devam eder.
const LIMIT = new Map();
const SYS = `Sen "Ders Kütüphanesi" adlı ücretsiz eğitim sitesinin canlı destek asistanısın. Kullanıcıların çoğu 1-12. sınıf öğrencileri (6-18 yaş).
Kurallar:
- Her zaman Türkçe, kısa (en fazla 6-8 cümle), sade, sıcak ve nazik yaz. Küçük çocukların anlayacağı kelimeler kullan.
- Sadece şu konularda yardım et: okul dersleri ve konuları, soru çözme, çalışma önerileri, sitenin kullanımı ve sitedeki hatalar.
- Ödev veya test sorusunda cevabı hemen söyleme; önce ipucu ver ve adım adım çözümü öğret. Öğrenci denedikten sonra doğru cevabı açıklayabilirsin.
- Emin olmadığın bilgiyi uydurma; "emin değilim, öğretmenine de sor" de.
- Asla ad soyad, adres, telefon, okul adı, şifre, fotoğraf gibi kişisel bilgi isteme. Kullanıcı yazarsa paylaşmamasını nazikçe söyle.
- Uygunsuz, şiddet içeren, yetişkinlere yönelik ya da tehlikeli konulara girme; kibarca derslere dön.
- Kullanıcı üzgün, korkmuş görünürse ya da zarar gördüğünü/tehlikede olduğunu söylerse: onu ciddiye al, güvendiği bir yetişkine (anne-baba, öğretmen, okul rehber öğretmeni) hemen söylemesini öner; acil durumda 112'yi aramasını söyle.
- Sitede bir hata bildirilirse: önce sayfayı yenilemeyi (Ctrl+F5) ve interneti kontrol etmeyi öner, sonra "Sorun Bildir" sayfasından (#sorun-bildir) bildirmesini söyle.
Site hakkında bilgiler: Site ücretsiz ve reklamsız. Üyelik/şifre yok; Profilim (#profil) sayfasından takma adla profil açılır, ilerleme sadece cihazda saklanır, Profilim'den yedeklenebilir. Her konuda 4 adım var: 1) Anlatımı izle (sesli anlatım + YouTube videoları) 2) Konuyu oku 3) Soruları çöz 4) Soru çözümü videoları. Araçlar: Bugünün Planı (#plan), Günün 5 Sorusu (#gunluk), Deneme Sınavı (#deneme), Akıllı Tekrar (#tekrar), Yanlışlarım (#yanlislarim), Kavram Sözlüğü (#sozluk), Hesap Makinesi (#hesap), Arkadaşlar ve Düello (#arkadaslar), Öğretmen Modu (#ogretmen), Konu Özeti PDF ve Soru PDF (ders sayfalarının üstünde), Temalar (#temalar). Bir sayfayı önerirken # ile başlayan adresini yaz (örn. #plan).`;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") return res.status(200).json({ ok: !!key });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!key) return res.status(503).json({ error: "no-key" });

  // Basit kötüye kullanım sınırı: bir adresten saatte en fazla 40 mesaj
  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const now = Date.now(), r = LIMIT.get(ip) || { n: 0, t: now };
  if (now - r.t > 3600e3) { r.n = 0; r.t = now; }
  r.n++; LIMIT.set(ip, r);
  if (r.n > 40) return res.status(429).json({ error: "limit" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const raw = Array.isArray(body && body.messages) ? body.messages.slice(-8) : [];
  const msgs = [];
  for (const m of raw) {
    const role = m && m.role === "assistant" ? "assistant" : "user";
    const content = String((m && m.content) || "").slice(0, 800).trim();
    if (!content) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n" + content;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "empty" });

  const page = String((body && body.page) || "#").slice(0, 40), grade = String((body && body.grade) || "").slice(0, 3);
  try {
    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "claude-haiku-5-5",
        max_tokens: 700,
        system: SYS + `\nKullanıcının şu an bulunduğu sayfa: ${page}.` + (grade ? ` Kullanıcının seçtiği sınıf: ${grade}.` : ""),
        messages: msgs
      })
    });
    if (!r2.ok) return res.status(502).json({ error: "ai" });
    const j = await r2.json();
    const reply = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
    return res.status(200).json({ reply: reply || null });
  } catch (e) {
    return res.status(502).json({ error: "ai" });
  }
};
