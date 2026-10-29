// node scripts/check-format.mjs — the brief renderer must escape everything it is given.
import assert from 'node:assert/strict'
import { renderMd, parseMemory } from '../src/lib/format.ts'

const src = [{ n: 1, title: 'A "t"', url: 'https://x.test/a' }, { n: 2, title: 'bad', url: 'javascript:alert(1)' }]
const html = renderMd('## Yesterday\n- **Acme** slipped [1] <img src=x onerror=alert(1)>\n- bad [2]\n\nok [3]', src)
assert.ok(html.startsWith('<h3>Yesterday</h3><ul><li><strong>Acme</strong> slipped <sup class="cite"><a href="https://x.test/a"'))
assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;') && !html.includes('<img'))
assert.ok(html.includes('<a href="#"') && !html.includes('javascript:'))
assert.ok(html.endsWith('<p>ok <sup class="cite"><a>3</a></sup></p>'))
assert.equal(renderMd('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>')

const m = parseMemory('[2026-10-15 10:05 · clip 00000001-aaaa-4bbb-8ccc-000000000001] Priya said hi')
assert.deepEqual([m.tag, m.clip, m.content], ['2026-10-15 10:05', '00000001-aaaa-4bbb-8ccc-000000000001', 'Priya said hi'])
const n = parseMemory('[news 2026-10-13] Acme names CFO (source: https://www.news.test/cfo)')
assert.deepEqual([n.news, n.tag, n.host, n.content], [true, '2026-10-13', 'news.test', 'Acme names CFO'])
console.log('format ok')
