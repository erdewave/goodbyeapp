import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ps, run, quote } from './platform';
import { t } from './i18n';
import type { CleanResult, HealthItem } from './types';
// Health Check, after CCleaner 7. Groups and categories follow CCleaner's Custom Clean (its rule Tags: ccwindows, ccsystem,
// ccapps, ccmedia, ccutils, ccwinstore, ccai, Downloads, ccadvanced, ccinternet, then one group per browser), and `on`
// copies each rule's Default, so what CCleaner leaves unticked (Downloads, AI history, sign-in data…) starts unticked here.
// File rules: folder pattern (%ENV%, '*' and comma alternatives per segment) + file masks, matched file by file.
// Only plain file deletes are taken: CCleaner edits Web Data, Preferences and Firefox's places.sqlite with SQL, so those stay untouched.
type Rule = [string, string, boolean, string[], string, string, RegExp?]; // group, category, on, folders, masks, flags (r = recursive, a / d = keep files touched in the last hour / day, o = only files older than 14 days), skip
type RegRule = [string, string, boolean, string[]]; // group, category, on, keys: 'KEY' deletes the key, 'KEY|Value' one value, 'KEY|*' every value (subkeys stay)
type RegHit = { c: string; k: string; n?: string; d: string };
const HOUR = 60 * 60 * 1000, age = (flags: string) => flags.includes('a') ? HOUR : flags.includes('d') ? 24 * HOUR : flags.includes('o') ? 14 * 24 * HOUR : 0, SKIP = /\\WebCache\\|\\pfro\.log$/i; // WebCache holds a live ESE database's transaction logs
const id = (value: string) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
const glob = (g: string) => new RegExp('^(?:' + g.split(/[;,]/).map(p => p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')).join('|') + ')$', 'i');
const f = (group: string, category: string, on: boolean, folders: string[], masks = '*', flags = 'r', skip?: RegExp): Rule => [group, category, on, folders, masks, flags, skip];
const L = '%LOCALAPPDATA%', R = '%APPDATA%', W = '%SystemRoot%', U = '~', P = '%PROGRAMDATA%', E = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer';
const browser = (group: string, data: string, cache = data, root = data): Rule[] => [
  f(group, 'cookies', false, [data + '\\Network', data], 'Cookies;Cookies-journal;Extension Cookies;Extension Cookies-journal', ''),
  f(group, 'cookies', false, [data + '\\Local Storage,IndexedDB,databases,WebStorage,File System']),
  f(group, 'history', true, [data], 'History;History-journal;Archived History;Visited Links;Top Sites;Top Sites-journal;Shortcuts;Shortcuts-journal;Network Action Predictor;Network Action Predictor-journal;History Provider Cache', ''),
  f(group, 'cache', true, [cache + '\\Cache,Code Cache,GPUCache,Media Cache,ShaderCache,GrShaderCache,GraphiteDawnCache,Application Cache,Shared Dictionary,Platform Notifications', cache + '\\Service Worker\\CacheStorage,ScriptCache',
    cache + '\\Storage\\ext\\*\\def\\Cache,Code Cache,GPUCache,Media Cache,ShaderCache,Platform Notifications', data + '\\EdgeCoupons\\coupons_data.db', root + '\\ShaderCache,GrShaderCache,GraphiteDawnCache,GPUPersistentCache,component_crx_cache']),
  // CCleaner also deletes *-journal here; a running browser's SQLite journal is not ours to remove, so only .tmp files go.
  f(group, 'cache', true, [root, data], '*.tmp', ''), f(group, 'cache', true, [data + '\\EdgePushStorageWithWinRt'], '*.log', ''),
  f(group, 'metrics', true, [root + '\\BrowserMetrics', root], '*.pma', ''),
  f(group, 'session', false, [data], 'Current Session;Last Session;Current Tabs;Last Tabs', ''), f(group, 'session', false, [data + '\\Session Storage,Extension State,Sessions']),
];
// Every User Data subfolder counts as a profile, as in CCleaner: System Profile and Guest Profile keep caches too.
const chromium = (group: string, dir: string) => browser(group, `${L}\\${dir}\\User Data\\*`, undefined, `${L}\\${dir}\\User Data`);
const downloads = { compressed: '*.zip;*.7z;*.rar;*.tar;*.pa;*.lzh;*.bh;*.cab;*.mar;*.sfx', programs: '*.exe;*.msi;*.apk;*.jar', images: '*.jpg;*.jpeg;*.gif;*.png;*.svg;*.tif;*.tiff;*.raw;*.bmp;*.psd;*.wmf;*.webp;*.arw;*.cr2;*.jfif',
  media: '*.mp4;*.avi;*.mov;*.flv;*.avchd;*.m4v;*.mkv;*.3gp;*.m4a;*.mp3;*.wav;*.wma;*.aac;*.flac', documents: '*.pdf;*.doc;*.docx;*.html;*.htm;*.xls;*.xlss;*.txt;*.ai;*.indd;*.xlsx;*.csv;*.ppt;*.pptx;*.rtf' };
const DOWNLOADS = process.platform === 'win32' ? 'downloads' : 'userdownloads';
const typed = new RegExp('\\.(?:' + Object.values(downloads).join(';').replace(/\*\./g, '').split(';').join('|') + ')$', 'i');
const MA = '~/Library/Application Support', MC = '~/Library/Caches', XC = '~/.config', XK = '~/.cache';
const APPS = [R, MA, XC], CC = U + '\\.claude', CL = L + '\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Roaming\\Claude', AG = U + '\\.gemini\\antigravity', HF = U + '\\.cache\\huggingface', SP = L + '\\Packages\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0';
const WX = L + '\\Packages\\MicrosoftWindows.Client.WebExperience_cw5n1h2txyewy\\LocalState\\EBWebView', PH = L + '\\Packages\\Microsoft.Windows.Photos_8wekyb3d8bbwe\\LocalState', SN = L + '\\Packages\\Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe';
const CX = U + '\\.codex', CXW = L + '\\Packages\\OpenAI.Codex_2p2nqsd0c76g0\\LocalCache\\Roaming\\Codex\\web\\Codex\\Default', WA = ['%APPDATA%\\WhatsApp', L + '\\Packages\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm\\LocalCache\\Roaming\\WhatsApp'];
const IC = L + '\\Packages\\AppleInc.iCloud_nzyj5cx40ttqa', OD = L + '\\Microsoft\\OneDrive', STEAM = ['%ProgramFiles(x86)%\\Steam', '%ProgramFiles%\\Steam'], JAVA = R + '\\Sun\\Java\\Deployment', JAVA_LOW = U + '\\AppData\\LocalLow\\Sun\\Java\\Deployment';
// macOS follows CCleaner for Mac 2.11 (CleaningEngine.framework config.json and SharedKit's browser readers): caches, logs and
// trash from Root, Home and app sandboxes, Downloads with Mail attachments, Xcode data. It cleans no temp folder there.
// Linux has no CCleaner, so its rules are our own. Windows-only rules find no folders on either and their groups stay hidden.
const mac = process.platform === 'darwin', CONTAINERS = '~/Library/Containers/*/Data/Library', MAIL = '~/Library/Containers/com.apple.mail/Data';
// Browser caches belong to their browser groups; fontconfig and Java are CCleaner's own Cache.User exclusions.
const USER_CACHE_SKIP = /[\\/](?:Caches|\.cache)[\\/](Google|Firefox|BraveSoftware|Microsoft Edge|Vivaldi|com\.operasoftware\.Opera|com\.apple\.Safari|fontconfig|Java|google-chrome|chromium|mozilla|microsoft-edge|vivaldi|opera|thumbnails|huggingface)[\\/]/i;
const macRules: Rule[] = !mac ? [] : [
  f('system', 'usercache', true, [MC], '*', 'r', USER_CACHE_SKIP), f('system', 'usercache', true, ['/Library/Caches']), f('system', 'usercache', true, [CONTAINERS + '/Caches'], '*', 'r', /[\\/]Containers[\\/]com\.apple\.Safari[\\/]/i),
  // Cache.Darwin is DARWIN_USER_CACHE_DIR, the C folder next to $TMPDIR (T) under /var/folders.
  ...(process.env.TMPDIR ? [f('system', 'usercache', true, [path.join(process.env.TMPDIR, '..', 'C')], '*', 'r', /[\\/](com\.apple\.FontRegistry|com\.apple\.metadata\.mdworker)[\\/]/)] : []),
  f('system', 'userlogs', true, ['~/Library/Logs'], '*', 'r', /[\\/]Logs[\\/](AvastCleanup|AVGTuneUp|CCleaner)[\\/]/), f('system', 'userlogs', true, ['/Library/Logs', CONTAINERS + '/Logs']),
  f('system', 'trash', true, ['~/.Trash']), f('system', 'trash', true, ['/Volumes/*/.Trashes'], '*', 'r', /[\\/]MobileBackups[\\/]/),
  f('system', 'downloads', false, ['~/Downloads', '~/MailDownloads', '~/Mail Downloads', '~/Library/MailDownloads', '~/Library/Mail Downloads', MAIL + '/MailDownloads', MAIL + '/Mail Downloads', MAIL + '/Library/Mail Downloads']),
  f('apps', 'Xcode - DerivedData', true, ['~/Library/Developer/Xcode/DerivedData']), f('apps', 'Xcode - Simulators', false, ['~/Library/Developer/Xcode/Simulators']),
  // Safari history is SQL inside History.db (CCleaner runs DELETE FROM history_visits), so only its caches and cookie jar are files to remove.
  f('Safari', 'cache', true, [MC + '/com.apple.Safari', '~/Library/Containers/com.apple.Safari/Data/Library/Caches/com.apple.Safari,WebKit'], '*', 'r', /[\\/]com\.apple\.Safari[\\/]Extensions[\\/]/),
  f('Safari', 'cookies', false, ['~/Library/Cookies', '~/Library/Containers/com.apple.Safari/Data/Library/Cookies'], 'Cookies.binarycookies', ''),
  ...browser('Google Chrome', MA + '/Google/Chrome/*', MC + '/Google/Chrome/*', MA + '/Google/Chrome'), ...browser('Edge Chromium', MA + '/Microsoft Edge/*', MC + '/Microsoft Edge/*', MA + '/Microsoft Edge'),
  ...browser('Brave', MA + '/BraveSoftware/Brave-Browser/*', MC + '/BraveSoftware/Brave-Browser/*', MA + '/BraveSoftware/Brave-Browser'), ...browser('Vivaldi', MA + '/Vivaldi/*', MC + '/Vivaldi/*', MA + '/Vivaldi'),
  ...browser('Opera', MA + '/com.operasoftware.Opera', MC + '/com.operasoftware.Opera'),
  f('Firefox', 'cookies', false, [MA + '/Firefox/Profiles/*'], 'cookies.sqlite;cookies.sqlite-wal;cookies.sqlite-shm', ''), f('Firefox', 'cache', true, [MC + '/Firefox/Profiles/*/cache2,startupCache,jumpListCache,thumbnails,OfflineCache']),
];
const linuxRules: Rule[] = process.platform !== 'linux' ? [] : [
  f('system', 'temp', true, ['/tmp', '/var/tmp'], '*', 'rd'), f('system', 'trash', true, ['~/.local/share/Trash/files,info']),
  f('system', 'usercache', true, [XK], '*', 'r', USER_CACHE_SKIP), f('system', 'thumbs', true, [XK + '/thumbnails']),
  f('system', 'userlogs', true, ['~'], '.xsession-errors;.xsession-errors.old', ''), f('system', 'userlogs', true, ['~/.local/share/xorg'], '*.log', ''),
  ...browser('Google Chrome', XC + '/google-chrome/*', XK + '/google-chrome/*', XC + '/google-chrome'), ...browser('Edge Chromium', XC + '/microsoft-edge/*', XK + '/microsoft-edge/*', XC + '/microsoft-edge'),
  ...browser('Brave', XC + '/BraveSoftware/Brave-Browser/*', XK + '/BraveSoftware/Brave-Browser/*', XC + '/BraveSoftware/Brave-Browser'), ...browser('Vivaldi', XC + '/vivaldi/*', XK + '/vivaldi/*', XC + '/vivaldi'),
  ...browser('Opera', XC + '/opera', XK + '/opera'),
  f('Firefox', 'cookies', false, ['~/.mozilla/firefox/*'], 'cookies.sqlite;cookies.sqlite-wal;cookies.sqlite-shm', ''), f('Firefox', 'cache', true, [XK + '/mozilla/firefox/*/cache2,startupCache,thumbnails,OfflineCache']),
];
const rules: Rule[] = [
  ...macRules, ...linuxRules,
  f('windows', 'thumbs', true, [L + '\\Microsoft\\Windows\\Explorer'], 'thumbcache_*.db', ''), f('windows', 'thumbs', true, [L + '\\Microsoft\\Windows\\Explorer\\ThumbCacheToDelete'], 'thm*.tmp', ''),
  f('windows', 'Remote Desktop', true, [L + '\\Microsoft\\Terminal Server Client\\Cache'], '*', ''), f('windows', 'd3d', false, [L + '\\D3DSCache']), f('windows', 'recentdocs', false, [R + '\\Microsoft\\Windows\\Recent'], '*.lnk', ''),
  f('system', 'temp', true, ['%TEMP%', W + '\\Temp'], '*', 'ra'), f('system', 'temp', true, [W], '*.tmp;*.old', 'a'),
  f('system', 'dumps', true, [W], 'memory.dmp', ''), f('system', 'dumps', true, [W + '\\Minidump', L + '\\CrashDumps'], '*.dmp', ''), f('system', 'dumps', true, [W + '\\LiveKernelReports'], '*.dmp'),
  f('system', 'chkdsk', true, ['%SystemDrive%'], 'File*.chk', ''), f('system', 'logs', true, [W], '*.log;*.bak;*log.txt', ''),
  f('system', 'logs', true, [W + '\\Logs', W + '\\Microsoft.NET', W + '\\ServiceProfiles\\LocalService,NetworkService\\AppData', L + '\\Microsoft\\Windows', R + '\\Microsoft\\Windows', L + '\\Microsoft\\CLR_v4.0,CLR_v4.0_32'], '*.log'),
  f('system', 'logs', true, [W + '\\Debug', W + '\\SoftwareDistribution', W + '\\SoftwareDistribution\\DataStore\\Logs', W + '\\security\\logs', W + '\\System32\\wbem\\Logs', W + '\\Panther', W + '\\Performance\\WinSAT'], '*.log;*.lo_', ''),
  f('system', 'webcache', true, [U + '\\AppData\\LocalLow\\Microsoft\\CryptnetUrlCache']),
  f('system', 'wer', false, [P + '\\Microsoft\\Windows\\WER\\ReportArchive,ReportQueue,Temp', L + '\\Microsoft\\Windows\\WER\\ReportArchive,ReportQueue,Temp']),
  f('system', 'etl', false, [W + '\\Logs'], '*.etl'), f('system', 'etl', false, [P + '\\USOShared\\Logs\\User'], '*.etl', ''),
  f('system', 'notifications', false, [L + '\\Microsoft\\Windows\\Notifications\\wpnidm'], '*.jpg', ''), f('system', 'driverlogs', false, [W + '\\inf'], 'setupapi.app.log;setupapi.dev.log', ''),
  f('system', 'delivery', false, [W + '\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache']), f('system', 'delivery', false, [W + '\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Logs,State'], '*.etl;*.log', ''),
  f('apps', 'Discord', true, APPS.map(a => a + '\\discord\\Cache,Code Cache,GPUCache')), f('apps', 'Discord', true, [R + '\\discord'], '*.png;*.ico', ''), f('apps', 'Slack', true, APPS.map(a => a + '\\Slack\\Cache,Code Cache,GPUCache')),
  f('apps', 'Adobe Premiere Pro CC', true, [R + '\\Adobe\\Common\\Media Cache Files', R + '\\Adobe\\Common\\Media Cache'], '*.mediasrc', ''),
  f('apps', 'Microsoft OneDrive', true, [L + '\\Microsoft\\SkyDrive\\logs', OD + '\\setup\\logs', OD + '\\logs\\Personal,Common,ListSync\\Business1'], '*.log;*.etl;*.aodl;*.odl;*.odlgz;*.loggz;*.odlsent;*.otc', ''),
  f('apps', 'Microsoft OneDrive', true, [OD + '\\LogoImages'], '*.png', ''), f('apps', 'Microsoft OneDrive', true, [L + '\\OneDrive\\cache\\qmlcache'], '*.qmlc', ''),
  f('apps', 'Visual Studio Code', true, APPS.map(a => a + '\\Code\\Cache,CachedData,Code Cache,GPUCache')), f('apps', 'Notepad++', false, [R + '\\notepad++'], 'session.xml', ''),
  f('apps', 'Adobe Creative Cloud', false, [P + '\\Adobe\\UPI\\Log', R + '\\Adobe\\UPI\\Log', L + '\\Temp\\CreativeCloud\\ACC', W + '\\Temp\\CreativeCloud\\ACC', R + '\\Adobe\\Bridge\\Logs'], '*.log', ''),
  f('media', 'spotify', true, [L + '\\Spotify\\Browser\\Cache,GPUCache', SP + '\\LocalCache\\Spotify\\Browser\\Cache,GPUCache']), f('media', 'spotifyoffline', false, [L + '\\Spotify\\Storage', SP + '\\LocalState\\Spotify\\Storage']),
  f('media', 'Steam', true, STEAM, '*.mdmp;*.log;*.old', ''), f('media', 'Steam', true, [...STEAM.map(s => s + '\\dumps,logs'), L + '\\Steam\\htmlcache']),
  f('utils', 'Node.js', false, [L + '\\npm-cache\\_cacache', '~/.npm/_cacache']), f('utils', 'Node.js', false, [L + '\\npm-cache\\_logs', P + '\\chocolatey\\logs', '~/.npm/_logs'], '*.log', ''),
  f('utils', 'widgets', false, [WX + '\\Default\\Code Cache', WX + '\\Default\\Service Worker\\CacheStorage,ScriptCache']), f('utils', 'widgets', false, [WX + '\\Default\\coupon_db', WX + '\\SmartScreen\\local'], '*', ''),
  f('utils', 'clienttemp', false, [L + '\\Packages\\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\\TempState']), f('utils', 'Windows Defender', false, [P + '\\Microsoft\\Windows Defender\\Scans\\History\\Results\\Quick,Resource'], '*', ''), f('utils', 'Windows Defender', false, [P + '\\Microsoft\\Windows Defender\\Support', P + '\\Microsoft\\Windows Defender\\Scans\\History\\Service'], '*.log', ''),
  f('utils', 'AnyDesk', false, [R + '\\AnyDesk\\thumbnails'], '*.png;*.ico', ''),
  f('winstore', 'CapCut', false, [L + '\\Bytedance\\CapCut\\cache\\qmlcache', L + '\\CapCut\\User Data\\CEF\\Cache', L + '\\CapCut\\User Data\\Cache', L + '\\CapCut\\User Data\\Log\\alog']), f('winstore', 'CapCut', false, [L + '\\CapCut\\User Data\\Log'], '*.log', ''),
  f('winstore', 'photos', false, [PH], '*.db'), f('winstore', 'photos', false, [PH], '*.bak;*.etl;*.xml;*.sqlite-wal;*.sqlite-shm', ''), f('winstore', 'photos', false, [PH + '\\PhotosAppTile'], '*.jpg', ''),
  f('winstore', 'Sticky Notes', false, [SN + '\\AC\\Microsoft\\CryptnetUrlCache', SN + '\\AC\\TokenBroker\\Cache']), f('winstore', 'Sticky Notes', false, [SN + '\\Settings'], '*.log1;*.log2', ''), f('winstore', 'Sticky Notes', false, [SN + '\\AC\\Temp'], '*.log', ''),
  f('ai', 'claudecodehistory', false, [CC + '\\file-history,projects,session-env,sessions,shell-snapshots,telemetry']), f('ai', 'claudecodehistory', false, [CC], 'history.jsonl', ''),
  f('ai', 'claudecodecache', false, [L + '\\claude-cli-nodejs', L + '\\Temp\\claude', CC + '\\cache,daemon,jobs,plugins']), f('ai', 'claudecodecache', false, [CC], '.last-cleanup;daemon.status.json;mcp-needs-auth-cache.json;policy-limits.json;remote-settings.json', ''),
  f('ai', 'claudecache', false, [...APPS.map(a => a + '\\Claude\\Cache,Code Cache,Crashpad,DawnGraphiteCache,DawnWebGPUCache,GPUCache,logs,sentry,Shared Dictionary'), CL + '\\Cache,Code Cache,Crashpad,DawnGraphiteCache,DawnWebGPUCache,GPUCache,logs,sentry,Shared Dictionary', P + '\\Claude\\Logs'], '*', 'r', /[\\/]cowork-service\.log$/i),
  f('ai', 'claudecache', false, [...APPS.map(a => a + '\\Claude'), CL], 'DIPS;DIPS-wal;DIPS-journal;extensions-blocklist.json;fcache;InterestGroups', ''),
  f('ai', 'antigravitycache', false, [...APPS.map(a => a + '\\Antigravity\\Cache,Code Cache,DawnGraphiteCache,DawnWebGPUCache,GPUCache,logs,Shared Dictionary'), L + '\\antigravity-updater', AG + '\\builtin,crashes,scratch']), f('ai', 'antigravitycache', false, APPS.map(a => a + '\\Antigravity'), 'DIPS;DIPS-wal;DIPS-journal', ''),
  f('ai', 'antigravityhistory', false, [...APPS.map(a => a + '\\Antigravity\\blob_storage,Local Storage,Session Storage'), AG + '\\annotations,brain,conversations,knowledge'], '*', 'r', /[\\/]brain[\\/][^\\/]+[\\/]\.git[\\/]/i), f('ai', 'antigravityhistory', false, [AG], 'agyhub_summaries_proto.pb', ''),
  f('ai', 'codexcache', false, [L + '\\OpenAI\\Codex\\runtimes\\cua_node', CXW + '\\Cache,Code Cache,DawnGraphiteCache,DawnWebGPUCache,GPUCache,Shared Dictionary,shared_proto_db', U + '\\.cache\\codex-runtimes',
    CX + '\\.sandbox-bin,.tmp,cache,node_repl,plugins,process_manager,sqlite,tmp,vendor_imports', CX + '\\skills\\.system'], '*', 'r', /\\\.codex\\\.tmp\\[^\\]+\\\.git\\/i), f('ai', 'codexcache', false, [CX], 'models_cache.json', ''),
  f('ai', 'codexhistory', false, [CX + '\\computer-use,memories,sessions', CXW + '\\blob_storage,IndexedDB,Local Storage,Session Storage,WebStorage'], '*', 'r', /\\\.codex\\memories\\\.git\\/i),
  f('ai', 'codexhistory', false, [CX], 'goals_1.sqlite;goals_1.sqlite-shm;goals_1.sqlite-wal;history.jsonl;logs_2.sqlite;logs_2.sqlite-shm;logs_2.sqlite-wal;memories_1.sqlite;memories_1.sqlite-shm;memories_1.sqlite-wal;session_index.jsonl;state_5.sqlite;state_5.sqlite-shm;state_5.sqlite-wal', ''),
  f('ai', 'hfmodels', false, [HF + '\\hub\\models--*', '%HF_HOME%\\hub\\models--*', '%HF_HUB_CACHE%\\models--*']),
  f('ai', 'hfcache', false, [HF + '\\assets', HF + '\\hub\\.locks', HF + '\\xet', '%HF_XET_CACHE%']), f('ai', 'hfcache', false, [HF], '.agent_harnesses.json;.check_for_skill_update_done;.check_for_update_done', ''), f('ai', 'hfcache', false, [HF + '\\hub'], 'CACHEDIR.TAG', ''),
  f('ai', 'copilotcli', false, [L + '\\copilot', U + '\\.copilot\\logs'], '*', 'r', /\\copilot\\marketplaces\\/i), f('ai', 'jetbrainsai', false, [R + '\\JetBrains\\*\\aia-task-history', L + '\\JetBrains\\*\\ai-assistant-log-data', U + '\\.junie\\acp-prompt-attachments']),
  // Windows Downloads: the user's own files in Downloads, sorted by type; CCleaner leaves all of these unticked.
  ...(mac ? [] : [...Object.entries(downloads).map(([category, masks]) => f(DOWNLOADS, category, false, [U + '\\Downloads'], masks)), f(DOWNLOADS, 'others', false, [U + '\\Downloads'], '*', 'r', typed)]),
  // CCleaner's IIS rule takes all of System32\LogFiles (firewall, WMI, live UAL databases too); only IIS's own logs are taken here.
  f('advanced', 'prefetch', false, [W + '\\Prefetch'], '*.pf', 'ro'), f('advanced', 'iislogs', false, [W + '\\System32\\LogFiles\\W3SVC*,HTTPERR,FTPSVC*', '%SystemDrive%\\inetpub\\logs\\LogFiles']),
  f('internet', 'Java', false, [JAVA + '\\cache', JAVA + '\\javaws\\cache', JAVA + '\\tmp', JAVA_LOW + '\\cache']), f('internet', 'Java', false, [JAVA + '\\Log', JAVA_LOW + '\\Log', R + '\\java\\webview'], '*', '', /\\webview\\\.lock$/i),
  f('internet', 'Java', false, [W + '\\System32', W + '\\SysWOW64'], 'jupdate*.log', ''),
  f('internet', 'whatsapplog', false, WA, 'main-process.log.*', ''), f('internet', 'whatsapplog', false, WA.map(w => w + '\\VideoDecodeStats'), '*', ''), f('internet', 'whatsappcache', false, WA.map(w => w + '\\Cache,GPUCache'), '*', ''),
  // CCleaner also strips Local Storage\\leveldb down to its .ldb/.log files; a LevelDB without MANIFEST/CURRENT no longer opens, so that part is left out.
  f('internet', 'whatsappstorage', false, WA.map(w => w + '\\Session Storage'), '*', ''), f('internet', 'whatsappstorage', false, WA.map(w => w + '\\Service Worker\\CacheStorage')),
  f('internet', 'icloudcache', false, [IC + '\\LocalState\\EBWebView\\ShaderCache,GrShaderCache\\GPUCache', IC + '\\LocalState\\EBWebView\\Default\\Cache\\Cache_Data', IC + '\\LocalState\\EBWebView\\SmartScreen\\local']), f('internet', 'icloudcache', false, [IC + '\\LocalState\\EBWebView\\Default\\GPUCache'], '*', ''),
  f('internet', 'icloudlogs', false, [IC + '\\LocalState\\EBWebView\\Default\\AutofillStrikeDatabase,data_reduction_proxy_leveldb', R + '\\Apple Computer\\Logs,Logs-Old']), f('internet', 'icloudlogs', false, [IC + '\\LocalCache\\Local\\Logs'], '*.log', ''),
  f('internet', 'icloudstorage', false, [IC + '\\LocalState\\EBWebView\\Default\\Session Storage,Local Storage']),
  ...chromium('Google Chrome', 'Google\\Chrome'), f('Google Chrome', 'metrics', true, ['%ProgramFiles%\\Google\\Chrome\\Application\\SetupMetrics'], '*.pma'), ...chromium('Edge Chromium', 'Microsoft\\Edge'),
  // Firefox history lives in places.sqlite together with bookmarks, so only its cookies and cache are offered.
  f('Firefox', 'cookies', false, [`${R}\\Mozilla\\Firefox\\Profiles\\*`], 'cookies.sqlite;cookies.sqlite-wal;cookies.sqlite-shm', ''), f('Firefox', 'cache', true, [`${L}\\Mozilla\\Firefox\\Profiles\\*\\cache2,startupCache,jumpListCache,thumbnails,OfflineCache`]),
  ...chromium('Brave', 'BraveSoftware\\Brave-Browser'), ...browser('Opera', `${R}\\Opera Software\\Opera Stable,Opera GX Stable`, `${L}\\Opera Software\\Opera Stable,Opera GX Stable`), ...chromium('Vivaldi', 'Vivaldi'),
  f('Internet Explorer', 'cache', true, [L + '\\Microsoft\\Windows\\INetCache']),
];
const UA = ['5E6AB780-7743-11CF-A12B-00AA004AE837', '75048700-EF1F-11D0-9888-006097DEACF9', 'CEBFF5CD-ACE2-4F4F-9178-9926F41749EA', 'F4E57C4B-2036-45F0-A9AB-443BCFE33D9F'];
const TRAY = 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\TrayNotify', WMP = 'HKCU\\Software\\Microsoft\\MediaPlayer';
const regRules: RegRule[] = [
  ['windows', 'recentdocs', false, [E + '\\RecentDocs']], ['windows', 'runmru', true, [E + '\\RunMRU']], ['windows', 'RegEdit', true, ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit|LastKey']],
  ['windows', 'explorermru', false, [E + '\\ComDlg32', E + '\\TypedPaths', E + '\\WordWheelQuery', E + '\\Wallpaper\\MRU', E + '\\Wallpapers\\Images', E + '\\FindComputerMRU', E + '\\Map Network Drive MRU', E + '\\PrnPortsMRU', 'HKCU\\Software\\Microsoft\\DirectInput\\MostRecentApplication', 'HKCU\\Software\\Microsoft\\Direct3D\\MostRecentApplication']],
  ['windows', 'MS Management Console', true, ['HKCU\\Software\\Microsoft\\Microsoft Management Console\\Recent File List']], ['windows', 'Remote Desktop', true, ['HKCU\\Software\\Microsoft\\Terminal Server Client\\Default|*']],
  ['apps', 'Adobe Photoshop', true, ['HKCU\\Software\\Adobe\\MediaBrowser\\MRU\\Photoshop\\FileList']],
  ['media', 'Windows Media Player', true, [WMP + '\\Player\\RecentFileList', WMP + '\\Player\\RecentURLList', WMP + '\\Preferences|LastPlayList', WMP + '\\Preferences|LastPlayListIndex', WMP + '\\Player\\Settings|SaveAsDir']],
  ['utils', 'WinRAR', true, ['HKCU\\Software\\WinRAR\\ArcHistory', 'HKCU\\Software\\WinRAR\\DialogEditHistory\\ArcName', 'HKCU\\Software\\WinRAR\\DialogEditHistory\\ExtrPath', 'HKCU\\Software\\WinRAR\\General|LastFolder']],
  ['advanced', 'menuorder', false, [E + '\\MenuOrder']], ['advanced', 'traynotify', false, [TRAY + '|IconStreams', TRAY + '|PastIconsStream']],
  ['advanced', 'windowsize', false, [E + '\\StreamMRU', E + '\\Streams']], ['advanced', 'userassist', false, UA.map(g => `${E}\\UserAssist\\{${g}}\\Count`)],
];
// One PowerShell call checks every rule key; an empty key has nothing to clean and is skipped.
const regRuleScript = (keys: string[]) => `$hits=@(); foreach($r in (ConvertFrom-Json ${quote(JSON.stringify(keys))})){ $k,$v=$r -split '\\|',2; $i=Get-Item -LiteralPath "Registry::$k" -EA SilentlyContinue; if(!$i){ continue }
  if($v -eq '*'){ foreach($n in $i.GetValueNames()){ if($n){ $hits+=,@($r, "$k|$n") } } } elseif($(if($v){ $i.GetValueNames() -contains $v } else { $i.ValueCount + $i.SubKeyCount -gt 0 })){ $hits+=,@($r, $r) } }; ConvertTo-Json -Compress -InputObject @($hits)`;
async function regRuleItems(): Promise<HealthItem[]> {
  const hits: [string, string][] = JSON.parse(await ps(regRuleScript(regRules.flatMap(r => r[3]))).catch(() => '[]') || '[]');
  return regRules.flatMap(([group, category, on, keys]) => hits.filter(([rule]) => keys.includes(rule)).map(([, entry]) => {
    const [key, name] = entry.split('|');
    return { id: id(group + category + entry), group, category, on, kind: name === undefined ? 'key' as const : 'value' as const, path: name === undefined ? key : key + '\\' + name, key, name, size: 0 };
  }));
}
async function expand(pattern: string) {
  const full = pattern.replace(/^~/, os.homedir()).replace(/%([^%]+)%/g, (_, k) => process.env[k] ?? '\0');
  if (full.includes('\0')) return [];
  const [root, ...segments] = full.split(/[\\/]/);
  let dirs = [root + path.sep];
  for (const seg of segments.filter(Boolean)) dirs = /[*,]/.test(seg) ? (await Promise.all(dirs.map(async d => (await fs.readdir(d).catch(() => [])).filter(n => glob(seg).test(n)).map(n => path.join(d, n))))).flat() : dirs.map(d => path.join(d, seg));
  return dirs;
}
// Junctions and symlinks are neither files nor directories to Dirent, so they are never followed or deleted.
async function walk(dir: string, mask: RegExp, flags: string, skip: RegExp | undefined, item: HealthItem, seen: Set<string>): Promise<void> {
  await Promise.all((await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).map(async e => {
    const full = path.join(dir, e.name), key = full.toLowerCase();
    if (e.isDirectory()) { if (flags.includes('r')) { item.dirs!.push(full); await walk(full, mask, flags, skip, item, seen); } return; }
    if (!e.isFile() || !mask.test(e.name) || SKIP.test(full) || skip?.test(full) || seen.has(key)) return;
    seen.add(key);
    const s = await fs.lstat(full).catch(() => null);
    if (s && Date.now() - s.mtimeMs >= age(flags)) { item.files!.push(full); item.size += s.size; }
  }));
}
async function fileItems() {
  const seen = new Set<string>();
  const items = await Promise.all(rules.flatMap(([group, category, on, folders, masks, flags, skip]) => folders.map(async folder => Promise.all((await expand(folder)).map(async dir => {
    const item: HealthItem = { id: id(group + category + dir + masks), group, category, on, kind: 'files', path: masks === '*' ? dir : path.join(dir, masks), size: 0, files: [], dirs: [] };
    await walk(dir, glob(masks), flags, skip, item, seen);
    return { ...item, count: item.files!.length };
  })))));
  return items.flat(2).filter(i => i.count);
}
// Registry values whose target file is gone. 32-bit entries may name System32 for SysWOW64, so both are checked;
// WindowsApps denies Test-Path even for files that exist, so those entries are never judged.
const registryScript = `$out=@()
function Exe($c){ $c=[Environment]::ExpandEnvironmentVariables([string]$c).Trim(); if($c -match '^"([^"]+)"'){ $matches[1] } elseif($c -match '^(.+?\\.exe)(\\s|$)'){ $matches[1] } }
function Gone($p){ $p -and $p -notmatch '\\\\WindowsApps\\\\' -and [IO.Path]::IsPathRooted($p) -and !(Test-Path -LiteralPath $p) -and !(Test-Path -LiteralPath ($p -replace '\\\\System32\\\\','\\SysWOW64\\')) }
foreach($k in 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'){ $i=Get-Item -LiteralPath "Registry::$k" -EA SilentlyContinue; if($i){ foreach($n in $i.GetValueNames()){ $v=[string]$i.GetValue($n); if($n -and (Gone (Exe $v))){ $out+=@{c='run';k=$k;n=$n;d=$v} } } } }
$k='HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache'; $i=Get-Item -LiteralPath "Registry::$k" -EA SilentlyContinue
if($i){ foreach($n in $i.GetValueNames()){ $p=$n -replace '\\.(FriendlyAppName|ApplicationCompany)$',''; if($p -ne $n -and (Gone $p)){ $out+=@{c='mui';k=$k;n=$n;d=$p} } } }
foreach($k in 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\SharedDLLs','HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\SharedDLLs'){ $i=Get-Item -LiteralPath "Registry::$k" -EA SilentlyContinue; if($i){ foreach($n in $i.GetValueNames()){ if(Gone ([Environment]::ExpandEnvironmentVariables($n))){ $out+=@{c='dlls';k=$k;n=$n;d=$n} } } } }
foreach($k in 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths'){ foreach($s in Get-ChildItem -LiteralPath "Registry::$k" -EA SilentlyContinue){ $p=[Environment]::ExpandEnvironmentVariables([string]$s.GetValue('')).Trim('"'); if(Gone $p){ $out+=@{c='apppaths';k=($s.Name -replace '^HKEY_LOCAL_MACHINE','HKLM' -replace '^HKEY_CURRENT_USER','HKCU');d=$p} } } }
ConvertTo-Json -Compress -InputObject @($out)`;
export async function scanHealth(): Promise<HealthItem[]> {
  const windows = process.platform === 'win32';
  const [files, regs] = await Promise.all([fileItems(), windows ? regRuleItems() : []]);
  if (!windows) return files;
  const recycle = JSON.parse(await ps("$i=@((New-Object -ComObject Shell.Application).NameSpace(10).Items()); $s=0; foreach($x in $i){ $s+=[double]$x.ExtendedProperty('Size') }; ConvertTo-Json -Compress @($i.Count,$s)").catch(() => '[0,0]'));
  const registry = (JSON.parse(await ps(registryScript).catch(() => '[]') || '[]') as RegHit[]).map(r => ({ id: id(r.k + '\0' + (r.n ?? '')), group: 'registry', category: r.c, on: true, kind: r.n === undefined ? 'key' as const : 'value' as const, path: r.n === undefined ? r.k : r.k + '\\' + r.n, key: r.k, name: r.n, label: r.d, size: 0 }));
  return [...files, ...regs, ...(recycle[0] ? [{ id: 'recycle', group: 'system', category: 'recycle', on: true, kind: 'recycle' as const, path: t.recycleBin, label: t.recycleItems(recycle[0]), size: recycle[1] }] : []), ...registry];
}
// Progress for one item: `done` of `total` files; `ok` is set once the item has finished.
export type HealthProgress = { id: string; done: number; total: number; ok?: boolean };
async function cleanOne(item: HealthItem, backupDir: string, progress: (p: HealthProgress) => void) {
  // Only the files this scan matched. Locked ones are normal and skipped; the item fails only when none could go.
  // Emptied subfolders are removed deepest first (rmdir refuses non-empty ones); the rule's own folder stays.
  if (item.kind === 'files') {
    let error: unknown, failed = 0, done = 0, sent = 0;
    for (const file of item.files!) {
      await fs.rm(file, { force: true }).catch(e => { failed++; error = e; });
      if (Date.now() - sent > 100) { sent = Date.now(); progress({ id: item.id, done: ++done, total: item.files!.length }); } else done++;
    }
    for (const dir of [...item.dirs!].sort((a, b) => b.length - a.length)) await fs.rmdir(dir).catch(() => {});
    if (failed && failed === item.files!.length) throw error;
    return;
  }
  if (item.kind === 'recycle') return void await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');
  await fs.mkdir(backupDir, { recursive: true });
  const backup = path.join(backupDir, item.id + '-' + Date.now() + '.reg');
  await run('reg.exe', ['export', item.key!, backup, '/y']);
  await run('reg.exe', item.kind === 'key' ? ['delete', item.key!, '/f'] : ['delete', item.key!, '/v', item.name!, '/f']);
  return backup;
}
export async function cleanHealth(items: HealthItem[], backupDir: string, progress: (p: HealthProgress) => void) {
  const results: CleanResult[] = [];
  for (const item of items) {
    const total = item.files?.length || 1;
    try { results.push({ path: item.path, ok: true, backup: await cleanOne(item, backupDir, progress) || undefined }); progress({ id: item.id, done: total, total, ok: true }); }
    catch (e) { results.push({ path: item.path, ok: false, error: /EBUSY|EPERM/.test((e as NodeJS.ErrnoException).code ?? '') ? t.inUse : (e as Error).message }); progress({ id: item.id, done: total, total, ok: false }); }
  }
  return results;
}
