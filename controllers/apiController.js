import { and, count, desc, eq, inArray, ilike } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  alerts,
  districts,
  reports,
  regions,
  villages,
  waterSources,
  profiles,
} from "../db/schema.js";
import {
  clearGovernmentWaterSourcesCache,
  getGovernmentWaterSourcesCache,
  setGovernmentWaterSourcesCache,
} from "../utils/governmentWaterSourcesCache.js";

const RISK_LEVELS = ["Low", "Medium", "High", "Severe"];

function parseId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : Number.NaN;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function sendServerError(res, label, error) {
  console.error(label, error);
  return res.status(500).json({ error: error.message });
}

export const getRegions = async (_req, res) => {
  try {
    return res.json(await db.select().from(regions).orderBy(regions.name));
  } catch (error) {
    return sendServerError(res, "GET /regions error:", error);
  }
};

export const getDistricts = async (req, res) => {
  try {
    const regionId = parseId(req.query.regionId ?? req.query.region_id);
    if (Number.isNaN(regionId)) {
      return res.status(400).json({ message: "Invalid regionId" });
    }

    const data = regionId
      ? await db
          .select()
          .from(districts)
          .where(eq(districts.regionId, regionId))
          .orderBy(districts.name)
      : await db.select().from(districts).orderBy(districts.name);

    return res.json(data);
  } catch (error) {
    return sendServerError(res, "GET /districts error:", error);
  }
};

export const getVillages = async (req, res) => {
  try {
    const districtId = parseId(req.query.districtId ?? req.query.district_id);
    if (Number.isNaN(districtId)) {
      return res.status(400).json({ message: "Invalid districtId" });
    }

    const data = districtId
      ? await db
          .select()
          .from(villages)
          .where(eq(villages.districtId, districtId))
          .orderBy(villages.name)
      : await db.select().from(villages).orderBy(villages.name);

    return res.json(data);
  } catch (error) {
    return sendServerError(res, "GET /villages error:", error);
  }
};

export const getAlerts = async (req, res) => {
  try {
    const activeOnly = String(req.query.active ?? "").toLowerCase() === "true";
    const rows = await db
      .select()
      .from(alerts)
      .leftJoin(villages, eq(alerts.villageId, villages.id))
      .where(activeOnly ? eq(alerts.isActive, true) : undefined)
      .orderBy(desc(alerts.createdAt), desc(alerts.id));

    return res.json(
      rows.map((row) => ({
        ...row.alerts,
        village: row.villages,
      })),
    );
  } catch (error) {
    return sendServerError(res, "GET /alerts error:", error);
  }
};

export const createAlert = async (req, res) => {
  try {
    const {
      villageId,
      village_id: legacyVillageId,
      message,
      severity,
    } = req.body ?? {};
    const parsedVillageId = parseId(villageId ?? legacyVillageId);
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    const trimmedSeverity = typeof severity === "string" ? severity.trim() : "";

    if (!parsedVillageId || !trimmedMessage || !trimmedSeverity) {
      return res.status(400).json({
        message: "villageId, message, and severity are required",
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

    const [alert] = await db
      .insert(alerts)
      .values({
        villageId: parsedVillageId,
        message: trimmedMessage,
        severity: trimmedSeverity,
      })
      .returning();

    return res.status(201).json(alert);
  } catch (error) {
    return sendServerError(res, "POST /alerts error:", error);
  }
};

export const sendSms = (req, res) => {
  const { to, message } = req.body ?? {};
  const recipient = typeof to === "string" ? to.trim() : "";
  const content = typeof message === "string" ? message.trim() : "";

  if (!recipient || !content) {
    return res.status(400).json({ message: "to and message are required" });
  }

  console.log(`[SMS MOCK] Sending to ${recipient}: "${content}"`);
  return res.json({
    success: true,
    status: "sent",
    message: "SMS request received",
  });
};

export const updateRisk = async (_req, res) => {
  try {
    const summary = await db.transaction(async (tx) => {
      const allVillages = await tx
        .select({ id: villages.id, name: villages.name })
        .from(villages);
      const allSources = await tx
        .select({
          id: waterSources.id,
          name: waterSources.name,
          waterLevel: waterSources.waterLevel,
        })
        .from(waterSources);
      const updates = [];

      if (allVillages.length) {
        const village = randomItem(allVillages);
        const risk = randomItem(RISK_LEVELS);

        await tx
          .update(villages)
          .set({ droughtRiskLevel: risk })
          .where(eq(villages.id, village.id));
        updates.push(`Updated ${village.name} risk to ${risk}.`);

        if (risk === "High" || risk === "Severe") {
          const message = randomItem([
            `Drought risk escalated to ${risk}. Immediate water rationing required.`,
            `AI prediction: Water tables are dropping rapidly in ${village.name}.`,
            `Urgent: ${risk} drought conditions detected.`,
          ]);

          await tx.insert(alerts).values({
            villageId: village.id,
            message,
            severity: "Critical",
          });
          updates.push("Critical alert generated.");
        } else if (Math.random() > 0.5) {
          const advisory = randomItem([
            "Predicted rainfall in 3 days. Prepare catchment systems.",
            "Water usage optimization recommended.",
            "Groundwater levels stable.",
          ]);

          await tx.insert(alerts).values({
            villageId: village.id,
            message: `AI Advisory: ${advisory}`,
            severity: "Info",
          });
          updates.push("Advisory generated.");
        }
      }

      if (allSources.length) {
        const source = randomItem(allSources);
        const currentLevel = source.waterLevel ?? 100;
        const newLevel = Math.max(
          0,
          Math.min(100, currentLevel + (Math.random() * 10 - 5)),
        );

        await tx
          .update(waterSources)
          .set({ waterLevel: newLevel })
          .where(eq(waterSources.id, source.id));
        updates.push(
          `Adjusted ${source.name} water level to ${newLevel.toFixed(1)}%.`,
        );
      }

      return updates.join(" ");
    });

    clearGovernmentWaterSourcesCache();
    return res.json({ success: true, summary });
  } catch (error) {
    return sendServerError(res, "POST /simulation/risk error:", error);
  }
};

export const getDashboardStats = async (_req, res) => {
  try {
    const [[sourceCount], [pendingCount], [criticalCount], recentRows] =
      await Promise.all([
        db.select({ value: count() }).from(waterSources),
        db
          .select({ value: count() })
          .from(reports)
          .where(eq(reports.isVerified, false)),
        db
          .select({ value: count() })
          .from(villages)
          .where(inArray(villages.droughtRiskLevel, ["High", "Severe"])),
        db
          .select()
          .from(reports)
          .leftJoin(villages, eq(reports.villageId, villages.id))
          .leftJoin(waterSources, eq(reports.waterSourceId, waterSources.id))
          .orderBy(desc(reports.createdAt), desc(reports.id))
          .limit(5),
      ]);

    return res.json({
      totalSources: sourceCount.value,
      pendingReports: pendingCount.value,
      criticalZones: criticalCount.value,
      recentReports: recentRows.map((row) => ({
        ...row.reports,
        village: row.villages,
        waterSource: row.water_sources,
      })),
    });
  } catch (error) {
    return sendServerError(res, "GET /dashboard/stats error:", error);
  }
};

export const getGovernmentWaterSources = async (req, res) => {
  try {
    const statusFilter = req.query.status ? String(req.query.status).trim() : "";
    const typeFilter = req.query.type ? String(req.query.type).trim() : "";
    const cacheKey = JSON.stringify([statusFilter, typeFilter]);
    const cached = getGovernmentWaterSourcesCache(cacheKey);

    if (cached) {
      return res.type("application/json").send(cached);
    }

    const sourceJoinConditions = [eq(waterSources.villageId, villages.id)];

    if (statusFilter) {
      sourceJoinConditions.push(ilike(waterSources.status, statusFilter));
    }
    if (typeFilter) {
      sourceJoinConditions.push(ilike(waterSources.type, typeFilter));
    }

    const rows = await db
      .select({
        regionId: regions.id,
        regionName: regions.name,
        districtId: districts.id,
        districtName: districts.name,
        villageId: villages.id,
        villageName: villages.name,
        sourceId: waterSources.id,
        sourceName: waterSources.name,
        sourceType: waterSources.type,
        sourceStatus: waterSources.status,
        sourceWaterLevel: waterSources.waterLevel,
        latitude: waterSources.latitude,
        longitude: waterSources.longitude,
      })
      .from(regions)
      .leftJoin(districts, eq(districts.regionId, regions.id))
      .leftJoin(villages, eq(villages.districtId, districts.id))
      .leftJoin(waterSources, and(...sourceJoinConditions))
      .orderBy(regions.name, districts.name, villages.name, waterSources.name);
    const regionMap = new Map();

    for (const row of rows) {
      let region = regionMap.get(row.regionId);
      if (!region) {
        region = {
          region: row.regionName,
          totalSources: 0,
          avgStatus: 0,
          districts: [],
          districtMap: new Map(),
        };
        regionMap.set(row.regionId, region);
      }
      if (!row.districtId) continue;

      let district = region.districtMap.get(row.districtId);
      if (!district) {
        district = {
          name: row.districtName,
          totalSources: 0,
          avgStatus: 0,
          villages: [],
          villageMap: new Map(),
        };
        region.districtMap.set(row.districtId, district);
        region.districts.push(district);
      }
      if (!row.villageId) continue;

      let village = district.villageMap.get(row.villageId);
      if (!village) {
        village = {
          name: row.villageName,
          totalSources: 0,
          avgStatus: 0,
          functional: 0,
          needsRepair: 0,
          nonFunctional: 0,
          sources: [],
        };
        district.villageMap.set(row.villageId, village);
        district.villages.push(village);
      }
      if (!row.sourceId) continue;

      const sourceStatus = row.sourceStatus;
      if (statusFilter && sourceStatus?.toLowerCase() !== statusFilter.toLowerCase()) continue;
      if (typeFilter && row.sourceType?.toLowerCase() !== typeFilter.toLowerCase()) continue;

      village.sources.push({
        id: row.sourceId,
        source_name: row.sourceName,
        water_source_type: row.sourceType,
        status: sourceStatus,
        water_level: row.sourceWaterLevel,
        lat: row.latitude,
        lng: row.longitude,
      });
      village.totalSources++;
      if (sourceStatus === "Working") village.functional++;
      if (sourceStatus === "Needed Maintenance") village.needsRepair++;
      if (sourceStatus === "Broken") village.nonFunctional++;
    }

    const data = [...regionMap.values()].map((region) => {
      for (const district of region.districts) {
        for (const village of district.villages) {
          village.avgStatus = village.totalSources
            ? Math.round((village.functional / village.totalSources) * 100)
            : 0;
        }

        district.totalSources = district.villages.reduce(
          (sum, village) => sum + village.totalSources,
          0,
        );
        const districtFunctional = district.villages.reduce(
          (sum, village) => sum + village.functional,
          0,
        );
        district.avgStatus = district.totalSources
          ? Math.round((districtFunctional / district.totalSources) * 100)
          : 0;
        delete district.villageMap;
      }

      region.totalSources = region.districts.reduce(
        (sum, district) => sum + district.totalSources,
        0,
      );
      const regionFunctional = region.districts.reduce(
        (sum, district) =>
          sum +
          district.villages.reduce(
            (villageSum, village) => villageSum + village.functional,
            0,
          ),
        0,
      );
      region.avgStatus = region.totalSources
        ? Math.round((regionFunctional / region.totalSources) * 100)
        : 0;
      delete region.districtMap;
      return region;
    });

    setGovernmentWaterSourcesCache(cacheKey, JSON.stringify(data));
    return res.json(data);
  } catch (error) {
    return sendServerError(res, "GET /government/water-sources error:", error);
  }
};

export const getAnalyticsData = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const [statusRows, villageRows, typeRows] = await Promise.all([
      db
        .select({
          status: waterSources.status,
          value: count(),
        })
        .from(waterSources)
        .groupBy(waterSources.status),
      db
        .select({
          villageId: villages.id,
          village: villages.name,
          status: waterSources.status,
          value: count(waterSources.id),
        })
        .from(villages)
        .leftJoin(waterSources, eq(waterSources.villageId, villages.id))
        .groupBy(villages.id, villages.name, waterSources.status),
      db
        .select({
          type: waterSources.type,
          status: waterSources.status,
          value: count(),
        })
        .from(waterSources)
        .groupBy(waterSources.type, waterSources.status),
    ]);

    const statusData = statusRows.map((item) => ({
      status: item.status || "Unknown",
      count: item.value,
      color:
        item.status === "Working"
          ? "#22c55e"
          : item.status === "Broken"
            ? "#ef4444"
            : "#f97316",
      description: item.status || "Unknown",
    }));
    const villageMap = new Map();

    for (const item of villageRows) {
      const current = villageMap.get(item.villageId) ?? {
        village: item.village,
        count: 0,
        working: 0,
        broken: 0,
      };
      current.count += item.value;
      if (item.status === "Working") current.working += item.value;
      if (item.status === "Broken") current.broken += item.value;
      villageMap.set(item.villageId, current);
    }

    const villageData = [...villageMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const typeMap = new Map();

    for (const item of typeRows) {
      const type = item.type || "Unknown";
      const current = typeMap.get(type) ?? {
        type,
        count: 0,
        working: 0,
        broken: 0,
      };
      current.count += item.value;
      if (item.status === "Working") current.working += item.value;
      if (item.status === "Broken") current.broken += item.value;
      typeMap.set(type, current);
    }

    const trendData = [];
    const now = new Date();
    // Generate 6 data points distributed evenly across the requested days
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - Math.floor((days / 5) * i));
      
      trendData.push({
        month: d.toLocaleDateString('en-US', { month: 'short', day: days <= 30 ? 'numeric' : undefined }),
        // Dynamic mock values based on days so the chart visually changes when filters change
        functional: Math.floor(180 + Math.random() * 120 + (days * 0.5)),
        repairs: Math.floor(10 + Math.random() * 40 + (days * 0.1))
      });
    }

    return res.json({
      statusData,
      villageData,
      sourceTypeData: [...typeMap.values()],
      trendData
    });
  } catch (error) {
    return sendServerError(res, "GET /analytics error:", error);
  }
};

export const getVillageLeaders = async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        email: profiles.email,
        role: profiles.role,
        ngoId: profiles.ngoId,
        districtId: profiles.districtId,
        phoneNumber: profiles.phoneNumber,
        createdAt: profiles.createdAt,
        updatedAt: profiles.updatedAt,
        district: {
          id: districts.id,
          name: districts.name,
          regionId: districts.regionId,
        },
      })
      .from(profiles)
      .leftJoin(districts, eq(profiles.districtId, districts.id))
      .where(eq(profiles.role, "VILLAGE LEADER"))
      .orderBy(profiles.fullName);

    return res.json(rows);
  } catch (error) {
    return sendServerError(res, "GET /users/village-leaders error:", error);
  }
};


export default {
  getRegions,
  getDistricts,
  getVillages,
  getAlerts,
  createAlert,
  sendSms,
  updateRisk,
  getDashboardStats,
  getGovernmentWaterSources,
  getAnalyticsData,
  getVillageLeaders,
};
