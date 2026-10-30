// The Windows release binary asks for administrator rights (MFT scan, registry cleanup), like the Electron build did.
// Debug builds and tests keep the default manifest so they start from a normal shell; so does a release build made
// with GOODBYEAPP_NO_ADMIN set (to measure or script it without a UAC prompt).
const ADMIN_MANIFEST: &str = r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency><dependentAssembly><assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/></dependentAssembly></dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="requireAdministrator" uiAccess="false"/></requestedPrivileges></security></trustInfo>
</assembly>"#;
fn main() {
    let mut attributes = tauri_build::Attributes::new();
    println!("cargo:rerun-if-env-changed=GOODBYEAPP_NO_ADMIN");
    if std::env::var("PROFILE").is_ok_and(|p| p == "release") && std::env::var_os("GOODBYEAPP_NO_ADMIN").is_none() {
        attributes = attributes.windows_attributes(tauri_build::WindowsAttributes::new().app_manifest(ADMIN_MANIFEST));
    }
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
