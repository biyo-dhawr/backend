import { and, desc, eq, gte, sql as drizzleSql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  alerts,
  profiles,
  reports,
  villages,
  waterSources,
} from "../db/schema.js";

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const getAll = async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(reports)
      .leftJoin(waterSources, eq(reports.waterSourceId, waterSources.id))
      .leftJoin(villages, eq(reports.villageId, villages.id))
      .leftJoin(profiles, eq(reports.userId, profiles.id))
      .orderBy(desc(reports.createdAt), desc(reports.id));

    const data = rows.map((row) => ({
      ...row.reports,
      waterSource: row.water_sources,
      village: row.villages,
      user: row.profiles
        ? {
            id: row.profiles.id,
            fullName: row.profiles.fullName,
            email: row.profiles.email,
            role: row.profiles.role,
            ngoId: row.profiles.ngoId,
          }
        : null,
    }));

    return res.json(data);
  } catch (error) {
    console.error("GET /reports error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const create = async (req, res) => {
  try {
    const {
      villageId,
      village_id: legacyVillageId,
      waterSourceId,
      water_source_id: legacyWaterSourceId,
      content,
      reporterType,
      reporter_type: legacyReporterType,
      severityLevel,
      severity_level: legacySeverityLevel,
      phoneNumber,
      phone_number: legacyPhoneNumber,
    } = req.body ?? {};

    const parsedVillageId = parseId(villageId ?? legacyVillageId);
    const parsedWaterSourceId = parseId(waterSourceId ?? legacyWaterSourceId);
    const finalSeverity = (severityLevel ?? legacySeverityLevel ?? "medium").toLowerCase();
    const trimmedContent = typeof content === "string" ? content.trim() : "";
    const finalPhone = phoneNumber ?? legacyPhoneNumber ?? null;

    if (!parsedVillageId || !parsedWaterSourceId || !trimmedContent) {
      return res.status(400).json({
        message: "villageId, waterSourceId, and non-empty content are required",
      });
    }

    const [source] = await db
      .select({ id: waterSources.id, villageId: waterSources.villageId })
      .from(waterSources)
      .where(eq(waterSources.id, parsedWaterSourceId))
      .limit(1);

    if (!source) {
      return res.status(404).json({ message: "Water source not found" });
    }
    if (source.villageId !== parsedVillageId) {
      return res.status(400).json({
        message: "Water source does not belong to the selected village",
      });
    }

    const [report] = await db
      .insert(reports)
      .values({
        userId: req.user?.id ?? null,
        villageId: parsedVillageId,
        waterSourceId: parsedWaterSourceId,
        content: trimmedContent,
        severityLevel: finalSeverity,
        reporterType: String(reporterType ?? legacyReporterType ?? "App").trim(),
        phoneNumber: finalPhone,
        status: "pending",
      })
      .returning();

    // ── Auto-alert for high severity reports ──────────────────────────
    if (finalSeverity === "high") {
      try {
        const [village] = await db
          .select({ name: villages.name })
          .from(villages)
          .where(eq(villages.id, parsedVillageId))
          .limit(1);

        const villageLabel = village?.name ?? `Village #${parsedVillageId}`;

        await db.insert(alerts).values({
          villageId: parsedVillageId,
          message: `🚨 High-severity water issue reported in ${villageLabel}: "${trimmedContent.slice(0, 120)}${trimmedContent.length > 120 ? "…" : ""}"`,
          severity: "high",
          isActive: true,
        });
      } catch (alertErr) {
        // Non-fatal — log but don't fail the report creation
        console.error("Alert creation failed (non-fatal):", alertErr.message);
      }
    }

    return res.status(201).json(report);
  } catch (error) {
    console.error("POST /reports error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/reports/:id/verify
export const verifyReport = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { actionTaken, action_taken } = req.body ?? {};
    const finalAction = actionTaken ?? action_taken ?? null;

    if (!id) {
      return res.status(400).json({ message: "Invalid report id" });
    }

    const [report] = await db
      .update(reports)
      .set({ isVerified: true, status: "verified", actionTaken: finalAction })
      .where(eq(reports.id, id))
      .returning();

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    return res.json(report);
  } catch (error) {
    console.error("PUT /reports/:id/verify error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/reports/:id/reject
export const rejectReport = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "Invalid report id" });
    }

    const [report] = await db
      .update(reports)
      .set({ isVerified: false, status: "rejected" })
      .where(eq(reports.id, id))
      .returning();

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    return res.json(report);
  } catch (error) {
    console.error("PUT /reports/:id/reject error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/reports/trend/weekly — reports per day for last 7 days
export const getWeeklyTrend = async (_req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        date: drizzleSql`DATE(${reports.createdAt})`.as("date"),
        count: drizzleSql`COUNT(*)`.as("count"),
      })
      .from(reports)
      .where(gte(reports.createdAt, sevenDaysAgo))
      .groupBy(drizzleSql`DATE(${reports.createdAt})`)
      .orderBy(drizzleSql`DATE(${reports.createdAt})`);

    // Fill in missing days with 0
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const found = rows.find((r) => String(r.date) === dateStr);
      result.push({ date: dateStr, count: found ? Number(found.count) : 0 });
    }

    return res.json(result);
  } catch (error) {
    console.error("GET /reports/trend/weekly error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const deleteReport = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid report id" });
    }

    const [deleted] = await db
      .delete(reports)
      .where(eq(reports.id, id))
      .returning({ id: reports.id });

    if (!deleted) {
      return res.status(404).json({ message: "Report not found" });
    }

    return res.json({ message: "Report deleted" });
  } catch (error) {
    console.error("DELETE /reports/:id error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export default {
  getAll,
  create,
  verifyReport,
  rejectReport,
  getWeeklyTrend,
  deleteReport,
};
