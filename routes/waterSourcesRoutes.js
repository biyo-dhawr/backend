import { Router } from "express";
import {
  create,
  deleteSource,
  getAll,
  updateStatus,
} from "../controllers/waterSourcesController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", getAll);
router.post(
  "/",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  create,
);
router.patch(
  "/:id/status",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  updateStatus,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  deleteSource,
);

export default router;
