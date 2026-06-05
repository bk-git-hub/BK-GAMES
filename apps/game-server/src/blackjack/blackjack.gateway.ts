import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/blackjack',
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class BlackjackGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('table:join')
  handleTableJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { tableId: string },
  ) {
    void socket.join(`table:${body.tableId}`);
    socket.emit('table:state', {
      tableId: body.tableId,
      status: 'OPEN',
      phase: 'WAITING',
      seats: [],
      dealer: { cards: [], visibleScore: null, score: null },
      round: null,
      timers: { phaseEndsAt: null, turnEndsAt: null },
    });
  }
}
