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
const PRODUCT_SERVICES = [
  { title: 'CNC machine spare parts', description: 'Reliable spare parts for machining and production equipment.' },
  { title: 'Encoder cables', description: 'High-quality signal and communication cable solutions.' },
  { title: 'Fibre optic cables', description: 'Precision optical cable options for industrial applications.' },
  { title: 'Tactile membrane keypads', description: 'Durable input panels for control and operator interfaces.' },
  { title: 'Integrated circuits (ICs)', description: 'Electronic components for control, automation, and repair needs.' },
  { title: 'Industrial cooling fans', description: 'Efficient cooling support for machines and electrical panels.' },
  { title: 'Electrical equipment repair and maintenance', description: 'Support for repairs, servicing, and preventive maintenance.' },
  { title: 'CNC machine maintenance and engineering support', description: 'Practical maintenance and engineering assistance for CNC operations.' }
];

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'cnc-spares-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
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

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SPARES_FILE)) {
    writeJson(SPARES_FILE, [
      {
        id: 'spare-1',
        title: 'Spindle Bearing Kit',
        category: 'Spindle Parts',
        details: 'High-performance bearing kit suitable for CNC spindle assemblies. Ideal for replacement during routine maintenance or after wear detection. Please enquire for compatibility and availability.',
        imagePublicId: 'cnc-spares/spindle-bearing-kit'
      },
      {
        id: 'spare-2',
        title: 'Servo Motor Encoder',
        category: 'Drive Components',
        details: 'Precision encoder for servo motors. Helps maintain accurate motion feedback for CNC positioning systems. Enquire for model compatibility and stock information.',
        imagePublicId: 'cnc-spares/servo-encoder'
      },
      {
        id: 'spare-3',
        title: 'Ball Screw Assembly',
        category: 'Linear Motion',
        details: 'Durable ball screw assembly for smooth axis movement. Recommended for refurbishment and replacement jobs. Contact us for exact size and fitment details.',
        imagePublicId: 'cnc-spares/ball-screw'
      }
    ]);
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
      return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
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
    return targetPath;
  } catch (error) {
    console.error(`Failed to write ${filePath}:`, error);
    return targetPath;
  }
}

function loadData() {
  ensureDataFiles();
  return {
    spares: readJson(SPARES_FILE, []),
    inquiries: readJson(INQUIRIES_FILE, []),
    settings: readJson(SETTINGS_FILE, {})
  };
}

function persistJson(filePath, data) {
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

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
}

async function sendMail(settings, to, subject, html, attachments = []) {
  const transporter = getTransporter(settings);
  if (!transporter) {
    console.log(`[mail skipped] to=${to} subject=${subject}`);
    return { skipped: true };
  }

  return transporter.sendMail({
    from: settings.mailFrom || process.env.MAIL_FROM || settings.adminEmail || 'info@cncspareshub.com',
    to,
    subject,
    html,
    ...(attachments.length ? { attachments } : {})
  });
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

app.get('/', (req, res) => {
  const { spares, inquiries, settings } = loadData();
  if (settings.analyticsEnabled) {
    settings.analyticsVisits = Number(settings.analyticsVisits || 0) + 1;
    persistJson(SETTINGS_FILE, { ...settings, analyticsVisits: settings.analyticsVisits });
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

app.get('/products', (req, res) => {
  const { spares, settings } = loadData();
  if (settings.analyticsEnabled) {
    settings.analyticsVisits = Number(settings.analyticsVisits || 0) + 1;
    persistJson(SETTINGS_FILE, { ...settings, analyticsVisits: settings.analyticsVisits });
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

app.get('/contact', (req, res) => {
  const { settings } = loadData();
  if (settings.analyticsEnabled) {
    settings.analyticsVisits = Number(settings.analyticsVisits || 0) + 1;
    persistJson(SETTINGS_FILE, { ...settings, analyticsVisits: settings.analyticsVisits });
  }
  res.render('contact', { settings, submitted: req.query.submitted === '1' });
});

app.post('/contact', upload.single('imageFile'), async (req, res) => {
  const { settings } = loadData();
  let uploadResult = null;
  let attachments = [];

  if (req.file) {
    try {
      uploadResult = await uploadToCloudinary(req.file.buffer, req.file.originalname, settings);
    } catch (error) {
      console.error(error);
    }
  }

  if (uploadResult?.imageUrl) {
    const attachment = await buildEmailAttachment(uploadResult.imageUrl, 'contact-upload.jpg');
    if (attachment) attachments.push(attachment);
  }

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

  const imageHtml = attachments.length
    ? `<p><strong>Uploaded image:</strong></p><img src="cid:contact-image" alt="Uploaded contact image" style="max-width: 100%; max-height: 240px; border-radius: 10px;" />`
    : '';

  const html = `
    <h3>New Contact Enquiry Received</h3>
    <p><strong>Name:</strong> ${request.customerName}</p>
    <p><strong>Mobile:</strong> ${request.mobileNumber}</p>
    <p><strong>Email:</strong> ${request.emailId}</p>
    <p><strong>Description:</strong> ${request.description}</p>
    ${imageHtml}
  `;

  const customerHtml = `
    <h3>Thank you for contacting ${settings.companyName || 'us'}</h3>
    <p>We have received your request and will get back to you shortly.</p>
    <p><strong>Your message:</strong> ${request.description}</p>
    ${imageHtml}
  `;

  const customerEmail = request.emailId || settings.companyEmail || 'sales.cnchardwares@gmail.com';

  await Promise.allSettled([
    sendMail(settings, settings.adminEmail || 'sales.cnchardwares@gmail.com', 'New Contact Enquiry Received', html, attachments),
    sendMail(settings, customerEmail, 'We received your enquiry', customerHtml, attachments)
  ]);
  res.redirect('/contact?submitted=1');
});

app.get('/enquire/:id', (req, res) => {
  const { spares, settings } = loadData();
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
  const { spares, inquiries, settings } = loadData();
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

  inquiries.unshift(enquiry);
  persistJson(INQUIRIES_FILE, inquiries);

  const adminEmail = settings.adminEmail || process.env.ADMIN_EMAIL || 'sales.cnchardwares@gmail.com';
  const adminHtml = `
    <h3>New Contact Enquiry Received</h3>
    <p><strong>Customer:</strong> ${enquiry.customerName}</p>
    <p><strong>Mobile:</strong> ${enquiry.mobileNumber}</p>
    <p><strong>Email:</strong> ${enquiry.emailId}</p>
    <p><strong>Company:</strong> ${enquiry.companyName}</p>
    <p><strong>GSTIN:</strong> ${enquiry.gstinNumber}</p>
    <p><strong>Quantity:</strong> ${enquiry.quantity}</p>
    <p><strong>Spare:</strong> ${enquiry.spareTitle}</p>
  `;

  const customerHtml = `
    <h3>We have received your enquiry</h3>
    <p>Thank you, ${enquiry.customerName}. We have received your requirement for <strong>${enquiry.spareTitle}</strong>.</p>
    <p>Our team will review your request and update you shortly.</p>
  `;

  await Promise.allSettled([
    sendMail(settings, adminEmail, `New enquiry for ${enquiry.spareTitle}`, adminHtml),
    sendMail(settings, enquiry.emailId, `Enquiry received for ${enquiry.spareTitle}`, customerHtml)
  ]);

  res.redirect('/?submitted=1');
});

app.get('/admin/login', (req, res) => {
  res.render('admin-login', { error: '' });
});

app.post('/admin/login', (req, res) => {
  const password = req.body.password;
  const { settings } = loadData();
  const expectedPassword = getAdminPassword(settings);
  if (password === expectedPassword) {
    req.session.adminAuthenticated = true;
    return res.redirect('/admin');
  }
  res.render('admin-login', { error: 'Incorrect password. Please try again.' });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { spares, inquiries, settings } = loadData();
  res.render('admin', {
    spares,
    inquiries,
    settings,
    editingSpare: null,
    analyticsEnabled: Boolean(settings.analyticsEnabled),
    analyticsVisits: Number(settings.analyticsVisits || 0)
  });
});

app.get('/admin/company', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { settings } = loadData();
  res.render('admin-company', { settings });
});

app.get('/admin/spares', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { spares, inquiries, settings } = loadData();
  res.render('admin-spares', { spares, inquiries, settings, editingSpare: null });
});

app.get('/admin/spares/:id/edit', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { spares, inquiries, settings } = loadData();
  const editingSpare = spares.find((item) => item.id === req.params.id) || null;
  res.render('admin-spares', { spares, inquiries, settings, editingSpare });
});

app.post('/admin/spares', upload.single('imageFile'), async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { spares, settings } = loadData();
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
  res.redirect('/admin/spares');
});

app.post('/admin/spares/delete', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { spares } = loadData();
  const filtered = spares.filter((item) => item.id !== req.body.id);
  persistJson(SPARES_FILE, filtered);
  res.redirect('/admin/spares');
});

app.post('/admin/settings', upload.single('logoFile'), async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const current = loadData().settings;
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
  res.redirect('/admin/company');
});

app.post('/admin/analytics-toggle', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { settings } = loadData();
  const updatedSettings = {
    ...settings,
    analyticsEnabled: req.body.analyticsEnabled === 'on'
  };
  persistJson(SETTINGS_FILE, updatedSettings);
  res.redirect('/admin');
});

app.get('/admin/orders', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { inquiries, settings } = loadData();
  res.render('admin-orders', { inquiries, settings });
});

app.post('/admin/orders/:id/status', async (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { inquiries, settings } = loadData();
  const enquiry = inquiries.find((item) => item.id === req.params.id);
  if (!enquiry) {
    return res.redirect('/admin/orders');
  }

  enquiry.status = req.body.status;
  enquiry.updatedAt = new Date().toISOString();
  persistJson(INQUIRIES_FILE, inquiries);

  const subject = `Order status updated: ${req.body.status}`;
  const html = `
    <h3>Your inquiry update</h3>
    <p>Hello ${enquiry.customerName},</p>
    <p>Your request for <strong>${enquiry.spareTitle}</strong> is now marked as <strong>${req.body.status}</strong>.</p>
    <p>Thank you for choosing us.</p>
  `;

  await sendMail(settings, enquiry.emailId, subject, html);
  res.redirect('/admin/orders');
});

app.post('/admin/orders/delete', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { inquiries } = loadData();
  const filtered = inquiries.filter((item) => item.id !== req.body.id);
  persistJson(INQUIRIES_FILE, filtered);
  res.redirect('/admin/orders');
});

app.get('/admin/password', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { settings } = loadData();
  res.render('admin-password', { settings, message: '', error: '' });
});

app.post('/admin/password', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { settings } = loadData();
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';
  const confirmPassword = req.body.confirmPassword || '';
  const expectedPassword = getAdminPassword(settings);
  if (currentPassword !== expectedPassword) {
    return res.render('admin-password', { settings, message: '', error: 'Current password is incorrect.' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.render('admin-password', { settings, message: '', error: 'New password must be at least 4 characters.' });
  }
  if (newPassword !== confirmPassword) {
    return res.render('admin-password', { settings, message: '', error: 'New password and confirmation do not match.' });
  }

  const updatedSettings = { ...settings, adminPassword: newPassword };
  persistJson(SETTINGS_FILE, updatedSettings);
  return res.render('admin-password', { settings: updatedSettings, message: 'Admin password updated successfully.', error: '' });
});

app.get('/admin/export-orders', (req, res) => {
  if (!isAdmin(req)) return res.redirect('/admin/login');
  const { inquiries } = loadData();
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
