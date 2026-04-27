import express, { Request, Response } from 'express';
import { db } from './admin';
import { CollectionReference } from 'firebase-admin/firestore';
import { IDBDialog } from './types';
import { sendNotification } from './sendNotification';
import { time } from 'node:console';

const app = express();
const PORT = process.env.PORT || 3000;
const dialogsRef = db.collection('dialogs') as CollectionReference<IDBDialog>;
const dialogsData: Record<string, IDBDialog> = {};
let isInitialized = false;

// TODO:  добавить cron-job.org, чтобы регулярно пинговать и не давать уснуть
// настроить отображение и ссылку Push-уведомления

dialogsRef.onSnapshot((snapshot) => {
  if (!isInitialized) {
    console.log('Subscribed to dialogs');
  } else {
    console.log('Got dialog changes');
  }

  snapshot.docChanges().forEach((change) => {
    const dialog = change.doc.data();
    if (change.type === 'removed') {
      delete dialogsData[dialog.dialogId];
    }
    if (change.type === 'added') {
      if (isInitialized) {
        for (const userId in dialog.unreadMessageCounts) {
          if (dialog.unreadMessageCounts[userId] > 0) {
            const senderId =
              dialog.userIds[0] === userId
                ? dialog.userIds[1]
                : dialog.userIds[0];
            sendNotification({
              dialogId: dialog.dialogId,
              recipientId: userId,
              senderId,
              unreadMessageCounts: dialog.unreadMessageCounts[userId],
            });
          }
        }
      }
      dialogsData[dialog.dialogId] = dialog;
    }
    if (change.type === 'modified') {
      if (isInitialized) {
        for (const userId in dialog.unreadMessageCounts) {
          if (
            dialog.unreadMessageCounts[userId] >
            dialogsData[dialog.dialogId].unreadMessageCounts[userId]
          ) {
            const senderId =
              dialog.userIds[0] === userId
                ? dialog.userIds[1]
                : dialog.userIds[0];
            sendNotification({
              dialogId: dialog.dialogId,
              recipientId: userId,
              senderId,
              unreadMessageCounts: dialog.unreadMessageCounts[userId],
            });
          }
        }
      }
      dialogsData[dialog.dialogId] = dialog;
    }
  });

  isInitialized = true;
});

// Middleware для парсинга JSON
app.use(express.json());

// Firestore DB
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
const p2pData = {
  offer: null as any,
  answer: null as any
};

app.post('/api/p2p/setOffer', async (req: Request, res: Response) => {
  try {
    p2pData.offer = req.body;
    res.status(200).send();
  } catch (error: any) {
    console.error('Ошибка test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/p2p/getOffer', async (req: Request, res: Response) => {
  try {
    res.status(200).json(p2pData.offer);
  } catch (error: any) {
    console.error('Ошибка test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/p2p/setAnswer', async (req: Request, res: Response) => {
  try {
    p2pData.answer = req.body;
    res.status(200);
  } catch (error: any) {
    console.error('Ошибка test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/p2p/getAnswer', async (req: Request, res: Response) => {
  try {
    res.status(200).json(p2pData.answer);
  } catch (error: any) {
    console.error('Ошибка test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
