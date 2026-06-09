import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
} from "drizzle-orm";
import { db } from "../db/index.js";
import {
  districts,
  regions,
  sensorReadings,
  villages,
  waterSources,
} from "../db/schema.js";
import { clearGovernmentWaterSourcesCache } from "../utils/governmentWaterSourcesCache.js";

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, maximum);
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isForeignKeyViolation(error) {
  return error?.cause?.code === "23503" || error?.code === "23503";
}

export const getAll = async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;
    const search = String(req.query.search ?? "").trim();
    const region = String(req.query.region ?? "").trim();
    const district = String(req.query.district ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const conditions = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(waterSources.name, pattern),
          ilike(waterSources.type, pattern),
          ilike(villages.name, pattern),
        ),
      );
    }
    if (status) {
      conditions.push(eq(waterSources.status, status));
    }
    if (district) {
      conditions.push(eq(districts.name, district));
    }
    if (region) {
      conditions.push(eq(regions.name, region));
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const baseQuery = () =>
      db
        .select()
        .from(waterSources)
        .innerJoin(villages, eq(waterSources.villageId, villages.id))
        .leftJoin(districts, eq(villages.districtId, districts.id))
        .leftJoin(regions, eq(districts.regionId, regions.id));

    const [[totalRow], rows] = await Promise.all([
      db
        .select({ total: count() })
        .from(waterSources)
        .innerJoin(villages, eq(waterSources.villageId, villages.id))
        .leftJoin(districts, eq(villages.districtId, districts.id))
        .leftJoin(regions, eq(districts.regionId, regions.id))
        .where(where),
      baseQuery()
        .where(where)
        .orderBy(desc(waterSources.id))
        .limit(limit)
        .offset(offset),
    ]);

    const sourceIds = rows.map((row) => row.water_sources.id);
    const latestReadingBySource = new Map();

    if (sourceIds.length) {
      const readings = await db
        .select()
        .from(sensorReadings)
        .where(inArray(sensorReadings.waterSourceId, sourceIds))
        .orderBy(desc(sensorReadings.createdAt), desc(sensorReadings.id));

      for (const reading of readings) {
        if (!latestReadingBySource.has(reading.waterSourceId)) {
          latestReadingBySource.set(reading.waterSourceId, reading);
        }
      }
    }

    const data = rows.map((row) => ({
      ...row.water_sources,
      village: {
        ...row.villages,
        district: row.districts
          ? {
              ...row.districts,
              region: row.regions,
            }
          : null,
      },
      sensorReadings: latestReadingBySource.has(row.water_sources.id)
        ? [latestReadingBySource.get(row.water_sources.id)]
        : [],
    }));
    const total = totalRow.total;

    return res.json({
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /water-sources error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const create = async (req, res) => {
  try {
    const {
      villageId,
      village_id: legacyVillageId,
      name,
      type = "Borehole",
      latitude,
      longitude,
      status,
      waterLevel,
      water_level: legacyWaterLevel,
    } = req.body ?? {};
    const parsedVillageId = parseId(villageId ?? legacyVillageId);
    const parsedLatitude = parseOptionalNumber(latitude);
    const parsedLongitude = parseOptionalNumber(longitude);
    const parsedWaterLevel = parseOptionalNumber(
      waterLevel ?? legacyWaterLevel,
    );

    if (!parsedVillageId || !String(name ?? "").trim()) {
      return res.status(400).json({ message: "villageId and name are required" });
    }
    if (
      Number.isNaN(parsedLatitude) ||
      Number.isNaN(parsedLongitude) ||
      Number.isNaN(parsedWaterLevel)
    ) {
      return res.status(400).json({
        message: "latitude, longitude, and waterLevel must be valid numbers",
      });
    }

    const [village] = await db
      .select({ id: villages.id })
      .from(villages)
      .where(eq(villages.id, parsedVillageId))
      .limit(1);

    if (!village) {
      return res.status(404).json({ message: "Village not found" });
    }

    const values = {
      villageId: parsedVillageId,
      name: String(name).trim(),
      type: String(type).trim() || "Borehole",
      latitude: parsedLatitude,
      longitude: parsedLongitude,
    };

    if (status !== undefined) {
      values.status = String(status).trim();
    }
    if (parsedWaterLevel !== null) {
      values.waterLevel = parsedWaterLevel;
    }

    const [source] = await db
      .insert(waterSources)
      .values(values)
      .returning();

    clearGovernmentWaterSourcesCache();
    return res.status(201).json(source);
  } catch (error) {
    console.error("POST /water-sources error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const {
      status,
      waterLevel,
      water_level: legacyWaterLevel,
    } = req.body ?? {};
    const parsedWaterLevel = parseOptionalNumber(
      waterLevel ?? legacyWaterLevel,
    );

    if (!id) {
      return res.status(400).json({ message: "Invalid water source id" });
    }
    if (status === undefined && parsedWaterLevel === null) {
      return res
        .status(400)
        .json({ message: "status or waterLevel is required" });
    }
    if (Number.isNaN(parsedWaterLevel)) {
      return res.status(400).json({ message: "waterLevel must be a valid number" });
    }

    const changes = { lastMaintained: new Date() };
    if (status !== undefined) {
      changes.status = String(status).trim();
    }
    if (parsedWaterLevel !== null) {
      changes.waterLevel = parsedWaterLevel;
    }

    const [source] = await db
      .update(waterSources)
      .set(changes)
      .where(eq(waterSources.id, id))
      .returning();

    if (!source) {
      return res.status(404).json({ message: "Water source not found" });
    }

    clearGovernmentWaterSourcesCache();
    return res.json(source);
  } catch (error) {
    console.error("PATCH /water-sources/:id/status error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const deleteSource = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid water source id" });
    }

    const [deleted] = await db
      .delete(waterSources)
      .where(eq(waterSources.id, id))
      .returning({ id: waterSources.id });

    if (!deleted) {
      return res.status(404).json({ message: "Water source not found" });
    }

    clearGovernmentWaterSourcesCache();
    return res.json({ message: "Water source deleted" });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return res.status(409).json({
        message:
          "Water source cannot be deleted while dependent records still exist",
      });
    }

    console.error("DELETE /water-sources/:id error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export default {
  getAll,
  create,
  updateStatus,
  deleteSource,
};
