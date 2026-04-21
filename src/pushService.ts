import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

// Создаем один экземпляр клиента для всего приложения
// Если ты включишь "Усиленную безопасность" в панели EAS, сюда нужно будет добавить accessToken
// Пока что это не обязательно [citation:4]
const expo = new Expo();

export async function sendPushNotification(
  message: ExpoPushMessage,
): Promise<ExpoPushTicket | null> {
  // Проверяем, является ли токен валидным ExpoPushToken
  if (!Expo.isExpoPushToken(message.to)) {
    console.error(`Пуш: Неверный ExpoPushToken: ${message.to}`);
    return null;
  }

  const defaultMessage: Partial<ExpoPushMessage> = {
    priority: 'high',
    sound: 'notification_wob.wav',
    channelId: 'default',
    ttl: 60 * 60 * 24,
  };

  try {
    // Отправляем уведомление
    const ticket = await expo.sendPushNotificationsAsync([{...defaultMessage, ...message}]);
    // sendPushNotificationsAsync всегда возвращает массив, берем первый элемент
    const firstTicket = ticket[0];

    if (firstTicket.status === 'error') {
      console.error(`Пуши: Ошибка при отправке! Код: ${firstTicket.message}`);
      // TODO: Здесь можно обработать конкретные ошибки, например, удалить токен, если пришел статус 'DeviceNotRegistered' [citation:8]
    } else {
      console.log(`Пуш: Успешно отправлено! ID тикета: ${firstTicket.id}`);
    }

    return firstTicket;
  } catch (error) {
    console.error('Пуши: Не удалось отправить запрос в Expo:', error);
    return null;
  }
}

// TODO: add в настройках Expo опцию "Enhanced Security for Push Notifications"
// accessToken: process.env.EXPO_ACCESS_TOKEN
