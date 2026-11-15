import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const rootDir = process.cwd();
const indexPath = path.join(rootDir, 'index.html');

const sourceHtml = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta name="theme-color" content="#FF8FAB" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="ペアカレ" />
    <meta name="mobile-web-app-capable" content="yes" />
    <title>ペアカレ (PairCal) | 夫婦共有シフト＆スケジュール</title>
    <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png?v=2" />
    <link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png?v=2" />
    <link rel="icon" type="image/png" sizes="512x512" href="./icon-512.png?v=2" />
    <link rel="manifest" href="./manifest.json?v=2" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800&family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

async function run() {
  fs.writeFileSync(indexPath, sourceHtml, 'utf8');
  await build();

  const assetsDir = path.join(rootDir, 'dist', 'assets');
  const files = fs.readdirSync(assetsDir);
  const cssFiles = files.filter((f) => f.endsWith('.css'));
  const jsFiles = files.filter((f) => f.endsWith('.js'));

  const cssContent = cssFiles
    .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8'))
    .join('\n');
  const jsContent = jsFiles
    .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8'))
    .join('\n');

  const standaloneHtml = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta name="theme-color" content="#FF8FAB" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="ペアカレ" />
    <meta name="mobile-web-app-capable" content="yes" />
    <title>ペアカレ (PairCal) | 夫婦共有シフト＆スケジュール</title>
    <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png?v=2" />
    <link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png?v=2" />
    <link rel="icon" type="image/png" sizes="512x512" href="./icon-512.png?v=2" />
    <link rel="manifest" href="./manifest.json?v=2" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800&family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap" rel="stylesheet" />
    <style>${cssContent}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
${jsContent}
</script>
  </body>
</html>
`;

  fs.writeFileSync(indexPath, standaloneHtml, 'utf8');
  fs.writeFileSync(path.join(rootDir, 'dist', 'index.html'), standaloneHtml, 'utf8');
  console.log('Standalone index.html built successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
