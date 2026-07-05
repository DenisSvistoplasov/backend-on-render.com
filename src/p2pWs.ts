import {
  Pair,
  PairChanges,
  PairListener,
  WsGetInitialResponse,
  WsRequest,
  WsUpdateResponse,
} from './p2pWsTypes';
import { Server } from 'http';
import WebSocket from 'ws';
import { startWebSocket } from './webSocket/webSocket';

export const addP2pEndpoints = (server: Server) => {
  let userCount = 0;
  const userIds: string[] = [];
  const userWSs = new Map<WebSocket, string>();
  const userPresenceTimers: Record<string, NodeJS.Timeout> = {};
  const pairs: Record<string, Pair> = {};
  const timeoutMap: Record<string, NodeJS.Timeout> = {};
  const Listeners = {
    map: {} as Record<
      string,
      { data: PairChanges | null; listener: PairListener | null }
    >,
    addListener(userId: string, listener: PairListener) {
      if (!this.map[userId]) this.map[userId] = { data: null, listener };
      else this.map[userId].listener = listener;

      if (this.map[userId].data) {
        listener(this.map[userId].data);
      }
    },
    removeListener(userId: string) {
      if (this.map[userId]) delete this.map[userId];
    },
    call(userId: string, data: PairChanges) {
      if (!this.map[userId]) this.map[userId] = { data: null, listener: null };

      if (this.map[userId].listener) this.map[userId].listener(data);
      else {
        if (!this.map[userId])
          console.warn('2) There is no listener for id', userId);
        this.map[userId].data = {
          added: [
            ...(this.map[userId].data?.added || []),
            ...(data.added || []),
          ],
          modified: [
            ...(this.map[userId].data?.modified || []),
            ...(data.modified || []),
          ],
          removed: [
            ...(this.map[userId].data?.removed || []),
            ...(data.removed || []),
          ],
        };
      }
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
        !!Listeners.map[currentUserId]?.listener,
      );
      Listeners.call(currentUserId, { added: [pair] });
    });
  };
  const handlePairModified = (pairId: string) => {
    const [senderId, receiverId] = pairId.split('_vs_');

    console.log(
      'Modified. Call listeners for ',
      senderId,
      'listener: ',
      !!Listeners.map[senderId]?.listener,
      '. Call listeners for ',
      receiverId,
      'listener: ',
      !!Listeners.map[receiverId]?.listener,
      'offer: ',
      !!pairs[pairId].offer,
      'answer: ',
      !!pairs[pairId].answer,
    );
    Listeners.call(senderId, { modified: [pairs[pairId]] });
    Listeners.call(receiverId, { modified: [pairs[pairId]] });
  };

  const handleUserDeleted = (userPairMap: Record<string, string>) => {
    for (const oldUserId in userPairMap) {
      const pairId = userPairMap[oldUserId];
      console.log(
        'Delete user. Call listeners for ',
        oldUserId,
        !!Listeners.map[oldUserId]?.listener,
      );
      Listeners.call(oldUserId, { removed: [pairId] });
    }
  };

  const handleUserReconnect = (
    userId: string,
    oldPairs: Record<string, Pair>,
  ) => {
    for (const pairId in oldPairs) {
      const pair = oldPairs[pairId];
      const otherUserId =
        pair.senderId === userId ? pair.receiverId : pair.senderId;
      console.log(
        'Reconnect user. Call listeners for ',
        otherUserId,
        !!Listeners.map[otherUserId]?.listener,
      );
      Listeners.call(otherUserId, { modified: [pair] });
    }
  };

  // WS Handlers
  const onMessage = (ws: WebSocket, data: WebSocket.Data) => {
    console.log('onMessage');
    try {
      const message = JSON.parse(data.toString()) as WsRequest;
      console.log('Received WS:', message);

      // Initial
      if (message.type === 'initial') {
        const clientUserId = message.payload?.userId;
        let currentUserId: string;

        if (clientUserId) {
          currentUserId = clientUserId;

          // if page reload
          if (userIds.includes(currentUserId)) {
            console.log('reconnectUser: ', currentUserId);
            userWSs.set(ws, currentUserId);
            const oldPairs = reconnectUser(currentUserId);
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  type: 'initial',
                  payload: {
                    yourId: currentUserId,
                    pairs: oldPairs,
                  },
                } as WsGetInitialResponse),
              );
            }, 5000);
          } else {
            // connection after exit
            userCount++;
            userWSs.set(ws, currentUserId);
            const newPairs = addNewUser(currentUserId);
            console.log('user after exit: ', currentUserId);
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  type: 'initial',
                  payload: {
                    yourId: currentUserId,
                    pairs: newPairs,
                  },
                } as WsGetInitialResponse),
              );
            }, 5000);
          }
          // first enter
        } else {
          currentUserId = String(++userCount);
          console.log('new user: ', currentUserId);
          userWSs.set(ws, currentUserId);
          const newPairs = addNewUser(currentUserId);
          setTimeout(() => {
            ws.send(
              JSON.stringify({
                type: 'initial',
                payload: {
                  yourId: currentUserId,
                  pairs: newPairs,
                },
              } as WsGetInitialResponse),
            );
          }, 5000);
        }

        // Wait changes
        console.log('Add listener for ' + currentUserId);
        Listeners.addListener(currentUserId, (changedPairs) => {
          console.log('Sending update for ' + currentUserId);
          ws.send(
            JSON.stringify({
              type: 'update',
              payload: changedPairs,
            } as WsUpdateResponse),
          );
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
          pairs[pairId] = {
            pairId,
            senderId,
            receiverId,
            offer: null,
            answer: null,
          };
        }

        pairs[pairId].offer = offer;
        pairs[pairId].answer = null;

        console.log('Set offer by', userId);
        console.log(
          'Listener for sender',
          senderId,
          !!Listeners.map[senderId]?.listener,
        );
        console.log(
          'Listener for receiver',
          receiverId,
          !!Listeners.map[receiverId]?.listener,
        );
        handlePairModified(pairId);
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

        handlePairModified(pairId);
      }
    } catch (error) {
      console.log('error: ', error);
    }
  };

  const onClose = (ws: WebSocket) => {
    if (!userWSs.has(ws)) return console.log('no user ws when close');

    const userId = userWSs.get(ws)!;

    console.log('close user ws: ', userId);
    userWSs.delete(ws);

    deleteUser(userId);
  };

  startWebSocket({ server, onMessage, onClose });

  // UTILS
  const addNewUser = (userId: string) => {
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

    handleNewUserChange(newPairs, userId);

    return newPairs;
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
    console.log('3) removeListener for ' + userId);

    handleUserDeleted(userPairMap);
  };
};
