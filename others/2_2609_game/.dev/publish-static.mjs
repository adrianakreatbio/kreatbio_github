// Publish only these runtime files; development files stay in .dev/.
import { copyFile, cp } from 'node:fs/promises';
const here = new URL('./', import.meta.url);
for (const [source, target] of [
  ['site.html', '../index.html'],
  ['dist/game.js', '../game.js'],
  ['dist/styles.css', '../styles.css'],
]) {
  await copyFile(new URL(source, here), new URL(target, here));
}
await cp(new URL('public/assets/', here), new URL('../assets/', here), { recursive: true });
console.log('Static game ready: ../index.html, ../game.js, ../styles.css, ../assets/');
