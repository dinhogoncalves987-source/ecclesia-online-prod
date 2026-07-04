/**
 * Rota POST /send-otp
 * Envia código OTP via WhatsApp para o membro autenticar.
 *
 * Corpo esperado:
 *   { phone: "+5551999999999", otp: "123456", memberName: "João" }
 *
 * Segurança:
 *   - Requer X-API-Key
 *   - Rate limiting via middleware global
 *   - O código OTP é gerado pelo Supabase Edge Function (não aqui)
 *   - Este gateway apenas envia a mensagem
 */

const express = require("express");
const router = express.Router();

const MOCK_MODE = process.env.MOCK_MODE === "true";

// ── Template de mensagem OTP ──────────────────────────────────────────────────

function buildOtpMessage(memberName, otp) {
  const name = memberName ? memberName.split(" ")[0] : "Membro";
  return [
    `🔐 *Ecclesia — Código de Acesso*`,
    ``,
    `Olá, ${name}!`,
    ``,
    `Seu código de acesso é:`,
    ``,
    `*${otp}*`,
    ``,
    `⏱ Válido por 10 minutos.`,
    `🚫 Não compartilhe este código com ninguém.`,
    ``,
    `Se você não solicitou este código, ignore esta mensagem.`,
  ].join("\n");
}

// ── POST /send-otp ────────────────────────────────────────────────────────────

router.post("/send-otp", async (req, res) => {
  const { phone, otp, memberName } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: "phone e otp são obrigatórios" });
  }

  const message = buildOtpMessage(memberName, otp);

  if (MOCK_MODE) {
    console.log(`[MOCK] OTP para ${phone}: ${otp}`);
    return res.json({ ok: true, messageId: `mock-${Date.now()}`, mock: true });
  }

  // Modo real: delegar ao sender do WhatsApp (importado das sessions)
  try {
    const { getWhatsAppSock } = require("./sessions");
    const sock = getWhatsAppSock();

    if (!sock) {
      return res.status(503).json({ error: "whatsapp_not_connected" });
    }

    const jid = phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    const sentMsg = await sock.sendMessage(jid, { text: message });

    return res.json({
      ok: true,
      messageId: sentMsg?.key?.id ?? null,
    });
  } catch (err) {
    console.error("[send-otp] erro:", err);
    return res.status(500).json({ error: "send_failed", detail: String(err) });
  }
});

module.exports = { router };
