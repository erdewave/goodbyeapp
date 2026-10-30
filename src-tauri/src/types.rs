// Records exchanged with the renderer (camelCase JSON, same shapes the Electron build used).
use serde::{Deserialize, Serialize};

fn no(b: &bool) -> bool { !*b }
// Main-process record. `public()` strips command/registry/iconSource before an app reaches the renderer.
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct AppRecord {
    pub id: String, pub name: String, pub version: String, pub publisher: String, pub size: u64, pub source: String,
    #[serde(skip_serializing_if = "no")] pub removed: bool,
    #[serde(skip_serializing_if = "Option::is_none")] pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub registry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub icon_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub install_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub bundle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub scope: Option<String>,
}
impl AppRecord {
    pub fn public(&self) -> AppRecord { AppRecord { command: None, registry: None, icon_source: None, ..self.clone() } }
}
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Kind { File, Registry }
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Item {
    pub id: String, pub kind: Kind, pub path: String, pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")] pub root: Option<String>,
}
#[derive(Serialize, Clone, Debug)]
pub struct CleanResult {
    pub path: String, pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")] pub backup: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub error: Option<String>,
}
impl CleanResult {
    pub fn ok(path: &str, backup: Option<String>) -> Self { Self { path: path.into(), ok: true, backup, error: None } }
    pub fn fail(path: &str, error: String) -> Self { Self { path: path.into(), ok: false, backup: None, error: Some(error) } }
}
#[derive(Serialize, Clone, Debug)]
pub struct Drive { pub root: String, pub label: String, pub total: u64, pub free: u64 }
#[derive(Serialize, Clone, Debug)]
pub struct FileHit {
    pub path: String, pub size: u64, pub ino: u64,
    #[serde(skip_serializing_if = "Option::is_none")] pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub modified: Option<f64>,
}
// Treemap node: folders carry children, files and remainders carry a value; remainder ids end in \0.
#[derive(Serialize, Clone, Debug)]
pub struct TreeNode {
    pub id: String, pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")] pub value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")] pub children: Option<Vec<TreeNode>>,
}
#[derive(Serialize, Clone, Debug)]
pub struct DriveReport { pub root: String, pub scanned: u64, pub current: String, pub done: bool, pub mode: &'static str, pub files: Vec<FileHit>, #[serde(skip_serializing_if = "Option::is_none")] pub tree: Option<TreeNode> }
#[derive(Serialize, Clone, Debug, Default)]
pub struct HealthItem {
    pub id: String, pub group: String, pub category: String, pub on: bool, pub kind: String, pub path: String, pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")] pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")] pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub name: Option<String>,
    #[serde(skip)] pub files: Vec<String>,
    #[serde(skip)] pub dirs: Vec<String>,
}
