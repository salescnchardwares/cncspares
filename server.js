const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const SPARES_FILE = path.join(DATA_DIR, 'spares.json');
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const LEGACY_STARTER_SPARE_IDS = new Set(['spare-1', 'spare-2', 'spare-3']);
const PRODUCT_SERVICES = [
  { title: 'CNC machine spare parts', description: 'Reliable spare parts for machining and production equipment.' },
  { title: 'Encoder cables', description: 'High-quality signal and communication cable solutions.' },
  { title: 'Fibre optic cables', description: 'Precision optical cable options for industrial applications.' },
  { title: 'Tactile membrane keypads', description: 'Durable input panels for control and operator interfaces.' },
  { title: 'Integrated circuits (ICs)', description: 'Electronic components for control, automation, and repair needs.' },
  { title: 'Industrial cooling fans', description: 'Efficient cooling support for machines and electrical panels.' },
  { title: 'CNC machine maintenance and engineering support', description: 'Practical maintenance and engineering assistance for CNC operations.' }
];

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'cnc-spares-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.SESSION_SECURE === 'true'
  }
}));

function isWritableDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function resolveStoragePath(filePath) {
  if (process.env.VERCEL === '1') {
    const relativePath = path.relative(__dirname, filePath) || path.basename(filePath);
    return path.join('/tmp', 'cnc-spares', relativePath);
  }

  const dirPath = path.dirname(filePath);
  return isWritableDir(dirPath) ? filePath : path.join('/tmp', 'cnc-spares', path.basename(filePath));
}

function syncProjectFileFromRuntime(filePath) {
  const targetPath = resolveStoragePath(filePath);
  if (targetPath === filePath || !fs.existsSync(targetPath)) {
    return;
  }

  try {
    const runtimeData = fs.readFileSync(targetPath, 'utf8');
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, runtimeData);
    }
  } catch (error) {
    // ignore and keep the runtime copy as the source of truth for this process
  }
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  syncProjectFileFromRuntime(SPARES_FILE);
  syncProjectFileFromRuntime(INQUIRIES_FILE);
  syncProjectFileFromRuntime(SETTINGS_FILE);

  if (!fs.existsSync(SPARES_FILE)) {
    writeJson(SPARES_FILE, []);
  }
  if (!fs.existsSync(INQUIRIES_FILE)) writeJson(INQUIRIES_FILE, []);
  if (!fs.existsSync(SETTINGS_FILE)) {
    writeJson(SETTINGS_FILE, {
      companyName: 'CNC Hardwares',
      companyTagline: 'Your trusted source for CNC spare parts sales and service',
      companyDescription: 'CNC Hardwares specializes in CNC spare parts sales and service, helping workshops and manufacturing units keep their machines running with reliable support and quality components.',
      companyAddress: 'Industrial Area, Coimbatore, Tamil Nadu',
      companyPhone: '+91 98765 43210',
      companyEmail: 'cnchardwares@gmail.com',
      adminEmail: 'admin@cnchardwares.com',
      adminPassword: 'admin1234',
      analyticsEnabled: false,
      analyticsVisits: 0,
      smtpHost: '',
      smtpUser: '',
      smtpPass: '',
      mailFrom: '',
      cloudinaryCloudName: '',
      cloudinaryUploadPreset: '',
      cloudinaryFolder: 'cnc-spares'
    });
  }
}

function readJson(filePath, fallback) {
  const targetPath = resolveStoragePath(filePath);

  try {
    if (fs.existsSync(targetPath)) {
      const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      if (targetPath !== filePath && !fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
      return data;
    }
  } catch (error) {
    // ignore and fall back
  }

  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      writeJson(filePath, data);
      return data;
    }
  } catch (error) {
    // ignore and use fallback
  }

  return fallback;
}

function writeJson(filePath, data) {
  const targetPath = resolveStoragePath(filePath);
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
    if (targetPath !== filePath) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    return targetPath;
  } catch (error) {
    console.error(`Failed to write ${filePath}:`, error);
    return targetPath;
  }
}

async function loadData() {
  ensureDataFiles();
  const storedSpares = await readJson(SPARES_FILE, []);
  const spares = storedSpares.filter((spare) => !LEGACY_STARTER_SPARE_IDS.has(spare.id));
  if (spares.length !== storedSpares.length) {
    await persistJson(SPARES_FILE, spares);
  }

  return {
    spares,
    inquiries: await readJson(INQUIRIES_FILE, []),
    settings: await readJson(SETTINGS_FILE, {})
  };
}

async function persistJson(filePath, data) {
  return writeJson(filePath, data);
}

function toCsvValue(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function buildSpareImageUrl(spare, settings) {
  if (spare.imageUrl) return spare.imageUrl;
  if (spare.imagePublicId && settings.cloudinaryCloudName) {
    const folder = settings.cloudinaryFolder ? `${settings.cloudinaryFolder}/` : '';
    return `https://res.cloudinary.com/${settings.cloudinaryCloudName}/image/upload/${folder}${spare.imagePublicId}`;
  }
  return '';
}

function normalizeInquiryField(value) {
  return String(value ?? '').trim().toLowerCase();
}

function buildInquiryFingerprint(source, data) {
  const values = [
    source,
    data.spareId || '',
    data.customerName || '',
    data.mobileNumber || '',
    data.emailId || '',
    data.companyName || '',
    data.gstinNumber || '',
    data.quantity || '',
    data.description || ''
  ].map((value) => normalizeInquiryField(value));

  return values.join('|');
}

function hasRecentDuplicateInquiry(inquiries, fingerprint, duplicateWindowMs = 10 * 60 * 1000) {
  return inquiries.find((item) => {
    const itemFingerprint = item.enquiryFingerprint || buildInquiryFingerprint(item.source || 'enquiry', item);
    if (itemFingerprint !== fingerprint) return false;
    if (!item.createdAt) return false;
    const createdAt = new Date(item.createdAt).getTime();
    return !Number.isNaN(createdAt) && Date.now() - createdAt < duplicateWindowMs;
  });
}

async function uploadToCloudinary(buffer, fileName, settings) {
  const cloudName = settings.cloudinaryCloudName || process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = settings.cloudinaryUploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    return null;
  }

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'image/jpeg' }), fileName);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', settings.cloudinaryFolder || 'cnc-spares');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudinary upload failed: ${text}`);
  }

  const data = await response.json();
  return {
    imageUrl: data.secure_url,
    imagePublicId: data.public_id
  };
}

function isAdmin(req) {
  return !!req.session.adminAuthenticated;
}

function getAdminPassword(settings) {
  return settings.adminPassword || process.env.ADMIN_PASSWORD || 'admin1234';
}

function getTransporter(settings) {
  const smtpHost = settings.smtpHost || process.env.SMTP_HOST;
  const smtpUser = settings.smtpUser || process.env.SMTP_USER;
  const smtpPass = settings.smtpPass || process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  const isGmail = smtpHost.includes('gmail.com');

  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      family: 4,
      connectionTimeout: 10000,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    pool: true,
    family: 4,
    connectionTimeout: 10000,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
}

async function sendMail(settings, to, subject, html, attachments = []) {
  if (!to || !to.trim()) {
    console.log(`[mail skipped: no recipient] subject=${subject}`);
    return { skipped: true };
  }

  try {
    const transporter = getTransporter(settings);
    if (!transporter) {
      console.log(`[mail skipped: no transporter] to=${to} subject=${subject}`);
      return { skipped: true };
    }

    const fromName = settings.companyName || 'CNC Hardwares';
    const fromEmail = settings.mailFrom || settings.smtpUser || settings.adminEmail || 'sales.cnchardwares@gmail.com';

    console.log(`[sending mail] to=${to} subject="${subject}"`);
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: to.trim(),
      subject,
      html,
      ...(attachments.length ? { attachments } : {})
    });
    console.log(`[mail sent SUCCESS] to=${to} id=${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[mail error] to=${to} subject="${subject}":`, error.message);
    return { error: error.message };
  }
}

async function buildEmailAttachment(imageUrl, fileName) {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      filename: fileName,
      content: buffer,
      cid: 'contact-image'
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

app.get('/', async (req, res) => {
  const { spares, inquiries, settings } = await loadData();
  if (settings.analyticsEnabled) {
    settings.analyticsVisits = Number(settings.analyticsVisits || 0) + 1;
    await persistJson(SETTINGS_FILE, { ...settings, analyticsVisits: settings.analyticsVisits });
  }
  const enrichedSpares = spares.map((spare) => ({
    ...spare,
    imageSrc: buildSpareImageUrl(spare, settings)
  }));
  const contactRequests = inquiries.filter((item) => item.source === 'contact').slice(0, 4);
  res.render('home', {
    spares: enrichedSpares,
    contactRequests,
    settings,
    services: PRODUCT_SERVICES,
    submitted: req.query.submitted === '1'
  });
});

app.get('/products', async (req, res) => {
  const { spares, settings } = await loadData();
  if (settings.analyticsEnabled) {
    settings.analyticsVisits = Number(settings.analyticsVisits || 0) + 1;
    await persistJson(SETTINGS_FILE, { ...settings, analyticsVisits: settings.analyticsVisits });
  }
  const enrichedSpares = spares.map((spare) => ({
    ...spare,
    imageSrc: buildSpareImageUrl(spare, settings)
  }));
  res.render('products', {
    spares: enrichedSpares,
    settings,
    services: PRODUCT_SERVICES
  });
});

app.get('/contact', async (req, res) => {
  const { settings } = await loadData();
  if (settings.analyticsEnabled) {
    settings.analyticsVisits = Number(settings.analyticsVisits || 0) + 1;
    await persistJson(SETTINGS_FILE, { ...settings, analyticsVisits: settings.analyticsVisits });
  }
  res.render('contact', { settings, submitted: req.query.submitted === '1' });
});

app.post('/contact', async (req, res) => {
  const { settings } = await loadData();
  if (req.body.website && req.body.website.trim()) {
    return res.redirect('/contact?submitted=1');
  }

  let uploadResult = null;
  let attachments = [];

  const request = {
    id: `contact-${Date.now()}`,
    source: 'contact',
    customerName: req.body.customerName,
    description: req.body.description,
    mobileNumber: req.body.mobileNumber,
    emailId: req.body.emailId,
    imageUrl: uploadResult?.imageUrl || '',
    imagePublicId: uploadResult?.imagePublicId || '',
    imageAlt: req.body.description || req.body.customerName,
    status: 'Submitted',
    createdAt: new Date().toISOString()
  };

  const { inquiries } = await loadData();
  const contactFingerprint = buildInquiryFingerprint('contact', request);
  const existingContactRequest = hasRecentDuplicateInquiry(inquiries, contactFingerprint);
  if (existingContactRequest) {
    return res.redirect('/contact?submitted=1');
  }

  request.enquiryFingerprint = contactFingerprint;
  inquiries.unshift(request);
  await persistJson(INQUIRIES_FILE, inquiries);

  const adminEmail = settings.adminEmail || 'sales.cnchardwares@gmail.com';
  const adminHtml = `
    <h3>New Contact Enquiry Received</h3>
    <p><strong>Name:</strong> ${request.customerName}</p>
    <p><strong>Mobile:</strong> ${request.mobileNumber}</p>
    <p><strong>Email:</strong> ${request.emailId}</p>
    <p><strong>Description:</strong> ${request.description}</p>
  `;

  const customerHtml = `
    <h3>Thank you for contacting ${settings.companyName || 'CNC Hardwares'}</h3>
    <p>We have received your requirement: <em>"${request.description}"</em></p>
    <p>Our team will get back to you shortly. Helpline: ${settings.companyPhone}</p>
  `;

  await sendMail(settings, adminEmail, 'New Contact Message Received', adminHtml, attachments);
  if (request.emailId && request.emailId.trim()) {
    await sendMail(settings, request.emailId, 'We have received your enquiry', customerHtml, attachments);
  }

  res.redirect('/contact?submitted=1');
});

app.get('/enquire/:id', async (req, res) => {
  const { spares, settings } = await loadData();
  const spare = spares.find((item) => item.id === req.params.id);
  if (!spare) {
    return res.status(404).send('Spare not found');
  }
  const enrichedSpare = {
    ...spare,
    imageSrc: buildSpareImageUrl(spare, settings)
  };
  res.render('enquiry', { spare: enrichedSpare, settings });
});

app.post('/enquire/:id', async (req, res) => {
  const { spares, inquiries, settings } = await loadData();
  if (req.body.website && req.body.website.trim()) {
    return res.redirect('/?submitted=1');
  }

  const spare = spares.find((item) => item.id === req.params.id);
  if (!spare) {
    return res.status(404).send('Spare not found');
  }

  const enquiry = {
    id: `order-${Date.now()}`,
    spareId: spare.id,
    spareTitle: spare.title,
    customerName: req.body.customerName,
    mobileNumber: req.body.mobileNumber,
    emailId: req.body.emailId,
    companyName: req.body.companyName || 'Not provided',
    gstinNumber: req.body.gstinNumber || 'Not provided',
    quantity: Number(req.body.quantity || 1),
    status: 'Pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const enquiryFingerprint = buildInquiryFingerprint('enquiry', enquiry);
  const existingEnquiry = hasRecentDuplicateInquiry(inquiries, enquiryFingerprint);
  if (existingEnquiry) {
    return res.redirect('/?submitted=1');
  }

  enquiry.enquiryFingerprint = enquiryFingerprint;
  inquiries.unshift(enquiry);
  await persistJson(INQUIRIES_FILE, inquiries);

  const adminEmail = settings.adminEmail || process.env.ADMIN_EMAIL || 'sales.cnchardwares@gmail.com';

  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #0c2340; color: #ffffff; padding: 20px 24px;">
        <h2 style="margin: 0; font-size: 18px; color: #f97316;">🔔 New Customer Order / Enquiry</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #cbd5e1;">Received on website catalog</p>
      </div>
      <div style="padding: 24px;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b;"><strong>Order ID:</strong></td>
            <td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${enquiry.id}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b;"><strong>Product / Spare:</strong></td>
            <td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${enquiry.spareTitle}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b;"><strong>Quantity:</strong></td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: bold;">${enquiry.quantity}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b;"><strong>Customer Name:</strong></td>
            <td style="padding: 8px 0; color: #0f172a;">${enquiry.customerName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b;"><strong>Mobile Number:</strong></td>
            <td style="padding: 8px 0;"><a href="tel:${enquiry.mobileNumber}" style="color: #2563eb; font-weight: bold;">${enquiry.mobileNumber}</a></td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b;"><strong>Customer Email:</strong></td>
            <td style="padding: 8px 0;"><a href="mailto:${enquiry.emailId}" style="color: #2563eb;">${enquiry.emailId}</a></td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b;"><strong>Company:</strong></td>
            <td style="padding: 8px 0; color: #0f172a;">${enquiry.companyName || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>GSTIN:</strong></td>
            <td style="padding: 8px 0; color: #0f172a;">${enquiry.gstinNumber || 'Not provided'}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  const customerHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #0c2340; color: #ffffff; padding: 24px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">${settings.companyName || 'CNC Hardwares'}</h2>
        <p style="margin: 6px 0 0; font-size: 14px; color: #cbd5e1;">Order &amp; Enquiry Confirmation</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 16px; color: #0f172a; margin-top: 0;">Dear <strong>${enquiry.customerName}</strong>,</p>
        <p style="font-size: 14px; color: #334155; line-height: 1.5;">
          Thank you for reaching out. We have received your requirement for <strong>${enquiry.spareTitle}</strong>. Our engineering team will verify part compatibility, check current inventory, and update you with quotation details shortly.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px; font-size: 15px; color: #0c2340;">Order Summary</h3>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Order Reference:</strong></td>
              <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #0f172a;">${enquiry.id}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Product / Spare:</strong></td>
              <td style="padding: 6px 0; text-align: right; color: #0f172a;">${enquiry.spareTitle}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Quantity:</strong></td>
              <td style="padding: 6px 0; text-align: right; color: #0f172a; font-weight: bold;">${enquiry.quantity}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Status:</strong></td>
              <td style="padding: 6px 0; text-align: right;"><span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 99px; font-weight: bold; font-size: 12px;">${enquiry.status}</span></td>
            </tr>
          </table>
        </div>

        <div style="background: #f0f7ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 14px; font-size: 13px; color: #0369a1;">
          <p style="margin: 0 0 4px;"><strong>Need immediate assistance?</strong></p>
          <p style="margin: 0;">Phone: <a href="tel:${settings.companyPhone}" style="color: #0284c7; font-weight: bold;">${settings.companyPhone}</a> | Email: <a href="mailto:${settings.companyEmail}" style="color: #0284c7;">${settings.companyEmail}</a></p>
          <p style="margin: 4px 0 0;">Working Hours: Monday to Friday 09:00 AM to 05:30PM</p>
        </div>
      </div>
      <div style="background: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
        &copy; ${new Date().getFullYear()} ${settings.companyName || 'CNC Hardwares'}. All rights reserved.
      </div>
    </div>
  `;

  // Send admin notification and customer confirmation
  await sendMail(settings, adminEmail, `New Order Enquiry: ${enquiry.spareTitle} (Ref: ${enquiry.id})`, adminHtml);
  if (enquiry.emailId && enquiry.emailId.trim()) {
    await sendMail(settings, enquiry.emailId, `Order Confirmation: ${enquiry.spareTitle} - ${settings.companyName || 'CNC Hardwares'}`, customerHtml);
  }

  res.redirect('/?submitted=1');
});

app.get(['/Updates/login', '/updates/login', '/admin/login'], (req, res) => {
  res.render('admin-login', { error: '', adminBase: '/Updates' });
});

app.post(['/Updates/login', '/updates/login', '/admin/login'], async (req, res) => {
  const password = req.body.password;
  const { settings } = await loadData();
  const expectedPassword = getAdminPassword(settings);
  if (password === expectedPassword) {
    req.session.adminAuthenticated = true;
    return res.redirect('/Updates');
  }
  res.render('admin-login', { error: 'Incorrect password. Please try again.', adminBase: '/Updates' });
});

app.get(['/Updates/logout', '/updates/logout', '/admin/logout'], (req, res) => {
  req.session.destroy(() => {
    res.redirect('/Updates/login');
  });
});

app.get(['/Updates', '/updates', '/admin'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { spares, inquiries, settings } = await loadData();
  res.render('admin', {
    spares,
    inquiries,
    settings,
    editingSpare: null,
    analyticsEnabled: Boolean(settings.analyticsEnabled),
    analyticsVisits: Number(settings.analyticsVisits || 0),
    adminBase: '/Updates'
  });
});

app.get(['/Updates/company', '/updates/company', '/admin/company'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { settings } = await loadData();
  res.render('admin-company', { settings, adminBase: '/Updates' });
});

app.get(['/Updates/spares', '/updates/spares', '/admin/spares'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { spares, inquiries, settings } = await loadData();
  res.render('admin-spares', { spares, inquiries, settings, editingSpare: null, adminBase: '/Updates' });
});

app.get(['/Updates/spares/:id/edit', '/updates/spares/:id/edit', '/admin/spares/:id/edit'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { spares, inquiries, settings } = await loadData();
  const editingSpare = spares.find((item) => item.id === req.params.id) || null;
  res.render('admin-spares', { spares, inquiries, settings, editingSpare, adminBase: '/Updates' });
});

app.post(['/Updates/spares', '/updates/spares', '/admin/spares'], upload.single('imageFile'), async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { spares, settings } = await loadData();
  const spareId = req.body.id || `spare-${Date.now()}`;
  const updatedSpares = spares.filter((item) => item.id !== spareId);
  let imageUpload = null;

  if (req.file) {
    try {
      imageUpload = await uploadToCloudinary(req.file.buffer, req.file.originalname, settings);
    } catch (error) {
      console.error(error);
    }
  }

  updatedSpares.push({
    id: spareId,
    title: req.body.title,
    category: req.body.category,
    details: req.body.details,
    imageUrl: imageUpload?.imageUrl || req.body.imageUrl || '',
    imagePublicId: imageUpload?.imagePublicId || req.body.imagePublicId || '',
    imageAlt: req.body.imageAlt || req.body.title
  });
  persistJson(SPARES_FILE, updatedSpares);
  res.redirect('/Updates/spares');
});

app.post(['/Updates/spares/delete', '/updates/spares/delete', '/admin/spares/delete'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { spares } = await loadData();
  const filtered = spares.filter((item) => item.id !== req.body.id);
  await persistJson(SPARES_FILE, filtered);
  res.redirect('/Updates/spares');
});

app.post(['/Updates/settings', '/updates/settings', '/admin/settings'], upload.single('logoFile'), async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { settings: current } = await loadData();
  let logoUrl = req.body.companyLogoUrl || current.companyLogoUrl || '';
  let logoPublicId = current.companyLogoPublicId || '';

  if (req.file) {
    try {
      const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.originalname, current);
      if (uploadResult?.imageUrl) {
        logoUrl = uploadResult.imageUrl;
        logoPublicId = uploadResult.imagePublicId;
      }
    } catch (error) {
      console.error(error);
    }
  }

  const settings = {
    ...current,
    companyName: req.body.companyName,
    companyTagline: req.body.companyTagline,
    companyDescription: req.body.companyDescription,
    companyAddress: req.body.companyAddress,
    companyPhone: req.body.companyPhone,
    companyEmail: req.body.companyEmail,
    adminEmail: req.body.adminEmail,
    analyticsEnabled: req.body.analyticsEnabled === 'on',
    smtpHost: req.body.smtpHost,
    smtpUser: req.body.smtpUser,
    smtpPass: req.body.smtpPass,
    mailFrom: req.body.mailFrom,
    cloudinaryCloudName: req.body.cloudinaryCloudName,
    cloudinaryUploadPreset: req.body.cloudinaryUploadPreset,
    cloudinaryFolder: req.body.cloudinaryFolder,
    companyLogoUrl: logoUrl,
    companyLogoPublicId: logoPublicId
  };
  persistJson(SETTINGS_FILE, settings);
  res.redirect('/Updates/company');
});

app.post(['/Updates/analytics-toggle', '/updates/analytics-toggle', '/admin/analytics-toggle'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { settings } = await loadData();
  const updatedSettings = {
    ...settings,
    analyticsEnabled: req.body.analyticsEnabled === 'on'
  };
  await persistJson(SETTINGS_FILE, updatedSettings);
  res.redirect('/Updates');
});

app.get(['/Updates/orders', '/updates/orders', '/admin/orders'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { inquiries, settings } = await loadData();
  res.render('admin-orders', { inquiries, settings, adminBase: '/Updates', updated: req.query.updated === '1' });
});

app.post(['/Updates/orders/:id/status', '/updates/orders/:id/status', '/admin/orders/:id/status'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { inquiries, settings } = await loadData();
  const enquiry = inquiries.find((item) => item.id === req.params.id);
  if (!enquiry) {
    return res.redirect('/Updates/orders');
  }

  enquiry.status = req.body.status;
  enquiry.updatedAt = new Date().toISOString();
  await persistJson(INQUIRIES_FILE, inquiries);

  if (enquiry.emailId && enquiry.emailId.trim()) {
    const statusColor = 
      enquiry.status === 'Completed' ? '#10b981' :
      enquiry.status === 'Confirmed' ? '#2563eb' :
      enquiry.status === 'Packed' ? '#7c3aed' : '#f59e0b';

    const subject = `Order Status Update: [${enquiry.status}] - ${enquiry.spareTitle || 'CNC Spares Requirement'}`;
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0c2340 0%, #1e3e62 100%); color: #ffffff; padding: 28px 24px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">${settings.companyName || 'CNC Hardwares'}</h2>
          <p style="margin: 6px 0 0; font-size: 14px; color: #cbd5e1;">Customer Enquiry &amp; Order Status Update</p>
        </div>

        <div style="padding: 28px 24px;">
          <p style="font-size: 16px; color: #0f172a; margin-top: 0;">Hello <strong>${enquiry.customerName || 'Customer'}</strong>,</p>
          <p style="font-size: 15px; color: #475569; line-height: 1.6;">
            We are writing to inform you that your spare part enquiry / order status has been updated:
          </p>

          <div style="text-align: center; margin: 24px 0;">
            <span style="display: inline-block; background: ${statusColor}; color: #ffffff; font-weight: 800; font-size: 16px; padding: 10px 28px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">
              ${enquiry.status}
            </span>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Order Reference:</td>
              <td style="padding: 10px 0; color: #0f172a; text-align: right; font-weight: bold;">${enquiry.id}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Spare / Item:</td>
              <td style="padding: 10px 0; color: #0f172a; text-align: right; font-weight: 600;">${enquiry.spareTitle || 'Custom Requirement'}</td>
            </tr>
            ${enquiry.quantity ? `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Quantity:</td>
              <td style="padding: 10px 0; color: #0f172a; text-align: right; font-weight: 600;">${enquiry.quantity}</td>
            </tr>` : ''}
            ${enquiry.companyName && enquiry.companyName !== 'Not provided' ? `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Company:</td>
              <td style="padding: 10px 0; color: #0f172a; text-align: right;">${enquiry.companyName}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Last Updated:</td>
              <td style="padding: 10px 0; color: #0f172a; text-align: right;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td>
            </tr>
          </table>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-top: 24px; font-size: 13px; color: #475569;">
            <p style="margin: 0 0 6px; font-weight: bold; color: #0f172a;">Direct Contact &amp; Dispatch Support:</p>
            <p style="margin: 0;">Phone / WhatsApp: <a href="tel:${settings.companyPhone}" style="color: #2563eb; font-weight: bold; text-decoration: none;">${settings.companyPhone}</a></p>
            <p style="margin: 4px 0 0;">Email: <a href="mailto:${settings.companyEmail}" style="color: #2563eb; text-decoration: none;">${settings.companyEmail}</a></p>
            <p style="margin: 4px 0 0;">Operating Hours: Monday to Friday 09:00 AM to 05:30PM</p>
          </div>
        </div>

        <div style="background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          &copy; ${new Date().getFullYear()} ${settings.companyName || 'CNC Hardwares'}. All rights reserved.
        </div>
      </div>
    `;

    console.log(`[sending status email] to=${enquiry.emailId} status=${enquiry.status}`);
    await sendMail(settings, enquiry.emailId, subject, html);
  }

  res.redirect('/Updates/orders?updated=1');
});

app.post(['/Updates/orders/delete', '/updates/orders/delete', '/admin/orders/delete'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { inquiries } = await loadData();
  const filtered = inquiries.filter((item) => item.id !== req.body.id);
  persistJson(INQUIRIES_FILE, filtered);
  res.redirect('/Updates/orders');
});

app.get(['/Updates/password', '/updates/password', '/admin/password'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { settings } = await loadData();
  res.render('admin-password', { settings, message: '', error: '', adminBase: '/Updates' });
});

app.post(['/Updates/password', '/updates/password', '/admin/password'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { settings } = await loadData();
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';
  const confirmPassword = req.body.confirmPassword || '';
  const expectedPassword = getAdminPassword(settings);
  if (currentPassword !== expectedPassword) {
    return res.render('admin-password', { settings, message: '', error: 'Current password is incorrect.', adminBase: '/Updates' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.render('admin-password', { settings, message: '', error: 'New password must be at least 4 characters.', adminBase: '/Updates' });
  }
  if (newPassword !== confirmPassword) {
    return res.render('admin-password', { settings, message: '', error: 'New password and confirmation do not match.', adminBase: '/Updates' });
  }

  const updatedSettings = { ...settings, adminPassword: newPassword };
  persistJson(SETTINGS_FILE, updatedSettings);
  return res.render('admin-password', { settings: updatedSettings, message: 'Admin password updated successfully.', error: '', adminBase: '/Updates' });
});

app.get(['/Updates/export-orders', '/updates/export-orders', '/admin/export-orders'], async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/Updates/login');
  const { inquiries } = await loadData();
  const rows = [
    ['Order ID', 'Customer Name', 'Mobile Number', 'Email', 'Company', 'GSTIN', 'Quantity', 'Spare', 'Status', 'Created At', 'Updated At']
  ];

  inquiries.forEach((enquiry) => {
    rows.push([
      enquiry.id || '',
      enquiry.customerName || '',
      enquiry.mobileNumber || '',
      enquiry.emailId || '',
      enquiry.companyName || '',
      enquiry.gstinNumber || '',
      enquiry.quantity || '',
      enquiry.spareTitle || '',
      enquiry.status || '',
      enquiry.createdAt || '',
      enquiry.updatedAt || ''
    ]);
  });

  const csv = rows.map((row) => row.map((value) => toCsvValue(value)).join(',')).join('\n');
  const fileName = 'orders-export.csv';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csv);
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`CNC spares website running on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is busy, trying ${port + 1}...`);
      startServer(port + 1);
      return;
    }

    console.error(error);
    process.exit(1);
  });
}

if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  startServer(PORT);
}

module.exports = app;


process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
