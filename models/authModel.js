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

export async function findUserById(id) {
  const [user] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);

  return user ?? null;
}

export async function deleteUser(id) {
  await db.delete(profiles).where(eq(profiles.id, id));
}

export async function updateUser(id, updates) {
  const [updatedUser] = await db
    .update(profiles)
    .set(updates)
    .where(eq(profiles.id, id))
    .returning();

  return updatedUser;
}

export async function createUser({
  email,
  passwordHash,
  fullName,
  role,
  ngoId,
  phoneNumber,
  districtId,
}) {
  const [user] = await db
    .insert(profiles)
    .values({ id: randomUUID(), email, passwordHash, fullName, role, ngoId, phoneNumber, districtId })
    .returning();

  return user;
}
