import { headers } from "next/headers";
import { chatGPTUserFromHeaders, type ChatGPTUser } from "../app/chatgpt-auth";

export async function requireSession(): Promise<ChatGPTUser> {
  const requestHeaders = await headers();
  const user = chatGPTUserFromHeaders(requestHeaders);
  if (!user) throw new AuthError();
  return user;
}

export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") throw new AuthError("Cross-site request rejected");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AuthError("Origin mismatch");
}

export class AuthError extends Error {
  status = 401;
  constructor(message = "Authentication required") {
    super(message);
  }
}
