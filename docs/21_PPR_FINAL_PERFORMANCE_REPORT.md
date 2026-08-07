# Next.js 16 PPR 최종 성능 보고서

- 측정일: 2026-08-07
- 대상: `apps/web`
- 최초 기준선: `ca1a1cc`
- Cache Components: `6a9a8b4`
- Phase 6 구현: `3059089`
- 관련 계획: [19_NEXT16_PPR_ADOPTION_PLAN.md](./19_NEXT16_PPR_ADOPTION_PLAN.md)
- 이전 기준선: [20_PPR_PERFORMANCE_BASELINE.md](./20_PPR_PERFORMANCE_BASELINE.md)

## 1. 결론

Next.js 16 `cacheComponents`를 활성화했고, 모든 사용자 페이지가 Partial Prerender 경로로 빌드된다.

```text
◐ /
◐ /auth
◐ /blackjack
◐ /baccarat
◐ /lobby
◐ /racing/bk-derby
```

최종 결과는 다음과 같다.

- 750ms 지연 `/ → /auth` navigation commit p75가 `881ms → 510ms`로 42.1% 개선됐다.
- 같은 navigation commit p95가 `907ms → 610ms`로 32.7% 개선돼 중간 측정의 3초대 outlier 회귀가 사라졌다.
- 실제 Auth form 준비 p75는 `922ms → 1,004ms`로 8.9%, p95는 `965ms → 1,134ms`로 17.5% 느리다.
- Socket.IO를 hydration 이후 토큰 요청과 병렬로 로드해 게임 route 초기 JS를 20.7%에서 28.3% 줄였다.
- 최초 기준선과 비교하면 route별 초기 JS는 12.1%에서 37.5% 감소했다.
- localhost TTFB p75는 홈과 Auth에서 개선됐지만 streamed response의 total time과 응답 크기는 증가했다.
- Activity 왕복에서 Derby DOM은 하나만 보존됐고 숨겨진 동안 타이머와 오디오는 정지했으며 Auth form 입력 상태는 복원됐다.
- 실제 게임 서버가 응답하지 않아 socket disconnect/reconnect 횟수의 런타임 검증은 완료하지 못했다.

따라서 PPR의 핵심 목표인 빠른 목적지 반응과 p95 안정성, 초기 JS 감축은 달성했다. Auth content-ready와 실제 socket lifecycle은 push 전 추가 확인 항목이다.

## 2. 최종 구현

### 2.1 Cache Components

`apps/web/next.config.ts`에 다음 설정을 적용했다.

```ts
cacheComponents: true
```

Next.js 16의 Cache Components는 PPR, `use cache`, dynamic I/O 동작을 하나의 설정으로 활성화한다.

공식 문서:

- <https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents>
- <https://nextjs.org/docs/app/getting-started/partial-prerendering>

### 2.2 Auth 정적 shell과 세션 경계

`/auth`의 비개인화 shell을 세션 확인보다 먼저 렌더하고 아래 작업만 내부 `Suspense` 경계에서 수행한다.

```text
Auth static shell
└─ Suspense
   └─ AuthSessionGate
      ├─ headers/session 확인
      ├─ 로그인 사용자 redirect
      └─ guest AuthForm
```

route loading도 동일한 shell과 세션 확인 placeholder를 사용한다. 로그인 여부가 확정되기 전 실제 폼을 fallback으로 노출하지 않는다.

### 2.3 실시간 클라이언트 초기 JS 분리

Blackjack, Baccarat, BK Derby에서 Socket.IO 정적 import를 제거했다.

```text
이전: route 초기 JS에 Socket.IO 포함
현재: hydration effect에서 game token 요청과 Socket.IO import를 병렬 실행
```

소켓 URL, 인증 payload, transport, event listener, cleanup 계약은 변경하지 않았다.

## 3. 측정 환경과 방법

환경은 이전 기준선과 동일하다.

| 항목    | 값                                                   |
| ------- | ---------------------------------------------------- |
| OS      | Windows 11 Pro `10.0.26200`                          |
| CPU     | Intel Core i7-8750H, 6 cores / 12 logical processors |
| Memory  | 15.7 GiB                                             |
| Node.js | `v24.14.0`                                           |
| pnpm    | `10.30.3`                                            |
| Next.js | `16.2.7`, Turbopack production build                 |
| React   | `19.2.4`                                             |
| Browser | Codex in-app browser                                 |
| 인증    | guest                                                |

HTTP 측정:

- production build + `next start -p 3200`
- route별 warm-up 3회
- route별 25회
- cache-busting query
- HTTP/1.1 compression
- nearest-rank percentile

Navigation 측정:

- `3400 → 3200` 지연 proxy
- `/auth` 요청에 750ms 지연
- 홈 로드 후 1,200ms prefetch 대기
- 각 측정은 새 탭에서 실행
- 15회
- URL commit과 `Welcome back` heading 표시 시각 기록

## 4. localhost 직접 HTTP 결과

| Route              | Status | TTFB p50 | TTFB p75 | TTFB p95 | Total p50 | Total p75 | Total p95 | Response p50 |
| ------------------ | -----: | -------: | -------: | -------: | --------: | --------: | --------: | -----------: |
| `/`                |    200 |   4.31ms |   5.06ms |   7.48ms |   16.86ms |   18.66ms |   23.85ms |      14,464B |
| `/auth`            |    200 |   4.26ms |   5.90ms |   7.52ms |   16.01ms |   17.70ms |   25.28ms |      12,281B |
| `/blackjack`       |    200 |   4.31ms |   4.78ms |   5.60ms |   13.44ms |   16.44ms |   21.32ms |       6,607B |
| `/baccarat`        |    200 |   3.92ms |   4.45ms |   6.42ms |   11.72ms |   14.31ms |   19.71ms |       6,610B |
| `/racing/bk-derby` |    200 |   3.75ms |   4.30ms |   9.25ms |   12.58ms |   14.18ms |   20.96ms |       8,254B |

최초 기준선과 주요 차이:

| 지표                | Baseline | Final | 변화   |
| ------------------- | -------: | ----: | -----: |
| 홈 TTFB p75         |  12.28ms | 5.06ms | -58.8% |
| Auth TTFB p75       |   9.89ms | 5.90ms | -40.3% |
| 홈 total p75        |  16.90ms | 18.66ms | +10.4% |
| Auth total p75      |  12.68ms | 17.70ms | +39.6% |
| Derby total p75     |   4.35ms | 14.18ms | +226.0% |

PPR은 fallback을 먼저 보내 TTFB를 줄이지만 전체 stream 종료까지의 시간과 RSC payload를 늘릴 수 있다. localhost total time을 실제 네트워크의 사용자 체감과 동일하게 해석하지 않는다.

## 5. 750ms 지연 navigation 결과

| 지표                  | Baseline | Phase 1·2 | Phase 4·6 전 보완 | Final | Baseline 대비 |
| --------------------- | -------: | ---------: | -----------------: | ----: | ------------: |
| Navigation commit p50 |    872ms |      352ms |              562ms | 495ms |        -43.2% |
| Navigation commit p75 |    881ms |      400ms |              637ms | 510ms |        -42.1% |
| Navigation commit p95 |    907ms |    3,341ms |            1,059ms | 610ms |        -32.7% |
| Content ready p50     |    912ms |      938ms |            1,082ms | 947ms |         +3.8% |
| Content ready p75     |    922ms |    1,197ms |            1,194ms | 1,004ms |         +8.9% |
| Content ready p95     |    965ms |    3,384ms |            1,398ms | 1,134ms |        +17.5% |

해석:

- 목적지 반응 p75와 p95는 모두 최초 기준선보다 개선됐다.
- 중간 측정의 3초대 outlier는 재현되지 않았다.
- Auth shell/세션 경계 분리 후 보완 전 최종 구조 대비 content-ready p75가 15.9%, p95가 18.9% 개선됐다.
- 그래도 실제 Auth form 준비는 최초 기준선을 넘으므로 acceptance criteria의 `content ready 악화 금지`는 아직 충족하지 못했다.

## 6. route별 초기 Client JS

Next.js client reference manifest의 route entry chunk를 중복 제거하고 raw bytes를 합산했다.

| Route              | Baseline | Phase 4 | Final | Baseline 대비 | Phase 6 변화 |
| ------------------ | -------: | ------: | ----: | ------------: | -----------: |
| `/`                | 146.9KiB | 126.2KiB | 126.2KiB | -14.1% | 0 |
| `/auth`            | 170.3KiB | 149.7KiB | 149.7KiB | -12.1% | 0 |
| `/blackjack`       | 218.2KiB | 197.5KiB | 156.7KiB | -28.2% | -20.7% |
| `/baccarat`        | 201.2KiB | 180.6KiB | 139.8KiB | -30.5% | -22.6% |
| `/racing/bk-derby` | 162.3KiB | 141.5KiB | 101.4KiB | -37.5% | -28.3% |

규칙 패널만 동적 분리하는 실험은 바카라 초기 JS를 `180.6KiB → 182.0KiB`로 1.4KiB 늘려 폐기했다. 작은 컴포넌트는 dynamic loader와 관찰자 비용이 절감량보다 컸다.

## 7. Activity와 실시간 수명주기 검증

### 확인 완료

```text
[x] Derby → Home 이동 후 Derby DOM 1개 보존
[x] 숨김 2.2초 동안 Derby timer 문자열 정지
[x] 숨김 동안 Derby audio paused 유지
[x] Derby 복귀 후 중복 DOM 없음
[x] Auth → Home → Auth 왕복 후 입력값 보존
[x] Blackjack/Baccarat effect cleanup에서 abort + socket disconnect 확인
[x] Baccarat cleanup의 TABLE_LEAVE 전송 순서 유지
[x] Derby cleanup에서 interval/polling abort + socket disconnect 확인
```

### 미완료

```text
[ ] Blackjack socket disconnect/reconnect 각 1회 런타임 확인
[ ] Baccarat socket disconnect/reconnect 각 1회 런타임 확인
[ ] Derby guest socket/polling fallback에서 listener 중복 0건 확인
[ ] 복귀 후 최신 서버 권위 table state 재동기화 확인
```

미완료 사유:

- 로컬 `4000` 포트가 열려 있지 않다.
- `.env.local`의 `NEXT_PUBLIC_GAME_SERVER_URL=http://100.107.189.17:4000`도 health check가 timeout된다.
- 저장소 운영 규칙에 따라 에이전트가 game-server를 직접 시작하거나 종료하지 않았다.

## 8. Acceptance criteria

| 기준                         | 결과 | 상태 |
| ---------------------------- | ---- | ---- |
| navigation commit p75 개선   | `881ms → 510ms` | 통과 |
| navigation commit p95 개선   | `907ms → 610ms` | 통과 |
| content-ready p75 악화 금지  | `922ms → 1,004ms` | 미달 |
| content-ready p95 악화 금지  | `965ms → 1,134ms` | 미달 |
| 초기 client JS 증가 금지     | 전체 route 감소 | 통과 |
| 개인 데이터 static 노출 0건  | 정적 shell에 개인 데이터 없음 | 통과 |
| socket/polling 중복 0건       | 정적 audit 통과, runtime 미완료 | 보류 |
| production build             | 전체 PPR build 성공 | 통과 |

## 9. push 전 남은 확인과 이후 개선점

### push 전 필수

1. game-server를 수동 시작한다.
2. 로그인 세션으로 Blackjack과 Baccarat 왕복을 각각 3회 수행한다.
3. guest Derby 왕복을 3회 수행한다.
4. 연결 1개, listener 중복 0개, 복귀 후 최신 table version을 확인한다.
5. 문제가 없으면 이 문서의 보류 항목을 완료로 바꾸고 push한다.

### 후속 개선 후보

1. Auth content-ready 지연을 server timing과 RSC chunk arrival로 분해한다.
2. 750ms 고정 지연 외에 bandwidth와 jitter를 포함한 조건을 추가한다.
3. 실제 배포 환경에서 Navigation Timing과 Web Vitals RUM을 수집한다.
4. Derby의 4천 줄 Client Component를 UI, history, betting, simulation 계산 단위로 분리한다.
5. 동적 Socket.IO chunk가 hydration 이후 연결 완료까지 미치는 시간을 별도 측정한다.

현재 결과는 PPR shell 반응과 초기 JS 개선을 입증하지만, 실제 사용자 환경의 성능 보증이나 socket lifecycle 최종 승인으로 사용하면 안 된다.

## 10. PPR push 전 Vercel 배포 기준선

- 측정 URL: `https://bk-games-web.vercel.app`
- 측정 시점 원격 `main`: `26131d0`
- 배포 응답: `Server: Vercel`, `X-Vercel-Cache: MISS`
- 요청 경로: `icn1 → iad1`
- Cache-Control: `private, no-cache, no-store, max-age=0, must-revalidate`

Vercel 응답에는 commit SHA가 포함되지 않아 원격 `main`과 배포 artifact의 SHA가 동일한지는 Vercel dashboard에서 별도 확인해야 한다. 화면 동작과 원격 상태는 Cache Components push 전 버전과 일치했다.

### 10.1 Guest HTTP

측정 조건:

- route별 warm-up 5회
- route별 본 측정 30회
- route 순서를 교차해 시간 편향 축소
- cache-busting query
- HTTP/1.1 compression
- redirect를 따라가지 않고 최초 응답 기록

| Route              | Status | TTFB p50 | TTFB p75 | TTFB p95 | Total p50 | Total p75 | Total p95 | Response p50 |
| ------------------ | -----: | -------: | -------: | -------: | --------: | --------: | --------: | -----------: |
| `/`                |    200 | 272.27ms | 290.53ms | 328.54ms |  274.44ms |  308.53ms |  479.06ms |       7,945B |
| `/auth`            |    200 | 278.27ms | 289.31ms | 312.64ms |  282.67ms |  296.67ms |  314.33ms |       7,114B |
| `/blackjack`       |    200 | 280.29ms | 306.32ms | 345.11ms |  281.36ms |  307.12ms |  345.34ms |       3,549B |
| `/baccarat`        |    200 | 276.21ms | 300.27ms | 355.12ms |  277.57ms |  301.10ms |  357.02ms |       3,547B |
| `/racing/bk-derby` |    200 | 273.44ms | 281.19ms | 316.82ms |  275.18ms |  285.82ms |  454.02ms |       6,321B |

Guest HTTP는 인증 cookie 없이 측정했다. 브라우저 guest navigation은 signed-in 측정을 위해 동일 브라우저 세션을 로그인 상태로 전환했으므로 별도 반복하지 않았다.

### 10.2 Signed-in 홈 직접 로드

동일 인앱 브라우저의 로그인 세션으로 새 탭 20회를 측정했다.

| 지표                          | 성공 | p50 | p75 | p95 |
| ----------------------------- | ---: | --: | --: | --: |
| browser load 반환             | 20/20 | 770ms | 812ms | 872ms |
| 사용자명·지갑 개인화 표시     | 20/20 | 1,030ms | 1,076ms | 2,193ms |

개인화 p95는 최초 두 표본의 2초대 cold/outlier 영향을 받았다. 나머지 18개 표본은 `939ms`에서 `1,174ms` 범위였다.

### 10.3 Signed-in client navigation

각 표본은 다음 순서로 실행했다.

1. 새 탭에서 로그인 홈 로드
2. 사용자명·지갑 개인화 완료 확인
3. 1,200ms prefetch 대기
4. 게임 링크 클릭
5. URL commit과 게임 heading 표시 시각 기록

| Route        | 성공 | Commit p50 | Commit p75 | Commit p95 | UI ready p50 | UI ready p75 | UI ready p95 |
| ------------ | ---: | ---------: | ---------: | ---------: | -----------: | -----------: | -----------: |
| Blackjack    | 15/15 | 3,258ms | 3,298ms | 3,328ms | 3,296ms | 3,328ms | 3,358ms |
| Baccarat     | 14/15 | 3,307ms | 3,322ms | 3,377ms | 3,337ms | 3,383ms | 3,399ms |
| BK Derby     | 15/15 | 3,220ms | 3,246ms | 3,299ms | 3,296ms | 3,347ms | 3,377ms |

Baccarat 1회는 15초 안에 navigation 완료 신호를 받지 못했다. 추가 홈 왕복 확인에서도 URL은 `/baccarat`로 변경됐지만 navigation 완료 신호가 timeout되는 현상이 한 번 더 발생했다.

해석:

- 현재 배포의 보호 게임 전환은 일관되게 약 3.2초에서 3.4초가 걸린다.
- 현재 배포에는 `cacheComponents`가 없으므로 세션과 게임 계정 조회가 화면 전환 commit을 막는다.
- 로컬 PPR 최종 측정의 Auth navigation commit p75 `510ms`와 직접 비교하면 배포 signed-in 게임 전환의 개선 여지가 크다.
- 다만 route와 인증 상태가 다르므로 PPR 배포 후 동일 signed-in 게임 route를 다시 측정해야 실제 개선율을 확정할 수 있다.

### 10.4 로그인 상태와 실시간 연결

| 검증 항목 | 결과 |
| --------- | ---- |
| 홈 사용자명·지갑 표시 | 정상 |
| Derby 첫 실제 화면의 로그인 상태 | 15/15 정상 |
| Baccarat socket | `connected`, 최신 table state 수신 |
| Derby state | 현재 race, history, wallet 수신 |
| Blackjack socket | `timeout`, table state 미수신 |

Blackjack timeout은 페이지 UI 준비 시간과 분리된 배포 운영 문제다. PPR push 전후 측정에서 `UI ready`와 `realtime connected`를 별도 지표로 유지한다.

### 10.5 PPR 배포 후 동일 조건 재측정

```text
Guest HTTP                 route별 30회
Signed-in home             20회
Signed-in Blackjack        15회
Signed-in Baccarat         15회
Signed-in BK Derby         15회
Realtime connection        게임별 별도 상태와 완료 시간
Navigation timeout         성공률과 함께 기록
Vercel routing/cache       응답 header 재확인
```

동일한 배포 URL과 로그인 계정을 유지하고 PPR 커밋 push 후 위 표를 그대로 다시 채운다. 이 비교를 최종 배포 기준 성능 판단으로 사용한다.
