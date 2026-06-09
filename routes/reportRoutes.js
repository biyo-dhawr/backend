import { Router } from "express";
import {
  create,
  deleteReport,
  getAll,
  verifyReport,
} from "../controllers/reportController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  getAll,
);
router.post("/submit/secure", authenticate, create);
//public submissions
router.post("/submit/public", create);
router.patch(
  "/:id/verify",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  verifyReport,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]),
  deleteReport,
);

export default router;
