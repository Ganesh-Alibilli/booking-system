require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const sgMail = require("@sendgrid/mail"); // Use SendGrid API

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "OPTIONS"],
  })
);

//  Environment variables
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const EMAIL_FROM = process.env.EMAIL_FROM;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
sgMail.setApiKey(process.env.SENDGRID_API_KEY); // SendGrid API Key

function renderExtraRows(extra = {}) {
  if (!extra || typeof extra !== "object") return "";
  return Object.entries(extra)
    .map(
      ([key, value]) => `
      <tr>
        <td><b>${key.replace(/([A-Z])/g, " $1")}:</b></td>
        <td>${value}</td>
      </tr>
    `
    )
    .join("");
}


// Email Templates
function userEmailHtml(b) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eaeaea; border-radius: 10px;">
    <div style="background: linear-gradient(90deg, #007bff, #00c4ff); color: white; padding: 20px; text-align: center;">
      <h2 style="margin: 0;">Booking Confirmation</h2>
      <p style="margin: 5px 0 0; font-size: 14px;">Thank you for choosing our services!</p>
    </div>

    <div style="padding: 20px; color: #333;">
      <p>Dear <strong>${b.user.name}</strong>,</p>
      <p>Your booking has been successfully recorded. Below are the details:</p>

      <table style="width: 100%; border-collapse: collapse;">
        <tr><td><b>Booking ID:</b></td><td>${b.bookingId}</td></tr>
        <tr><td><b>Service:</b></td><td>${b.serviceTitle} (${b.serviceType})</td></tr>
        <tr><td><b>Date:</b></td><td>${b.date}</td></tr>
        <tr><td><b>Time:</b></td><td>${b.startTime}${b.endTime ? " - " + b.endTime : ""}</td></tr>

        ${Object.entries(b.user.extra || {})
          .map(
            ([k, v]) =>
              `<tr><td><b>${k.replace(/([A-Z])/g, " $1")}:</b></td><td>${v}</td></tr>`
          )
          .join("")}
      </table>

      <p style="margin-top: 20px;">If you have any questions, feel free to reply to this email.</p>
      <p style="font-size: 13px; color: #777;">Created on: ${b.createdAtUTC}</p>
    </div>

    <div style="background: #f4f4f4; color: #666; text-align: center; padding: 10px; font-size: 12px;">
      © ${new Date().getFullYear()} Service Booking System
    </div>
  </div>`;
}


function adminEmailHtml(b) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 700px; margin: auto; border: 1px solid #eaeaea; border-radius: 10px;">
    <div style="background: linear-gradient(90deg, #ff6a00, #ffcc00); color: white; padding: 20px; text-align: center;">
      <h2 style="margin: 0;">New Booking Received</h2>
    </div>

    <div style="padding: 20px; color: #333;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td><b>Booking ID:</b></td><td>${b.bookingId}</td></tr>
        <tr><td><b>Service:</b></td><td>${b.serviceTitle} (${b.serviceType})</td></tr>
        <tr><td><b>Date:</b></td><td>${b.date}</td></tr>
        <tr><td><b>Time:</b></td><td>${b.startTime}${b.endTime ? " - " + b.endTime : ""}</td></tr>

        <tr><td><b>Customer:</b></td><td>${b.user.name}</td></tr>
        <tr><td><b>Email:</b></td><td>${b.user.email}</td></tr>
        <tr><td><b>Phone:</b></td><td>${b.user.phone || "-"}</td></tr>

        ${Object.entries(b.user.extra || {})
          .map(
            ([k, v]) =>
              `<tr><td><b>${k.replace(/([A-Z])/g, " $1")}:</b></td><td>${v}</td></tr>`
          )
          .join("")}
      </table>

      <p style="margin-top: 20px; font-size: 13px; color: #555;">Created on: ${b.createdAtUTC}</p>
    </div>
  </div>`;
}


// Utility: Call Google Apps Script
async function callSheet(payload) {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return { status: res.status, json };
  } catch (err) {
    console.error("❌ Error calling Apps Script:", err.message);
    return { status: 500, json: { ok: false, error: err.message } };
  }
}

// API Routes
app.get("/api/services", async (req, res) => {
  const sheetResp = await callSheet({ action: "getServices" });
  res.status(sheetResp.status).json(sheetResp.json);
});

app.get("/api/slots", async (req, res) => {
  const { serviceId, date, duration } = req.query;
  if (!serviceId || !date)
    return res.status(400).json({ error: "missing_params" });
  const payload = {
    action: "getSlots",
    serviceId,
    date,
    duration: Number(duration || 30),
  };
  const sheetResp = await callSheet(payload);
  res.status(sheetResp.status).json(sheetResp.json);
});

app.post("/api/bookings", async (req, res) => {
  try {
    const {
      serviceId,
      serviceType,
      serviceTitle,
      date,
      startTime,
      endTime,
      user,
    } = req.body;
    if (
      !serviceId ||
      !serviceType ||
      !serviceTitle ||
      !date ||
      !startTime ||
      !user?.email ||
      !user?.name
    ) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const bookingId = "BKG-" + uuidv4().split("-")[0];
    const payload = {
      action: "create",
      bookingId,
      serviceType,
      serviceTitle,
      serviceId,
      date,
      startTime,
      endTime: endTime || "",
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      extra: user.extra ? JSON.stringify(user.extra) : "{}",
      status: "pending",
    };

    const sheetResp = await callSheet(payload);
    if (!sheetResp.json.ok)
      return res
        .status(500)
        .json({ error: "sheet_error", detail: sheetResp.json });

    const createdAtUTC =
      sheetResp.json.createdAtUTC || new Date().toISOString();
    const bookingRecord = {
      bookingId,
      serviceId,
      serviceType,
      serviceTitle,
      date,
      startTime,
      endTime,
      user,
      createdAtUTC,
    };

    //  Send emails via SendGrid API
    try {
      await sgMail.send({
        to: user.email,
        from: EMAIL_FROM,
        subject: `Booking Confirmation — ${serviceTitle} on ${date}`,
        html: userEmailHtml(bookingRecord),
      });

      await sgMail
        .send({
          to: ADMIN_EMAIL,
          from: EMAIL_FROM,
          subject: `New Booking — ${serviceTitle} on ${date}`,
          html: adminEmailHtml(bookingRecord),
        })
        .then(() =>
          console.log(`📩 Admin email sent successfully to ${ADMIN_EMAIL}`)
        )
        .catch((err) => {
          console.error(
            "❌ Admin email failed:",
            err.response?.body || err.message
          );
        });

      console.log(`📧 Emails sent for booking ${bookingId}`);
    } catch (mailErr) {
      console.error("❌ SendGrid Email Error:", mailErr.message);
    }

    res.status(201).json({ ok: true, booking: bookingRecord });
  } catch (err) {
    console.error("❌ Server Error:", err.message);
    res.status(500).json({ error: "server_error", detail: err.message });
  }
});

// Test email route
app.get("/api/test-email", async (req, res) => {
  try {
    await sgMail.send({
      to: ADMIN_EMAIL,
      from: EMAIL_FROM,
      subject: "🧪 SendGrid Test Email",
      html: "<h2>✅ SendGrid API is working correctly on Render!</h2>",
    });
    res.json({ ok: true, message: "Test email sent successfully" });
  } catch (err) {
    console.error("❌ Test email failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("🚀 Server started on port", PORT));
