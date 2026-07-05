import WebSocket from 'ws';
import http from 'http'; 

export function startWebSocket(server: http.Server) {
  const wss = new WebSocket.Server({ server, path: '/api/ws' });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected WS');
    clients.add(ws);

    let pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    ws.on('pong', () => {
      // Обновляем время жизни соединения
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        // const parsed = JSON.parse(data.toString());
        console.log('Received:', data);

        clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify('Received: ' + JSON.stringify(data)),
            );
          }
        });
      } catch (e) {
        console.error('Invalid JSON:', e);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      clients.delete(ws);
      clearInterval(pingInterval);
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
      clearInterval(pingInterval);
    });
  });

  return { wss, clients };
}

