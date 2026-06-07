import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

const client = postgres(connectionString, {
  prepare: false,
  connect_timeout: 5,
});

export const db = drizzle(client, { schema });

export async function ensureDatabase() {
  try {
    console.log("Verifying database connection...");
    await db.execute(sql`SELECT 1`);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS districts_region_id_idx ON districts (region_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS villages_district_id_idx ON villages (district_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS water_sources_village_id_idx ON water_sources (village_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS water_sources_type_status_village_idx ON water_sources (type, status, village_id)`,
    );
    console.log("Database connection established successfully.");
  } catch (error) {
    console.error("Database connection failed!");
    console.error(error.message);
    throw error;
  }
}
