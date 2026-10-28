// Main-process messages; the renderer picks the language and sends it over the 'language' channel.
const tr = {
  appNotFound: 'Uygulama bulunamadı. Listeyi yenileyin.', unauthorized: 'Yetkisiz istek.', busy: 'Devam eden işlemin bitmesini bekleyin.', invalidWindowAction: 'Geçersiz pencere işlemi.',
  scanRunning: 'Tarama zaten sürüyor.', notInScan: 'Dosya tarama sonuçlarında yok.', installedCopy: 'Aynı uygulamanın yüklü bir kopyası var. Önce uygulamayı kaldırın.', scanFirst: 'Önce kalıntıları tarayın.',
  alreadyRemoved: 'Uygulama zaten kaldırılmış.', stillInstalled: 'Uygulama hâlâ yüklü görünüyor. Kaldırıcıyı tamamlayıp listeyi yenileyin.', selectItems: 'Temizlenecek öğeleri seçin.', invalidSelection: 'Geçersiz seçim.',
  unsupportedUninstall: 'Bu uygulamanın kaldırma komutu desteklenmiyor. Windows Ayarları üzerinden kaldırıp yeniden tarayın.', uninstallerFailed: (code: string) => `Kaldırıcı tamamlanmadı veya iptal edildi (kod ${code}).`,
  outsideRoot: 'İzin verilen dizinin dışında.', symlink: 'Sembolik bağlantılar temizlenmez.', redirected: 'Yönlendirilmiş yol temizlenmez.', invalidRegistry: 'Geçersiz kayıt defteri anahtarı.',
  windowsOnly: 'Yönetici işlemi yalnızca Windows içindir.', tooMany: 'Tek seferde çok fazla öğe var; daha azını seçin.', elevationDenied: 'Yönetici izni verilmedi.', elevatedFailed: 'Yönetici izniyle de silinemedi.',
  restoreFailed: (detail: string) => 'Sistem geri yükleme noktası oluşturulamadı. ' + detail, restoreProtection: 'Sistem geri yükleme noktası oluşturulamadı (Sistem Koruması kapalı olabilir).',
  recycleBin: 'Geri Dönüşüm Kutusu', recycleItems: (n: number) => `${n} öğe`, inUse: 'Dosya kullanımda. Tarayıcıyı kapatıp tekrar deneyin.', updateFailed: 'Güncellemeler denetlenemedi. İnternet bağlantınızı kontrol edin.',
};
const en: typeof tr = {
  appNotFound: 'App not found. Refresh the list.', unauthorized: 'Unauthorized request.', busy: 'Wait for the current operation to finish.', invalidWindowAction: 'Invalid window action.',
  scanRunning: 'A scan is already running.', notInScan: 'The file is not in the scan results.', installedCopy: 'An installed copy of the same app exists. Uninstall the app first.', scanFirst: 'Scan for leftovers first.',
  alreadyRemoved: 'The app is already uninstalled.', stillInstalled: 'The app still appears to be installed. Finish the uninstaller and refresh the list.', selectItems: 'Select items to clean.', invalidSelection: 'Invalid selection.',
  unsupportedUninstall: "This app's uninstall command is not supported. Uninstall it from Windows Settings and scan again.", uninstallerFailed: code => `The uninstaller did not finish or was cancelled (code ${code}).`,
  outsideRoot: 'Outside the allowed folder.', symlink: 'Symbolic links are not cleaned.', redirected: 'Redirected paths are not cleaned.', invalidRegistry: 'Invalid registry key.',
  windowsOnly: 'Administrator actions are only available on Windows.', tooMany: 'Too many items at once; select fewer.', elevationDenied: 'Administrator permission was not granted.', elevatedFailed: 'Could not be deleted even with administrator permission.',
  restoreFailed: detail => 'Could not create a system restore point. ' + detail, restoreProtection: 'Could not create a system restore point (System Protection may be turned off).',
  recycleBin: 'Recycle Bin', recycleItems: n => `${n} ${n === 1 ? 'item' : 'items'}`, inUse: 'The file is in use. Close the browser and try again.', updateFailed: 'Could not check for updates. Check your internet connection.',
};
export let t = tr;
export function setLanguage(code: unknown) { t = code === 'en' ? en : tr; }
