import { describe, expect, it } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  getSessionTokenFromRequest,
  setSessionCookie,
} from "../../src/auth/sessionCookie.ts";

/** A request carrying whatever `Cookie` header a test wants to present. */
function _requestWithCookie(cookie: string | undefined): FastifyRequest {
  return { headers: { cookie } } as unknown as FastifyRequest;
}

/** A reply that records the headers it was given. */
function _recordingReply(): {
  reply: FastifyReply;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const reply = {
    header: (name: string, value: string) => {
      headers[name] = value;
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, headers };
}

describe("getSessionTokenFromRequest", () => {
  it("finds the cookie among others", () => {
    const request = _requestWithCookie(
      `theme=dark; ${SESSION_COOKIE_NAME}=abc123; locale=es`,
    );
    expect(getSessionTokenFromRequest(request)).toBe("abc123");
  });

  it("is undefined when no cookie header was sent at all", () => {
    expect(
      getSessionTokenFromRequest(_requestWithCookie(undefined)),
    ).toBeUndefined();
  });

  it("is undefined when the header carries other cookies only", () => {
    expect(
      getSessionTokenFromRequest(_requestWithCookie("theme=dark")),
    ).toBeUndefined();
  });

  it("is undefined for an empty value rather than an empty string", () => {
    const request = _requestWithCookie(`${SESSION_COOKIE_NAME}=`);
    expect(getSessionTokenFromRequest(request)).toBeUndefined();
  });

  it("does not match a cookie whose name merely ends with ours", () => {
    const request = _requestWithCookie(`not_shoebox_session=abc123`);
    expect(getSessionTokenFromRequest(request)).toBeUndefined();
  });
});

describe("setSessionCookie", () => {
  it("carries every attribute the contract fixes", () => {
    const { reply, headers } = _recordingReply();
    setSessionCookie({ reply, token: "abc123" });
    expect(headers["set-cookie"]).toBe(
      "shoebox_session=abc123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000",
    );
  });
});

describe("clearSessionCookie", () => {
  it("repeats the attributes, or the browser keeps the cookie", () => {
    const { reply, headers } = _recordingReply();
    clearSessionCookie(reply);
    expect(headers["set-cookie"]).toBe(
      "shoebox_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    );
  });
});
