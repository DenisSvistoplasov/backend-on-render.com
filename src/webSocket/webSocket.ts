import WebSocket from 'ws';
import http from 'http';

export function startWebSocket({
  server,
  onMessage,
  onClose,
}: {
  server: http.Server;
  onMessage: (ws: WebSocket, data: WebSocket.Data) => void;
  onClose: (ws: WebSocket) => void;
}) {
  const wss = new WebSocket.Server({ server, path: '/api/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('Client connected WS');

    const connId = Date.now() + Math.random();
    const log = (event: any, data?: any) =>
      console.log(
        JSON.stringify({
          id: connId,
          ts: Date.now(),
          event,
          data,
          readyState: ws.readyState,
          remoteAddress: req.socket.remoteAddress,
          headers: req.headers,
        }),
      );

    log('connection');
    ws.on('message', (msg) => log('message', { size: msg.length }));
    ws.on('ping', (data) => log('ping', { size: data.length }));
    ws.on('pong', (data) => log('pong', { size: data.length }));
    ws.on('close', (code, reason) =>
      log('close', { code, reason: reason.toString('hex') }),
    );
    ws.on('error', (err) => log('error', { message: err.message }));
    ws.on('unexpected-response', (req, res) =>
      log('unexpected-response', { status: res.statusCode }),
    );

    const netSocket = req.socket;
    netSocket.on('close', (hadError) => log('tcp-close', { hadError }));
    netSocket.on('error', (err) => log('tcp-error', { message: err.message }));
    netSocket.on('timeout', () => log('tcp-timeout'));
    netSocket.on('end', () => log('tcp-end'));

    // Снять текущие параметры сокета
    log('tcp-info', {
      keepAlive: (netSocket as any).keepAlive,
      timeout: netSocket.timeout,
      bytesRead: netSocket.bytesRead,
      bytesWritten: netSocket.bytesWritten,
    });

    // let pingInterval = setInterval(() => {
    //   if (ws.readyState === WebSocket.OPEN) {
    //     ws.ping();
    //   }
    // }, 30_000);

    ws.on('pong', () => {
      // Обновляем время жизни соединения
    });

    ws.on('message', (data: WebSocket.Data) => {
      onMessage(ws, data);
    });

    ws.on('close', (code, reason) => {
      console.log('Client disconnected');
      console.log('code, reason: ', code, reason);
      onClose(ws);
      // clearInterval(pingInterval);
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      // clearInterval(pingInterval);
    });
  });

  return wss;
}
