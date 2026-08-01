#!/usr/bin/env node
// PostToolUse 훅. Write/Edit 로 저장된 한국어 마크다운에 scan.mjs 를 돌려
// auto 티어 위반만 되돌려준다.
//
// 되돌려주기만 하고 막지는 않는다. 판단이 필요한 건 context 티어인데
// 그건 애초에 안 본다. auto 는 작성 시점에 안 쓰면 그만인 것들이라
// 그 자리에서 고치는 게 맞다.
//
// 전역 훅이라 적용 범위를 좁게 잡는다. 하나라도 어긋나면 조용히 빠진다.

import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCAN = resolve(dirname(fileURLToPath(import.meta.url)), "scan.mjs");

const HANGUL_FLOOR = 0.25; // 본문의 한글 비율. 영어 문서는 여기서 걸러진다
const MIN_CHARS = 150; // 짧은 파일은 안 본다. 링크드인 글 한 편이 대략 600자다
const MAX_BYTES = 400_000;

const quiet = () => process.exit(0);

let payload = "";
try {
  payload = readFileSync(0, "utf8");
} catch {
  quiet();
}

let file;
try {
  const j = JSON.parse(payload);
  file = j?.tool_input?.file_path;
} catch {
  quiet();
}
if (!file || !/\.mdx?$/i.test(file)) quiet();

// 자기 자신과 도구 문서는 안 본다. 규칙 예시가 잔뜩 들어 있어 항상 걸린다.
if (/[\\/](\.claude|node_modules|plain-ko)[\\/]/.test(file)) quiet();

let text;
try {
  if (statSync(file).size > MAX_BYTES) quiet();
  text = readFileSync(file, "utf8");
} catch {
  quiet();
}

// 코드·frontmatter 를 뺀 산문에서 한글 비율을 잰다.
const prose = text
  .replace(/^---\n[\s\S]*?\n---\n/, "")
  .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "")
  .replace(/`[^`\n]*`/g, "");
const letters = prose.replace(/[\s\d\p{P}\p{S}]/gu, "");
if (letters.length < MIN_CHARS) quiet();
if ((prose.match(/[가-힣]/gu) || []).length / letters.length < HANGUL_FLOOR) quiet();

let out = "";
try {
  execFileSync("node", [SCAN, file], { encoding: "utf8", timeout: 15000 });
  quiet(); // exit 0 이면 위반 없음
} catch (e) {
  if (e.status !== 1) quiet(); // 1 이 아니면 스캐너 오류다. 조용히 빠진다
  out = e.stdout ?? "";
}

const lines = out
  .split(/\r?\n/)
  .filter((l) => /^\s+\d+:!/.test(l))
  .map((l) => l.trim());
if (!lines.length) quiet();

// exit 2 로 되돌리는 내용은 stderr 로 나가야 모델에게 전달된다.
// stdout 에 쓰면 훅은 돌지만 메시지가 사라진다.
console.error(
  [
    `plain-ko: 확정 ${lines.length}건. 저장한 파일에서 고칠 것이 있다.`,
    ...lines.slice(0, 12),
    lines.length > 12 ? `… 외 ${lines.length - 12}건` : "",
    "",
    "auto 티어라 판단이 필요 없는 항목이다. 지금 고쳐라.",
    "문맥 판단이 필요한 항목까지 보려면 `--all` 로 직접 돌린다.",
  ]
    .filter(Boolean)
    .join("\n"),
);
process.exit(2); // 2 = 결과를 모델에게 되돌린다
