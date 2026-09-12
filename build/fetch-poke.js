// PokeAPI からカントー151匹のデータ＋スプライトを取得して JS 定数として書き出す
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'pokedata.js');
const N = 1025;

const jname = (names) => {
  const h = names.find(n => n.language.name === 'ja-Hrkt');
  const j = names.find(n => n.language.name === 'ja');
  return (h || j || {}).name || null;
};

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const k = i++;
      for (let a = 0; a < 4; a++) {
        try { out[k] = await fn(items[k], k); break; }
        catch (e) { if (a === 3) throw e; await new Promise(r => setTimeout(r, 400 * (a + 1))); }
      }
    }
  }));
  return out;
}
const getJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };
const getB64 = async (u) => {
  if (!u) return null;
  const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u);
  return Buffer.from(await r.arrayBuffer()).toString('base64');
};

(async () => {
  const ids = Array.from({ length: N }, (_, i) => i + 1);

  console.error('1/5 pokemon ...');
  const mons = await pool(ids, 12, id => getJSON(`https://pokeapi.co/api/v2/pokemon/${id}`));

  console.error('2/5 species ...');
  const spec = await pool(ids, 12, id => getJSON(`https://pokeapi.co/api/v2/pokemon-species/${id}`));

  console.error('3/5 types ...');
  const typeSlugs = [...new Set(mons.flatMap(m => m.types.map(t => t.type.name)))];
  const typeDocs = await pool(typeSlugs, 6, s => getJSON(`https://pokeapi.co/api/v2/type/${s}`));
  const TYPE_JA = {};
  typeSlugs.forEach((s, i) => { TYPE_JA[s] = jname(typeDocs[i].names) || s; });
  console.error('   types:', Object.entries(TYPE_JA).map(([k, v]) => `${k}=${v}`).join(' '));

  // タイプ そうせい ひょう：TX[こうげきタイプ][ぼうぎょタイプ] = ばいりつ
  // 1ばい の くみあわせは かかない（よみこみがわで 1 を きほんに する）
  const TX = {};
  typeSlugs.forEach((s, i) => {
    const ja = TYPE_JA[s], dr = typeDocs[i].damage_relations, row = {};
    const put = (list, mult) => list.forEach(x => { const n = TYPE_JA[x.name]; if (n) row[n] = mult; });
    put(dr.double_damage_to, 2);
    put(dr.half_damage_to, 0.5);
    put(dr.no_damage_to, 0);
    TX[ja] = row;
  });
  const nSuper = Object.values(TX).reduce((a, r) => a + Object.values(r).filter(v => v === 2).length, 0);
  console.error(`   type chart: ${Object.keys(TX).length} types / ばつぐん ${nSuper} くみあわせ`);

  console.error('4/5 evolution chains ...');
  const chainUrls = [...new Set(spec.map(s => s.evolution_chain && s.evolution_chain.url).filter(Boolean))];
  const chains = await pool(chainUrls, 6, u => getJSON(u));
  const idOf = (url) => Number(url.replace(/\/$/, '').split('/').pop());
  const evolvesTo = {};   // id -> [next ids]
  const stageOf = {};     // id -> 0|1|2
  for (const c of chains) {
    const walk = (node, depth) => {
      const id = idOf(node.species.url);
      stageOf[id] = depth;
      const nexts = node.evolves_to.map(n => idOf(n.species.url)).filter(x => x <= N);
      if (nexts.length) evolvesTo[id] = nexts;
      node.evolves_to.forEach(n => walk(n, depth + 1));
    };
    walk(c.chain, 0);
  }

  // まえに とった スプライトが あれば つかいまわす（とりなおしは じかんが かかるため）
  const cache = {};
  try {
    const old = fs.readFileSync(OUT, 'utf8');
    const prev = eval(old + '; PK');
    prev.forEach(r => { if (r.s) cache[r.i] = [r.s, r.y || null]; });
    console.error(`   sprite cache: ${Object.keys(cache).length} 件`);
  } catch (e) { /* キャッシュ なし */ }

  console.error('5/5 sprites ...');
  const sprUrls = mons.map((m, k) => [
    (m.sprites && m.sprites.front_default) || null,
    (m.sprites && m.sprites.front_shiny) || null,
    ids[k],
  ]);
  let fetched = 0;
  const sprites = await pool(sprUrls, 12, async ([a, b, id]) => {
    if (cache[id]) return cache[id];
    fetched++;
    return [await getB64(a), await getB64(b)];
  });
  console.error(`   ${fetched} 件を あらたに ダウンロード`);

  const rows = ids.map((id, i) => {
    const m = mons[i], s = spec[i];
    const [png, shiny] = sprites[i];
    return {
      i: id,
      n: jname(s.names) || m.name,
      t: m.types.sort((a, b) => a.slot - b.slot).map(t => TYPE_JA[t.type.name]),
      e: evolvesTo[id] || null,
      st: stageOf[id] || 0,
      L: (s.is_legendary || s.is_mythical) ? 1 : 0,
      // バトルの つよさ：しゅぞくちの ごうけい（190〜720 くらい）
      bs: m.stats.reduce((a, x) => a + x.base_stat, 0),
      s: png,
      y: shiny,
    };
  });

  const missing = rows.filter(r => !r.s);
  if (missing.length) console.error('!! sprite missing:', missing.map(r => r.i).join(','));

  const bytes = rows.reduce((a, r) => a + (r.s ? r.s.length : 0) + (r.y ? r.y.length : 0), 0);
  console.error(`sprites base64 total: ${(bytes / 1048576).toFixed(2)} MB`);
  console.error('bases (encounterable):', rows.filter(r => r.st === 0 && !r.L).length,
                '/ legendary:', rows.filter(r => r.L).length,
                '/ with evolution:', rows.filter(r => r.e).length);

  const bsv = rows.map(r => r.bs).sort((a, b) => a - b);
  console.error(`しゅぞくち: さいしょう ${bsv[0]} / まんなか ${bsv[Math.floor(bsv.length / 2)]} / さいだい ${bsv[bsv.length - 1]}`);

  fs.writeFileSync(OUT, 'const PK=' + JSON.stringify(rows) + ';\nconst TX=' + JSON.stringify(TX) + ';\n');
  console.error('written', OUT, (fs.statSync(OUT).size / 1048576).toFixed(2), 'MB');
  console.error('sample:', JSON.stringify(rows.slice(0, 3).map(r => ({ i: r.i, n: r.n, t: r.t, bs: r.bs }))));
})();
