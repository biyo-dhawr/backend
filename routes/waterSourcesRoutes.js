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
  authorize(["ADMIN", "GOVERNMENT", "VILLAGE_LEADER"]),
  create,
);
router.patch(
  "/:id/status",
  authenticate,
  authorize(["ADMIN", "GOVERNMENT", "VILLAGE_LEADER"]),
  updateStatus,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN", "GOVERNMENT", "VILLAGE_LEADER"]),
  deleteSource,
);

export default router;
