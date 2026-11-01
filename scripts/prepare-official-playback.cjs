// Extract the deployed audio adapter and lifecycle method for isolated Android tests.
// Generated third-party code stays outside this repository and the production APK.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parse } = require('acorn');
const [indexPath, resultPath, output] = process.argv.slice(2);
if (!indexPath || !resultPath || !output) throw new Error('Usage: node prepare-official-playback.cjs <index.js> <Result.js> <temporary-output-dir>');
const index = fs.readFileSync(indexPath, 'utf8');
const result = fs.readFileSync(resultPath, 'utf8');
const indexAst = parse(index, { ecmaVersion: 'latest', sourceType: 'module' });
const resultAst = parse(result, { ecmaVersion: 'latest', sourceType: 'module' });
const declarations = indexAst.body.filter(node => node.type === 'VariableDeclaration').flatMap(node => node.declarations);
const audio = indexAst.body.find(node => node.type === 'ClassDeclaration' && node.id.name === 'Em');
const player = resultAst.body.filter(node => node.type === 'VariableDeclaration').flatMap(node => node.declarations).find(node => node.id.name === 'Mn');
const methods = player?.init.arguments[0].properties.find(node => node.key.name === 'methods')?.value;
const revive = methods?.properties.find(node => node.key.name === 'toggleRevive');
if (!audio || !revive) throw new Error('Inspect the changed deployed audio components before preparing tests');
const arrays = ['xp', 'Tp'].map(name => {
  const node = declarations.find(node => node.id.name === name);
  if (!node || node.init.type !== 'ArrayExpression') throw new Error('The deployed audio event list changed');
  return `const ${name}=${index.slice(node.init.start, node.init.end)};`;
}).join('\n');
const once = 'let installed=false;function Re(fn){return()=>{if(!installed){installed=true;return fn();}}}';
const setup = declarations.find(node => node.id.name === 'km');
const source = `'use strict';\n${arrays}\n${once}\nconst Zu=value=>value;const L=value=>typeof value==='function';\n` +
  index.slice(audio.start, audio.end) + '\nconst ' + index.slice(setup.start, setup.end) + ';\n' +
  'window.OfficialInnerAudioContext=Em;window.officialToggleRevive=' + result.slice(revive.start, revive.end).replace(/^toggleRevive/, 'function') + ';\n';
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'official-mobile-audio.js'), source);
fs.writeFileSync(path.join(output, 'official-mobile-audio-metadata.json'), JSON.stringify({
  sources: ['https://g.alicdn.com/bshop/uni-tingwu/2.9.82/assets/index.js', 'https://g.alicdn.com/bshop/uni-tingwu/2.9.82/assets/pages-Meeting-Result.7a768035.js'],
  hashes: [index, result, source].map(value => crypto.createHash('sha256').update(value).digest('hex')),
}, null, 2));
console.log('Prepared the deployed H5 audio adapter and hide/show method for local Android tests.');
