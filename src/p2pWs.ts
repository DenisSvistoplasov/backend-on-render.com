import {
  Pair,
  PairChanges,
  UserListener,
  WsGetInitialResponse,
  WsRequest,
  WsResponse,
} from './p2pWsTypes';
import { Server } from 'http';
import WebSocket from 'ws';
import { startWebSocket } from './webSocket/webSocket';

export const addP2pEndpoints = (server: Server) => {
  let userCount = 0;
  const userIds: string[] = [];
  const sessionIds: Record<string, string> = {};
  const userWSs = new Map<WebSocket, { userId: string; sessionId: string }>();
  const pairs: Record<string, Pair> = {};
  const Listeners = {
    listeners: {} as Record<string, UserListener>,
    addListener(userId: string, listener: UserListener) {
      this.listeners[userId] = listener;
    },
    removeListener(userId: string) {
      if (this.listeners[userId]) delete this.listeners[userId];
    },
    call(userId: string, message: WsResponse) {
      if (!this.listeners[userId])
        return console.warn('There is no listener for id', userId);
      this.listeners[userId](message);
    },
  };

  // Process listeners
  const handleNewUserChange = (newPairs: Pair[], newUserId: string) => {
    newPairs.forEach((pair) => {
      const currentUserId =
        pair.senderId === newUserId ? pair.receiverId : pair.senderId;
      console.log(
        'New user. Call listeners for ',
        currentUserId,
        'listener: ',
        !!Listeners.listeners[currentUserId],
      );
      Listeners.call(currentUserId, { type: 'addPair', payload: pair });
    });
  };

  const handleUserDeleted = (userPairMap: Record<string, string>) => {
    for (const oldUserId in userPairMap) {
      const pairId = userPairMap[oldUserId];
      console.log(
        'Delete user. Call listeners for ',
        oldUserId,
        !!Listeners.listeners[oldUserId],
      );
      Listeners.call(oldUserId, { type: 'deletePair', payload: pairId });
    }
  };

  const handleUserReconnect = (
    userId: string,
    oldPairs: Record<string, Pair>,
  ) => {
    // for (const pairId in oldPairs) {
    //   const pair = oldPairs[pairId];
    //   const otherUserId =
    //     pair.senderId === userId ? pair.receiverId : pair.senderId;
    //   console.log(
    //     'Reconnect user. Call listeners for ',
    //     otherUserId,
    //     !!Listeners.map[otherUserId]?.listener,
    //   );
    //   Listeners.call(otherUserId, { modified: [pair] });
    // }
  };

  // WS Handlers
  const onMessage = (ws: WebSocket, data: WebSocket.Data) => {
    console.log('onMessage');
    try {
      const message = JSON.parse(data.toString()) as WsRequest;
      console.log('Received WS:', message.type);

      // Initial
      if (message.type === 'initial') {
        const clientUserId = message.payload?.userId;

        const userId = addNewUser(ws, clientUserId);

        if (!userId) return;

        // Wait changes
        console.log('Add listener for ' + userId);
        Listeners.addListener(userId, (data) => {
          ws.send(JSON.stringify(data));
        });
      }

      // Set Offer
      if (message.type === 'setOffer') {
        const { userId, partnerId, offer } = message.payload;

        if (!userId || !partnerId || !offer) {
          return ws.send(
            JSON.stringify({
              error: 'Bad Request',
              message: 'userId, partnerId and offer are required',
            }),
          );
        }

        const [senderId, receiverId] = [userId, partnerId];
        const pairId = senderId + '_vs_' + receiverId;

        if (!pairs[pairId]) {
          return ws.send(
            JSON.stringify({
              error: 'Bad Request',
              message: 'There is no pair ' + pairId + '. On setOffer.',
            }),
          );
        }

        pairs[pairId].offer = offer;
        pairs[pairId].answer = null;

        console.log('Set offer by', userId);
        console.log(
          'Listener for sender ' +
            senderId +
            ': ' +
            !!Listeners.listeners[senderId] +
            ', for receiver ' +
            receiverId +
            ': ' +
            !!Listeners.listeners[receiverId],
        );

        Listeners.call(senderId, {
          type: 'setOffer',
          payload: { pairId, offer },
        });
        Listeners.call(receiverId, {
          type: 'setOffer',
          payload: { pairId, offer },
        });
      }

      // Set Answer
      if (message.type === 'setAnswer') {
        const { userId, partnerId, answer } = message.payload;

        if (!userId || !partnerId || !answer) {
          return ws.send(
            JSON.stringify({
              error: 'Bad Request',
              message: 'userId, partnerId and answer are required',
            }),
          );
        }

        if (userId <= partnerId) {
          return ws.send(
            JSON.stringify({
              error: 'Bad Request',
              message:
                'cant send answer. userId > partnerId. userId:' +
                userId +
                ' partnerId:' +
                partnerId,
            }),
          );
        }

        const [senderId, receiverId] = [partnerId, userId];
        const pairId = senderId + '_vs_' + receiverId;

        if (!pairs[pairId]?.offer) {
          return ws.send(
            JSON.stringify({
              error: 'Bad Request',
              message:
                'Cant set answer before offer. senderId:' +
                senderId +
                ' receiverId:' +
                receiverId,
            }),
          );
        }

        pairs[pairId].answer = answer;

        Listeners.call(senderId, {
          type: 'setAnswer',
          payload: { pairId, answer },
        });
        Listeners.call(receiverId, {
          type: 'setAnswer',
          payload: { pairId, answer },
        });
      }
    } catch (error) {
      console.log('error: ', error);
    }
  };

  const onClose = (ws: WebSocket) => {
    if (!userWSs.has(ws)) return console.log('no user ws when close');

    const { userId, sessionId } = userWSs.get(ws)!;

    console.log('close user ws: ', userId);
    userWSs.delete(ws);

    const currentSessionId = sessionIds[userId];

    if (currentSessionId === sessionId) {
      deleteUser(userId);
    }
    else {
      console.log('currentSessionId !== ws sessionId => don`t delete user');
    }
  };

  startWebSocket({ server, onMessage, onClose });

  // UTILS
  const addNewUser = (ws: WebSocket, userId?: string) => {
    userCount++;

    if (userId) {
      if (userIds.includes(userId)) {
        return console.error('reconnectUser with existed: ', userId);
      } else {
        console.log('user after exit: ', userId);
      }
    } else {
      userId = String(userCount);
      console.log('new user: ', userId);
    }

    const sessionId = userId + Math.random().toString(32);
    sessionIds[userId] = sessionId;
    userWSs.set(ws, { userId, sessionId });

    const newPairs: Pair[] = [];

    userIds.forEach((id) => {
      const [senderId, receiverId] = userId < id ? [userId, id] : [id, userId];
      const pairId = senderId + '_vs_' + receiverId;
      const newPair: Pair = {
        pairId,
        senderId,
        receiverId,
        offer: null,
        answer: null,
      };

      newPairs.push(newPair);
      pairs[pairId] = newPair;
    });

    userIds.push(userId);

    ws.send(
      JSON.stringify({
        type: 'initial',
        payload: {
          yourId: userId,
          pairs: newPairs,
        },
      } as WsGetInitialResponse),
    );

    handleNewUserChange(newPairs, userId);

    return userId;
  };

  const reconnectUser = (userId: string) => {
    const oldPairs: Record<string, Pair> = {};

    for (const pairId in pairs) {
      const [senderId, receiverId] = pairId.split('_vs_');
      if (senderId === userId || receiverId === userId) {
        pairs[pairId].offer = null;
        pairs[pairId].answer = null;
        oldPairs[pairId] = pairs[pairId];
      }
    }

    handleUserReconnect(userId, oldPairs);

    return Object.values(oldPairs);
  };

  const deleteUser = (userId: string) => {
    console.log('deleteUser: ', userId);
    // userCount--;
    userIds.splice(userIds.indexOf(userId), 1);

    const userPairMap: Record<string, string> = {};

    for (const pairId in pairs) {
      const [senderId, receiverId] = pairId.split('_vs_');
      if (senderId === userId || receiverId === userId) {
        delete pairs[pairId];
        const otherUserId = userId === senderId ? receiverId : senderId;
        userPairMap[otherUserId] = pairId;
      }
    }

    Listeners.removeListener(userId);
    console.log('RemoveListener for ' + userId);

    handleUserDeleted(userPairMap);
  };
};
