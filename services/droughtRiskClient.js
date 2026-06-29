import axios from "axios";

const DEFAULT_RISK_SERVICE_URL = "http://localhost:8000";

export async function predictDroughtRisk(villages) {
  const baseUrl = (
    process.env.RISK_SERVICE_URL || DEFAULT_RISK_SERVICE_URL
  ).replace(/\/$/, "");
  const headers = {};

  if (process.env.RISK_SERVICE_TOKEN) {
    headers["X-Internal-Token"] = process.env.RISK_SERVICE_TOKEN;
  }

  const response = await axios.post(
    `${baseUrl}/predict/drought/batch`,
    { villages },
    {
      headers,
      timeout: Number(process.env.RISK_SERVICE_TIMEOUT_MS || 10000),
    },
  );

  return response.data;
}
