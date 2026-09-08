import { NextResponse } from "next/server";
import { createGuestSession, guestCookieName } from "../../../../lib/auth";

export async function GET(request: Request) {
  const session = await createGuestSession();
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(guestCookieName, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
