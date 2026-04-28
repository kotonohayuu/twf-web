const FALLBACK_NOTE = `
## ノートの読み込みに失敗しました

\`twf-web/note.md\` が見つからない、または読み込みできませんでした。

### 解決方法

1. \`twf-web\` フォルダ内に \`note.md\` を配置する  
2. ブラウザを再読み込みする

※ Vercel運用では、\`note.md\` のみを更新対象にする構成がおすすめです。
`;

const markdownContainer = document.getElementById("markdownContainer");
const layoutContainer = document.querySelector(".layout");
const tocSidebar = document.getElementById("tocSidebar");
const tocList = document.getElementById("tocList");
const tocNav = document.getElementById("tocNav");
const tocToggleButton = document.getElementById("tocToggleButton");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");
const summaryStatus = document.getElementById("summaryStatus");

const slugCounts = new Map();

function slugify(text) {
  const base = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\wぁ-んァ-ン一-龥ー\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const fallback = base || "section";
  const seen = slugCounts.get(fallback) ?? 0;
  slugCounts.set(fallback, seen + 1);
  return seen === 0 ? fallback : `${fallback}-${seen + 1}`;
}

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

function renderImage(altText, src) {
  const safeSrc = sanitizeImageSrc(src);
  if (!safeSrc) {
    return `<p class="status error">危険な画像URLをブロックしました: <code>${escapeHtml(src)}</code></p>`;
  }
  return `<figure class="wiki-figure"><img src="${escapeHtmlAttr(safeSrc)}" alt="${escapeHtmlAttr(altText)}" class="wiki-image" loading="lazy"><figcaption>${escapeHtml(altText)}</figcaption></figure>`;
}

function normalizeSource(raw) {
  return raw.replace(/^---[\s\S]*?##\s*/m, "## ");
}

function simpleMarkdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inUl = false;
  let inOl = false;
  let inQuote = false;
  let quoteType = "";

  const closeAll = () => {
    if (inUl) html.push("</ul>");
    if (inOl) html.push("</ol>");
    if (inQuote) {
      html.push(quoteType === "default" ? "</blockquote>" : "</div>");
    }
    inUl = false;
    inOl = false;
    inQuote = false;
    quoteType = "";
  };

  for (const lineRaw of lines) {
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

    if (trimmed.startsWith("> ")) {
      let text = trimmed.slice(2);
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

    const ul = trimmed.match(/^-+\s+(.+)$/);
    if (ul) {
      if (!inUl) {
        closeAll();
        inUl = true;
        html.push("<ul>");
      }
      html.push(`<li>${formatInline(ul[1])}</li>`);
      continue;
    }

    // 画像構文: ![alt](src)
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      closeAll();
      html.push(renderImage(imgMatch[1], imgMatch[2]));
      continue;
    }

    closeAll();
    const formatted = formatInline(trimmed);
    if (formatted.startsWith("<strong>隠し要素：</strong>") || formatted.startsWith("<strong>隠し要素:</strong>")) {
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

function buildToc() {
  if (!tocList) return;
  tocList.innerHTML = "";
  assignFile4AnchorIds();
  const headings = markdownContainer.querySelectorAll("h2, h3");
  let autoIdCounter = 1;
  const fragment = document.createDocumentFragment();
  headings.forEach((heading) => {
    if (!heading.id) {
      // Keep URL hashes ASCII-only for headings without explicit anchors.
      heading.id = `sec-${autoIdCounter}`;
      autoIdCounter += 1;
    }
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent ?? "";
    link.dataset.level = heading.tagName.replace("H", "");
    li.appendChild(link);
    fragment.appendChild(li);
  });
  tocList.appendChild(fragment);
}

function wireTocToggle() {
  if (!tocNav || !tocToggleButton) return;

  const mobileQuery = window.matchMedia("(max-width: 640px)");

  const applyCollapsedState = (collapsed) => {
    tocNav.hidden = collapsed;
    tocToggleButton.setAttribute("aria-expanded", String(!collapsed));
    tocToggleButton.textContent = collapsed ? "目次を開く" : "目次を閉じる";
  };

  const syncByViewport = () => {
    if (mobileQuery.matches) {
      applyCollapsedState(true);
      return;
    }
    applyCollapsedState(false);
  };

  tocToggleButton.addEventListener("click", () => {
    applyCollapsedState(!tocNav.hidden);
  });

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncByViewport);
  } else {
    mobileQuery.addListener(syncByViewport);
  }

  syncByViewport();
}

function addBackToTocLinks() {
  if (!markdownContainer || !tocSidebar) return;

  const headings = Array.from(markdownContainer.querySelectorAll("h2"));
  headings.forEach((heading, index) => {
    const backToToc = document.createElement("div");
    const link = document.createElement("a");
    const headingText = heading.textContent?.trim() || "この章";

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
  if (!keyword) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  let count = 0;

  const walker = document.createTreeWalker(markdownContainer, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest(".back-to-toc")) return NodeFilter.FILTER_REJECT;
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
      cursor = start + matched.length;
      count += 1;
      return matched;
    });
    if (cursor < text.length) fragment.append(text.slice(cursor));
    textNode.parentNode?.replaceChild(fragment, textNode);
  });

  return count;
}

function scrollToFirstMark() {
  const firstMark = markdownContainer.querySelector("mark");
  if (!firstMark) return;
  firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateSearchStatus(keyword, count) {
  if (!keyword) {
    summaryStatus.textContent = "";
    summaryStatus.classList.remove("error");
    return;
  }
  summaryStatus.textContent = `「${keyword}」の一致: ${count}件`;
  summaryStatus.classList.toggle("error", count === 0);
}

function wireSearch() {
  if (!searchInput || !searchButton || !clearSearchButton || !summaryStatus) return;
  let inputDebounceTimer = null;

  const runSearch = ({ shouldScroll } = { shouldScroll: false }) => {
    const keyword = searchInput.value.trim();
    const count = highlightKeyword(keyword);
    updateSearchStatus(keyword, count);
    if (shouldScroll && keyword && count > 0) {
      scrollToFirstMark();
    }
  };

  searchButton.addEventListener("click", () => runSearch({ shouldScroll: true }));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runSearch({ shouldScroll: true });
  });
  searchInput.addEventListener("input", () => {
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    inputDebounceTimer = window.setTimeout(() => {
      runSearch({ shouldScroll: false });
    }, 180);
  });

  clearSearchButton.addEventListener("click", () => {
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    searchInput.value = "";
    clearHighlights();
    updateSearchStatus("", 0);
    searchInput.focus();
  });

  updateSearchStatus("", 0);
}

async function init() {
  if (!summaryStatus) return;
  summaryStatus.textContent = "";

  let markdown = FALLBACK_NOTE;
  let loadedFromFile = false;

  try {
    const response = await fetch("./note.md", { cache: "no-store" });
    if (response.ok) {
      markdown = await response.text();
      loadedFromFile = true;
    }
  } catch (_error) {
    loadedFromFile = false;
  }

  const rendered = simpleMarkdownToHtml(normalizeSource(markdown));
  markdownContainer.innerHTML = sanitizeGeneratedHtml(rendered);
  requestAnimationFrame(() => {
    buildToc();
    addBackToTocLinks();
    wireTocToggle();
    wireBackToTocLinks();
    wireSearch();
    summaryStatus.textContent = loadedFromFile
      ? ""
      : "note.md が未配置のため、案内テキストを表示中です。";
  });
}

init();
