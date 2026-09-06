// src/app.html に PokeAPI データを差し込んで公開用ファイルを作る
//   -> index.html     GitHub Pages 用（完全な HTML ドキュメント）
//   -> artifact.html  Claude Artifact 用（head/body なしのフラグメント）
//   -> icon.png       ホーム画面に追加したときの アイコン
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// 島の試作は独立したページ。ソースがある環境では一緒に再生成する。
const islandBuild = path.join(ROOT, 'island-prototype', 'build.cjs');
if (fs.existsSync(islandBuild)) {
  execFileSync(process.execPath, [islandBuild], { stdio: 'inherit' });
  fs.copyFileSync(path.join(ROOT, 'island-prototype', 'dist', 'index.html'), path.join(ROOT, 'island.html'));
} else if (!fs.existsSync(path.join(ROOT, 'island.html'))) {
  throw new Error('島の試作 island.html がありません。island-prototype を用意してください。');
}
const tpl = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const data = fs.readFileSync(path.join(__dirname, 'pokedata.js'), 'utf8').trim();

if (!tpl.includes('/*__PK__*/')) { console.error('テンプレートに /*__PK__*/ がありません'); process.exit(1); }
const fragment = tpl.replace('/*__PK__*/', () => data);

// --- Artifact 用（そのままフラグメント） ---
fs.writeFileSync(path.join(ROOT, 'artifact.html'), fragment);

// --- GitHub Pages 用（完全なドキュメントに包む） ---
const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="description" content="小学1年生むけの こくご・さんすう ドリル。ポケモンを あつめながら 1かい15分。">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="もじカズ">
<meta name="theme-color" content="#E7EFF3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0C1820" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="icon.png">
<link rel="icon" href="icon.png">
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:14px system-ui,sans-serif}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
${fragment}
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'index.html'), page);

// --- アイコン（ピカチュウのスプライト） ---
const PK = eval(data + '; PK');
const icon = PK.find(p => p.i === 25) || PK[0];
fs.writeFileSync(path.join(ROOT, 'icon.png'), Buffer.from(icon.s, 'base64'));

const mb = (f) => (fs.statSync(path.join(ROOT, f)).size / 1048576).toFixed(2) + ' MB';
console.log('index.html    ', mb('index.html'));
console.log('artifact.html ', mb('artifact.html'));
console.log('icon.png      ', mb('icon.png'), `(${icon.n})`);
console.log('ポケモン', PK.length, '匹 / やせい', PK.filter(p => p.st === 0 && !p.L).length, '/ でんせつ', PK.filter(p => p.L).length);
