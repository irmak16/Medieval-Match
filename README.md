# Medieval Match

Ortaçağ temalı, Royal Match tarzı bir match-3 oyunu. TypeScript + PixiJS ile yazıldı; tarayıcıda (telefon dahil) çalışır ve GitHub Pages'te statik olarak barındırılır.

## Oynanış
- Aynı renkten 3 veya daha fazla taşı yan yana getir.
- **4'lü sıra → Ok**: satırı ya da sütunu temizler.
- **L / T şekli → Barut fıçısı**: çevresini patlatır.
- **2x2 kare → Şahin**: çevresine vurur, sonra hedefe uçar.
- **5'li sıra → Kristal küre**: bir rengin tamamını siler.
- Güçlendiricileri birbiriyle değiştirerek kombo yap (ör. küre + küre tüm tahtayı temizler).
- Engeller: tahta sandık, taş blok (1–3 can), sarmaşık ve zincir.
- 80 elle tasarlanmış seviye + 100 hazır üretilmiş seviye (toplam 180), sonrasında sonsuz otomatik seviye.
- Buz zemini (1–2 vuruş), seviye haritası, kale, kart albümü, Kraliyet Kupası, Pip'i Kurtar mini oyunu, 5 can sistemi.
- Yeni mekanikler: **Kraliyet Hazinesi** (en alta indir), **Büyülü Geçit** (portal), **Büyüyen Sarmaşık**.
- 61-80: **Cadı Kazanı** (4 vuruşta dolar, taşınca çevresini vurur), **Renkli Sandık** (sadece kendi rengi kırar), **Yürüyen Bant** (her hamleden sonra satır kayar).
- Hazine Kumbarası, Yıldız Sandığı (her 10 yıldızda), 24 saatlik Şövalye Yarışı, istatistik ekranı.
- Renk körü modu (taşlarda şekiller), grafik kalitesi ayarı, pes etmeden önce onay, "çok yaklaştın" ekranı.
- Oyun içi güçlendiriciler (hamle harcamaz): Çekiç, Okçu, Mancınık, Soytarı.
- Kale restorasyonu: yıldızlarla 6 bölgeyi onar, her bölge ödül verir.
- Günlük ödül, günlük görevler, haftalık Hazine Yolu, galibiyet serisi bonusu.
- Kombo sayacı, hit-stop ve kamera vuruşu, son 5 hamlede hızlanan müzik, zorluğa göre akıllı taş düşürme.
- Royal Match tarzı testere dişi zorluk: her 5. seviye **Zor**, her 10. seviye **Çok Zor**; ardından rahatlama seviyesi.
- Seviye başında altınla güçlendirici seçimi (Ok, Fıçı, Küre), yeni mekaniklerde öğretici pencereler, Seviyeler ekranından eski seviyeleri tekrar oynama.

## Yerelde çalıştırma
```bash
npm install
npm run dev      # geliştirme sunucusu
npm run build    # dist/ klasörüne üretim çıktısı
```
Belirli bir seviyeyi test etmek için adrese `?level=12` ekle.

## GitHub Pages'e yükleme
1. GitHub'da yeni bir repo aç (ör. `medieval-match`) ve bu klasörü oraya push'la (`main` dalı).
2. Repo'da **Settings → Pages → Build and deployment → Source: GitHub Actions** seç.
3. Her push'ta `.github/workflows/deploy.yml` oyunu derleyip yayınlar. Adres: `https://<kullanıcı-adın>.github.io/medieval-match/`
4. Telefonda açıp "Ana Ekrana Ekle" dersen uygulama gibi tam ekran çalışır (PWA, çevrimdışı da açılır).

## Zorluk ayarı (bot simülasyonu)
Hamle sayıları tahminle değil, oyunun kurallarını taklit eden bir simülatörde "insan gibi oynayan" bir botla ayarlandı:
```bash
python3 tools/sim.py 12          # her seviyeyi 12 kez oynatır, kazanma oranlarını gösterir
python3 tools/tune_moves.py 24   # src/levels.ts içindeki hamle sayılarını yeniden ayarlar
python3 tools/tune_range.py 30 61 80   # sadece bir aralığı ayarlar (güvenlik payıyla)
python3 tools/variety.py         # seviyelerin mekanik / boyut / hedef çeşitliliği
python3 tools/level_report.py    # seviye doğrulaması (GitHub Actions'ta da çalışır)
```
Hedefler: normal seviye ≈ %90, Zor ≈ %50, Çok Zor ≈ %30 bot kazanma oranı.

## Eksik görseller (opsiyonel)
`public/assets/` içine şu isimlerle PNG konursa oyun otomatik kullanır, yoksa yedek görsellerle çalışır:
`bt_hammer`, `bt_row`, `bt_col`, `bt_shuffle`, `it_chest`, `ob_vines_grow`, `castle_1` … `castle_6`.

## Klasör yapısı
- `src/` — oyun kodu (`game/board.ts` motorun kalbi)
- `public/assets/` — işlenmiş görseller (şeffaf PNG/WebP)
- `art/raw/` — Gemini'de üretilen ham görseller
- `tools/` — görsel işleme (`process_art.py`), Blender debris render'ı (`blender_debris.py`), partikül dokuları
