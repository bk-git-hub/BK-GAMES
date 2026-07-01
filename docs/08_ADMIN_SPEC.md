# Admin Spec

상점 제외 MVP 기준 관리자 기능이다.

---

## 1. 관리자 목표

관리자는 다음을 확인하고 조치할 수 있어야 한다.

- 유저 목록
- 유저 포인트 잔액
- 포인트 원장
- 일일 보상 수령 기록
- 블랙잭 라운드 로그
- 라운드별 참여자/정산 결과
- 메인 테이블 상태
- 테이블 pause/resume
- 포인트 수동 조정
- 감사 로그

---

## 2. 관리자 페이지 구조

```text
/admin
/admin/users
/admin/users/:userId
/admin/points
/admin/blackjack/rounds
/admin/blackjack/rounds/:roundId
/admin/blackjack/table
/admin/audit-logs
```

---

## 3. 대시보드 카드

| 카드 | 설명 |
|---|---|
| 총 유저 수 | 전체 가입자 |
| 오늘 접속 유저 | 오늘 접속/플레이 유저 |
| 오늘 보상 수령 | daily reward claim 수 |
| 현재 테이블 접속자 | socket 접속자 |
| 현재 착석 유저 | seat 점유 수 |
| 오늘 라운드 수 | blackjack_rounds 수 |
| 오늘 총 베팅량 | BET 합계 |
| 오늘 순지급량 | payout - bet 합계 |

---

## 4. 메인 테이블 관리

기능:

- 테이블 상태 조회
- 현재 좌석 상태 조회
- 현재 라운드 상태 조회
- 테이블 일시정지
- 테이블 재개
- 비정상 라운드 취소

### pause

```text
테이블을 PAUSED로 변경한다.
현재 라운드는 가능하면 정상 종료한다.
새 라운드는 시작하지 않는다.
```

### resume

```text
테이블을 OPEN으로 변경한다.
조건이 맞으면 다음 라운드를 시작한다.
```

---

## 5. 포인트 조정

관리자 포인트 조정은 사유가 필수다.

```text
amount
reason
```

정책:

- 음수 조정 시 잔액이 0 미만이 되면 실패
- PointLedger 기록
- AdminAuditLog 기록

---

## 6. 감사 로그 대상

다음 작업은 반드시 감사 로그를 남긴다.

- 포인트 조정
- 유저 정지
- 유저 정지 해제
- 테이블 pause
- 테이블 resume
- 라운드 취소
- 환불 처리

---

## 7. MVP 제외 관리자 기능

상점이 제외되므로 다음 관리자 기능도 제외한다.

- 아이템 생성
- 아이템 수정
- 아이템 비활성화
- 유저 인벤토리 조회
- 아이템 지급
- 상점 매출 지표
