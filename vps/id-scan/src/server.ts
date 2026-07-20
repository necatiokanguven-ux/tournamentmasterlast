import express from "express";
import dotenv from "dotenv";
import { createIdScanRouter } from "./routes";

dotenv.config();
dotenv.config({ path: ".env.local", override: false });

const app = express();
const PORT = Number(process.env.PORT || 3010);

app.use(express.json({ limit: "8mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use("/api/id-scan", createIdScanRouter());

app.listen(PORT, () => {
  console.log(`PokerClup ID Scan API listening on http://127.0.0.1:${PORT}/api/id-scan`);
  console.log(`Gemini configured: ${Boolean(process.env.GEMINI_API_KEY?.trim())}`);
});
