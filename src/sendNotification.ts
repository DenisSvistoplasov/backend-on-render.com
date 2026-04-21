import { CollectionReference } from 'firebase-admin/firestore';
import { db } from './admin';
import { IDBMessage, IDBUser } from './types';
import { sendPushNotification } from './pushService';

const messagesRef = db.collection(
  'messages',
) as CollectionReference<IDBMessage>;
const usersRef = db.collection('users') as CollectionReference<IDBUser>;

export const sendNotification = ({
  dialogId,
  recipientId,
  senderId,
  unreadMessageCounts,
}: {
  dialogId: string;
  recipientId: string;
  senderId: string;
  unreadMessageCounts?: number;
}) => {
  Promise.all([
    messagesRef
      .where('dialogId', '==', dialogId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get(),

    usersRef.where('id', 'in', [recipientId, senderId]).get(),
  ]).then(([messagesSnapshot, usersSnapshot]) => {
    const users = usersSnapshot.docs.map((doc) => doc.data());
    const [recipient, sender] =
      users[0].id === recipientId ? users : users.reverse();

    const recipientName = recipient.displayedName || recipient.login;
    const senderName = sender.displayedName || sender.login;
    const message = messagesSnapshot.docs[0].data();

    console.log(`Notification from ${senderName} to ${recipientName}`);

    if (recipient.pushToken) {
      sendPushNotification({
        to: recipient.pushToken,
        title: senderName,
        body: message.text,
        collapseId: sender.id,
        data: {
          dialogId,
          messageId: message.messageId,
        },
        ...(unreadMessageCounts && { badge: unreadMessageCounts }),
      });
    }
  });
};
