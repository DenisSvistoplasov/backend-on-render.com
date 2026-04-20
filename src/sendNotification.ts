import { CollectionReference } from 'firebase-admin/firestore';
import { db } from './admin';
import { IDBUser } from './types';
import { sendPushNotification } from './pushService';

const usersRef = db.collection('users') as CollectionReference<IDBUser>;

export const sendNotification = (userId: string) => {
  return usersRef
    .where('id', '==', userId)
    .get()
    .then((querySnapshot) => {
      const { pushToken, displayedName } = querySnapshot.docs[0].data();
      console.log('Notification for user: ', displayedName);
      console.log('His pushToken: ', pushToken);

      if (pushToken) {
        sendPushNotification(
          pushToken,
          'Новое сообщение',
          'Вам пришло новое сообщение',
        );
      }
    });
};
