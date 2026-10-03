import type { UploadProblemCode } from "@memory-shoebox/shared";

/**
 * A transfer step that gave up, with the problem code it gave up with.
 *
 * A class for the reason `ApiRequestError` is one: it is thrown, and a
 * thrown thing should be an `Error`.
 */
export class UploadTransferError extends Error {
  readonly problemCode: UploadProblemCode;
  /** True when the server has already failed the row itself. */
  readonly isRowTerminal: boolean;

  constructor(
    options: Readonly<{
      problemCode: UploadProblemCode;
      message: string;
      isRowTerminal?: boolean;
    }>,
  ) {
    super(options.message);
    this.name = "UploadTransferError";
    this.problemCode = options.problemCode;
    const { isRowTerminal = false } = options;
    this.isRowTerminal = isRowTerminal;
  }
}
