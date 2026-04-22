import { createServerFn } from "@tanstack/react-start";

import {
  createUser,
  getUserByEmail,
  getUserById,
  verifyLogin,
} from "~/models/user.server";
import { useAppSession } from "./session.server";

export type LoginInput = {
  email: string;
  password: string;
  redirectTo?: string;
};

export type AuthResult = { error: string } | { redirectTo: string };

function safeRedirect(to: string | undefined, fallback = "/vehicles") {
  if (!to || typeof to !== "string") return fallback;
  if (!to.startsWith("/") || to.startsWith("//")) return fallback;
  return to;
}

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: LoginInput) => data)
  .handler(async ({ data }): Promise<AuthResult> => {
    const user = await verifyLogin(data.email, data.password);
    if (!user) {
      return { error: "Invalid email or password" };
    }
    const session = await useAppSession();
    await session.update({ userId: user.id });
    return { redirectTo: safeRedirect(data.redirectTo) };
  });

export const signupFn = createServerFn({ method: "POST" })
  .inputValidator((data: LoginInput) => data)
  .handler(async ({ data }): Promise<AuthResult> => {
    if (data.password.length < 8) {
      return { error: "Password must be at least 8 characters" };
    }
    const existing = await getUserByEmail(data.email);
    if (existing) {
      return { error: "A user with this email already exists" };
    }
    const user = await createUser(data.email, data.password);
    const session = await useAppSession();
    await session.update({ userId: user.id });
    return { redirectTo: safeRedirect(data.redirectTo) };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useAppSession();
  await session.clear();
  return { redirectTo: "/" as const };
});

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) return null;
    return getUserById(userId);
  },
);
