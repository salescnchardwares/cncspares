const assert = require('assert');
const path = require('path');
const fs = require('fs');

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.PORT = '0';

const app = require('../server');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const initialProductsResponse = await fetch(`http://127.0.0.1:${port}/products`);
    const initialHtml = await initialProductsResponse.text();
    assert.ok(!initialHtml.includes('Spindle Bearing Kit'), 'products page should not include seeded starter products');
    assert.ok(!initialHtml.includes('Servo Motor Encoder'), 'products page should not include seeded starter products');
    assert.ok(!initialHtml.includes('Ball Screw Assembly'), 'products page should not include seeded starter products');

    const loginResponse = await fetch(`http://127.0.0.1:${port}/admin/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=admin1234'
    });

    const cookie = loginResponse.headers.get('set-cookie') || '';
    assert.ok(cookie.includes('connect.sid='), 'login should set a session cookie');

    const createForm = new FormData();
    createForm.append('id', 'test-spare-1');
    createForm.append('title', 'Test Spare');
    createForm.append('category', 'Regression');
    createForm.append('details', 'Inserted during storage persistence test');
    createForm.append('imageAlt', 'Regression test');

    const createResponse = await fetch(`http://127.0.0.1:${port}/admin/spares`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie },
      body: createForm
    });

    assert.strictEqual(createResponse.status, 302, 'creating a spare should redirect');

    const createdProductsResponse = await fetch(`http://127.0.0.1:${port}/products`);
    const createdHtml = await createdProductsResponse.text();
    assert.ok(createdHtml.includes('Test Spare'), 'products page should reflect newly created spare');

    const updateForm = new FormData();
    updateForm.append('id', 'test-spare-1');
    updateForm.append('title', 'Updated Spare');
    updateForm.append('category', 'Regression');
    updateForm.append('details', 'Updated during persistence test');
    updateForm.append('imageAlt', 'Updated regression test');

    const updateResponse = await fetch(`http://127.0.0.1:${port}/admin/spares`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie },
      body: updateForm
    });

    assert.strictEqual(updateResponse.status, 302, 'updating a spare should redirect');

    const updatedProductsResponse = await fetch(`http://127.0.0.1:${port}/products`);
    const updatedHtml = await updatedProductsResponse.text();
    assert.ok(updatedHtml.includes('Updated Spare'), 'products page should reflect the updated spare title');

    const deleteResponse = await fetch(`http://127.0.0.1:${port}/admin/spares/delete`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'id=test-spare-1'
    });

    assert.strictEqual(deleteResponse.status, 302, 'deleting a spare should redirect');

    const deletedProductsResponse = await fetch(`http://127.0.0.1:${port}/products`);
    const deletedHtml = await deletedProductsResponse.text();
    assert.ok(!deletedHtml.includes('Updated Spare'), 'products page should remove the deleted spare');
    console.log('storage-persistence-test: ok');
  } catch (error) {
    console.error('storage-persistence-test: failed');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
})();
