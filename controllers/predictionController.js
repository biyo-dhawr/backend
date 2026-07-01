import { and, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiPredictions, alerts, villages } from "../db/schema.js";
import { predictDroughtRisk } from "../services/droughtRiskClient.js";
import { io } from "../index.js";

function parseId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : Number.NaN;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNullableNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateBoundary(value, endOfDateOnly = false) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const rawValue = String(value).trim();
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    return Number.NaN;
  }

  if (endOfDateOnly && isDateOnly(rawValue)) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function getPresetDateRange(value) {
  const range = String(value ?? "").trim().toLowerCase();
  if (!range) {
    return { start: null, end: null };
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (["today", "day"].includes(range)) {
    return { start: startOfToday, end: startOfTomorrow };
  }

  if (["week", "last-week", "last7days", "last-7-days"].includes(range)) {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start, end: now };
  }

  if (["month", "last-month", "last30days", "last-30-days"].includes(range)) {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start, end: now };
  }

  return {
    error: "Invalid range. Use today, week, or month.",
  };
}

function parsePredictionDateFilters(query) {
  const preset = getPresetDateRange(query.range ?? query.period);
  if (preset.error) {
    return preset;
  }

  const explicitStart = parseDateBoundary(
    query.from ?? query.dateFrom ?? query.startDate,
  );
  const explicitEnd = parseDateBoundary(
    query.to ?? query.dateTo ?? query.endDate,
    true,
  );

  if (Number.isNaN(explicitStart) || Number.isNaN(explicitEnd)) {
    return { error: "Invalid date filter. Use YYYY-MM-DD or an ISO date." };
  }

  const start = explicitStart ?? preset.start;
  const end = explicitEnd ?? preset.end;

  if (start && end && start >= end) {
    return { error: "Date filter start must be before end." };
  }

  return { start, end };
}

function normalizeFeatureRow(row) {
  return {
    villageId: toNumber(row.village_id),
    villageName: row.village_name,
    totalSources: toNumber(row.total_sources),
    workingSources: toNumber(row.working_sources),
    brokenSources: toNumber(row.broken_sources),
    maintenanceSources: toNumber(row.maintenance_sources),
    avgWaterLevel: toNullableNumber(row.avg_water_level),
    minWaterLevel: toNullableNumber(row.min_water_level),
    lowWaterSourceCount: toNumber(row.low_water_source_count),
    recentReportCount7Days: toNumber(row.recent_report_count_7_days),
    recentReportCount30Days: toNumber(row.recent_report_count_30_days),
    highSeverityReportCount30Days: toNumber(
      row.high_severity_report_count_30_days,
    ),
    verifiedReportCount30Days: toNumber(row.verified_report_count_30_days),
    currentRiskLevel: row.current_risk_level,
  };
}

function buildAlertMessage(prediction, villageName) {
  const reason = prediction.reasons?.[0]
    ? ` ${prediction.reasons[0]}`
    : "";

  return `System prediction: ${prediction.predictedLevel} drought risk detected in ${villageName}.${reason}`;
}

async function predictInBatches(features) {
  const batchSize = Math.min(
    Math.max(Number.parseInt(process.env.RISK_PREDICTION_BATCH_SIZE, 10) || 50, 1),
    100,
  );
  const predictions = [];

  for (let index = 0; index < features.length; index += batchSize) {
    const batch = features.slice(index, index + batchSize);
    const batchPredictions = await predictDroughtRisk(batch);
    predictions.push(...batchPredictions);
  }

  return predictions;
}

async function getVillageRiskFeatures(villageId = null) {
  const result = await db.execute(sql`
    WITH source_summary AS (
      SELECT
        village_id,
        COUNT(*)::int AS total_sources,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'working')::int AS working_sources,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'broken')::int AS broken_sources,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN ('needed maintenance', 'needs maintenance', 'maintenance')
        )::int AS maintenance_sources,
        AVG(water_level)::float AS avg_water_level,
        MIN(water_level)::float AS min_water_level,
        COUNT(*) FILTER (WHERE water_level IS NOT NULL AND water_level <= 35)::int AS low_water_source_count
      FROM water_sources
      GROUP BY village_id
    ),
    report_summary AS (
      SELECT
        village_id,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS recent_report_count_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS recent_report_count_30_days,
        COUNT(*) FILTER (
          WHERE created_at >= NOW() - INTERVAL '30 days'
          AND LOWER(COALESCE(severity_level, '')) IN ('high', 'critical', 'severe')
        )::int AS high_severity_report_count_30_days,
        COUNT(*) FILTER (
          WHERE created_at >= NOW() - INTERVAL '30 days'
          AND is_verified = true
        )::int AS verified_report_count_30_days
      FROM reports
      GROUP BY village_id
    )
    SELECT
      v.id AS village_id,
      v.name AS village_name,
      v.drought_risk_level AS current_risk_level,
      COALESCE(ss.total_sources, 0)::int AS total_sources,
      COALESCE(ss.working_sources, 0)::int AS working_sources,
      COALESCE(ss.broken_sources, 0)::int AS broken_sources,
      COALESCE(ss.maintenance_sources, 0)::int AS maintenance_sources,
      ss.avg_water_level,
      ss.min_water_level,
      COALESCE(ss.low_water_source_count, 0)::int AS low_water_source_count,
      COALESCE(rs.recent_report_count_7_days, 0)::int AS recent_report_count_7_days,
      COALESCE(rs.recent_report_count_30_days, 0)::int AS recent_report_count_30_days,
      COALESCE(rs.high_severity_report_count_30_days, 0)::int AS high_severity_report_count_30_days,
      COALESCE(rs.verified_report_count_30_days, 0)::int AS verified_report_count_30_days
    FROM villages v
    LEFT JOIN source_summary ss ON ss.village_id = v.id
    LEFT JOIN report_summary rs ON rs.village_id = v.id
    WHERE ${villageId ? sql`v.id = ${villageId}` : sql`true`}
    ORDER BY v.name
  `);

  return result.map(normalizeFeatureRow);
}

async function savePredictions(predictions, featuresByVillageId) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfNextDay = new Date(startOfDay);
  startOfNextDay.setDate(startOfNextDay.getDate() + 1);

  return db.transaction(async (tx) => {
    const saved = [];
    const alertsCreated = [];
    let insertedCount = 0;
    let updatedCount = 0;

    for (const prediction of predictions) {
      const feature = featuresByVillageId.get(prediction.villageId);
      if (!feature) continue;

      const predictionValues = {
        predictionDate: now,
        droughtRisk: prediction.droughtRisk,
        predictedLevel: prediction.predictedLevel,
        confidenceScore: prediction.confidenceScore,
        reasons: prediction.reasons ?? [],
      };

      const [existingPrediction] = await tx
        .select({ id: aiPredictions.id })
        .from(aiPredictions)
        .where(
          and(
            eq(aiPredictions.villageId, prediction.villageId),
            gte(aiPredictions.predictionDate, startOfDay),
            lt(aiPredictions.predictionDate, startOfNextDay),
          ),
        )
        .orderBy(desc(aiPredictions.predictionDate), desc(aiPredictions.id))
        .limit(1);

      const [savedPrediction] = existingPrediction
        ? await tx
            .update(aiPredictions)
            .set(predictionValues)
            .where(eq(aiPredictions.id, existingPrediction.id))
            .returning()
        : await tx
            .insert(aiPredictions)
            .values({
              villageId: prediction.villageId,
              ...predictionValues,
            })
            .returning();

      if (existingPrediction) {
        updatedCount++;
      } else {
        insertedCount++;
      }

      await tx
        .update(villages)
        .set({ droughtRiskLevel: prediction.predictedLevel })
        .where(eq(villages.id, prediction.villageId));

      saved.push({
        ...savedPrediction,
        reasons: prediction.reasons ?? [],
      });

      if (!["High", "Severe"].includes(prediction.predictedLevel)) {
        continue;
      }

      const [existingAlert] = await tx
        .select({ id: alerts.id })
        .from(alerts)
        .where(
          and(
            eq(alerts.villageId, prediction.villageId),
            eq(alerts.isActive, true),
            or(
              ilike(alerts.message, "System prediction:%"),
              ilike(alerts.message, "AI prediction:%"),
            ),
          ),
        )
        .limit(1);

      if (existingAlert) {
        continue;
      }

      const [alert] = await tx
        .insert(alerts)
        .values({
          villageId: prediction.villageId,
          message: buildAlertMessage(prediction, feature.villageName),
          severity: prediction.predictedLevel === "Severe" ? "critical" : "high",
          isActive: true,
        })
        .returning();

      alertsCreated.push(alert);
    }

    return { saved, alertsCreated, insertedCount, updatedCount };
  });
}

export const runDroughtPrediction = async (req, res) => {
  try {
    const villageId = parseId(req.query.villageId ?? req.body?.villageId);
    if (Number.isNaN(villageId)) {
      return res.status(400).json({ message: "Invalid villageId" });
    }

    const features = await getVillageRiskFeatures(villageId);
    if (villageId && !features.length) {
      return res.status(404).json({ message: "Village not found" });
    }

    // 1. Get predictions from Python AI (Fast)
    const predictions = await predictInBatches(features);
    
    // 2. Save to DB in the background because 150 sequential queries to Supabase is very slow!
    const featuresByVillageId = new Map(
      features.map((feature) => [feature.villageId, feature]),
    );
    
    savePredictions(predictions, featuresByVillageId)
      .then(({ saved }) => {
        // Emit event to other connected clients when DB finishes saving
        io.emit("prediction_updated", {
          message: "New predictions saved",
          count: saved.length
        });
      })
      .catch((err) => console.error("Background DB save failed:", err));

    // 3. IMMEDIATELY return the AI predictions to the frontend!
    return res.json({
      success: true,
      message: "AI prediction generated instantly!",
      count: predictions.length,
      // Pass the raw AI predictions back immediately so the UI can update without waiting for the DB
      predictions: predictions.map(p => ({
        ...p,
        predictionDate: new Date(),
        village: featuresByVillageId.get(p.villageId)
      })),
    });
  } catch (error) {
    console.error("POST /predictions/drought error:", error);
    return res.status(500).json({
      message: "Failed to start drought prediction",
      error: error.response?.data?.detail || error.message,
    });
  }
};

export const getDroughtPredictions = async (req, res) => {
  try {
    const villageId = parseId(req.query.villageId);
    if (Number.isNaN(villageId)) {
      return res.status(400).json({ message: "Invalid villageId" });
    }

    const dateFilters = parsePredictionDateFilters(req.query);
    if (dateFilters.error) {
      return res.status(400).json({ message: dateFilters.error });
    }

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
      200,
    );
    const conditions = [];

    if (villageId) {
      conditions.push(eq(aiPredictions.villageId, villageId));
    }
    if (dateFilters.start) {
      conditions.push(gte(aiPredictions.predictionDate, dateFilters.start));
    }
    if (dateFilters.end) {
      conditions.push(lt(aiPredictions.predictionDate, dateFilters.end));
    }

    const rows = await db
      .select()
      .from(aiPredictions)
      .leftJoin(villages, eq(aiPredictions.villageId, villages.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(aiPredictions.predictionDate), desc(aiPredictions.id))
      .limit(limit);

    return res.json(
      rows.map((row) => ({
        ...row.ai_predictions,
        village: row.villages,
      })),
    );
  } catch (error) {
    console.error("GET /predictions/drought error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
