import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { profiles } from "../db/schema.js";

export async function findUserByEmail(email) {
  const [user] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  return user ?? null;
}

export async function createUser({
  email,
  passwordHash,
  fullName,
  role,
  ngoId,
}) {
  const [user] = await db
    .insert(profiles)
    .values({ id: randomUUID(), email, passwordHash, fullName, role, ngoId })
    .returning();

  return user;
}
