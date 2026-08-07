# Next.js 16 PPR 도입 계획과 성능 목표

작성일: 2026-08-07  
대상: `apps/web`  
현재 버전: Next.js `16.2.7`, React `19.2.4`

## 1. 목적

현재 BK Games 웹 앱은 Next.js 16 App Router를 사용하지만 Cache Components와 Partial Prerendering(PPR)을 사용하지 않는다. 세션, 지갑, DB 조회가 페이지 전체 렌더링을 막고 있으며, 동적 라우트에 즉시 표시할 loading shell도 없다.

이 작업의 목표는 다음과 같다.

```text
페이지 이동 직후 정적 shell 또는 loading shell을 표시한다.
세션·지갑·실시간 상태만 요청 시점에 렌더링한다.
공개 UI가 개인화 데이터 때문에 함께 지연되지 않도록 한다.
인증·지갑·socket 보안 계약은 변경하지 않는다.
PPR 적용 전후를 재현 가능한 수치로 비교한다.
```

Next.js 16에서는 과거의 `experimental.ppr` 대신 `cacheComponents: true`를 사용한다. Cache Components를 활성화하면 정적·캐시·동적 콘텐츠를 같은 라우트에 구성할 수 있고, 동적 부분은 `Suspense` fallback을 정적 shell에 포함해 요청 시 스트리밍한다.

공식 문서:

- [Cache Components](https://nextjs.org/docs/app/getting-started/partial-prerendering)
- [cacheComponents 설정](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- [Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating)
- [loading.tsx](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
- [Authentication](https://nextjs.org/docs/app/guides/authentication)

## 2. 현재 기준선

아래 값은 2026-08-07 저장소와 기존 `apps/web/.next` 프로덕션 빌드 산출물을 기준으로 집계했다.

### 2.1 렌더링과 내비게이션

| 지표                             |  현재 값 | 해석                                                        |
| -------------------------------- | -------: | ----------------------------------------------------------- |
| 주요 사용자 페이지               |      5개 | `/`, `/auth`, `/blackjack`, `/baccarat`, `/racing/bk-derby` |
| 완전 사전 렌더 페이지            | 1/5, 20% | 기존 prerender manifest 기준 `/racing/bk-derby`만 해당      |
| 요청 시점 데이터에 묶인 페이지   | 4/5, 80% | 홈, 인증, Blackjack, Baccarat                               |
| `loading.tsx`                    |      0개 | 동적 목적지의 prefetched fallback 없음                      |
| 명시적 `Suspense` 사용 파일      |      0개 | 동적 구간별 streaming 경계 없음                             |
| 세션을 직접 조회하는 페이지      |      4개 | 홈, 인증, Blackjack, Baccarat                               |
| 세션과 DB를 함께 기다리는 페이지 |      3개 | 홈, Blackjack, Baccarat                                     |
| 내부 경로를 사용하는 일반 `<a>`  |      1개 | Derby의 `/auth` 이동이 전체 navigation을 유발               |

`/lobby`는 화면을 렌더링하지 않고 `/`로 redirect하는 호환 라우트이므로 주요 페이지 집계에서 제외한다.

### 2.2 클라이언트 코드 규모

| 지표                                   |  현재 값 |
| -------------------------------------- | -------: |
| `apps/web/src/app` TS/TSX 파일         |     26개 |
| `apps/web/src/app` TS/TSX 총 라인      | 10,226줄 |
| Client Component 또는 client hook 파일 |      7개 |
| Derby 메인 Client Component            |  3,632줄 |
| Blackjack 메인 Client Component        |  2,128줄 |
| Baccarat 메인 Client Component         |  1,718줄 |
| 게임 메인 Client Component 3개 합계    |  7,478줄 |
| 위 3개가 app TS/TSX에서 차지하는 비율  | 약 73.1% |

이 수치는 PPR만으로 모든 체감 성능 문제가 해결되지는 않는다는 근거다. PPR은 서버 응답을 기다리는 빈 화면을 줄이지만, 대형 Client Component의 다운로드·파싱·hydration 비용은 별도 번들 최적화가 필요하다.

### 2.3 현재 요청 흐름

```text
홈
searchParams → session → account/wallet DB → 전체 페이지 표시

Blackjack / Baccarat
session → ensureUserGameAccount DB → 전체 Client Component 표시

Auth
session → redirect 판단 → 로그인 화면 표시
```

홈의 공개 게임 목록과 게임 화면의 비개인화 배경까지 동적 데이터에 묶여 있다는 점이 가장 큰 구조적 병목이다.

## 3. 수치 목표

다음 값은 구현 완료의 acceptance criteria다. 시간 기반 지표는 개발 PC의 production build를 동일 조건에서 10회 이상 측정해 p75로 비교한다.

| 지표                               |      현재 |              1차 목표 | 비고                                                        |
| ---------------------------------- | --------: | --------------------: | ----------------------------------------------------------- |
| 즉시 표시 가능한 주요 라우트 shell |  1/5, 20% |             5/5, 100% | 정적 shell 또는 prefetched loading shell                    |
| `loading.tsx` 적용 주요 라우트     |   0/5, 0% |             5/5, 100% | 루트 포함 라우트별 의미 있는 skeleton                       |
| 동적 데이터의 명시적 경계          |       0개 | 필요한 모든 접근 100% | `headers`, `searchParams`, DB 접근을 `Suspense` 안으로 격리 |
| 클릭 후 최초 시각 반응             |    미측정 |        p75 100ms 이하 | shell 또는 fallback이 보이는 시점                           |
| 클릭 후 500ms 이상 무반응 전환     |    미측정 |                   0회 | Slow 3G와 인위적 서버 지연에서도 확인                       |
| PPR 빌드 오류                      | 해당 없음 |                   0개 | uncached data outside Suspense 포함                         |
| 정적 HTML의 개인 데이터 노출       |  0건 유지 |                   0건 | 이메일, 이름, 지갑, claim 상태 포함 금지                    |
| 화면 복귀 후 socket/polling 중복   |    미측정 |                   0건 | React Activity 수명주기 검증                                |
| 내부 링크의 hard navigation        |       1개 |                   0개 | 내부 이동은 `Link` 또는 router 사용                         |

`100ms`는 서버 데이터가 모두 준비되는 목표가 아니라 사용자가 클릭에 대한 반응을 확인하는 목표다. 실제 계정·지갑·게임 상태는 fallback 이후 스트리밍되거나 클라이언트에서 동기화될 수 있다.

번들 크기와 hydration 시간은 먼저 route별 baseline을 측정한 뒤 별도 목표를 확정한다. PPR 커밋에 근거 없는 번들 절감률을 acceptance criteria로 포함하지 않는다.

## 4. 목표 렌더링 구조

### 4.1 홈 `/`

```text
Home static shell
├─ 배경, 브랜드, 제목                  static
├─ GameList                           static
├─ Suspense
│  └─ SessionHeader                   request-time
└─ Suspense
   └─ AccountRewardPanel              request-time
      ├─ session
      ├─ wallet
      ├─ daily reward claim
      └─ searchParams feedback
```

기대 효과:

- 현재 동적 페이지 1개를 static shell + dynamic island 구조로 전환한다.
- 게임 목록은 세션과 DB 응답 시간을 기다리지 않고 표시한다.
- 헤더와 지갑 패널을 독립 경계로 두어 가능한 작업을 병렬화한다.

### 4.2 Blackjack `/blackjack`, Baccarat `/baccarat`

```text
Game static shell
├─ 게임 배경, 테이블 프레임, 제목      static
└─ Suspense + route skeleton
   └─ AuthenticatedGame               request-time
      ├─ session 검증
      ├─ 미인증 redirect
      ├─ ensureUserGameAccount
      └─ 실제 Client Component
```

인증 검사는 공용 layout으로 올리지 않는다. 부분 렌더링에서는 layout이 모든 navigation마다 다시 실행된다고 보장할 수 없으므로, 세션 검증은 민감 데이터 접근 지점 가까이에 둔다.

### 4.3 인증 `/auth`

로그인 화면의 비개인화 shell을 즉시 표시하고 기존 세션 검증과 로그인 사용자 redirect를 동적 경계로 분리한다. 이미 로그인한 사용자가 로그인 폼을 순간적으로 보는 현상을 막기 위해 인증 확인 상태와 동일한 형태의 fallback을 사용한다.

### 4.4 Derby `/racing/bk-derby`

현재 이미 완전 사전 렌더되는 페이지이므로 PPR 자체의 추가 이득은 작다. 다음 두 항목에 집중한다.

- route loading shell을 추가해 아직 프리페치되지 않은 이동에도 즉시 반응한다.
- `/auth`의 일반 `<a>`를 Next.js `Link`로 바꿔 hard navigation 1건을 제거한다.

Derby의 3,632줄 Client Component 분할은 PPR과 분리한 후속 성능 작업으로 다룬다.

## 5. 단계별 구현 계획

### Phase 0. 성능 기준선 고정

코드 변경 전에 production build에서 다음을 기록한다.

- 주요 경로별 click-to-first-feedback
- click-to-content-ready
- route별 client JS transfer size
- hydration 또는 long task 시간
- cold navigation과 prefetched navigation 각각 10회 이상
- 로그인/비로그인 상태 각각 측정

측정 조건을 문서에 함께 기록한다.

```text
브라우저와 버전
CPU throttling
네트워크 throttling
development 또는 production 여부
로그인 상태
프리페치 여부
측정 횟수와 p50/p75/p95
```

### Phase 1. 즉시 전환용 loading shell

예상 파일:

```text
apps/web/src/app/loading.tsx
apps/web/src/app/auth/loading.tsx
apps/web/src/app/blackjack/loading.tsx
apps/web/src/app/baccarat/loading.tsx
apps/web/src/app/racing/bk-derby/loading.tsx
필요한 route skeleton 컴포넌트
```

요구사항:

- 실제 화면과 비슷한 크기로 layout shift를 최소화한다.
- spinner만 표시하지 않고 목적지 화면의 구조를 보여준다.
- fallback에는 사용자별 데이터나 인증 상태를 포함하지 않는다.
- `cacheComponents` 활성화 전에도 독립적으로 검증하고 커밋한다.

### Phase 2. 홈 동적 island 분리

예상 변경:

- 홈의 정적 frame과 개인화 컴포넌트 분리
- `headers()`와 `searchParams` 접근을 가장 가까운 동적 컴포넌트로 이동
- 세션 헤더와 계정/보상 패널에 독립 `Suspense` 적용
- 정적 `GameList`를 동적 경계 밖에 유지

캐시 정책:

```text
GameList의 현재 코드 상수          별도 cache 지시어 불필요
session                           공유 캐시 금지
wallet balance                    공유 캐시 금지
daily reward claim                공유 캐시 금지
ensureUserGameAccount             prerender/cache 금지
실시간 table state                prerender/cache 금지
```

### Phase 3. 인증 게임 entry streaming

Blackjack과 Baccarat 각각에서 정적 게임 shell과 인증된 실제 게임 컴포넌트를 분리한다.

검증 항목:

- 비로그인 직접 접근은 계속 `/auth`로 이동한다.
- 이메일, 이름, 지갑 잔액은 static HTML에 포함되지 않는다.
- 인증 실패 시 게임 socket 연결을 시작하지 않는다.
- 지갑 초기값과 이후 `wallet:updated` 흐름은 변경하지 않는다.

### Phase 4. Cache Components 활성화

`apps/web/next.config.ts`에 다음 옵션을 추가한다.

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  // existing options
};
```

이 옵션은 앱 전체에 적용된다. 활성화한 뒤 모든 페이지와 Route Handler를 production build로 검사한다. `headers()`, `searchParams`, DB 접근처럼 prerender할 수 없는 작업이 `Suspense` 밖에 남아 있으면 빌드 오류를 해결한 후 커밋한다.

### Phase 5. Activity와 실시간 수명주기 검증

Cache Components는 client navigation 시 최근 페이지를 제거하지 않고 React Activity로 숨겨 상태를 보존할 수 있다. 화면이 숨겨질 때 effect가 정리되고 다시 보일 때 재실행되므로 다음을 확인한다.

- Blackjack/Baccarat socket disconnect와 reconnect가 각각 1회만 발생한다.
- 동일 event listener가 중복 등록되지 않는다.
- Derby interval, polling, animation, audio가 숨겨진 동안 정지한다.
- 복귀 후 서버 권위 상태로 재동기화된다.
- 뒤로 가기 후 폼과 UI 상태 보존이 의도와 일치한다.

### Phase 6. 별도 번들 최적화

PPR 완료 후 별도 작업 단위로 진행한다.

- 규칙 모달, 기록 패널 등 비핵심 UI 지연 로딩
- Derby 시뮬레이션과 대형 정적 데이터 분리
- Blackjack/Baccarat 화면 영역별 component 분할
- route별 client JS와 hydration baseline 재측정
- baseline 결과를 근거로 절감 목표 확정

## 6. 예상 커밋 단위

```text
feat(web): add instant route loading shells
refactor(web): isolate home dynamic content
refactor(web): stream authenticated game entry
feat(web): enable cache components
perf(web): verify navigation lifecycle and prefetching
```

한 커밋에서 loading shell, 렌더링 구조, 대형 Client Component 분할을 동시에 처리하지 않는다. 문제가 생겼을 때 PPR 경계 문제인지 bundle 문제인지 구분할 수 있어야 한다.

## 7. 검증 계획

### 7.1 자동 검증

```powershell
corepack pnpm --filter web typecheck
corepack pnpm --filter web lint
corepack pnpm --filter web build
```

build 결과에서 확인한다.

```text
[ ] 주요 페이지 5개 모두 즉시 표시 가능한 shell이 있는가?
[ ] Uncached data was accessed outside of <Suspense> 오류가 0개인가?
[ ] static HTML/RSC shell에 개인 데이터가 포함되지 않는가?
[ ] 기존 POST Route Handler가 정상 빌드되는가?
```

### 7.2 수동 시나리오

```text
비로그인: / → /auth → /
로그인:   / → /blackjack → / → /baccarat
관전:     / → /racing/bk-derby → /auth
복귀:     게임 → 홈 → 브라우저 뒤로 가기
보상:     claim → redirect → 갱신된 balance/claim 상태 확인
```

각 시나리오는 정상 네트워크와 Slow 3G에서 반복한다.

```text
[ ] 클릭 후 p75 100ms 안에 shell/fallback이 보이는가?
[ ] 500ms 이상 아무 반응이 없는 이동이 0회인가?
[ ] layout shift가 눈에 띄지 않는가?
[ ] socket, timer, polling이 중복되지 않는가?
[ ] 인증 redirect와 게임 진입 권한이 기존과 동일한가?
```

### 7.3 적용 전후 보고 표

구현 완료 보고에는 아래 표를 실측값으로 채운다.

| Route              | 상태      | First feedback p75 | Content ready p75 | Client JS | 비고                            |
| ------------------ | --------- | -----------------: | ----------------: | --------: | ------------------------------- |
| `/`                | guest     |                TBD |               TBD |       TBD | game list와 account island 분리 |
| `/`                | signed-in |                TBD |               TBD |       TBD | wallet DB 포함                  |
| `/auth`            | guest     |                TBD |               TBD |       TBD | session redirect 경계           |
| `/blackjack`       | signed-in |                TBD |               TBD |       TBD | socket reconnect 확인           |
| `/baccarat`        | signed-in |                TBD |               TBD |       TBD | socket reconnect 확인           |
| `/racing/bk-derby` | guest     |                TBD |               TBD |       TBD | 기존 static route               |

## 8. 위험과 롤백 기준

다음 중 하나라도 발생하면 해당 단계에서 중단하고 이전 커밋으로 롤백한다.

```text
정적 shell에 사용자 이메일, 이름, 지갑 정보가 포함됨
미인증 사용자가 보호된 게임 데이터에 접근 가능
socket listener 또는 polling 중복
보상 수령 후 stale wallet/claim 상태 유지
production build 실패
PPR 적용 후 click-to-first-feedback p75가 악화
```

`cacheComponents` 활성화가 원인이라면 우선 플래그 커밋만 되돌릴 수 있도록 구조 개선과 설정 변경을 별도 커밋으로 유지한다.

## 9. 범위에서 제외하는 것

```text
DB schema 변경
Better Auth 계약 변경
포인트/보상 정산 로직 변경
Socket event contract 변경
게임 서버 start/stop/restart
대형 게임 UI 전면 재작성
PPR과 무관한 디자인 변경
```

## 10. 기준선 재현 명령

```powershell
# 페이지 목록
rg --files apps/web/src/app -g 'page.tsx'

# loading/Suspense 경계
rg --files apps/web/src/app | rg '(^|\\)loading\.tsx$'
rg -l 'Suspense' apps/web/src/app -g '*.ts' -g '*.tsx'

# Client Component 파일
rg -l 'use client' apps/web/src/app -g '*.ts' -g '*.tsx'

# 앱 코드 라인 집계
$files = rg --files apps/web/src/app -g '*.ts' -g '*.tsx'
$files | ForEach-Object {
  [PSCustomObject]@{
    File = $_
    Lines = (Get-Content -LiteralPath $_ | Measure-Object -Line).Lines
  }
} | Sort-Object Lines -Descending

# 기존 production build의 prerender route
$manifest = Get-Content apps/web/.next/prerender-manifest.json -Raw |
  ConvertFrom-Json
$manifest.routes.PSObject.Properties.Name
```

기존 `.next`가 오래된 산출물일 수 있으므로 실제 구현 시작 시 `corepack pnpm --filter web build`로 기준선을 새로 생성하고 commit hash와 함께 기록한다.
