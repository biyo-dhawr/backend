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
  authorize(["ADMIN", "GOVERNMENT", "NGO_WORKER"]),
  create,
);
router.patch(
  "/:id/status",
  authenticate,
  authorize(["ADMIN", "GOVERNMENT", "NGO_WORKER"]),
  updateStatus,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN", "GOVERNMENT", "NGO_WORKER"]),
  deleteSource,
);

export default router;
