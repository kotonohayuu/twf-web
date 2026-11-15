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

const FOLD_STORAGE_KEY = "twf_fold_events";
const GUIDE_SPOILER_STORAGE_KEY = "twf_guide_spoiler";
const TIMELINE_SPOILER_STORAGE_KEY = "twf_timeline_spoiler";
const FORWARD_SPOILER_STORAGE_KEY = "twf_forward_spoilers";

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
  "ファイル4"
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
  "f3-scenes": "event",
  "f3-facts": "fact",
  "f3-thoughts": "analysis",
  "guilty-desc": "supplement",
  "guilty-rec1": "event",
  "guilty-rec2": "event",
  "guilty-rec3": "event",
  "guilty-thoughts": "analysis",
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
  "f4-trivia": "supplement",
  "f4-summary": "supplement",
  "felix-facts": "fact",
  "felix-file4-update": "fact",
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

function renderImage(altText, src, spoilerUntil = "") {
  const safeSrc = sanitizeImageSrc(src);
  if (!safeSrc) {
    return `<p class="status error">危険な画像URLをブロックしました: <code>${escapeHtml(src)}</code></p>`;
  }
  const spoilerAttr = spoilerUntil ? ` data-spoiler-until="${escapeHtmlAttr(spoilerUntil)}"` : "";
  return `<figure class="wiki-figure"${spoilerAttr}><img src="${escapeHtmlAttr(safeSrc)}" alt="${escapeHtmlAttr(altText)}" class="wiki-image" loading="lazy"><figcaption>${escapeHtml(altText)}</figcaption></figure>`;
}

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

function assignFile4AnchorIds() {
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

  const allHeadings = Array.from(markdownContainer.querySelectorAll("h2, h3"));
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

function prepareHeadingMetadata() {
  if (!markdownContainer) return;
  assignFile4AnchorIds();
  const headings = markdownContainer.querySelectorAll("h2, h3");
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
  link.appendChild(titleSpan);

  li.appendChild(link);
  return li;
}

function buildToc() {
  if (!tocList || !markdownContainer) return;
  tocList.innerHTML = "";
  if (readingBarTocList) readingBarTocList.innerHTML = "";
  prepareHeadingMetadata();

  const headings = markdownContainer.querySelectorAll("h2, h3");
  const desktopFragment = document.createDocumentFragment();
  const mobileFragment = document.createDocumentFragment();

  headings.forEach((heading) => {
    desktopFragment.appendChild(createTocItemElement(heading));
    if (readingBarTocList) {
      mobileFragment.appendChild(createTocItemElement(heading));
    }
  });

  tocList.appendChild(desktopFragment);
  if (readingBarTocList) {
    readingBarTocList.appendChild(mobileFragment);
  }
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

function enhanceSections() {
  if (!markdownContainer) return;
  const h3List = Array.from(markdownContainer.querySelectorAll("h3"));

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

  if (readSavedFoldPreference()) {
    markdownContainer.querySelectorAll(".h3-section--event").forEach((sec) => {
      setSectionCollapsed(sec, true);
    });
  }
  syncFoldToggleUi();

  foldEventsToggle?.addEventListener("click", () => {
    const anyCollapsed = Boolean(markdownContainer.querySelector(".h3-section--event.is-collapsed"));
    const nextCollapsed = !anyCollapsed;
    markdownContainer.querySelectorAll(".h3-section--event").forEach((sec) => {
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
    const rawHref = anchor.getAttribute("href") || "";
    if (rawHref.length <= 1) return;
    const targetId = decodeURIComponent(rawHref.slice(1));
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
    (text.startsWith("'s", end) || text.startsWith("’s", end) || text.startsWith("（灰色の存在）", end))
  ) {
    return false;
  }

  const katakanaChar = /[\u30A1-\u30FA\u30FC]/;
  if (katakanaChar.test(alias[0]) && katakanaChar.test(prev)) return false;
  if (katakanaChar.test(alias[alias.length - 1]) && katakanaChar.test(next)) return false;

  return true;
}

function collectGlossaryScopes() {
  if (!markdownContainer) return [];
  const scopes = [];
  let currentIntroNodes = [];

  Array.from(markdownContainer.children).forEach((child) => {
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
  return scopes;
}

function enhanceGlossaryTerms(glossaryItems) {
  if (!markdownContainer || !Array.isArray(glossaryItems) || glossaryItems.length === 0) return;

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

  const scopes = collectGlossaryScopes();
  scopes.forEach((rootNodes) => {
    const seenIds = new Set();
    const textNodes = [];

    rootNodes.forEach((rootNode) => {
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (excludedTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
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

        const btn = document.createElement("button");
        btn.type = "button";
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

  const openPopover = (trigger, entry) => {
    closePopover();
    const wrap = trigger.closest(".term-wrap");
    if (!wrap) return;

    const card = document.createElement("div");
    card.className = "term-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `${entry.term}の説明`);

    const rect = trigger.getBoundingClientRect();
    if (rect.left > window.innerWidth / 2) {
      card.classList.add("term-card--right");
    }
    if (window.innerHeight - rect.bottom < 170 && rect.top > 190) {
      card.classList.add("term-card--above");
    }

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
    const body = document.createElement("div");
    body.className = "term-card__body";
    const desc = document.createElement("p");
    desc.className = "term-card__desc";
    desc.textContent = picked.text;
    body.appendChild(desc);
    if (picked.partial) {
      const stageNote = document.createElement("p");
      stageNote.className = "term-card__stage";
      stageNote.textContent = `『${STAGE_ORDER[stageIndex]}』までの内容にもとづく説明`;
      body.appendChild(stageNote);
    }
    content.appendChild(body);

    card.appendChild(content);
    wrap.appendChild(card);

    trigger.setAttribute("aria-expanded", "true");
    activeTrigger = trigger;
    activeCard = card;
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
    if (!trigger || !(trigger instanceof HTMLButtonElement)) return;

    const termId = trigger.dataset.termId || "";
    const entry = entryMap.get(termId);
    if (!entry) return;

    if (activeTrigger === trigger) {
      closePopover();
    } else {
      openPopover(trigger, entry);
    }
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
    const threshold = window.innerWidth <= 960 ? 84 : 96;
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

        if (activeHeading.tagName === "H3" && h2Text) {
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
          readingBarTitle.textContent = "目次・案内";
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
    const rawHref = anchor?.getAttribute("href") || "";
    if (rawHref.length <= 1) return;
    rememberRequestedHeading(decodeURIComponent(rawHref.slice(1)));
  });

  window.addEventListener("hashchange", () => {
    rememberRequestedHeading(decodeURIComponent(window.location.hash.slice(1)));
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

function addBackToTocLinks() {
  if (!markdownContainer || !tocSidebar) return;

  const headings = Array.from(markdownContainer.querySelectorAll("h2"));
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

    markdownContainer.insertBefore(backToToc, headings[index + 1] ?? null);
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
    (layoutContainer ?? tocSidebar).scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function clearHighlights() {
  const marks = markdownContainer.querySelectorAll("mark");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  });
}

function highlightKeyword(keyword) {
  clearHighlights();
  if (!keyword) return [];
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  const createdMarks = [];

  const walker = document.createTreeWalker(markdownContainer, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest(".back-to-toc, .sec-badge, .sec-fold-btn, .term-card, summary")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (["SCRIPT", "STYLE", "MARK"].includes(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    if (!text || !regex.test(text)) return;
    regex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    text.replace(regex, (matched, offset) => {
      const start = Number(offset);
      if (start > cursor) fragment.append(text.slice(cursor, start));
      const mark = document.createElement("mark");
      mark.textContent = matched;
      fragment.append(mark);
      createdMarks.push(mark);
      cursor = start + matched.length;
      return matched;
    });
    if (cursor < text.length) fragment.append(text.slice(cursor));
    textNode.parentNode?.replaceChild(fragment, textNode);
  });

  createdMarks.forEach((mark) => ensureSectionExpandedFor(mark));
  return createdMarks;
}

// 検索結果の一覧：一致箇所の「章 › 節」を求める。
function describeMatchLocation(mark, chapterCache) {
  let topLevel = mark;
  while (topLevel.parentElement && topLevel.parentElement !== markdownContainer) {
    topLevel = topLevel.parentElement;
  }

  let chapter = chapterCache.get(topLevel);
  if (chapter === undefined) {
    chapter = "";
    for (let node = topLevel; node; node = node.previousElementSibling) {
      if (node.tagName === "H2") {
        chapter = node.dataset.cleanTitle || node.textContent?.trim() || "";
        break;
      }
    }
    chapterCache.set(topLevel, chapter);
  }

  const sectionHeading = mark.closest(".h3-section")?.querySelector(":scope > h3");
  const section = sectionHeading ? sectionHeading.dataset.cleanTitle || "" : "";
  return [chapter, section].filter(Boolean).join(" › ") || "冒頭";
}

// 検索結果の一覧：一致箇所の前後の文脈（それぞれ SEARCH_CONTEXT_LENGTH 字まで）を求める。
function describeMatchContext(mark) {
  const block =
    mark.closest("p, li, figcaption, h2, h3, h4, blockquote, td, th") || mark.parentElement || mark;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest(".back-to-toc, .sec-badge, .sec-fold-btn, .term-card, summary")) {
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
    if (mark.contains(node)) {
      passedMatch = true;
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

function wireSearch() {
  if (!searchInput || !searchButton || !clearSearchButton || !summaryStatus) return;
  let inputDebounceTimer = null;
  let currentKeyword = "";
  let currentMatches = [];
  let activeMatchIndex = -1;

  // 狭い画面では、一覧は閉じた状態から始める（開閉は利用者の操作を覚えておく）。
  const narrowQuery = window.matchMedia("(max-width: 640px)");
  let resultsOpen = !narrowQuery.matches;

  const applyResultsOpen = () => {
    if (!searchResultsToggle || !searchResultsList) return;
    const total = currentMatches.length;
    searchResultsList.hidden = !resultsOpen;
    if (searchResultsNote) {
      searchResultsNote.hidden = !resultsOpen || !searchResultsNote.textContent;
    }
    searchResultsToggle.setAttribute("aria-expanded", String(resultsOpen));
    searchResultsToggle.textContent = `一致箇所の一覧（${total}件）を${resultsOpen ? "閉じる" : "開く"}`;
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
  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
      cancelScrollGuard();
    }
  });

  // 一致箇所を、上に張り付く検索バー（一覧を含む）に隠れない位置へ移動する。
  const scrollMatchIntoView = (target) => {
    const stuckBottom = () => {
      if (!searchToolbar || !searchToolbar.classList.contains("is-active")) return 0;
      const stickyTop = parseFloat(window.getComputedStyle(searchToolbar).top) || 0;
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
    hit.textContent = mark.textContent ?? "";
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

    const chapterCache = new Map();
    const fragment = document.createDocumentFragment();
    currentMatches.slice(0, SEARCH_LIST_LIMIT).forEach((mark, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-results__item";
      button.dataset.matchIndex = String(index);

      const where = document.createElement("span");
      where.className = "search-results__where";
      where.textContent = describeMatchLocation(mark, chapterCache);

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
      searchResultsNote.textContent = `一覧に出しているのは先頭の${SEARCH_LIST_LIMIT}件。残りは「次へ」で移動できる。`;
    }
    searchResults.hidden = false;
    applyResultsOpen();
  };

  const updateSearchUi = (keyword) => {
    if (!keyword) {
      summaryStatus.textContent = "";
      summaryStatus.classList.remove("error");
      if (searchNav) searchNav.hidden = true;
      if (searchToolbar) searchToolbar.classList.remove("is-active");
      return;
    }

    const total = currentMatches.length;
    if (total === 0) {
      summaryStatus.textContent = `「${keyword}」の一致: 0件`;
      summaryStatus.classList.add("error");
      if (searchNav) searchNav.hidden = true;
      if (searchToolbar) searchToolbar.classList.add("is-active");
      return;
    }

    const positionLabel = activeMatchIndex >= 0 ? `${activeMatchIndex + 1} / ${total}件` : `${total}件`;
    const inClosedFold =
      activeMatchIndex >= 0 &&
      Boolean(currentMatches[activeMatchIndex]?.closest("details.spoiler-fold:not([open])"));
    summaryStatus.textContent = `「${keyword}」の一致: ${positionLabel}${inClosedFold ? "（畳まれた箇所の中）" : ""}`;
    summaryStatus.classList.remove("error");
    if (searchNav) searchNav.hidden = false;
    if (searchToolbar) searchToolbar.classList.add("is-active");
  };

  // reveal が真のとき（一覧の行を押したとき）だけ、畳まれた「先の内容に触れる箇所」を開く。
  // 「検索」「前へ／次へ」では開かず、その箇所の開閉ボタンの位置へ移動する。
  const focusMatch = (index, { reveal = false } = {}) => {
    if (currentMatches.length === 0) return;
    if (activeMatchIndex >= 0 && currentMatches[activeMatchIndex]) {
      currentMatches[activeMatchIndex].classList.remove("is-active");
    }
    const total = currentMatches.length;
    activeMatchIndex = ((index % total) + total) % total;
    const target = currentMatches[activeMatchIndex];
    ensureSectionExpandedFor(target);
    if (reveal) {
      revealSpoilerFoldFor(target);
      refreshMaskedRows();
    }
    target.classList.add("is-active");
    updateSearchUi(currentKeyword);
    syncActiveResultRow();
    const closedFold = target.closest("details.spoiler-fold:not([open])");
    scrollMatchIntoView(closedFold?.querySelector(":scope > summary") ?? target);
  };

  const runSearch = ({ shouldScroll, step = 1 } = { shouldScroll: false, step: 1 }) => {
    const keyword = searchInput.value.trim();
    if (shouldScroll && keyword && keyword === currentKeyword && currentMatches.length > 0) {
      focusMatch(activeMatchIndex + step);
      return;
    }

    currentKeyword = keyword;
    currentMatches = highlightKeyword(keyword);
    activeMatchIndex = -1;
    renderResultList();

    if (shouldScroll && keyword && currentMatches.length > 0) {
      focusMatch(step < 0 ? currentMatches.length - 1 : 0);
      return;
    }
    updateSearchUi(keyword);
  };

  searchButton.addEventListener("click", () => runSearch({ shouldScroll: true, step: 1 }));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch({ shouldScroll: true, step: event.shiftKey ? -1 : 1 });
    }
  });
  searchInput.addEventListener("input", () => {
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    inputDebounceTimer = window.setTimeout(() => {
      runSearch({ shouldScroll: false });
    }, 180);
  });

  prevMatchButton?.addEventListener("click", () => focusMatch(activeMatchIndex - 1));
  nextMatchButton?.addEventListener("click", () => focusMatch(activeMatchIndex + 1));

  clearSearchButton.addEventListener("click", () => {
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    searchInput.value = "";
    currentKeyword = "";
    currentMatches = [];
    activeMatchIndex = -1;
    clearHighlights();
    renderResultList();
    updateSearchUi("");
    searchInput.focus();
  });

  searchResultsToggle?.addEventListener("click", () => {
    resultsOpen = !resultsOpen;
    applyResultsOpen();
    if (resultsOpen) syncActiveResultRow();
  });

  searchResultsList?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest(".search-results__item");
    if (!(row instanceof HTMLElement)) return;
    const index = Number(row.dataset.matchIndex);
    if (!Number.isInteger(index) || !currentMatches[index]) return;
    // 狭い画面では一覧が本文を覆うため、行を選んだら一覧を閉じてから移動する。
    if (narrowQuery.matches) {
      resultsOpen = false;
      applyResultsOpen();
    }
    focusMatch(index, { reveal: true });
  });

  // 畳まれた箇所が開閉されたら、一覧の伏せた行と件数表示を合わせ直す。
  markdownContainer.addEventListener(
    "toggle",
    (event) => {
      if (event.target instanceof HTMLDetailsElement && currentMatches.length > 0) {
        refreshMaskedRows();
        updateSearchUi(currentKeyword);
      }
    },
    true
  );

  updateSearchUi("");
}

// クイックガイドと主要年表のネタバレ部分：一度開いた読者には、次回も開いた状態で見せる。
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
  wireRememberedDetails("guideSpoiler", GUIDE_SPOILER_STORAGE_KEY);
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

function enhanceSpoilerFolds() {
  if (!markdownContainer) return;

  markdownContainer.querySelectorAll(".analysis-block[data-spoiler-until]").forEach((block) => {
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

  markdownContainer.querySelectorAll("figure[data-spoiler-until]").forEach((figure) => {
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
    ? "先の内容に触れる箇所を畳む"
    : "先の内容に触れる箇所をすべて開く";
}

function wireSpoilerFolds() {
  syncSpoilerFoldsToggleUi();
  spoilerFoldsToggle?.addEventListener("click", () => {
    forwardSpoilersOpen = !forwardSpoilersOpen;
    writeStoredFlag(FORWARD_SPOILER_STORAGE_KEY, forwardSpoilersOpen);
    markdownContainer?.querySelectorAll("details.spoiler-fold").forEach((details) => {
      details.open = forwardSpoilersOpen;
    });
    syncSpoilerFoldsToggleUi();
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

function scrollToLocationHash() {
  const rawHash = window.location.hash;
  if (!rawHash || rawHash.length <= 1) return;
  const targetId = decodeURIComponent(rawHash.slice(1));
  const target = document.getElementById(targetId);
  if (target) {
    ensureSectionExpandedFor(target);
    target.scrollIntoView({ block: "start" });
  }
}

async function init() {
  if (!summaryStatus) return;
  summaryStatus.textContent = "";
  wireSearchPlaceholder();
  wireGuideSpoiler();

  let markdown = FALLBACK_NOTE;
  let loadedFromFile = false;
  let glossaryItems = [];

  const [noteResult, glossaryResult] = await Promise.allSettled([
    fetch("./note.md", { cache: "no-store" }),
    fetch("./glossary.json", { cache: "no-store" })
  ]);

  if (noteResult.status === "fulfilled" && noteResult.value.ok) {
    try {
      markdown = await noteResult.value.text();
      loadedFromFile = true;
    } catch (_error) {
      loadedFromFile = false;
    }
  }

  if (glossaryResult.status === "fulfilled" && glossaryResult.value.ok) {
    try {
      const parsed = await glossaryResult.value.json();
      if (Array.isArray(parsed)) {
        glossaryItems = parsed;
      }
    } catch (_error) {
      glossaryItems = [];
    }
  }

  const rendered = simpleMarkdownToHtml(normalizeSource(markdown));
  markdownContainer.innerHTML = sanitizeGeneratedHtml(rendered);
  requestAnimationFrame(() => {
    prepareHeadingMetadata();
    addBackToTocLinks();
    enhanceSections();
    enhanceSpoilerFolds();
    checkGlossaryStages(glossaryItems);
    enhanceGlossaryTerms(glossaryItems);
    buildToc();
    wireSectionFolding();
    wireSpoilerFolds();
    wireGlossaryPopovers(glossaryItems);
    wireTocToggle();
    wireBackToTocLinks();
    wireActiveHeadingTracker();
    wireSearch();
    window.addEventListener("hashchange", scrollToLocationHash);
    if (!loadedFromFile) {
      summaryStatus.textContent = "note.md が未配置のため、案内テキストを表示中です。";
      searchToolbar?.classList.add("is-active");
    }
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
