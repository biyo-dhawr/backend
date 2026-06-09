import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { ensureDatabase } from "./db/index.js";
import authRoutes from "./routes/authRoutes.js";
import waterSourcesRoutes from "./routes/waterSourcesRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";

const app = express();

app.use(cors(
  {
  origin: "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}
));
app.use(morgan("dev"));
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/water-sources", waterSourcesRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.send("ogaal api!");
});

async function start() {
  try {
    await ensureDatabase();
    app.listen(process.env.PORT, () => {
      console.log(`App is running on http://localhost:${process.env.PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server - database unavailable:", err);
    process.exit(1);
  }
}

start();
