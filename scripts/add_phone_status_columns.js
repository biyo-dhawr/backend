/**
 * Migration: add phone_number and status columns to reports table
 * Run once: node scripts/add_phone_status_columns.js
 */
import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  connect_timeout: 10,
  connection: { search_path: "public" },
});

async function main() {
  console.log("🔄 Running migration: add phone_number & status to reports...\n");

  // Add phone_number column (idempotent — does nothing if already exists)
  await sql`
    ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS phone_number text
  `;
  console.log("✅ phone_number column ready");

  // Add status column with default 'pending'
  await sql`
    ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
  `;
  console.log("✅ status column ready");

  // Back-fill existing verified rows
  await sql`
    UPDATE public.reports
    SET status = 'verified'
    WHERE is_verified = true AND status = 'pending'
  `;
  console.log("✅ Back-filled status for already-verified reports");

  console.log("\n🎉 Migration complete!");
  await sql.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Migration failed:", err.message);
  await sql.end();
  process.exit(1);
});
