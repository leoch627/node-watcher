const crypto = require('crypto');

// Region-specific streaming checks. They run, through the node under test, only for services that
// matter in the node's region (taken from the flag in the subscription's node name, falling back to the
// exit IP's country). Response formats for Abema, KKTV, Viu TV and Bilibili were observed live;
// the Bahamut flow follows the community RegionRestrictionCheck approach and could not be exercised
// from a datacenter IP (Cloudflare answers 403), so it reports "error" rather than guessing.

function result(status, detail, region = null) {
  return { status, detail, region };
}

function parseJson(response) {
  const data = response?.data;
  if (data && typeof data === 'object') return data;
  try { return JSON.parse(String(data || '')); } catch (_) { return null; }
}

// Abema (JP). 403 {"message":"anonymous_ip"} is returned for datacenter/proxy IPs and foreign IPs.
function classifyAbema(response) {
  const status = response?.status;
  const data = parseJson(response);
  if (status === 200) {
    const iso = data?.isoCountryCode;
    return iso && iso !== 'JP' ? result('blocked', `Region ${iso}`, iso) : result('unlocked', 'Available', 'JP');
  }
  if (status === 403) {
    return result('blocked', data?.message === 'anonymous_ip' ? 'Anonymous / datacenter IP' : 'HTTP 403');
  }
  return result('error', `HTTP ${status ?? '-'}`);
}

// KKTV (TW): {"data":{"country":"US","is_allowed":false}}
function classifyKktv(response) {
  const data = parseJson(response)?.data;
  if (typeof data?.is_allowed !== 'boolean') return result('error', `Unexpected response (HTTP ${response?.status ?? '-'})`);
  const country = data.country || null;
  const outcome = data.is_allowed ? result('unlocked', 'Available', country) : result('blocked', 'Not available in this region', country);
  return { ...outcome, platformIp: data.ip || null };
}

// Bilibili Hong Kong / Macau / Taiwan-only title: code 0 playable, -10403 region blocked.
function classifyBilibiliHmt(response) {
  const code = parseJson(response)?.code;
  if (code === 0) return result('unlocked', 'HK/MO/TW content available');
  if (code === -10403) return result('blocked', 'Region blocked');
  return result('error', `Unexpected response code ${code ?? '-'}`);
}

// Viu TV (HK): responseCode GEO_CHECK_FAIL when outside Hong Kong.
function classifyViuTv(response) {
  const code = parseJson(response)?.responseCode;
  if (code === 'GEO_CHECK_FAIL') return result('blocked', 'Region blocked');
  if (code === 'SUCCESS') return result('unlocked', 'Available', 'HK');
  return result('error', `Unexpected response ${code ?? `HTTP ${response?.status ?? '-'}`}`);
}

// Bahamut Anime (TW): fetch a device id, then request a playback token; "animeSn" in the answer means allowed.
function classifyBahamut(deviceResponse, tokenResponse) {
  if (deviceResponse?.status !== 200 || !parseJson(deviceResponse)?.deviceid) {
    return result('error', `Device request failed (HTTP ${deviceResponse?.status ?? '-'}, possibly anti-bot)`);
  }
  if (tokenResponse?.status !== 200) return result('error', `Token request failed (HTTP ${tokenResponse?.status ?? '-'})`);
  return /animeSn/.test(String(tokenResponse.data || ''))
    ? result('unlocked', 'Available', 'TW')
    : result('blocked', 'Not available in this region', null);
}

const BILIBILI_HMT_URL = 'https://api.bilibili.com/pgc/player/web/playurl?avid=18281381&cid=29892777&qn=0&type=&otype=json&ep_id=183799&fourk=1&fnver=0&fnval=16&module=bangumi';

const CHECKS = {
  abema: async client => classifyAbema(await client.get('https://api.abema.io/v1/ip/check?device=android')),
  kktv: async client => classifyKktv(await client.get('https://api.kktv.me/v3/ipcheck')),
  bilibiliHmt: async client => classifyBilibiliHmt(await client.get(BILIBILI_HMT_URL)),
  viutv: async client => {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const response = await client.post('https://api.viu.now.com/p8/3/getLiveURL', {
      callerReferenceNo: stamp, contentId: '099', contentType: 'Channel', channelno: '099', mode: 'prod',
      deviceId: crypto.randomBytes(9).toString('hex'), deviceType: 'ANDROID_WEB'
    }, { headers: { 'Content-Type': 'application/json' } });
    return classifyViuTv(response);
  },
  bahamut: async client => {
    const device = await client.get('https://ani.gamer.com.tw/ajax/getdeviceid.php');
    const deviceId = parseJson(device)?.deviceid;
    if (device.status !== 200 || !deviceId) return classifyBahamut(device, null);
    const token = await client.get(`https://ani.gamer.com.tw/ajax/token.php?adID=89422&sn=14667&device=${encodeURIComponent(deviceId)}`);
    return classifyBahamut(device, token);
  }
};

const LABELS = {
  abema: 'Abema', kktv: 'KKTV', bilibiliHmt: 'Bilibili 港澳台', viutv: 'Viu TV', bahamut: '动画疯'
};

// region -> service keys worth checking there
const REGIONAL_SERVICES = {
  JP: ['abema'],
  TW: ['bahamut', 'kktv', 'bilibiliHmt'],
  HK: ['viutv', 'bilibiliHmt'],
  MO: ['bilibiliHmt']
};

function servicesFor(region) {
  return REGIONAL_SERVICES[String(region || '').toUpperCase()] || [];
}

// Returns { region, services: { key: { status, detail, region, label } } } or null when the region has no checks.
async function checkRegion(client, region, safe = check => check()) {
  const keys = servicesFor(region);
  if (keys.length === 0) return null;
  const code = String(region).toUpperCase();
  const outcomes = await Promise.all(keys.map(async key => {
    let outcome;
    try {
      outcome = await safe(() => CHECKS[key](client));
    } catch (error) {
      outcome = result('error', error.code === 'ECONNABORTED' ? 'Timeout' : error.message);
    }
    return [key, { ...outcome, label: LABELS[key] }];
  }));
  return { region: code, services: Object.fromEntries(outcomes) };
}

module.exports = {
  LABELS, REGIONAL_SERVICES, servicesFor, checkRegion,
  classifyAbema, classifyKktv, classifyBilibiliHmt, classifyViuTv, classifyBahamut
};
