import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

async function alterTable() {
  try {
    console.log("Adding columns to reports table...");
    await db.execute(sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS severity_level TEXT DEFAULT 'medium'`);
    await db.execute(sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS action_taken TEXT`);
    console.log("Successfully altered reports table!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to alter table:", err);
    process.exit(1);
  }
}

alterTable();
