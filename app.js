const FALLBACK_NOTE = `
## ノートの読み込みに失敗しました

\`twf-web/note.md\` が見つからない、または読み込みできませんでした。

### 解決方法

1. \`twf-web\` フォルダ内に \`note.md\` を配置する  
2. ブラウザを再読み込みする

※ Cloudflare Pages / GitHub連携運用では、\`note.md\` を更新して Push する構成がおすすめです。
`;

const markdownContainer = document.getElementById("markdownContainer");
const layoutContainer = document.querySelector(".layout");
const tocSidebar = document.getElementById("tocSidebar");
const tocList = document.getElementById("tocList");
const tocNav = document.getElementById("tocNav");
const tocToggleButton = document.getElementById("tocToggleButton");
const readingBar = document.getElementById("readingBar");
const readingBarYear = document.getElementById("readingBarYear");
const readingBarTitle = document.getElementById("readingBarTitle");
const readingBarToggle = document.getElementById("readingBarToggle");
const readingBarDrawer = document.getElementById("readingBarDrawer");
const readingBarTocList = document.getElementById("readingBarTocList");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");
const searchToolbar = document.getElementById("searchToolbar");
const searchNav = document.getElementById("searchNav");
const prevMatchButton = document.getElementById("prevMatchButton");
const nextMatchButton = document.getElementById("nextMatchButton");
const summaryStatus = document.getElementById("summaryStatus");
const searchResults = document.getElementById("searchResults");
const searchResultsToggle = document.getElementById("searchResultsToggle");
const searchResultsList = document.getElementById("searchResultsList");
const searchResultsNote = document.getElementById("searchResultsNote");
const foldEventsToggle = document.getElementById("foldEventsToggle");
const spoilerFoldsToggle = document.getElementById("spoilerFoldsToggle");
const chapterIndexList = document.getElementById("chapterList");
const chapterNav = document.getElementById("chapterNav");

// 章ページ（file2.html など）は <body data-chapter="file2"> を持つ。親ページ（index.html）は持たない。
const PAGE_CHAPTER_SLUG = document.body?.dataset.chapter || "";
const IS_CHAPTER_PAGE = Boolean(PAGE_CHAPTER_SLUG);

// 章ページの名前（URL）と、note.md の章の見出し（##）の書き出しの対応。
// 章を増やすときは、ここに1行足し、同じ名前の HTML ファイル（例：file5.html）と sitemap.xml の行を足す。
// released（公開日）・note は、親ページの章の一覧に出す。公開日は note.md の各章の冒頭に合わせる。
// 隠し動画（Lucky You・Guilty）の公開日は、視聴できるようになった日。
const CHAPTERS = [
  { slug: "file1", prefix: "ファイル1", released: "2020/04/26" },
  { slug: "file2", prefix: "ファイル2", released: "2020/06/28" },
  { slug: "lucky-you", prefix: "Lucky You", released: "2020/06/28" },
  { slug: "file3", prefix: "ファイル3", released: "2021/03/19" },
  { slug: "guilty", prefix: "Guilty", released: "2021/03/19" },
  { slug: "souvenir", prefix: "souvenir", released: "2023/09/13" },
  { slug: "spectacle", prefix: "Spectacle", released: "2023/11/11" },
  { slug: "file4", prefix: "ファイル4", released: "2024/02/09" },
  { slug: "lacrimosa", prefix: "Lacrimosa", released: "2024/02/09" },
  { slug: "quality-ad", prefix: "Bon's Burgers - \"Quality\" Ad (1974)", released: "2024/06/19" },
  { slug: "hotline", prefix: "Hotline", released: "2025/06/26" },
  { slug: "file5", prefix: "ファイル5", released: "2026/07/31" },
  { slug: "my-soul", prefix: "My Soul", released: "2026/07/31" },
  { slug: "felix", prefix: "シリーズ総括", note: "総括" }
];

// note.md を章ごとに分けたもの。{ slug, title, root, def }。def は CHAPTERS の該当行。
// root は、今のページの章なら markdownContainer、それ以外は画面に出さない入れ物（検索と転送に使う）。
let chapterGroups = [];
let currentChapter = null;

function chapterUrl(group) {
  return `/${group.slug}`;
}

// 「先の内容に触れる箇所」をまとめて開閉したあとに呼ぶ（検索の一覧を合わせ直す。wireSearch が差し替える）。
let onSpoilerFoldsChanged = () => {};

const FOLD_STORAGE_KEY = "twf_fold_events";
const TIMELINE_SPOILER_STORAGE_KEY = "twf_timeline_spoiler";
const FORWARD_SPOILER_STORAGE_KEY = "twf_forward_spoilers";
const SEARCH_HISTORY_STORAGE_KEY = "twf_search_history";
const SEARCH_HISTORY_LIMIT = 8;
const SEARCH_SUGGEST_LIMIT = 8;

// note.md の目印：考察の見出し行や画像行の末尾に {ネタバレ:ファイル4} と書くと、
// その考察（図）は「ファイル4までの内容に触れる」ものとして、開くまで畳んで表示する。
const SPOILER_MARKER = "\\s*\\{ネタバレ[:：]\\s*([^{}]+?)\\s*\\}";
const ANALYSIS_TITLE_WITH_MARKER = new RegExp(`^(\\*\\*.+?[：:]\\*\\*)${SPOILER_MARKER}$`);
const IMAGE_LINE = new RegExp(`^!\\[([^\\]]*)\\]\\(([^)]+)\\)(?:${SPOILER_MARKER})?$`);

function readStoredFlag(key) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch (_error) {
    return false;
  }
}

function writeStoredFlag(key, value) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch (_error) {
    // Ignore storage errors in restricted browsing modes.
  }
}

// 「先の内容に触れる箇所」を開いておくかどうか（読者の選択を覚えておく）。
let forwardSpoilersOpen = readStoredFlag(FORWARD_SPOILER_STORAGE_KEY);

// 作品を見ていく順番。note.md の目印（{ネタバレ:ファイル4}）と、用語集の
// fullFrom / before[].from は、この名前で時点を指す。章の見出し（##）の書き出しとも対応する。
const STAGE_ORDER = [
  "ファイル1",
  "ファイル2",
  "Lucky You",
  "ファイル3",
  "Guilty",
  "souvenir",
  "Spectacle",
  "ファイル4",
  "Lacrimosa",
  "Bon's Burgers",
  "Hotline",
  "ファイル5",
  "My Soul"
];
const STAGE_ALL = STAGE_ORDER.length; // 全編を見た時点

function stageIndexOf(name) {
  return STAGE_ORDER.indexOf(String(name ?? "").trim());
}

// 用語が押された場所は、どの時点までの内容を前提にしてよいか。
function resolveStageIndexFor(node) {
  if (forwardSpoilersOpen || !markdownContainer || !(node instanceof Element)) return STAGE_ALL;

  // 章：直前の見出し（##）から決める。対応する章がなければ（総括など）全編扱い。
  let topLevel = node;
  while (topLevel.parentElement && topLevel.parentElement !== markdownContainer) {
    topLevel = topLevel.parentElement;
  }
  let chapterStage = STAGE_ALL;
  for (let el = topLevel; el; el = el.previousElementSibling) {
    if (el.tagName === "H2") {
      const title = el.dataset.cleanTitle || el.textContent || "";
      const index = STAGE_ORDER.findIndex((name) => title.trim().startsWith(name));
      chapterStage = index >= 0 ? index : STAGE_ALL;
      break;
    }
  }

  // 「先の内容に触れる箇所」の中では、その目印の時点まで進んだものとして扱う。
  const marked = node.closest("[data-spoiler-until]");
  const markedStage = marked ? stageIndexOf(marked.dataset.spoilerUntil) : -1;
  return Math.max(chapterStage, markedStage);
}

// 用語集の説明文を、時点に合わせて選ぶ。
// description … 全編を見た人向けの説明。fullFrom の時点から出す（省略時は最初から）。
// before      … それより前の時点の説明。from の時点から、次の説明に替わるまで出す。
function pickGlossaryDescription(entry, stageIndex) {
  const full = { text: entry.description, partial: false };
  const earlier = Array.isArray(entry.before) ? entry.before : [];
  if (earlier.length === 0) return full;

  const fullFromIndex = entry.fullFrom ? stageIndexOf(entry.fullFrom) : 0;
  if (fullFromIndex < 0 || stageIndex >= fullFromIndex) return full;

  let chosen = earlier[0];
  earlier.forEach((candidate) => {
    const fromIndex = stageIndexOf(candidate.from);
    if (fromIndex >= 0 && fromIndex <= stageIndex) chosen = candidate;
  });
  return { text: chosen.description, partial: true };
}

// 用語集に、時点の名前の書き間違いがないかを確かめる（開発者向けの画面に知らせる）。
function checkGlossaryStages(glossaryItems) {
  glossaryItems.forEach((entry) => {
    const names = [entry.fullFrom, ...(Array.isArray(entry.before) ? entry.before.map((b) => b.from) : [])];
    names.forEach((name) => {
      if (name !== undefined && stageIndexOf(name) < 0) {
        console.warn(`glossary.json: 「${entry.term}」の時点「${name}」は ${STAGE_ORDER.join(" / ")} のどれでもありません。`);
      }
    });
  });
}

// 検索結果の一覧：前後に出す文脈の字数と、一覧に出す件数の上限。
const SEARCH_CONTEXT_LENGTH = 30;
const SEARCH_LIST_LIMIT = 200;

// 再読み込みのときは、前回の位置やURLの #見出し ではなく、ページの最上部から表示する。
function isReloadNavigation() {
  try {
    const entries = performance.getEntriesByType("navigation");
    if (entries.length > 0) return entries[0].type === "reload";
    return Boolean(performance.navigation && performance.navigation.type === 1);
  } catch (_error) {
    return false;
  }
}

const IS_RELOAD = isReloadNavigation();
if (IS_RELOAD && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const SECTION_CATEGORY_LABELS = {
  event: "映像で起きたこと",
  analysis: "読み（考察・仮説）",
  fact: "確定事実",
  supplement: "補足・整理"
};

const SECTION_CATEGORY_BY_ID = {
  "f1-t1": "event",
  "f1-t2": "event",
  "f1-t3": "event",
  "f1-thoughts": "analysis",
  "f2-t1": "event",
  "f2-t2": "event",
  "f2-t3": "event",
  "f2-t4": "event",
  "f2-thoughts": "analysis",
  "ly-timeline": "event",
  "ly-voice": "event",
  "ly-text": "event",
  "ly-thoughts": "analysis",
  "f3-frame": "supplement",
  "f3-rec1": "event",
  "f3-banny": "event",
  "f3-linda": "event",
  "f3-boozoo": "event",
  "f3-sha": "event",
  "f3-well-may2": "event",
  "f3-thoughts": "analysis",
  "guilty-desc": "supplement",
  "guilty-rec1": "event",
  "guilty-rec2": "event",
  "guilty-rec3": "event",
  "guilty-thoughts": "analysis",
  "souvenir-content": "event",
  "souvenir-objects": "analysis",
  "souvenir-points": "analysis",
  "souvenir-position": "supplement",
  "spectacle-content": "event",
  "spectacle-points": "analysis",
  "spectacle-position": "supplement",
  "f4-01": "event",
  "f4-02": "event",
  "f4-03": "event",
  "f4-04": "event",
  "f4-05": "event",
  "f4-06": "event",
  "f4-07": "event",
  "f4-08": "event",
  "f4-09": "event",
  "f4-10": "event",
  "f4-11": "event",
  "f4-12": "event",
  "f4-thoughts": "analysis",
  "f4-trivia": "supplement",
  "f4-summary": "supplement",
  "lacrimosa-desc": "supplement",
  "lacrimosa-river": "event",
  "lacrimosa-console": "event",
  "lacrimosa-susan": "event",
  "lacrimosa-banny": "event",
  "lacrimosa-thoughts": "analysis",
  "lacrimosa-extended": "supplement",
  "lacrimosa-trivia": "supplement",
  "qa-desc": "supplement",
  "qa-intro": "event",
  "qa-tour": "event",
  "qa-ending": "event",
  "qa-thoughts": "analysis",
  "qa-trivia": "supplement",
  "hotline-desc": "supplement",
  "hotline-tape": "event",
  "hotline-footage": "event",
  "hotline-call": "event",
  "hotline-escape": "event",
  "hotline-camera": "event",
  "hotline-thoughts": "analysis",
  "hotline-trivia": "supplement",
  "f5-desc": "supplement",
  "f5-01": "event",
  "f5-02": "event",
  "f5-03": "event",
  "f5-04": "event",
  "f5-05": "event",
  "f5-06": "event",
  "f5-07": "event",
  "f5-08": "event",
  "f5-09": "event",
  "f5-10": "event",
  "f5-thoughts": "analysis",
  "f5-trivia": "supplement",
  "f5-summary": "fact",
  "mysoul-desc": "supplement",
  "mysoul-felix": "event",
  "mysoul-sophie": "event",
  "mysoul-journal-happy": "event",
  "mysoul-journal-1974": "event",
  "mysoul-cctv": "event",
  "mysoul-1982": "event",
  "mysoul-thoughts": "analysis",
  "mysoul-trivia": "supplement",
  "felix-facts": "fact",
  "summary-walten": "fact",
  "summary-bon": "fact",
  "felix-hypothesis": "analysis"
};

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(text) {
  return escapeHtml(text)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeLinkHref(rawHref) {
  const href = rawHref.trim();
  if (/^#[A-Za-z0-9_-]+$/.test(href)) return href;
  if (/^https?:\/\/[^\s"'<>`]+$/i.test(href)) return href;
  return "";
}

function sanitizeImageSrc(rawSrc) {
  const src = rawSrc.trim();
  if (/^https?:\/\/[^\s"'<>`]+$/i.test(src)) return src;
  if (src.includes("..")) return "";
  if (/^(?:\.\/|\/)?[A-Za-z0-9/_-]+\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(src)) {
    if (src.startsWith("./") || src.startsWith("/")) return src;
    return `./${src}`;
  }
  return "";
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((#.+?)\)/g, (_match, textValue, href) => {
      const safeHref = sanitizeLinkHref(href);
      return safeHref ? `<a href="${escapeHtmlAttr(safeHref)}">${textValue}</a>` : textValue;
    })
    .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, (_match, textValue, href) => {
      const safeHref = sanitizeLinkHref(href);
      if (!safeHref) return textValue;
      return `<a href="${escapeHtmlAttr(safeHref)}" target="_blank" rel="noopener noreferrer">${textValue}</a>`;
    });
}

// 本文の画像の寸法。画像を読み込む前から縦横比が分かるようにして、読み込みのたびに本文が下へずれるのを防ぐ。
// 映像の静止画はほぼすべて 4:3（640×480 か 960×720）なので、ここに無い画像は 4:3 として扱う。
// 4:3 以外の画像（人物の立ち絵や図解など）を足したときは、ここに「ファイル名: [幅, 高さ]」を足す。
// 書き忘れても表示は崩れない（読み込み後は実際の縦横比で表示され、その画像のぶんだけ本文がずれる）。
const DEFAULT_IMAGE_SIZE = [640, 480];
const IMAGE_SIZES = {
  "bon_prime.webp": [478, 760],
  "jack_walten.webp": [570, 760],
  "bon_broken.webp": [411, 676],
  "brian_stells.webp": [339, 375],
  "jack_missing.webp": [576, 764],
  "banny_main.webp": [620, 760],
  "susan_woodings.webp": [570, 760],
  "sha_main.webp": [454, 760],
  "rosemary_walten.webp": [570, 760],
  "ashley_parks.webp": [283, 760],
  "hillary_b.webp": [367, 760],
  "kevin_w.webp": [409, 666],
  "billy_main.webp": [439, 760],
  "rosemary_main.webp": [600, 800],
  "diagram_vessels.svg": [400, 512],
  "shadow_man.webp": [1000, 860],
  "ly_heads_sequence.webp": [940, 480],
  "sophie_walten.webp": [237, 760],
  "jenny_letterson.webp": [570, 760],
  "diagram_f3_layers.svg": [400, 298],
  "f3_banny_holly_bon_left_zoom.webp": [600, 768],
  "f3_banny_holly_bon_right_zoom.webp": [600, 768],
  "linda_thompson.webp": [769, 779],
  "boozoo_broken.webp": [490, 760],
  "charles_brook.webp": [570, 760],
  "felix_kranken.webp": [570, 760],
  "susan_main.webp": [600, 800],
  "diagram_f4_timeline.svg": [400, 712],
  "diagram_f5_grief_hijack.svg": [400, 400],
  "diagram_chain_1974.svg": [400, 452],
  "diagram_relationships.svg": [400, 564],
  "diagram_bon_wonderland.svg": [400, 282],
  "jack_photo.webp": [503, 632]
};

function renderImage(altText, src, spoilerUntil = "") {
  const safeSrc = sanitizeImageSrc(src);
  if (!safeSrc) {
    return `<p class="status error">危険な画像URLをブロックしました: <code>${escapeHtml(src)}</code></p>`;
  }
  const spoilerAttr = spoilerUntil ? ` data-spoiler-until="${escapeHtmlAttr(spoilerUntil)}"` : "";
  // width・height は縦横比を伝えるためのもの。表示の大きさは styles.css（.wiki-image）が決める。
  // is-pending は「まだ読み込んでいない」印。付いているあいだは、styles.css が読み込み後と同じ高さの枠を取る。
  const fileName = safeSrc.split(/[?#]/)[0].split("/").pop() || "";
  const [width, height] = IMAGE_SIZES[fileName] || DEFAULT_IMAGE_SIZE;
  return `<figure class="wiki-figure"${spoilerAttr}><img src="${escapeHtmlAttr(safeSrc)}" alt="${escapeHtmlAttr(altText)}" class="wiki-image is-pending" width="${width}" height="${height}" loading="lazy"><figcaption>${escapeHtml(altText)}</figcaption></figure>`;
}

// 本文の画像を読み込み終えたら（読み込めなかったときも）、「まだ読み込んでいない」印を外す。
// load・error は親へ伝わらないので、文書全体でキャプチャして拾う。
["load", "error"].forEach((type) => {
  document.addEventListener(
    type,
    (event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement && target.classList.contains("is-pending")) {
        target.classList.remove("is-pending");
      }
    },
    true
  );
});

// ---- 画像の拡大表示 ----
// 本文の画像・図解、年表の画像、人物紹介と用語カードの顔写真を押すと、画面いっぱいに開く。
// 開いた画像をもう一度押すと2倍に拡大し（指やスクロールで動かせる）、さらに押すと元へ戻る。
// 閉じるには「閉じる」・画像の外側・Esc・端末の「戻る」のどれでもよい。
// リンクやボタンの中にある画像（章の一覧の画像など）は、もとの動きを優先して対象にしない。
const IMAGE_VIEWER_TARGETS = ".wiki-image, .tl-thumb, .guide-people__avatar, .hero__image, .term-card__img";
const IMAGE_VIEWER_ZOOM = 2;
let imageViewer = null;

// 一覧用の小さい画像（images/thumbs・images/cards）には、同じ名前の大きい画像が images/ にあることが多い。
// あればそちらを開き、なければ小さい画像をそのまま開く。
function fullSizeImageSrc(src) {
  const match = /^(.*\/images\/)(?:thumbs|cards)\/([^/?#]+)$/.exec(src);
  return match ? `${match[1]}${match[2]}` : "";
}

function buildImageViewer() {
  const dialog = document.createElement("dialog");
  dialog.className = "image-viewer";
  dialog.setAttribute("aria-label", "画像の拡大表示");

  const bar = document.createElement("div");
  bar.className = "image-viewer__bar";
  const hint = document.createElement("span");
  hint.className = "image-viewer__hint";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "image-viewer__close";
  closeBtn.textContent = "閉じる";
  bar.append(hint, closeBtn);

  const stage = document.createElement("div");
  stage.className = "image-viewer__stage";
  const img = document.createElement("img");
  img.className = "image-viewer__image";
  img.alt = "";
  stage.appendChild(img);

  const caption = document.createElement("p");
  caption.className = "image-viewer__caption";

  dialog.append(bar, stage, caption);
  document.body.appendChild(dialog);

  const viewer = { dialog, stage, img, caption, hint, zoomed: false, ratio: 4 / 3, naturalWidth: 0, isVector: false, pushedHistory: false };

  // 画面に収まる大きさ（fit）と、その2倍（zoomed）を、縦横比から計算して当てる。
  const layout = (anchor = null) => {
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    if (!stageWidth || !stageHeight) return;
    // 小さい画像（年表用の224×168など）は、引き伸ばしすぎるとぼやけるので、もとの2.5倍までにする。図解（SVG）は制限しない。
    const upscaleLimit = viewer.naturalWidth && !viewer.isVector ? viewer.naturalWidth * 2.5 : Infinity;
    const fitWidth = Math.min(stageWidth, stageHeight * viewer.ratio, upscaleLimit);
    const width = viewer.zoomed ? fitWidth * IMAGE_VIEWER_ZOOM : fitWidth;
    img.style.width = `${Math.round(width)}px`;
    img.style.height = `${Math.round(width / viewer.ratio)}px`;
    stage.classList.toggle("is-zoomed", viewer.zoomed);
    hint.textContent = viewer.zoomed ? "画像を押すと元の大きさに戻る" : "画像を押すと拡大";
    if (viewer.zoomed && anchor) {
      // 押した場所が、拡大したあとも同じ位置に来るように動かす
      stage.scrollLeft = anchor.relX * img.offsetWidth - anchor.viewX;
      stage.scrollTop = anchor.relY * img.offsetHeight - anchor.viewY;
    } else if (!viewer.zoomed) {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    }
  };
  viewer.layout = layout;

  img.addEventListener("load", () => {
    if (img.naturalWidth && img.naturalHeight) {
      viewer.ratio = img.naturalWidth / img.naturalHeight;
      viewer.naturalWidth = img.naturalWidth;
      viewer.isVector = /\.svg(?:[?#]|$)/i.test(img.currentSrc || img.src);
      layout();
    }
  });
  img.addEventListener("error", () => {
    // 大きい画像がなければ、押された小さい画像をそのまま出す
    if (viewer.fallbackSrc && img.getAttribute("src") !== viewer.fallbackSrc) {
      img.src = viewer.fallbackSrc;
    }
  });

  img.addEventListener("click", (event) => {
    event.stopPropagation();
    const rect = img.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const anchor = {
      relX: rect.width ? (event.clientX - rect.left) / rect.width : 0.5,
      relY: rect.height ? (event.clientY - rect.top) / rect.height : 0.5,
      viewX: event.clientX - stageRect.left,
      viewY: event.clientY - stageRect.top
    };
    viewer.zoomed = !viewer.zoomed;
    layout(anchor);
  });

  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    closeImageViewer();
  });
  // 画像の外側（暗い部分）を押したら閉じる。開いているあいだの操作は、下のページへ伝えない。
  dialog.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target === dialog || event.target === stage || event.target === caption) closeImageViewer();
  });
  // Esc など、ブラウザ側で閉じられたとき
  dialog.addEventListener("close", () => {
    img.removeAttribute("src");
    viewer.zoomed = false;
    if (viewer.pushedHistory) {
      viewer.pushedHistory = false;
      if (window.history.state && window.history.state.imageViewer) window.history.back();
    }
    if (viewer.opener && document.contains(viewer.opener)) viewer.opener.focus({ preventScroll: true });
    viewer.opener = null;
  });
  window.addEventListener("resize", () => {
    if (dialog.open) layout();
  });
  // 端末の「戻る」で、ページを離れずに拡大表示だけを閉じる
  window.addEventListener("popstate", () => {
    if (dialog.open) {
      viewer.pushedHistory = false;
      dialog.close();
    }
  });

  return viewer;
}

function closeImageViewer() {
  if (imageViewer && imageViewer.dialog.open) imageViewer.dialog.close();
}

function openImageViewer(source) {
  if (!imageViewer) imageViewer = buildImageViewer();
  const viewer = imageViewer;
  if (viewer.dialog.open || typeof viewer.dialog.showModal !== "function") return;

  const thumbSrc = source.currentSrc || source.src;
  const fullSrc = fullSizeImageSrc(thumbSrc);
  const attrWidth = Number(source.getAttribute("width"));
  const attrHeight = Number(source.getAttribute("height"));
  if (source.naturalWidth && source.naturalHeight && !fullSrc) {
    viewer.ratio = source.naturalWidth / source.naturalHeight;
  } else if (attrWidth && attrHeight && !fullSrc) {
    viewer.ratio = attrWidth / attrHeight;
  } else {
    viewer.ratio = 4 / 3;
  }
  viewer.zoomed = false;
  viewer.naturalWidth = 0;
  viewer.isVector = false;
  viewer.fallbackSrc = thumbSrc;
  viewer.opener = source;
  viewer.img.alt = source.alt || "";
  viewer.caption.textContent = source.alt || "";
  viewer.caption.hidden = !source.alt;
  viewer.img.src = fullSrc || thumbSrc;

  viewer.dialog.showModal();
  viewer.layout();
  try {
    window.history.pushState({ imageViewer: true }, "");
    viewer.pushedHistory = true;
  } catch (_error) {
    viewer.pushedHistory = false;
  }
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || !target.matches(IMAGE_VIEWER_TARGETS)) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (target.closest("a, button, summary, .image-viewer")) return;
  event.preventDefault();
  // 用語カードの中の画像でも、カードが「外側を押された」と受け取って閉じないようにする
  event.stopPropagation();
  openImageViewer(target);
}, true);

function normalizeSource(raw) {
  return raw.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}

function simpleMarkdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  const ulIndents = [];
  let inOl = false;
  let inQuote = false;
  let quoteType = "";

  const closeUl = () => {
    while (ulIndents.length > 0) {
      ulIndents.pop();
      html.push("</li></ul>");
    }
  };

  const closeAll = () => {
    closeUl();
    if (inOl) html.push("</ol>");
    if (inQuote) {
      html.push(quoteType === "default" ? "</blockquote>" : "</div>");
    }
    inOl = false;
    inQuote = false;
    quoteType = "";
  };

  const isPlainParagraphLine = (candidateLine) => {
    const t = candidateLine.trim();
    if (!t) return false;
    if (/^---$/.test(t)) return false;
    if (/^(#{2,4})\s+/.test(t)) return false;
    if (t === ">" || t.startsWith("> ")) return false;
    if (/^\d+\.\s+/.test(t)) return false;
    if (/^(\s*)-+\s+/.test(candidateLine)) return false;
    if (IMAGE_LINE.test(t)) return false;
    return true;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineRaw = lines[i];
    const line = lineRaw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeAll();
      continue;
    }

    if (/^---$/.test(trimmed)) {
      closeAll();
      html.push("<hr>");
      continue;
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      closeAll();
      const level = heading[1].length;
      const headingTextRaw = heading[2].trim();
      const idMatch = headingTextRaw.match(/^(.*)\s+\{#([A-Za-z0-9_-]+)\}$/);
      const headingText = idMatch ? idMatch[1].trim() : headingTextRaw;
      const headingId = idMatch ? idMatch[2] : "";
      const idAttr = headingId ? ` id="${headingId}"` : "";
      html.push(`<h${level}${idAttr}>${formatInline(headingText)}</h${level}>`);
      continue;
    }

    if (trimmed === ">" || trimmed.startsWith("> ")) {
      let text = trimmed === ">" ? "" : trimmed.slice(2);
      if (!inQuote) {
        closeAll();
        inQuote = true;
        const match = text.match(/^\[!(note|warning|info|danger|tip)\]/i);
        if (match) {
          quoteType = match[1].toLowerCase();
          html.push(`<div class="callout callout-${quoteType}">`);
          text = text.replace(/^\[!.*?\]\s*/, "");
        } else {
          quoteType = "default";
          html.push("<blockquote>");
        }
      }
      if (text) {
        html.push(`<p>${formatInline(text)}</p>`);
      }
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (!inOl) {
        closeAll();
        inOl = true;
        html.push("<ol>");
      }
      html.push(`<li>${formatInline(ol[1])}</li>`);
      continue;
    }

    const ulMatch = line.match(/^(\s*)-+\s+(.+)$/);
    if (ulMatch) {
      if (inOl || inQuote) {
        closeAll();
      }
      const indent = ulMatch[1].replace(/\t/g, "  ").length;
      const itemHtml = formatInline(ulMatch[2]);

      if (ulIndents.length === 0) {
        ulIndents.push(indent);
        html.push(`<ul><li>${itemHtml}`);
      } else if (indent > ulIndents[ulIndents.length - 1]) {
        ulIndents.push(indent);
        html.push(`<ul><li>${itemHtml}`);
      } else {
        html.push("</li>");
        while (ulIndents.length > 1 && indent < ulIndents[ulIndents.length - 1]) {
          ulIndents.pop();
          html.push("</ul></li>");
        }
        html.push(`<li>${itemHtml}`);
      }
      continue;
    }

    // 画像構文: ![alt](src)
    const imgMatch = trimmed.match(IMAGE_LINE);
    if (imgMatch) {
      closeAll();
      html.push(renderImage(imgMatch[1], imgMatch[2], imgMatch[3] || ""));
      continue;
    }

    // 考察段落: **見出し：** + 次行 => 一行の結論。 (+ 任意で元の本文行)
    const markedTitle = trimmed.match(ANALYSIS_TITLE_WITH_MARKER);
    const titleLine = markedTitle ? markedTitle[1] : trimmed;
    if (
      /^\*\*(?!重要な点[：:]|隠し要素[：:])(.+?[：:])\*\*$/.test(titleLine) &&
      i + 1 < lines.length &&
      /^=>\s+(.+)$/.test(lines[i + 1].trim())
    ) {
      closeAll();
      const spoilerAttr = markedTitle ? ` data-spoiler-until="${escapeHtmlAttr(markedTitle[2])}"` : "";
      const conclusionMatch = lines[i + 1].trim().match(/^=>\s+(.+)$/);
      const conclusionText = conclusionMatch ? conclusionMatch[1] : "";
      i += 1;

      if (i + 1 < lines.length && isPlainParagraphLine(lines[i + 1].trimEnd())) {
        const bodyText = lines[i + 1].trim();
        i += 1;
        html.push(
          `<div class="analysis-block"${spoilerAttr}><p class="analysis-block__title">${formatInline(titleLine)}</p><p class="analysis-block__conclusion">${formatInline(conclusionText)}</p><p class="analysis-block__body">${formatInline(bodyText)}</p></div>`
        );
      } else {
        html.push(
          `<div class="analysis-block analysis-block--list-head"${spoilerAttr}><p class="analysis-block__title">${formatInline(titleLine)}</p><p class="analysis-block__conclusion">${formatInline(conclusionText)}</p></div>`
        );
      }
      continue;
    }

    closeAll();
    const formatted = formatInline(trimmed);
    if (/^<strong>(?:重要な点|隠し要素)[：:]<\/strong>/.test(formatted)) {
      html.push(`<div class="callout callout-secret"><p>${formatted}</p></div>`);
    } else {
      html.push(`<p>${formatted}</p>`);
    }
  }

  closeAll();
  return html.join("\n");
}

function sanitizeGeneratedHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => {
    node.remove();
  });

  template.content.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      if (name.startsWith("on") || name === "style") {
        element.removeAttribute(attribute.name);
        return;
      }

      if (name === "href") {
        const safeHref = sanitizeLinkHref(value);
        if (!safeHref) {
          element.removeAttribute("href");
          return;
        }
        element.setAttribute("href", safeHref);
        if (/^https?:\/\//i.test(safeHref)) {
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noopener noreferrer");
        }
      }

      if (name === "src") {
        const safeSrc = sanitizeImageSrc(value);
        if (!safeSrc) {
          element.remove();
          return;
        }
        element.setAttribute("src", safeSrc);
      }
    });
  });

  return template.innerHTML;
}

function assignFile4AnchorIds(root) {
  const headingMap = {
    "①": "f4-01",
    "②": "f4-02",
    "③": "f4-03",
    "④": "f4-04",
    "⑤": "f4-05",
    "⑥": "f4-06",
    "⑦": "f4-07",
    "⑧": "f4-08",
    "⑨": "f4-09",
    "⑩": "f4-10",
    "⑪": "f4-11",
    "⑫": "f4-12"
  };

  const allHeadings = Array.from(root.querySelectorAll("h2, h3"));
  const file4Index = allHeadings.findIndex(
    (heading) => heading.tagName === "H2" && heading.textContent?.trim().startsWith("ファイル4 — CyberFun Tech")
  );
  if (file4Index === -1) return;

  for (let i = file4Index + 1; i < allHeadings.length; i += 1) {
    const heading = allHeadings[i];
    if (heading.tagName === "H2") break;
    if (heading.tagName !== "H3") continue;
    const text = heading.textContent?.trim() ?? "";
    const mark = text.charAt(0);

    if (headingMap[mark]) {
      heading.id = headingMap[mark];
      continue;
    }
    if (text.startsWith("Wikiから得られる補足情報・トリビア")) {
      heading.id = "f4-trivia";
      continue;
    }
    if (text.startsWith("主要ポイントまとめ")) {
      heading.id = "f4-summary";
    }
  }
}

function extractHeadingYear(text) {
  const match = text.match(/(19\d{2}|20\d{2})年(?:(\d{1,2})月)?/);
  if (!match) return "";
  if (match[2]) {
    return `${match[1]}/${match[2].padStart(2, "0")}`;
  }
  return match[1];
}

function prepareHeadingMetadata(root) {
  if (!root) return;
  assignFile4AnchorIds(root);
  const headings = root.querySelectorAll("h2, h3");
  let autoIdCounter = 1;

  headings.forEach((heading) => {
    if (!heading.id) {
      // Keep URL hashes ASCII-only for headings without explicit anchors.
      heading.id = `sec-${autoIdCounter}`;
      autoIdCounter += 1;
    }
    if (!heading.dataset.cleanTitle) {
      heading.dataset.cleanTitle = heading.textContent?.trim() ?? "";
    }
  });
}

// 「1974年5月2日」「午前0時23分」「3名」のような日付・時刻・数を、途中で折り返さない塊にする。
// 見出しや目次で「1974年5 ／ 月2日」と割れたり、日付の直前の「（」だけが行末に残ったりするのを防ぐ。
// 前後の括弧も同じ塊に入れる（文字そのものは変えない）。
const UNBREAKABLE_DATE =
  /[（(]?(?:(?:\d{4}年)?(?:\d{1,2}月)?\d{1,2}(?:[〜～]\d{1,2})?日|\d{4}年(?:\d{1,2}月)?|午[前後]\d{1,2}時(?:\d{1,2}分)?)[）)]?|\d+(?:名|人|本|体|枚|件|回|話|つ)/g;

function keepDatesTogether(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest(".nowrap, .sec-badge, .sec-fold-btn")) continue;
    UNBREAKABLE_DATE.lastIndex = 0;
    if (UNBREAKABLE_DATE.test(node.nodeValue || "")) targets.push(node);
  }
  targets.forEach((node) => {
    const text = node.nodeValue || "";
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    text.replace(UNBREAKABLE_DATE, (matched, offset) => {
      if (offset > cursor) fragment.append(text.slice(cursor, offset));
      const span = document.createElement("span");
      span.className = "nowrap";
      span.textContent = matched;
      fragment.append(span);
      cursor = offset + matched.length;
      return matched;
    });
    if (cursor < text.length) fragment.append(text.slice(cursor));
    node.parentNode?.replaceChild(fragment, node);
  });
}

function createTocItemElement(heading) {
  const li = document.createElement("li");
  const link = document.createElement("a");
  const rawText = heading.dataset.cleanTitle || heading.textContent?.trim() || "";
  const yearLabel = extractHeadingYear(rawText);

  link.href = `#${heading.id}`;
  link.dataset.level = heading.tagName.replace("H", "");
  link.dataset.targetId = heading.id;

  if (yearLabel) {
    const yearSpan = document.createElement("span");
    yearSpan.className = "year-tag";
    yearSpan.textContent = yearLabel;
    link.appendChild(yearSpan);
  } else if (link.dataset.level === "3") {
    const spacer = document.createElement("span");
    spacer.className = "year-tag year-tag--empty";
    spacer.setAttribute("aria-hidden", "true");
    link.appendChild(spacer);
  }

  const titleSpan = document.createElement("span");
  titleSpan.textContent = rawText;
  keepDatesTogether(titleSpan);
  link.appendChild(titleSpan);

  li.appendChild(link);
  return li;
}

// 目次の、ほかの章のページへのリンク（見出しは今のページにないので、章の名前だけを出す）。
function createChapterLinkItem(group) {
  const li = document.createElement("li");
  const link = document.createElement("a");
  link.href = chapterUrl(group);
  link.dataset.level = "2";
  link.className = "toc-chapter-link";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = group.title;
  link.appendChild(titleSpan);
  li.appendChild(link);
  return li;
}

function createTocHomeItem() {
  const li = document.createElement("li");
  const link = document.createElement("a");
  link.href = "/";
  link.className = "toc-home-link";
  link.textContent = "トップ（クイックガイド・主要年表）";
  li.appendChild(link);
  return li;
}

// 章ページの目次：トップへのリンクと全章の一覧。今の章だけは節（###）まで出す。
function buildTocItems() {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createTocHomeItem());
  chapterGroups.forEach((group) => {
    if (group === currentChapter && markdownContainer) {
      markdownContainer.querySelectorAll("h2, h3").forEach((heading) => {
        fragment.appendChild(createTocItemElement(heading));
      });
    } else if (group.slug) {
      fragment.appendChild(createChapterLinkItem(group));
    }
  });
  return fragment;
}

function buildToc() {
  if (!tocList || !markdownContainer) return;
  tocList.innerHTML = "";
  tocList.appendChild(buildTocItems());
  if (readingBarTocList) {
    readingBarTocList.innerHTML = "";
    readingBarTocList.appendChild(buildTocItems());
  }
}

// note.md を組み立てた入れ物を、章（## 見出し）ごとに分ける。
function splitIntoChapters(root) {
  const groups = [];
  let group = null;
  Array.from(root.childNodes).forEach((node) => {
    if (node instanceof Element && node.tagName === "H2") {
      const title = node.dataset.cleanTitle || node.textContent?.trim() || "";
      const def = CHAPTERS.find((candidate) => title.startsWith(candidate.prefix));
      if (!def) {
        console.warn(`note.md の章「${title}」に対応する章ページがありません（app.js の CHAPTERS）。`);
      }
      group = { slug: def ? def.slug : "", title, root: document.createElement("div"), def: def || {} };
      groups.push(group);
    }
    if (group) group.root.appendChild(node);
  });
  return groups;
}

// 章ページ：その章を本文の欄に入れる。ほかの章は画面に出さずに持っておく（検索と転送に使う）。
// useFirst … note.md を読めなかったときに、案内文（最初の章として組み立てたもの）を出すために使う。
function mountCurrentChapter({ useFirst = false } = {}) {
  if (!markdownContainer) return;
  currentChapter =
    (useFirst ? chapterGroups[0] : chapterGroups.find((group) => group.slug === PAGE_CHAPTER_SLUG)) || null;
  markdownContainer.textContent = "";
  if (!currentChapter) {
    markdownContainer.innerHTML =
      '<h2>この章は見つかりませんでした</h2><p><a href="/">トップ（クイックガイド・主要年表・章の一覧）へ戻る</a></p>';
    return;
  }
  while (currentChapter.root.firstChild) {
    markdownContainer.appendChild(currentChapter.root.firstChild);
  }
  currentChapter.root = markdownContainer;

  // 章の題名の上に出す表示（「PLAY   02 / 09」。見た目は styles.css の h2[data-tape-label]）。
  const linked = chapterGroups.filter((group) => group.slug);
  const position = linked.indexOf(currentChapter);
  const chapterHeading = markdownContainer.querySelector("h2");
  if (chapterHeading && position >= 0) {
    const pad = (value) => String(value).padStart(2, "0");
    chapterHeading.dataset.tapeLabel = `PLAY   ${pad(position + 1)} / ${pad(linked.length)}`;
  }
}

// 親ページ：章の一覧（テープのカード）。
// 画像は、その章の本文の最初の画像。一覧用の小さい画像を images/cards/ に同じ名前で置く
// （なければ本文の画像をそのまま使う）。本文に画像のない章は、ノイズの面を出す。
function renderChapterIndex() {
  if (!chapterIndexList) return;
  chapterIndexList.textContent = "";
  chapterGroups.forEach((group) => {
    if (!group.slug) return;
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = chapterUrl(group);
    link.className = "tape-card";

    const thumb = document.createElement("span");
    thumb.className = "tape-card__thumb";
    const firstImage = Array.from(group.root.querySelectorAll("img.wiki-image")).find(
      (candidate) => !/\.svg$/i.test(candidate.getAttribute("src") || "")
    );
    if (firstImage) {
      const original = (firstImage.getAttribute("src") || "").replace(/^\.\//, "/");
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener(
        "error",
        () => {
          if (img.getAttribute("src") !== original) img.src = original;
        },
        { once: true }
      );
      img.src = original.replace(/^\/images\/([^/]+)\.[A-Za-z0-9]+$/, "/images/cards/$1.webp");
      thumb.appendChild(img);
    } else {
      thumb.classList.add("tape-card__thumb--empty");
    }

    const body = document.createElement("span");
    body.className = "tape-card__body";
    const title = document.createElement("span");
    title.className = "tape-card__title";
    title.textContent = group.title;
    const meta = document.createElement("span");
    meta.className = "tape-card__meta";
    const parts = [];
    if (group.def.released) parts.push(`公開 ${group.def.released}`);
    if (group.def.note) parts.push(group.def.note);
    parts.forEach((text) => {
      const part = document.createElement("span");
      part.textContent = text;
      meta.appendChild(part);
    });
    body.append(title, meta);

    link.append(thumb, body);
    li.appendChild(link);
    chapterIndexList.appendChild(li);
  });
}

// 章ページ：開いたときに、テープを切り替えたときのノイズを一瞬だけ出す（表示は styles.css）。
function playTapeStart() {
  document.body.classList.add("is-tape-start");
  window.setTimeout(() => document.body.classList.remove("is-tape-start"), 700);
  scrambleTapeLabel();
}

// 章の題名の上の表示（PLAY 02 / 09）を、でたらめな文字から左から順に正しい文字へ置き換えて出す。
// 0.8秒で終わる。動きを減らす設定の端末では、最初から正しい文字を出す。
const SCRAMBLE_GLYPHS = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ#%&/<>*+=-";
const SCRAMBLE_STEPS = 20; // 1コマ40ミリ秒
const SCRAMBLE_HOLD = 3; // 最初の数コマは、すべてでたらめな文字のまま

function scrambleTapeLabel() {
  const heading = markdownContainer?.querySelector("h2[data-tape-label]");
  if (!heading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const finalText = heading.dataset.tapeLabel || "";
  const chars = Array.from(finalText);

  const render = (step) => {
    const progress = Math.max(0, (step - SCRAMBLE_HOLD) / (SCRAMBLE_STEPS - SCRAMBLE_HOLD));
    const revealed = Math.floor(chars.length * progress);
    heading.dataset.tapeLabel = chars
      .map((ch, index) =>
        index < revealed || ch === " "
          ? ch
          : SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)]
      )
      .join("");
  };

  let step = 0;
  render(step);
  const timer = window.setInterval(() => {
    step += 1;
    if (step >= SCRAMBLE_STEPS) {
      window.clearInterval(timer);
      heading.dataset.tapeLabel = finalText;
      return;
    }
    render(step);
  }, 40);
}

// 章ページ：読み進んだ位置を示す線を、画面の上端に出す。
function wireReadProgress() {
  const progress = document.createElement("div");
  progress.className = "read-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.appendChild(progress);
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
    progress.style.transform = `scaleX(${ratio})`;
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
}

// 章ページの末尾：前後の章とトップへのリンク。
function renderChapterNav() {
  if (!chapterNav) return;
  chapterNav.textContent = "";
  const linked = chapterGroups.filter((group) => group.slug);
  const index = currentChapter ? linked.indexOf(currentChapter) : -1;

  const makeLink = (group, direction) => {
    const link = document.createElement("a");
    link.href = chapterUrl(group);
    link.className = `chapter-nav__link chapter-nav__link--${direction}`;
    link.rel = direction;
    const label = document.createElement("span");
    label.className = "chapter-nav__label";
    label.textContent = direction === "prev" ? "← 前の章" : "次の章 →";
    const title = document.createElement("span");
    title.className = "chapter-nav__title";
    title.textContent = group.title;
    link.append(label, title);
    return link;
  };

  const row = document.createElement("div");
  row.className = "chapter-nav__row";
  if (index > 0) row.appendChild(makeLink(linked[index - 1], "prev"));
  if (index >= 0 && index < linked.length - 1) row.appendChild(makeLink(linked[index + 1], "next"));
  if (row.childElementCount > 0) chapterNav.appendChild(row);

  const home = document.createElement("a");
  home.href = "/";
  home.className = "chapter-nav__home";
  home.textContent = "トップ（クイックガイド・主要年表・章の一覧）へ";
  chapterNav.appendChild(home);
}

function safeDecodeHash(rawHash) {
  if (!rawHash || rawHash.length <= 1) return "";
  const body = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (!body) return "";
  try {
    return decodeURIComponent(body);
  } catch (_error) {
    return "";
  }
}

// URL の #見出し が、今のページになく、ほかの章にあるなら、その章のページへ移る。
// 1ページだった頃のリンク（/#f2-t3 など）も、これで該当する章へ届く。
function redirectHashToChapter() {
  const rawHash = window.location.hash;
  const targetId = safeDecodeHash(rawHash);
  if (!targetId) return false;
  if (document.getElementById(targetId)) return false;
  const selector = `[id="${CSS.escape(targetId)}"]`;
  const owner = chapterGroups.find(
    (group) => group.slug && group !== currentChapter && group.root.querySelector(selector)
  );
  if (!owner) return false;
  window.location.replace(`${chapterUrl(owner)}${rawHash}`);
  return true;
}

function setSectionCollapsed(sectionEl, collapsed) {
  sectionEl.classList.toggle("is-collapsed", collapsed);
  const body = sectionEl.querySelector(":scope > .h3-section__body");
  if (body instanceof HTMLElement) {
    body.hidden = collapsed;
  }
  const foldBtn = sectionEl.querySelector(":scope > h3 > .sec-fold-btn");
  if (foldBtn instanceof HTMLButtonElement) {
    const label = collapsed ? "開く" : "畳む";
    foldBtn.setAttribute("aria-expanded", String(!collapsed));
    foldBtn.textContent = label;
    foldBtn.setAttribute("aria-label", `${label}：${foldBtn.dataset.secTitle || "この節"}`);
  }
}

function syncFoldToggleUi() {
  if (!foldEventsToggle || !markdownContainer) return;
  const anyCollapsed = Boolean(markdownContainer.querySelector(".h3-section--event.is-collapsed"));
  foldEventsToggle.setAttribute("aria-pressed", String(anyCollapsed));
  foldEventsToggle.textContent = anyCollapsed
    ? "「映像で起きたこと」をすべて開く"
    : "「映像で起きたこと」を畳む";
}

function ensureSectionExpandedFor(node) {
  if (!(node instanceof Element)) return;
  const collapsedSec = node.closest(".h3-section.is-collapsed");
  if (!collapsedSec) return;
  setSectionCollapsed(collapsedSec, false);
  syncFoldToggleUi();
  window.dispatchEvent(new Event("resize"));
}

function enhanceSections(root) {
  if (!root) return;
  const h3List = Array.from(root.querySelectorAll("h3"));

  h3List.forEach((h3) => {
    const category = SECTION_CATEGORY_BY_ID[h3.id] || "supplement";
    const badgeLabel = SECTION_CATEGORY_LABELS[category] || SECTION_CATEGORY_LABELS.supplement;

    const sectionEl = document.createElement("section");
    sectionEl.className = `h3-section h3-section--${category}`;
    sectionEl.dataset.secCategory = category;

    const bodyEl = document.createElement("div");
    bodyEl.className = "h3-section__body";

    const parent = h3.parentNode;
    if (!parent) return;
    parent.insertBefore(sectionEl, h3);
    sectionEl.appendChild(h3);

    const badge = document.createElement("span");
    badge.className = `sec-badge sec-badge--${category}`;
    badge.textContent = badgeLabel;
    h3.appendChild(badge);

    if (category === "event") {
      const foldBtn = document.createElement("button");
      foldBtn.type = "button";
      foldBtn.className = "sec-fold-btn";
      foldBtn.setAttribute("aria-expanded", "true");
      foldBtn.dataset.secTitle = h3.dataset.cleanTitle || "この節";
      foldBtn.setAttribute("aria-label", `畳む：${foldBtn.dataset.secTitle}`);
      foldBtn.textContent = "畳む";
      h3.appendChild(foldBtn);
    }

    while (sectionEl.nextSibling) {
      const next = sectionEl.nextSibling;
      if (
        next instanceof Element &&
        (["H2", "H3", "HR"].includes(next.tagName) || next.classList.contains("back-to-toc"))
      ) {
        break;
      }
      bodyEl.appendChild(next);
    }

    sectionEl.appendChild(bodyEl);
  });
}

function readSavedFoldPreference() {
  try {
    return window.localStorage.getItem(FOLD_STORAGE_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

function writeSavedFoldPreference(collapsed) {
  try {
    window.localStorage.setItem(FOLD_STORAGE_KEY, collapsed ? "1" : "0");
  } catch (_error) {
    // Ignore storage errors in restricted browsing modes.
  }
}

function wireSectionFolding() {
  if (!markdownContainer) return;

  const eventSections = Array.from(markdownContainer.querySelectorAll(".h3-section--event"));
  if (foldEventsToggle) {
    foldEventsToggle.hidden = eventSections.length === 0;
  }

  if (eventSections.length > 0 && readSavedFoldPreference()) {
    eventSections.forEach((sec) => {
      setSectionCollapsed(sec, true);
    });
  }
  syncFoldToggleUi();

  foldEventsToggle?.addEventListener("click", () => {
    if (eventSections.length === 0) return;
    const anyCollapsed = Boolean(markdownContainer.querySelector(".h3-section--event.is-collapsed"));
    const nextCollapsed = !anyCollapsed;
    eventSections.forEach((sec) => {
      setSectionCollapsed(sec, nextCollapsed);
    });
    writeSavedFoldPreference(nextCollapsed);
    syncFoldToggleUi();
    window.dispatchEvent(new Event("resize"));
  });

  markdownContainer.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const foldBtn = event.target.closest(".sec-fold-btn");
    if (!foldBtn) return;
    const sectionEl = foldBtn.closest(".h3-section");
    if (!sectionEl) return;
    const willCollapse = !sectionEl.classList.contains("is-collapsed");
    setSectionCollapsed(sectionEl, willCollapse);
    const anyStillCollapsed = Boolean(markdownContainer.querySelector(".h3-section--event.is-collapsed"));
    if (!anyStillCollapsed) {
      writeSavedFoldPreference(false);
    }
    syncFoldToggleUi();
    window.dispatchEvent(new Event("resize"));
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || anchor.classList.contains("back-to-toc__link")) return;
    const targetId = safeDecodeHash(anchor.getAttribute("href") || "");
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (target) {
      ensureSectionExpandedFor(target);
    }
  });
}

function isValidGlossaryBoundary(text, start, alias) {
  const end = start + alias.length;
  const prev = start > 0 ? text[start - 1] : "";
  const next = end < text.length ? text[end] : "";

  if (/^[A-Za-z0-9]/.test(alias) && /[A-Za-z0-9_]/.test(prev)) return false;
  if (/[A-Za-z0-9]$/.test(alias) && /[A-Za-z0-9_]/.test(next)) return false;

  if (
    alias === "Bon" &&
    (text.startsWith("'s", end) ||
      text.startsWith("’s", end) ||
      text.startsWith("（灰色の存在）", end) ||
      (prev === "「" && next === "」") ||
      (prev === '"' && next === '"'))
  ) {
    return false;
  }

  const katakanaChar = /[\u30A1-\u30FA\u30FC]/;
  if (katakanaChar.test(alias[0]) && katakanaChar.test(prev)) return false;
  if (katakanaChar.test(alias[alias.length - 1]) && katakanaChar.test(next)) return false;

  return true;
}

// 箇条書きの行頭にある太字が「用語名そのもの」のとき、その用語の id を返す（それ以外は空）。
// 例：「**ローズマリー・ウォルテン**：…」「**スーザン・ウッディングス（バニー）**：…」
//     「**デビッド・ゴンザレス（生還）とブライアン・ステルズ（死亡）**：…」
// 「**ジャックの出発（6月11日）…**」のように用語で始まるだけの見出しは対象にしない。
function findGlossaryLabelIds(textNode, candidates) {
  const strong = textNode.parentElement;
  if (!strong || strong.tagName !== "STRONG" || strong.childNodes.length !== 1) return [];
  const item = strong.parentElement;
  if (!item || item.tagName !== "LI") return [];
  let first = item.firstChild;
  while (first && first.nodeType === Node.TEXT_NODE && !first.nodeValue.trim()) first = first.nextSibling;
  if (first !== strong) return [];

  // 丸括弧の添え書きを外し、残りが用語名（と区切り）だけでできているかを見る
  const label = textNode.nodeValue.replace(/（[^（）]*）/g, "").trim();
  if (!label) return [];
  const ids = [];
  let pos = 0;
  while (pos < label.length) {
    const hit = candidates.find((candidate) => label.startsWith(candidate.alias, pos));
    if (!hit) return [];
    ids.push(hit.id);
    pos += hit.alias.length;
    const separator = /^[\s、，,／/＆&と]+/.exec(label.slice(pos));
    if (separator) pos += separator[0].length;
    else if (pos < label.length) return [];
  }
  return ids;
}

function collectGlossaryScopes(root) {
  if (!root) return [];
  const scopes = [];
  let currentIntroNodes = [];

  Array.from(root.children).forEach((child) => {
    if (child.tagName === "H2" || child.tagName === "HR" || child.classList.contains("back-to-toc")) {
      if (currentIntroNodes.length > 0) {
        scopes.push(currentIntroNodes);
        currentIntroNodes = [];
      }
      return;
    }
    if (child.classList.contains("h3-section")) {
      if (currentIntroNodes.length > 0) {
        scopes.push(currentIntroNodes);
        currentIntroNodes = [];
      }
      const body = child.querySelector(":scope > .h3-section__body");
      if (body) scopes.push([body]);
      return;
    }
    currentIntroNodes.push(child);
  });

  if (currentIntroNodes.length > 0) {
    scopes.push(currentIntroNodes);
  }

  // 畳まれた「先の内容に触れる箇所」が節の初出枠を使い切らないよう、独立した枠として扱う。
  root.querySelectorAll("details.spoiler-fold").forEach((fold) => {
    scopes.push([fold]);
  });

  return scopes;
}

function enhanceGlossaryTerms(glossaryItems, root) {
  if (!root || !Array.isArray(glossaryItems) || glossaryItems.length === 0) return;

  const candidates = [];
  glossaryItems.forEach((entry) => {
    if (!entry || !entry.id || !Array.isArray(entry.aliases)) return;
    entry.aliases.forEach((alias) => {
      if (typeof alias === "string" && alias.trim()) {
        candidates.push({ id: entry.id, alias: alias.trim() });
      }
    });
  });
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  if (candidates.length === 0) return;

  const excludedTags = new Set([
    "H1",
    "H2",
    "H3",
    "H4",
    "A",
    "BUTTON",
    "CODE",
    "PRE",
    "MARK",
    "FIGCAPTION",
    "SCRIPT",
    "STYLE"
  ]);

  const scopes = collectGlossaryScopes(root);
  scopes.forEach((rootNodes) => {
    const seenIds = new Set();
    const textNodes = [];

    rootNodes.forEach((rootNode) => {
      const isSpoilerScope = rootNode instanceof Element && rootNode.matches("details.spoiler-fold");
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (excludedTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (!isSpoilerScope && parent.closest("details.spoiler-fold")) {
            return NodeFilter.FILTER_REJECT;
          }
          if (
            parent.closest(
              "a, button, code, pre, figcaption, summary, h1, h2, h3, h4, .back-to-toc, .sec-badge, .sec-fold-btn, .term-wrap, .term-card, .analysis-block__title, .analysis-block__conclusion"
            )
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
      }
    });

    // 人物などを1件ずつ紹介する箇条書き（行頭の太字が用語名そのもの）では、
    // 同じ節の手前の行に名前が先に出ていても、その太字の名前のほうに付ける。
    const reservedNodes = new Map();
    textNodes.forEach((textNode) => {
      findGlossaryLabelIds(textNode, candidates).forEach((id) => {
        if (!reservedNodes.has(id)) reservedNodes.set(id, textNode);
      });
    });

    textNodes.forEach((textNode) => {
      if (seenIds.size >= glossaryItems.length) return;
      const text = textNode.nodeValue;
      if (!text) return;

      let cursor = 0;
      let fragment = null;

      while (cursor < text.length) {
        let best = null;

        for (const candidate of candidates) {
          if (seenIds.has(candidate.id)) continue;
          const reservedNode = reservedNodes.get(candidate.id);
          if (reservedNode && reservedNode !== textNode) continue;
          let searchFrom = cursor;
          while (searchFrom < text.length) {
            const idx = text.indexOf(candidate.alias, searchFrom);
            if (idx === -1) break;
            if (isValidGlossaryBoundary(text, idx, candidate.alias)) {
              if (
                !best ||
                idx < best.start ||
                (idx === best.start && candidate.alias.length > best.alias.length)
              ) {
                best = { id: candidate.id, alias: candidate.alias, start: idx };
              }
              break;
            }
            searchFrom = idx + 1;
          }
        }

        if (!best) break;

        if (!fragment) {
          fragment = document.createDocumentFragment();
        }
        if (best.start > cursor) {
          fragment.append(text.slice(cursor, best.start));
        }

        const wrap = document.createElement("span");
        wrap.className = "term-wrap";

        // ボタン要素は行の途中で折り返せない塊になり、用語の手前で改行されて前の行が空くため、
        // 本文と同じように折り返せる span をボタンとして扱う（キーボード操作は wireGlossaryPopovers）。
        const btn = document.createElement("span");
        btn.setAttribute("role", "button");
        btn.tabIndex = 0;
        btn.className = "term-trigger";
        btn.dataset.termId = best.id;
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = best.alias;

        wrap.appendChild(btn);
        fragment.appendChild(wrap);
        seenIds.add(best.id);
        cursor = best.start + best.alias.length;
      }

      if (fragment) {
        if (cursor < text.length) {
          fragment.append(text.slice(cursor));
        }
        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    });
  });
}

function wireGlossaryPopovers(glossaryItems) {
  if (!markdownContainer || !Array.isArray(glossaryItems) || glossaryItems.length === 0) return;

  const entryMap = new Map();
  glossaryItems.forEach((entry) => {
    if (entry && entry.id) {
      entryMap.set(entry.id, entry);
    }
  });

  let activeTrigger = null;
  let activeCard = null;
  let positionFrame = 0;
  // スマホ（画面下部のカード）：押した用語がカードの上に一度でも出たか。出たあとでカードの裏に入ったら閉じる。
  let triggerSeenAboveCard = false;

  const closePopover = ({ restoreFocus = false } = {}) => {
    if (activeCard) {
      activeCard.remove();
      activeCard = null;
    }
    if (activeTrigger) {
      const prevTrigger = activeTrigger;
      activeTrigger = null;
      prevTrigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) {
        prevTrigger.focus();
      }
    }
  };

  // 上部の現在地バー（幅960px以下で出る）の下端。出ていなければ 0。
  const readingBarBottom = () => {
    if (!readingBar) return 0;
    const rect = readingBar.getBoundingClientRect();
    return rect.height > 0 ? Math.max(rect.bottom, 0) : 0;
  };

  const positionPopover = () => {
    if (!activeCard || !activeTrigger) return;
    const margin = 12;
    const gap = 6;
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const barBottom = readingBarBottom();
    const minTop = barBottom + margin;
    const rect = activeTrigger.getBoundingClientRect();
    if (rect.bottom < barBottom || rect.top > height) {
      closePopover();
      return;
    }
    activeCard.style.maxHeight = `${Math.max(0, height - minTop - margin)}px`;
    // スマホでは CSS の画面下部カードを使う。
    if (window.matchMedia("(max-width: 640px)").matches) {
      activeCard.style.removeProperty("left");
      activeCard.style.removeProperty("top");
      // 上へスクロールして、用語がカードの裏に入ったら閉じる（開いた直後、用語をカードの上へ出す途中は閉じない）。
      if (rect.top < activeCard.getBoundingClientRect().top) {
        triggerSeenAboveCard = true;
      } else if (triggerSeenAboveCard) {
        closePopover();
      }
      return;
    }

    // 複数行の inline 要素の外接矩形と、絶対配置の基準点は一致しない。
    // 最後の行を起点に固定配置し、カード自身の寸法で画面内に収める。
    const fragments = activeTrigger.getClientRects();
    const lastRect = fragments[fragments.length - 1] || rect;
    const cardRect = activeCard.getBoundingClientRect();
    const left = Math.max(margin, Math.min(lastRect.left, width - cardRect.width - margin));
    const below = rect.bottom + gap;
    const above = rect.top - cardRect.height - gap;
    const preferredTop = below + cardRect.height <= height - margin ? below : above;
    const top = Math.max(minTop, Math.min(preferredTop, height - cardRect.height - margin));
    activeCard.style.left = `${left}px`;
    activeCard.style.top = `${top}px`;
  };

  const schedulePosition = () => {
    if (!activeCard || positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      positionPopover();
    });
  };
  window.addEventListener("scroll", schedulePosition, { passive: true, capture: true });
  window.addEventListener("resize", schedulePosition, { passive: true });
  markdownContainer.addEventListener("load", schedulePosition, true);

  const openPopover = (trigger, entry) => {
    closePopover();
    const wrap = trigger.closest(".term-wrap");
    if (!wrap) return;

    const card = document.createElement("div");
    card.className = "term-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `${entry.term}の説明`);

    const header = document.createElement("div");
    header.className = "term-card__header";

    const title = document.createElement("span");
    title.className = "term-card__title";
    title.textContent = entry.term;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "term-card__close";
    closeBtn.setAttribute("aria-label", "説明を閉じる");
    closeBtn.textContent = "閉じる";

    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    const content = document.createElement("div");
    content.className = "term-card__content";

    const safeImg = entry.image ? sanitizeImageSrc(entry.image) : "";
    if (safeImg) {
      const img = document.createElement("img");
      img.className = "term-card__img";
      img.src = safeImg;
      img.alt = entry.term;
      img.loading = "lazy";
      content.appendChild(img);
    }

    // 説明文は、押された場所の時点までに明かされた内容のものを出す。
    const stageIndex = resolveStageIndexFor(trigger);
    const picked = pickGlossaryDescription(entry, stageIndex);
    const desc = document.createElement("p");
    desc.className = "term-card__desc";
    desc.textContent = picked.text;
    content.appendChild(desc);

    card.appendChild(content);
    wrap.appendChild(card);

    trigger.setAttribute("aria-expanded", "true");
    activeTrigger = trigger;
    activeCard = card;
    triggerSeenAboveCard = false;
    positionPopover();
    keepTriggerVisible(trigger, card);
  };

  // スマホでは、画面下部のカードが押した用語に重ならないようにする。
  // 用語はカードの少し上（40px）まで上げる（少し指が動いただけで、用語がカードの裏に入って閉じないように）。
  const keepTriggerVisible = (trigger, card) => {
    if (!window.matchMedia("(max-width: 640px)").matches) return;
    const cardTop = card.getBoundingClientRect().top;
    const triggerBottom = trigger.getBoundingClientRect().bottom;
    if (triggerBottom > cardTop - 24) {
      // 見出しや検索の位置合わせ直しが、このスクロールを戻さないようにする（キーボードで開いたときのため）。
      window.dispatchEvent(new Event("twf:own-scroll"));
      window.scrollBy({ top: triggerBottom - cardTop + 40, behavior: "smooth" });
    }
  };

  const toggleTerm = (trigger) => {
    const entry = entryMap.get(trigger.dataset.termId || "");
    if (!entry) return;
    if (activeTrigger === trigger) {
      closePopover();
    } else {
      openPopover(trigger, entry);
    }
  };

  markdownContainer.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const closeBtn = event.target.closest(".term-card__close");
    if (closeBtn) {
      event.preventDefault();
      closePopover({ restoreFocus: true });
      return;
    }

    const trigger = event.target.closest(".term-trigger");
    if (!(trigger instanceof HTMLElement)) return;
    toggleTerm(trigger);
  });

  // 用語は span なので、Enter と Space でも開閉できるようにする。
  markdownContainer.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof HTMLElement) || !event.target.classList.contains("term-trigger")) return;
    event.preventDefault();
    toggleTerm(event.target);
  });

  document.addEventListener("click", (event) => {
    if (!activeCard) return;
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest(".term-wrap")) {
      closePopover();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeCard) {
      event.preventDefault();
      closePopover({ restoreFocus: true });
    }
  });
}

function wireTocToggle() {
  if (!tocNav || !tocToggleButton) return;

  const compactQuery = window.matchMedia("(max-width: 960px)");

  const applyCollapsedState = (collapsed) => {
    tocNav.hidden = collapsed;
    tocToggleButton.setAttribute("aria-expanded", String(!collapsed));
    tocToggleButton.textContent = collapsed ? "目次を開く" : "目次を閉じる";
  };

  const setDrawerOpen = (open) => {
    if (!readingBarDrawer || !readingBarToggle) return;
    readingBarDrawer.hidden = !open;
    readingBarToggle.setAttribute("aria-expanded", String(open));
    readingBarToggle.textContent = open ? "閉じる" : "目次";
    if (!open) return;
    // 開いたとき、今いる項目が引き出しの見える範囲に入るようにする。
    const current =
      readingBarTocList?.querySelector("a.is-current") ?? readingBarTocList?.querySelector("a.is-parent-current");
    if (!(current instanceof HTMLElement)) return;
    const drawerRect = readingBarDrawer.getBoundingClientRect();
    const linkRect = current.getBoundingClientRect();
    if (linkRect.top < drawerRect.top + 12 || linkRect.bottom > drawerRect.bottom - 12) {
      readingBarDrawer.scrollTop += linkRect.top - drawerRect.top - drawerRect.height / 3;
    }
  };

  const syncByViewport = () => {
    applyCollapsedState(compactQuery.matches);
    if (!compactQuery.matches) {
      setDrawerOpen(false);
    }
  };

  tocToggleButton.addEventListener("click", () => {
    applyCollapsedState(!tocNav.hidden);
  });

  tocList?.addEventListener("click", (event) => {
    if (!compactQuery.matches) return;
    if (event.target instanceof Element && event.target.closest("a")) {
      applyCollapsedState(true);
    }
  });

  readingBarToggle?.addEventListener("click", () => {
    if (!readingBarDrawer) return;
    setDrawerOpen(readingBarDrawer.hidden);
  });

  readingBarTocList?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setDrawerOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (!readingBarDrawer || readingBarDrawer.hidden || !readingBar) return;
    if (event.target instanceof Node && !readingBar.contains(event.target)) {
      setDrawerOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && readingBarDrawer && !readingBarDrawer.hidden) {
      setDrawerOpen(false);
      readingBarToggle?.focus();
    }
  });

  if (typeof compactQuery.addEventListener === "function") {
    compactQuery.addEventListener("change", syncByViewport);
  } else {
    compactQuery.addListener(syncByViewport);
  }

  syncByViewport();
}

function wireActiveHeadingTracker() {
  if (!markdownContainer) return;
  const headings = Array.from(markdownContainer.querySelectorAll("h2, h3"));
  if (headings.length === 0) return;

  const quickGuideSection = document.querySelector(".quick-guide");
  const timelineSection = document.querySelector(".timeline");
  const narrowBarQuery = window.matchMedia("(max-width: 640px)");
  let ticking = false;
  let lastActiveId = "";
  // 目次やページ内リンクで最後に選ばれた見出し（ページ末尾の補正に使う）。
  let requestedHeadingId = "";

  const isHeadingOnScreen = (heading) => {
    const rect = heading.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  };

  const updateCurrentHeading = () => {
    ticking = false;
    // 検索バーが上に張り付いているときは、その下端までを「通り過ぎた」範囲とみなす。
    const searchStuck = parseFloat(document.documentElement.style.getPropertyValue("--search-stuck")) || 0;
    const threshold = (window.innerWidth <= 960 ? 84 : 96) + searchStuck;
    let activeHeading = null;
    let activeH2 = null;

    for (const heading of headings) {
      const rect = heading.getBoundingClientRect();
      if (rect.top <= threshold) {
        activeHeading = heading;
        if (heading.tagName === "H2") {
          activeH2 = heading;
        }
      } else {
        break;
      }
    }

    // ページの最下部では、末尾の見出しは画面の上端まで届かない。
    // その場合は、選ばれた見出し（なければ画面内で最後の見出し）を現在地にする。
    const atPageBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atPageBottom) {
      let bottomHeading = null;
      const requested = requestedHeadingId
        ? headings.find((heading) => heading.id === requestedHeadingId)
        : null;
      if (requested && isHeadingOnScreen(requested)) {
        bottomHeading = requested;
      } else {
        for (let i = headings.length - 1; i >= 0; i -= 1) {
          if (isHeadingOnScreen(headings[i])) {
            bottomHeading = headings[i];
            break;
          }
        }
      }
      if (bottomHeading && headings.indexOf(bottomHeading) > headings.indexOf(activeHeading)) {
        activeHeading = bottomHeading;
        activeH2 = bottomHeading.tagName === "H2" ? bottomHeading : null;
      }
    }

    // If activeHeading is H3, make sure activeH2 points to its owning H2
    if (activeHeading && activeHeading.tagName === "H3" && !activeH2) {
      const idx = headings.indexOf(activeHeading);
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (headings[i].tagName === "H2") {
          activeH2 = headings[i];
          break;
        }
      }
    }

    const activeId = activeHeading ? activeHeading.id : "";
    const parentH2Id = activeH2 && activeH2 !== activeHeading ? activeH2.id : "";

    if (activeId !== lastActiveId) {
      lastActiveId = activeId;
      const allTocLinks = document.querySelectorAll("#tocList a, #readingBarTocList a");
      allTocLinks.forEach((link) => {
        const targetId = link.getAttribute("data-target-id") || "";
        const isCurrent = Boolean(activeId && targetId === activeId);
        const isParent = Boolean(parentH2Id && targetId === parentH2Id);
        link.classList.toggle("is-current", isCurrent);
        link.classList.toggle("is-parent-current", isParent);
        if (isCurrent) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });

      if (activeId && tocSidebar && window.innerWidth > 960) {
        const desktopActive = tocList?.querySelector(`a[data-target-id="${CSS.escape(activeId)}"]`);
        if (desktopActive) {
          const sidebarRect = tocSidebar.getBoundingClientRect();
          const linkRect = desktopActive.getBoundingClientRect();
          if (linkRect.top < sidebarRect.top + 36 || linkRect.bottom > sidebarRect.bottom - 24) {
            tocSidebar.scrollTop += linkRect.top - sidebarRect.top - sidebarRect.height * 0.35;
          }
        }
      }
    }

    if (readingBarTitle && readingBarYear) {
      if (activeHeading) {
        const h2Text = activeH2 ? (activeH2.dataset.cleanTitle || activeH2.textContent?.trim() || "") : "";
        const currentText = activeHeading.dataset.cleanTitle || activeHeading.textContent?.trim() || "";
        const yearLabel = extractHeadingYear(currentText) || (activeHeading === activeH2 ? extractHeadingYear(h2Text) : "");

        // 狭い画面では章名を省き、節の題名をなるべく省略せずに出す（章名はページの上部にある）。
        if (activeHeading.tagName === "H3" && h2Text && !narrowBarQuery.matches) {
          const shortChapter = h2Text.split("—")[0].split("（")[0].trim();
          readingBarTitle.textContent = `${shortChapter} › ${currentText}`;
        } else {
          readingBarTitle.textContent = currentText;
        }

        if (yearLabel) {
          readingBarYear.textContent = yearLabel;
          readingBarYear.hidden = false;
        } else {
          readingBarYear.textContent = "";
          readingBarYear.hidden = true;
        }
      } else {
        readingBarYear.textContent = "";
        readingBarYear.hidden = true;
        if (timelineSection && timelineSection.getBoundingClientRect().top <= threshold) {
          readingBarTitle.textContent = timelineSection.querySelector("h2")?.textContent?.trim() || "主要年表";
        } else if (quickGuideSection && quickGuideSection.getBoundingClientRect().top <= threshold) {
          readingBarTitle.textContent = quickGuideSection.querySelector("h2")?.textContent?.trim() || "クイックガイド";
        } else {
          readingBarTitle.textContent = currentChapter ? currentChapter.title : "目次・案内";
        }
      }
    }
  };

  const onScrollOrResize = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateCurrentHeading);
    }
  };

  // 見出しへのリンクが押されたら、その見出しを覚えておく。
  // すでに最下部にいると画面が動かず scroll が起きないため、判定も明示的にやり直す。
  const rememberRequestedHeading = (targetId) => {
    if (!headings.some((heading) => heading.id === targetId)) return;
    requestedHeadingId = targetId;
    window.setTimeout(onScrollOrResize, 0);
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href^="#"]');
    const targetId = safeDecodeHash(anchor?.getAttribute("href") || "");
    if (targetId) rememberRequestedHeading(targetId);
  });

  window.addEventListener("hashchange", () => {
    const targetId = safeDecodeHash(window.location.hash);
    if (targetId) rememberRequestedHeading(targetId);
  });

  // 利用者が自分でスクロールし始めたら、選ばれた見出しの記憶は捨てる。
  const forgetRequestedHeading = () => {
    requestedHeadingId = "";
  };
  window.addEventListener("wheel", forgetRequestedHeading, { passive: true });
  window.addEventListener("touchmove", forgetRequestedHeading, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
      forgetRequestedHeading();
    }
  });

  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize, { passive: true });
  updateCurrentHeading();
}

function addBackToTocLinks(root) {
  if (!root) return;

  const headings = Array.from(root.querySelectorAll("h2"));
  headings.forEach((heading, index) => {
    const backToToc = document.createElement("div");
    const link = document.createElement("a");
    const headingText = heading.dataset.cleanTitle || heading.textContent?.trim() || "この章";

    backToToc.className = "back-to-toc";
    link.className = "back-to-toc__link";
    link.href = "#tocSidebar";
    link.textContent = "↑ 目次へ戻る";
    link.setAttribute("aria-label", `${headingText}を読み終えて目次へ戻る`);
    backToToc.appendChild(link);

    root.insertBefore(backToToc, headings[index + 1] ?? null);
  });
}

function wireBackToTocLinks() {
  if (!markdownContainer || !tocSidebar) return;

  markdownContainer.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest(".back-to-toc__link");
    if (!link) return;

    event.preventDefault();
    if (tocNav?.hidden && tocToggleButton) {
      tocNav.hidden = false;
      tocToggleButton.setAttribute("aria-expanded", "true");
      tocToggleButton.textContent = "目次を閉じる";
    }
    tocNav?.focus({ preventScroll: true });
    (layoutContainer ?? tocSidebar).scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// 検索の対象：今のページの章と、画面に出していないほかの章（章の順に並ぶ）。
// 親ページでは、すべての章が画面に出していない側にある。
function searchGroups() {
  if (chapterGroups.length > 0) return chapterGroups;
  return markdownContainer ? [{ slug: "", title: "", root: markdownContainer }] : [];
}

// 一致箇所（mark）が、どの章にあるか。
const markGroups = new WeakMap();
// 日付の span をまたぐ1件の一致は、表示上の mark が複数でも1件として扱う。
const matchMarks = new WeakMap();

function marksForMatch(mark) {
  return matchMarks.get(mark) || [mark];
}

const SEARCH_BLOCK_SELECTOR = "p, li, figcaption, h2, h3, h4";
const INTER_BLOCK_CONTAINERS = new Set(["UL", "OL", "DIV", "SECTION", "BLOCKQUOTE", "FIGURE", "DETAILS"]);

// 用語の span や太字などの inline 要素は、検索する文字列の区切りにはしない（段落・箇条書き・見出しごとに繋ぐ）。
function collectSearchTextRuns(root) {
  const runs = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue) return NodeFilter.FILTER_REJECT;
      if (parent.closest(".back-to-toc, .sec-badge, .sec-fold-btn, .term-card, summary, script, style, mark")) {
        return NodeFilter.FILTER_REJECT;
      }
      const block = parent.closest(SEARCH_BLOCK_SELECTOR);
      if (!node.nodeValue.trim() && (!block || INTER_BLOCK_CONTAINERS.has(parent.tagName))) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const block = node.parentElement.closest(SEARCH_BLOCK_SELECTOR);
    let run = runs[runs.length - 1];
    if (!block || !run || run.block !== block) {
      run = { block, text: "", nodes: [] };
      runs.push(run);
    }
    const start = run.text.length;
    run.text += node.nodeValue;
    run.nodes.push({ node, start, end: run.text.length });
  }
  return runs;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 候補・件数・本文で同じ表記として照合する。本文に表示する文字は変更しない。
function normalizeSearchText(text) {
  return text.normalize("NFKC")
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase();
}

// 語の途中にあってもなくても、同じ語として照合する記号（中黒・アポストロフィ・ハイフンやダッシュ）。
// 例：「ローズマリーウォルテン」で「ローズマリー・ウォルテン」、「Bon’s」「bons」で「Bon's」、「K9」で「K-9」に一致させる。
const SEARCH_JOINERS = "'’‘ʼ`´・·‧\\-‐‑‒–—―";
const SEARCH_JOINER_PATTERN = new RegExp(`[${SEARCH_JOINERS}]`);
// 検索語の区切り（空白・読点・カンマ）。語句として見つからないときは、ここで分けた語をすべて含む箇所を探す。
const SEARCH_TERM_SEPARATOR = /[\s,、]/;

// 検索語を1文字ずつ並べ、文字のあいだに上の記号が入っていても一致する正規表現の本体を作る。
// 検索語の空白は、本文の空白や記号（「ファイル1 — 会社紹介テープ」の「 — 」など）にも一致させる。
// 数字どうしのあいだは緩めない（「71」が「07-14」の「7-1」に一致しないように）。
function buildLooseKeywordPattern(normalizedKeyword) {
  const parts = [];
  let previous = "";
  let gap = "";
  for (const ch of normalizedKeyword) {
    if (SEARCH_TERM_SEPARATOR.test(ch)) {
      if (previous) gap = "space";
      continue;
    }
    if (SEARCH_JOINER_PATTERN.test(ch)) {
      if (previous && gap !== "space") gap = "joiner";
      continue;
    }
    if (previous) {
      if (gap === "space") {
        parts.push(`[${SEARCH_JOINERS}\\s]*`);
      } else if (/\d/.test(previous) && /\d/.test(ch)) {
        if (gap === "joiner") parts.push(`[${SEARCH_JOINERS}]+`);
      } else {
        parts.push(`[${SEARCH_JOINERS}]*`);
      }
    }
    parts.push(escapeRegExp(ch));
    previous = ch;
    gap = "";
  }
  return parts.join("");
}

// 検索語を、空白・読点・カンマで語に分ける（重複は除く）。
function splitSearchTerms(keyword) {
  const terms = normalizeSearchText(String(keyword ?? ""))
    .split(/[\s,、]+/)
    .filter((term) => term && buildLooseKeywordPattern(term));
  return [...new Set(terms)];
}

// 「1974/05/02」「1974年5月2日」「05/02/1974」のような日付検索では、表記ゆれもまとめて一致させる。
function buildKeywordRegex(keyword) {
  const trimmed = normalizeSearchText(String(keyword ?? "").trim());
  if (!trimmed) return null;
  const ymd = trimmed.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?$/);
  const mdy = !ymd ? trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  const dateParts = ymd
    ? { year: ymd[1], month: Number(ymd[2]), day: Number(ymd[3]) }
    : mdy
      ? { year: mdy[3], month: Number(mdy[1]), day: Number(mdy[2]) }
      : null;

  if (
    dateParts &&
    dateParts.month >= 1 &&
    dateParts.month <= 12 &&
    dateParts.day >= 1 &&
    dateParts.day <= 31
  ) {
    const { year, month, day } = dateParts;
    const mPat = month < 10 ? `0?${month}` : String(month);
    const dPat = day < 10 ? `0?${day}` : String(day);
    const numericDate = `${year}[/-]${mPat}[/-]${dPat}|${mPat}/${dPat}/${year}`;
    const pattern = `${year}年${mPat}月${dPat}日|(${numericDate})(?!\\d)`;
    return new RegExp(pattern, "gi");
  }

  // 記号だけの検索語（「・」など）は、そのままの文字で探す。
  return new RegExp(buildLooseKeywordPattern(trimmed) || escapeRegExp(trimmed), "gi");
}

function findKeywordMatches(text, regex) {
  const matches = [];
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    // 数字表記の日付だけは直前の数字も確認する（後読み非対応のブラウザーでも動く）。
    if (match[1] && /\d/.test(text.charAt(match.index - 1))) {
      regex.lastIndex = match.index + 1;
      continue;
    }
    matches.push(match);
  }
  return matches;
}

const searchSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("ja", { granularity: "grapheme" })
  : null;

function findOriginalMatchRanges(text, regex) {
  const normalized = normalizeSearchText(text);
  const matches = findKeywordMatches(normalized, regex);
  if (matches.length === 0) return [];

  // 例：半角の「ﾎﾞ」は照合時に1文字になる。正規化前の本文を切り出すための位置を記録する。
  const starts = [];
  const ends = [];
  if (text.normalize("NFKC") !== text || text.toLowerCase().length !== text.length) {
    const segments = searchSegmenter?.segment(text) ?? text.matchAll(/.[\p{M}\uFF9E\uFF9F]*/gsu);
    for (const part of segments) {
      const original = part.segment ?? part[0];
      const length = normalizeSearchText(original).length;
      for (let i = 0; i < length; i++) {
        starts.push(part.index + (length === original.length ? i : 0));
        ends.push(part.index + (length === original.length ? i + 1 : original.length));
      }
    }
  }

  const ranges = [];
  for (const match of matches) {
    const from = match.index;
    const to = from + match[0].length;
    const start = starts[from] ?? from;
    const end = ends[to - 1] ?? to;
    const previous = ranges[ranges.length - 1];
    if (previous && start < previous.end) {
      previous.end = Math.max(previous.end, end);
    } else {
      ranges.push({ start, end, marks: [] });
    }
  }
  return ranges;
}

function isMarkOnThisPage(mark) {
  return Boolean(markdownContainer && markdownContainer.contains(mark));
}

function clearHighlights() {
  searchGroups().forEach((group) => {
    group.root.querySelectorAll("mark").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
      parent.normalize();
    });
  });
}

// 複数の語をすべて含む段落・箇条書き・見出しだけを対象に、それぞれの語の一致箇所を返す。
function findAllTermsMatchRanges(text, regexes) {
  const all = [];
  for (const regex of regexes) {
    const ranges = findOriginalMatchRanges(text, regex);
    if (ranges.length === 0) return [];
    all.push(...ranges);
  }
  all.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  all.forEach((range) => {
    const previous = merged[merged.length - 1];
    if (previous && range.start < previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end, marks: [] });
    }
  });
  return merged;
}

function highlightKeyword(keyword) {
  const regex = buildKeywordRegex(keyword);
  if (!regex) return [];
  const phraseMarks = highlightMatchRanges((text) => findOriginalMatchRanges(text, regex));
  if (phraseMarks.length > 0) return phraseMarks;

  // ひと続きの語句としては見つからず、空白や読点で区切ってあるとき（「ソフィー フェリックス」など）は、
  // すべての語を含む段落・箇条書き・見出しを探す。
  const termRegexes = splitSearchTerms(keyword).map((term) => buildKeywordRegex(term)).filter(Boolean);
  if (termRegexes.length < 2) return phraseMarks;
  return highlightMatchRanges((text) => findAllTermsMatchRanges(text, termRegexes));
}

// findRanges（段落などの文字列 → 一致範囲の配列）で見つけた箇所を mark で囲み、一致箇所ごとの先頭の mark を返す。
function highlightMatchRanges(findRanges) {
  const createdMarks = [];

  searchGroups().forEach((group) => {
    collectSearchTextRuns(group.root).forEach((run) => {
      const matches = findRanges(run.text);
      if (matches.length === 0) return;

      run.nodes.forEach(({ node, start, end }) => {
        const overlaps = matches.filter((match) => match.start < end && match.end > start);
        if (overlaps.length === 0) return;
        const text = node.nodeValue;
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        overlaps.forEach((match) => {
          const from = Math.max(match.start, start) - start;
          const to = Math.min(match.end, end) - start;
          if (from > cursor) fragment.append(text.slice(cursor, from));
          const mark = document.createElement("mark");
          mark.textContent = text.slice(from, to);
          fragment.append(mark);
          match.marks.push(mark);
          cursor = to;
        });
        if (cursor < text.length) fragment.append(text.slice(cursor));
        node.parentNode?.replaceChild(fragment, node);
      });
      matches.forEach(({ marks }) => {
        const mark = marks[0];
        matchMarks.set(mark, marks);
        markGroups.set(mark, group);
        createdMarks.push(mark);
      });
    });
  });

  return createdMarks;
}

// 検索結果の一覧：一致箇所の「章 › 節」を求める。
// 狭い画面では、章名を短い呼び名（「ファイル2」など）に、節の題名を「—」より前（「テープ1」など）にして、
// 一覧の1行を短くする（どんな場面かは、行の文面で分かる）。
function describeMatchLocation(mark) {
  const group = markGroups.get(mark);
  const narrow = window.matchMedia("(max-width: 640px)").matches;
  const chapter = (narrow && group?.def?.prefix) || group?.title || "";
  const sectionHeading = mark.closest(".h3-section")?.querySelector(":scope > h3");
  const fullSection = sectionHeading ? sectionHeading.dataset.cleanTitle || "" : "";
  const section = narrow ? fullSection.split("—")[0].trim() || fullSection : fullSection;
  return [chapter, section].filter(Boolean).join(" › ") || "冒頭";
}

// 検索結果の一覧：一致箇所の前後の文脈（それぞれ SEARCH_CONTEXT_LENGTH 字まで）を求める。
function describeMatchContext(mark) {
  const parts = marksForMatch(mark);
  const lastPart = parts[parts.length - 1];
  const block =
    mark.closest(SEARCH_BLOCK_SELECTOR) || mark.closest("blockquote, td, th") || mark.parentElement || mark;
  const isSearchBlock = block instanceof Element && block.matches(SEARCH_BLOCK_SELECTOR);
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest(".back-to-toc, .sec-badge, .sec-fold-btn, .term-card, summary")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (isSearchBlock && node.parentElement.closest(SEARCH_BLOCK_SELECTOR) !== block) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let before = "";
  let after = "";
  let passedMatch = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (parts.some((part) => part.contains(node))) {
      if (lastPart.contains(node)) passedMatch = true;
    } else if (passedMatch) {
      after += node.nodeValue ?? "";
      if (after.length > SEARCH_CONTEXT_LENGTH * 2) break;
    } else {
      before += node.nodeValue ?? "";
    }
  }

  before = before.replace(/\s+/g, " ").replace(/^\s+/, "");
  after = after.replace(/\s+/g, " ").replace(/\s+$/, "");
  return {
    before: before.length > SEARCH_CONTEXT_LENGTH ? `…${before.slice(-SEARCH_CONTEXT_LENGTH)}` : before,
    after: after.length > SEARCH_CONTEXT_LENGTH ? `${after.slice(0, SEARCH_CONTEXT_LENGTH)}…` : after
  };
}

function readSearchHistory() {
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const list = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      list.push(trimmed);
      if (list.length >= SEARCH_HISTORY_LIMIT) break;
    }
    return list;
  } catch (_error) {
    return [];
  }
}

function writeSearchHistory(list) {
  try {
    window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(list.slice(0, SEARCH_HISTORY_LIMIT)));
  } catch (_error) {
    // Ignore storage errors in restricted browsing modes.
  }
}

// 本文中の検索対象テキストを集め、候補ごとの一致件数を高速に数えられるようにする。
function collectSearchCorpus() {
  const chunks = [];
  searchGroups().forEach((group) => {
    collectSearchTextRuns(group.root).forEach((run) => chunks.push(run.text));
  });
  return normalizeSearchText(chunks.join("\0"));
}

function countKeywordInCorpus(corpus, keyword) {
  if (!corpus || !keyword) return 0;
  const regex = buildKeywordRegex(keyword);
  if (!regex) return 0;
  return findKeywordMatches(corpus, regex).length;
}

const STARTER_SUGGESTIONS = [
  "ソフィー",
  "フェリックス",
  "ジャック",
  "ローズマリー",
  "ボン",
  "BunnyFarm",
  "K-9保管施設",
  "Wonderland",
  "1974"
];

const EXTRA_SUGGESTIONS = [
  "1967",
  "1970",
  "1974/05/02",
  "1978",
  "1982",
  "Showstoppers",
  "Little Bon",
  "Safety in pills",
  "I'm still here",
  "きれいにする"
];

function buildSearchCandidates(glossaryItems, corpus) {
  const candidates = [];
  const seenKeywords = new Set();

  const addCandidate = (keyword, meta = "", entryId = "", isStarter = false) => {
    const trimmed = typeof keyword === "string" ? keyword.trim() : "";
    const key = trimmed.toLowerCase();
    if (!trimmed || seenKeywords.has(key)) return;
    const count = countKeywordInCorpus(corpus, trimmed);
    if (count <= 0) return;
    seenKeywords.add(key);
    let effectiveMeta = meta;
    if (!effectiveMeta) {
      const ymd = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (ymd) effectiveMeta = `${Number(ymd[1])}年${Number(ymd[2])}月${Number(ymd[3])}日`;
    }
    candidates.push({
      keyword: trimmed,
      meta: effectiveMeta && effectiveMeta !== trimmed ? effectiveMeta : "",
      entryId,
      isStarter,
      count,
      normKeyword: normalizeSearchText(trimmed),
      normMeta: normalizeSearchText(effectiveMeta)
    });
  };

  STARTER_SUGGESTIONS.forEach((kw) => addCandidate(kw, "", "", true));

  if (Array.isArray(glossaryItems)) {
    glossaryItems.forEach((entry) => {
      if (!entry || !Array.isArray(entry.aliases)) return;
      const term = typeof entry.term === "string" ? entry.term.trim() : "";
      entry.aliases.forEach((alias) => {
        addCandidate(alias, term, entry.id || "", false);
      });
    });
  }

  EXTRA_SUGGESTIONS.forEach((kw) => addCandidate(kw, "", "", false));
  return candidates;
}

function wireSearch(glossaryReady) {
  if (!searchInput || !searchButton || !clearSearchButton || !summaryStatus) return;
  let inputDebounceTimer = null;
  let currentKeyword = "";
  let currentMatches = [];
  let activeMatchIndex = -1;
  let searchHistory = readSearchHistory();
  const searchCorpus = collectSearchCorpus();
  let searchCandidates = buildSearchCandidates([], searchCorpus);

  // 狭い画面と、横向きのスマホのような低い画面では、一覧は閉じた状態から始める（開閉は利用者の操作を覚えておく）。
  const narrowQuery = window.matchMedia("(max-width: 640px)");
  const compactQuery = window.matchMedia("(max-width: 640px), (max-height: 500px)");
  const touchQuery = window.matchMedia("(pointer: coarse)");
  let resultsOpen = !compactQuery.matches;

  // 今のページ（章）にある一致箇所の番号（currentMatches の中での位置）。
  const localMatchIndexes = () =>
    currentMatches.reduce((list, mark, index) => {
      if (isMarkOnThisPage(mark)) list.push(index);
      return list;
    }, []);

  const applyResultsOpen = () => {
    if (!searchResultsToggle || !searchResultsList) return;
    const total = currentMatches.length;
    searchResultsList.hidden = !resultsOpen;
    if (searchResultsNote) {
      searchResultsNote.hidden = !resultsOpen || !searchResultsNote.textContent;
    }
    searchResultsToggle.setAttribute("aria-expanded", String(resultsOpen));
    searchResultsToggle.textContent = `一致箇所の一覧（${total}件）を${resultsOpen ? "閉じる" : "開く"}`;
    syncSearchStuck();
  };

  // 張り付いた検索バーの高さを CSS に渡す（目次などで飛んだ見出しが、バーに隠れないようにする）。
  function syncSearchStuck() {
    const active = Boolean(
      searchToolbar &&
        searchToolbar.classList.contains("is-active") &&
        window.getComputedStyle(searchToolbar).position === "sticky"
    );
    document.documentElement.style.setProperty(
      "--search-stuck",
      active ? `${searchToolbar.offsetHeight + 6}px` : "0px"
    );
  }
  window.addEventListener("resize", syncSearchStuck, { passive: true });

  // 張り付いた検索バーの高さが変わると、その下の本文がずれる。
  // スクロール位置の自動補正（overflow-anchor）がないブラウザでだけ、そのずれを戻す。
  const needsAnchorFix = !(window.CSS && CSS.supports && CSS.supports("overflow-anchor", "auto"));
  const keepContentInPlace = (change) => {
    const next = searchToolbar?.nextElementSibling;
    if (!needsAnchorFix || !searchToolbar || !(next instanceof HTMLElement) || !searchToolbar.classList.contains("is-active")) {
      change();
      return;
    }
    const before = next.getBoundingClientRect().top;
    const stuck = before < searchToolbar.getBoundingClientRect().bottom;
    change();
    if (!stuck) return;
    const shift = next.getBoundingClientRect().top - before;
    if (shift !== 0) window.scrollBy({ top: shift, behavior: "instant" });
  };

  // 狭い画面や低い画面で結果（件数と一覧）を見せるとき：検索バーの位置まで移動する。
  const bringResultsIntoView = () => {
    if (!compactQuery.matches || !searchToolbar) return;
    searchToolbar.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  // 畳まれた箇所の中の一致へ移ったとき、その開閉ボタンに印を付ける。
  let targetFoldSummary = null;
  const markFoldTarget = (summary) => {
    if (targetFoldSummary === summary) return;
    targetFoldSummary?.classList.remove("is-search-target");
    targetFoldSummary = summary;
    targetFoldSummary?.classList.add("is-search-target");
  };

  const syncActiveResultRow = () => {
    if (!searchResultsList) return;
    searchResultsList.querySelectorAll('[aria-current="true"]').forEach((row) => {
      row.removeAttribute("aria-current");
    });
    if (activeMatchIndex < 0) return;
    const row = searchResultsList.querySelector(`[data-match-index="${activeMatchIndex}"]`);
    if (!(row instanceof HTMLElement)) return;
    row.setAttribute("aria-current", "true");
    if (!searchResultsList.hidden) {
      const listRect = searchResultsList.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
        searchResultsList.scrollTop += rowRect.top - listRect.top - listRect.height / 3;
      }
    }
  };

  // 利用者が自分でスクロールし始めたら、位置の合わせ直しをやめる。
  let scrollGuardToken = 0;
  const cancelScrollGuard = () => {
    scrollGuardToken += 1;
  };
  window.addEventListener("wheel", cancelScrollGuard, { passive: true });
  window.addEventListener("touchmove", cancelScrollGuard, { passive: true });
  // 画面を押したときもやめる（用語カードを開いたときなどのスクロールを、合わせ直しで戻さないように）。
  // 「次へ」などのボタンは、押したあとのクリックで改めて合わせ直しを始める。
  window.addEventListener("pointerdown", cancelScrollGuard, { passive: true, capture: true });
  window.addEventListener("twf:own-scroll", cancelScrollGuard);
  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
      cancelScrollGuard();
    }
  });
  // 目次やページ内リンクで移動したときも、合わせ直しをやめる（移動先が一致箇所へ引き戻されないように）。
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest('a[href^="#"]')) {
      cancelScrollGuard();
    }
  });

  // 一致箇所を、上に張り付く検索バー（一覧を含む）に隠れない位置へ移動する。
  const scrollMatchIntoView = (target) => {
    const stuckBottom = () => {
      if (!searchToolbar || !searchToolbar.classList.contains("is-active")) return 0;
      const style = window.getComputedStyle(searchToolbar);
      if (style.position !== "sticky") return 0;
      const stickyTop = parseFloat(style.top) || 0;
      return stickyTop + searchToolbar.offsetHeight;
    };

    // 一覧を開いたままだと本文の見える範囲がほとんど残らない場合は、一覧を閉じる。
    if (resultsOpen && window.innerHeight - stuckBottom() < 220) {
      resultsOpen = false;
      applyResultsOpen();
    }

    const offsetFromDesired = () => {
      const visibleTop = stuckBottom();
      const rect = target.getBoundingClientRect();
      const desiredCenter = visibleTop + (window.innerHeight - visibleTop) / 2;
      return rect.top + rect.height / 2 - desiredCenter;
    };

    cancelHeadingHold();
    // 近い箇所へはなめらかに、遠い箇所へは一度で移動する。
    // 途中で画像が読み込まれるとページの長さが変わり、着地位置がずれるため、
    // 少しのあいだ位置を確かめて合わせ直す（利用者が自分で動かしたらやめる）。
    scrollGuardToken += 1;
    const token = scrollGuardToken;
    const firstOffset = offsetFromDesired();
    const isNear = Math.abs(firstOffset) < window.innerHeight * 1.5;
    window.scrollBy({ top: firstOffset, behavior: isNear ? "smooth" : "instant" });

    (isNear ? [700, 1300, 2000] : [120, 450, 1000, 1800]).forEach((delay) => {
      window.setTimeout(() => {
        if (token !== scrollGuardToken || !target.isConnected) return;
        const offset = offsetFromDesired();
        if (Math.abs(offset) > 24) {
          window.scrollBy({ top: offset, behavior: "instant" });
        }
      }, delay);
    });
  };

  // 一覧の行の文面。畳まれた箇所の文面は、一覧にも出さない。
  const fillRowContext = (textEl, mark) => {
    textEl.textContent = "";
    const masked = Boolean(mark.closest("details.spoiler-fold:not([open])"));
    textEl.classList.toggle("search-results__context--masked", masked);
    if (masked) {
      textEl.textContent = "（先の内容に触れる箇所。押すと開いて移動する）";
      return;
    }
    const context = describeMatchContext(mark);
    const hit = document.createElement("mark");
    hit.textContent = marksForMatch(mark).map((part) => part.textContent ?? "").join("");
    textEl.append(context.before, hit, context.after);
  };

  const refreshMaskedRows = () => {
    if (!searchResultsList) return;
    searchResultsList.querySelectorAll(".search-results__item").forEach((row) => {
      const mark = currentMatches[Number(row.dataset.matchIndex)];
      const textEl = row.querySelector(".search-results__context");
      if (!mark || !textEl) return;
      const shouldMask = Boolean(mark.closest("details.spoiler-fold:not([open])"));
      if (shouldMask !== textEl.classList.contains("search-results__context--masked")) {
        fillRowContext(textEl, mark);
      }
    });
  };

  const renderResultList = () => {
    if (!searchResults || !searchResultsList) return;
    searchResultsList.textContent = "";
    if (searchResultsNote) searchResultsNote.textContent = "";

    const total = currentMatches.length;
    if (total === 0) {
      searchResults.hidden = true;
      return;
    }

    const fragment = document.createDocumentFragment();
    currentMatches.slice(0, SEARCH_LIST_LIMIT).forEach((mark, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-results__item";
      button.dataset.matchIndex = String(index);

      const where = document.createElement("span");
      where.className = "search-results__where";
      where.textContent = describeMatchLocation(mark);
      // 章ページでは、ほかの章の行に「別の章へ移動」と添える（押すとその章のページへ移る）。
      if (IS_CHAPTER_PAGE && !isMarkOnThisPage(mark)) {
        button.classList.add("search-results__item--other");
        const jump = document.createElement("span");
        jump.className = "search-results__jump";
        jump.textContent = "別の章へ移動";
        where.append(jump);
      }

      const text = document.createElement("span");
      text.className = "search-results__context";
      fillRowContext(text, mark);

      button.append(where, text);
      item.appendChild(button);
      fragment.appendChild(item);
    });
    searchResultsList.appendChild(fragment);
    searchResultsList.scrollTop = 0;

    if (searchResultsNote && total > SEARCH_LIST_LIMIT) {
      const hasLocal = IS_CHAPTER_PAGE && localMatchIndexes().length > 0;
      searchResultsNote.textContent = hasLocal
        ? `一覧に出しているのは先頭の${SEARCH_LIST_LIMIT}件まで（この章の中は「次へ」でも移動できる）。キーワードを絞ると探しやすい。`
        : `一覧に出しているのは先頭の${SEARCH_LIST_LIMIT}件まで。キーワードを絞ると探しやすい。`;
    }
    searchResults.hidden = false;
    applyResultsOpen();
  };

  let searchCloseButton = null;
  if (searchToolbar) {
    const controls = document.createElement("div");
    controls.className = "search-toolbar__controls";
    if (searchNav) {
      searchToolbar.insertBefore(controls, searchNav);
      controls.appendChild(searchNav);
    } else if (searchResults) {
      searchToolbar.insertBefore(controls, searchResults);
    } else {
      searchToolbar.appendChild(controls);
    }
    searchCloseButton = document.createElement("button");
    searchCloseButton.id = "searchCloseButton";
    searchCloseButton.type = "button";
    searchCloseButton.className = "search-toolbar__close";
    searchCloseButton.setAttribute("aria-label", "検索を閉じて入力欄も消す");
    searchCloseButton.title = "検索を閉じる";
    searchCloseButton.textContent = "×";
    searchCloseButton.hidden = true;
    controls.appendChild(searchCloseButton);
  }

  // 1行に固定した件数表示が入りきらないときは、検索した語のほうを「…」で詰め、件数と注記は必ず見せる。
  const fitStatusKeyword = () => {
    const keywordPart = summaryStatus.querySelector(".status__keyword");
    if (!(keywordPart instanceof HTMLElement) || !summaryStatus.classList.contains("status--one-line")) return;
    keywordPart.style.removeProperty("max-width");
    const overflow = summaryStatus.scrollWidth - summaryStatus.clientWidth;
    if (overflow > 0) {
      keywordPart.style.maxWidth = `${Math.max(keywordPart.offsetWidth - overflow - 1, 32)}px`;
    }
  };
  window.addEventListener("resize", fitStatusKeyword, { passive: true });
  // 画面の向きを変えるなどで 640px の境目をまたいだら、件数表示をその幅向けに書き直す。
  const rewriteStatusForWidth = () => {
    if (currentKeyword) updateSearchUi(currentKeyword);
  };
  if (typeof narrowQuery.addEventListener === "function") {
    narrowQuery.addEventListener("change", rewriteStatusForWidth);
  } else if (typeof narrowQuery.addListener === "function") {
    narrowQuery.addListener(rewriteStatusForWidth);
  }

  const updateSearchUi = (keyword) => {
    if (!keyword) {
      summaryStatus.textContent = "";
      summaryStatus.classList.remove("error", "status--one-line");
      if (searchNav) searchNav.hidden = true;
      if (searchCloseButton) searchCloseButton.hidden = true;
      if (searchToolbar) searchToolbar.classList.remove("is-active");
      syncSearchStuck();
      return;
    }

    // 狭い画面では、件数表示を1行に収めるため「の一致:」を省く。
    // 全体の件数も、すぐ下の一覧の開閉ボタンに出ているので省く。
    const narrow = narrowQuery.matches;
    const lead = narrow ? `「${keyword}」` : `「${keyword}」の一致: `;
    const total = currentMatches.length;
    if (total === 0) {
      summaryStatus.textContent = `${lead}0件`;
      summaryStatus.classList.remove("status--one-line");
      summaryStatus.classList.add("error");
      if (searchNav) searchNav.hidden = true;
      if (searchCloseButton) searchCloseButton.hidden = false;
      if (searchToolbar) searchToolbar.classList.add("is-active");
      syncSearchStuck();
      return;
    }

    // 親ページは一覧から各章へ移る。章ページは「前へ／次へ」でその章の中を移り、ほかの章へは一覧から移る。
    const local = localMatchIndexes();
    let countLabel;
    let oneLine = false;
    if (!IS_CHAPTER_PAGE) {
      countLabel = `${total}件（一覧から各章へ移動できる）`;
    } else if (local.length === 0) {
      countLabel = narrow
        ? "この章 0件（一覧からほかの章へ移動できる）"
        : `この章 0件（全体 ${total}件。一覧からほかの章へ移動できる）`;
    } else {
      const position = local.indexOf(activeMatchIndex);
      const here = position >= 0 ? `${position + 1} / ${local.length}件` : `${local.length}件`;
      countLabel = narrow ? `この章 ${here}` : `この章 ${here}（全体 ${total}件）`;
      // 狭い画面で「前へ／次へ」で移るあいだは、件数表示を1行に固定する（バーの高さが変わらないように）。
      oneLine = narrow;
    }
    const activeMark = activeMatchIndex >= 0 ? currentMatches[activeMatchIndex] : null;
    const inClosedFold = Boolean(activeMark?.closest("details.spoiler-fold:not([open])"));
    const foldNote = inClosedFold ? (narrow ? "（畳まれた箇所）" : "（畳まれた箇所の中）") : "";
    summaryStatus.classList.toggle("status--one-line", oneLine);
    if (oneLine) {
      const keywordPart = document.createElement("span");
      keywordPart.className = "status__keyword";
      keywordPart.textContent = keyword;
      summaryStatus.replaceChildren("「", keywordPart, `」${countLabel}${foldNote}`);
    } else {
      summaryStatus.textContent = `${lead}${countLabel}${foldNote}`;
    }
    summaryStatus.classList.remove("error");
    if (searchNav) searchNav.hidden = local.length === 0;
    if (searchCloseButton) searchCloseButton.hidden = false;
    if (searchToolbar) searchToolbar.classList.add("is-active");
    fitStatusKeyword();
    syncSearchStuck();
  };

  // reveal が真のとき（一覧の行を押したとき）だけ、畳まれた「先の内容に触れる箇所」を開く。
  // 「検索」「前へ／次へ」では開かず、その箇所の開閉ボタンの位置へ移動する。
  // 別の章の一致箇所へ：その章のページへ移り、そこで同じ語を検索して、その章の何番目かの一致箇所へ移動する。
  const goToMatchInOtherChapter = (mark) => {
    const group = markGroups.get(mark);
    if (!group || !group.slug) return;
    const ordinal = currentMatches.filter((candidate) => markGroups.get(candidate) === group).indexOf(mark);
    const params = new URLSearchParams({ q: currentKeyword, n: String(Math.max(ordinal, 0)) });
    window.location.href = `${chapterUrl(group)}?${params.toString()}`;
  };

  const focusSearchResult = (mark) => {
    const control = mark.closest("a[href], button, .term-trigger");
    if (!control) mark.tabIndex = -1;
    (control || mark).focus({ preventScroll: true });
  };

  const focusMatch = (index, { reveal = false } = {}) => {
    if (currentMatches.length === 0) return;
    const total = currentMatches.length;
    const nextIndex = ((index % total) + total) % total;
    if (!isMarkOnThisPage(currentMatches[nextIndex])) {
      goToMatchInOtherChapter(currentMatches[nextIndex]);
      return;
    }
    if (activeMatchIndex >= 0 && currentMatches[activeMatchIndex]) {
      marksForMatch(currentMatches[activeMatchIndex]).forEach((mark) => mark.classList.remove("is-active"));
    }
    activeMatchIndex = nextIndex;
    const target = currentMatches[activeMatchIndex];
    ensureSectionExpandedFor(target);
    if (reveal) {
      revealSpoilerFoldFor(target);
      refreshMaskedRows();
      focusSearchResult(target);
    }
    marksForMatch(target).forEach((mark) => mark.classList.add("is-active"));
    updateSearchUi(currentKeyword);
    syncActiveResultRow();
    const closedFold = target.closest("details.spoiler-fold:not([open])");
    const foldSummary = closedFold?.querySelector(":scope > summary") ?? null;
    markFoldTarget(foldSummary);
    scrollMatchIntoView(foldSummary ?? target);
  };

  // 「前へ／次へ」：今の章の中だけを移動する。
  const stepLocalMatch = (step) => {
    const local = localMatchIndexes();
    if (local.length === 0) return;
    const position = local.indexOf(activeMatchIndex);
    const nextPosition =
      position < 0 ? (step < 0 ? local.length - 1 : 0) : (position + step + local.length) % local.length;
    focusMatch(local[nextPosition]);
  };

  // 今の章に一致箇所がないとき（親ページでは常に）は、移動せずに一覧を開く。
  const showMatches = (step) => {
    if (localMatchIndexes().length > 0) {
      stepLocalMatch(step);
      return;
    }
    resultsOpen = true;
    applyResultsOpen();
    updateSearchUi(currentKeyword);
    bringResultsIntoView();
  };

  const runSearch = ({ shouldScroll, step = 1 } = { shouldScroll: false, step: 1 }) => {
    const keyword = searchInput.value.trim();
    // タッチ操作のスマホでは、検索を実行したら画面のキーボードを閉じる（結果がキーボードに隠れないように）。
    // パソコンのキーボードでは、入力欄にとどまり、Enter を続けて押すと次の一致へ進める。
    if (
      shouldScroll &&
      keyword &&
      compactQuery.matches &&
      touchQuery.matches &&
      document.activeElement === searchInput
    ) {
      searchInput.blur();
    }
    if (shouldScroll && keyword && keyword === currentKeyword && currentMatches.length > 0) {
      showMatches(step);
      return;
    }

    currentKeyword = keyword;
    markFoldTarget(null);
    clearHighlights();
    currentMatches = highlightKeyword(keyword);
    activeMatchIndex = -1;
    renderResultList();

    if (shouldScroll && keyword && currentMatches.length > 0) {
      showMatches(step);
      return;
    }
    updateSearchUi(keyword);
    if (shouldScroll && keyword) bringResultsIntoView();
  };

  // 検索履歴と検索候補のドロップダウンを、#searchInput を囲む .search-box の中に組み立てる。
  const searchBox = document.createElement("div");
  searchBox.className = "search-box";
  searchInput.parentNode?.insertBefore(searchBox, searchInput);
  searchBox.appendChild(searchInput);

  const suggestPanel = document.createElement("div");
  suggestPanel.id = "searchSuggestPanel";
  suggestPanel.className = "search-suggest";
  suggestPanel.setAttribute("role", "listbox");
  suggestPanel.setAttribute("aria-label", "検索候補");
  suggestPanel.hidden = true;
  searchBox.appendChild(suggestPanel);

  searchInput.setAttribute("autocomplete", "off");
  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.setAttribute("aria-controls", "searchSuggestPanel");

  let suggestOpen = false;
  let waitingForCandidates = false;
  let highlightedSuggestIndex = -1;
  let visibleSuggestButtons = [];
  let suppressNextFocusOpen = false;

  const recordSearchHistory = (keyword) => {
    const trimmed = typeof keyword === "string" ? keyword.trim() : "";
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    searchHistory = [trimmed, ...searchHistory.filter((item) => item.toLowerCase() !== key)].slice(
      0,
      SEARCH_HISTORY_LIMIT
    );
    writeSearchHistory(searchHistory);
  };

  const removeSearchHistoryItem = (keyword) => {
    const key = keyword.toLowerCase();
    searchHistory = searchHistory.filter((item) => item.toLowerCase() !== key);
    writeSearchHistory(searchHistory);
  };

  const clearAllSearchHistory = () => {
    searchHistory = [];
    writeSearchHistory(searchHistory);
  };

  const getFilteredSuggestions = (rawQuery) => {
    const normQ = normalizeSearchText(rawQuery);
    const matchingHistory = normQ
      ? searchHistory.filter((item) => normalizeSearchText(item).includes(normQ))
      : searchHistory.slice();

    const historyKeys = new Set(matchingHistory.map((item) => item.toLowerCase()));
    const pool = searchCandidates.filter((cand) => !historyKeys.has(cand.keyword.toLowerCase()));

    let matchingCandidates;
    if (!normQ) {
      matchingCandidates = pool.filter((cand) => cand.isStarter).slice(0, SEARCH_SUGGEST_LIMIT);
    } else {
      matchingCandidates = pool
        .filter((cand) => cand.normKeyword.includes(normQ) || cand.normMeta.includes(normQ))
        .sort((a, b) => {
          const aExact = a.normKeyword === normQ ? 1 : 0;
          const bExact = b.normKeyword === normQ ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;

          const aPrefix = a.normKeyword.startsWith(normQ) ? 1 : 0;
          const bPrefix = b.normKeyword.startsWith(normQ) ? 1 : 0;
          if (aPrefix !== bPrefix) return bPrefix - aPrefix;

          const aDirect = a.normKeyword.includes(normQ) ? 1 : 0;
          const bDirect = b.normKeyword.includes(normQ) ? 1 : 0;
          if (aDirect !== bDirect) return bDirect - aDirect;

          return b.count - a.count;
        })
        .slice(0, SEARCH_SUGGEST_LIMIT);
    }

    return { matchingHistory, matchingCandidates };
  };

  const syncSuggestHighlight = () => {
    visibleSuggestButtons.forEach((btn, idx) => {
      const active = idx === highlightedSuggestIndex;
      btn.classList.toggle("is-highlighted", active);
      btn.setAttribute("aria-selected", String(active));
      if (active) {
        searchInput.setAttribute("aria-activedescendant", btn.id);
        btn.scrollIntoView({ block: "nearest" });
      }
    });
    if (highlightedSuggestIndex < 0) {
      searchInput.removeAttribute("aria-activedescendant");
    }
  };

  const closeSuggestPanel = () => {
    waitingForCandidates = false;
    if (!suggestOpen && suggestPanel.hidden) return;
    suggestOpen = false;
    suggestPanel.hidden = true;
    highlightedSuggestIndex = -1;
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
  };

  const applySuggestion = (keyword) => {
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    searchInput.value = keyword;
    recordSearchHistory(keyword);
    closeSuggestPanel();
    runSearch({ shouldScroll: true, step: 1 });
  };

  const renderSuggestPanel = () => {
    waitingForCandidates = false;
    const rawQuery = searchInput.value.trim();
    const { matchingHistory, matchingCandidates } = getFilteredSuggestions(rawQuery);
    suggestPanel.textContent = "";
    visibleSuggestButtons = [];
    highlightedSuggestIndex = -1;

    if (matchingHistory.length === 0 && matchingCandidates.length === 0) {
      closeSuggestPanel();
      waitingForCandidates = true;
      return;
    }

    let optionSeq = 0;

    if (matchingHistory.length > 0) {
      const group = document.createElement("div");
      group.className = "search-suggest__group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-labelledby", "searchSuggestGroupHistory");

      const head = document.createElement("div");
      head.className = "search-suggest__head";

      const title = document.createElement("span");
      title.id = "searchSuggestGroupHistory";
      title.className = "search-suggest__title";
      title.textContent = "最近の検索";

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "search-suggest__clear-all";
      clearBtn.textContent = "履歴を消す";
      clearBtn.addEventListener("click", () => {
        clearAllSearchHistory();
        renderSuggestPanel();
        suppressNextFocusOpen = true;
        searchInput.focus();
        suppressNextFocusOpen = false;
      });

      head.append(title, clearBtn);
      group.appendChild(head);

      const list = document.createElement("ul");
      list.className = "search-suggest__list";
      list.setAttribute("role", "presentation");

      matchingHistory.forEach((kw) => {
        const li = document.createElement("li");
        li.className = "search-suggest__row";
        li.setAttribute("role", "presentation");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = `searchSuggestOpt-${optionSeq}`;
        optionSeq += 1;
        btn.className = "search-suggest__btn";
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", "false");
        btn.dataset.keyword = kw;

        const label = document.createElement("span");
        label.className = "search-suggest__keyword";
        label.textContent = kw;
        btn.appendChild(label);

        btn.addEventListener("click", () => applySuggestion(kw));
        visibleSuggestButtons.push(btn);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "search-suggest__remove";
        removeBtn.setAttribute("aria-label", `「${kw}」を履歴から削除`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          removeSearchHistoryItem(kw);
          renderSuggestPanel();
          suppressNextFocusOpen = true;
          searchInput.focus();
          suppressNextFocusOpen = false;
        });

        li.append(btn, removeBtn);
        list.appendChild(li);
      });

      group.appendChild(list);
      suggestPanel.appendChild(group);
    }

    if (matchingCandidates.length > 0) {
      const group = document.createElement("div");
      group.className = "search-suggest__group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-labelledby", "searchSuggestGroupCandidates");

      const head = document.createElement("div");
      head.className = "search-suggest__head";
      const title = document.createElement("span");
      title.id = "searchSuggestGroupCandidates";
      title.className = "search-suggest__title";
      title.textContent = rawQuery ? "検索候補" : "キーワード";
      head.appendChild(title);
      group.appendChild(head);

      const list = document.createElement("ul");
      list.className = "search-suggest__chips";
      list.setAttribute("role", "presentation");

      matchingCandidates.forEach((cand) => {
        const li = document.createElement("li");
        li.className = "search-suggest__chip-item";
        li.setAttribute("role", "presentation");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = `searchSuggestOpt-${optionSeq}`;
        optionSeq += 1;
        btn.className = "search-suggest__chip";
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", "false");
        btn.dataset.keyword = cand.keyword;
        btn.textContent = cand.keyword;

        btn.addEventListener("click", () => applySuggestion(cand.keyword));
        visibleSuggestButtons.push(btn);

        li.appendChild(btn);
        list.appendChild(li);
      });

      group.appendChild(list);
      suggestPanel.appendChild(group);
    }

    suggestOpen = true;
    suggestPanel.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
    searchInput.removeAttribute("aria-activedescendant");
  };

  searchInput.addEventListener("focus", () => {
    if (suppressNextFocusOpen) return;
    renderSuggestPanel();
  });
  searchInput.addEventListener("click", () => {
    renderSuggestPanel();
  });

  searchButton.addEventListener("click", () => {
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    closeSuggestPanel();
    recordSearchHistory(searchInput.value.trim());
    runSearch({ shouldScroll: true, step: 1 });
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && !event.isComposing) {
      event.preventDefault();
      if (!suggestOpen) {
        renderSuggestPanel();
      }
      if (visibleSuggestButtons.length > 0) {
        highlightedSuggestIndex =
          highlightedSuggestIndex < visibleSuggestButtons.length - 1 ? highlightedSuggestIndex + 1 : 0;
        syncSuggestHighlight();
      }
      return;
    }
    if (event.key === "ArrowUp" && !event.isComposing) {
      if (!suggestOpen || visibleSuggestButtons.length === 0) return;
      event.preventDefault();
      highlightedSuggestIndex =
        highlightedSuggestIndex > 0 ? highlightedSuggestIndex - 1 : visibleSuggestButtons.length - 1;
      syncSuggestHighlight();
      return;
    }
    if (event.key === "Escape" && (suggestOpen || waitingForCandidates)) {
      event.preventDefault();
      closeSuggestPanel();
      return;
    }
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (suggestOpen && highlightedSuggestIndex >= 0 && visibleSuggestButtons[highlightedSuggestIndex]) {
        const kw = visibleSuggestButtons[highlightedSuggestIndex].dataset.keyword || "";
        if (kw) {
          applySuggestion(kw);
          return;
        }
      }
      if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
      closeSuggestPanel();
      recordSearchHistory(searchInput.value.trim());
      runSearch({ shouldScroll: true, step: event.shiftKey ? -1 : 1 });
    }
  });
  searchInput.addEventListener("input", () => {
    renderSuggestPanel();
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    inputDebounceTimer = window.setTimeout(() => {
      runSearch({ shouldScroll: false });
    }, 180);
  });

  document.addEventListener("click", (event) => {
    if (!suggestOpen) return;
    if (event.target instanceof Node && !searchBox.contains(event.target)) {
      closeSuggestPanel();
    }
  });
  document.addEventListener("focusin", (event) => {
    if (!suggestOpen) return;
    if (event.target instanceof Node && !searchBox.contains(event.target)) {
      closeSuggestPanel();
    }
  });

  prevMatchButton?.addEventListener("click", () => stepLocalMatch(-1));
  nextMatchButton?.addEventListener("click", () => stepLocalMatch(1));

  const resetSearch = ({ focusInput = false } = {}) => {
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    searchInput.value = "";
    currentKeyword = "";
    currentMatches = [];
    activeMatchIndex = -1;
    markFoldTarget(null);
    keepContentInPlace(() => {
      clearHighlights();
      renderResultList();
      updateSearchUi("");
    });
    closeSuggestPanel();
    if (focusInput) {
      suppressNextFocusOpen = true;
      searchInput.focus();
      suppressNextFocusOpen = false;
    }
  };

  clearSearchButton.addEventListener("click", () => resetSearch({ focusInput: true }));
  searchCloseButton?.addEventListener("click", () => resetSearch({ focusInput: false }));

  searchResultsToggle?.addEventListener("click", () => {
    keepContentInPlace(() => {
      resultsOpen = !resultsOpen;
      applyResultsOpen();
    });
    if (resultsOpen) syncActiveResultRow();
  });

  searchResultsList?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest(".search-results__item");
    if (!(row instanceof HTMLElement)) return;
    const index = Number(row.dataset.matchIndex);
    if (!Number.isInteger(index) || !currentMatches[index]) return;
    recordSearchHistory(currentKeyword);
    // 狭い画面や低い画面では一覧が本文を覆うため、行を選んだら一覧を閉じてから移動する。
    if (compactQuery.matches) {
      resultsOpen = false;
      applyResultsOpen();
    }
    focusMatch(index, { reveal: true });
  });

  // 畳まれた箇所が開閉されたら、一覧の伏せた行と件数表示を合わせ直す。
  const resyncAfterFoldChange = () => {
    if (currentMatches.length > 0) {
      refreshMaskedRows();
      // 今の一致箇所が畳まれた箇所の中なら、その開閉ボタンに橙の印を付ける（件数表示の注記とそろえる）。
      const activeMark = activeMatchIndex >= 0 ? currentMatches[activeMatchIndex] : null;
      const closedFold =
        activeMark && isMarkOnThisPage(activeMark) ? activeMark.closest("details.spoiler-fold:not([open])") : null;
      markFoldTarget(closedFold?.querySelector(":scope > summary") ?? null);
      updateSearchUi(currentKeyword);
    }
  };
  markdownContainer?.addEventListener(
    "toggle",
    (event) => {
      if (event.target instanceof HTMLDetailsElement) resyncAfterFoldChange();
    },
    true
  );
  onSpoilerFoldsChanged = resyncAfterFoldChange;

  // 本文と検索は用語集を待たない。後着した用語のリンクを作る間だけ検索マークを外し、
  // 読者が選んだ箇所とフォーカスを、同じ本文の一致箇所へ引き継ぐ。
  glossaryReady.then((items) => {
    if (items.length === 0) return;
    checkGlossaryStages(items);
    if (markdownContainer) {
      const previous = currentMatches[activeMatchIndex];
      const wasFocused = previous && document.activeElement === previous;
      if (currentMatches.length > 0) clearHighlights();
      enhanceGlossaryTerms(items, markdownContainer);
      wireGlossaryPopovers(items);
      if (currentMatches.length > 0) {
        currentMatches = highlightKeyword(currentKeyword);
        const active = currentMatches[activeMatchIndex];
        if (active) {
          marksForMatch(active).forEach((mark) => mark.classList.add("is-active"));
          if (wasFocused) focusSearchResult(active);
        }
      }
    }
    searchCandidates = buildSearchCandidates(items, searchCorpus);
    if ((suggestOpen || waitingForCandidates) && highlightedSuggestIndex < 0 && document.activeElement === searchInput) {
      renderSuggestPanel();
    }
  });

  // ほかのページの一覧から移ってきたとき（?q=語&n=番号）：同じ語を検索し、この章の n 番目の一致箇所へ移動する。
  const params = new URLSearchParams(window.location.search);
  const arrivedKeyword = (params.get("q") || "").trim();
  if (IS_CHAPTER_PAGE && arrivedKeyword) {
    history.replaceState(null, "", window.location.pathname + window.location.hash);
    searchInput.value = arrivedKeyword;
    runSearch({ shouldScroll: false });
    const local = localMatchIndexes();
    const ordinal = Number.parseInt(params.get("n") || "0", 10);
    if (local.length > 0) {
      const position = Number.isInteger(ordinal) && ordinal >= 0 && ordinal < local.length ? ordinal : 0;
      focusMatch(local[position], { reveal: true });
      return true;
    }
    return false;
  }

  updateSearchUi("");
  return false;
}

// 主要年表のネタバレ部分：一度開いた読者には、次回も開いた状態で見せる。
function wireRememberedDetails(elementId, storageKey) {
  const details = document.getElementById(elementId);
  if (!(details instanceof HTMLDetailsElement)) return;
  if (readStoredFlag(storageKey)) {
    details.open = true;
  }
  details.addEventListener("toggle", () => {
    writeStoredFlag(storageKey, details.open);
  });
}

function wireGuideSpoiler() {
  wireRememberedDetails("timelineSpoiler", TIMELINE_SPOILER_STORAGE_KEY);
}

// 本文：目印（data-spoiler-until）の付いた考察と図を、開閉できる枠に入れる。
function createSpoilerFold(until, kind) {
  const details = document.createElement("details");
  details.className = "spoiler-fold";
  details.open = forwardSpoilersOpen;

  const summary = document.createElement("summary");
  summary.className = "spoiler-fold__summary";
  const base = `『${until}』までの内容${kind === "figure" ? "を含む図" : "に触れる考察"}`;
  const closedLabel = document.createElement("span");
  closedLabel.className = "spoiler-fold__label spoiler-fold__label--closed";
  closedLabel.textContent = `${base}を開く`;
  const openLabel = document.createElement("span");
  openLabel.className = "spoiler-fold__label spoiler-fold__label--open";
  openLabel.textContent = `${base}を閉じる`;
  summary.append(closedLabel, openLabel);
  details.appendChild(summary);
  return details;
}

function enhanceSpoilerFolds(root) {
  if (!root) return;

  root.querySelectorAll(".analysis-block[data-spoiler-until]").forEach((block) => {
    const title = block.querySelector(":scope > .analysis-block__title");
    if (!title) return;
    const details = createSpoilerFold(block.dataset.spoilerUntil || "", "analysis");
    while (title.nextSibling) {
      details.appendChild(title.nextSibling);
    }
    // 見出しと結論だけの型では、続く箇条書きが本文にあたるので一緒に入れる。
    const following = block.nextElementSibling;
    if (block.classList.contains("analysis-block--list-head") && following?.tagName === "UL") {
      details.appendChild(following);
    }
    block.appendChild(details);
  });

  root.querySelectorAll("figure[data-spoiler-until]").forEach((figure) => {
    const details = createSpoilerFold(figure.dataset.spoilerUntil || "", "figure");
    details.classList.add("wiki-spoiler");
    figure.parentNode?.insertBefore(details, figure);
    details.appendChild(figure);
  });
}

function syncSpoilerFoldsToggleUi() {
  if (!spoilerFoldsToggle) return;
  spoilerFoldsToggle.setAttribute("aria-pressed", String(forwardSpoilersOpen));
  spoilerFoldsToggle.textContent = forwardSpoilersOpen
    ? "先の内容を隠す（全章）"
    : "先の内容を表示する（全章）";
}

function wireSpoilerFolds() {
  syncSpoilerFoldsToggleUi();
  spoilerFoldsToggle?.addEventListener("click", () => {
    forwardSpoilersOpen = !forwardSpoilersOpen;
    writeStoredFlag(FORWARD_SPOILER_STORAGE_KEY, forwardSpoilersOpen);
    // 画面に出していないほかの章も合わせる（検索の一覧で、伏せる行を正しく決めるため）。
    searchGroups().forEach((group) => {
      group.root.querySelectorAll("details.spoiler-fold").forEach((details) => {
        details.open = forwardSpoilersOpen;
      });
    });
    syncSpoilerFoldsToggleUi();
    onSpoilerFoldsChanged();
    window.dispatchEvent(new Event("resize"));
  });
  // 個別に開閉したときも、現在地の表示などを計算し直す。
  markdownContainer?.addEventListener(
    "toggle",
    (event) => {
      if (event.target instanceof HTMLDetailsElement) {
        window.dispatchEvent(new Event("resize"));
      }
    },
    true
  );
}

// 一致箇所や移動先が、畳まれた「先の内容に触れる箇所」の中にあれば開く。
function revealSpoilerFoldFor(node) {
  if (!(node instanceof Element)) return;
  const closedFold = node.closest("details.spoiler-fold:not([open])");
  if (closedFold instanceof HTMLDetailsElement) {
    closedFold.open = true;
  }
}

function wireSearchPlaceholder() {
  if (!searchInput) return;
  const fullText = searchInput.getAttribute("placeholder") || "";
  const shortText = "キーワード検索";
  const context = document.createElement("canvas").getContext("2d");
  if (!fullText || !context) return;

  const apply = () => {
    const style = window.getComputedStyle(searchInput);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const innerWidth =
      searchInput.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const fits = context.measureText(fullText).width <= innerWidth;
    searchInput.setAttribute("placeholder", fits ? fullText : shortText);
  };

  apply();
  window.addEventListener("resize", apply, { passive: true });
}

// 見出しへ移ったあと、手前の画像が読み込まれてページが伸びると、見出しが下へずれることがある。
// 少しのあいだ位置を確かめて戻す（利用者が自分でスクロールしたら、または検索で移動したらやめる）。
let headingHoldToken = 0;
const cancelHeadingHold = () => {
  headingHoldToken += 1;
};
window.addEventListener("wheel", cancelHeadingHold, { passive: true });
window.addEventListener("touchmove", cancelHeadingHold, { passive: true });
window.addEventListener("pointerdown", cancelHeadingHold, { passive: true, capture: true });
window.addEventListener("twf:own-scroll", cancelHeadingHold);
window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
    cancelHeadingHold();
  }
});

function holdHeadingPosition(target) {
  cancelHeadingHold();
  const token = headingHoldToken;
  const desiredTop = target.getBoundingClientRect().top;
  [150, 400, 900, 1600].forEach((delay) => {
    window.setTimeout(() => {
      if (token !== headingHoldToken || !target.isConnected) return;
      const drift = target.getBoundingClientRect().top - desiredTop;
      if (Math.abs(drift) > 8) {
        window.scrollBy({ top: drift, behavior: "instant" });
      }
    }, delay);
  });
}

function scrollToLocationHash() {
  const targetId = safeDecodeHash(window.location.hash);
  if (!targetId) return;
  const target = document.getElementById(targetId);
  if (target) {
    ensureSectionExpandedFor(target);
    target.scrollIntoView({ block: "start" });
    holdHeadingPosition(target);
  } else {
    redirectHashToChapter();
  }
}

async function init() {
  if (!summaryStatus) return;
  summaryStatus.textContent = "";
  wireSearchPlaceholder();
  wireGuideSpoiler();

  const glossaryReady = fetch("/glossary.json", { cache: "no-cache" })
    .then((response) => response.ok ? response.json() : [])
    .then((items) => Array.isArray(items) ? items : [])
    .catch(() => []);

  let markdown = FALLBACK_NOTE;
  let loadedFromFile = false;
  try {
    const response = await fetch("/note.md", { cache: "no-cache" });
    if (response.ok) {
      markdown = await response.text();
      loadedFromFile = true;
    }
  } catch (_error) {
    // 読み込めなかった場合は案内文を表示する。
  }

  // note.md 全体を、画面に出さない入れ物の中で組み立ててから、章ごとに分ける。
  // どのページでも同じ手順で組み立てるので、見出しの id や用語の説明は、1ページだった頃と同じになる。
  const fullRoot = document.createElement("div");
  fullRoot.innerHTML = sanitizeGeneratedHtml(simpleMarkdownToHtml(normalizeSource(markdown)));
  requestAnimationFrame(() => {
    prepareHeadingMetadata(fullRoot);
    fullRoot.querySelectorAll("h3").forEach((heading) => keepDatesTogether(heading));
    addBackToTocLinks(fullRoot);
    enhanceSections(fullRoot);
    enhanceSpoilerFolds(fullRoot);
    chapterGroups = splitIntoChapters(fullRoot);
    if (IS_CHAPTER_PAGE) {
      mountCurrentChapter({ useFirst: !loadedFromFile });
    }
    if (loadedFromFile && redirectHashToChapter()) return;
    if (IS_CHAPTER_PAGE) {
      playTapeStart();
      wireReadProgress();
    }
    renderChapterIndex();
    buildToc();
    renderChapterNav();
    wireSectionFolding();
    wireSpoilerFolds();
    wireTocToggle();
    wireBackToTocLinks();
    wireActiveHeadingTracker();
    const movedToMatch = wireSearch(glossaryReady);
    window.addEventListener("hashchange", scrollToLocationHash);
    if (!loadedFromFile) {
      summaryStatus.textContent = "note.md が未配置のため、案内テキストを表示中です。";
      searchToolbar?.classList.add("is-active");
    }
    if (movedToMatch) return;
    if (IS_RELOAD) {
      if (window.location.hash) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } else {
      scrollToLocationHash();
    }
  });
}

init();
