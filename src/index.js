const core = require('@actions/core');
const httpm = require('@actions/http-client');

async function run() {
  try {
    const username = core.getInput('user', { required: true });
    const tokenServiceUrl = core.getInput('token-service-url', { required: true });
    const audience = core.getInput('audience') || 'api.nuget.org';

    // Get OIDC environment values
    const oidcRequestToken = process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN'];
    const oidcRequestUrl = process.env['ACTIONS_ID_TOKEN_REQUEST_URL'];

    if (!oidcRequestToken || !oidcRequestUrl) {
      throw new Error('Missing GitHub OIDC request environment variables.');
    }

    const tokenUrl = `${oidcRequestUrl}&audience=${encodeURIComponent(audience)}`;
    core.info(`Requesting GitHub OIDC token from: ${tokenUrl}`);

    const http = new httpm.HttpClient();
    const tokenResponse = await http.getJson(tokenUrl, {
      Authorization: `Bearer ${oidcRequestToken}`,
    });

    if (!tokenResponse.result || !tokenResponse.result.value) {
      throw new Error('Failed to retrieve OIDC token from GitHub.');
    }

    const oidcToken = tokenResponse.result.value;

    // Build the request body
    const body = JSON.stringify({
      username: username,
      tokenType: 'ApiKey'
    });

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${oidcToken}`,
      'User-Agent': 'nuget/login-action'
    };

    const tokenServiceHttpClient = new httpm.HttpClient();
    const response = await tokenServiceHttpClient.post(tokenServiceUrl, body, headers);

    if (response.message.statusCode !== 200) {
      const errorBody = await response.readBody();
      throw new Error(`Token exchange failed (${response.message.statusCode}): ${errorBody}`);
    }

    const responseBody = await response.readBody();

    const data = JSON.parse(responseBody);
    if (!data.apiKey) {
      throw new Error('Response did not contain "apiKey".');
    }

    const apiKey = data.apiKey;
    core.setSecret(apiKey);
    core.setOutput('NUGET_API_KEY', apiKey);
    core.info('Successfully exchanged OIDC token for NuGet API key.');


  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
