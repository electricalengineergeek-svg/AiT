const encoder = new TextEncoder();

function jsonResponse(body, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function readOrigin(request) {
  return request.headers.get('Origin') || '*';
}

function isAllowedOrigin(origin, allowedOrigin) {
  if (!allowedOrigin || allowedOrigin === '*') {
    return true;
  }
  return origin === allowedOrigin;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(keyBytes, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

async function verifyTelegramInitData(initData, botToken, maxAuthAgeSec) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) {
    throw new Error('Missing hash in init_data');
  }

  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));

  const dataCheckString = pairs.join('\n');
  const secretKey = await hmacSha256(encoder.encode('WebAppData'), botToken);
  const calculatedHashBuffer = await hmacSha256(new Uint8Array(secretKey), dataCheckString);
  const calculatedHash = toHex(calculatedHashBuffer);

  if (calculatedHash !== hash) {
    throw new Error('Invalid init_data signature');
  }

  const authDateRaw = params.get('auth_date');
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate)) {
    throw new Error('Invalid auth_date');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authDate > maxAuthAgeSec) {
    throw new Error('init_data is too old');
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new Error('Missing user in init_data');
  }

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new Error('Invalid user payload in init_data');
  }

  if (!user.id) {
    throw new Error('Missing user.id in init_data');
  }

  return user;
}

async function insertLaunch(env, row) {
  const endpoint = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/telegram_launches`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${text}`);
  }
}

export default {
  async fetch(request, env) {
    const origin = readOrigin(request);
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    if (!isAllowedOrigin(origin, allowedOrigin)) {
      return jsonResponse({ ok: false, error: 'Origin not allowed' }, 403, allowedOrigin);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, allowedOrigin);
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ ok: false, error: 'Worker environment is not configured' }, 500, allowedOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, allowedOrigin);
    }

    const initData = body?.init_data;
    if (!initData || typeof initData !== 'string') {
      return jsonResponse({ ok: false, error: 'init_data is required' }, 400, allowedOrigin);
    }

    const maxAuthAgeSec = Number(env.MAX_AUTH_AGE_SEC || '86400');

    let user;
    try {
      user = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN, maxAuthAgeSec);
    } catch (error) {
      return jsonResponse({ ok: false, error: error.message }, 401, allowedOrigin);
    }

    const row = {
      user_id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      language_code: user.language_code || null,
      is_premium: Boolean(user.is_premium),
      is_bot: Boolean(user.is_bot),
      app_path: typeof body.app_path === 'string' ? body.app_path : null,
      app_url: typeof body.app_url === 'string' ? body.app_url : null,
      platform: typeof body.platform === 'string' ? body.platform : null,
      launch_source: typeof body.launch_source === 'string' ? body.launch_source : 'telegram-mini-app-secure'
    };

    try {
      await insertLaunch(env, row);
      return jsonResponse({ ok: true }, 201, allowedOrigin);
    } catch (error) {
      return jsonResponse({ ok: false, error: error.message }, 502, allowedOrigin);
    }
  }
};
