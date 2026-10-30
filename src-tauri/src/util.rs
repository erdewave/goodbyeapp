// Shared helpers: ids, name and path safety checks, running child processes.
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};
use std::process::Command;

pub type R<T> = Result<T, String>;
pub trait Ctx<T> { fn ctx(self) -> R<T>; }
impl<T, E: std::fmt::Display> Ctx<T> for Result<T, E> { fn ctx(self) -> R<T> { self.map_err(|e| e.to_string()) } }

pub fn id(value: &str) -> String { Sha256::digest(value.as_bytes()).iter().take(12).map(|b| format!("{b:02x}")).collect() }
const SHARED: [&str; 18] = [".", "..", "microsoft", "windows", "apple", "google", "shared", "common", "common files", "software", "temp", "classes", "policies", "wow6432node", "programs", "packages", "windowsapps", "windows nt"];
pub fn safe_name(name: &str) -> bool {
    let (len, lower) = (name.encode_utf16().count(), name.to_lowercase());
    (3..180).contains(&len) && !name.chars().any(|c| "\\/:*?\"<>|".contains(c) || (c as u32) < 32) && !SHARED.contains(&lower.as_str()) && lower != "desktop"
}
pub fn safe_opt(name: &Option<String>) -> bool { name.as_deref().is_some_and(safe_name) }
fn lexical(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() { match c { Component::ParentDir => { out.pop(); } Component::CurDir => {} c => out.push(c.as_os_str()) } }
    out
}
pub fn resolve(p: &Path) -> PathBuf { lexical(&std::path::absolute(p).unwrap_or_else(|_| p.to_path_buf())) }
// Windows paths compare case-insensitively.
fn key(p: &Path) -> PathBuf { let r = resolve(p); if cfg!(windows) { PathBuf::from(r.to_string_lossy().to_lowercase()) } else { r } }
pub fn same(a: &Path, b: &Path) -> bool { key(a) == key(b) }
pub fn contained(root: &Path, target: &Path) -> bool { let (r, t) = (key(root), key(target)); t != r && t.starts_with(&r) }
pub fn env(name: &str) -> Option<PathBuf> { std::env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from) }
pub fn home() -> PathBuf { env(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default() }
pub fn s(p: &Path) -> String { p.to_string_lossy().into_owned() }
// Replaces %NAME% with the environment value; unknown names stay as written.
pub fn expand(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('%') {
        let Some(len) = rest[start + 1..].find('%') else { break };
        let name = &rest[start + 1..start + 1 + len];
        out.push_str(&rest[..start]);
        match std::env::var(name) { Ok(v) if !name.is_empty() => out.push_str(&v), _ => out.push_str(&rest[start..start + len + 2]) }
        rest = &rest[start + len + 2..];
    }
    out + rest
}

// Runs a program without a console window; Err carries stderr (or the spawn error).
pub fn run(file: &str, args: &[&str]) -> R<String> {
    let mut cmd = Command::new(file);
    cmd.args(args);
    #[cfg(windows)] std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000);
    let out = cmd.output().map_err(|e| e.to_string())?;
    let text = |b: &[u8]| String::from_utf8_lossy(b).trim().to_string();
    if out.status.success() { Ok(text(&out.stdout)) } else { Err(Some(text(&out.stderr)).filter(|e| !e.is_empty()).unwrap_or_else(|| format!("exit {}", out.status.code().unwrap_or(-1)))) }
}
pub fn quote(value: &str) -> String { format!("'{}'", value.replace('\'', "''")) }
fn encode(script: &str) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    STANDARD.encode(script.encode_utf16().flat_map(u16::to_le_bytes).collect::<Vec<u8>>())
}
pub fn ps(script: &str) -> R<String> {
    run("powershell.exe", &["-NoProfile", "-NonInteractive", "-EncodedCommand", &encode(&format!("$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8;{script}"))])
}
pub fn encoded(script: &str) -> String { encode(&format!("$ErrorActionPreference='Stop';{script}")) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_names_and_traversal_are_not_candidates() {
        for n in ["..", "../escape", "Windows", "Microsoft", "Software", "a/b", "a\\b", "C:", ""] { assert!(!safe_name(n), "{n}"); }
        assert!(safe_name("Example App") && safe_name("org.example.App"));
    }
    #[test]
    fn containment_rejects_roots_siblings_and_traversal() {
        let root = resolve(Path::new("sandbox"));
        assert!(!contained(&root, &root));
        assert!(!contained(&root, Path::new(&format!("{}-other", root.display()))));
        assert!(!contained(&root, &root.join("..").join("other")));
        assert!(contained(&root, &root.join("App")));
    }
}
