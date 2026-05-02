import { Request, Response, Express } from 'express';

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

const LONG_POLLING_TIMEOUT = 1000 * 30;

const userIds: string[] = [];
const userPresenceTimers: Record<string, NodeJS.Timeout> = {};
const pairs: Record<string, Pair> = {};
const pairListeners: Record<string, PairListener | null> = {}; // userId : listener

// Process listeners
const handleNewUserChange = (newPairs: Pair[], newUserId: string) => {
  newPairs.forEach((pair) => {
    const currentUserId =
      pair.senderId === newUserId ? pair.receiverId : pair.senderId;
    pairListeners[currentUserId]?.({ added: [pair] });
  });
};
const handlePairModified = (pairId: string) => {
  const [senderId, receiverId] = pairId.split('_vs_');
  pairListeners[senderId]?.({ modified: [pairs[pairId]] });
  pairListeners[receiverId]?.({ modified: [pairs[pairId]] });
};

const handleUserDeleted = (userPairMap: Record<string, string>) => {
  for (const oldUserId in userPairMap) {
    const pairId = userPairMap[oldUserId];
    pairListeners[oldUserId]?.({ removed: [pairId] });
  }
};

// Endpoints
export const addP2pEndpoints = (app: Express) => {
  app.get('/api/p2p/getInitial', async (req: Request, res: Response) => {
    try {
      const currentUserId = String((+userIds[userIds.length - 1] || 0) + 1);
      const newPairs = addNewUser(currentUserId);

      res
        .status(200)
        .json({ yourId: currentUserId + '', pairs: newPairs });
    } catch (error: any) {
      console.error('Ошибка test:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  app.get('/api/p2p/listenPairs', (req: Request, res: Response<PairChanges | 'no changes'>) => {
    try {
      const userId = req.query.userId;
      if (!userId || typeof userId !== 'string')
        throw new Error('query param "userId" is required');

      if (!userIds.includes(userId)) {
        addNewUser(userId);
      }

      // First time -> send immediately
      // if (!pairListeners[userId]) {
      //   const responsePairs = calcFirstResponsePairs(userId);
      //   res.status(200).json(responsePairs);
      //   return;
      // }

      // Wait changes
      const timeout = setTimeout(() => {
        pairListeners[userId] = null;
        res.status(200).json('no changes');
      }, LONG_POLLING_TIMEOUT);

      pairListeners[userId] = (changedPairs) => {
        clearTimeout(timeout);
        pairListeners[userId] = null;
        res.status(200).json(changedPairs);
      };

      watchUserPresence(userId);
    } catch (error: any) {
      console.error('Ошибка test:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      } as any);
    }
  });

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

      const [senderId, receiverId] = [userId, partnerId];
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
};

// Utils
const addNewUser = (userId: string) => {
  const newPairs: Pair[] = [];

  userIds.forEach((id) => {
    const pairId = id + '_vs_' + userId;

    const newPair: Pair = {
      pairId,
      senderId: id,
      receiverId: userId + '',
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

const deleteUser = (userId: string) => {
  userIds.splice(userIds.indexOf(userId), 1);

  const userPairMap: Record<string, string> = {};

  for (const pairId in pairs) {
    const [senderId, receiverId] = pairId.split('_vs_');
    if (senderId === userId || receiverId === userId) {
      delete pairs[pairId];
      const oldUserId = userId === senderId ? receiverId : senderId;
      userPairMap[oldUserId] = pairId;
    }
  }

  pairListeners[userId] = null;

  handleUserDeleted(userPairMap);
};

const calcFirstResponsePairs = (userId: string): Pair[] => {
  const res: Pair[] = [];
  for (const pairId in pairs) {
    const [senderId, receiverId] = pairId.split('_vs_');
    if (senderId === userId || receiverId === userId) {
      res.push(pairs[pairId]);
    }
  }
  return res;
};

const watchUserPresence = (userId: string) => {
  if (userPresenceTimers[userId]) clearTimeout(userPresenceTimers[userId]);

  userPresenceTimers[userId] = setTimeout(() => {
    deleteUser(userId);
  }, LONG_POLLING_TIMEOUT * 2);
};

// TODO: может сделать что-то вроде версионирования, чтобы избежать ситуаций, когда юзеру отправляется ответ listenPairs, затем он делает новый запрос, а между этим произошли изменения в данных