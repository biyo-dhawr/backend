import { Router } from "express";
import {
  create,
  deleteSource,
  getAll,
  updateStatus,
  updateSource,
  bulkUpdateStatus,
  getFailureIntelligence,
  getFailureIntelligenceById,
  generateSourceReport,
} from "../controllers/waterSourcesController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", getAll);
router.get(
  "/intelligence",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  getFailureIntelligence,
);
router.get(
  "/:id/intelligence",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  getFailureIntelligenceById,
);
router.post(
  "/:id/report",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  generateSourceReport,
);
router.post(
  "/",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  create,
);
router.patch(
  "/bulk-status",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  bulkUpdateStatus,
);

router.patch(
  "/:id/status",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  updateStatus,
);
router.put(
  "/:id",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  updateSource,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  deleteSource,
);

export default router;
