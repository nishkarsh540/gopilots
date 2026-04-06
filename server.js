const express = require('express');
const path = require('path');
const https = require('https');
const app = express();

const FB_APP_ID = '1887826478762739';
const FB_APP_SECRET = '7935dee6e7e26e929c1c355c8312a76b';
const FB_API_VERSION = 'v24.0';

function httpsGet(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

// Facebook token proxy endpoint
app.get('/api/fb-token', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, code, token, waba_id } = req.query;
  try {
    if (action === 'exchange') {
      const url = `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&code=${encodeURIComponent(code)}`;
      res.json(await httpsGet(url));
    } else if (action === 'debug') {
      const appToken = `${FB_APP_ID}|${FB_APP_SECRET}`;
      const url = `https://graph.facebook.com/${FB_API_VERSION}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
      res.json(await httpsGet(url));
    } else if (action === 'phones') {
      const url = `https://graph.facebook.com/${FB_API_VERSION}/${waba_id}/phone_numbers?access_token=${encodeURIComponent(token)}`;
      res.json(await httpsGet(url));
    } else {
      res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// SPA routing: serve index.html for all non-file routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Export for Vercel (serverless environment)
module.exports = app;

// Local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
  });
}
