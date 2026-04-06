/**
 * fb-token-server.js — Local Facebook Token + WhatsApp Message Server
 *
 * Run:  node fb-token-server.js
 * Then: ngrok http 3001
 * Paste the ngrok HTTPS URL into the website UI.
 *
 * Endpoints:
 *   POST /process   — { code, to, message }
 *                     Exchanges code → access token → WABA ID → phone numbers → sends message
 *   GET  /health    — health check
 */

const http = require('http');
const https = require('https');

const APP_ID = '1887826478762739';
const APP_SECRET = '7935dee6e7e26e929c1c355c8312a76b';
const API_VERSION = 'v24.0';
const PORT = 3001;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON: ' + body.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function httpsPost(url, headers, bodyData) {
  return new Promise(function (resolve, reject) {
    var bodyStr = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
    var parsed = new URL(url);
    var options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Length': Buffer.byteLength(bodyStr) }, headers)
    };
    var req = https.request(options, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var body = '';
    req.on('data', function (chunk) { body += chunk; });
    req.on('end', function () {
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, data) {
  var body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function log(step, data) {
  console.log('\n[' + step + ']', JSON.stringify(data, null, 2));
}

// ─── Core Flow ───────────────────────────────────────────────────────────────

async function processFlow(code, to, message) {
  var result = {};

  // Step 1: Exchange code for access token
  console.log('\n━━━ Step 1: Exchange code for access token ━━━');
  var tokenUrl = 'https://graph.facebook.com/' + API_VERSION + '/oauth/access_token' +
    '?client_id=' + APP_ID +
    '&client_secret=' + APP_SECRET +
    '&code=' + encodeURIComponent(code);

  var tokenData = await httpsGet(tokenUrl);
  log('Token exchange response', tokenData);

  if (!tokenData.access_token) {
    throw new Error('Token exchange failed: ' + JSON.stringify(tokenData));
  }
  result.access_token = tokenData.access_token;

  // Step 2: Debug token to find WABA ID
  console.log('\n━━━ Step 2: Debug token to find WABA ID ━━━');
  var appToken = APP_ID + '|' + APP_SECRET;
  var debugUrl = 'https://graph.facebook.com/' + API_VERSION + '/debug_token' +
    '?input_token=' + encodeURIComponent(result.access_token) +
    '&access_token=' + encodeURIComponent(appToken);

  var debugData = await httpsGet(debugUrl);
  log('Debug token response', debugData);

  var wabaId = null;
  if (debugData.data) {
    var scopes = debugData.data.granular_scopes || [];
    for (var i = 0; i < scopes.length; i++) {
      if (scopes[i].target_ids && scopes[i].target_ids.length > 0) {
        wabaId = scopes[i].target_ids[0];
        break;
      }
    }
    if (!wabaId && debugData.data.id) wabaId = debugData.data.id;
  }
  result.debug = debugData.data;

  if (!wabaId) {
    throw new Error('Could not find WABA ID in debug_token response: ' + JSON.stringify(debugData));
  }
  result.waba_id = wabaId;
  console.log('WABA ID:', wabaId);

  // Step 3: Get phone numbers
  console.log('\n━━━ Step 3: Get phone numbers ━━━');
  var phonesUrl = 'https://graph.facebook.com/' + API_VERSION + '/' + wabaId +
    '/phone_numbers?access_token=' + encodeURIComponent(result.access_token);

  var phonesData = await httpsGet(phonesUrl);
  log('Phone numbers response', phonesData);

  if (!phonesData.data || phonesData.data.length === 0) {
    throw new Error('No phone numbers found: ' + JSON.stringify(phonesData));
  }
  result.phone_numbers = phonesData.data;

  var phoneNumberId = phonesData.data[0].id;
  var phoneDisplay = phonesData.data[0].display_phone_number;
  result.selected_phone = { id: phoneNumberId, display: phoneDisplay };
  console.log('Using phone:', phoneDisplay, '(ID:', phoneNumberId + ')');

  // Step 4: Send WhatsApp message
  console.log('\n━━━ Step 4: Send WhatsApp message ━━━');
  var msgUrl = 'https://graph.facebook.com/' + API_VERSION + '/' + phoneNumberId + '/messages';
  var msgBody = JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { preview_url: true, body: message }
  });

  var msgData = await httpsPost(msgUrl, {
    'Authorization': 'Bearer ' + result.access_token,
    'Content-Type': 'application/json'
  }, msgBody);
  log('Send message response', msgData);
  result.message_response = msgData;

  return result;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

var server = http.createServer(async function (req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJSON(res, 200, { status: 'ok', server: 'fb-token-server', port: PORT });
    return;
  }

  if (req.method === 'POST' && req.url === '/process') {
    var body = await readBody(req);
    var code = body.code;
    var to = body.to;
    var message = body.message;

    console.log('\n══════════════════════════════════════');
    console.log('Received /process request');
    console.log('  to:', to);
    console.log('  message:', message);
    console.log('  code (first 30):', (code || '').slice(0, 30) + '...');
    console.log('══════════════════════════════════════');

    if (!code || !to || !message) {
      sendJSON(res, 400, { error: 'Missing required fields: code, to, message' });
      return;
    }

    try {
      var result = await processFlow(code, to, message);
      console.log('\n✅ Done!');
      sendJSON(res, 200, { success: true, result: result });
    } catch (err) {
      console.error('\n❌ Error:', err.message);
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, function () {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       FB Token Server — Ready            ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Local:  http://localhost:' + PORT + '           ║');
  console.log('║                                          ║');
  console.log('║  Run ngrok:  ngrok http ' + PORT + '            ║');
  console.log('║  Then paste the HTTPS URL into the UI   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
