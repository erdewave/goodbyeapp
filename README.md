<p align="center">
  <img src="assets/brand/goodbyeapp-logo.svg" alt="GoodbyeAPP" width="480" />
</p>

<p align="center"><b>Remove apps. Reclaim space.</b></p>

<p align="center">
  Uygulamaları kaldıran, geride kalan dosya ve kayıt defteri kalıntılarını temizleyen, tarayıcı ve sistem çöpünü bulan ve diskte en çok yer kaplayan dosyaları gösteren açık kaynaklı masaüstü uygulaması. Windows, macOS ve Linux'ta çalışır.
</p>

---

## Özellikler

- **Uygulama listesi:** Bilgisayarda kurulu uygulamalar logoları, yayıncıları ve kapladıkları alanla birlikte tek listede görünür. Ada göre aranabilir, boyuta göre sıralanabilir. macOS'ta yayıncı sütununun yerinde uygulamanın en son ne zaman açıldığı (Spotlight) görünür.
- **Adım adım kaldırma:** Uygulamanın kendi kaldırıcısı çalıştırılır, ardından geride kalanlar taranır. Neyin silineceğine siz karar verirsiniz; hiçbir şey otomatik seçilmez. Windows'ta kaldırıcının penceresi GoodbyeAPP'in arkasında kaybolmaz.
- **Kalıntı temizliği:**
  - **Windows:** Kayıt defteri anahtarları, AppData / ProgramData / Temp klasörleri, kurulum klasörü, Başlat menüsü ve masaüstü kısayolları.
  - **macOS:** Kullanıcının ve sistemin `Library` klasörlerindeki veriler (Containers, Group Containers, HTTPStorages, WebKit, Cookies dahil), `LaunchAgents` / `LaunchDaemons` servisleri, yardımcı araçlar ve `.pkg` kurulum kayıtları. Uygulamanın paket kimliğiyle başlayan tüm dosyalar bulunur; başka bir kurulu uygulamaya ait olanlara dokunulmaz.
- **macOS'ta temiz kaldırma:** Uygulama kapatılmadan önce oturumdaki arka plan servisleri durdurulur (kendini yeniden başlatan servisler dahil), uygulama çöp kutusuna taşınır ve Dock'taki simgesi kaldırılır.
- **Güvenli silme:** Kayıt defteri anahtarları silinmeden önce `.reg` dosyası olarak yedeklenir. İsterseniz kaldırmadan önce Windows sistem geri yükleme noktası oluşturulur.
- **Yönetici olarak yeniden deneme:** Yetki gerektiren kalıntılar Windows'ta tek bir UAC onayıyla, macOS'ta tek bir parola isteğiyle yeniden denenir. macOS'ta sistem servisleri silinmeden önce durdurulur.
- **Sağlık Kontrolü:** Tarayıcı çerezleri, geçmişi ve önbelleği (Chrome, Edge, Brave, Vivaldi, Opera, Chromium, Firefox, Safari), sistem ve uygulama önbellekleri, loglar, çöp kutusu, indirilenler, Xcode verileri ve Windows'ta geçersiz kayıt defteri girdileri bulunur. Her öğe açılıp dosya dosya seçilebilir. Açık bir tarayıcının verileri temizlenmez; önce tarayıcıyı kapatmanız istenir.
- **Büyük dosyalar ve disk haritası:** Her diskte en çok yer kaplayan dosyalar ve klasörler liste ve harita olarak gösterilir. NTFS disklerde dosya tablosu (MFT) doğrudan okunduğu için tarama saniyeler sürer.
- **Dosya işlemleri:** Bir dosyaya sağ tıklayarak açabilir, klasöründe gösterebilir, yolunu kopyalayabilir, adını web'de aratabilir veya VirusTotal'da kontrol edebilirsiniz.
- **Hızlı arama:** Tek bir arama kutusundan uygulamalara, büyük dosyalara ve ayarlara ulaşılır.
- **Görünüm:** Açık, koyu ve sistem teması; sekiz vurgu rengi (Mavi, Mor, Turkuaz, Yeşil, Kehribar, Turuncu, Pembe, Grafit); varsayılan renk mavidir. Azaltılmış hareket tercihine uyulur.
- **Dil desteği:** Şu anda iki dil desteklenir: Türkçe ve İngilizce. Uygulama işletim sisteminin dilini kullanır; sistem dili Türkçe değilse İngilizce açılır. Dil, Ayarlar'dan elle değiştirilebilir. İlerleyen sürümlerde yeni diller eklenecektir.
- **Gizlilik:** Uygulama kendiliğinden veri göndermez; yalnızca güncelleme olup olmadığını GitHub'dan denetler. Logolar internetten indirilmez, sistemdeki kayıtlı simgelerden okunur. VirusTotal kontrolü dosyayı yüklemez, yalnızca SHA-256 özetiyle sayfayı tarayıcıda açar; web araması yalnızca dosya adını gönderir. İkisi de yalnızca siz seçtiğinizde çalışır.

## Kurulum

### Hazır kurulum dosyası (Windows)

1. [Releases](https://github.com/erdewave/goodbyeapp/releases) sayfasından `GoodbyeAPP_<sürüm>_x64-setup.exe` dosyasını indirin.
2. Dosyayı çalıştırın. Kurulum tek adımlıdır ve uygulama kullanıcı klasörüne kurulur.
3. GoodbyeAPP'i Başlat menüsünden açın. Kayıt defteri ve Program Files kalıntılarını temizleyebilmesi için açılışta yönetici izni ister.

> Kurulum dosyası dijital olarak imzalı değildir. Windows SmartScreen uyarı gösterirse **Ek bilgi → Yine de çalıştır** seçeneğini kullanın.

### Hazır kurulum dosyası (macOS)

1. [Releases](https://github.com/erdewave/goodbyeapp/releases) sayfasından Mac'inize uygun DMG'yi indirin: Apple Silicon (M serisi) için `GoodbyeApp_<sürüm>_aarch64.dmg`, Intel için `GoodbyeApp_<sürüm>_x64.dmg`.
2. DMG'yi açın, lisansı kabul edin ve **GoodbyeApp**'i **Applications** klasörüne sürükleyin.
3. Uygulama Apple tarafından onaylanmış (notarize) değildir. İlk açılışta macOS engellerse **Sistem Ayarları → Gizlilik ve Güvenlik** altındaki **Yine de Aç** düğmesini kullanın.
4. Safari, Mail ve çerez klasörlerinin de taranması için **Sistem Ayarları → Gizlilik ve Güvenlik → Tam Disk Erişimi** listesine GoodbyeApp'i ekleyin. Sağlık Kontrolü izin yoksa bunu hatırlatır ve ayar sayfasını açar.

macOS'ta güncellemeler otomatik kurulmaz; yeni sürüm olduğunda uygulama Releases sayfasını açar.

### Hazır kurulum dosyası (Linux)

[Releases](https://github.com/erdewave/goodbyeapp/releases) sayfasından `GoodbyeAPP_<sürüm>_amd64.AppImage` dosyasını indirin, çalıştırılabilir yapın (`chmod +x`) ve açın.

### Kaynak koddan

Gereksinimler: [Node.js](https://nodejs.org) 22.18 veya üzeri ve [Rust](https://rustup.rs) (stable). Windows'ta Visual Studio Build Tools (C++ iş yükü), Linux'ta `webkit2gtk-4.1` ve `libssl-dev` gerekir.

```sh
git clone https://github.com/erdewave/goodbyeapp.git
cd goodbyeapp
npm install
npm start
```

Kendi kurulum dosyanızı üretmek için:

```sh
npm run tauri build
```

Çıktı `src-tauri/target/release/bundle/` klasörüne yazılır: Windows'ta NSIS kurulumu, macOS'ta DMG, Linux'ta AppImage. Her paketi kendi işletim sisteminde derleyin. Otomatik güncelleme imzalıdır: `TAURI_SIGNING_PRIVATE_KEY` ortam değişkeni, `src-tauri/tauri.conf.json` içindeki genel anahtarın özel eşi olmalıdır (`npx tauri signer generate`).

## Kullanım

### Bir uygulamayı kaldırmak

**Uygulamalar** sekmesinde kaldırmak istediğiniz uygulamanın yanındaki **Kaldır** düğmesine basın. Dört adımlı sihirbaz açılır:

1. **Kaldır:** Uygulamanın kendi kaldırıcısı çalışır. Kaldırma doğrulandıktan sonra kalıntılar taranır.
2. **Kayıt defteri:** Uygulama veya yayıncı adıyla eşleşen anahtarlar listelenir. Tek tek ya da **Tümünü seç** ile işaretleyin.
3. **Disk:** Kurulum klasörü, AppData, ProgramData, Temp ve kısayollardaki kalıntılar listelenir. Aynı şekilde seçin.
4. **Bitti:** **Seçilenleri temizle** ile işaretlenenler silinir. Silinemeyen öğeler nedeniyle birlikte gösterilir; **Yönetici olarak dene** ile yeniden denenebilir.

macOS ve Linux'ta kayıt defteri olmadığı için sihirbaz doğrudan **Disk** adımıyla açılır.

Aynı anda birden fazla kaldırma başlatabilirsiniz; işler sıraya alınır ve ilerlemeleri bildirim olarak görünür.

### Sağlık Kontrolü

**Sağlık Kontrolü** sekmesinde **Sistemi tara**'ya basın. Bulunanlar gruplar halinde (Sistem, tarayıcılar, uygulamalar…) boyutlarıyla listelenir; güvenli olanlar önceden seçilidir, çerezler ve indirilenler gibi kişisel veriler seçili gelmez. Bir öğeyi açıp içindeki dosyaları tek tek seçebilir, **Seçilenleri temizle** ile silebilirsiniz.

### Büyük dosyaları bulmak

**Dosyalar** sekmesini açın. Tarama otomatik başlar ve her disk için en büyük dosyalar boyut sırasıyla listelenir; disk haritası klasörlerin kapladığı alanı gösterir. Bir dosyaya sağ tıklayarak onu açabilir, klasöründe gösterebilir, adını web'de aratabilir veya VirusTotal'da kontrol edebilirsiniz. Taramayı **Durdur** ile kesebilir, **Yeniden tara** ile tekrarlayabilirsiniz.

### Ayarlar

- **Görünüm** ve **Uygulama rengi:** Tema ve vurgu rengini seçin.
- **Dil:** Sistem dili, Türkçe veya English arasında seçim yapın.
- **Kaldırmadan önce geri yükleme noktası:** Açıksa her kaldırmadan önce Windows geri yükleme noktası oluşturulur. Windows son 24 saatte oluşturulmuş bir nokta varsa yenisini atlar.
- **Yedek klasörünü aç:** Silinen kayıt defteri anahtarlarının `.reg` yedeklerine ulaşın. Bir anahtarı geri getirmek için ilgili dosyaya çift tıklamanız yeterli.

## Platform desteği

| Platform | Kaldırma | Kalıntı taraması |
| --- | --- | --- |
| Windows | HKLM / HKCU kaldırma kayıtlarındaki Win32 uygulamaları (EXE ve MSI) | Kayıt defteri (WOW6432Node dahil), Program Files, AppData, ProgramData, Temp, Başlat menüsü ve masaüstü kısayolları |
| macOS | `/Applications` ve `~/Applications` içindeki `.app` paketleri; önce servisleri durdurulur ve uygulama kapatılır, sonra çöp kutusuna taşınır | `~/Library` (Application Support, Caches, Preferences, Logs, Saved Application State, Containers, Group Containers, HTTPStorages, WebKit, Cookies, Application Scripts, LaunchAgents), `/Library` (Application Support, Caches, Preferences, Logs, LaunchAgents, LaunchDaemons, PrivilegedHelperTools) ve `.pkg` kayıtları |
| Linux | Kullanıcı ve sistem Flatpak uygulamaları | XDG config, cache, data ve `~/.var/app` |

Uygulama Windows üzerinde geliştirilip test edilir. macOS sürümü macOS 15 üzerinde gerçek uygulamalar kaldırılarak test edilir. Linux paketi her sürümde otomatik olarak derlenip açılış testinden geçer.

Desteklenmeyenler: Microsoft Store uygulamaları, apt / rpm / Snap paketleri, servisler, sürücüler ve paylaşılan çalışma zamanları.

## Bilinmesi gerekenler

- Kalıntılar ada göre eşleştirilir; bu, bir dosyanın o uygulamaya ait olduğunu kesin olarak kanıtlamaz. Silmeden önce listeyi gözden geçirin.
- Silinen kalıntı dosyaları geri dönüşüm kutusuna gitmez, kalıcı olarak silinir. Kayıt defteri anahtarlarının yedeği alınır.
- macOS'ta Tam Disk Erişimi verilmezse Safari, Mail ve çerez klasörleri taranamaz.
- Kaldırılan uygulamanın kendisi geri yüklenmez; gerekirse yeniden kurulmalıdır.
- Çok büyük klasörlerin boyutu yaklaşık gösterilir. Boyutu bilinmeyen uygulamalarda "—" görünür.

## Güvenlik

- Arayüz yalnızca uygulamanın kendi Rust komutlarına erişebilir; Node.js yoktur, başka adreslere gidemez.
- Temizlik istekleri arayüzden dosya yolu almaz; ana süreçte üretilmiş tarama planındaki kimlikleri kullanır.
- Her yol silinmeden hemen önce yeniden doğrulanır. Kök dizinler ve sembolik bağlantılar reddedilir, bağlantı noktaları takip edilmez. Tek istisna macOS'taki `LaunchAgents` / `LaunchDaemons` klasörleridir: oradaki bağlantının yalnızca kendisi silinir, gösterdiği dosyaya dokunulmaz.
- macOS'ta yönetici olarak silinecek yollar betiğe ayrı argüman olarak geçer, metnin içine yazılmaz; klasörü sonradan bağlantıyla değiştirilmiş bir yol atlanır.
- Kayıt defteri yedeği alınamazsa anahtar silinmez.

## Geliştirme

Rust ([Tauri](https://tauri.app) 2) ve React 19, Vite, Tailwind CSS; arayüz bileşenleri [beUI](https://beui.dev) tabanlıdır.

| Komut | Ne yapar |
| --- | --- |
| `npm start` | Derler ve uygulamayı açar |
| `npm run build` | Tip kontrolü yapar ve arayüzü `dist-ui` içine derler |
| `npm test` | Tip kontrolü ve Rust birim testleri (yalnızca geçici test klasörlerinde, gerçek uygulama kaldırmaz) |
| `npm run test:ui` | Windows'ta uygulamayı açıp arayüzü Playwright ile gezen testi çalıştırır |
| `npm run tauri build` | Kurulum dosyasını üretir (`-- --no-bundle` ile kurulum dosyası olmadan derler) |

Klasörler: `src-tauri/` Rust tarafı (komutlar `commands.rs`, sistem işlemleri `platform/`, disk taraması `files.rs` + `mft.rs`, Sağlık Kontrolü `health/`), `ui/` arayüz, `tests/` arayüz testleri, `assets/brand/` logo ve ikonlar ([marka rehberi](assets/brand/BRAND.md)).

## Lisans

[MIT](LICENSE)
