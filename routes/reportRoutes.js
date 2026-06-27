import { Router } from "express";
import {
  create,
  deleteReport,
  getAll,
  getWeeklyTrend,
  rejectReport,
  verifyReport,
} from "../controllers/reportController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

// ── Read ────────────────────────────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  getAll,
);

// Weekly trend — 7-day report frequency (public-accessible for dashboard)
router.get(
  "/trend/weekly",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  getWeeklyTrend,
);

// ── Create ──────────────────────────────────────────────────────────────────
router.post("/submit/secure", authenticate, create);
// Public submissions (community members without account)
router.post("/submit/public", create);

// ── Verify / Reject ─────────────────────────────────────────────────────────
// PUT (as requested) and PATCH alias for backwards compatibility
router.put(
  "/:id/verify",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  verifyReport,
);
router.patch(
  "/:id/verify",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  verifyReport,
);
router.put(
  "/:id/reject",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  rejectReport,
);

// ── Delete ──────────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  deleteReport,
);

export default router;
