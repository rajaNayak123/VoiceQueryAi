import { clerkMiddleware, getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/db";
import { logger } from "../utils/logger";

if (!process.env.CLERK_SECRET_KEY) {
  logger.warn(
    "CLERK_SECRET_KEY is not set in backend environment. Authenticated routes will reject requests."
  );
}

export { clerkMiddleware };

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    sessionId?: string;
  };
}

/**
 * Ensures user exists in PostgreSQL users table, syncing details from Clerk.
 */
export async function syncUserRecord(userId: string) {
  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (existing) return existing;

    let email = `${userId}@clerk.local`;
    let fullName: string | null = null;

    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      email =
        clerkUser.emailAddresses?.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        )?.emailAddress ||
        clerkUser.emailAddresses?.[0]?.emailAddress ||
        email;

      fullName =
        `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || null;
    } catch (clerkErr) {
      logger.warn({ clerkErr, userId }, "Could not fetch user details from Clerk; creating fallback record");
    }

    return await prisma.user.upsert({
      where: { id: userId },
      update: { email, fullName },
      create: { id: userId, email, fullName },
    });
  } catch (err) {
    logger.error({ err, userId }, "Could not sync user to database");
    return null;
  }
}

/**
 * Middleware that ensures the incoming request is authenticated with Clerk.
 * Rejects with 401 Unauthorized if no valid user session is found.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = getAuth(req);
    if (!auth || !auth.userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "You must be signed in to perform this action.",
      });
    }

    (req as AuthenticatedRequest).auth = {
      userId: auth.userId,
      sessionId: auth.sessionId ?? undefined,
    };

    // Guarantee user record exists in PostgreSQL before proceeding to document operations
    await syncUserRecord(auth.userId);

    next();
  } catch (err) {
    logger.error({ err }, "Error checking Clerk authentication");
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired authentication token.",
    });
  }
}
