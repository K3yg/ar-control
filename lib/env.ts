function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export const env = {
  get clientId() { return req("ST_CLIENT_ID"); },
  get clientSecret() { return req("ST_CLIENT_SECRET"); },
  get redirectUri() { return req("ST_REDIRECT_URI"); },
  get deviceId() { return process.env.ST_DEVICE_ID || undefined; },
  get apiKey() { return req("AC_API_KEY"); },
  get cronSecret() { return req("CRON_SECRET"); },
};

export const ST_API = "https://api.smartthings.com/v1";
export const ST_OAUTH = "https://api.smartthings.com/oauth";
export const ST_SCOPES = "r:devices:* x:devices:*";
