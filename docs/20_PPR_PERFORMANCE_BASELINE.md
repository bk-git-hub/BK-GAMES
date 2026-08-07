# PPR 적용 전·중간 성능 기준선

- 측정일: 2026-08-07
- 측정 대상: `apps/web`
- 관련 계획: [19_NEXT16_PPR_ADOPTION_PLAN.md](./19_NEXT16_PPR_ADOPTION_PLAN.md)

## 1. 결론

PPR 관련 작업 전 버전과 Phase 1·2 적용 버전을 동일한 production 환경에서 비교했다.

```text
baseline: ca1a1cc  docs: add Next.js PPR adoption plan
current:  b3aac87  refactor(web): isolate home dynamic content
```

현재 단계의 결과는 다음과 같다.

- 750ms 지연 환경의 warm-prefetch `/ → /auth` navigation commit p75가 `881ms → 400ms`로 `54.6%` 빨라졌다.
- 실제 인증 폼 준비 p75는 `922ms → 1,197ms`로 `29.8%` 느려졌다. 즉, 목적지 반응은 빨라졌지만 실제 콘텐츠 완료는 아직 개선되지 않았다.
- current에서 15회 중 3회의 prefetch miss 또는 자동화 이상치가 발생해 navigation commit p95가 `907ms → 3,341ms`로 악화됐다.
- localhost 직접 요청에서는 fallback RSC payload 증가 때문에 `/` 응답 크기가 `22.2%`, `/auth`가 `33.7%` 늘었다.
- route별 client JS raw size는 모든 경로에서 동일했다. 현재 작업은 JS 최적화가 아니라 loading shell과 streaming 경계 개선이다.
- 보호된 게임에 비로그인 직접 접근할 때 HTTP 상태가 `307 → 200`으로 바뀌었다. loading shell이 먼저 streaming된 후 redirect되기 때문이며, 보안 우회는 아니지만 모니터링과 SEO 관점에서 추적해야 한다.

따라서 Phase 1·2는 “클릭 후 목적지가 반응하지 않는 느낌”을 p75 기준으로 개선했지만, content-ready와 p95 안정성은 아직 개선하지 못했다. Cache Components 활성화 전의 중간 기준선으로 기록한다.

## 2. 측정 환경

| 항목      | 값                                                   |
| --------- | ---------------------------------------------------- |
| OS        | Windows 11 Pro `10.0.26200`                          |
| CPU       | Intel Core i7-8750H, 6 cores / 12 logical processors |
| Memory    | 15.7 GiB                                             |
| Node.js   | `v24.14.0`                                           |
| pnpm      | `10.30.3`                                            |
| Next.js   | `16.2.7`, Turbopack production build                 |
| React     | `19.2.4`                                             |
| Browser   | Codex in-app browser                                 |
| 인증 상태 | guest only                                           |

로그인 자격증명을 사용하지 않았기 때문에 실제 지갑 DB 조회와 로그인된 게임 진입 성능은 이번 기준선에 포함하지 않았다.

## 3. 버전 격리와 worktree 관리

현재 main checkout을 변경하지 않고 다음 detached worktree를 임시 생성했다.

```text
C:\Users\bksoft\Documents\BK-Games-benchmark-worktrees\baseline-ca1a1cc
C:\Users\bksoft\Documents\BK-Games-benchmark-worktrees\current-b3aac87
```

각 worktree에서 동일한 lockfile과 환경 파일로 다음 명령을 실행했다.

```powershell
corepack pnpm install --frozen-lockfile --offline
corepack pnpm --filter web build
corepack pnpm --filter web exec next start -p <port>
```

측정 후 다음을 확인했다.

```text
[x] baseline/current production 서버 종료
[x] 지연 프록시 종료
[x] 3100, 3200, 3300, 3400 포트 해제
[x] 임시 worktree 등록 제거
[x] 임시 node_modules, .next, 환경 파일 제거
[x] 임시 지연 프록시 파일 제거
[x] benchmark 상위 디렉터리 제거
[x] git worktree list에 main만 존재
[x] 현재 branch = main
[x] 현재 HEAD = b3aac87
```

pnpm junction과 Windows long-path 때문에 `git worktree remove` 후 파일 잔여물이 발생했다. 외부 pnpm store를 따라가거나 삭제하지 않도록 reparse point를 따라가지 않는 방식으로 benchmark 전용 경로의 잔여물만 제거했다.

## 4. 측정 A: localhost 직접 HTTP 응답

### 4.1 방법

- baseline `3100`, current `3200` 포트 사용
- 각 경로와 버전마다 warm-up 3회
- 본 측정 25회
- baseline/current 요청을 교차 실행해 시간 편향 축소
- 매 요청에 cache-busting query 추가
- HTTP/1.1, compression 활성화
- redirect를 따라가지 않고 최초 응답 상태 기록
- percentile은 nearest-rank 방식 사용

측정 형식:

```powershell
curl.exe --http1.1 --compressed -sS -o NUL `
  -w '%{http_code},%{time_starttransfer},%{time_total},%{size_download}' `
  '<URL>?bench=<unique-id>'
```

### 4.2 전체 결과

| Route              | Version  | Status | TTFB p50 | TTFB p75 | TTFB p95 | Total p50 | Total p75 | Total p95 | Response p50 |
| ------------------ | -------- | -----: | -------: | -------: | -------: | --------: | --------: | --------: | -----------: |
| `/`                | baseline |    200 |  11.80ms |  12.28ms |  13.36ms |   15.55ms |   16.90ms |   18.42ms |      11,252B |
| `/`                | current  |    200 |  12.73ms |  14.32ms |  16.06ms |   17.59ms |   19.30ms |   21.83ms |      13,747B |
| `/auth`            | baseline |    200 |   9.13ms |   9.89ms |  10.49ms |   11.68ms |   12.68ms |   13.45ms |       7,770B |
| `/auth`            | current  |    200 |  10.76ms |  11.68ms |  28.14ms |   13.95ms |   14.85ms |   31.09ms |      10,390B |
| `/blackjack`       | baseline |    307 |   9.03ms |   9.90ms |  10.63ms |   11.00ms |   11.73ms |   12.69ms |       2,700B |
| `/blackjack`       | current  |    200 |   8.86ms |   9.48ms |  19.60ms |   11.59ms |   12.43ms |   22.20ms |       5,470B |
| `/baccarat`        | baseline |    307 |   9.49ms |  10.27ms |  12.29ms |   11.46ms |   12.82ms |   14.74ms |       2,700B |
| `/baccarat`        | current  |    200 |   8.64ms |  10.07ms |  12.42ms |   11.52ms |   13.08ms |   18.27ms |       5,472B |
| `/racing/bk-derby` | baseline |    200 |   3.82ms |   4.01ms |   4.65ms |    4.12ms |    4.35ms |    5.04ms |       4,402B |
| `/racing/bk-derby` | current  |    200 |   4.25ms |   4.50ms |   4.78ms |    4.59ms |    4.83ms |    5.19ms |       6,055B |

### 4.3 직접 HTTP 변화

| 지표               |                          변화 |
| ------------------ | ----------------------------: |
| 홈 TTFB p75        | `12.28ms → 14.32ms`, `+16.6%` |
| 홈 total p75       | `16.90ms → 19.30ms`, `+14.2%` |
| 홈 response p50    | `11,252B → 13,747B`, `+22.2%` |
| Auth TTFB p75      |  `9.89ms → 11.68ms`, `+18.1%` |
| Auth total p75     | `12.68ms → 14.85ms`, `+17.1%` |
| Auth response p50  |  `7,770B → 10,390B`, `+33.7%` |
| Derby response p50 |   `4,402B → 6,055B`, `+37.6%` |

현재 localhost guest 세션 조회는 매우 빠르기 때문에 dynamic work를 fallback으로 분리한 이점보다 추가 RSC shell 크기가 더 크게 측정됐다. 이 결과를 실제 사용자 환경의 TTFB 개선으로 해석하면 안 된다.

## 5. 측정 B: 750ms 지연 warm-prefetch navigation

### 5.1 목적

`loading.tsx`의 핵심 효과는 동적 목적지 전체를 기다리지 않고 prefetched fallback으로 먼저 이동하는 것이다. localhost 직접 요청만으로는 이 효과를 관측하기 어려워 `/auth` 요청에 동일한 750ms 지연을 적용했다.

### 5.2 방법

- baseline proxy `3300 → 3100`
- current proxy `3400 → 3200`
- `/auth`로 시작하는 요청만 750ms 지연
- 홈 로드 후 1,200ms 동안 viewport link prefetch 대기
- `/ → /auth` 클릭
- navigation `commit`과 실제 인증 `form` visible 시점 측정
- baseline/current 교차 실행
- 각 버전 15회
- browser control 계층의 고정 오버헤드는 두 버전에 동일하게 포함

`commit`은 URL과 목적지 route가 적용되어 사용자가 화면 전환을 인지할 수 있는 시점이다. `content ready`는 실제 Auth form이 visible한 시점이다.

### 5.3 결과

| 지표                           | Baseline | Current |      변화 |
| ------------------------------ | -------: | ------: | --------: |
| Navigation commit p50          |    872ms |   352ms |  `-59.6%` |
| Navigation commit p75          |    881ms |   400ms |  `-54.6%` |
| Navigation commit p95          |    907ms | 3,341ms | `+268.4%` |
| Content ready p50              |    912ms |   938ms |   `+2.9%` |
| Content ready p75              |    922ms | 1,197ms |  `+29.8%` |
| Content ready p95              |    965ms | 3,384ms | `+250.7%` |
| Commit 순간 loading shell 관측 |     0/15 |    9/15 |      +9회 |

### 5.4 해석

정상적인 prefetched navigation에서는 current가 baseline보다 약 480–520ms 먼저 목적지 화면에 반응했다. p75 commit이 54.6% 개선된 것은 loading shell 도입 목적과 일치한다.

다만 current 15회 중 3회에서 약 3.3초의 prefetch miss 또는 브라우저 자동화 이상치가 관측됐다. 이 때문에 p95는 크게 악화됐다. 또한 fallback을 먼저 보여주는 대신 실제 콘텐츠 완료 p75는 느려졌다.

따라서 현 단계의 평가를 다음처럼 제한한다.

```text
p50/p75 perceived response: 개선
content-ready: 미개선 또는 악화
p95 stability: 악화
원인 확정: 아직 불가
```

Phase 3과 Cache Components 활성화 후 같은 750ms 시나리오를 재측정해 outlier가 framework prefetch heuristic, Activity route 보존, 측정 도구, 또는 앱 구조 중 어디에서 발생하는지 좁혀야 한다.

## 6. 측정 C: route별 client JS

Next.js client reference manifest의 route별 chunk를 중복 제거한 뒤 `.next/static/chunks`의 raw bytes를 합산했다.

| Route              |           Baseline |            Current | 변화 |
| ------------------ | -----------------: | -----------------: | ---: |
| `/`                | 146.9KiB, 5 chunks | 146.9KiB, 5 chunks |    0 |
| `/auth`            | 170.3KiB, 6 chunks | 170.3KiB, 6 chunks |    0 |
| `/blackjack`       | 218.2KiB, 6 chunks | 218.2KiB, 6 chunks |    0 |
| `/baccarat`        | 201.2KiB, 6 chunks | 201.2KiB, 6 chunks |    0 |
| `/racing/bk-derby` | 162.3KiB, 5 chunks | 162.3KiB, 5 chunks |    0 |

loading shell과 홈 personalization은 Server Component이므로 client JS가 늘지 않았다. 이는 의도한 결과다.

이 값은 raw chunk 합계이며 압축 transfer size나 실제 실행 비용이 아니다. 공유 chunk를 포함하므로 route 간 값을 단순 합산하지 않는다.

## 7. HTTP status 변화

비로그인 상태에서 보호된 게임 직접 접근 결과가 변경됐다.

```text
baseline /blackjack, /baccarat → HTTP 307 redirect
current  /blackjack, /baccarat → HTTP 200 streamed response + client/meta redirect
```

Next.js는 Suspense fallback 또는 `loading.tsx`가 먼저 streaming되면 response header를 이미 보냈기 때문에 이후 redirect의 HTTP status를 바꿀 수 없다. 사용자는 계속 `/auth`로 이동하며 보호된 데이터는 렌더링되지 않았지만 다음 항목에 영향이 있을 수 있다.

- uptime monitor의 status 기반 판정
- access log와 redirect metric
- 검색 엔진 및 crawler 해석
- CDN 또는 proxy cache 정책

Phase 3에서 인증 검사를 어느 streaming boundary에 둘지 결정할 때 이 변화를 acceptance criteria에 포함한다.

## 8. 이번 측정으로 확정된 기준선

```text
[x] 변경 전 commit을 재현 가능한 기준으로 고정
[x] localhost HTTP TTFB/total/bytes 25회 측정
[x] 지연 client navigation 15회 측정
[x] route별 raw client JS 측정
[x] p50/p75 개선과 p95 회귀를 모두 기록
[x] HTTP 307 → 200 status 변화를 기록
[x] 임시 worktree와 서버를 모두 정리
```

## 9. 다음 재측정 조건

다음 단계가 완료될 때마다 같은 조건으로 측정한다.

```text
Checkpoint 1: Phase 3 인증 게임 entry streaming
Checkpoint 2: cacheComponents 활성화
Checkpoint 3: Activity/socket lifecycle 검증
Checkpoint 4: client bundle 분할
```

최종 PPR 완료 기준:

```text
navigation commit p75      baseline 대비 개선 유지
navigation commit p95      baseline 이하 또는 명확한 원인/허용 기준 확정
content ready p75/p95      baseline 대비 악화 금지
client JS                  PPR 단계에서 증가 금지
개인 데이터 static 노출    0건
socket/polling 중복        0건
보호 경로 redirect 의미    의도된 방식으로 문서화 및 검증
```

## 10. 측정 한계

- guest session만 측정했다.
- production 서버와 브라우저가 같은 PC에서 실행됐다.
- 인위적 750ms 지연은 실제 네트워크의 bandwidth, jitter, packet loss를 모두 재현하지 않는다.
- browser navigation 수치에는 browser control 계층의 고정 오버헤드가 포함된다.
- 15회 표본의 p95는 outlier에 민감하다.
- Core Web Vitals의 실제 사용자 분포를 대체하지 않는다.
- 기존 production 트래픽의 RUM 데이터는 사용하지 않았다.

이 문서는 절대 성능 보증이 아니라 동일 장비·동일 조건에서 다음 구현 단계와 비교하기 위한 engineering baseline이다.
