// macOS menu bar in the system language: Tauri's default menu is English-only. It ignores the in-app language setting, like any other Mac app.
use tauri::menu::{Menu, PredefinedMenuItem as P, Submenu};
use tauri::AppHandle;

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    // Turkish when it is the first preferred language, English otherwise (same rule as the page's "system" language).
    set(app, !crate::i18n::system_language().starts_with("tr"))
}

fn set(app: &AppHandle, english: bool) -> tauri::Result<()> {
    let l = |en: &'static str, tr: &'static str| Some(if english { en } else { tr });
    let sep = || P::separator(app);
    let menu = Menu::with_items(app, &[
        &Submenu::with_items(app, "GoodbyeApp", true, &[
            &P::about(app, l("About GoodbyeApp", "GoodbyeApp Hakkında"), None)?, &sep()?, &P::services(app, l("Services", "Hizmetler"))?, &sep()?,
            &P::hide(app, l("Hide GoodbyeApp", "GoodbyeApp'i Gizle"))?, &P::hide_others(app, l("Hide Others", "Diğerlerini Gizle"))?, &P::show_all(app, l("Show All", "Tümünü Göster"))?, &sep()?,
            &P::quit(app, l("Quit GoodbyeApp", "GoodbyeApp'ten Çık"))?,
        ])?,
        &Submenu::with_items(app, l("File", "Dosya").unwrap(), true, &[&P::close_window(app, l("Close Window", "Pencereyi Kapat"))?])?,
        &Submenu::with_items(app, l("Edit", "Düzen").unwrap(), true, &[
            &P::undo(app, l("Undo", "Geri Al"))?, &P::redo(app, l("Redo", "Yinele"))?, &sep()?,
            &P::cut(app, l("Cut", "Kes"))?, &P::copy(app, l("Copy", "Kopyala"))?, &P::paste(app, l("Paste", "Yapıştır"))?, &P::select_all(app, l("Select All", "Tümünü Seç"))?,
        ])?,
        &Submenu::with_items(app, l("View", "Görünüm").unwrap(), true, &[&P::fullscreen(app, l("Enter Full Screen", "Tam Ekran"))?])?,
        &Submenu::with_items(app, l("Window", "Pencere").unwrap(), true, &[
            &P::minimize(app, l("Minimize", "Küçült"))?, &P::maximize(app, l("Zoom", "Yakınlaştır"))?, &sep()?, &P::close_window(app, l("Close Window", "Pencereyi Kapat"))?,
        ])?,
    ])?;
    app.set_menu(menu).map(|_| ())
}
