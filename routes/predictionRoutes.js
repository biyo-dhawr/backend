import { Router } from "express";
import {
  getDroughtPredictions,
  runDroughtPrediction,
} from "../controllers/predictionController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();
const staffOnly = authorize(["GOVERNMENT WORKER", "VILLAGE LEADER"]);

router.get("/drought", authenticate, staffOnly, getDroughtPredictions);
router.post("/drought", authenticate, staffOnly, runDroughtPrediction);

export default router;
