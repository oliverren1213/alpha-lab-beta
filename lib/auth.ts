import { headers } from "next/headers";
import { chatGPTUserFromHeaders, type ChatGPTUser } from "../app/chatgpt-auth";
import { getRuntimeEnv } from "./database";
import { createGuestToken, verifyGuestToken } from "./guest-session";

export type SessionUser = ChatGPTUser & { isGuest: boolean };
export const guestCookieName = "alpha_lab_guest";

export async function getSessionUser(): Promise<SessionUser | null> {
  const requestHeaders = await headers();
  const user = chatGPTUserFromHeaders(requestHeaders);
  if (user) return { ...user, isGuest: false };
  const secret = getRuntimeEnv().GUEST_SESSION_SECRET;
  const token = readCookie(requestHeaders.get("cookie"), guestCookieName);
  const ownerId = secret && token ? await verifyGuestToken(secret, token) : null;
  return ownerId
    ? { id: ownerId, displayName: "访客演示空间", email: "", isGuest: true }
    : null;
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}

export async function createGuestSession() {
  const secret = getRuntimeEnv().GUEST_SESSION_SECRET;
  if (!secret) throw new Error("Guest sessions are not configured");
  return createGuestToken(secret);
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

function readCookie(value: string | null, name: string) {
  return value?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;
}
