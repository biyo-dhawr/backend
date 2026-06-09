import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  aiPredictions,
  alerts,
  districts,
  interventions,
  regions,
  reports,
  sensorReadings,
  villages,
  waterSources,
} from "../db/schema.js";

const CSV_FILES = ["SWIMS_LiveMap_Dataset_20260602-001839.csv"];
const TARGET_REGIONS = new Set(["Awdal"]);
const MAX_IMPORT_COUNT = 1000;

const regionCache = new Map();
const districtCache = new Map();
const villageCache = new Map();
const sourceCache = new Set();

function normalize(value) {
  return String(value ?? "").trim();
}

function cacheKey(...parts) {
  return parts
    .map((part) => normalize(part).toLocaleLowerCase())
    .join("\u0000");
}

function mapRegion(region, district) {
  if (region !== "Woqooyi Galbeed") {
    return region;
  }

  const normalizedDistrict = district.toLocaleLowerCase();
  if (
    ["hargeisa", "hargeysa", "gebiley", "gabiley"].some((name) =>
      normalizedDistrict.includes(name),
    )
  ) {
    return "Maroodi Jeex";
  }

  if (normalizedDistrict.includes("berbera")) {
    return "Saaxil";
  }

  return null;
}

function mapStatus(functioning) {
  switch (normalize(functioning).toLocaleLowerCase()) {
    case "yes":
      return "Working";
    case "no":
    case "abandoned":
      return "Broken";
    default:
      return "Unknown";
  }
}

function parseCoordinate(value) {
  const coordinate = Number.parseFloat(normalize(value));
  return Number.isFinite(coordinate) ? coordinate : null;
}

async function* parseCsv(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  let row = [];
  let field = "";
  let quoted = false;
  let pendingQuote = false;

  for await (const chunk of stream) {
    for (const char of chunk) {
      if (quoted) {
        if (pendingQuote) {
          if (char === '"') {
            field += '"';
            pendingQuote = false;
            continue;
          }

          quoted = false;
          pendingQuote = false;
        } else if (char === '"') {
          pendingQuote = true;
          continue;
        } else {
          field += char;
          continue;
        }
      }

      if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field.replace(/\r$/, ""));
        yield row;
        row = [];
        field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }
  }

  if (pendingQuote) {
    quoted = false;
  }
  if (quoted) {
    throw new Error(`Unclosed quoted field in ${filePath}`);
  }
  if (field || row.length) {
    row.push(field);
    yield row;
  }
}

async function wipeExistingData() {
  console.log("Wiping existing geographic and water-source data...");

  await db.transaction(async (tx) => {
    await tx.delete(sensorReadings);
    await tx.delete(reports);
    await tx.delete(alerts);
    await tx.delete(aiPredictions);
    await tx.delete(interventions);
    await tx.delete(waterSources);
    await tx.delete(villages);
    await tx.delete(districts);
    await tx.delete(regions);
  });

  console.log("Wipe complete.");
}

async function getOrCreateRegion(name) {
  const key = cacheKey(name);
  if (regionCache.has(key)) {
    return regionCache.get(key);
  }

  const [region] = await db
    .insert(regions)
    .values({ name })
    .onConflictDoUpdate({
      target: regions.name,
      set: { name: sql`excluded.name` },
    })
    .returning();

  regionCache.set(key, region);
  return region;
}

async function getOrCreateDistrict(name, regionId) {
  const key = cacheKey(regionId, name);
  if (districtCache.has(key)) {
    return districtCache.get(key);
  }

  let [district] = await db
    .select()
    .from(districts)
    .where(and(eq(districts.regionId, regionId), eq(districts.name, name)))
    .limit(1);

  if (!district) {
    [district] = await db
      .insert(districts)
      .values({ name, regionId })
      .returning();
  }

  districtCache.set(key, district);
  return district;
}

async function getOrCreateVillage(name, districtId, latitude, longitude) {
  const key = cacheKey(districtId, name);
  if (villageCache.has(key)) {
    return villageCache.get(key);
  }

  let [village] = await db
    .select()
    .from(villages)
    .where(and(eq(villages.districtId, districtId), eq(villages.name, name)))
    .limit(1);

  if (!village) {
    [village] = await db
      .insert(villages)
      .values({ name, districtId, latitude, longitude })
      .returning();
  }

  villageCache.set(key, village);
  return village;
}

async function sourceExists(name, villageId) {
  const key = cacheKey(villageId, name);
  if (sourceCache.has(key)) {
    return true;
  }

  const [source] = await db
    .select({ id: waterSources.id })
    .from(waterSources)
    .where(
      and(
        eq(waterSources.villageId, villageId),
        sql`lower(${waterSources.name}) = lower(${name})`,
      ),
    )
    .limit(1);

  if (source) {
    sourceCache.add(key);
    return true;
  }

  return false;
}

async function processFile(filePath, currentTotal) {
  let headers;
  let recordNumber = 0;
  let importedCount = 0;
  let skippedCount = 0;

  for await (const row of parseCsv(filePath)) {
    recordNumber++;

    if (!headers) {
      headers = row.map((header) => normalize(header).toLocaleLowerCase());
      continue;
    }

    if (currentTotal + importedCount >= MAX_IMPORT_COUNT) {
      break;
    }

    const data = Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? ""]),
    );
    const rawRegion = normalize(data.region);
    const districtName = normalize(data.district);

    if (!TARGET_REGIONS.has(rawRegion) || !districtName) {
      skippedCount++;
      continue;
    }

    const regionName = mapRegion(rawRegion, districtName);
    const villageName = normalize(
      data.nearest_settlement_name || data.source_name,
    );
    const sourceName = normalize(data.source_name) || "Unknown Source";

    if (!regionName || !villageName) {
      skippedCount++;
      continue;
    }

    const latitude = parseCoordinate(data.latitude);
    const longitude = parseCoordinate(data.longitude);

    try {
      const region = await getOrCreateRegion(regionName);
      const district = await getOrCreateDistrict(districtName, region.id);
      const village = await getOrCreateVillage(
        villageName,
        district.id,
        latitude,
        longitude,
      );

      if (await sourceExists(sourceName, village.id)) {
        skippedCount++;
        continue;
      }

      await db.insert(waterSources).values({
        villageId: village.id,
        name: sourceName,
        type: normalize(data.water_source_type) || "Borehole",
        status: mapStatus(data.functioning),
        latitude,
        longitude,
      });

      sourceCache.add(cacheKey(village.id, sourceName));
      importedCount++;
    } catch (error) {
      skippedCount++;
      console.error(
        `Failed to import CSV record ${recordNumber}:`,
        error.message,
      );
    }
  }

  console.log(
    `Imported ${importedCount} water sources from ${path.basename(filePath)} (${skippedCount} skipped).`,
  );
  return currentTotal + importedCount;
}

async function main() {
  console.log("Starting SWIMS data import...");
  await wipeExistingData();

  let totalImported = 0;
  for (const csvFile of CSV_FILES) {
    if (totalImported >= MAX_IMPORT_COUNT) {
      break;
    }

    const filePath = path.resolve(process.cwd(), csvFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    console.log(`Processing ${csvFile}...`);
    totalImported = await processFile(filePath, totalImported);
  }

  console.log(`Import completed. Total imported: ${totalImported}`);
}

main()
  .catch((error) => {
    console.error("SWIMS import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
