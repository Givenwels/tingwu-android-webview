const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { parse } = require('acorn');

for (const name of ['mobile-record-entry.js', 'recorder-mobile.js', 'media-playback.js', 'mobile-library.js']) {
  test(`${name} parses on older Android WebViews without ES2020 syntax`, () => {
    parse(readFileSync(join(__dirname, '../app/src/main/assets', name), 'utf8'), { ecmaVersion: 2017 });
  });
}
