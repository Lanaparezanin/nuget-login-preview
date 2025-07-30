const core = require('@actions/core');
const exec = require('@actions/exec');
const https = require('https');

async function run() {
  try {
    const username = core.getInput('user', { required: true });
    const source = core.getInput('source', { required: true });
    const tokenServiceUrl = core.getInput('token-service-url', { required: true });
    const audience = core.getInput('audience') || 'api.nuget.org';

    // Get GitHub OIDC token
    const tokenRequestUrl = `${process.env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${audience}`;
    const tokenRequestAuth = `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`;

    // Request OIDC token from GitHub
    const oidcToken = await httpGetJson(tokenRequestUrl, tokenRequestAuth);
    if (!oidcToken.value) {
      throw new Error('Failed to get OIDC token from GitHub');
    }

    core.setSecret(oidcToken.value);

    /*const response = await fetch(tokenServiceUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${oidcToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'nuget/login-action' // required by your token service
      },
      body: JSON.stringify({
        username: username,
        tokenType: 'ApiKey'
      })
    });*/

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${oidcToken}`
    };

    const body = JSON.stringify({
      username: username,
      tokenType: 'ApiKey'
    });

    // Exchange OIDC token for NuGet API key
    const apiKeyResponse = await httpPostJson(tokenServiceUrl, oidcToken.value, body, headers);
    if (!apiKeyResponse.apiKey) {
      throw new Error(`Failed to get API key: ${JSON.stringify(apiKeyResponse)}`);
    }

    core.setSecret(apiKeyResponse.apiKey);
    core.setOutput('NUGET_API_KEY', apiKeyResponse.apiKey);

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
