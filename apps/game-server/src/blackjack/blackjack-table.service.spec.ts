import {
  BlackjackTableError,
  BlackjackTableService,
} from './blackjack-table.service';

const alice = {
  userId: 'user-alice',
  nickname: 'Alice',
  role: 'USER' as const,
};

const bob = {
  userId: 'user-bob',
  nickname: 'Bob',
  role: 'USER' as const,
};

describe('BlackjackTableService', () => {
  it('broadcasts shared state as users join and take seats', () => {
    const service = new BlackjackTableService();

    service.joinTable({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
    });
    service.joinTable({
      tableId: 'table-1',
      socketId: 'socket-bob',
      user: bob,
    });

    const aliceSeat = service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    const bobSeat = service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-bob',
      user: bob,
      seatNo: 2,
    });

    expect(aliceSeat.event.type).toBe('SEAT_TAKEN');
    expect(bobSeat.state.seats).toEqual([
      {
        seatNo: 1,
        userId: 'user-alice',
        nickname: 'Alice',
        status: 'OCCUPIED',
        connected: true,
        betAmount: null,
      },
      {
        seatNo: 2,
        userId: 'user-bob',
        nickname: 'Bob',
        status: 'OCCUPIED',
        connected: true,
        betAmount: null,
      },
    ]);
  });

  it('allows one user to occupy multiple seats', () => {
    const service = new BlackjackTableService();

    service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });
    const secondSeat = service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 2,
    });

    expect(secondSeat.state.seats).toHaveLength(2);
    expect(secondSeat.state.seats.map((seat) => seat.userId)).toEqual([
      'user-alice',
      'user-alice',
    ]);
  });

  it('rejects taking a seat occupied by another user', () => {
    const service = new BlackjackTableService();

    service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });

    expect(() =>
      service.takeSeat({
        tableId: 'table-1',
        socketId: 'socket-bob',
        user: bob,
        seatNo: 1,
      }),
    ).toThrow(BlackjackTableError);
  });

  it('marks seats disconnected without removing them', () => {
    const service = new BlackjackTableService();

    service.takeSeat({
      tableId: 'table-1',
      socketId: 'socket-alice',
      user: alice,
      seatNo: 1,
    });

    const [disconnectUpdate] = service.disconnectSocket('socket-alice');

    expect(disconnectUpdate?.event.type).toBe('PLAYER_DISCONNECTED');
    expect(disconnectUpdate?.state.seats).toEqual([
      {
        seatNo: 1,
        userId: 'user-alice',
        nickname: 'Alice',
        status: 'OCCUPIED',
        connected: false,
        betAmount: null,
      },
    ]);
  });
});
