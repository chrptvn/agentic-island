import { Hono } from "hono";
import { isSmtpConfigured } from "../services/mailer.js";

const health = new Hono();

health.get("/", (c) => c.json({ status: "ok", uptime: process.uptime() }));
health.get("/smtp", (c) => c.json({ configured: isSmtpConfigured() }));

export default health;
