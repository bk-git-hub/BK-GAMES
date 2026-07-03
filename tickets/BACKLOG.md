# Ticket Backlog

이 파일은 사람이 우선순위를 정리하는 큐다. 티켓 상태의 source of truth는 각 `tickets/BK-*.md` frontmatter이고, 전체 상황판은 `tickets/BOARD.md`다.

## Queue Policy

- 티켓은 작게 만든다. 한 티켓은 한 thread가 끝까지 처리할 수 있어야 한다.
- DB schema, 인증, 포인트 정산, socket contract 변경 티켓은 제목과 scope에 반드시 표시한다.
- 공유 파일 변경이 예상되면 `Expected Files`에 미리 적는다.
- 티켓을 발행하거나 상태를 바꾼 뒤에는 `node scripts/update-ticket-board.mjs`로 상황판을 재생성한다.

## Next Candidates

- 게임별 남은 백엔드 work를 작은 티켓으로 쪼개기
- racing frontend의 server-authoritative tick 렌더링 정리
- admin UI polish 티켓화
- deterministic blackjack E2E seeded-shoe test harness 티켓화

## Parking Lot

- 외부 티켓 시스템 연동
- 웹 UI 기반 티켓 대시보드
- 자동 Codex thread 생성과 티켓 할당
