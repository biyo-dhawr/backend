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
  authorize(["ADMIN", "GOVERNMENT", "NGO_WORKER"]),
  getAll,
);
router.post("/submit/secure", authenticate, create);
//public submissions
router.post("/submit/public", create);
router.patch(
  "/:id/verify",
  authenticate,
  authorize(["ADMIN", "GOVERNMENT", "NGO_WORKER"]),
  verifyReport,
);
router.delete(
  "/:id",
  authenticate,
  authorize(["ADMIN", "GOVERNMENT", "NGO_WORKER"]),
  deleteReport,
);

export default router;
