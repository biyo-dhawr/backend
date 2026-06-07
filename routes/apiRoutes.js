import { Router } from "express";
import {
  createAlert,
  getAdminWaterSources,
  getAlerts,
  getAnalyticsData,
  getDashboardStats,
  getDistricts,
  getRegions,
  getVillages,
  sendSms,
  updateRisk,
} from "../controllers/apiController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();
const staffOnly = authorize(["ADMIN", "GOVERNMENT", "VILLAGE_LEADER"]);

router.get("/regions", getRegions);
router.get("/districts", getDistricts);
router.get("/villages", getVillages);
router.get("/alerts", getAlerts);

router.post("/alerts", authenticate, staffOnly, createAlert);
router.post("/sms", authenticate, staffOnly, sendSms);
router.post("/simulation/risk", authenticate, staffOnly, updateRisk);
router.get("/dashboard/stats", authenticate, staffOnly, getDashboardStats);
router.get(
  "/admin/water-sources",
  authenticate,
  staffOnly,
  getAdminWaterSources,
);
router.get("/analytics", authenticate, staffOnly, getAnalyticsData);

export default router;
