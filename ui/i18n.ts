// UI strings. `t` and `locale` are live bindings: setLanguage swaps them, then the caller re-renders.
const num = (n: number) => n.toLocaleString(locale);
const pl = (n: number, word: string) => `${num(n)} ${n === 1 ? word : word + 's'}`;
const tr = {
  nav: { apps: 'Uygulamalar', files: 'Dosyalar', settings: 'Ayarlar' }, mainMenu: 'Ana menü', search: 'Ara', searchHint: 'Ara · Ctrl K',
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
};
const en: typeof tr = {
  nav: { apps: 'Apps', files: 'Files', settings: 'Settings' }, mainMenu: 'Main menu', search: 'Search', searchHint: 'Search · Ctrl K',
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
