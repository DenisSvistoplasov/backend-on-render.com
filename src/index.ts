import express, { Request, Response } from 'express';
import { db } from './admin';


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для парсинга JSON
app.use(express.json());

// app.get('/', (req, res) => {
//   res.json({ message: '🚀 Бэкенд работает!', timestamp: new Date() });
// });

// // Тестовый GET с параметром
// app.get('/api/users', (req, res) => {
//   res.json([
//     { id: 1, name: 'Alice' },
//     { id: 2, name: 'Bob' }
//   ]);
// });

// // Тестовый POST
// app.post('/api/echo', (req, res) => {
//   const { data } = req.body;
//   res.json({ received: data, echo: 'Hello back!' });
// });

// Firestore DB
app.get('/api/test', async (req: Request, res: Response) => {
  try {
    // const dialogsRef = db.collection('dialogs');

    // dialogsRef.onSnapshot(snapshot => {
    //   snapshot.docChanges().forEach(change => {
        
    //   });
    // });

    const messagesRef = db.collection('messages');


    const snapshot = await messagesRef
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    if (snapshot.empty) {
      return res.json({ 
        success: true, 
        count: 0, 
        messages: [],
        message: 'Коллекция messages пуста'
      });
    }
    
    const messages: any[] = [];
    snapshot.forEach(doc => {
      messages.push({
        id: doc.id,
        ...doc.data(),
        // Преобразуем Firestore Timestamp в обычную дату для удобства
        // createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
      });
    });
    
    res.json({ 
      success: true, 
      count: messages.length, 
      messages 
    });
    
  } catch (error: any) {
    console.error('Ошибка при получении сообщений:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});