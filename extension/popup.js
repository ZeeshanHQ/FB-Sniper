document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('serverUrl');
  const userIdInput = document.getElementById('userId');
  const connectBtn = document.getElementById('connectBtn');
  const statusBox = document.getElementById('statusBox');

  // Load cached settings
  chrome.storage.local.get(['serverUrl', 'userId'], (data) => {
    if (data.serverUrl) serverUrlInput.value = data.serverUrl;
    if (data.userId) userIdInput.value = data.userId;
  });

  function showStatus(text, type) {
    statusBox.textContent = text;
    statusBox.className = `status-box ${type}`;
    statusBox.style.display = 'block';
  }

  function hideStatus() {
    statusBox.style.display = 'none';
  }

  connectBtn.addEventListener('click', async () => {
    const serverUrl = serverUrlInput.value.trim().replace(/\/+$/, '');
    const userId = userIdInput.value.trim();

    if (!serverUrl || !userId) {
      showStatus('Please fill in both fields.', 'error');
      return;
    }

    // Save settings
    chrome.storage.local.set({ serverUrl, userId });

    hideStatus();
    connectBtn.disabled = true;
    connectBtn.innerHTML = '<div class="spinner"></div> Connecting...';

    try {
      // 1. Fetch all cookies for Facebook
      const cookies = await new Promise((resolve) => {
        chrome.cookies.getAll({ url: 'https://www.facebook.com' }, (cookies) => {
          resolve(cookies || []);
        });
      });

      // Find the c_user cookie (Facebook ID)
      const cUserCookie = cookies.find(c => c.name === 'c_user');
      if (!cUserCookie) {
        throw new Error('Not logged into Facebook. Please log into facebook.com in your browser first.');
      }
      const fbAccountId = cUserCookie.value;

      // Map to Playwright storageState format
      const playwrightCookies = cookies.map(c => {
        let sameSite = undefined;
        if (c.sameSite === 'no_restriction') sameSite = 'None';
        else if (c.sameSite === 'lax') sameSite = 'Lax';
        else if (c.sameSite === 'strict') sameSite = 'Strict';

        return {
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expirationDate || -1,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: sameSite
        };
      });

      // 2. Fetch user profile page to grab their real name (include credentials to send active session cookies)
      let fbAccountName = 'Facebook Account';
      try {
        const fbResponse = await fetch('https://www.facebook.com/me/', {
          credentials: 'include'
        });
        if (fbResponse.ok) {
          const html = await fbResponse.text();
          // Extract Facebook's title tag which usually contains the user's name
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            // Strip notification counts like (1) or (9+) from the title
            const parsedName = titleMatch[1]
              .replace(/^\(\d+\+?\)\s*/, '')
              .replace(' | Facebook', '')
              .trim();
            if (parsedName && parsedName.toLowerCase() !== 'facebook') {
              fbAccountName = parsedName;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to scrape real name, using fallback.', err);
      }

      // 3. Construct storage_state payload
      const payload = {
        user_id: userId,
        storage_state: {
          cookies: playwrightCookies,
          origins: [
            {
              origin: 'https://www.facebook.com',
              localStorage: []
            }
          ]
        },
        fb_account_name: fbAccountName,
        fb_account_id: fbAccountId,
        user_agent: navigator.userAgent
      };

      // 4. POST to your backend server
      const response = await fetch(`${serverUrl}/api/fb/session/store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned status ${response.status}`);
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.detail || 'Server failed to save the session.');
      }

      showStatus(`Successfully connected as ${fbAccountName}! You can now close this popup and refresh your dashboard.`, 'success');
    } catch (error) {
      showStatus(error.message || 'An unexpected error occurred.', 'error');
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect Facebook Account';
    }
  });
});
