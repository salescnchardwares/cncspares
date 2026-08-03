const assert = require('assert');
const path = require('path');
const fs = require('fs');

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.PORT = '0';

(async () => {
  const sessionFile = path.join('/tmp', 'cnc-spares', 'data', 'sessions.json');
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  const backupData = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, 'utf8') : null;

  try {
    fs.writeFileSync(sessionFile, '{}');

    delete require.cache[require.resolve('../server')];
    const app = require('../server');
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;

    const loginResponse = await fetch(`http://127.0.0.1:${port}/admin/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=admin1234'
    });

    const cookie = loginResponse.headers.get('set-cookie') || '';
    assert.ok(cookie.includes('connect.sid='), 'login should set a session cookie');

    server.close();

    delete require.cache[require.resolve('../server')];
    const restartedApp = require('../server');
    const restartedServer = restartedApp.listen(0, '127.0.0.1');
    await new Promise((resolve) => restartedServer.once('listening', resolve));
    const restartedPort = restartedServer.address().port;

    try {
      const adminOrdersResponse = await fetch(`http://127.0.0.1:${restartedPort}/admin/orders`, {
        redirect: 'manual',
        headers: { cookie }
      });
      assert.notStrictEqual(adminOrdersResponse.status, 302, 'admin routes should stay authenticated after restart');
      assert.ok(adminOrdersResponse.status === 200, 'admin routes should render successfully after restart');
    } finally {
      restartedServer.close();
    }

    console.log('admin-session-persistence-test: ok');
  } catch (error) {
    console.error('admin-session-persistence-test: failed');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (backupData === null) {
      fs.rmSync(sessionFile, { force: true });
    } else {
      fs.writeFileSync(sessionFile, backupData);
    }
  }
})();
