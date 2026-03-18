import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import https from "https";
import express from "express";
import cors from "cors";
import multer from "multer";
import initSqlJs from "sql.js";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const [key, ...rest] = line.split("=");
    if (!key) continue;
    const value = rest.join("=").trim();
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = value;
    }
  }
}

loadEnv();

const PORT = Number(process.env.PORT || 8000);
const DB_PATH = process.env.DATABASE_PATH || "./data.db";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const QR_SECRET = process.env.QR_SECRET || "dev-insecure-change-me";
const QR_TOKEN_WINDOW_SECONDS = Math.max(10, Number(process.env.QR_TOKEN_WINDOW_SECONDS || 30));
const WEBHOOK_TIMEOUT_MS = Math.max(1000, Number(process.env.WEBHOOK_TIMEOUT_MS || 4000));
const BRANDING_DEFAULTS = {
  name: process.env.BRAND_NAME || "GETTICKET",
  logo_url: process.env.BRAND_LOGO_URL || "",
  primary_color: process.env.BRAND_PRIMARY_COLOR || "#0a7f5a",
  accent_color: process.env.BRAND_ACCENT_COLOR || "#FDD835",
  support_email: process.env.BRAND_SUPPORT_EMAIL || ""
};
const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL || "";
const DELIVERY_EMAIL_WEBHOOK_URL = process.env.DELIVERY_EMAIL_WEBHOOK_URL || "";
const DELIVERY_WHATSAPP_WEBHOOK_URL = process.env.DELIVERY_WHATSAPP_WEBHOOK_URL || "";
const DELIVERY_WEBHOOK_SECRET = process.env.DELIVERY_WEBHOOK_SECRET || "";

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hashed = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hashed}`;
}

function verifyPassword(password, stored) {
  const [salt, hashed] = stored.split(":");
  const hashedAttempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(hashedAttempt, "hex"));
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

const sqlPromise = initSqlJs();

async function main() {
  const SQL = await sqlPromise;
  const dbFile = path.resolve(DB_PATH);
  let db;

  if (fs.existsSync(dbFile)) {
    const fileBuffer = fs.readFileSync(dbFile);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    db = new SQL.Database();
  }

  function persistDb() {
    const data = db.export();
    fs.writeFileSync(dbFile, Buffer.from(data));
  }

    function dbExec(sql, params = []) {
    db.run(sql, params);
    persistDb();
  }

  function dbGet(sql, params = []) {

    const stmt = db.prepare(sql, params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  function dbAll(sql, params = []) {
    const stmt = db.prepare(sql, params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  function ensureColumn(table, column, type, defaultSql = "") {
    const columns = dbAll(`PRAGMA table_info(${table})`);
    if (!columns.some((col) => col.name === column)) {
      const clause = defaultSql ? `${defaultSql}` : "";
      dbExec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} ${clause}`.trim());
    }
  }

  function getSetting(key, fallback = null) {
    const row = dbGet("SELECT value FROM settings WHERE key = ?", [key]);
    if (!row) return fallback;
    return safeJsonParse(row.value, fallback);
  }

  function setSetting(key, value) {
    const serialized = JSON.stringify(value);
    const exists = dbGet("SELECT key FROM settings WHERE key = ?", [key]);
    if (exists) {
      dbExec("UPDATE settings SET value = ? WHERE key = ?", [serialized, key]);
    } else {
      dbExec("INSERT INTO settings (key, value) VALUES (?, ?)", [serialized, key]);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_organizer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      location TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price_kes INTEGER NOT NULL,
      capacity INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      ticket_type_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      code TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      checked_in_at TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      nfc_uid TEXT,
      nfc_bound_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      amount_kes INTEGER NOT NULL,
      status TEXT NOT NULL,
      mpesa_receipt TEXT,
      merchant_request_id TEXT,
      checkout_request_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      secret TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      scanned_at TEXT NOT NULL,
      method TEXT NOT NULL,
      meta TEXT
    );
    CREATE TABLE IF NOT EXISTS ticket_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT,
      payload TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      error TEXT
    );
  `);
  ensureColumn("users", "is_organizer", "INTEGER", "DEFAULT 0");
  ensureColumn("tickets", "nfc_uid", "TEXT");
  ensureColumn("tickets", "nfc_bound_at", "TEXT");
  ensureColumn("ticket_types", "fee_kes", "INTEGER", "DEFAULT 0");
  ensureColumn("ticket_types", "pass_fee", "INTEGER", "DEFAULT 0");
  ensureColumn("ticket_types", "currency", "TEXT", "DEFAULT 'KES'");
  ensureColumn("payments", "base_amount_kes", "INTEGER");
  ensureColumn("payments", "fee_kes", "INTEGER");
  ensureColumn("payments", "total_amount_kes", "INTEGER");
  ensureColumn("payments", "pass_fee", "INTEGER", "DEFAULT 0");
  ensureColumn("payments", "provider", "TEXT");
  persistDb();

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(cors({ origin: true, credentials: true }));
  app.use("/uploads", express.static(UPLOAD_DIR));

  function authMiddleware(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ detail: "Missing token" });
    const session = dbGet("SELECT * FROM sessions WHERE token = ?", [token]);
    if (!session) return res.status(401).json({ detail: "Invalid token" });
    const user = dbGet("SELECT * FROM users WHERE id = ?", [session.user_id]);
    if (!user) return res.status(401).json({ detail: "User not found" });
    req.user = user;
    req.token = token;
    return next();
  }

  function optionalAuth(req, _res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();
    const session = dbGet("SELECT * FROM sessions WHERE token = ?", [token]);
    if (!session) return next();
    const user = dbGet("SELECT * FROM users WHERE id = ?", [session.user_id]);
    if (user) {
      req.user = user;
    }
    return next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({ detail: "Admin access required" });
    }
    return next();
  }

  function isStaff(user) {
    return Boolean(user && (user.is_admin || user.is_organizer));
  }

  function requireStaff(req, res, next) {
    if (!isStaff(req.user)) {
      return res.status(403).json({ detail: "Staff access required" });
    }
    return next();
  }

  function canManageEvent(user, event) {
    if (!user || !event) return false;
    if (user.is_admin) return true;
    if (user.is_organizer && Number(event.created_by) === Number(user.id)) return true;
    return false;
  }

  function requireEventAccess(req, res, eventId) {
    const event = dbGet("SELECT * FROM events WHERE id = ?", [eventId]);
    if (!event) {
      res.status(404).json({ detail: "Event not found" });
      return null;
    }
    if (!canManageEvent(req.user, event)) {
      res.status(403).json({ detail: "Organizer access required" });
      return null;
    }
    return event;
  }

  function requireTicketEventAccess(req, res, ticket) {
    if (!ticket) return null;
    const event = dbGet("SELECT * FROM events WHERE id = ?", [ticket.event_id]);
    if (!event) {
      res.status(404).json({ detail: "Event not found" });
      return null;
    }
    if (!canManageEvent(req.user, event)) {
      res.status(403).json({ detail: "Organizer access required" });
      return null;
    }
    return event;
  }

  function getBranding() {
    const stored = getSetting("branding", {});
    return { ...BRANDING_DEFAULTS, ...stored };
  }

  function normalizeEventList(events) {
    if (Array.isArray(events)) {
      return events.map((event) => String(event).trim()).filter(Boolean);
    }
    if (typeof events === "string") {
      return events.split(",").map((event) => event.trim()).filter(Boolean);
    }
    return [];
  }

  function listWebhooks() {
    return dbAll("SELECT * FROM webhook_subscriptions ORDER BY id DESC");
  }

  function shouldNotify(sub, eventName) {
    const events = normalizeEventList(sub.events);
    return events.includes("*") || events.includes(eventName);
  }

  function sendWebhook(sub, eventName, payload) {
    const target = new URL(sub.url);
    const body = JSON.stringify({
      event: eventName,
      data: payload,
      sent_at: nowIso()
    });
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "getticket-webhook/1.0",
      "Content-Length": Buffer.byteLength(body)
    };
    if (sub.secret) {
      const signature = crypto.createHmac("sha256", sub.secret).update(body).digest("hex");
      headers["X-Webhook-Signature"] = signature;
    }
    const client = target.protocol === "https:" ? https : http;
    return new Promise((resolve) => {
      const req = client.request(
        {
          method: "POST",
          hostname: target.hostname,
          port: target.port || (target.protocol === "https:" ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          headers
        },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        }
      );
      req.on("error", () => resolve());
      req.setTimeout(WEBHOOK_TIMEOUT_MS, () => {
        req.destroy();
        resolve();
      });
      req.write(body);
      req.end();
    });
  }

  function triggerWebhooks(eventName, payload) {
    const subs = listWebhooks();
    for (const sub of subs) {
      if (!shouldNotify(sub, eventName)) continue;
      void sendWebhook(sub, eventName, payload);
    }
  }

  function getPublicWebUrl(req) {
    if (PUBLIC_WEB_URL) return PUBLIC_WEB_URL;
    return `${req.protocol}://${req.get("host")}`;
  }

  function buildTicketUrl(req, ticketId) {
    return `${getPublicWebUrl(req)}/#/ticket?id=${ticketId}`;
  }

  function deliveryWebhookUrl(channel) {
    if (channel === "email") return DELIVERY_EMAIL_WEBHOOK_URL;
    if (channel === "whatsapp") return DELIVERY_WHATSAPP_WEBHOOK_URL;
    return "";
  }

  function sendDeliveryWebhook(url, payload) {
    const target = new URL(url);
    const body = JSON.stringify(payload);
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "getticket-delivery/1.0",
      "Content-Length": Buffer.byteLength(body)
    };
    if (DELIVERY_WEBHOOK_SECRET) {
      const signature = crypto.createHmac("sha256", DELIVERY_WEBHOOK_SECRET).update(body).digest("hex");
      headers["X-Delivery-Signature"] = signature;
    }
    const client = target.protocol === "https:" ? https : http;
    return new Promise((resolve) => {
      const req = client.request(
        {
          method: "POST",
          hostname: target.hostname,
          port: target.port || (target.protocol === "https:" ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          headers
        },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
        }
      );
      req.on("error", () => resolve({ ok: false, status: 0 }));
      req.setTimeout(WEBHOOK_TIMEOUT_MS, () => {
        req.destroy();
        resolve({ ok: false, status: 0 });
      });
      req.write(body);
      req.end();
    });
  }

  function buildDeliveryPayload(req, ticket, channel, destination) {
    const event = dbGet("SELECT * FROM events WHERE id = ?", [ticket.event_id]);
    const ticketType = dbGet("SELECT * FROM ticket_types WHERE id = ?", [ticket.ticket_type_id]);
    return {
      channel,
      destination,
      ticket_id: ticket.id,
      ticket_code: ticket.code,
      ticket_status: ticket.status,
      ticket_url: buildTicketUrl(req, ticket.id),
      event: event
        ? { id: event.id, title: event.title, location: event.location, start_time: event.start_time }
        : null,
      ticket_type: ticketType ? { id: ticketType.id, name: ticketType.name, price_kes: ticketType.price_kes } : null
    };
  }

  async function dispatchDelivery(req, ticket, channel, destination) {
    const payload = buildDeliveryPayload(req, ticket, channel, destination);
    const createdAt = nowIso();
    const webhookUrl = deliveryWebhookUrl(channel);
    const provider = webhookUrl ? "webhook" : "manual";
    dbExec(
      "INSERT INTO ticket_deliveries (ticket_id, channel, destination, status, provider, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [ticket.id, channel, destination, "queued", provider, JSON.stringify(payload), createdAt]
    );
    let delivery = dbGet("SELECT * FROM ticket_deliveries WHERE id = (SELECT MAX(id) as id FROM ticket_deliveries)");
    triggerWebhooks("delivery.requested", { delivery, ticket, payload });
    if (!webhookUrl) return delivery;
    const result = await sendDeliveryWebhook(webhookUrl, { delivery_id: delivery.id, ...payload });
    if (result.ok) {
      const sentAt = nowIso();
      dbExec("UPDATE ticket_deliveries SET status = ?, sent_at = ? WHERE id = ?", ["sent", sentAt, delivery.id]);
      delivery = dbGet("SELECT * FROM ticket_deliveries WHERE id = ?", [delivery.id]);
      triggerWebhooks("delivery.sent", { delivery, ticket });
      return delivery;
    }
    dbExec("UPDATE ticket_deliveries SET status = ?, error = ? WHERE id = ?", ["failed", `HTTP_${result.status || 0}`, delivery.id]);
    delivery = dbGet("SELECT * FROM ticket_deliveries WHERE id = ?", [delivery.id]);
    triggerWebhooks("delivery.failed", { delivery, ticket });
    return delivery;
  }

  function getQrWindow(timestamp = Date.now()) {
    return Math.floor(timestamp / (QR_TOKEN_WINDOW_SECONDS * 1000));
  }

  function signQrToken(ticket, window) {
    const payload = `${ticket.id}.${window}.${ticket.code}`;
    return crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex");
  }

  function buildQrToken(ticket, window = getQrWindow()) {
    const signature = signQrToken(ticket, window);
    return `${ticket.id}.${window}.${signature}`;
  }

  function verifyQrToken(token) {
    if (!token) return null;
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const [idText, windowText, signature] = parts;
    const ticketId = Number(idText);
    const window = Number(windowText);
    if (!Number.isFinite(ticketId) || !Number.isFinite(window) || !signature) return null;
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ?", [ticketId]);
    if (!ticket) return null;
    const windows = [window - 1, window, window + 1];
    for (const win of windows) {
      const expected = signQrToken(ticket, win);
      if (signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return { ticket, window: win };
      }
    }
    return null;
  }

  function canAccessTicket(ticket, user, code) {
    if (!ticket) return false;
    if (user && (user.is_admin || ticket.user_id === user.id)) return true;
    if (code && ticket.code === code) return true;
    return false;
  }

  if (process.env.NODE_ENV === "production" && !process.env.QR_SECRET) {
    console.warn("QR_SECRET is not set. Using a default value which is insecure in production.");
  }

  app.get("/", (_req, res) => res.json({ status: "ok" }));
  app.get("/branding", (_req, res) => res.json(getBranding()));

  app.post("/branding", authMiddleware, requireAdmin, (req, res) => {
    const updates = req.body || {};
    const next = { ...getBranding(), ...updates };
    setSetting("branding", next);
    res.json(next);
  });

  app.post("/auth/register", (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ detail: "Missing fields" });
    const exists = dbGet("SELECT id FROM users WHERE email = ?", [email]);
    if (exists) return res.status(400).json({ detail: "Email already registered" });
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    dbExec(
      "INSERT INTO users (email, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?)",
      [email, hashPassword(password), isAdmin ? 1 : 0, nowIso()]
    );
    const user = dbGet("SELECT id, email, is_admin FROM users WHERE email = ?", [email]);
    return res.json(user);
  });

  app.post("/auth/login", (req, res) => {
    const { email, password } = req.body || {};
    const user = dbGet("SELECT * FROM users WHERE email = ?", [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ detail: "Invalid credentials" });
    }
    const token = generateToken();
    dbExec("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", [token, user.id, nowIso()]);
    return res.json({ access_token: token, token_type: "bearer" });
  });

  app.get("/auth/me", authMiddleware, (req, res) => {
    return res.json({ id: req.user.id, email: req.user.email, is_admin: Boolean(req.user.is_admin), is_organizer: Boolean(req.user.is_organizer), is_staff: Boolean(req.user.is_admin || req.user.is_organizer) });
  });

  app.get("/events", (req, res) => {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.page_size || 6);
    const total = dbGet("SELECT COUNT(*) as count FROM events")?.count || 0;
    const items = dbAll("SELECT * FROM events ORDER BY datetime(start_time) ASC LIMIT ? OFFSET ?", [
      pageSize,
      (page - 1) * pageSize
    ]);
    res.json({ items, pagination: { page, page_size: pageSize, total } });
  });

  app.post("/events", authMiddleware, requireStaff, (req, res) => {
    const { title, description, image_url, location, start_time, end_time } = req.body || {};
    if (!title || !start_time || !end_time) return res.status(400).json({ detail: "Missing fields" });
    dbExec(
      "INSERT INTO events (title, description, image_url, location, start_time, end_time, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [title, description || null, image_url || null, location || null, start_time, end_time, req.user.id, nowIso()]
    );
    const event = dbGet("SELECT * FROM events WHERE id = (SELECT MAX(id) as id FROM events)");
    triggerWebhooks("event.created", { event });
    res.json(event);
  });

  app.get("/events/:id", (req, res) => {
    const event = dbGet("SELECT * FROM events WHERE id = ?", [req.params.id]);
    if (!event) return res.status(404).json({ detail: "Event not found" });
    res.json(event);
  });

  app.get("/events/:id/ticket-types", (req, res) => {
    const items = dbAll("SELECT * FROM ticket_types WHERE event_id = ?", [req.params.id]);
    res.json(items);
  });

  app.post("/events/:id/ticket-types", authMiddleware, requireStaff, (req, res) => {
    const { name, price_kes, capacity, fee_kes, pass_fee, currency } = req.body || {};
    const event = dbGet("SELECT * FROM events WHERE id = ?", [req.params.id]);
    if (!event) return res.status(404).json({ detail: "Event not found" });
    if (!canManageEvent(req.user, event)) return res.status(403).json({ detail: "Organizer access required" });
    dbExec(
      "INSERT INTO ticket_types (event_id, name, price_kes, fee_kes, pass_fee, currency, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        req.params.id,
        name,
        Number(price_kes),
        Number(fee_kes || 0),
        pass_fee ? 1 : 0,
        currency || "KES",
        capacity ?? null,
        nowIso()
      ]
    );
    const ticketType = dbGet("SELECT * FROM ticket_types WHERE id = (SELECT MAX(id) as id FROM ticket_types)");
    res.json(ticketType);
  });

  app.get("/tickets/me", authMiddleware, (req, res) => {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.page_size || 6);
    const total = dbGet("SELECT COUNT(*) as count FROM tickets WHERE user_id = ?", [req.user.id])?.count || 0;
    const items = dbAll(
      `SELECT tickets.*, events.title as event_title, ticket_types.name as ticket_type_name
       FROM tickets
       LEFT JOIN events ON events.id = tickets.event_id
       LEFT JOIN ticket_types ON ticket_types.id = tickets.ticket_type_id
       WHERE tickets.user_id = ?
       ORDER BY datetime(tickets.created_at) DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, pageSize, (page - 1) * pageSize]
    );
    res.json({ items, pagination: { page, page_size: pageSize, total } });
  });

  app.get("/tickets/:id", authMiddleware, (req, res) => {
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!ticket) return res.status(404).json({ detail: "Ticket not found" });
    const event = dbGet("SELECT * FROM events WHERE id = ?", [ticket.event_id]);
    const ticketType = dbGet("SELECT * FROM ticket_types WHERE id = ?", [ticket.ticket_type_id]);
    res.json({ ...ticket, event, ticket_type: ticketType });
  });

  app.get("/tickets/public/:id", (req, res) => {
    const { code } = req.query;
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ?", [req.params.id]);
    if (!ticket || !code || ticket.code !== code) return res.status(404).json({ detail: "Ticket not found" });
    const event = dbGet("SELECT * FROM events WHERE id = ?", [ticket.event_id]);
    const ticketType = dbGet("SELECT * FROM ticket_types WHERE id = ?", [ticket.ticket_type_id]);
    res.json({ ...ticket, event, ticket_type: ticketType });
  });

  app.post("/tickets/:id/deliver", optionalAuth, async (req, res) => {
    const { phone, email, channel, destination } = req.body || {};
    const code = req.query.code;
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ?", [req.params.id]);
    if (!ticket) return res.status(404).json({ detail: "Ticket not found" });
    if (req.user) {
      if (req.user.is_admin) {
        // admins can deliver any ticket
      } else if (req.user.is_organizer) {
        const event = requireTicketEventAccess(req, res, ticket);
        if (!event) return;
      } else if (ticket.user_id !== req.user.id) {
        return res.status(404).json({ detail: "Ticket not found" });
      }
    } else if (!code || ticket.code !== code) {
      return res.status(404).json({ detail: "Ticket not found" });
    }

    if (phone || email) {
      dbExec("UPDATE tickets SET contact_phone = ?, contact_email = ? WHERE id = ?", [phone || null, email || null, req.params.id]);
    }

    const targets = [];
    const allowedChannels = new Set(["email", "whatsapp"]);
    if (channel && destination) {
      if (!allowedChannels.has(channel)) return res.status(400).json({ detail: "Unsupported delivery channel" });
      targets.push({ channel, destination });
    } else {
      if (email) targets.push({ channel: "email", destination: email });
      if (phone) targets.push({ channel: "whatsapp", destination: phone });
    }
    if (!targets.length) return res.status(400).json({ detail: "Missing delivery destination" });

    const deliveries = [];
    for (const target of targets) {
      deliveries.push(await dispatchDelivery(req, ticket, target.channel, target.destination));
    }
    res.json({ status: "queued", deliveries });
  });

  app.get("/tickets/:id/deliveries", optionalAuth, (req, res) => {
    const code = req.query.code;
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ?", [req.params.id]);
    if (!ticket) return res.status(404).json({ detail: "Ticket not found" });
    if (req.user) {
      if (req.user.is_admin) {
        // admins can view any ticket delivery
      } else if (req.user.is_organizer) {
        const event = requireTicketEventAccess(req, res, ticket);
        if (!event) return;
      } else if (ticket.user_id !== req.user.id) {
        return res.status(404).json({ detail: "Ticket not found" });
      }
    } else if (!code || ticket.code !== code) {
      return res.status(404).json({ detail: "Ticket not found" });
    }

    const deliveries = dbAll("SELECT * FROM ticket_deliveries WHERE ticket_id = ? ORDER BY id DESC", [ticket.id]);
    res.json(deliveries);
  });

  app.post("/tickets/:id/nfc", authMiddleware, requireStaff, (req, res) => {
    const { nfc_uid } = req.body || {};
    if (!nfc_uid) return res.status(400).json({ detail: "Missing nfc_uid" });
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ?", [req.params.id]);
    if (!ticket) return res.status(404).json({ detail: "Ticket not found" });
    const event = requireTicketEventAccess(req, res, ticket);
    if (!event) return;
    const existing = dbGet("SELECT id FROM tickets WHERE nfc_uid = ? AND id != ?", [nfc_uid, ticket.id]);
    if (existing) return res.status(400).json({ detail: "NFC tag already assigned" });
    dbExec("UPDATE tickets SET nfc_uid = ?, nfc_bound_at = ? WHERE id = ?", [nfc_uid, nowIso(), ticket.id]);
    res.json({ status: "bound", ticket_id: ticket.id, nfc_uid });
  });

  app.delete("/tickets/:id/nfc", authMiddleware, requireStaff, (req, res) => {
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ?", [req.params.id]);
    if (!ticket) return res.status(404).json({ detail: "Ticket not found" });
    const event = requireTicketEventAccess(req, res, ticket);
    if (!event) return;
    dbExec("UPDATE tickets SET nfc_uid = NULL, nfc_bound_at = NULL WHERE id = ?", [ticket.id]);
    res.json({ status: "unbound" });
  });

  app.get("/tickets/:id/qr-token", optionalAuth, (req, res) => {
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ?", [req.params.id]);
    if (!ticket) return res.status(404).json({ detail: "Ticket not found" });
    const code = req.query.code ? String(req.query.code) : null;
    if (!canAccessTicket(ticket, req.user, code)) return res.status(404).json({ detail: "Ticket not found" });
    const window = getQrWindow();
    const token = buildQrToken(ticket, window);
    const validUntil = new Date((window + 1) * QR_TOKEN_WINDOW_SECONDS * 1000).toISOString();
    res.json({
      token,
      window_seconds: QR_TOKEN_WINDOW_SECONDS,
      valid_until: validUntil
    });
  });

  function capacityAvailable(ticketType) {
    if (ticketType.capacity == null) return true;
    const issued = dbGet("SELECT COUNT(*) as count FROM tickets WHERE ticket_type_id = ?", [ticketType.id])?.count || 0;
    return issued < ticketType.capacity;
  }

  app.post("/payments/stk-push", optionalAuth, (req, res) => {
    const { event_id, ticket_type_id, phone } = req.body || {};
    const event = dbGet("SELECT * FROM events WHERE id = ?", [event_id]);
    if (!event) return res.status(404).json({ detail: "Event not found" });
    const ticketType = dbGet("SELECT * FROM ticket_types WHERE id = ? AND event_id = ?", [ticket_type_id, event_id]);
    if (!ticketType) return res.status(404).json({ detail: "Ticket type not found" });
    if (!capacityAvailable(ticketType)) return res.status(400).json({ detail: "Ticket type is sold out" });

    let user = req.user;
    if (!user) {
      const guestEmail = `guest+${phone?.replace(/\D/g, "") || crypto.randomBytes(4).toString("hex")}@getticket.local`;
      user = dbGet("SELECT * FROM users WHERE email = ?", [guestEmail]);
      if (!user) {
        dbExec("INSERT INTO users (email, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)", [
          guestEmail,
          hashPassword(crypto.randomBytes(12).toString("hex")),
          nowIso()
        ]);
        user = dbGet("SELECT * FROM users WHERE email = ?", [guestEmail]);
      }
    }

    const code = crypto.randomBytes(12).toString("hex");
    dbExec(
      "INSERT INTO tickets (event_id, ticket_type_id, user_id, code, status, contact_phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [event_id, ticket_type_id, user.id, code, "pending", phone || null, nowIso()]
    );
    const ticket = dbGet("SELECT * FROM tickets WHERE id = (SELECT MAX(id) as id FROM tickets)");

    const baseAmount = Number(ticketType.price_kes);
    const feeAmount = Number(ticketType.fee_kes || 0);
    const passFee = Number(ticketType.pass_fee || 0) === 1;
    const totalAmount = passFee ? baseAmount + feeAmount : baseAmount;

    dbExec(
      "INSERT INTO payments (ticket_id, phone, amount_kes, base_amount_kes, fee_kes, total_amount_kes, pass_fee, status, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [ticket.id, phone, totalAmount, baseAmount, feeAmount, totalAmount, passFee ? 1 : 0, "pending", "mpesa", nowIso()]
    );
    const payment = dbGet("SELECT * FROM payments WHERE id = (SELECT MAX(id) as id FROM payments)");

    res.json({ ticket, payment, mpesa: { status: "queued" }, delivery: { status: "pending" } });
  });

  app.post("/payments/callback", (req, res) => {
    const { checkout_request_id, result_code, receipt } = req.body || {};
    if (!checkout_request_id) return res.status(400).json({ detail: "Missing checkout_request_id" });
    const payment = dbGet("SELECT * FROM payments WHERE checkout_request_id = ?", [checkout_request_id]);
    if (!payment) return res.status(404).json({ detail: "Payment not found" });

    if (result_code === 0) {
      dbExec("UPDATE payments SET status = ?, mpesa_receipt = ? WHERE id = ?", ["paid", receipt || null, payment.id]);
      dbExec("UPDATE tickets SET status = ? WHERE id = ?", ["paid", payment.ticket_id]);
    } else {
      dbExec("UPDATE payments SET status = ? WHERE id = ?", ["failed", payment.id]);
      dbExec("UPDATE tickets SET status = ? WHERE id = ?", ["failed", payment.ticket_id]);
    }
    const updatedPayment = dbGet("SELECT * FROM payments WHERE id = ?", [payment.id]);
    const ticket = dbGet("SELECT * FROM tickets WHERE id = ?", [payment.ticket_id]);
    const event = ticket ? dbGet("SELECT * FROM events WHERE id = ?", [ticket.event_id]) : null;
    if (updatedPayment?.status === "paid") {
      triggerWebhooks("ticket.paid", { payment: updatedPayment, ticket, event });
    }
    res.json({ status: "ok" });
  });

  app.post("/attendance/check-in", authMiddleware, requireStaff, (req, res) => {
    const { code, qr_token, nfc_uid } = req.body || {};
    let ticket = null;
    let method = "code";
    if (qr_token) {
      const verified = verifyQrToken(qr_token);
      ticket = verified?.ticket || null;
      method = "qr";
    } else if (nfc_uid) {
      ticket = dbGet("SELECT * FROM tickets WHERE nfc_uid = ?", [nfc_uid]);
      method = "nfc";
    } else if (code) {
      ticket = dbGet("SELECT * FROM tickets WHERE code = ?", [code]);
    }
    if (!ticket) return res.status(404).json({ detail: "Ticket not found" });
    const event = requireTicketEventAccess(req, res, ticket);
    if (!event) return;
    if (ticket.status !== "paid") return res.status(400).json({ detail: "Ticket not paid" });
    if (ticket.checked_in_at) return res.status(400).json({ detail: "Already checked in" });
    dbExec("UPDATE tickets SET checked_in_at = ? WHERE id = ?", [nowIso(), ticket.id]);
    dbExec("INSERT INTO ticket_scans (ticket_id, scanned_at, method, meta) VALUES (?, ?, ?, ?)", [
      ticket.id,
      nowIso(),
      method,
      null
    ]);
    triggerWebhooks("ticket.checked_in", { ticket });
    res.json({ ...ticket, checked_in_at: nowIso() });
  });

  app.get("/attendance/summary", authMiddleware, requireStaff, (req, res) => {
    const eventId = Number(req.query.event_id || 0);
    if (!eventId) return res.status(400).json({ detail: "Missing event_id" });
    const event = requireEventAccess(req, res, eventId);
    if (!event) return;
    const issued = dbGet("SELECT COUNT(*) as count FROM tickets WHERE event_id = ?", [eventId])?.count || 0;
    const checkedIn =
      dbGet("SELECT COUNT(*) as count FROM tickets WHERE event_id = ? AND checked_in_at IS NOT NULL", [eventId])?.count || 0;
    res.json({ event_id: eventId, tickets_issued: issued, tickets_checked_in: checkedIn });
  });

  app.get("/admin/overview", authMiddleware, requireAdmin, (_req, res) => {
    const totalEvents = dbGet("SELECT COUNT(*) as count FROM events")?.count || 0;
    const totalTickets = dbGet("SELECT COUNT(*) as count FROM tickets")?.count || 0;
    const paidTickets = dbGet("SELECT COUNT(*) as count FROM tickets WHERE status = 'paid'")?.count || 0;
    const checkedIn = dbGet("SELECT COUNT(*) as count FROM tickets WHERE checked_in_at IS NOT NULL")?.count || 0;
    const totalRevenue = dbGet("SELECT COALESCE(SUM(amount_kes), 0) as total FROM payments WHERE status = 'paid'")?.total || 0;
    const recentEvents = dbAll("SELECT * FROM events ORDER BY datetime(created_at) DESC LIMIT 5");
    const recentTickets = dbAll("SELECT * FROM tickets ORDER BY datetime(created_at) DESC LIMIT 5");
    res.json({
      total_events: totalEvents,
      total_tickets: totalTickets,
      paid_tickets: paidTickets,
      checked_in: checkedIn,
      total_revenue_kes: totalRevenue,
      recent_events: recentEvents,
      recent_tickets: recentTickets
    });
  });

  app.get("/admin/organizers", authMiddleware, requireAdmin, (_req, res) => {
    const organizers = dbAll("SELECT id, email, is_admin, is_organizer, created_at FROM users WHERE is_organizer = 1 ORDER BY id DESC");
    res.json(organizers);
  });

  app.post("/admin/organizers", authMiddleware, requireAdmin, (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ detail: "Missing email" });
    const user = dbGet("SELECT id, email, is_admin, is_organizer FROM users WHERE email = ?", [email]);
    if (!user) return res.status(404).json({ detail: "User not found" });
    dbExec("UPDATE users SET is_organizer = 1 WHERE id = ?", [user.id]);
    const updated = dbGet("SELECT id, email, is_admin, is_organizer FROM users WHERE id = ?", [user.id]);
    res.json(updated);
  });

  app.delete("/admin/organizers/:id", authMiddleware, requireAdmin, (req, res) => {
    const user = dbGet("SELECT id, email, is_admin, is_organizer FROM users WHERE id = ?", [req.params.id]);
    if (!user) return res.status(404).json({ detail: "User not found" });
    dbExec("UPDATE users SET is_organizer = 0 WHERE id = ?", [user.id]);
    const updated = dbGet("SELECT id, email, is_admin, is_organizer FROM users WHERE id = ?", [user.id]);
    res.json(updated);
  });

  app.get("/analytics/summary", authMiddleware, requireStaff, (req, res) => {
    if (req.user.is_admin) {
      const totalEvents = dbGet("SELECT COUNT(*) as count FROM events")?.count || 0;
      const totalTickets = dbGet("SELECT COUNT(*) as count FROM tickets")?.count || 0;
      const paidTickets = dbGet("SELECT COUNT(*) as count FROM tickets WHERE status = 'paid'")?.count || 0;
      const checkedIn = dbGet("SELECT COUNT(*) as count FROM tickets WHERE checked_in_at IS NOT NULL")?.count || 0;
      const revenue =
        dbGet(
          "SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN COALESCE(total_amount_kes, amount_kes, 0) ELSE 0 END), 0) as total FROM payments"
        )?.total || 0;
      return res.json({
        total_events: totalEvents,
        total_tickets: totalTickets,
        paid_tickets: paidTickets,
        checked_in: checkedIn,
        total_revenue_kes: revenue
      });
    }

    const userId = req.user.id;
    const totalEvents = dbGet("SELECT COUNT(*) as count FROM events WHERE created_by = ?", [userId])?.count || 0;
    const totalTickets =
      dbGet("SELECT COUNT(*) as count FROM tickets WHERE event_id IN (SELECT id FROM events WHERE created_by = ?)", [userId])?.count || 0;
    const paidTickets =
      dbGet("SELECT COUNT(*) as count FROM tickets WHERE status = 'paid' AND event_id IN (SELECT id FROM events WHERE created_by = ?)", [userId])?.count || 0;
    const checkedIn =
      dbGet("SELECT COUNT(*) as count FROM tickets WHERE checked_in_at IS NOT NULL AND event_id IN (SELECT id FROM events WHERE created_by = ?)", [userId])?.count || 0;
    const revenue =
      dbGet(
        "SELECT COALESCE(SUM(CASE WHEN payments.status = 'paid' THEN COALESCE(payments.total_amount_kes, payments.amount_kes, 0) ELSE 0 END), 0) as total FROM payments LEFT JOIN tickets ON tickets.id = payments.ticket_id WHERE tickets.event_id IN (SELECT id FROM events WHERE created_by = ?)",
        [userId]
      )?.total || 0;
    res.json({
      total_events: totalEvents,
      total_tickets: totalTickets,
      paid_tickets: paidTickets,
      checked_in: checkedIn,
      total_revenue_kes: revenue
    });
  });

  app.get("/analytics/events/:id", authMiddleware, requireStaff, (req, res) => {
    const event = requireEventAccess(req, res, req.params.id);
    if (!event) return;
    const totals = dbGet(
      `SELECT
        COUNT(tickets.id) as issued,
        SUM(CASE WHEN tickets.status = 'paid' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN tickets.checked_in_at IS NOT NULL THEN 1 ELSE 0 END) as checked_in
      FROM tickets WHERE event_id = ?`,
      [req.params.id]
    );
    const revenue =
      dbGet(
        `SELECT COALESCE(SUM(CASE WHEN payments.status = 'paid' THEN COALESCE(payments.total_amount_kes, payments.amount_kes, 0) ELSE 0 END), 0) as total
         FROM payments
         LEFT JOIN tickets ON tickets.id = payments.ticket_id
         WHERE tickets.event_id = ?`,
        [req.params.id]
      )?.total || 0;
    const byType = dbAll(
      `SELECT
        ticket_types.id,
        ticket_types.name,
        ticket_types.price_kes,
        ticket_types.fee_kes,
        ticket_types.pass_fee,
        ticket_types.currency,
        COUNT(tickets.id) as issued,
        SUM(CASE WHEN tickets.status = 'paid' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN tickets.checked_in_at IS NOT NULL THEN 1 ELSE 0 END) as checked_in,
        COALESCE(SUM(CASE WHEN payments.status = 'paid' THEN COALESCE(payments.total_amount_kes, payments.amount_kes, 0) ELSE 0 END), 0) as revenue_kes
       FROM ticket_types
       LEFT JOIN tickets ON tickets.ticket_type_id = ticket_types.id
       LEFT JOIN payments ON payments.ticket_id = tickets.id
       WHERE ticket_types.event_id = ?
       GROUP BY ticket_types.id
       ORDER BY ticket_types.id ASC`,
      [req.params.id]
    );
    res.json({
      event,
      totals: totals || { issued: 0, paid: 0, checked_in: 0 },
      revenue_kes: revenue,
      by_ticket_type: byType
    });
  });

  app.get("/admin/export", authMiddleware, requireAdmin, (_req, res) => {
    res.json({
      branding: getBranding(),
      users: dbAll("SELECT id, email, is_admin, is_organizer, created_at FROM users"),
      events: dbAll("SELECT * FROM events"),
      ticket_types: dbAll("SELECT * FROM ticket_types"),
      tickets: dbAll("SELECT * FROM tickets"),
      payments: dbAll("SELECT * FROM payments"),
      sessions: dbAll("SELECT token, user_id, created_at FROM sessions"),
      ticket_scans: dbAll("SELECT * FROM ticket_scans"),
      webhook_subscriptions: dbAll("SELECT id, url, events, created_at FROM webhook_subscriptions")
    });
  });

  app.get("/integrations/webhooks", authMiddleware, requireAdmin, (_req, res) => {
    res.json(listWebhooks());
  });

  app.post("/integrations/webhooks", authMiddleware, requireAdmin, (req, res) => {
    const { url, events, secret } = req.body || {};
    if (!url || !events) return res.status(400).json({ detail: "Missing url or events" });
    const eventList = normalizeEventList(events);
    if (!eventList.length) return res.status(400).json({ detail: "No events specified" });
    dbExec("INSERT INTO webhook_subscriptions (url, events, secret, created_at) VALUES (?, ?, ?, ?)", [
      url,
      eventList.join(","),
      secret || null,
      nowIso()
    ]);
    const webhook = dbGet("SELECT * FROM webhook_subscriptions WHERE id = (SELECT MAX(id) as id FROM webhook_subscriptions)");
    res.json(webhook);
  });

  app.delete("/integrations/webhooks/:id", authMiddleware, requireAdmin, (req, res) => {
    const existing = dbGet("SELECT * FROM webhook_subscriptions WHERE id = ?", [req.params.id]);
    if (!existing) return res.status(404).json({ detail: "Webhook not found" });
    dbExec("DELETE FROM webhook_subscriptions WHERE id = ?", [req.params.id]);
    res.json({ status: "deleted" });
  });

  const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 5 * 1024 * 1024 } });
  app.post("/uploads/event-image", authMiddleware, requireStaff, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ detail: "Missing file" });
    const url = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    triggerWebhooks("event.image_uploaded", { url });
    res.json({ url });
  });

  app.listen(PORT, () => {
    console.log(`GETTICKET API running on http://localhost:${PORT}`);
  });
}

main();
