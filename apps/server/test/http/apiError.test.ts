import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/http/apiError.ts";

describe("ApiError", () => {
  it("carries the status, the code and the details", () => {
    const error = ApiError.rateLimited(42);

    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("rate_limited");
    expect(error.details).toEqual({ retryAfterSeconds: 42 });
  });

  it("is an Error, so a handler may simply throw it", () => {
    expect(ApiError.notSignedIn()).toBeInstanceOf(Error);
  });

  it("maps each named constructor to the status the conventions give it", () => {
    expect(ApiError.notSignedIn().statusCode).toBe(401);
    expect(ApiError.forbidden("mail_forbidden").statusCode).toBe(403);
    expect(ApiError.notFound("item_not_found").statusCode).toBe(404);
    expect(ApiError.conflict("upload_conflict").statusCode).toBe(409);
    expect(ApiError.gone("sign_in_code_expired").statusCode).toBe(410);
    expect(ApiError.unavailable("upload_storage_unavailable").statusCode).toBe(
      503,
    );
  });

  it("carries fieldErrors on an invalid request", () => {
    const error = ApiError.invalidRequest({ email: ["is required"] });

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("invalid_request");
    expect(error.details).toEqual({ fieldErrors: { email: ["is required"] } });
  });
});
