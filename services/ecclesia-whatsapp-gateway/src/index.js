require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const pino = require("pino");

const { router: otpRouter } = require("./routes/otp");
const { router: messagesRouter } = require("./routes/messages");
const { router: sessionsRouter, initSession } = require("./routes/sessions");

// ── Logger ────────────────────────────────────────────────────────────────────

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? "3100", 10);

// ── Middlewares ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "1mb" }));

// Rate limiting global
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    message: { error: "Too many requests" },
  }),
);

// Rate limiting mais restrito para OTP
app.use(
  "/send-otp",
  rateLimit({
    windowMs: 60_000,
    max: 10,
    message: { error: "Too many OTP requests" },
  }),
);

// Autenticação por API Key
app.use((req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const expected = process.env.GATEWAY_API_KEY;

  if (!expected) {
    logger.warn("GATEWAY_API_KEY não definida — gateway operando sem autenticação!");
    return next();
  }

  if (req.path === "/health") return next();

  if (apiKey !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// ── Rotas ─────────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mode: process.env.MOCK_MODE === "true" ? "mock" : "real",
    timestamp: new Date().toISOString(),
  });
});

app.use("/", otpRouter);
app.use("/", messagesRouter);
app.use("/sessions", sessionsRouter);

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`Ecclesia WhatsApp Gateway rodando na porta ${PORT}`);
  logger.info(`Modo: ${process.env.MOCK_MODE === "true" ? "MOCK" : "REAL"}`);

  // Iniciar sessão WhatsApp automaticamente se não for mock
  if (process.env.MOCK_MODE !== "true") {
    initSession(logger).catch((err) =>
      logger.error({ err }, "Falha ao iniciar sessão WhatsApp"),
    );
  }
});

module.exports = app;
