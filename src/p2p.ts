import { Request, Response, Express } from 'express';
import { removeListener } from 'node:cluster';

type P2pConnectionData = any;
type Pair = {
  pairId: string;
  senderId: string;
  receiverId: string;
  offer: P2pConnectionData | null;
  answer: P2pConnectionData | null;
};
type PairChanges = {
  added?: Pair[];
  modified?: Pair[];
  removed?: string[];
};
type PairListener = (changes: PairChanges) => void;

export const addP2pEndpoints = (app: Express) => {
  const LONG_POLLING_TIMEOUT = 1000 * 30;

  let userCount = 0;
  const userIds: string[] = [];
  const userPresenceTimers: Record<string, NodeJS.Timeout> = {};
  const pairs: Record<string, Pair> = {};
  // const pairListeners: Record<string, PairListener | null> = {}; // userId : listener
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
        this.map[userId].data = null;
      }
    },
    removeListener(userId: string) {
      if (this.map[userId]) this.map[userId].listener = null;
    },
    call(userId: string, data: PairChanges) {
      if (!this.map[userId]) this.map[userId] = { data: null, listener: null };

      if (this.map[userId].listener) this.map[userId].listener(data);
      else
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
    },
  };

  // Process listeners
  const handleNewUserChange = (newPairs: Pair[], newUserId: string) => {
    newPairs.forEach((pair) => {
      const currentUserId =
        pair.senderId === newUserId ? pair.receiverId : pair.senderId;
      Listeners.call(currentUserId, { added: [pair] });
    });
  };
  const handlePairModified = (pairId: string) => {
    const [senderId, receiverId] = pairId.split('_vs_');

    Listeners.call(senderId, { modified: [pairs[pairId]] });
    Listeners.call(receiverId, { modified: [pairs[pairId]] });
  };

  const handleUserDeleted = (userPairMap: Record<string, string>) => {
    for (const oldUserId in userPairMap) {
      const pairId = userPairMap[oldUserId];
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
      Listeners.call(otherUserId, { modified: [pair] });
    }
  };
  // TODO: 1)  проблема старого чата на клиенте

  // Endpoints
  app.get(
    '/api/p2p/getInitial',
    async (req: Request, res: Response<{ yourId: string; pairs: Pair[] }>) => {
      try {
        const clientUserId = req.query.userId;
        let currentUserId: string;

        console.log('userIds: ', userIds);
        if (clientUserId && typeof clientUserId === 'string') {
          currentUserId = clientUserId;

          // if page reload
          if (userIds.includes(clientUserId)) {
            console.log('reconnectUser: ', clientUserId);
            const oldPairs = reconnectUser(clientUserId);
            res.status(200).json({
              yourId: currentUserId,
              pairs: oldPairs,
            });
          } else {
            // connection after exit
            userCount++;
            const newPairs = addNewUser(currentUserId);
            console.log('user after exit: ', currentUserId);
            res.status(200).json({
              yourId: currentUserId + '',
              pairs: newPairs,
            });
          }
          // first enter
        } else {
          currentUserId = String(++userCount);
          console.log('new user: ', currentUserId);
          const newPairs = addNewUser(currentUserId);
          res.status(200).json({ yourId: currentUserId + '', pairs: newPairs });
        }
      } catch (error: any) {
        console.error('Ошибка test:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        } as any);
      }
    },
  );

  app.post(
    '/api/p2p/exit',
    async (req: Request, res: Response<{ userId: string }>) => {
      try {
        const userId = req.body.userId;

        if (!userIds.includes(userId)) throw new Error('User not found');

        deleteUser(userId);
        res.status(200).send();
      } catch (error: any) {
        console.error('Ошибка test:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        } as any);
      }
    },
  );

  app.get(
    '/api/p2p/listenPairs',
    (req: Request, res: Response<PairChanges | 'no changes'>) => {
      try {
        const userId = req.query.userId;
        if (!userId || typeof userId !== 'string')
          throw new Error('query param "userId" is required');

        if (!userIds.includes(userId)) {
          // const newPairs = addNewUser(userId);
          // res.status(200).json({
          //   modified: newPairs,
          // });
          // return;
          return res.status(404).json(('no such user: '+ userId)as any);
        }

        // First time -> send immediately
        // if (!pairListeners[userId]) {
        //   const responsePairs = calcFirstResponsePairs(userId);
        //   res.status(200).json(responsePairs);
        //   return;
        // }

        // Wait changes
        const timeout = setTimeout(() => {
          Listeners.removeListener(userId);
          res.status(200).json('no changes');
        }, LONG_POLLING_TIMEOUT);

        Listeners.addListener(userId, (changedPairs) => {
          clearTimeout(timeout);
          Listeners.removeListener(userId);
          res.status(200).json({
            ...changedPairs,
          });
        });

        watchUserPresence(userId);
      } catch (error: any) {
        console.error('Ошибка test:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        } as any);
      }
    },
  );

  // The p2p
  app.post('/api/p2p/setOffer', async (req: Request, res: Response) => {
    try {
      const { userId, partnerId, offer } = req.body as {
        userId: string;
        partnerId: string;
        offer: P2pConnectionData;
      };

      if (!userId || !partnerId || !offer)
        throw new Error('userId, partnerId and offer are required');

      if (+userId >= +partnerId)
        throw new Error(
          'cant send offer. userId > partnerId. userId:' +
            userId +
            ' partnerId:' +
            partnerId,
        );

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

      handlePairModified(pairId);

      res.status(200).send();
    } catch (error: any) {
      console.error('Ошибка test:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // app.get('/api/p2p/getOffer', async (req: Request, res: Response) => {
  //   try {
  //     res.status(200).json(p2pData.offer);
  //   } catch (error: any) {
  //     console.error('Ошибка test:', error);
  //     res.status(500).json({
  //       success: false,
  //       error: error.message,
  //     });
  //   }
  // });

  app.post('/api/p2p/setAnswer', async (req: Request, res: Response) => {
    try {
      const { userId, partnerId, answer } = req.body as {
        userId: string;
        partnerId: string;
        answer: P2pConnectionData;
      };

      if (!userId || !partnerId || !answer)
        throw new Error('userId, partnerId and answer are required');

      if (+userId <= +partnerId)
        throw new Error(
          'cant send answer. userId > partnerId. userId:' +
            userId +
            ' partnerId:' +
            partnerId,
        );

      const [senderId, receiverId] = [partnerId, userId];
      const pairId = senderId + '_vs_' + receiverId;

      if (!pairs[pairId]?.offer)
        throw new Error(
          'Cant set answer before offer. senderId:' +
            senderId +
            ' receiverId:' +
            receiverId,
        );

      pairs[pairId].answer = answer;

      handlePairModified(pairId);

      res.status(200).send();
    } catch (error: any) {
      console.error('Ошибка test:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // app.get('/api/p2p/getAnswer', async (req: Request, res: Response) => {
  //   try {
  //     res.status(200).json(p2pData.answer);
  //   } catch (error: any) {
  //     console.error('Ошибка test:', error);
  //     res.status(500).json({
  //       success: false,
  //       error: error.message,
  //     });
  //   }
  // });

  // Utils
  const addNewUser = (userId: string) => {
    const newPairs: Pair[] = [];

    userIds.forEach((id) => {
      const [senderId, receiverId] =
        +userId < +id ? [userId, id] : [id, userId];
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

    handleUserDeleted(userPairMap);
  };

  const watchUserPresence = (userId: string) => {
    if (userPresenceTimers[userId]) clearTimeout(userPresenceTimers[userId]);

    userPresenceTimers[userId] = setTimeout(() => {
      deleteUser(userId);
    }, LONG_POLLING_TIMEOUT * 2);
  };
};

// TODO: может сделать что-то вроде версионирования, чтобы избежать ситуаций, когда юзеру отправляется ответ listenPairs, затем он делает новый запрос, а между этим произошли изменения в данных
