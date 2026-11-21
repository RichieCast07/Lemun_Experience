import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { clientsRouter } from "./modules/clients/clients.routes.js";
import { eventsRouter } from "./modules/events/events.routes.js";
import { metricsRouter } from "./modules/metrics/metrics.routes.js";
import { ticketsRouter } from "./modules/tickets/tickets.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1); // detrás de un proxy/reverse-proxy la IP real llega en X-Forwarded-For
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["Content-Disposition"],
    })
  );
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "lumen-api", db: "up" });
    } catch {
      res.status(503).json({ status: "degraded", service: "lumen-api", db: "down" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/metrics", metricsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
