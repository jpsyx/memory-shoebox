import {
  makeSignedMediaLeaseFromObject,
  type GetSigningInput,
} from "./makeSignedMediaLeaseFromObject.ts";

/** Signs a focused download or maintenance GET against the private bucket. */
export async function makePresignedGetUrlFromObject(
  input: Readonly<GetSigningInput>,
): Promise<string> {
  const lease = await makeSignedMediaLeaseFromObject(input);
  return lease.url;
}
