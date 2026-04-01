import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db";
import { users } from "../db/schema";
import { logger } from "../shared/logger";

const router: Router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { email, name } = req.body;

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      res.status(409).json({ error: "User with this email already exists" });
      return;
    }

    const userId = uuidv4();
    const now = new Date();

    const [newUser] = await db
      .insert(users)
      .values({
        id: userId,
        email,
        name: name || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info("Created user", { userId: newUser.id, email: newUser.email });

    res.status(201).json({ user: newUser });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to create user", { error: errMsg });
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    logger.info("User logged in", { userId: user.id });

    res.json({ user });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to login user", { error: errMsg });
    res.status(500).json({ error: "Failed to login" });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get user", { error: errMsg });
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get user", { error: errMsg });
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = req.headers["x-user-id"] as string;
    const { name } = req.body;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    if (userId !== id) {
      res.status(403).json({ error: "Not authorized to update this user" });
      return;
    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existingUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        name: name !== undefined ? name : existingUser.name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    logger.info("Updated user", { userId: id });

    res.json({ user: updatedUser });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to update user", { error: errMsg });
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    if (userId !== id) {
      res.status(403).json({ error: "Not authorized to delete this user" });
      return;
    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existingUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await db.delete(users).where(eq(users.id, id));

    logger.info("Deleted user", { userId: id });

    res.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to delete user", { error: errMsg });
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export { router as usersRouter };
