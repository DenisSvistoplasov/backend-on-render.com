import WebSocket from 'ws';
import http from 'http';

export function startWebSocket(
  {
    server,
    onMessage,
    onClose,
  }: {
    server: http.Server;
    onMessage: (ws: WebSocket, data: WebSocket.Data) => void;
    onClose: (ws: WebSocket) => void,
  },
) {
  const wss = new WebSocket.Server({ server, path: '/api/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected WS');

    let pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    ws.on('pong', () => {
      // Обновляем время жизни соединения
    });

    ws.on('message', (data: WebSocket.Data) => {
      onMessage(ws, data);
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      onClose(ws);
      clearInterval(pingInterval);
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      clearInterval(pingInterval);
    });
  });

  return  wss;
}
