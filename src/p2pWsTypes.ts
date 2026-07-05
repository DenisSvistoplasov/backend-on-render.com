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
export type PairListener = (changes: PairChanges) => void;


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

export type WsUpdateResponse = {
  type: 'update';
  payload: PairChanges;
};
