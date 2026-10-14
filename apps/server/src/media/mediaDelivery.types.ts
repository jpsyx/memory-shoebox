/** A URL and the actual validity interval signed for one immutable object. */
export type SignedMediaLease = {
  url: string;
  issuedAt: string;
  expiresAt: string;
};

/** Signing inputs and the immutable catalog revision used for lease reuse. */
export type MediaLeaseRequest = {
  key: string;
  renditionId: string;
  expiresInSeconds: number;
  now: Date;
  downloadFilename?: string;
};
