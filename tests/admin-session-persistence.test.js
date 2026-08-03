const assert = require('assert');

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.PORT = '0';

(async () => {
  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const loginResponse = await fetch(`http://127.0.0.1:${port}/admin/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=admin1234'
    });

    const cookie = loginResponse.headers.get('set-cookie') || '';
    assert.ok(cookie.includes('connect.sid='), 'login should set a session cookie');
    console.log('admin-session-persistence-test: ok');
  } catch (error) {
    console.error('admin-session-persistence-test: failed');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
})();
