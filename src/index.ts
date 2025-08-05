import * as core from '@actions/core';
import * as httpm from '@actions/http-client';

async function run(): Promise<void> {
  try {
    const username: string = core.getInput('user', { required: true });
    const tokenServiceUrl: string = core.getInput('token-service-url', { required: true });
    const audience: string = core.getInput('audience') || 'api.nuget.org';

    // Get OIDC environment values
    const oidcRequestToken: string | undefined = process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN'];
    const oidcRequestUrl: string | undefined = process.env['ACTIONS_ID_TOKEN_REQUEST_URL'];

    if (!oidcRequestToken || !oidcRequestUrl) {
      throw new Error('Missing GitHub OIDC request environment variables.');
    }

    const tokenUrl: string = `${oidcRequestUrl}&audience=${encodeURIComponent(audience)}`;
    core.info(`Requesting GitHub OIDC token from: ${tokenUrl}`);

    const http: httpm.HttpClient = new httpm.HttpClient();
      const tokenResponse = await http.getJson<{ value?: string }>(tokenUrl, {
      Authorization: `Bearer ${oidcRequestToken}`,
    });

    if (!tokenResponse.result || !tokenResponse.result.value) {
      throw new Error('Failed to retrieve OIDC token from GitHub.');
    }

    const oidcToken: string = tokenResponse.result.value;

    // Build the request body
    const body: string = JSON.stringify({
      username: username,
      tokenType: 'ApiKey'
    });

    // Prepare headers
      const headers: { [key: string]: string } = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${oidcToken}`,
      'User-Agent': 'nuget/login-action'
    };

    const tokenServiceHttpClient: httpm.HttpClient = new httpm.HttpClient();
      const response: httpm.HttpClientResponse = await tokenServiceHttpClient.post(tokenServiceUrl, body, headers);

    if (response.message.statusCode !== 200) {
      const errorBody = await response.readBody();
      throw new Error(`Token exchange failed (${response.message.statusCode}): ${errorBody}`);
    }

    const responseBody = await response.readBody();

    const data: { apiKey?: string } = JSON.parse(responseBody);
    if (!data.apiKey) {
      throw new Error('Response did not contain "apiKey".');
    }

    const apiKey: string = data.apiKey;
    core.setSecret(apiKey);
    core.setOutput('NUGET_API_KEY', apiKey);
    core.info('Successfully exchanged OIDC token for NuGet API key.');
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

run();
