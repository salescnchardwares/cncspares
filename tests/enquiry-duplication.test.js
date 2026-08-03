const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.PORT = '0';

const app = require('../server');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  const inquiriesPath = path.join('/tmp', 'cnc-spares', 'data', 'inquiries.json');
  fs.mkdirSync(path.dirname(inquiriesPath), { recursive: true });
  const backupData = fs.existsSync(inquiriesPath) ? fs.readFileSync(inquiriesPath, 'utf8') : null;

  try {
    fs.writeFileSync(inquiriesPath, '[]');

    const loginResponse = await fetch(`http://127.0.0.1:${port}/admin/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=admin1234'
    });

    const cookie = loginResponse.headers.get('set-cookie') || '';
    assert.ok(cookie.includes('connect.sid='), 'login should set a session cookie');

    const payload = new URLSearchParams({
      customerName: 'Duplicate Tester',
      mobileNumber: '9999999999',
      emailId: 'duplicate-tester@example.com',
      companyName: 'Regression Labs',
      gstinNumber: '29ABCDE1234F1Z5',
      quantity: '2',
      website: ''
    }).toString();

    const firstResponse = await fetch(`http://127.0.0.1:${port}/enquire/spare-1`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: payload
    });
    assert.strictEqual(firstResponse.status, 302, 'the first enquiry should redirect');

    const secondResponse = await fetch(`http://127.0.0.1:${port}/enquire/spare-1`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: payload
    });
    assert.strictEqual(secondResponse.status, 302, 'the duplicate enquiry should also redirect');

    const ordersResponse = await fetch(`http://127.0.0.1:${port}/admin/orders`, {
      headers: { cookie }
    });
    const ordersHtml = await ordersResponse.text();
    const duplicateCount = (ordersHtml.match(/duplicate-tester@example.com/g) || []).length;

    assert.strictEqual(duplicateCount, 1, 'duplicate enquiries should not create multiple admin orders');
    console.log('enquiry-duplication-test: ok');
  } catch (error) {
    console.error('enquiry-duplication-test: failed');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (backupData === null) {
      fs.rmSync(inquiriesPath, { force: true });
    } else {
      fs.writeFileSync(inquiriesPath, backupData);
    }
    server.close();
  }
})();
