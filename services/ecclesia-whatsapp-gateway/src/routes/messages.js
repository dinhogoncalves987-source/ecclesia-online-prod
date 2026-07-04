/**
 * Rota POST /send-message
 * Envia mensagem genérica via WhatsApp.
 * Usada para: convites de membros, notificações da secretaria, broadcasts.
 *
 * Corpo esperado:
 *   {
 *     phone: "+5551999999999",
 *     message: "Texto da mensagem",
 *     type: "invite" | "notification" | "broadcast",
 *     organizationId?: string
 *   }
 */

const express = require("express");
const router = express.Router();

const MOCK_MODE = process.env.MOCK_MODE === "true";

// ── Delay humano anti-spam ────────────────────────────────────────────────────

function humanDelay(min = 800, max = 2000) {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.random() * (max - min) + min),
  );
}

// ── POST /send-message ────────────────────────────────────────────────────────

router.post("/send-message", async (req, res) => {
  const { phone, message, type = "notification" } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: "phone e message são obrigatórios" });
  }

  if (MOCK_MODE) {
    console.log(`[MOCK] Mensagem (${type}) para ${phone}: ${message.slice(0, 50)}...`);
    return res.json({ ok: true, messageId: `mock-${Date.now()}`, mock: true });
  }

  try {
    const { getWhatsAppSock } = require("./sessions");
    const sock = getWhatsAppSock();

    if (!sock) {
      return res.status(503).json({ error: "whatsapp_not_connected" });
    }

    // Delay humano para evitar bloqueio do WhatsApp
    await humanDelay();

    const jid = phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    const sentMsg = await sock.sendMessage(jid, { text: message });

    return res.json({
      ok: true,
      messageId: sentMsg?.key?.id ?? null,
    });
  } catch (err) {
    console.error("[send-message] erro:", err);
    return res.status(500).json({ error: "send_failed", detail: String(err) });
  }
});

module.exports = { router };
