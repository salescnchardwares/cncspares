const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.PORT = '0';

const BASE_TMP_DIR = process.platform === 'win32' ? os.tmpdir() : '/tmp';
const runtimeDataDir = path.join(BASE_TMP_DIR, 'cnc-spares', 'data');
const runtimeSparesPath = path.join(runtimeDataDir, 'spares.json');
const runtimeSettingsPath = path.join(runtimeDataDir, 'settings.json');
const backups = new Map();

function backupAndWrite(filePath, data) {
  backups.set(filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function restoreFile(filePath) {
  const backup = backups.get(filePath);
  if (backup === null) {
    fs.rmSync(filePath, { force: true });
  } else {
    fs.writeFileSync(filePath, backup);
  }
}

let records = [];
let failNextWrite = false;
const serviceRoleKey = 'supabase-test-service-role-key';

const storageServer = http.createServer(async (req, res) => {
  if (req.headers.apikey !== serviceRoleKey || req.headers.authorization !== `Bearer ${serviceRoleKey}`) {
    res.writeHead(401);
    res.end('Unauthorized');
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/rest/v1/site_inquiries') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(records));
    return;
  }

  if (req.method === 'POST') {
    if (failNextWrite) {
      failNextWrite = false;
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"message":"simulated storage failure"}');
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    for (const row of JSON.parse(body)) {
      records = records.filter((record) => record.id !== row.id);
      records.push(row);
    }
    res.writeHead(201);
    res.end();
    return;
  }

  if (req.method === 'DELETE') {
    const filter = url.searchParams.get('id') || '';
    const id = filter.startsWith('eq.') ? filter.slice(3) : '';
    records = records.filter((record) => record.id !== id);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

(async () => {
  await new Promise((resolve) => storageServer.listen(0, '127.0.0.1', resolve));
  const storagePort = storageServer.address().port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${storagePort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  const sourceSpares = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'spares.json'), 'utf8'));
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'settings.json'), 'utf8'));
  settings.smtpHost = '';
  settings.smtpUser = '';
  settings.smtpPass = '';
  backupAndWrite(runtimeSparesPath, sourceSpares);
  backupAndWrite(runtimeSettingsPath, settings);

  const app = require('../server');
  const appServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));
  const appPort = appServer.address().port;
  const spare = sourceSpares[0];

  try {
    const loginResponse = await fetch(`http://127.0.0.1:${appPort}/admin/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(settings.adminPassword || 'admin1234')}`
    });
    const cookie = loginResponse.headers.get('set-cookie') || '';
    assert.ok(cookie.includes('connect.sid='), 'admin login should set a session cookie');

    const productOrder = new URLSearchParams({
      customerName: 'Supabase Order Tester',
      mobileNumber: '9999999999',
      emailId: 'supabase-order@example.com',
      companyName: 'Persistent Labs',
      gstinNumber: '29ABCDE1234F1Z5',
      quantity: '3'
    });
    const orderResponse = await fetch(`http://127.0.0.1:${appPort}/enquire/${spare.id}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: productOrder
    });
    assert.strictEqual(orderResponse.status, 302, 'product enquiry should redirect after saving');

    const contactRequest = new URLSearchParams({
      customerName: 'Supabase Contact Tester',
      mobileNumber: '8888888888',
      emailId: 'supabase-contact@example.com',
      description: 'Please contact me about CNC parts',
      website: ''
    });
    const contactResponse = await fetch(`http://127.0.0.1:${appPort}/contact`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: contactRequest
    });
    assert.strictEqual(contactResponse.status, 302, 'contact enquiry should redirect after saving');
    assert.strictEqual(records.length, 2, 'both product and contact enquiries should be persisted');

    const ordersResponse = await fetch(`http://127.0.0.1:${appPort}/Updates/orders`, { headers: { cookie } });
    const ordersHtml = await ordersResponse.text();
    assert.ok(ordersHtml.includes('Supabase Order Tester'), 'admin list should show product enquiry details');
    assert.ok(ordersHtml.includes(spare.title), 'admin list should show the requested product');
    assert.ok(ordersHtml.includes('supabase-contact@example.com'), 'admin list should show contact form submissions');
    assert.ok(ordersHtml.includes('Please contact me about CNC parts'), 'admin list should show contact descriptions');

    failNextWrite = true;
    const failedSaveResponse = await fetch(`http://127.0.0.1:${appPort}/contact`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        customerName: 'Storage Failure Tester',
        mobileNumber: '7777777777',
        emailId: 'storage-failure@example.com',
        description: 'This request must not be accepted without storage',
        website: ''
      })
    });
    assert.strictEqual(failedSaveResponse.status, 503, 'failed storage should be reported instead of accepting the enquiry');
    assert.strictEqual(records.length, 2, 'failed persistence must not add an enquiry');

    const order = records.find((record) => record.record.customerName === 'Supabase Order Tester');
    const statusResponse = await fetch(`http://127.0.0.1:${appPort}/Updates/orders/${order.id}/status`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'status=Confirmed'
    });
    assert.strictEqual(statusResponse.status, 302, 'status update should redirect');
    assert.strictEqual(records.find((record) => record.id === order.id).record.status, 'Confirmed', 'status changes should persist');

    const contact = records.find((record) => record.record.source === 'contact');
    const deleteResponse = await fetch(`http://127.0.0.1:${appPort}/Updates/orders/delete`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: `id=${encodeURIComponent(contact.id)}`
    });
    assert.strictEqual(deleteResponse.status, 302, 'deleting an enquiry should redirect');
    assert.strictEqual(records.length, 1, 'deleting an enquiry should remove it from persistent storage');

    console.log('supabase-inquiry-persistence-test: ok');
  } catch (error) {
    console.error('supabase-inquiry-persistence-test: failed');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    appServer.close();
    storageServer.close();
    restoreFile(runtimeSparesPath);
    restoreFile(runtimeSettingsPath);
  }
})();
