function qs(id) {
  return document.getElementById(id);
}

async function getSettings() {
  const { authToken, apiBaseUrl } = await browser.storage.local.get(['authToken', 'apiBaseUrl']);
  return {
    authToken: authToken || '',
    apiBaseUrl: apiBaseUrl || 'https://mal.mkelvers.tech',
  };
}

async function setSettings(patch) {
  await browser.storage.local.set(patch);
}

function show(el, on) {
  el.hidden = !on;
}

async function render() {
  const settings = await getSettings();
  document.body.dataset.state = settings.authToken ? 'in' : 'out';

  const logoutBtn = qs('logoutBtn');
  logoutBtn.addEventListener('click', async () => {
    await setSettings({ authToken: '' });
    await render();
  });

  const hasToken = !!settings.authToken;
  show(logoutBtn, hasToken);
  show(qs('login'), !hasToken);
  show(qs('loggedIn'), hasToken);

  if (!hasToken) {
    setupLogin();
    return;
  }
}

function setupLogin() {
  const loginErr = qs('loginErr');
  show(loginErr, false);

  qs('loginBtn').onclick = async () => {
    show(loginErr, false);
    const username = qs('username').value.trim();
    const password = qs('password').value;
    if (!username || !password) {
      loginErr.textContent = 'Missing username or password';
      show(loginErr, true);
      return;
    }

    try {
      const { apiBaseUrl } = await getSettings();
      const res = await fetch(apiBaseUrl.replace(/\/+$/, '') + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, name: 'Firefox extension' }),
      });
      if (!res.ok) throw new Error('Invalid username or password');
      const data = await res.json();
      await setSettings({ authToken: data.token });
      await render();
    } catch (e) {
      loginErr.textContent = e.message || 'Login failed';
      show(loginErr, true);
    }
  };
}

render();
