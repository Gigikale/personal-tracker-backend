import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

import { verifyAccessToken } from './jwt';

const connectionsByUserId = new Map<string, Set<WebSocket>>();

export function initRealtime(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/realtime' });

  wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');

    let userId: string;
    try {
      userId = verifyAccessToken(token ?? '').sub;
    } catch {
      socket.close(4001, 'Invalid or expired access token');
      return;
    }

    if (!connectionsByUserId.has(userId)) {
      connectionsByUserId.set(userId, new Set());
    }
    connectionsByUserId.get(userId)!.add(socket);

    socket.on('close', () => {
      const sockets = connectionsByUserId.get(userId);
      sockets?.delete(socket);
      if (sockets && sockets.size === 0) {
        connectionsByUserId.delete(userId);
      }
    });
  });
}

export function pushToUser(userId: string, event: string, payload: unknown): void {
  const sockets = connectionsByUserId.get(userId);
  if (!sockets || sockets.size === 0) return;

  const message = JSON.stringify({ event, payload });
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }
}
