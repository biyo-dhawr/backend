import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

const client = postgres(connectionString, {
  prepare: false,
  connect_timeout: 5,
  connection: {
    search_path: "public",
  },
});

export const db = drizzle(client, { schema });

export async function ensureDatabase() {
  try {
    console.log("Verifying database connection...");
    await db.execute(sql`SELECT 1`);
    console.log("Database connection established successfully.");
  } catch (error) {
    console.error("Database connection failed!");
    console.error(error.message);
    throw error;
  }
}
