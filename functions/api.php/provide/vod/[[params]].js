/**
 * functions/api.php/provide/vod/[[params]].js
 * 苹果 CMS V10 兼容接口，供 TVBOX / FongMi/TV 等客户端调用。
 */

const BUILTIN_SOURCES = {
  dyttzy:  { api: 'http://caiji.dyttzyapi.com/api.php/provide/vod',  name: '电影天堂资源' },
  ruyi:    { api: 'https://cj.rycjapi.com/api.php/provide/vod',       name: '如意资源' },
  bfzy:    { api: 'https://bfzyapi.com/api.php/provide/vod',          name: '暴风资源' },
  tyyszy:  { api: 'https://tyyszy.com/api.php/provide/vod',           name: '天涯资源' },
  ffzy:    { api: 'http://ffzy5.tv/api.php/provide/vod',              name: '非凡影视' },
  heimuer: { api: 'https://json.heimuer.xyz/api.php/provide/vod',     name: '黑木耳' },
  zy360:   { api: 'https://360zy.com/api.php/provide/vod',            name: '360资源' },
  wolong:  { api: 'https://wolongzyw.com/api.php/provide/vod',        name: '卧龙资源' },
  jisu:    { api: 'https://jszyapi.com/api.php/provide/vod',          name: '极速资源' },
  mozhua:  { api: 'https://mozhuazy.com/api.php/provide/vod',         name: '魔爪资源' },
  mdzy:    { api: 'https://www.mdzyapi.com/api.php/provide/vod',      name: '魔都资源' },
  yinghua: { api: 'https://m3u8.apiyhzy.com/api.php/provide/vod',    name: '樱花资源' },
  baidu:   { api: 'https://api.apibdzy.com/api.php/provide/vod',     name: '百度云资源' },
  wujin:   { api: 'https://api.wujinapi.me/api.php/provide/vod',     name: '无尽资源' },
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

async function fetchSource(apiUrl, params, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const resp = await fetch(`${apiUrl}${params}`, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TVBOX/1.0)',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function prefixId(key, id) { return `${key}__${id}`; }

function unprefixId(prefixedId) {
  const idx = prefixedId.indexOf('__');
  if (idx === -1) return { key: null, id: prefixedId };
  return { key: prefixedId.slice(0, idx), id: prefixedId.slice(idx + 2) };
}

function normalizeItem(item, sourceKey, sourceName) {
  return {
    vod_id:       prefixId(sourceKey, String(item.vod_id ?? item.id ?? '')),
    vod_name:     item.vod_name     || item.name      || '',
    vod_pic:      item.vod_pic      || item.pic       || '',
    vod_remarks:  item.vod_remarks  || item.remarks   || '',
    type_name:    item.type_name    || item.type      || '',
    vod_year:     item.vod_year     || '',
    vod_area:     item.vod_area     || '',
    vod_actor:    item.vod_actor    || '',
    vod_director: item.vod_director || '',
    vod_content:  item.vod_content  || '',
    vod_play_url: item.vod_play_url || '',
    vod_play_from: item.vod_play_from || sourceName,
    source: sourceName,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const timeout    = parseInt(env.VOD_API_TIMEOUT || '8000');
  const maxSources = parseInt(env.VOD_MAX_SOURCES  || '8');

  const url = new URL(request.url);
  const ac  = url.searchParams.get('ac')  || '';
  const wd  = url.searchParams.get('wd')  || '';
  const ids = url.searchParams.get('ids') || '';
  const pg  = url.searchParams.get('pg')  || '1';

  // --- 分类列表 (ac=list 或无参数) ---
  if (!ac || ac === 'list') {
    return jsonResp({
      code: 1, msg: 'OK',
      class: [
        { type_id: 1, type_name: '电影' },
        { type_id: 2, type_name: '电视剧' },
        { type_id: 3, type_name: '综艺' },
        { type_id: 4, type_name: '动漫' },
      ],
      list: [],
    });
  }

  // --- 搜索 (ac=videolist&wd=...) ---
  if (ac === 'videolist' && wd) {
    const sources = Object.entries(BUILTIN_SOURCES).slice(0, maxSources);
    const params  = `?ac=videolist&wd=${encodeURIComponent(wd)}&pg=${pg}`;

    const results = await Promise.all(
      sources.map(([key, src]) =>
        fetchSource(src.api, params, timeout).then(json => ({ key, name: src.name, json }))
      )
    );

    const list = [];
    let total = 0;
    for (const { key, name, json } of results) {
      if (!json || !Array.isArray(json.list)) continue;
      total += parseInt(json.total || json.list.length || 0);
      for (const item of json.list) list.push(normalizeItem(item, key, name));
    }

    return jsonResp({ code: 1, msg: 'OK', page: parseInt(pg), pagecount: 1, limit: list.length, total, list });
  }

  // --- 详情 (ac=detail&ids=...) --- FIX: 对上游用正确的 ac=detail 参数
  if (ac === 'detail' && ids) {
    const idList = ids.split(',').map(s => s.trim()).filter(Boolean);

    const bySource = {};
    for (const pid of idList) {
      const { key, id } = unprefixId(pid);
      if (!key || !BUILTIN_SOURCES[key]) continue;
      if (!bySource[key]) bySource[key] = [];
      bySource[key].push(id);
    }

    const list = [];
    await Promise.all(
      Object.entries(bySource).map(async ([key, rawIds]) => {
        const src    = BUILTIN_SOURCES[key];
        // 使用正确的 ac=detail 向上游查详情
        const params = `?ac=detail&ids=${encodeURIComponent(rawIds.join(','))}`;
        const json   = await fetchSource(src.api, params, timeout);
        if (!json || !Array.isArray(json.list)) return;
        for (const item of json.list) list.push(normalizeItem(item, key, src.name));
      })
    );

    return jsonResp({ code: 1, msg: 'OK', list, total: list.length, pagecount: 1 });
  }

  return jsonResp({ code: 0, msg: '未知参数', list: [], total: 0, pagecount: 0 });
}
