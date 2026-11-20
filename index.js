require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const mainRoute = require("./routes/index");
const { dbConnect, isDbReady } = require("./db");

const port = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.error("[config] JWT_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json({ limit: "20kb" }));

// Health check: used by the frontend to detect a sleeping/booting server and
// usable as Render's health check path.
app.get(["/health", "/api/v1/health"], (req, res) => {
  const ready = isDbReady();
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    db: ready ? "connected" : "disconnected",
    uptime: Math.round(process.uptime()),
  });
});

// Every other API call needs the database. Answer 503 straight away instead of
// timing out, so the client can show a clear message and retry.
app.use("/api/v1", (req, res, next) => {
  if (isDbReady()) return next();
  res.set("Retry-After", "5");
  return res.status(503).json({
    msg: "We're having trouble reaching the database. Please try again in a moment.",
  });
});

app.use("/api/v1", mainRoute);

app.use((req, res) => {
  res.status(404).json({ msg: `No route for ${req.method} ${req.path}` });
});

// Central error handler: every thrown or rejected error ends up here.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ msg: "Request body is not valid JSON." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ msg: "Request body is too large." });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ msg: err.message, ...err.extra });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ msg: "Invalid id." });
  }
  if (err.code === 11000) {
    return res.status(409).json({ msg: "That record already exists." });
  }
  if (err.name === "MongooseServerSelectionError" || err.name === "MongoNetworkError" ||
      /buffering timed out/.test(err.message || "")) {
    return res.status(503).json({ msg: "Database is temporarily unavailable. Please try again." });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ msg: "Something went wrong on our side. Please try again." });
});

// Last line of defence: log instead of dying silently on a stray rejection.
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[process] uncaught exception:", err);
  process.exit(1); // state may be corrupt; let Render restart us cleanly
});

const server = app.listen(port, () => {
  console.log(`server started at: http://localhost:${port}/`);
});

dbConnect();

const shutdown = (signal) => {
  console.log(`[process] ${signal} received, shutting down`);
  server.close(() => {
    mongoose.connection.close(false).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
