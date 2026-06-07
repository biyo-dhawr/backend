import {
  pgTable,
  serial,
  text,
  doublePrecision,
  integer,
  timestamp,
  boolean,
  uuid,
  pgEnum,
  bigserial,
} from "drizzle-orm/pg-core";

// 1. Define the Enum (Matches your "user_role" enum in Postgres)
export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "GOVERNMENT",
  "VILLAGE_LEADER",
  "COMMUNITY_MEMBER",
]);

// 2. NGOs Table
export const ngos = pgTable("ngos", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  contact: text("contact"),
});

// 3. Profiles Table (Linked to Supabase Auth)
export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").default("COMMUNITY_MEMBER").notNull(),
  ngoId: integer("ngo_id").references(() => ngos.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// 4. Regions Table
export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

// 5. Districts Table
export const districts = pgTable("districts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  regionId: integer("region_id")
    .references(() => regions.id, { onDelete: "restrict" })
    .notNull(),
});

// 6. Villages Table
export const villages = pgTable("villages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  districtId: integer("district_id").references(() => districts.id, {
    onDelete: "set null",
  }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  droughtRiskLevel: text("drought_risk_level").default("Low"),
});

// 7. Water Sources Table
export const waterSources = pgTable("water_sources", {
  id: serial("id").primaryKey(),
  villageId: integer("village_id")
    .references(() => villages.id, { onDelete: "restrict" })
    .notNull(),
  name: text("name").notNull(),
  type: text("type").default("Borehole").notNull(),
  status: text("status").default("Working"),
  waterLevel: doublePrecision("water_level").default(100.0),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  lastMaintained: timestamp("last_maintained", { withTimezone: true }),
});

// 8. Interventions Table
export const interventions = pgTable("interventions", {
  id: serial("id").primaryKey(),
  ngoId: integer("ngo_id")
    .references(() => ngos.id, { onDelete: "restrict" })
    .notNull(),
  waterSourceId: integer("water_source_id").references(() => waterSources.id, {
    onDelete: "set null",
  }),
  villageId: integer("village_id").references(() => villages.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(),
  description: text("description"),
  status: text("status").default("Planned").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 9. Reports Table
export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  villageId: integer("village_id").references(() => villages.id, {
    onDelete: "set null",
  }),
  waterSourceId: integer("water_source_id").references(() => waterSources.id, {
    onDelete: "set null",
  }),
  reporterType: text("reporter_type"),
  content: text("content"),
  isVerified: boolean("is_verified").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 10. Alerts Table
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  villageId: integer("village_id").references(() => villages.id, {
    onDelete: "set null",
  }),
  message: text("message"),
  severity: text("severity"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 11. Sensor Readings Table
export const sensorReadings = pgTable("sensor_readings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  waterSourceId: integer("water_source_id")
    .references(() => waterSources.id, { onDelete: "restrict" })
    .notNull(),
  soilMoisture: doublePrecision("soil_moisture"),
  temperature: doublePrecision("temperature"),
  humidity: doublePrecision("humidity"),
  waterLevel: doublePrecision("water_level"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 12. AI Predictions Table
export const aiPredictions = pgTable("ai_predictions", {
  id: serial("id").primaryKey(),
  villageId: integer("village_id")
    .references(() => villages.id, { onDelete: "restrict" })
    .notNull(),
  predictionDate: timestamp("prediction_date", {
    withTimezone: true,
  }).notNull(),
  droughtRisk: doublePrecision("drought_risk").notNull(),
  predictedLevel: text("predicted_level").notNull(),
  confidenceScore: doublePrecision("confidence_score"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
