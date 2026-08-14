'use strict';

const db = require('../db');
const nodemailer = require('nodemailer');
const { text, email, phone } = require('../utils/sanitize');
const { validateContactPayload } = require('../utils/validators');
const { tooMany, badRequest } = require('../utils/errors');

/* =========================
 * Rate limit simple mémoire
 * ========================= */
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;
const rateStore = new Map();

const getIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket?.remoteAddress ||
  'unknown';

const isRateLimited = (ip) => {
  const now = Date.now();
  const cur = rateStore.get(ip);

  if (!cur || now - cur.start > RATE_WINDOW_MS) {
    rateStore.set(ip, { count: 1, start: now });
    return false;
  }

  cur.count += 1;
  return cur.count > RATE_MAX;
};

/* =========================
 * SMTP
 * ========================= */
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
const CONTACT_TO = String(process.env.CONTACT_TO || SMTP_USER || '').trim();

const transporter =
  SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

/* =========================
 * Controller principal
 * ========================= */
const handleContact = async (req) => {
  const ip = getIp(req);

  if (isRateLimited(ip)) {
    throw tooMany('Trop de messages. Réessaie plus tard.');
  }

  if (String(req.body?.website || '').trim()) {
    return { mail_sent: false };
  }

  const payload = {
    full_name: text(req.body.full_name, 80),
    email: email(req.body.email),
    phone: phone(req.body.phone),
    subject: text(req.body.subject, 120),
    message: text(req.body.message, 4000),
    source_page: text(req.body.source_page || 'contact', 60),
  };

  validateContactPayload(payload);

  const insert = `
    INSERT INTO comptaclems.formulaire (full_name, email, message, source_page)
    VALUES ($1, $2, $3, $4)
    RETURNING id, created_at, status
  `;

  const { rows } = await db.query(insert, [
    payload.full_name,
    payload.email,
    payload.message,
    payload.source_page,
  ]);

  const saved = rows[0];
  let mail_sent = false;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"ComptaClems – Site" <${SMTP_USER}>`,
        to: CONTACT_TO,
        replyTo: payload.email,
        subject: `[Contact] ${payload.subject || 'Nouveau message'}`,
        text: payload.message,
      });
      mail_sent = true;
    } catch (e) {
      console.error('[CONTACT] email error:', e.message);
    }
  }

  return {
    id: saved.id,
    created_at: saved.created_at,
    status: saved.status,
    mail_sent,
  };
};

module.exports = {
  handleContact,
};
