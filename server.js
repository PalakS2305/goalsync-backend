const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const goalRoutes = require("./routes/goalRoutes");
const managerRoutes = require("./routes/managerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const quarterlyRoutes = require("./routes/quarterlyRoutes");

const app = express();

// ── CORS — allow frontend domains ──
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  process.env.FRONTEND_URL, // Vercel URL added later
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

// ── Routes ──
app.use("/api/auth", authRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/quarterly", quarterlyRoutes);

// ── Health Check ──
app.get("/", (req, res) => {
  res.json({
    message: "GoalSync API is running ✅",
    version: "1.0.0",
    env: process.env.NODE_ENV || "development",
  });
});

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`GoalSync server running on port ${PORT}`);
});
