/**
 * Gerenciamento de sessão WhatsApp via Baileys.
 *
 * GET  /sessions         → status atual da sessão
 * POST /sessions/connect → iniciar conexão (gera QR ou restaura sessão)
 * POST /sessions/disconnect → desconectar
 *
 * A sessão é mantida em memória + arquivos de auth em ./auth_info_baileys
 */

const express = require("express");
const router = express.Router();
const path = require("path");

const MOCK_MODE = process.env.MOCK_MODE === "true";
const AUTH_DIR = path.join(__dirname, "../../auth_info_baileys");

let whatsappSock = null;
let sessionStatus = "disconnected";
let lastQR = null;

// ── Getter público da sessão ──────────────────────────────────────────────────

function getWhatsAppSock() {
  return whatsappSock;
}

// ── Inicializar sessão WhatsApp ───────────────────────────────────────────────

async function initSession(logger) {
  if (MOCK_MODE) {
    sessionStatus = "connected_mock";
    if (logger) logger.info("WhatsApp Gateway em modo MOCK");
    return;
  }

  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
    } = require("@whiskeysockets/baileys");
    const { Boom } = require("@hapi/boom");
    const fs = require("fs");

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: logger ?? console,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastQR = qr;
        sessionStatus = "waiting_qr";
        if (logger) logger.info("QR Code disponível — escaneie com o WhatsApp");
      }

      if (connection === "open") {
        sessionStatus = "connected";
        lastQR = null;
        whatsappSock = sock;
        if (logger) logger.info("WhatsApp conectado com sucesso!");
      }

      if (connection === "close") {
        const shouldReconnect =
          new Boom(lastDisconnect?.error)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        sessionStatus = "disconnected";
        whatsappSock = null;

        if (logger) logger.warn({ shouldReconnect }, "WhatsApp desconectado");

        if (shouldReconnect) {
          setTimeout(() => initSession(logger), 5000);
        }
      }
    });
  } catch (err) {
    if (logger) logger.error({ err }, "Erro ao inicializar sessão WhatsApp");
    sessionStatus = "error";
  }
}

// ── GET /sessions ─────────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  res.json({
    status: sessionStatus,
    mock: MOCK_MODE,
    hasQR: !!lastQR,
    connectedAt: whatsappSock ? new Date().toISOString() : null,
  });
});

// ── POST /sessions/connect ────────────────────────────────────────────────────

router.post("/connect", async (req, res) => {
  if (sessionStatus === "connected" || sessionStatus === "connected_mock") {
    return res.json({ ok: true, status: sessionStatus });
  }

  initSession(null).catch(console.error);
  res.json({ ok: true, status: "connecting", message: "Iniciando sessão…" });
});

// ── POST /sessions/disconnect ─────────────────────────────────────────────────

router.post("/disconnect", async (req, res) => {
  if (whatsappSock) {
    await whatsappSock.logout().catch(() => {});
    whatsappSock = null;
  }
  sessionStatus = "disconnected";
  res.json({ ok: true });
});

module.exports = { router, initSession, getWhatsAppSock };
