import { CollectionReference } from "firebase-admin/firestore";
import { db } from "./admin";
import { IDBUser } from "./types";

const usersRef = db.collection('users') as CollectionReference<IDBUser>;
export const sendNotification = (userId: string) => {
  return usersRef.where('id', '==', userId).get().then((querySnapshot) => {
    const users = querySnapshot.docs.map(doc => doc.data());
    return users;
  })
};