import fs from "node:fs/promises";
import path from "node:path";

const ARXIV_NEW_URL = process.env.ARXIV_NEW_URL || "https://arxiv.org/list/quant-ph/new";
const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const SITE_URL = process.env.SITE_URL || "https://xue-gang-li.github.io/Arxiv_papers/";
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK || "";
const DRY_RUN = process.env.DRY_RUN === "1";
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const C = {
  superconducting: "\u8d85\u5bfc\u91cf\u5b50\u8ba1\u7b97",
  quasiparticle: "\u51c6\u7c92\u5b50/\u8f90\u5c04/\u7ea2\u5916",
  important: "\u91cd\u8981\u91cf\u5b50\u8ba1\u7b97\u8fdb\u5c55",
  high: "\u91cd\u70b9",
  recommended: "\u63a8\u8350",
  watch: "\u5173\u6ce8"
};

const keywordGroups = [
  {
    name: C.superconducting,
    priority: 4,
    words: [
      "superconducting",
      "superconductive",
      "transmon",
      "josephson",
      "circuit qed",
      "circuit quantum electrodynamics",
      "microwave resonator",
      "readout resonator",
      "fluxonium",
      "cat qubit",
      "bosonic qubit",
      "parametric amplifier",
      "superconducting qubit"
    ]
  },
  {
    name: C.quasiparticle,
    priority: 5,
    words: [
      "quasiparticle",
      "quasi-particle",
      "nonequilibrium quasiparticle",
      "quasiparticle poisoning",
      "cosmic ray",
      "ionizing radiation",
      "phonon",
      "infrared",
      "blackbody",
      "pair breaking",
      "qp burst",
      "radiation background"
    ]
  },
  {
    name: C.important,
    priority: 2,
    words: [
      "quantum error correction",
      "surface code",
      "logical qubit",
      "fault-tolerant",
      "error mitigation",
      "quantum advantage",
      "quantum simulation",
      "quantum processor",
      "noise spectroscopy",
      "decoherence"
    ]
  }
];

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "ArxivPapersDigest/1.0 (daily research digest)"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
  }
  return response.text();
}

async function getNewArxivIds() {
  const html = await fetchText(ARXIV_NEW_URL);
  const ids = [...html.matchAll(/href="\/abs\/([^"]+)"/g)]
    .map((match) => match[1].replace(/^quant-ph\//, ""))
    .filter((id) => /^\d{4}\.\d{4,5}(v\d+)?$/.test(id));
  return [...new Set(ids)];
}

async function getEntries(ids) {
  if (!ids.length) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const entries = [];
  for (const chunk of chunks) {
    const url = `${ARXIV_API_URL}?id_list=${encodeURIComponent(chunk.join(","))}&max_results=${chunk.length}`;
    const xml = await fetchText(url);
    const rawEntries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
    entries.push(...rawEntries.map(parseEntry));
  }
  return entries;
}

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? stripTags(match[1]) : "";
}

function parseEntry(xml) {
  const idUrl = tagValue(xml, "id");
  const id = idUrl.split("/").pop();
  const authors = [...xml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
    .map((match) => stripTags(match[1]));
  const categories = [...xml.matchAll(/<category[^>]+term="([^"]+)"/g)].map((match) => match[1]);
  return {
    id,
    title: tagValue(xml, "title"),
    abstract: tagValue(xml, "summary"),
    published: tagValue(xml, "published"),
    updated: tagValue(xml, "updated"),
    authors,
    categories,
    absUrl: `https://arxiv.org/abs/${id}`,
    pdfUrl: `https://arxiv.org/pdf/${id}`
  };
}

function classify(entry) {
  const haystack = `${entry.title} ${entry.abstract} ${entry.categories.join(" ")}`.toLowerCase();
  const groups = [];
  const matchedWords = [];
  let score = 0;
  for (const group of keywordGroups) {
    const hits = group.words.filter((word) => haystack.includes(word));
    if (hits.length) {
      groups.push(group.name);
      matchedWords.push(...hits);
      score += group.priority + Math.min(hits.length, 4);
    }
  }
  if (entry.categories.some((cat) => ["quant-ph", "cond-mat.mes-hall", "cond-mat.supr-con"].includes(cat))) {
    score += 1;
  }
  return {
    groups,
    matchedWords: [...new Set(matchedWords)],
    score
  };
}

function chineseSummary(entry, matchedWords) {
  const firstSentence = entry.abstract.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const terms = matchedWords.slice(0, 5).join(", ");
  return `英文摘要要点：${firstSentence}${terms ? ` 关键词命中：${terms}。` : ""}`;
}

function recommendReason(entry, classification) {
  if (classification.groups.includes("准粒子/辐射/红外")) {
    return "与准粒子、辐射本底、红外泄露或声子过程相关，可能直接关联超导量子芯片退相干和相关错误。";
  }
  if (classification.groups.includes("超导量子计算")) {
    return "与超导量子比特、约瑟夫森器件、微波读出或 circuit QED 平台相关，建议纳入日常跟踪。";
  }
  return "属于量子计算重要方向，可能对体系结构、纠错、噪声理解或实验路线有参考价值。";
}

function priorityLabel(score) {
  if (score >= 9) return C.high;
  if (score >= 5) return C.recommended;
  return C.watch;
}

function priorityClass(priority) {
  if (priority === C.high) return "level-high";
  if (priority === C.recommended) return "level-recommended";
  return "level-watch";
}

function selectPapers(entries) {
  return entries
    .map((entry) => {
      const classification = classify(entry);
      return {
        ...entry,
        ...classification,
        priority: priorityLabel(classification.score),
        summaryZh: chineseSummary(entry, classification.matchedWords),
        reason: recommendReason(entry, classification)
      };
    })
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml({ date, selected, total }) {
  const dailyFile = `Arxiv_papers_${date}.html`;
  const cards = selected.length
    ? selected.map((paper) => `
      <article class="paper ${priorityClass(paper.priority)}">
        <div class="meta">
          <span>${escapeHtml(paper.priority)}</span>
          <span>score ${paper.score}</span>
          <span>${escapeHtml(paper.groups.join(" / "))}</span>
        </div>
        <h2><a href="${paper.absUrl}">${escapeHtml(paper.title)}</a></h2>
        <p class="authors">${escapeHtml(paper.authors.slice(0, 8).join(", "))}${paper.authors.length > 8 ? " et al." : ""}</p>
        <p>${escapeHtml(paper.summaryZh)}</p>
        <p class="reason">${escapeHtml(paper.reason)}</p>
        <div class="links">
          <a href="${paper.absUrl}">arXiv</a>
          <a href="${paper.pdfUrl}">PDF</a>
        </div>
      </article>`).join("\n")
    : `<section class="empty">今天没有筛到强相关论文，可以轻松一点看。</section>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>arXiv Quantum Digest - ${date}</title>
  <style>
    :root { color-scheme: light; --ink:#17202a; --muted:#607080; --line:#d9e1e8; --blue:#1d5f96; --green:#116b5c; --gold:#8b5d12; --bg:#f7f9fb; }
    body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; color:var(--ink); background:var(--bg); }
    header { background:#ffffff; border-bottom:1px solid var(--line); }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 28px 20px; }
    h1 { margin:0 0 8px; font-size:30px; letter-spacing:0; }
    .sub { color:var(--muted); margin:0; }
    .stats { display:flex; gap:12px; flex-wrap:wrap; margin-top:18px; }
    .stat { border:1px solid var(--line); background:#fff; border-radius:8px; padding:8px 12px; color:var(--muted); }
    main { max-width:1040px; margin:0 auto; padding:22px 20px 48px; }
    .paper { background:#fff; border:1px solid var(--line); border-left:5px solid var(--blue); border-radius:8px; padding:18px; margin:14px 0; }
    .level-high { border-left-color:#b33b2e; }
    .level-recommended { border-left-color:var(--green); }
    .meta { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
    .meta span { font-size:13px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:3px 8px; }
    h2 { margin:0 0 8px; font-size:20px; line-height:1.35; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    p { line-height:1.7; margin:8px 0; }
    .authors { color:var(--muted); font-size:14px; }
    .reason { border-top:1px solid var(--line); padding-top:10px; color:#2d4f58; }
    .links { display:flex; gap:10px; margin-top:12px; }
    .links a { border:1px solid var(--line); border-radius:6px; padding:6px 10px; background:#fdfefe; }
    .empty { background:#fff; border:1px solid var(--line); border-radius:8px; padding:24px; color:var(--muted); }
    footer { color:var(--muted); border-top:1px solid var(--line); background:#fff; }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>arXiv Quantum Digest</h1>
      <p class="sub">${date}，面向超导量子计算、准粒子与重要量子计算进展的每日筛选。</p>
      <div class="stats">
        <div class="stat">今日新文：${total}</div>
        <div class="stat">筛选推荐：${selected.length}</div>
        <div class="stat">来源：quant-ph/new</div>
        <div class="stat">文件：${dailyFile}</div>
      </div>
    </div>
  </header>
  <main>${cards}</main>
  <footer><div class="wrap">Generated automatically from arXiv. 请以原文为准。</div></footer>
</body>
</html>`;
}

async function writeOutputs(date, selected, total) {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = { date, total, selected };
  const dailyFile = `Arxiv_papers_${date}.html`;
  await fs.writeFile(path.join(DATA_DIR, `${date}.json`), JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(path.join(PUBLIC_DIR, dailyFile), renderHtml(payload), "utf8");
  await fs.writeFile(path.join(PUBLIC_DIR, "index.html"), await renderIndex(date, selected, total), "utf8");
  return dailyFile;
}

async function renderIndex(date, selected, total) {
  let files = [];
  try {
    files = (await fs.readdir(PUBLIC_DIR))
      .filter((file) => /^Arxiv_papers_\d{4}-\d{2}-\d{2}\.html$/.test(file))
      .sort()
      .reverse();
  } catch {
    files = [];
  }
  const latest = `Arxiv_papers_${date}.html`;
  if (!files.includes(latest)) files.unshift(latest);
  const links = files.map((file) => {
    const day = file.replace("Arxiv_papers_", "").replace(".html", "");
    return `<li><a href="${file}">${day}</a></li>`;
  }).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>arXiv Quantum Digest</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; color:#17202a; background:#f7f9fb; }
    .wrap { max-width:840px; margin:0 auto; padding:32px 20px; }
    h1 { margin:0 0 8px; font-size:30px; letter-spacing:0; }
    p { line-height:1.7; color:#607080; }
    a { color:#1d5f96; text-decoration:none; }
    a:hover { text-decoration:underline; }
    .latest { display:inline-block; margin:14px 0 24px; border:1px solid #d9e1e8; background:#fff; border-radius:8px; padding:10px 14px; }
    li { margin:8px 0; }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>arXiv Quantum Digest</h1>
    <p>面向超导量子计算、准粒子与重要量子计算进展的工作日自动筛选。最新一期筛选 ${selected.length}/${total} 篇。</p>
    <a class="latest" href="${latest}">打开最新一期：${date}</a>
    <h2>历史归档</h2>
    <ul>${links}</ul>
  </main>
</body>
</html>`;
}

async function notifyFeishu(date, selected, total, dailyFile) {
  if (!FEISHU_WEBHOOK) {
    console.log("FEISHU_WEBHOOK is not set; skip notification.");
    return;
  }
  const top = selected.slice(0, 6).map((paper, index) =>
    `${index + 1}. [${paper.priority}] ${paper.title}\n${paper.absUrl}`
  ).join("\n\n");
  const dailyUrl = new URL(dailyFile, SITE_URL).toString();
  const text = `arXiv Quantum Digest ${date}\n今日 quant-ph 新文 ${total} 篇，筛选推荐 ${selected.length} 篇。\n\n${top || "今天没有筛到强相关论文。"}\n\n网页：${dailyUrl}`;
  if (DRY_RUN) {
    console.log(text);
    return;
  }
  const response = await fetch(FEISHU_WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } })
  });
  if (!response.ok) {
    throw new Error(`Feishu notification failed: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const date = todayInShanghai();
  const ids = await getNewArxivIds();
  const entries = await getEntries(ids);
  const selected = selectPapers(entries);
  const dailyFile = await writeOutputs(date, selected, entries.length);
  await notifyFeishu(date, selected, entries.length, dailyFile);
  console.log(`Generated ${selected.length}/${entries.length} papers for ${date}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
