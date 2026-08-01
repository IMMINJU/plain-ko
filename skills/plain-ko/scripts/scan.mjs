#!/usr/bin/env node
// plain-ko scan — 결정적 검출 레이어.
// 사전(references/lexicon.md)과 구조 규칙 S1–S6을 문서에 적용한다.
// 판정이 필요한 항목(S7–S12)은 여기서 다루지 않는다.
//
//   node scan.mjs <파일|디렉터리> ... [--json] [--all] [--rule ID]
//
//   --all    context 티어까지 보고한다 (기본은 auto만)
//   --json   기계가 읽는 형식으로 낸다
//   --rule   특정 규칙만 본다 (예: --rule S1)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEXICON = resolve(HERE, "../references/lexicon.md");

// ─────────────────────────────────────────── 사전 파싱

const SECTION_TITLES = {
  L1: "과잉 한자어",
  L2: "설명을 대체하는 비유",
  L3: "과장된 물리 동사",
  L4: "감정 라벨링",
  L5: "하이프",
  L6: "번역투",
};

function loadLexicon() {
  const entries = [];
  let section = null;
  let n = 0;

  for (const raw of readFileSync(LEXICON, "utf8").split(/\r?\n/)) {
    const head = raw.match(/^##\s+(L\d+)\./);
    if (head) {
      section = head[1];
      n = 0;
      continue;
    }
    if (!section || !raw.startsWith("|")) continue;

    const cells = raw.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    if (cells[0] === "패턴" || /^-+$/.test(cells[0])) continue;

    const [pattern, suggestion, tier, note = ""] = cells;
    if (!pattern) continue;

    entries.push({
      id: `${section}-${++n}`,
      section,
      pattern,
      suggestion,
      tier: tier === "auto" ? "auto" : "context",
      note,
      re: toRegExp(pattern),
    });
  }
  return entries;
}

// /.../ 는 정규식, 나머지는 리터럴.
function toRegExp(pattern) {
  const m = pattern.match(/^\/(.*)\/$/);
  const body = m ? m[1] : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(body, "gu");
}

// ─────────────────────────────────────────── 구조 규칙

const STRUCTURAL = [
  {
    id: "S1",
    label: "부정 대구",
    // `가/이 아니라` 만 보면 절반을 놓친다.
    // `게 아니라`, `게 아니었다`, `아닌 X`, `~것이지 ~가 아니었다` 가 모두 같은 구조다.
    re: /(?:이|가|게|건|것이|은|는|을|를|도|만)\s*아니(?:라|었다)|아닌\s+[가-힣]/gu,
    tier: "context",
    hint: "부정당하는 쪽이 이 글에서 실제로 주장된 적 있나? 없으면 리듬용이다",
  },
  {
    id: "S2",
    label: "콜론 제목",
    re: /^#{2,6}\s+[^:\n]{1,40}:\s*\S/gmu,
    tier: "context",
    hint: "제목이 아니라 표의 행이다. 문장으로 바꾼다",
  },
  {
    id: "S2c",
    label: "서수·순번 제목",
    // `세 가지 원칙`, `네 층` 은 수량이지 순번이 아니다.
    // 고유수사만으로는 안 잡고 `번째` 를 요구한다.
    re: /^#{2,6}\s+(?:(?:첫|두|세|네|다섯)\s*번째|\d+\s*(?:차|단계|일차|회차)|가설\s*\d+|시도\s*\d+)(?:\s|[:：]|$)/gmu,
    tier: "auto",
    hint: "번호가 아니라 그 단계에서 무엇이 밝혀졌는지를 제목으로 쓴다",
  },
  {
    id: "S2b",
    label: "em dash 제목",
    re: /^#{2,6}\s+[^\n]*(?:—|–|--)/gmu,
    tier: "context",
    hint: "제목을 두 번 쓰는 구조다. 붙임말을 떼고 한 문장으로 만든다",
  },
  {
    id: "S2d",
    label: "인용 시작 제목",
    re: /^#{2,6}\s+["“'']/gmu,
    tier: "context",
    hint: "실제 발언을 그대로 쓰는 건 정당하지만, 연속되면 장치다",
  },
  {
    id: "S14",
    label: "em dash",
    // 문장부호 선택을 대시로 회피하는 습관을 잡는다.
    // 제목보다 본문이 훨씬 많으므로 둘 다 본다.
    re: /[—–]/gu,
    tier: "auto",
    hint: "쉼표·괄호로 바꾸거나 문장을 나눈다",
  },
  {
    id: "S13",
    label: "`있었다` 종결",
    // 무슨 일이 일어났는지 대신 무엇이 있었는지를 말한다.
    re: /있었다\./gu,
    tier: "context",
    hint: "상태 서술로 도망간 자리다. 동작하는 동사로 바꾼다",
  },
  {
    id: "S4",
    label: "정형 소제목",
    re: /^#{1,6}\s*(돌아보며|마치며|정리하며|마무리|들어가며|시작하며|배운 것|교훈)/gmu,
    tier: "auto",
    hint: "그 자리에 결론을 넣는다",
  },
  {
    id: "S5",
    label: "명사화 종결",
    re: /(라는 것이다|인 셈이다|라는 점이다|라는 뜻이다)/gu,
    tier: "context",
    hint: "동사로 끝낼 자리를 명사로 감쌌다",
  },
  {
    id: "S6",
    label: "`이다` 회피",
    re: /(역할을 한다|에 해당한다|로 작용한다|를 의미한다|라고 볼 수 있다)/gu,
    tier: "auto",
    hint: "그냥 `~다`로 쓴다",
  },
  {
    id: "S16",
    label: "긴 볼드",
    // 40자를 넘으면 강조가 아니라 굵은 본문이다.
    re: /\*\*[^*\n]{40,}\*\*/gu,
    tier: "context",
    hint: "강조할 어절만 남기고 나머지는 푼다",
  },
  {
    id: "S7",
    label: "예고와 회수",
    re: /(함정이 있다|예고편|뒤에 나올|마지막에 (한다|적었다|말한다|다룬다)|나중에 (다루|말하|설명)|이건 뒤에서|스포일러)/gu,
    tier: "auto",
    hint: "지금 말할 수 있는 걸 미루고 있다. 삭제하거나 그 자리에 내용을 넣는다",
  },
  {
    id: "S8",
    label: "3항 나열",
    re: /(가설|이유|근거|원인|교훈|방법|규칙|기준|조건|포인트|선택지)\s*(셋|세 가지|세 개|3가지)/gu,
    tier: "context",
    hint: "세 번째를 지우면 뜻이 줄어드나? 안 줄면 리듬용이다",
  },
  {
    id: "S11",
    label: "제목 클리셰",
    re: /(딥다이브|딥 다이브|해부|언더 더 후드|완벽 가이드|완벽가이드|총정리|왜 중요한가|A to Z)/gu,
    tier: "context",
    hint: "제목에 있으면 바꾼다",
  },
];

// ─────────────────────────────────────────── 본문 추출
// 코드 블록·인라인 코드·URL·frontmatter 는 검사 대상이 아니다.
// 줄 번호를 지키려고 지우는 대신 같은 길이의 공백으로 덮는다.

function maskNonProse(text) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, blank)
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/\]\([^)\n]*\)/g, blank)
    .replace(/^\s{4,}\S[^\n]*$/gm, blank);
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") line++;
  return line;
}

function excerpt(text, index, len) {
  const from = Math.max(0, index - 18);
  const to = Math.min(text.length, index + len + 18);
  const head = from > 0 ? "…" : "";
  const tail = to < text.length ? "…" : "";
  return head + text.slice(from, to).replace(/\n/g, " ").trim() + tail;
}

// ─────────────────────────────────────────── 밀도 (S3)

function density(prose) {
  const bold = [...prose.matchAll(/\*\*[^*\n]+\*\*/gu)];
  const boldBullets = [...prose.matchAll(/^\s*[-*]\s+\*\*[^*\n]+\*\*\s*[:：]/gmu)];

  const paragraphs = prose.split(/\n\s*\n/).filter((p) => p.trim());
  const heavy = paragraphs.filter(
    (p) => (p.match(/\*\*[^*\n]+\*\*/gu) || []).length >= 2,
  ).length;

  const sentences = prose
    .replace(/^#{1,6}[^\n]*$/gm, "")
    .split(/(?<=[.!?다요])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  const lens = sentences.map((s) => s.length);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const sd = Math.sqrt(
    lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1),
  );

  // 개별 히트가 틀린 게 아니라 밀도가 문제인 패턴들.
  // 사전에 넣으면 오탐이 쏟아지므로 세기만 하고 판단은 안 한다.
  const chars = prose.replace(/\s/g, "").length || 1;
  const per1k = (re) => +(([...prose.matchAll(re)].length / chars) * 1000).toFixed(1);

  return {
    bold: bold.length,
    boldBullets: boldBullets.length,
    heavyParagraphs: heavy,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    meanSentenceLen: Math.round(mean),
    sentenceLenCV: mean ? +(sd / mean).toFixed(2) : 0,
    chars,
    rates: {
      피동: per1k(/(?:되었|되는|된 |되다|어졌|어지는|여졌|아졌)/gu),
      가능표현: per1k(/(?:할|될|볼|쓸|갈|올|낼|들|잡을|만들)\s*수\s*있/gu),
      에대해: per1k(/에\s*(?:대해|대한|관해|관한)/gu),
      의존명사것: per1k(/(?:것이|것을|것은|것이다|것으로|게\s|걸\s)/gu),
      복수들: per1k(/[가-힣]들(?:이|을|은|의|에|과|과의|도)?\s/gu),
    },
  };
}

// ─────────────────────────────────────────── 문단 관계 (S15)
// 볼드로 시작하는 문단이 몇 개나 이어지는지 본다. 하나뿐이면 강조가 맞고,
// 셋이 이어지면 그건 서식이다. 개수를 세는 게 아니라 연속을 보는 것이라
// 밀도 지표가 아니라 항목으로 낸다.

const LEAD_BOLD_RUN = 3;

function leadBoldRuns(prose) {
  const runs = [];
  let index = 0;
  let streak = [];

  const flush = () => {
    if (streak.length >= LEAD_BOLD_RUN) {
      runs.push({
        index: streak[0].index,
        count: streak.length,
        text: streak[0].head,
      });
    }
    streak = [];
  };

  for (const para of prose.split(/\n\s*\n/)) {
    const t = para.trim();
    const m = t.match(/^\*\*([^*\n]{2,})\*\*/);
    if (m && !t.startsWith("#")) {
      const at = prose.indexOf(t, index);
      streak.push({ index: at < 0 ? index : at, head: m[0].slice(0, 40) });
    } else if (t) {
      flush();
    }
    index += para.length + 2;
  }
  flush();
  return runs;
}

// ─────────────────────────────────────────── 스캔

function scanFile(path, lexicon, opts) {
  const raw = readFileSync(path, "utf8");
  const prose = maskNonProse(raw);
  const findings = [];

  const push = (id, label, tier, index, matched, suggestion, hint) => {
    if (opts.rule && !id.startsWith(opts.rule)) return;
    if (!opts.all && tier !== "auto") return;
    findings.push({
      file: path,
      line: lineAt(raw, index),
      id,
      label,
      tier,
      matched,
      suggestion,
      hint,
      excerpt: excerpt(raw, index, matched.length),
    });
  };

  for (const e of lexicon) {
    e.re.lastIndex = 0;
    for (const m of prose.matchAll(e.re)) {
      push(e.id, SECTION_TITLES[e.section], e.tier, m.index, m[0], e.suggestion, e.note);
    }
  }

  for (const s of STRUCTURAL) {
    s.re.lastIndex = 0;
    for (const m of prose.matchAll(s.re)) {
      push(s.id, s.label, s.tier, m.index, m[0].trim(), "", s.hint);
    }
  }

  // S15 는 문단 사이의 관계라 정규식 하나로 안 잡힌다.
  // 문단 첫머리 볼드가 연속으로 나오면 그건 강조가 아니라 서식 습관이다.
  for (const run of leadBoldRuns(prose)) {
    push(
      "S15",
      "리드 볼드 연속",
      "auto",
      run.index,
      run.text,
      "",
      `문단 ${run.count}개가 연속으로 볼드로 시작한다. 하나만 남긴다`,
    );
  }

  return { findings, density: density(prose) };
}

function collect(target) {
  const st = statSync(target);
  if (st.isFile()) return /\.mdx?$/.test(target) ? [target] : [];
  return readdirSync(target).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    return collect(join(target, name));
  });
}

// ─────────────────────────────────────────── 보고

const BOLD_PER_DOC = 6;
const CV_FLOOR = 0.45; // 문장 길이 변동계수가 이보다 낮으면 균일하다

// 1,000자당 임계. 개별 히트를 틀렸다고 하지 않는다.
// 이 선을 넘으면 한 번 훑어보라는 뜻이다.
const RATE_CEIL = {
  피동: 3.0,
  가능표현: 3.0,
  에대해: 1.0,
  의존명사것: 16.0, // 한국어에서 원래 높아 임계도 높다
  복수들: 5.0,
};

function report(results, opts) {
  const all = results.flatMap((r) => r.findings);

  if (opts.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return all.length;
  }

  if (!all.length) {
    console.log("확정 항목 없음." + (opts.all ? "" : "  (--all 로 문맥 항목까지 본다)"));
  }

  let currentFile = null;
  for (const f of all.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    if (f.file !== currentFile) {
      currentFile = f.file;
      console.log(`\n${relative(process.cwd(), f.file)}`);
    }
    const mark = f.tier === "auto" ? "!" : "?";
    const arrow = f.suggestion ? `  → ${f.suggestion}` : "";
    console.log(`  ${f.line}:${mark} [${f.id}] ${f.matched}${arrow}`);
    console.log(`       ${f.excerpt}`);
    if (f.hint && f.tier !== "auto") console.log(`       ${f.hint}`);
  }

  console.log("\n── 밀도 ──");
  for (const r of results) {
    const d = r.density;
    const flags = [];
    if (d.bold > BOLD_PER_DOC) flags.push(`볼드 ${d.bold}`);
    if (d.boldBullets) flags.push(`볼드콜론불릿 ${d.boldBullets}`);
    if (d.heavyParagraphs) flags.push(`볼드2개이상 문단 ${d.heavyParagraphs}/${d.paragraphs}`);
    if (d.sentences > 8 && d.sentenceLenCV < CV_FLOOR)
      flags.push(`문장길이 균일 CV=${d.sentenceLenCV}`);
    for (const [k, ceil] of Object.entries(RATE_CEIL)) {
      if (d.chars > 600 && d.rates[k] > ceil)
        flags.push(`${k} ${d.rates[k]}/1k (기준 ${ceil})`);
    }
    if (flags.length)
      console.log(`  ${relative(process.cwd(), r.file)}  ${flags.join(" · ")}`);
  }

  const byRule = new Map();
  for (const f of all) byRule.set(f.id.split("-")[0], (byRule.get(f.id.split("-")[0]) ?? 0) + 1);
  const top = [...byRule].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    console.log("\n── 규칙별 ──");
    for (const [id, n] of top) console.log(`  ${id.padEnd(4)} ${n}`);
  }

  console.log(`\n총 ${all.length}건 / ${results.length}개 문서`);
  return all.length;
}

// ─────────────────────────────────────────── 자기 검사
// 한자어를 빼면서 비유로 채우는 사고가 있다. 교정이 새 위반을 만드는 것이다.
// 사전의 대안 칸은 우리가 통제하는 데이터이므로, 그 충돌은 편집 시점이 아니라
// 여기서 잡는다. 대안이 다른 규칙에 걸리면 사전 버그다.

function selfcheck(lexicon) {
  const skip = /^\(|^~|^$/; // "(삭제)", "~해야 한다" 같은 지시문은 검사 대상이 아니다
  const collisions = [];

  const probes = [
    ...lexicon.map((e) => ({ id: e.id, label: SECTION_TITLES[e.section], re: e.re })),
    ...STRUCTURAL.map((s) => ({ id: s.id, label: s.label, re: s.re })),
  ];

  for (const e of lexicon) {
    for (const alt of e.suggestion.split("/").map((s) => s.trim())) {
      if (skip.test(alt)) continue;
      for (const p of probes) {
        if (p.id === e.id) continue;
        p.re.lastIndex = 0;
        const m = alt.match(p.re);
        if (m) collisions.push({ from: e, alt, hit: p, matched: m[0] });
      }
    }
  }
  return collisions;
}

// ─────────────────────────────────────────── main

const argv = process.argv.slice(2);
const opts = {
  json: argv.includes("--json"),
  all: argv.includes("--all"),
  rule: (() => {
    const i = argv.indexOf("--rule");
    return i >= 0 ? argv[i + 1] : null;
  })(),
};
const targets = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--rule");

const lexicon = loadLexicon();

if (!targets.length && !argv.includes("--selfcheck")) {
  console.error("사용법: node scan.mjs <파일|디렉터리> ... [--json] [--all] [--rule ID|--selfcheck]");
  process.exit(2);
}

if (argv.includes("--selfcheck")) {
  const c = selfcheck(lexicon);
  if (!c.length) console.log(`사전 ${lexicon.length}항목 · 대안 충돌 없음`);
  for (const x of c)
    console.log(
      `  [${x.from.id}] ${x.from.pattern} → "${x.alt}"  ⚠ ${x.hit.id}(${x.hit.label}) 에 걸림: ${x.matched}`,
    );
  process.exit(c.length ? 1 : 0);
}

const files = targets.flatMap(collect);
if (!files.length) {
  console.error("검사할 .md 파일이 없다.");
  process.exit(2);
}

const results = files.map((f) => ({ file: f, ...scanFile(f, lexicon, opts) }));
const n = report(results, opts);
process.exit(n > 0 ? 1 : 0);
