export type P2pConnectionData = any;

export type Pair = {
  pairId: string;
  senderId: string;
  receiverId: string;
  offer: P2pConnectionData | null;
  answer: P2pConnectionData | null;
};
export type PairChanges = {
  added?: Pair[];
  modified?: Pair[];
  removed?: string[];
};
export type UserListener = (message: WsResponse) => void;

// REQUESTS
export type WsSetOfferRequest = {
  type: 'setOffer';
  payload: {
    userId: string;
    partnerId: string;
    offer: P2pConnectionData;
  };
};

export type WsSetAnswerRequest = {
  type: 'setAnswer';
  payload: {
    userId: string;
    partnerId: string;
    answer: P2pConnectionData;
  };
};

export type WsGetInitialRequest = {
  type: 'initial';
  payload: null | { userId: string };
};

export type WsRequest =
  | WsSetOfferRequest
  | WsSetAnswerRequest
  | WsGetInitialRequest;

// RESPONSES
export type WsGetInitialResponse = {
  type: 'initial';
  payload: {
    yourId: string;
    pairs: Pair[];
  };
};

export type WsPutPairResponse = {
  type: 'putPair';
  payload: Pair;
};

export type WsSetOfferResponse = {
  type: 'setOffer';
  payload: { pairId: string; offer: P2pConnectionData };
};

export type WsSetAnswerResponse = {
  type: 'setAnswer';
  payload: { pairId: string; answer: P2pConnectionData };
};

export type WsDeletePairResponse = {
  type: 'deletePair';
  payload: string; // pairId
};

export type WsResponse =
  | WsGetInitialResponse
  | WsPutPairResponse
  | WsSetOfferResponse
  | WsSetAnswerResponse
  | WsDeletePairResponse;
