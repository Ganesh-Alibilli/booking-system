require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const EMAIL_FROM = process.env.EMAIL_FROM;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function userEmailHtml(b) {
  return `
    <h2>Booking Confirmation</h2>
    <p>Thank you ${b.user.name}, your booking is recorded.</p>
    <table>
      <tr><td><strong>Booking ID</strong></td><td>${b.bookingId}</td></tr>
      <tr><td><strong>Service</strong></td><td>${b.serviceTitle} (${b.serviceType})</td></tr>
      <tr><td><strong>Date</strong></td><td>${b.date}</td></tr>
      <tr><td><strong>Time</strong></td><td>${b.startTime}${b.endTime ? ' - '+b.endTime : ''}</td></tr>
      <tr><td><strong>Contact</strong></td><td>${b.user.name} | ${b.user.email} | ${b.user.phone || '-'}</td></tr>
      <tr><td><strong>Created (UTC)</strong></td><td>${b.createdAtUTC}</td></tr>
    </table>
    <p>If you need to cancel or reschedule, reply to this email.</p>
  `;
}

function adminEmailHtml(b) {
  return `
    <h2>New Booking Request</h2>
    <table>
      <tr><td><strong>Booking ID</strong></td><td>${b.bookingId}</td></tr>
      <tr><td><strong>Service</strong></td><td>${b.serviceTitle} (${b.serviceType})</td></tr>
      <tr><td><strong>Date</strong></td><td>${b.date}</td></tr>
      <tr><td><strong>Time</strong></td><td>${b.startTime}${b.endTime ? ' - '+b.endTime : ''}</td></tr>
      <tr><td><strong>User</strong></td><td>${b.user.name} | ${b.user.email} | ${b.user.phone || '-'}</td></tr>
      <tr><td><strong>Created (UTC)</strong></td><td>${b.createdAtUTC}</td></tr>
    </table>
  `;
}

async function callSheet(payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  return { status: res.status, json };
}
app.get('/api/slots', async (req, res) => {
  const { serviceId, date } = req.query;
  if (!serviceId || !date) return res.status(400).json({ error: 'missing_params' });

  const sheetResp = await callSheet({ action: 'list', serviceId, date });
  res.json(sheetResp.json);
});

app.get('/api/admin/bookings', async (req, res) => {
  const sheetResp = await callSheet({ action: 'list_all' });
  res.json(sheetResp.json);
});

app.get('/api/services', async (req, res) => {
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getServices' })
  });
  const json = await resp.json();
  res.status(resp.status).json(json);
});

app.get('/api/slots', async (req, res) => {
  const { serviceId, date, duration } = req.query;
  const payload = { action: 'getSlots', serviceId, date, duration: Number(duration || 30) };
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const json = await resp.json();
  res.status(resp.status).json(json);
});


app.get('/api/bookings', async (req, res) => {
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getBookings' })
  });
  const json = await resp.json();
  res.status(resp.status).json(json);
});


// POST /api/bookings
app.post('/api/bookings', async (req, res) => {
  try {
    const { serviceId, serviceType, serviceTitle, date, startTime, endTime, user } = req.body;
    if (!serviceId || !serviceType || !serviceTitle || !date || !startTime || !user || !user.email || !user.name) {
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
      status: 'pending'
    };

    const sheetResp = await callSheet(payload);
    

    if (sheetResp.status === 409 || (sheetResp.json && sheetResp.json.reason === 'slot_taken')) {
      return res.status(409).json({ error: 'slot_taken' });
    }
    if (sheetResp.status >= 400) {
      return res.status(500).json({ error: 'sheet_error', detail: sheetResp.json });
    }

    const createdAtUTC = sheetResp.json.createdAtUTC || new Date().toISOString();
    const bookingRecord = { bookingId, serviceId, serviceType, serviceTitle, date, startTime, endTime, user, status: 'pending', createdAtUTC };
    
    
    let emailStatus = 'sent';
    try {
      await transport.sendMail({
        from: EMAIL_FROM,
        to: user.email,
        subject: `Booking confirmation — ${serviceTitle} on ${date}`,
        html: userEmailHtml(bookingRecord)
      });

      await transport.sendMail({
        from: EMAIL_FROM,
        to: ADMIN_EMAIL,
        subject: `New booking request — ${serviceTitle} on ${date}`,
        html: adminEmailHtml(bookingRecord)
      });
    } catch (emailErr) {
      emailStatus = 'failed';
    }

    return res.status(201).json({ ok:true, booking: bookingRecord, emailStatus });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});

app.get('/api/health', (req,res)=>res.json({ok:true}));

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=>console.log('Server started on', PORT));
