# plain-ko

한국어 기술 글에서 **과잉 수사**를 찾는 Claude Code 스킬.
이미 쓴 글을 검수하고, 새로 쓸 때는 저장 시점에 잡는다.

> Korean tech-writing rhetoric linter for Claude Code. Finds overwrought prose:
> inflated Sino-Korean abstractions, explanation-replacing metaphors, foreshadowing,
> negative parallelism, em dashes. Grows its dictionary from your own editing history.
> Reviews existing drafts and enforces at write time via a hook.
> Not a humanizer, not a grammar checker.

## 무엇을 잡나

```
감사가 수렴하지 않았다      → 감사 결론이 안 났다
실측으로 확인했다           → 직접 재서 확인했다
밑 빠진 독이었다            → 끝이 없었다
로그가 에러를 토하기 시작했다 → 에러가 찍히기 시작했다
"여기에 함정이 있다."       → (삭제하고 그 자리에 내용을)
"짚은 문제가 흥미로웠다"     → "짚은 문제는 인덱스 누락이었다"
확인이 필요한 부분이 있었다   → 두 군데를 더 확인해야 했다
## 첫 번째 벽 — 권한 문제    → ## 80 포트를 못 열었다
## 돌아보며: 실패였을까      → ## 실패는 아니었다
```

예시는 패턴을 보여주려고 지어낸 문장이다.

어휘 쪽은 여섯이다. 과잉 한자 추상어, 설명을 대체하는 비유, 과장된 물리 동사,
감정과 사건 라벨링, 하이프, 번역투(얕게).

구조 쪽은 열하나다. 부정 대구, 콜론 제목, 서수 제목, em dash, `있었다` 종결,
명사화 종결, 정형 소제목, 예고와 회수, 3항 나열, 리드 볼드 연속, 긴 볼드.

## 무엇을 안 잡나

맞춤법, 띄어쓰기, 문장부호 규범. 번역투도 깊이 파지 않는다.

## 세 가지 원칙

1. 의미를 바꾸는 편집을 한다. 문체만 다듬는 게 아니다. 예고 문장을 지우는 건
   주장을 하나 없애는 것이고, 감정 라벨을 실제 내용으로 바꾸는 건 정보를 넣는 것이다.
   이 글에서 뺄 것과 채울 것을 같이 본다.

2. 그래서 검수할 때는 고쳐 쓰지 않는다. 출력은 다듬어진 전문이 아니라
   **근거가 붙은 후보 목록**이다. 채택은 사람이 한다. 같은 비유라도 살릴 것과
   죽일 것이 갈린다. 설명을 대신하고 있으면 죽이고, 지워도 아무 정보가 안 사라지면
   그냥 장식이라 남겨도 된다. 그 판단은 글의 논지를 아는 사람만 할 수 있다.

3. 사전이 자란다. 고정된 패턴 목록이 아니다. `mine.mjs` 가 글 저장소의
   git word-diff 를 캐서 **당신이 실제로 고친 표현**을 후보로 올린다.
   쓸수록 당신 취향에 맞아간다.

## 검수와 작성은 다르다

같은 사전을 쓰지만 적용 방식이 갈린다.

```
검수   이미 쓰인 문장    후보를 내고 사람이 고른다   auto + context
작성   아직 없는 문장    그냥 안 쓰면 된다          auto 만
```

이미 있는 문장을 고치려면 그 표현이 무슨 일을 하고 있었는지 판단해야 한다.
새로 쓸 때는 판단할 대상이 없다. em dash 를 안 쓰고 쉼표를 쓰면 그만이고, 잃는 게 없다.

그래서 작성 강제에는 `auto` 티어만 쓴다. 부정 대구나 `있었다` 종결처럼
정당한 용법이 있는 것(`context`)을 작성 시점에 막으면 글이 이상해진다.

## 설치

```bash
git clone https://github.com/IMMINJU/plain-ko
cp -r plain-ko/skills/plain-ko ~/.claude/skills/
```

프로젝트에만 쓰려면 `.claude/skills/` 아래에 둔다.
Node 18 이상. 의존성 없다.

### 검수

```
이 글 plain-ko 로 봐줘
```

후보 목록이 나오고 파일은 그대로 있다. 항목을 지목해야 편집이 나간다.

### 작성 강제 (선택)

`~/.claude/settings.json` 에 훅을 건다.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/skills/plain-ko/scripts/hook.mjs\"",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

마크다운을 저장하면 `auto` 위반이 모델에게 되돌아가고, 그 자리에서 고친다.
한글 비율이 25% 미만인 문서, 150자 미만인 문서, `.claude` 와 `plain-ko` 아래는
스스로 건너뛴다. 영어 문서에서 em dash 를 잡는 사고를 막기 위한 것이다.

설정을 넣은 뒤 `/hooks` 를 한 번 열거나 재시작해야 적용된다.

`CLAUDE.md` 에 `auto` 규칙을 요약해 두면 애초에 덜 나온다.
훅은 저장 후에 잡는 것이라 왕복이 한 번 더 생긴다.

### 스크립트만 따로

```bash
node skills/plain-ko/scripts/scan.mjs content/posts --all
node skills/plain-ko/scripts/scan.mjs --selfcheck
node skills/plain-ko/scripts/mine.mjs ~/my-blog --path 'content/**/*.md'
```

`scan.mjs` 는 찾은 게 있으면 exit 1 이다. pre-commit 에 걸 수 있다.

```bash
node skills/plain-ko/scripts/scan.mjs $(git diff --cached --name-only --diff-filter=ACM | grep '\.md$')
```

회귀 방지용으로 쓰는 걸 권한다. 한 번 고친 표현이 다시 들어오는 걸 막는 데는
결정적인 검사가 필요하고, 그건 모델 판단으로는 안 되는 일이다.

## 네 층

```
scan.mjs   검출 · 측정 · 회귀 방지   결정적, 재현됨. 스스로 자라지는 못함
hook.mjs   작성 시점 강제           auto 만. 저장할 때마다 돈다
판정        비유·대구·3항 나열·구조    모델이 함. 판정 질문이 정해져 있음
mine.mjs   사전 성장                유일한 학습 경로
```

`scan.mjs` 결과를 사전에 되먹이지 않는다. grep 은 사전에 이미 있는 것만 찾으므로
정보 이득이 0이다. 사전이 커지는 통로는 `mine.mjs` 하나뿐이고,
그 입력은 **사람이 실제로 내린 교정 판단**이다.

## 세기만 하는 것

피동 · 가능표현 · `에 대해` · 복수 `~들` · 볼드 개수 · 문장 길이 편차.

개별 히트가 틀린 게 아니라 밀도가 문제인 패턴이라, 사전에 넣으면 오탐이 쏟아진다.
세어서 보고만 하고 판단은 사람이 한다.

볼드는 개수만 세지만 **연속과 길이는 항목으로 낸다.** 문단 첫머리 볼드가
셋 이상 이어지거나 볼드 안이 40자를 넘으면 위치가 특정되기 때문이다.

임계값은 관측치이지 절대 기준이 아니다. 자기 글로 재서 조정하는 게 맞다.

## 스캔이 못 보는 것

절마다 교훈으로 닫는 구조와, 같은 대상을 문장마다 다른 이름으로 부르는 습관.
둘 다 문서 전체를 봐야 하는 것이라 정규식으로 안 잡힌다.

`SKILL.md` 2단계가 본문을 직접 읽도록 강제하고, 해당 없어도 보고에 한 줄 적게 한다.
확인했다는 표시가 없으면 건너뛴 것과 구분이 안 된다.

## 사전에 기여하기

`references/lexicon.md` 에 PR 을 보내면 된다. 표 한 줄이면 충분하다.

```
| 패턴 | 대안 | auto 또는 context | 비고 |
```

`auto` 는 문맥과 무관하게 거의 항상 과한 것, `context` 는 정당한 용법이 있는 것이다.
애매하면 `context` 로 넣는다. 오탐 하나가 도구 전체의 신뢰를 깎는다.

넣기 전에 `--selfcheck` 를 돌린다. 대안 칸이 다른 규칙에 걸리면 사전 버그다.
한자어를 빼면서 비유로 채우는 사고를 문서 재실행이 아니라 여기서 잡는다.

## 라이선스

MIT
