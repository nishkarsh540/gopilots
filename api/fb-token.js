const https = require('https');

const APP_ID = '1887826478762739';
const APP_SECRET = '7935dee6e7e26e929c1c355c8312a76b';
const API_VERSION = 'v24.0';

function httpsGet(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON: ' + body)); }
      });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  var action = req.query.action;

  try {
    if (action === 'exchange') {
      var code = req.query.code;
      if (!code) { res.status(400).json({ error: 'Missing code' }); return; }
      var url = 'https://graph.facebook.com/' + API_VERSION + '/oauth/access_token' +
        '?client_id=' + APP_ID +
        '&client_secret=' + APP_SECRET +
        '&code=' + encodeURIComponent(code);
      var data = await httpsGet(url);
      res.json(data);

    } else if (action === 'debug') {
      var token = req.query.token;
      if (!token) { res.status(400).json({ error: 'Missing token' }); return; }
      var appToken = APP_ID + '|' + APP_SECRET;
      var url = 'https://graph.facebook.com/' + API_VERSION + '/debug_token' +
        '?input_token=' + encodeURIComponent(token) +
        '&access_token=' + encodeURIComponent(appToken);
      var data = await httpsGet(url);
      res.json(data);

    } else if (action === 'phones') {
      var wabaId = req.query.waba_id;
      var token = req.query.token;
      if (!wabaId || !token) { res.status(400).json({ error: 'Missing waba_id or token' }); return; }
      var url = 'https://graph.facebook.com/' + API_VERSION + '/' + wabaId + '/phone_numbers' +
        '?access_token=' + encodeURIComponent(token);
      var data = await httpsGet(url);
      res.json(data);

    } else {
      res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
