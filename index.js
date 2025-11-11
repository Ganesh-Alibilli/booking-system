require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

// ✅ Environment variables
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const EMAIL_FROM = process.env.EMAIL_FROM;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// ✅ Setup SendGrid (via SMTP)
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'apikey',
    pass: process.env.SMTP_PASS,
  },
});

// Verify connection once at startup
transport.verify((err, success) => {
  if (err) {
    console.error('❌ SendGrid connection failed:', err.message);
  } else {
    console.log('✅ SendGrid SMTP ready to send emails');
  }
});

// ✅ Email Templates
// function userEmailHtml(b) {
//   return `
//     <h2>Booking Confirmation</h2>
//     <p>Thank you, <b>${b.user.name}</b> — your booking is confirmed.</p>
//     <table>
//       <tr><td><strong>Booking ID:</strong></td><td>${b.bookingId}</td></tr>
//       <tr><td><strong>Service:</strong></td><td>${b.serviceTitle} (${b.serviceType})</td></tr>
//       <tr><td><strong>Date:</strong></td><td>${b.date}</td></tr>
//       <tr><td><strong>Time:</strong></td><td>${b.startTime}${b.endTime ? ' - ' + b.endTime : ''}</td></tr>
//       <tr><td><strong>Contact:</strong></td><td>${b.user.email} | ${b.user.phone || '-'}</td></tr>
//       <tr><td><strong>Created:</strong></td><td>${b.createdAtUTC}</td></tr>
//     </table>
//     <p>If you wish to cancel or reschedule, please reply to this email.</p>
//   `;
// }

function userEmailHtml(b) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden;">
    <div style="background: linear-gradient(90deg, #007bff, #00c4ff); color: white; padding: 20px; text-align: center;">
      <h2 style="margin: 0;">Booking Confirmation</h2>
      <p style="margin: 5px 0 0; font-size: 14px;">Thank you for choosing our services!</p>
    </div>
    <div style="padding: 20px; color: #333;">
      <p>Dear <strong>${b.user.name}</strong>,</p>
      <p>We’re excited to confirm your booking. Below are the details:</p>

      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Booking ID:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.bookingId}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Service:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.serviceTitle} (${b.serviceType})</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Date:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.date}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Time:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.startTime}${b.endTime ? ' - ' + b.endTime : ''}</td></tr>
      </table>

      <p style="margin-top: 20px;">If you have any questions, feel free to reply to this email or contact our team.</p>
      <p style="font-size: 13px; color: #777;">Created on: ${b.createdAtUTC}</p>

      <a href="#" style="display: inline-block; margin-top: 15px; background: #007bff; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px;">Manage Booking</a>
    </div>

    <div style="background: #f4f4f4; color: #666; text-align: center; padding: 10px; font-size: 12px;">
      <p style="margin: 0;">© ${new Date().getFullYear()} Service Booking System. All rights reserved.</p>
    </div>
  </div>
  `;
}


// function adminEmailHtml(b) {
//   return `
//     <h2>New Booking Received</h2>
//     <table>
//       <tr><td><strong>Booking ID:</strong></td><td>${b.bookingId}</td></tr>
//       <tr><td><strong>Service:</strong></td><td>${b.serviceTitle} (${b.serviceType})</td></tr>
//       <tr><td><strong>Date:</strong></td><td>${b.date}</td></tr>
//       <tr><td><strong>Time:</strong></td><td>${b.startTime}${b.endTime ? ' - ' + b.endTime : ''}</td></tr>
//       <tr><td><strong>User:</strong></td><td>${b.user.name} | ${b.user.email} | ${b.user.phone || '-'}</td></tr>
//       <tr><td><strong>Created (UTC):</strong></td><td>${b.createdAtUTC}</td></tr>
//     </table>
//   `;
// }

function adminEmailHtml(b) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden;">
    <div style="background: linear-gradient(90deg, #ff6a00, #ffcc00); color: white; padding: 20px; text-align: center;">
      <h2 style="margin: 0;">New Booking Received</h2>
      <p style="margin: 5px 0 0; font-size: 14px;">A new customer has booked a service.</p>
    </div>
    <div style="padding: 20px; color: #333;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Booking ID:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.bookingId}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Service:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.serviceTitle} (${b.serviceType})</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Date:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.date}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Time:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.startTime}${b.endTime ? ' - ' + b.endTime : ''}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Customer Name:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.user.name}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Email:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.user.email}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Phone:</td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${b.user.phone || '-'}</td></tr>
      </table>

      <p style="margin-top: 20px;">Please follow up if needed.</p>
      <p style="font-size: 13px; color: #777;">Created on: ${b.createdAtUTC}</p>
    </div>

    <div style="background: #f4f4f4; color: #666; text-align: center; padding: 10px; font-size: 12px;">
      <p style="margin: 0;">© ${new Date().getFullYear()} Service Booking System (Admin Notification)</p>
    </div>
  </div>
  `;
}


// ✅ Utility: Call Google Apps Script
async function callSheet(payload) {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('❌ Apps Script returned HTTP', res.status, text.slice(0, 300));
      return { status: res.status, json: { ok: false, error: 'invalid_response' } };
    }

    const json = await res.json();
    return { status: res.status, json };
  } catch (err) {
    console.error('❌ Error calling Apps Script:', err.message);
    return { status: 500, json: { ok: false, error: err.message } };
  }
}

// ✅ Fetch services from Apps Script
app.get('/api/services', async (req, res) => {
  const sheetResp = await callSheet({ action: 'getServices' });
  res.status(sheetResp.status).json(sheetResp.json);
});

// ✅ Fetch slots
app.get('/api/slots', async (req, res) => {
  const { serviceId, date, duration } = req.query;
  if (!serviceId || !date) return res.status(400).json({ error: 'missing_params' });

  const payload = { action: 'getSlots', serviceId, date, duration: Number(duration || 30) };
  const sheetResp = await callSheet(payload);
  res.status(sheetResp.status).json(sheetResp.json);
});

// ✅ List all bookings (Admin)
app.get('/api/admin/bookings', async (req, res) => {
  const sheetResp = await callSheet({ action: 'list_all' });
  res.status(sheetResp.status).json(sheetResp.json);
});

// ✅ Create new booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { serviceId, serviceType, serviceTitle, date, startTime, endTime, user } = req.body;
    if (!serviceId || !serviceType || !serviceTitle || !date || !startTime || !user?.email || !user?.name) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const bookingId = 'BKG-' + uuidv4().split('-')[0];
    const payload = {
      action: 'create',
      bookingId,
      serviceType,
      serviceTitle,
      serviceId,
      date,
      startTime,
      endTime: endTime || '',
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      status: 'pending',
    };

    const sheetResp = await callSheet(payload);

    if (sheetResp.status === 409 || sheetResp.json.reason === 'slot_taken') {
      return res.status(409).json({ error: 'slot_taken' });
    }
    if (!sheetResp.json.ok) {
      return res.status(500).json({ error: 'sheet_error', detail: sheetResp.json });
    }

    const createdAtUTC = sheetResp.json.createdAtUTC || new Date().toISOString();
    const bookingRecord = {
      bookingId,
      serviceId,
      serviceType,
      serviceTitle,
      date,
      startTime,
      endTime,
      user,
      status: 'pending',
      createdAtUTC,
    };

    // ✅ Send confirmation emails
    try {
      await transport.sendMail({
        from: EMAIL_FROM,
        to: user.email,
        subject: `Booking confirmation — ${serviceTitle} on ${date}`,
        html: userEmailHtml(bookingRecord),
      });

      await transport.sendMail({
        from: EMAIL_FROM,
        to: ADMIN_EMAIL,
        subject: `New booking — ${serviceTitle} on ${date}`,
        html: adminEmailHtml(bookingRecord),
      });

      console.log(`📧 Booking confirmation sent to ${user.email}`);
    } catch (mailErr) {
      console.error('❌ Email sending failed:', mailErr.message);
    }

    res.status(201).json({ ok: true, booking: bookingRecord });
  } catch (err) {
    console.error('❌ Server error:', err.message);
    res.status(500).json({ error: 'server_error', detail: err.message });
  }
});

// ✅ Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/test-email', async (req, res) => {
  try {
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to: 'ganesh.alibilli@sdgsolutions.in',
      subject: '🧪 Test Email from SendGrid (Local)',
      html: '<h2>✅ Your SendGrid email integration is working!</h2>'
    });
    console.log('📧 Test email sent:', info.messageId);
    res.json({ ok: true, message: 'Test email sent successfully' });
  } catch (err) {
    console.error('❌ Test email failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ✅ Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('🚀 Server started on port', PORT));
