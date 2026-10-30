// Treemap nodes in the shape the renderer's Treemap takes. Colours are the renderer's job.
use crate::types::TreeNode;
use std::{collections::{BTreeMap, HashMap}, path::MAIN_SEPARATOR};

// ponytail: entries under 1/4000 of the disk (about 8x8 px on the map) stay as an unlabelled area in their folder,
// unless that area would itself be tile-sized (see build_tree); a finer share means more DOM tiles.
pub const SHARE: f64 = 1.0 / 4000.0;
pub fn join(at: &str, name: &str) -> String { if at.ends_with(['\\', '/']) { format!("{at}{name}") } else { format!("{at}{MAIN_SEPARATOR}{name}") } }
// Rolls each entry's own bytes up to the root, then keeps the entries worth at least SHARE of the whole disk.
pub fn build_tree(parent: &[u32], name: &dyn Fn(usize) -> String, own: &[f64], root: usize, root_path: &str) -> TreeNode {
    let n = parent.len();
    let mut total = vec![0f64; n];
    for i in 0..n {
        if own[i] == 0.0 { continue; }
        total[i] += own[i];
        let (mut p, mut depth) = (i, 0);
        while p != root && depth < 512 { p = parent[p] as usize; if p >= n { break; } total[p] += own[i]; depth += 1; }
    }
    let min = total[root] * SHARE;
    let (mut kept, mut kids): (Vec<bool>, HashMap<usize, Vec<usize>>) = (vec![false; n], HashMap::new());
    kept[root] = true;
    fn keep(i: usize, parent: &[u32], kept: &mut [bool], kids: &mut HashMap<usize, Vec<usize>>) { kept[i] = true; kids.entry(parent[i] as usize).or_default().push(i); }
    for i in 0..n { if i != root && total[i] > 0.0 && total[i] >= min { keep(i, parent, &mut kept, &mut kids); } }
    // Many entries just under min (a game's hundreds of 120 MB packs) would merge into one huge unlabelled area,
    // so a folder whose remainder is still tile-sized also keeps its largest smaller entries, down to min/4 (~4x4 px).
    let mut near: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for i in 0..n { let p = parent[i] as usize; if !kept[i] && total[i] > 0.0 && total[i] >= min / 4.0 && p < n && kept[p] { near.entry(p).or_default().push(i); } }
    for (p, mut list) in near {
        let mut rest = total[p] - kids.get(&p).map_or(0.0, |k| k.iter().map(|&c| total[c]).sum());
        list.sort_by(|&a, &b| total[b].total_cmp(&total[a]));
        for c in list { if rest < min { break; } keep(c, parent, &mut kept, &mut kids); rest -= total[c]; }
    }
    // Entries too small for a tile count toward their folder's remainder.
    fn node(i: usize, at: &str, total: &[f64], kids: &mut HashMap<usize, Vec<usize>>, name: &dyn Fn(usize) -> String) -> TreeNode {
        let Some(mut list) = kids.remove(&i) else { return TreeNode { id: at.into(), label: name(i), value: Some(total[i]), children: None } };
        list.sort_by(|&a, &b| total[b].total_cmp(&total[a]));
        let rest = total[i] - list.iter().map(|&c| total[c]).sum::<f64>();
        let mut children: Vec<TreeNode> = list.into_iter().map(|c| node(c, &join(at, &name(c)), total, kids, name)).collect();
        if rest > 0.0 { children.push(TreeNode { id: format!("{at}\0"), label: String::new(), value: Some(rest), children: None }); }
        TreeNode { id: at.into(), label: name(i), value: None, children: Some(children) }
    }
    node(root, root_path, &total, &mut kids, name)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rolls_up_and_keeps_big_entries() {
        // 0 = root, 1 = big folder, 2 = big file in it, 3 = tiny file in root
        let parent = [0, 0, 1, 0];
        let names = ["", "dir", "a.bin", "tiny"];
        let root = if cfg!(windows) { "C:\\" } else { "/" };
        let tree = build_tree(&parent, &|i| names[i].to_string(), &[0.0, 0.0, 1_000_000.0, 1.0], 0, root);
        let kids = tree.children.unwrap();
        assert_eq!(kids[0].label, "dir");
        assert_eq!(kids[0].children.as_ref().unwrap()[0].id, join(&join(root, "dir"), "a.bin"));
        assert!(kids.last().unwrap().id.ends_with('\0'));
    }
}
