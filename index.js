const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для парсинга JSON
app.use(express.json());

// Простой GET-маршрут
app.get('/', (req, res) => {
  res.json({ message: '🚀 Бэкенд работает!', timestamp: new Date() });
});

// Тестовый GET с параметром
app.get('/api/users', (req, res) => {
  res.json([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ]);
});

// Тестовый POST
app.post('/api/echo', (req, res) => {
  const { data } = req.body;
  res.json({ received: data, echo: 'Hello back!' });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});