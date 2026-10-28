// Run with Node.js, Playwright, and Chromium: node tests/swipe.cjs
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const root = join(__dirname, '..');
const fixture = mkdtempSync(join(tmpdir(), 'manga-swipe-'));
for (let n = 1; n <= 12; n++) {
  writeFileSync(join(fixture, `${n}.svg`), '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="800" height="1600" fill="coral"/></svg>');
}
const contentTypes = { 'index.html': 'text/html', 'app.js': 'text/javascript', 'style.css': 'text/css', 'favicon.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!Object.hasOwn(contentTypes, name)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': contentTypes[name], 'Cache-Control': 'no-store' });
  res.end(readFileSync(join(root, name)));
});
let browser;
const assert=require('node:assert/strict');
(async()=>{
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
browser = await chromium.launch({ executablePath, headless: true });
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#folder').setInputFiles(fixture);
await page.waitForFunction(()=>document.querySelector('.slide img').naturalWidth>0);
const cdp=await page.context().newCDPSession(page);
async function seek(n){await page.locator('#page-range').evaluate((e,n)=>{e.value=n;e.dispatchEvent(new Event('input',{bubbles:true}))},n);await page.waitForTimeout(32);}
const counter=()=>page.locator('#counter').textContent();
async function swipe(direction,steps,delay){
 const from=direction>0?380:10, to=direction>0?10:380;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y:400}]});
 for(let i=1;i<=steps;i++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*i/steps,y:400}]});
  if(delay)await page.waitForTimeout(delay);
 }
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(650);
}
for(const [start,direction] of [[6,1],[6,-1],[1,-1],[12,1]]){
 for(const [steps,delay] of [[1,0],[2,0],[4,1],[15,2]]){
  await seek(start);await swipe(direction,steps,delay);
  assert.equal(await counter(),`${Math.max(1,Math.min(12,start+direction))}/12`,`fast swipe ${start} direction ${direction} steps ${steps}`);
 }
}
// Several independent fast gestures should advance exactly once each.
await seek(4);for(let n=5;n<=8;n++){await swipe(1,1,0);assert.equal(await counter(),`${n}/12`);}
// Native horizontal scrolling must not provide a second way past the clamp.
await page.mouse.move(200,400);await page.mouse.wheel(1800,0);await page.waitForTimeout(300);assert.equal(await counter(),'8/12');
// Force an out-of-range scroll during a held touch: its original bounds remain fixed.
await seek(6);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:380,y:400}]});
await page.locator('#canvas').evaluate(e=>e.scrollLeft=10*e.clientWidth);await page.waitForTimeout(50);assert.equal(await counter(),'7/12');
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:10,y:400}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(650);assert.equal(await counter(),'7/12');
// Preserve the original approach/first swing, then return once without rebound.
await page.clock.install();
await page.clock.pauseAt(new Date(Date.now() + 1000));
await page.evaluate(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.releaseFrames = [];
  window.requestAnimationFrame = callback => raf(now => {
    callback(now);
    const canvas = document.querySelector('#canvas');
    window.releaseFrames.push({
      time: now - window.releaseTime,
      position: canvas.scrollLeft - (parseFloat(canvas.style.getPropertyValue('--page-offset')) || 0),
    });
  });
});
async function touch(type, x) {
  await page.evaluate(({ type, x }) => {
    const canvas = document.querySelector('#canvas');
    canvas.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: canvas, clientX: x, clientY: 400 })],
    }));
  }, { type, x });
}
for (const [number, direction] of [[1, -1], [6, -1], [12, 1]]) {
  await seek(number);
  const from = direction < 0 ? 300 : 80;
  await touch('touchstart', from);
  for (let n = 1; n <= 6; n++) {
    await touch('touchmove', from + direction * n * 20);
    await page.clock.runFor(40);
  }
  await page.clock.runFor(120); // A pause removes velocity from page selection.
  const start = await page.locator('#canvas').evaluate(canvas => canvas.scrollLeft);
  await page.evaluate(() => { window.releaseFrames = []; window.releaseTime = performance.now(); });
  await touch('touchend', from + direction * 120);
  await page.clock.runFor(400);
  const frames = await page.evaluate(() => window.releaseFrames);
  const end = (number - 1) * 390;
  const distance = end - start;
  const amplitude = Math.min(18, Math.abs(distance) * 0.08);
  const peakMs = Math.atan(40 / 8) / 40 * 1000;
  let previousOffset = Infinity;
  for (const frame of frames) {
    if (frame.time < 90) {
      const expected = start + distance * (1 - (1 - frame.time / 90) ** 3);
      assert.ok(Math.abs(frame.position - expected) <= 1, 'original fast approach preserved');
    } else if (frame.time <= 90 + peakMs) {
      const seconds = (frame.time - 90) / 1000;
      const expected = end + Math.sign(distance) * amplitude * Math.exp(-8 * seconds) * Math.sin(40 * seconds);
      assert.ok(Math.abs(frame.position - expected) <= 1, 'original outgoing swing preserved');
    } else {
      const signedOffset = (frame.position - end) * Math.sign(distance);
      assert.ok(signedOffset >= -0.01, 'return must never cross the page center');
      assert.ok(signedOffset <= previousOffset + 0.01, 'return must shrink monotonically');
      previousOffset = signedOffset;
    }
  }
  assert.ok(frames.at(-1).time <= 90 + 113 + 17, 'ends within one frame of the intended duration');
  assert.equal(frames.at(-1).position, end);
  assert.equal(await page.locator('#canvas').evaluate(canvas => canvas.style.getPropertyValue('--page-offset')), '');
}
// Explicit page seeking and vertical reading are still available.
await seek(11);assert.equal(await counter(),'11/12');await page.locator('#settings').click();await page.locator('#scroll-mode').check();await page.keyboard.press('Escape');
await page.locator('#canvas').evaluate(e=>e.scrollTop=3*e.clientHeight);await page.waitForTimeout(50);assert.equal(await counter(),'4/12');
assert.deepEqual(errors,[]);console.log('PASS: 16 Chromium mobile touch swipes, independent gesture limits, native horizontal input blocked, injected scroll clamped, original approach preserved, single return without rebound, seek and vertical scrolling');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(fixture, { recursive: true, force: true });
});
