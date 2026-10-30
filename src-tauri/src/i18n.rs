// Main-process messages; the renderer picks the language and sends it over the `language` command.
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg_attr(windows, allow(dead_code))]
pub struct Msgs {
    pub app_not_found: &'static str, pub busy: &'static str,
    pub scan_running: &'static str, pub not_in_scan: &'static str, pub installed_copy: &'static str, pub scan_first: &'static str,
    pub already_removed: &'static str, pub still_installed: &'static str, pub select_items: &'static str, pub invalid_selection: &'static str,
    pub unsupported_uninstall: &'static str, pub uninstaller_failed: fn(&str) -> String,
    pub outside_root: &'static str, pub symlink: &'static str, pub redirected: &'static str, pub invalid_registry: &'static str,
    pub windows_only: &'static str, pub too_many: &'static str, pub elevation_denied: &'static str, pub elevated_failed: &'static str,
    pub restore_failed: fn(&str) -> String, pub restore_protection: &'static str,
    pub recycle_bin: &'static str, pub recycle_items: fn(u64) -> String, pub in_use: &'static str, pub update_failed: &'static str,
}
static ENGLISH: AtomicBool = AtomicBool::new(false);
pub fn set_language(code: &str) { ENGLISH.store(code == "en", Ordering::Relaxed); }
pub fn t() -> &'static Msgs { if ENGLISH.load(Ordering::Relaxed) { &EN } else { &TR } }

static TR: Msgs = Msgs {
    app_not_found: "Uygulama bulunamadı. Listeyi yenileyin.", busy: "Devam eden işlemin bitmesini bekleyin.",
    scan_running: "Tarama zaten sürüyor.", not_in_scan: "Dosya tarama sonuçlarında yok.", installed_copy: "Aynı uygulamanın yüklü bir kopyası var. Önce uygulamayı kaldırın.", scan_first: "Önce kalıntıları tarayın.",
    already_removed: "Uygulama zaten kaldırılmış.", still_installed: "Uygulama hâlâ yüklü görünüyor. Kaldırıcıyı tamamlayıp listeyi yenileyin.", select_items: "Temizlenecek öğeleri seçin.", invalid_selection: "Geçersiz seçim.",
    unsupported_uninstall: "Bu uygulamanın kaldırma komutu desteklenmiyor. Windows Ayarları üzerinden kaldırıp yeniden tarayın.", uninstaller_failed: |code| format!("Kaldırıcı tamamlanmadı veya iptal edildi (kod {code})."),
    outside_root: "İzin verilen dizinin dışında.", symlink: "Sembolik bağlantılar temizlenmez.", redirected: "Yönlendirilmiş yol temizlenmez.", invalid_registry: "Geçersiz kayıt defteri anahtarı.",
    windows_only: "Yönetici işlemi yalnızca Windows içindir.", too_many: "Tek seferde çok fazla öğe var; daha azını seçin.", elevation_denied: "Yönetici izni verilmedi.", elevated_failed: "Yönetici izniyle de silinemedi.",
    restore_failed: |detail| format!("Sistem geri yükleme noktası oluşturulamadı. {detail}"), restore_protection: "Sistem geri yükleme noktası oluşturulamadı (Sistem Koruması kapalı olabilir).",
    recycle_bin: "Geri Dönüşüm Kutusu", recycle_items: |n| format!("{n} öğe"), in_use: "Dosya kullanımda. Tarayıcıyı kapatıp tekrar deneyin.", update_failed: "Güncellemeler denetlenemedi. İnternet bağlantınızı kontrol edin.",
};
static EN: Msgs = Msgs {
    app_not_found: "App not found. Refresh the list.", busy: "Wait for the current operation to finish.",
    scan_running: "A scan is already running.", not_in_scan: "The file is not in the scan results.", installed_copy: "An installed copy of the same app exists. Uninstall the app first.", scan_first: "Scan for leftovers first.",
    already_removed: "The app is already uninstalled.", still_installed: "The app still appears to be installed. Finish the uninstaller and refresh the list.", select_items: "Select items to clean.", invalid_selection: "Invalid selection.",
    unsupported_uninstall: "This app's uninstall command is not supported. Uninstall it from Windows Settings and scan again.", uninstaller_failed: |code| format!("The uninstaller did not finish or was cancelled (code {code})."),
    outside_root: "Outside the allowed folder.", symlink: "Symbolic links are not cleaned.", redirected: "Redirected paths are not cleaned.", invalid_registry: "Invalid registry key.",
    windows_only: "Administrator actions are only available on Windows.", too_many: "Too many items at once; select fewer.", elevation_denied: "Administrator permission was not granted.", elevated_failed: "Could not be deleted even with administrator permission.",
    restore_failed: |detail| format!("Could not create a system restore point. {detail}"), restore_protection: "Could not create a system restore point (System Protection may be turned off).",
    recycle_bin: "Recycle Bin", recycle_items: |n| format!("{n} {}", if n == 1 { "item" } else { "items" }), in_use: "The file is in use. Close the browser and try again.", update_failed: "Could not check for updates. Check your internet connection.",
};
