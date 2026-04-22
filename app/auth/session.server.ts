import { redirect } from "@tanstack/react-router";
import { useSession } from "@tanstack/react-start/server";

export type SessionData = {
  userId?: string;
};

export function useAppSession() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters long",
    );
  }
  return useSession<SessionData>({
    name: "__session",
    password,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    },
  });
}

export async function requireAuth(): Promise<string> {
  const session = await useAppSession();
  const userId = session.data.userId;
  if (!userId)
    throw redirect({ to: "/login", search: { redirectTo: undefined } });
  return userId;
}
