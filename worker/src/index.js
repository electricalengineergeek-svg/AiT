const encoder = new TextEncoder();
const FLAPPY_CAR_GAME_KEY = 'flappy_car';
const FIRST_PLACE_STICKER_FILE_ID = 'CAACAgIAAxkBAAMTaejlbhFpD31t2gixcbKLP6HHtc4AAh2VAALTgkBLuoP2W5kLKAABOwQ';

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

function supabaseHeaders(env, prefer = null) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function parseGameKey(rawValue) {
  if (typeof rawValue !== 'string') {
    return FLAPPY_CAR_GAME_KEY;
  }

  const trimmed = rawValue.trim().toLowerCase();
  return trimmed || FLAPPY_CAR_GAME_KEY;
}

function parseScore(rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    throw new Error('score must be a finite number');
  }

  const score = Math.floor(numeric);
  if (score < 0 || score > 1000000) {
    throw new Error('score must be between 0 and 1000000');
  }

  return score;
}

async function upsertLaunchByUserId(env, row) {
  const endpoint = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/telegram_launches?on_conflict=user_id`;

  const insertResponse = await fetch(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify({
      ...row,
      created_at: new Date().toISOString()
    })
  });

  if (!insertResponse.ok) {
    const text = await insertResponse.text();
    throw new Error(`Supabase insert failed (${insertResponse.status}): ${text}`);
  }
}

async function upsertGameScoreIfBetter(env, row) {
  // Upsert on (user_id, game_key): only update when new score is strictly higher.
  const endpoint = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/upsert_game_score_if_better`;

  const rpcResponse = await fetch(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(env, 'return=minimal'),
    body: JSON.stringify({
      p_user_id: row.user_id,
      p_username: row.username,
      p_first_name: row.first_name,
      p_game_key: row.game_key,
      p_score: row.score,
      p_created_at: new Date().toISOString()
    })
  });

  if (!rpcResponse.ok) {
    const text = await rpcResponse.text();
    throw new Error(`Supabase score upsert failed (${rpcResponse.status}): ${text}`);
  }
}

async function getTopGameScores(env, gameKey, limit) {
  const sanitizedLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const endpointBase = env.SUPABASE_URL.replace(/\/+$/, '');
  const endpoint = `${endpointBase}/rest/v1/telegram_game_scores` +
    `?select=user_id,username,first_name,score,created_at` +
    `&game_key=eq.${encodeURIComponent(gameKey)}` +
    `&order=score.desc,created_at.asc` +
    `&limit=${sanitizedLimit}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: supabaseHeaders(env)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase top scores fetch failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function getCurrentGameLeader(env, gameKey) {
  const topScores = await getTopGameScores(env, gameKey, 1);
  return topScores[0] || null;
}

async function callTelegramBotApi(env, method, payload) {
  const endpoint = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    const details = result?.description || `HTTP ${response.status}`;
    throw new Error(`Telegram ${method} failed: ${details}`);
  }

  return result;
}

async function announceNewLeader(env, leader, score, gameKey) {
  const channelId = env.TELEGRAM_ANNOUNCE_CHAT_ID;
  if (!channelId) {
    return;
  }

  const displayName = leader?.first_name || leader?.username || 'Гравець';
  const gameLabel = gameKey === FLAPPY_CAR_GAME_KEY ? 'Flappy Car' : gameKey;

  await callTelegramBotApi(env, 'sendSticker', {
    chat_id: channelId,
    sticker: FIRST_PLACE_STICKER_FILE_ID
  });

  await callTelegramBotApi(env, 'sendMessage', {
    chat_id: channelId,
    text: `Вітаємо! ${displayName} вийшов на 1 місце у ${gameLabel} з результатом ${score} очок!`,
    disable_web_page_preview: true
  });
}

async function getUserBestGameScore(env, gameKey, userId) {
  const endpointBase = env.SUPABASE_URL.replace(/\/+$/, '');
  const endpoint = `${endpointBase}/rest/v1/telegram_game_scores` +
    `?select=score,created_at` +
    `&game_key=eq.${encodeURIComponent(gameKey)}` +
    `&user_id=eq.${encodeURIComponent(String(userId))}` +
    `&order=score.desc,created_at.asc` +
    `&limit=1`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: supabaseHeaders(env)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase user best fetch failed (${response.status}): ${text}`);
  }

  const rows = await response.json();
  return rows[0] || null;
}

function parseContentRangeCount(contentRange) {
  if (typeof contentRange !== 'string') {
    return null;
  }

  const slashIndex = contentRange.lastIndexOf('/');
  if (slashIndex < 0) {
    return null;
  }

  const rawCount = contentRange.slice(slashIndex + 1);
  const count = Number(rawCount);
  return Number.isFinite(count) ? count : null;
}

async function getUserGameRank(env, gameKey, userBest) {
  if (!userBest || !Number.isFinite(Number(userBest.score)) || !userBest.created_at) {
    return null;
  }

  const endpointBase = env.SUPABASE_URL.replace(/\/+$/, '');
  const score = Math.floor(Number(userBest.score));
  const createdAt = String(userBest.created_at);
  const strictBetterFilter = `(score.gt.${score},and(score.eq.${score},created_at.lt.${createdAt}))`;
  const endpoint = `${endpointBase}/rest/v1/telegram_game_scores` +
    `?select=user_id` +
    `&game_key=eq.${encodeURIComponent(gameKey)}` +
    `&or=${encodeURIComponent(strictBetterFilter)}` +
    `&limit=1`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      ...supabaseHeaders(env),
      Prefer: 'count=exact'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase user rank fetch failed (${response.status}): ${text}`);
  }

  const contentRange = response.headers.get('content-range');
  const betterCount = parseContentRangeCount(contentRange);

  if (!Number.isFinite(betterCount)) {
    return null;
  }

  return betterCount + 1;
}

async function parseAndVerifyTelegramUser(body, env) {
  const initData = body?.init_data;
  if (!initData || typeof initData !== 'string') {
    throw new Error('init_data is required');
  }

  const maxAuthAgeSec = Number(env.MAX_AUTH_AGE_SEC || '86400');
  return verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN, maxAuthAgeSec);
}

async function handleLaunch(body, env, allowedOrigin) {
  let user;
  try {
    user = await parseAndVerifyTelegramUser(body, env);
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
    await upsertLaunchByUserId(env, row);
    return jsonResponse({ ok: true }, 201, allowedOrigin);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 502, allowedOrigin);
  }
}

async function handleSubmitGameScore(body, env, allowedOrigin) {
  let user;
  try {
    user = await parseAndVerifyTelegramUser(body, env);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 401, allowedOrigin);
  }

  let score;
  try {
    score = parseScore(body?.score);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 400, allowedOrigin);
  }

  const gameKey = parseGameKey(body?.game_key);
  const row = {
    user_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    game_key: gameKey,
    score
  };

  try {
    const previousLeader = await getCurrentGameLeader(env, gameKey);
    await upsertGameScoreIfBetter(env, row);

    const currentLeader = await getCurrentGameLeader(env, gameKey);
    const isLeaderChanged = Boolean(currentLeader) && (
      !previousLeader || String(previousLeader.user_id) !== String(currentLeader.user_id)
    );

    if (isLeaderChanged && String(currentLeader.user_id) === String(user.id)) {
      try {
        await announceNewLeader(env, currentLeader, currentLeader.score, gameKey);
      } catch (error) {
        console.warn('Leader announcement failed:', error);
      }
    }

    return jsonResponse({ ok: true }, 201, allowedOrigin);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 502, allowedOrigin);
  }
}

async function handleGameScoreSummary(body, env, allowedOrigin) {
  let user;
  try {
    user = await parseAndVerifyTelegramUser(body, env);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 401, allowedOrigin);
  }

  const gameKey = parseGameKey(body?.game_key);
  const limit = Number(body?.limit || 5);

  try {
    const [topScores, userBest] = await Promise.all([
      getTopGameScores(env, gameKey, limit),
      getUserBestGameScore(env, gameKey, user.id)
    ]);
    let userPlace = null;
    try {
      userPlace = await getUserGameRank(env, gameKey, userBest);
    } catch (error) {
      console.warn('User rank calculation failed:', error);
    }

    const globalBest = topScores.length > 0 ? topScores[0].score : null;

    return jsonResponse({
      ok: true,
      game_key: gameKey,
      top_scores: topScores,
      user_place: userPlace,
      user_best: userBest ? userBest.score : null,
      global_best: globalBest
    }, 200, allowedOrigin);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 502, allowedOrigin);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
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

    if (pathname === '/game-scores/submit') {
      return handleSubmitGameScore(body, env, allowedOrigin);
    }

    if (pathname === '/game-scores/summary') {
      return handleGameScoreSummary(body, env, allowedOrigin);
    }

    if (pathname === '/' || pathname === '/launch') {
      return handleLaunch(body, env, allowedOrigin);
    }

    return jsonResponse({ ok: false, error: 'Route not found' }, 404, allowedOrigin);
  }
};
