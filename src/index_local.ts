import express, { Request, Response } from 'express';
import { db } from './admin';
import { CollectionReference } from 'firebase-admin/firestore';
import { IDBDialog } from './types';
import { sendNotification } from './sendNotification';
import http from 'http'; 
import { addP2pEndpoints } from './p2pWs';
// import { addP2pEndpoints } from './p2p';

const app = express();
const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// Middleware для парсинга JSON
app.use(express.json());

app.get('/api/ping', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      time: Date.now(),
    });
  } catch (error: any) {
    console.error('Ошибка ping:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoints for P2P test
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

addP2pEndpoints(server);


// Запуск сервера
server.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
