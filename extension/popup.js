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

      // 2. Fetch user profile page to grab their real name and profile picture avatar url
      let fbAccountName = 'Facebook Account';
      let fbAvatarUrl = null;
      try {
        const fbResponse = await fetch('https://www.facebook.com/me/', {
          credentials: 'include'
        });
        if (fbResponse.ok) {
          const html = await fbResponse.text();
          // Extract Facebook's title tag which contains the user's name
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            const parsedName = titleMatch[1]
              .replace(/^\(\d+\+?\)\s*/, '')
              .replace(' | Facebook', '')
              .trim();
            if (parsedName && parsedName.toLowerCase() !== 'facebook') {
              fbAccountName = parsedName;
            }
          }

          // Extract fbcdn profile pic URL via regex patterns
          // Matches common CDN structure inside raw HTML scripts/links
          const cdnPattern = /"https:\/\/scontent[^"]+?fbcdn\.net\/v\/[^"]+?(_n\.jpg|_n\.png|_t\.jpg|100x100)[^"]*?"/gi;
          const matches = html.match(cdnPattern) || [];
          for (const match of matches) {
            const cleanUrl = match.replace(/"/g, '').replace(/\\/g, '');
            
            // Skip cover photos, group avatars, event photos, etc.
            const lowerUrl = cleanUrl.toLowerCase();
            if (lowerUrl.includes('cover') || lowerUrl.includes('/g/') || lowerUrl.includes('groups') || lowerUrl.includes('ad_') || lowerUrl.includes('banner')) {
              continue;
            }

            // Prioritize links containing cpry, cpc, cprof, profile, or 100x100
            if (cleanUrl.includes('/cpry/') || cleanUrl.includes('/cpc/') || cleanUrl.includes('/cprof/') || cleanUrl.includes('/t39.30808-6/') || cleanUrl.includes('profile') || cleanUrl.includes('100x100')) {
              fbAvatarUrl = cleanUrl;
              break;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to scrape profile info from extension, using fallback.', err);
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
        fb_avatar_url: fbAvatarUrl,
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
