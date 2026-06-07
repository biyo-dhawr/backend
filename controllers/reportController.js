import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
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
    } = req.body ?? {};
    const parsedVillageId = parseId(villageId ?? legacyVillageId);
    const parsedWaterSourceId = parseId(
      waterSourceId ?? legacyWaterSourceId,
    );
    const trimmedContent =
      typeof content === "string" ? content.trim() : "";

    if (!parsedVillageId || !parsedWaterSourceId || !trimmedContent) {
      return res.status(400).json({
        message:
          "villageId, waterSourceId, and non-empty content are required",
      });
    }

    const [source] = await db
      .select({
        id: waterSources.id,
        villageId: waterSources.villageId,
      })
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
        reporterType: String(
          reporterType ?? legacyReporterType ?? "App",
        ).trim(),
      })
      .returning();

    return res.status(201).json(report);
  } catch (error) {
    console.error("POST /reports error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const verifyReport = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid report id" });
    }

    const [report] = await db
      .update(reports)
      .set({ isVerified: true })
      .where(eq(reports.id, id))
      .returning();

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    return res.json(report);
  } catch (error) {
    console.error("PATCH /reports/:id/verify error:", error);
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
  deleteReport,
};
