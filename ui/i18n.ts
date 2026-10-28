// UI strings. `t` and `locale` are live bindings: setLanguage swaps them, then the caller re-renders.
const num = (n: number) => n.toLocaleString(locale);
const pl = (n: number, word: string) => `${num(n)} ${n === 1 ? word : word + 's'}`;
const tr = {
  nav: { apps: 'Uygulamalar', files: 'Dosyalar', health: 'Sağlık Kontrolü', settings: 'Ayarlar' }, mainMenu: 'Ana menü', search: 'Ara', searchHint: 'Ara · Ctrl K',
  steps: ['Kayıt defteri', 'Disk'], stepsLabel: 'Adımlar',
  phase: { queued: 'Sırada bekliyor', uninstalling: 'Kaldırıcı çalışıyor…', scanning: 'Kalıntılar taranıyor…', cleaning: 'Kalıntılar temizleniyor…', failed: 'Kaldırılamadı', done: 'Kaldırıldı' },
  found: (n: number) => `${num(n)} kalıntı bulundu`, cleanedTail: (n: number) => ` · ${num(n)} öğe temizlendi`, leftTail: (n: number) => ` · ${num(n)} öğe kaldı`, restoreTail: ' · Geri yükleme noktası oluşturuldu', review: 'İncele',
  columns: { name: 'Uygulama', publisher: 'Yayıncı', size: 'Boyut' }, actions: 'İşlemler', sortAsc: 'Küçükten büyüğe sırala', sortDesc: 'Büyükten küçüğe sırala',
  uninstallApp: (name: string) => `${name} uygulamasını kaldır`, noApps: 'Uygulama bulunamadı', unknownPublisher: 'Bilinmeyen yayıncı', macApp: 'macOS uygulaması',
  accents: { purple: 'Mor', blue: 'Mavi', teal: 'Turkuaz', green: 'Yeşil', amber: 'Kehribar', orange: 'Turuncu', pink: 'Pembe', graphite: 'Grafit' },
  themes: { light: 'Açık', dark: 'Koyu', system: 'Otomatik' },
  preferences: 'Tercihler', appearance: 'Görünüm', accent: 'Uygulama rengi', language: 'Dil', systemLanguage: 'Sistem dili',
  restorePoint: 'Kaldırmadan önce geri yükleme noktası', restorePointNote: 'Windows uygulamalarını kaldırmadan önce sistem geri yükleme noktası oluşturur.', restorePointToggle: 'Kaldırmadan önce geri yükleme noktası oluştur',
  backups: 'Kayıt defteri yedekleri', openBackups: 'Yedek klasörünü aç', openBackupsCommand: 'Kayıt defteri yedek klasörünü aç',
  go: 'Git', fileGroup: 'Dosyalar', paletteSearch: 'Uygulama, dosya veya ayar ara…', noResults: 'Sonuç bulunamadı.', noBridge: 'Masaüstü bağlantısı yok. Uygulamayı npm start ile aç.',
  nothingHere: 'Bu adımda temizlenecek bir şey yok.', selectAll: 'Tümünü seç', selected: (n: number, total: number) => `${num(n)} / ${num(total)} seçili`,
  noRegistry: 'Kayıt defterinde kalıntı bulunamadı', noDisk: 'Diskte kalıntı bulunamadı', minimizeHint: 'Küçült · sağ altta devam eder', minimize: 'Küçült',
  removed: (name: string) => `${name} kaldırıldı`, cleaned: (n: number) => `${num(n)} öğe temizlendi.`, notCleaned: (n: number) => ` ${num(n)} öğe temizlenemedi.`,
  restoreCreated: 'Sistem geri yükleme noktası oluşturuldu.', restoreSkipped: 'Son 24 saatte oluşturulmuş bir geri yükleme noktası olduğu için Windows yenisini oluşturmadı.',
  next: 'İleri', back: 'Geri', clean: 'Seçilenleri temizle', cleaning: 'Temizleniyor', cleanedButton: 'Temizlendi', retry: 'Tekrar dene', elevate: 'Yönetici olarak dene', trying: 'Deneniyor', done: 'Tamamlandı', close: 'Kapat',
  stop: 'Durdur', rescan: 'Yeniden tara', scan: 'Diskleri tara', waiting: 'Bekliyor', driveDone: (big: number, n: number) => `${num(big)} büyük dosya · ${num(n)} dosya tarandı`,
  fastScanHint: ' · Hızlı tarama için yönetici olarak çalıştırın', scanningAt: (at: string) => `Taranıyor · ${at}`, localDisk: 'Yerel Disk', systemDisk: 'Sistem diski', diskMap: 'Disk haritası',
  chartTiles: 'Harita kutuları', revealExplorer: "Dosya Gezgini'nde göster", fileActions: 'Dosya işlemleri', openFile: 'Aç', toTop: 'Yukarı çık',chartLegend: 'Harita açıklaması', chartEmpty: 'Gösterilecek veri yok', ofTotal: (p: string) => `Toplamın %${p} kadarı`,
  titlebar: 'Pencere başlık çubuğu', windowControls: 'Pencere kontrolleri', minimizeWindow: 'Pencereyi küçült', restoreDown: 'Önceki boyuta dön', maximize: 'Büyüt', maximizeWindow: 'Pencereyi büyüt', closeWindow: 'Pencereyi kapat',
  confirmed: 'Onaylandı', kept: 'Vazgeçildi', confirmUninstall: 'Kaldırmayı onayla', cancel: 'Vazgeç', logo: (name: string) => `${name} logosu`, noIcon: 'Uygulama simgesi bulunamadı',
  expand: 'Genişlet', dismiss: 'Kapat', closePalette: 'Komut paletini kapat', recentSearches: 'Son aramalar', clearHistory: 'Geçmişi temizle', categories: 'Kategoriler', palette: 'Komut paleti', commands: 'Komutlar', theme: 'Tema',
  health: {
    title: 'Sağlık Kontrolü', intro: 'Tarayıcı çerezlerini, geçmişi ve önbelleği, gereksiz dosyaları ve geçersiz girdileri bulur. Neyin silineceğini sen seçersin.', scan: 'Sistemi tara', scanning: 'Taranıyor', clean: 'Temiz, sorun bulunamadı.',
    toClean: 'Temizlenecek', macCategories: { cache: 'Önbellekler', history: 'Gezinme geçmişi' } as Record<string, string>, details: (name: string) => `${name} ayrıntıları`, columns: { name: 'Ad', count: 'Öğe sayısı', size: 'Boyut' }, result: (ok: number, failed: number) => `${num(ok)} öğe temizlendi` + (failed ? `, ${num(failed)} öğe temizlenemedi` : ''),
    groups: { windows: "Windows", system: "Sistem", apps: "Uygulamalar", media: "Çoklu ortam", utils: "Yardımcı Programlar", winstore: "Windows Store", ai: "AI Araçları", downloads: "Windows İndirmeleri", userdownloads: "İndirilenler", advanced: "Gelişmiş", internet: "İnternet", registry: "Kayıt defteri" } as Record<string, string>,
    categories: { cookies: "Çerezler", history: "İnternet Geçmişi", cache: "İnternet Önbelleği", metrics: "Ölçüm Geçici Dosyaları", session: "Oturum", thumbs: "Küçük Resim Önbelleği", d3d: "DirectX Gölgelendirici Önbelleği", recentdocs: "Son Belgeler", runmru: "Çalıştır (Başlat Menüsünden)", explorermru: "Diğer Explorer MRU'ları", temp: "Geçici Dosyalar", recycle: "Geri Dönüşüm Kutusunu Boşalt", trash: "Çöp", usercache: "Uygulama Önbellekleri", userlogs: "Günlük Dosyaları", downloads: "İndirmeler", dumps: "Bellek Dökümleri", chkdsk: "Chkdsk Dosya Parçaları", logs: "Windows Günlük Dosyaları", webcache: "Windows Web Ön Belleği", wer: "Windows Hata Raporlaması", etl: "Windows Olay İzleme Günlükleri", notifications: "Windows Bildirimleri", driverlogs: "Sürücü Yükleme Günlük Dosyaları", delivery: "Windows Teslim İyileştirme Dosyaları", spotify: "Spotify - Müzik Önbelleği", spotifyoffline: "Spotify - Çevrim dışı şarkılar", widgets: "Windows Pencere Ögeleri", clienttemp: "Windows İstemcisi Geçici Dosyaları", photos: "Fotoğraf Geçici Dosyaları", claudecodehistory: "Claude Code Geçmişi", claudecodecache: "Claude Code Önbelleği", claudecache: "Claude Önbelleği", codexcache: "ChatGPT (Codex) Önbelleği", codexhistory: "ChatGPT (Codex) Geçmişi", antigravitycache: "Antigravity Önbelleği", antigravityhistory: "Antigravity Geçmişi", hfmodels: "Hugging Face CLI Modelleri", hfcache: "Hugging Face CLI Önbelleği", copilotcli: "GitHub Copilot CLI Önbelleği", jetbrainsai: "JetBrains AI (IDE eklentisi) Geçmişi", compressed: "Sıkıştırılmış Dosyalar", programs: "Uygulamalar/Programlar", images: "Resimler/Görüntüler", media: "Ses/Video", documents: "Belgeler", others: "Diğer", prefetch: "Eski Önceden Getirme Verileri", iislogs: "IIS Günlük Dosyaları", menuorder: "Menü Sırası Önbelleği", traynotify: "Tepsi Bildirimleri Önbelleği", windowsize: "Pencere Boyutu/Konumu Önbelleği", userassist: "Kullanıcı Yardım Geçmişi", whatsapplog: "WhatsApp - Günlük", whatsappstorage: "WhatsApp - Depolama", whatsappcache: "WhatsApp - Önbellek", icloudcache: "iCloud - Önbellek dosyaları", icloudlogs: "iCloud - Günlük Dosyaları", icloudstorage: "iCloud - Depolama Dosyaları", run: "Başlangıçta çalışan eksik uygulamalar", mui: "MUI önbelleği", dlls: "Eksik paylaşılan DLL'ler", apppaths: "Uygulama yolları" } as Record<string, string>,
  },
  update: { title: (v: string) => `Yeni sürüm: ${v}`, ready: 'İndirildi. Şimdi yeniden başlatıp kurabilirsin; kurmazsan uygulamayı kapattığında kurulur.', available: "GitHub'dan indirilebilir.", install: 'Yeniden başlat', download: 'İndir',
    auto: 'Otomatik güncelleme', autoNote: 'Açılışta yeni sürümü denetler ve arka planda indirir.', autoToggle: 'Güncellemeleri otomatik indir', version: 'Mevcut sürüm',
    check: 'Güncellemeleri denetle', checking: 'Denetleniyor…', upToDate: 'Güncel', upToDateToast: 'GoodbyeAPP güncel.', downloading: 'Arka planda indiriliyor…' },
};
const en: typeof tr = {
  nav: { apps: 'Apps', files: 'Files', health: 'Health Check', settings: 'Settings' }, mainMenu: 'Main menu', search: 'Search', searchHint: 'Search · Ctrl K',
  steps: ['Registry', 'Disk'], stepsLabel: 'Steps',
  phase: { queued: 'Queued', uninstalling: 'Uninstaller running…', scanning: 'Scanning for leftovers…', cleaning: 'Cleaning leftovers…', failed: 'Could not uninstall', done: 'Uninstalled' },
  found: n => `${pl(n, 'leftover')} found`, cleanedTail: n => ` · ${pl(n, 'item')} cleaned`, leftTail: n => ` · ${pl(n, 'item')} left`, restoreTail: ' · Restore point created', review: 'Review',
  columns: { name: 'App', publisher: 'Publisher', size: 'Size' }, actions: 'Actions', sortAsc: 'Sort ascending', sortDesc: 'Sort descending',
  uninstallApp: name => `Uninstall ${name}`, noApps: 'No apps found', unknownPublisher: 'Unknown publisher', macApp: 'macOS app',
  accents: { purple: 'Purple', blue: 'Blue', teal: 'Teal', green: 'Green', amber: 'Amber', orange: 'Orange', pink: 'Pink', graphite: 'Graphite' },
  themes: { light: 'Light', dark: 'Dark', system: 'System' },
  preferences: 'Preferences', appearance: 'Appearance', accent: 'Accent color', language: 'Language', systemLanguage: 'System language',
  restorePoint: 'Restore point before uninstalling', restorePointNote: 'Creates a system restore point before uninstalling Windows apps.', restorePointToggle: 'Create a restore point before uninstalling',
  backups: 'Registry backups', openBackups: 'Open backup folder', openBackupsCommand: 'Open registry backup folder',
  go: 'Go to', fileGroup: 'Files', paletteSearch: 'Search apps, files or settings…', noResults: 'No results found.', noBridge: 'No desktop bridge. Open the app with npm start.',
  nothingHere: 'Nothing to clean in this step.', selectAll: 'Select all', selected: (n, total) => `${num(n)} / ${num(total)} selected`,
  noRegistry: 'No leftovers found in the registry', noDisk: 'No leftovers found on disk', minimizeHint: 'Minimize · continues at bottom right', minimize: 'Minimize',
  removed: name => `${name} uninstalled`, cleaned: n => `${pl(n, 'item')} cleaned.`, notCleaned: n => ` ${pl(n, 'item')} could not be cleaned.`,
  restoreCreated: 'System restore point created.', restoreSkipped: 'Windows did not create a new restore point because one was created in the last 24 hours.',
  next: 'Next', back: 'Back', clean: 'Clean selected', cleaning: 'Cleaning', cleanedButton: 'Cleaned', retry: 'Try again', elevate: 'Try as administrator', trying: 'Trying', done: 'Done', close: 'Close',
  stop: 'Stop', rescan: 'Scan again', scan: 'Scan drives', waiting: 'Waiting', driveDone: (big, n) => `${pl(big, 'large file')} · ${pl(n, 'file')} scanned`,
  fastScanHint: ' · Run as administrator for a fast scan', scanningAt: at => `Scanning · ${at}`, localDisk: 'Local Disk', systemDisk: 'System disk', diskMap: 'Disk map',
  chartTiles: 'Map tiles', revealExplorer: 'Show in File Explorer', fileActions: 'File actions', openFile: 'Open', toTop: 'Back to top',chartLegend: 'Map legend', chartEmpty: 'No data to show', ofTotal: p => `${p}% of total`,
  titlebar: 'Window title bar', windowControls: 'Window controls', minimizeWindow: 'Minimize window', restoreDown: 'Restore down', maximize: 'Maximize', maximizeWindow: 'Maximize window', closeWindow: 'Close window',
  confirmed: 'Confirmed', kept: 'Cancelled', confirmUninstall: 'Confirm uninstall', cancel: 'Cancel', logo: name => `${name} logo`, noIcon: 'App icon not found',
  expand: 'Expand', dismiss: 'Dismiss', closePalette: 'Close command palette', recentSearches: 'Recent searches', clearHistory: 'Clear history', categories: 'Categories', palette: 'Command palette', commands: 'Commands', theme: 'Theme',
  health: {
    title: 'Health Check', intro: 'Finds browser cookies, history and cache, junk files, and invalid entries. You choose what gets deleted.', scan: 'Scan system', scanning: 'Scanning', clean: 'All clean, no issues found.',
    toClean: 'To clean', macCategories: { cache: 'Caches', history: 'Browsing history' } as Record<string, string>, details: name => `${name} details`, columns: { name: 'Name', count: 'Items', size: 'Size' }, result: (ok, failed) => `${pl(ok, 'item')} cleaned` + (failed ? `, ${pl(failed, 'item')} could not be cleaned` : ''),
    groups: { windows: "Windows", system: "System", apps: "Applications", media: "Multimedia", utils: "Utilities", winstore: "Windows Store", ai: "AI Tools", downloads: "Windows Downloads", userdownloads: "Downloads", advanced: "Advanced", internet: "Internet", registry: "Registry" } as Record<string, string>,
    categories: { cookies: "Cookies", history: "Internet History", cache: "Internet Cache", metrics: "Metrics Temp Files", session: "Session", thumbs: "Thumbnail Cache", d3d: "DirectX Shader Cache", recentdocs: "Recent Documents", runmru: "Run (in Start Menu)", explorermru: "Other Explorer MRUs", temp: "Temporary Files", recycle: "Empty Recycle Bin", trash: "Trash", usercache: "App Caches", userlogs: "Log Files", downloads: "Downloads", dumps: "Memory Dumps", chkdsk: "Chkdsk File Fragments", logs: "Windows Log Files", webcache: "Windows Web Cache", wer: "Windows Error Reporting", etl: "Windows Event Trace Logs", notifications: "Windows Notifications", driverlogs: "Driver Installation Log Files", delivery: "Windows Delivery Optimization Files", spotify: "Spotify - Music Cache", spotifyoffline: "Spotify - Offline songs", widgets: "Windows Widgets", clienttemp: "Windows Client Temp Files", photos: "Photos Temp Files", claudecodehistory: "Claude Code History", claudecodecache: "Claude Code Cache", claudecache: "Claude Cache", codexcache: "ChatGPT (Codex) Cache", codexhistory: "ChatGPT (Codex) History", antigravitycache: "Antigravity Cache", antigravityhistory: "Antigravity History", hfmodels: "Hugging Face CLI Models", hfcache: "Hugging Face CLI Cache", copilotcli: "GitHub Copilot CLI Cache", jetbrainsai: "JetBrains AI (IDE plugin) History", compressed: "Compressed Files", programs: "Apps/Programs", images: "Pictures/Images", media: "Audio/Video", documents: "Documents", others: "Others", prefetch: "Old Prefetch data", iislogs: "IIS Log Files", menuorder: "Menu Order Cache", traynotify: "Tray Notifications Cache", windowsize: "Window Size/Location Cache", userassist: "User Assist History", whatsapplog: "WhatsApp - Log", whatsappstorage: "WhatsApp - Storage", whatsappcache: "WhatsApp - Cache", icloudcache: "iCloud - Cache files", icloudlogs: "iCloud - Log Files", icloudstorage: "iCloud - Storage Files", run: "Missing startup apps", mui: "MUI cache", dlls: "Missing shared DLLs", apppaths: "Application paths" } as Record<string, string>,
  },
  update: { title: v => `New version: ${v}`, ready: 'Downloaded. Restart now to install it, or it installs when you close the app.', available: 'Available to download from GitHub.', install: 'Restart', download: 'Download',
    auto: 'Automatic updates', autoNote: 'Checks for a new version on launch and downloads it in the background.', autoToggle: 'Download updates automatically', version: 'Current version',
    check: 'Check for updates', checking: 'Checking…', upToDate: 'Up to date', upToDateToast: 'GoodbyeAPP is up to date.', downloading: 'Downloading in the background…' },
};
export const languages = ['system', 'tr', 'en'] as const;
export type Language = typeof languages[number];
export let language = (localStorage.getItem('language') || 'system') as Language, t = tr, locale = 'tr-TR';
// 'system' follows the OS locale (Electron's navigator.language); anything not Turkish falls back to English.
export function setLanguage(next: Language) {
  const code = next === 'system' ? (navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en') : next;
  language = next; t = code === 'en' ? en : tr; locale = code === 'en' ? 'en-US' : 'tr-TR';
  localStorage.setItem('language', next); document.documentElement.lang = code;
  window.goodbyeapp?.language(code).catch(() => {});
}
setLanguage(languages.includes(language) ? language : 'system');
