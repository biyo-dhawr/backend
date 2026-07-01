import { Router } from "express";
import {
  createAlert,
  getGovernmentWaterSources,
  getAlerts,
  getAnalyticsData,
  getDashboardStats,
  getDistricts,
  getRegions,
  getVillages,
  sendSms,
  updateRisk,
  getVillageLeaders
} from "../controllers/apiController.js";
import { updateVillageLeaders, saveVillageLeader, deleteVillageLeader } from "../controllers/authController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();
const staffOnly = authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]);

router.get("/users/village-leaders", authenticate, staffOnly, getVillageLeaders);
router.put("/users/village-leaders/:id", authenticate, staffOnly, updateVillageLeaders);
router.post("/users/village-leaders", authenticate, staffOnly, saveVillageLeader);
router.delete("/users/village-leaders/:id", authenticate, staffOnly, deleteVillageLeader);
router.get("/regions", getRegions);
router.get("/districts", getDistricts);
router.get("/villages", getVillages);
router.get("/alerts", getAlerts);

router.post("/alerts", authenticate, staffOnly, createAlert);
router.post("/sms", authenticate, staffOnly, sendSms);
router.post("/simulation/risk", authenticate, staffOnly, updateRisk);
router.get("/dashboard/stats", authenticate, staffOnly, getDashboardStats);
router.get(
  "/government/water-sources",
  authenticate,
  staffOnly,
  getGovernmentWaterSources,
);
router.get("/analytics", authenticate, staffOnly, getAnalyticsData);

export default router;
