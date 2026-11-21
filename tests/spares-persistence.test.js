const assert = require('assert');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.PORT = '0';

const BASE_TMP_DIR = process.platform === 'win32' ? os.tmpdir() : '/tmp';
const runtimeDataDir = path.join(BASE_TMP_DIR, 'cnc-spares', 'data');
const runtimeSparesPath = path.join(runtimeDataDir, 'spares.json');
const runtimeSettingsPath = path.join(runtimeDataDir, 'settings.json');

let sparesRecords = [];
const serviceRoleKey = 'test-service-key-spares';

// Mock Supabase server with site_spares table
const storageServer = http.createServer(async (req, res) => {
  if (req.headers.apikey !== serviceRoleKey || req.headers.authorization !== `Bearer ${serviceRoleKey}`) {
    res.writeHead(401);
    res.end('Unauthorized');
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/rest/v1/site_inquiries') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('[]');
    return;
  }

  if (url.pathname === '/rest/v1/site_spares') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(sparesRecords));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const rows = JSON.parse(body);
      for (const row of rows) {
        sparesRecords = sparesRecords.filter((r) => r.id !== row.id);
        sparesRecords.push(row);
      }
      res.writeHead(201);
      res.end();
      return;
    }

    if (req.method === 'DELETE') {
      const filter = url.searchParams.get('id') || '';
      const id = filter.startsWith('eq.') ? filter.slice(3) : '';
      sparesRecords = sparesRecords.filter((r) => r.id !== id);
      res.writeHead(204);
      res.end();
      return;
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

(async () => {
  await new Promise((resolve) => storageServer.listen(0, '127.0.0.1', resolve));
  const storagePort = storageServer.address().port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${storagePort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    // 1. Login to admin
    const loginResponse = await fetch(`http://127.0.0.1:${port}/admin/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=admin1234'
    });
    const cookie = loginResponse.headers.get('set-cookie') || '';
    assert.ok(cookie.includes('connect.sid='), 'admin login should set a session cookie');

    // 2. Add more than 4 products (5 products)
    for (let i = 1; i <= 5; i++) {
      const form = new FormData();
      form.append('id', `test-part-${i}`);
      form.append('title', `CNC Precision Part #${i}`);
      form.append('category', 'Precision Spares');
      form.append('details', `Details for part number ${i}`);

      const createResponse = await fetch(`http://127.0.0.1:${port}/admin/spares`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie },
        body: form
      });
      assert.strictEqual(createResponse.status, 302, `product ${i} should be created and redirect`);
    }

    // 3. Verify all 5 products exist in Supabase site_spares table (along with any seeded parts)
    const initialCount = sparesRecords.length;
    assert.ok(initialCount >= 5, 'all 5 products should be persisted in Supabase');

    // 4. Verify the products page lists all 5 products
    const productsResponse = await fetch(`http://127.0.0.1:${port}/products`);
    const productsHtml = await productsResponse.text();
    for (let i = 1; i <= 5; i++) {
      assert.ok(productsHtml.includes(`CNC Precision Part #${i}`), `products page must display part ${i}`);
    }

    // 5. Update product #3
    const updateForm = new FormData();
    updateForm.append('id', 'test-part-3');
    updateForm.append('title', 'CNC Precision Part #3 (Updated Version)');
    updateForm.append('category', 'Precision Spares');
    updateForm.append('details', 'Upgraded specifications');

    const updateResponse = await fetch(`http://127.0.0.1:${port}/admin/spares`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie },
      body: updateForm
    });
    assert.strictEqual(updateResponse.status, 302, 'updating product #3 should redirect');

    // 6. Verify updated title in products page
    const updatedProductsResponse = await fetch(`http://127.0.0.1:${port}/products`);
    const updatedProductsHtml = await updatedProductsResponse.text();
    assert.ok(updatedProductsHtml.includes('CNC Precision Part #3 (Updated Version)'), 'updated product title must be displayed');

    // 7. Delete product #1
    const deleteResponse = await fetch(`http://127.0.0.1:${port}/admin/spares/delete`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'id=test-part-1'
    });
    assert.strictEqual(deleteResponse.status, 302, 'deleting product #1 should redirect');
    assert.strictEqual(sparesRecords.length, initialCount - 1, 'should have 1 less product in Supabase after deletion');

    // 8. Test file upload limit handling (> 4.5 MB should return friendly 413)
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024); // 5 MB
    const largeForm = new FormData();
    largeForm.append('id', 'test-part-large');
    largeForm.append('title', 'Part with massive file');
    largeForm.append('category', 'Heavy');
    largeForm.append('details', 'Should trigger size limit');
    largeForm.append('imageFile', new Blob([largeBuffer], { type: 'image/jpeg' }), 'huge.jpg');

    const largeResponse = await fetch(`http://127.0.0.1:${port}/admin/spares`, {
      method: 'POST',
      headers: { cookie },
      body: largeForm
    });
    assert.strictEqual(largeResponse.status, 413, 'oversized upload (>4.5MB) should return 413');
    const largeHtml = await largeResponse.text();
    assert.ok(largeHtml.includes('File Upload Too Large') || largeHtml.includes('4.5 MB'), 'should return friendly 413 page');

    console.log('spares-persistence-test: ok');
  } catch (error) {
    console.error('spares-persistence-test: failed');
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
    storageServer.close();
  }
})();
