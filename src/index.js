const core = require('@actions/core');
const exec = require('@actions/exec');
const https = require('https');
const httpm = require('@actions/http-client');

async function run() {
  try {
    const username = core.getInput('user', { required: true });
    const source = core.getInput('source', { required: true });
    const tokenServiceUrl = core.getInput('token-service-url', { required: true });
    const audience = core.getInput('audience') || 'api.nuget.org';

    // Get GitHub OIDC token
    // Get the OIDC token from environment (GitHub sets this)
    const oidcToken = process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN'];
    const oidcRequestUrl = process.env['ACTIONS_ID_TOKEN_REQUEST_URL'];

    if (!oidcToken || !oidcRequestUrl) {
      throw new Error('Missing required environment variables for OIDC token request.');
    }

    core.info(`Using token service endpoint: ${tokenServiceUrl}`);

    // Exchange the OIDC token for the NuGet API key
    const http = new httpm.HttpClient();

    // Usually the exchange expects the token in the body or header; confirm with your team
    const body = JSON.stringify({ username: username, tokenType: 'ApiKey' });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${oidcToken}`
    };

    const response = await http.post(tokenServiceUrl, body, headers);

    if (response.message.statusCode !== 200) {
      throw new Error(`Token exchange failed with status code ${response.message.statusCode}`);
    }

    const responseBody = await response.readBody();
    const data = JSON.parse(responseBody);

    if (!data.apiKey) {
      throw new Error('Response did not contain apiKey');
    }

    const apiKey = data.apiKey;
    core.setOutput('NUGET_API_KEY', apiKey);
    core.info('Successfully exchanged OIDC token for NuGet API key.');

  } catch (error) {
    core.setFailed(error.message);
  }
}

function httpGetJson(url, auth) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Invalid JSON in GET response: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

function httpPostJson(url, bearerToken, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Invalid JSON in POST response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

run();
