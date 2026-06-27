/**
 * Script: reset_admin.js
 * Ujeeddo: U eeg ama u abuur admin user cusub database-ka
 * Isticmaal: node scripts/reset_admin.js
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  connect_timeout: 10,
});

async function main() {
  console.log("🔍 Waxaan eegaynaa tables-ka database-ka...\n");

  // Hubi tables-ka jira (schema-da public)
  const tables = await sql`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_type = 'BASE TABLE'
    AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `;
  
  console.log("📋 Tables-ka jira:");
  console.table(tables);

  // Hel schema-da profiles table-ku ku jirto
  const profilesTable = tables.find(t => t.table_name === 'profiles');
  
  if (!profilesTable) {
    console.log("\n❌ 'profiles' table ma jirto! Tables-ka kore ka fiiri.");
    await sql.end();
    return;
  }

  const schema = profilesTable.table_schema;
  console.log(`\n✅ 'profiles' table waxay ku jirtaa schema: "${schema}"`);

  // Hel dhammaan users-ka
  const allUsers = await sql`
    SELECT id, email, full_name, role, created_at 
    FROM ${sql(schema)}.profiles
    ORDER BY created_at ASC
  `;

  if (allUsers.length === 0) {
    console.log("❌ Ma jiro wax user ah database-ka!\n");
  } else {
    console.log("\n✅ Users-ka jira:\n");
    console.table(allUsers.map(u => ({
      email: u.email,
      full_name: u.full_name,
      role: u.role,
    })));
  }

  // Password cusub
  const NEW_PASSWORD = "Admin@1234";

  // Hel admin-ka
  const existingAdmin = allUsers.find(
    (u) =>
      u.role === "GOVERNMENT WORKER" ||
      u.email?.toLowerCase().includes("admin")
  );

  if (existingAdmin) {
    console.log(`\n📧 Admin user la helay: ${existingAdmin.email}`);
    console.log(`👤 Magaca: ${existingAdmin.full_name}`);
    console.log(`🎭 Role: ${existingAdmin.role}`);

    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);
    await sql`
      UPDATE ${sql(schema)}.profiles 
      SET password_hash = ${hashedPassword}
      WHERE id = ${existingAdmin.id}
    `;

    console.log(`\n✅ Password-ka waa la beddelay!`);
    console.log(`📧 Email: ${existingAdmin.email}`);
    console.log(`🔑 Password cusub: ${NEW_PASSWORD}`);
  } else {
    console.log("\n⚠️  Ma jiro admin user. Waxaan abuurayaa mid cusub...");

    const ADMIN_EMAIL = "admin@biyodhow.com";
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);
    const [newAdmin] = await sql`
      INSERT INTO ${sql(schema)}.profiles (email, password_hash, full_name, role)
      VALUES (${ADMIN_EMAIL}, ${hashedPassword}, ${'Admin User'}, ${'GOVERNMENT WORKER'})
      RETURNING email, full_name, role
    `;

    console.log(`\n✅ Admin user cusub ayaa la abuuray!`);
    console.log(`📧 Email: ${newAdmin.email}`);
    console.log(`🔑 Password: ${NEW_PASSWORD}`);
  }

  await sql.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Khalad:", err.message);
  await sql.end();
  process.exit(1);
});
