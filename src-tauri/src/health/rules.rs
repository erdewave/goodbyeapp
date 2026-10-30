// Health Check file rules, after CCleaner 7. Groups and categories follow CCleaner's Custom Clean, and `on` copies each
// rule's Default, so what CCleaner leaves unticked (Downloads, AI history, sign-in data…) starts unticked here.
// Folder pattern: %ENV%, ~, '*' and comma alternatives per segment; $L $R $W $P stand for %LOCALAPPDATA%, %APPDATA%,
// %SystemRoot%, %PROGRAMDATA%. Masks match file by file. Flags: r = recursive, a / d = keep files touched in the last
// hour / day, o = only files older than 14 days. Only plain file deletes are taken: CCleaner edits Web Data, Preferences
// and Firefox's places.sqlite with SQL, so those stay untouched.
use regex::Regex;

pub struct Rule { pub group: &'static str, pub category: &'static str, pub on: bool, pub folders: Vec<String>, pub masks: &'static str, pub flags: &'static str, pub skip: Option<Regex> }
fn tok(s: &str) -> String { s.replace("$L", "%LOCALAPPDATA%").replace("$R", "%APPDATA%").replace("$W", "%SystemRoot%").replace("$P", "%PROGRAMDATA%").replace("$U", "~") }
pub fn rs(group: &'static str, category: &'static str, on: bool, folders: Vec<String>, masks: &'static str, flags: &'static str, skip: Option<&str>) -> Rule {
    Rule { group, category, on, folders: folders.iter().map(|f| tok(f)).collect(), masks, flags, skip: skip.map(|r| Regex::new(r).expect("health skip pattern")) }
}
pub fn r(group: &'static str, category: &'static str, on: bool, folders: Vec<String>) -> Rule { rs(group, category, on, folders, "*", "r", None) }
pub fn rm(group: &'static str, category: &'static str, on: bool, folders: Vec<String>, masks: &'static str, flags: &'static str) -> Rule { rs(group, category, on, folders, masks, flags, None) }
pub fn apps(suffix: &str) -> Vec<String> { ["$R", "~/Library/Application Support", "~/.config"].iter().map(|a| format!("{a}{suffix}")).collect() }
pub fn browser(group: &'static str, data: &str, cache: &str, root: &str) -> Vec<Rule> {
    vec![
        rm(group, "cookies", false, fl![format!(r"{data}\Network"), data], "Cookies;Cookies-journal;Extension Cookies;Extension Cookies-journal", ""),
        r(group, "cookies", false, fl![format!(r"{data}\Local Storage,IndexedDB,databases,WebStorage,File System")]),
        rm(group, "history", true, fl![data], "History;History-journal;Archived History;Visited Links;Top Sites;Top Sites-journal;Shortcuts;Shortcuts-journal;Network Action Predictor;Network Action Predictor-journal;History Provider Cache", ""),
        r(group, "cache", true, fl![format!(r"{cache}\Cache,Code Cache,GPUCache,Media Cache,ShaderCache,GrShaderCache,GraphiteDawnCache,Application Cache,Shared Dictionary,Platform Notifications"), format!(r"{cache}\Service Worker\CacheStorage,ScriptCache"),
            format!(r"{cache}\Storage\ext\*\def\Cache,Code Cache,GPUCache,Media Cache,ShaderCache,Platform Notifications"), format!(r"{data}\EdgeCoupons\coupons_data.db"), format!(r"{root}\ShaderCache,GrShaderCache,GraphiteDawnCache,GPUPersistentCache,component_crx_cache")]),
        // CCleaner also deletes *-journal here; a running browser's SQLite journal is not ours to remove, so only .tmp files go.
        rm(group, "cache", true, fl![root, data], "*.tmp", ""), rm(group, "cache", true, fl![format!(r"{data}\EdgePushStorageWithWinRt")], "*.log", ""),
        rm(group, "metrics", true, fl![format!(r"{root}\BrowserMetrics"), root], "*.pma", ""),
        rm(group, "session", false, fl![data], "Current Session;Last Session;Current Tabs;Last Tabs", ""), r(group, "session", false, fl![format!(r"{data}\Session Storage,Extension State,Sessions")]),
    ]
}
// Every User Data subfolder counts as a profile, as in CCleaner: System Profile and Guest Profile keep caches too.
fn chromium(group: &'static str, dir: &str) -> Vec<Rule> { let data = format!(r"$L\{dir}\User Data\*"); browser(group, &data, &data, &format!(r"$L\{dir}\User Data")) }
const DOWNLOADS: [(&str, &str); 5] = [("compressed", "*.zip;*.7z;*.rar;*.tar;*.pa;*.lzh;*.bh;*.cab;*.mar;*.sfx"), ("programs", "*.exe;*.msi;*.apk;*.jar"), ("images", "*.jpg;*.jpeg;*.gif;*.png;*.svg;*.tif;*.tiff;*.raw;*.bmp;*.psd;*.wmf;*.webp;*.arw;*.cr2;*.jfif"),
    ("media", "*.mp4;*.avi;*.mov;*.flv;*.avchd;*.m4v;*.mkv;*.3gp;*.m4a;*.mp3;*.wav;*.wma;*.aac;*.flac"), ("documents", "*.pdf;*.doc;*.docx;*.html;*.htm;*.xls;*.xlss;*.txt;*.ai;*.indd;*.xlsx;*.csv;*.ppt;*.pptx;*.rtf")];
const SP: &str = r"$L\Packages\SpotifyAB.SpotifyMusic_zpdnekdrzrea0";
const WX: &str = r"$L\Packages\MicrosoftWindows.Client.WebExperience_cw5n1h2txyewy\LocalState\EBWebView";
const PH: &str = r"$L\Packages\Microsoft.Windows.Photos_8wekyb3d8bbwe\LocalState";
const SN: &str = r"$L\Packages\Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe";
const IC: &str = r"$L\Packages\AppleInc.iCloud_nzyj5cx40ttqa";
const OD: &str = r"$L\Microsoft\OneDrive";
const CC: &str = r"~\.claude";
const CL: &str = r"$L\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude";
const AG: &str = r"~\.gemini\antigravity";
const HF: &str = r"~\.cache\huggingface";
const CX: &str = r"~\.codex";
const CXW: &str = r"$L\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Roaming\Codex\web\Codex\Default";
pub fn windows() -> Vec<Rule> {
    let wa = || fl![r"%APPDATA%\WhatsApp", r"$L\Packages\5319275A.WhatsAppDesktop_cv1g1gvanyjgm\LocalCache\Roaming\WhatsApp"];
    let wa_in = |s: &str| wa().iter().map(|w| format!(r"{w}\{s}")).collect::<Vec<_>>();
    let steam = || fl![r"%ProgramFiles(x86)%\Steam", r"%ProgramFiles%\Steam"];
    let java = r"$R\Sun\Java\Deployment";
    let low = r"~\AppData\LocalLow\Sun\Java\Deployment";
    let dl = if cfg!(target_os = "windows") { "downloads" } else { "userdownloads" };
    let all_ext: Vec<String> = DOWNLOADS.iter().flat_map(|d| d.1.split(';').map(|e| e.trim_start_matches("*.").to_string())).collect();
    let typed = format!(r"(?i)\.(?:{})$", all_ext.join("|"));
    let mut v = vec![
        rm("windows", "thumbs", true, fl![r"$L\Microsoft\Windows\Explorer"], "thumbcache_*.db", ""), rm("windows", "thumbs", true, fl![r"$L\Microsoft\Windows\Explorer\ThumbCacheToDelete"], "thm*.tmp", ""),
        rm("windows", "Remote Desktop", true, fl![r"$L\Microsoft\Terminal Server Client\Cache"], "*", ""), r("windows", "d3d", false, fl![r"$L\D3DSCache"]), rm("windows", "recentdocs", false, fl![r"$R\Microsoft\Windows\Recent"], "*.lnk", ""),
        rm("system", "temp", true, fl!["%TEMP%", r"$W\Temp"], "*", "ra"), rm("system", "temp", true, fl!["$W"], "*.tmp;*.old", "a"),
        rm("system", "dumps", true, fl!["$W"], "memory.dmp", ""), rm("system", "dumps", true, fl![r"$W\Minidump", r"$L\CrashDumps"], "*.dmp", ""), rm("system", "dumps", true, fl![r"$W\LiveKernelReports"], "*.dmp", "r"),
        rm("system", "chkdsk", true, fl!["%SystemDrive%"], "File*.chk", ""), rm("system", "logs", true, fl!["$W"], "*.log;*.bak;*log.txt", ""),
        rm("system", "logs", true, fl![r"$W\Logs", r"$W\Microsoft.NET", r"$W\ServiceProfiles\LocalService,NetworkService\AppData", r"$L\Microsoft\Windows", r"$R\Microsoft\Windows", r"$L\Microsoft\CLR_v4.0,CLR_v4.0_32"], "*.log", "r"),
        rm("system", "logs", true, fl![r"$W\Debug", r"$W\SoftwareDistribution", r"$W\SoftwareDistribution\DataStore\Logs", r"$W\security\logs", r"$W\System32\wbem\Logs", r"$W\Panther", r"$W\Performance\WinSAT"], "*.log;*.lo_", ""),
        r("system", "webcache", true, fl![r"$U\AppData\LocalLow\Microsoft\CryptnetUrlCache"]),
        r("system", "wer", false, fl![r"$P\Microsoft\Windows\WER\ReportArchive,ReportQueue,Temp", r"$L\Microsoft\Windows\WER\ReportArchive,ReportQueue,Temp"]),
        rm("system", "etl", false, fl![r"$W\Logs"], "*.etl", "r"), rm("system", "etl", false, fl![r"$P\USOShared\Logs\User"], "*.etl", ""),
        rm("system", "notifications", false, fl![r"$L\Microsoft\Windows\Notifications\wpnidm"], "*.jpg", ""), rm("system", "driverlogs", false, fl![r"$W\inf"], "setupapi.app.log;setupapi.dev.log", ""),
        r("system", "delivery", false, fl![r"$W\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache"]), rm("system", "delivery", false, fl![r"$W\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Logs,State"], "*.etl;*.log", ""),
        r("apps", "Discord", true, apps(r"\discord\Cache,Code Cache,GPUCache")), rm("apps", "Discord", true, fl![r"$R\discord"], "*.png;*.ico", ""), r("apps", "Slack", true, apps(r"\Slack\Cache,Code Cache,GPUCache")),
        rm("apps", "Adobe Premiere Pro CC", true, fl![r"$R\Adobe\Common\Media Cache Files", r"$R\Adobe\Common\Media Cache"], "*.mediasrc", ""),
        rm("apps", "Microsoft OneDrive", true, fl![r"$L\Microsoft\SkyDrive\logs", format!(r"{OD}\setup\logs"), format!(r"{OD}\logs\Personal,Common,ListSync\Business1")], "*.log;*.etl;*.aodl;*.odl;*.odlgz;*.loggz;*.odlsent;*.otc", ""),
        rm("apps", "Microsoft OneDrive", true, fl![format!(r"{OD}\LogoImages")], "*.png", ""), rm("apps", "Microsoft OneDrive", true, fl![r"$L\OneDrive\cache\qmlcache"], "*.qmlc", ""),
        r("apps", "Visual Studio Code", true, apps(r"\Code\Cache,CachedData,Code Cache,GPUCache")), rm("apps", "Notepad++", false, fl![r"$R\notepad++"], "session.xml", ""),
        rm("apps", "Adobe Creative Cloud", false, fl![r"$P\Adobe\UPI\Log", r"$R\Adobe\UPI\Log", r"$L\Temp\CreativeCloud\ACC", r"$W\Temp\CreativeCloud\ACC", r"$R\Adobe\Bridge\Logs"], "*.log", ""),
        r("media", "spotify", true, fl![r"$L\Spotify\Browser\Cache,GPUCache", format!(r"{SP}\LocalCache\Spotify\Browser\Cache,GPUCache")]), r("media", "spotifyoffline", false, fl![r"$L\Spotify\Storage", format!(r"{SP}\LocalState\Spotify\Storage")]),
        rm("media", "Steam", true, steam(), "*.mdmp;*.log;*.old", ""), r("media", "Steam", true, steam().iter().map(|s| format!(r"{s}\dumps,logs")).chain([r"$L\Steam\htmlcache".to_string()]).collect()),
        r("utils", "Node.js", false, fl![r"$L\npm-cache\_cacache", "~/.npm/_cacache"]), rm("utils", "Node.js", false, fl![r"$L\npm-cache\_logs", r"$P\chocolatey\logs", "~/.npm/_logs"], "*.log", ""),
        r("utils", "widgets", false, fl![format!(r"{WX}\Default\Code Cache"), format!(r"{WX}\Default\Service Worker\CacheStorage,ScriptCache")]), rm("utils", "widgets", false, fl![format!(r"{WX}\Default\coupon_db"), format!(r"{WX}\SmartScreen\local")], "*", ""),
        r("utils", "clienttemp", false, fl![r"$L\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\TempState"]), rm("utils", "Windows Defender", false, fl![r"$P\Microsoft\Windows Defender\Scans\History\Results\Quick,Resource"], "*", ""), rm("utils", "Windows Defender", false, fl![r"$P\Microsoft\Windows Defender\Support", r"$P\Microsoft\Windows Defender\Scans\History\Service"], "*.log", ""),
        rm("utils", "AnyDesk", false, fl![r"$R\AnyDesk\thumbnails"], "*.png;*.ico", ""),
        r("winstore", "CapCut", false, fl![r"$L\Bytedance\CapCut\cache\qmlcache", r"$L\CapCut\User Data\CEF\Cache", r"$L\CapCut\User Data\Cache", r"$L\CapCut\User Data\Log\alog"]), rm("winstore", "CapCut", false, fl![r"$L\CapCut\User Data\Log"], "*.log", ""),
        rm("winstore", "photos", false, fl![PH], "*.db", "r"), rm("winstore", "photos", false, fl![PH], "*.bak;*.etl;*.xml;*.sqlite-wal;*.sqlite-shm", ""), rm("winstore", "photos", false, fl![format!(r"{PH}\PhotosAppTile")], "*.jpg", ""),
        r("winstore", "Sticky Notes", false, fl![format!(r"{SN}\AC\Microsoft\CryptnetUrlCache"), format!(r"{SN}\AC\TokenBroker\Cache")]), rm("winstore", "Sticky Notes", false, fl![format!(r"{SN}\Settings")], "*.log1;*.log2", ""), rm("winstore", "Sticky Notes", false, fl![format!(r"{SN}\AC\Temp")], "*.log", ""),
        r("ai", "claudecodehistory", false, fl![format!(r"{CC}\file-history,projects,session-env,sessions,shell-snapshots,telemetry")]), rm("ai", "claudecodehistory", false, fl![CC], "history.jsonl", ""),
        r("ai", "claudecodecache", false, fl![r"$L\claude-cli-nodejs", r"$L\Temp\claude", format!(r"{CC}\cache,daemon,jobs,plugins")]), rm("ai", "claudecodecache", false, fl![CC], ".last-cleanup;daemon.status.json;mcp-needs-auth-cache.json;policy-limits.json;remote-settings.json", ""),
        rs("ai", "claudecache", false, apps(r"\Claude\Cache,Code Cache,Crashpad,DawnGraphiteCache,DawnWebGPUCache,GPUCache,logs,sentry,Shared Dictionary").into_iter().chain([format!(r"{CL}\Cache,Code Cache,Crashpad,DawnGraphiteCache,DawnWebGPUCache,GPUCache,logs,sentry,Shared Dictionary"), r"$P\Claude\Logs".into()]).collect(), "*", "r", Some(r"(?i)[\\/]cowork-service\.log$")),
        rm("ai", "claudecache", false, apps(r"\Claude").into_iter().chain([CL.to_string()]).collect(), "DIPS;DIPS-wal;DIPS-journal;extensions-blocklist.json;fcache;InterestGroups", ""),
        r("ai", "antigravitycache", false, apps(r"\Antigravity\Cache,Code Cache,DawnGraphiteCache,DawnWebGPUCache,GPUCache,logs,Shared Dictionary").into_iter().chain([r"$L\antigravity-updater".to_string(), format!(r"{AG}\builtin,crashes,scratch")]).collect()), rm("ai", "antigravitycache", false, apps(r"\Antigravity"), "DIPS;DIPS-wal;DIPS-journal", ""),
        rs("ai", "antigravityhistory", false, apps(r"\Antigravity\blob_storage,Local Storage,Session Storage").into_iter().chain([format!(r"{AG}\annotations,brain,conversations,knowledge")]).collect(), "*", "r", Some(r"(?i)[\\/]brain[\\/][^\\/]+[\\/]\.git[\\/]")), rm("ai", "antigravityhistory", false, fl![AG], "agyhub_summaries_proto.pb", ""),
        rs("ai", "codexcache", false, fl![r"$L\OpenAI\Codex\runtimes\cua_node", format!(r"{CXW}\Cache,Code Cache,DawnGraphiteCache,DawnWebGPUCache,GPUCache,Shared Dictionary,shared_proto_db"), r"~\.cache\codex-runtimes",
            format!(r"{CX}\.sandbox-bin,.tmp,cache,node_repl,plugins,process_manager,sqlite,tmp,vendor_imports"), format!(r"{CX}\skills\.system")], "*", "r", Some(r"(?i)\\\.codex\\\.tmp\\[^\\]+\\\.git\\")), rm("ai", "codexcache", false, fl![CX], "models_cache.json", ""),
        rs("ai", "codexhistory", false, fl![format!(r"{CX}\computer-use,memories,sessions"), format!(r"{CXW}\blob_storage,IndexedDB,Local Storage,Session Storage,WebStorage")], "*", "r", Some(r"(?i)\\\.codex\\memories\\\.git\\")),
        rm("ai", "codexhistory", false, fl![CX], "goals_1.sqlite;goals_1.sqlite-shm;goals_1.sqlite-wal;history.jsonl;logs_2.sqlite;logs_2.sqlite-shm;logs_2.sqlite-wal;memories_1.sqlite;memories_1.sqlite-shm;memories_1.sqlite-wal;session_index.jsonl;state_5.sqlite;state_5.sqlite-shm;state_5.sqlite-wal", ""),
        r("ai", "hfmodels", false, fl![format!(r"{HF}\hub\models--*"), r"%HF_HOME%\hub\models--*", r"%HF_HUB_CACHE%\models--*"]),
        r("ai", "hfcache", false, fl![format!(r"{HF}\assets"), format!(r"{HF}\hub\.locks"), format!(r"{HF}\xet"), "%HF_XET_CACHE%"]), rm("ai", "hfcache", false, fl![HF], ".agent_harnesses.json;.check_for_skill_update_done;.check_for_update_done", ""), rm("ai", "hfcache", false, fl![format!(r"{HF}\hub")], "CACHEDIR.TAG", ""),
        rs("ai", "copilotcli", false, fl![r"$L\copilot", r"~\.copilot\logs"], "*", "r", Some(r"(?i)\\copilot\\marketplaces\\")), r("ai", "jetbrainsai", false, fl![r"$R\JetBrains\*\aia-task-history", r"$L\JetBrains\*\ai-assistant-log-data", r"~\.junie\acp-prompt-attachments"]),
    ];
    // Windows Downloads: the user's own files in Downloads, sorted by type; CCleaner leaves all of these unticked.
    if !cfg!(target_os = "macos") {
        v.extend(DOWNLOADS.iter().map(|(category, masks)| rm(dl, category, false, fl![r"$U\Downloads"], masks, "r")));
        v.push(rs(dl, "others", false, fl![r"$U\Downloads"], "*", "r", Some(&typed)));
    }
    v.extend([
        // CCleaner's IIS rule takes all of System32\LogFiles (firewall, WMI, live UAL databases too); only IIS's own logs are taken here.
        rm("advanced", "prefetch", false, fl![r"$W\Prefetch"], "*.pf", "ro"), r("advanced", "iislogs", false, fl![r"$W\System32\LogFiles\W3SVC*,HTTPERR,FTPSVC*", r"%SystemDrive%\inetpub\logs\LogFiles"]),
        r("internet", "Java", false, fl![format!(r"{java}\cache"), format!(r"{java}\javaws\cache"), format!(r"{java}\tmp"), format!(r"{low}\cache")]), rs("internet", "Java", false, fl![format!(r"{java}\Log"), format!(r"{low}\Log"), r"$R\java\webview"], "*", "", Some(r"(?i)\\webview\\\.lock$")),
        rm("internet", "Java", false, fl![r"$W\System32", r"$W\SysWOW64"], "jupdate*.log", ""),
        rm("internet", "whatsapplog", false, wa(), "main-process.log.*", ""), rm("internet", "whatsapplog", false, wa_in("VideoDecodeStats"), "*", ""), rm("internet", "whatsappcache", false, wa_in(r"Cache,GPUCache"), "*", ""),
        // CCleaner also strips Local Storage\leveldb down to its .ldb/.log files; a LevelDB without MANIFEST/CURRENT no longer opens, so that part is left out.
        rm("internet", "whatsappstorage", false, wa_in("Session Storage"), "*", ""), r("internet", "whatsappstorage", false, wa_in(r"Service Worker\CacheStorage")),
        r("internet", "icloudcache", false, fl![format!(r"{IC}\LocalState\EBWebView\ShaderCache,GrShaderCache\GPUCache"), format!(r"{IC}\LocalState\EBWebView\Default\Cache\Cache_Data"), format!(r"{IC}\LocalState\EBWebView\SmartScreen\local")]), rm("internet", "icloudcache", false, fl![format!(r"{IC}\LocalState\EBWebView\Default\GPUCache")], "*", ""),
        r("internet", "icloudlogs", false, fl![format!(r"{IC}\LocalState\EBWebView\Default\AutofillStrikeDatabase,data_reduction_proxy_leveldb"), r"$R\Apple Computer\Logs,Logs-Old"]), rm("internet", "icloudlogs", false, fl![format!(r"{IC}\LocalCache\Local\Logs")], "*.log", ""),
        r("internet", "icloudstorage", false, fl![format!(r"{IC}\LocalState\EBWebView\Default\Session Storage,Local Storage")]),
    ]);
    v.extend(chromium("Google Chrome", r"Google\Chrome"));
    v.push(rm("Google Chrome", "metrics", true, fl![r"%ProgramFiles%\Google\Chrome\Application\SetupMetrics"], "*.pma", "r"));
    v.extend(chromium("Edge Chromium", r"Microsoft\Edge"));
    // Firefox history lives in places.sqlite together with bookmarks, so only its cookies and cache are offered.
    v.extend([rm("Firefox", "cookies", false, fl![r"$R\Mozilla\Firefox\Profiles\*"], "cookies.sqlite;cookies.sqlite-wal;cookies.sqlite-shm", ""), r("Firefox", "cache", true, fl![r"$L\Mozilla\Firefox\Profiles\*\cache2,startupCache,jumpListCache,thumbnails,OfflineCache"])]);
    v.extend(chromium("Brave", r"BraveSoftware\Brave-Browser"));
    v.extend(browser("Opera", r"$R\Opera Software\Opera Stable,Opera GX Stable", r"$L\Opera Software\Opera Stable,Opera GX Stable", r"$R\Opera Software\Opera Stable,Opera GX Stable"));
    v.extend(chromium("Vivaldi", "Vivaldi"));
    v.push(r("Internet Explorer", "cache", true, fl![r"$L\Microsoft\Windows\INetCache"]));
    v
}
