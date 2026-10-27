const $ = (id) => document.getElementById(id);
let files = [];
let index = 0;
let imageUrl;
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const orderedFiles = () => $('reverse').checked ? [...files].reverse() : files;
function render() {
  const file = orderedFiles()[index];
  if (!file) return;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = URL.createObjectURL(file);
  $('image-error').hidden = true;
  $('page').hidden = false;
  $('page').src = imageUrl;
  $('page').alt = file.name;
  $('counter').textContent = `${index + 1}/${files.length}`;
  $('filename').textContent = file.name;
  $('filename').title = file.webkitRelativePath || file.name;
  $('position').textContent = `${index + 1} / ${files.length}`;
  $('previous').disabled = index === 0;
  $('next').disabled = index === files.length - 1;
}
function move(delta) {
  const target = Math.max(0, Math.min(files.length - 1, index + delta));
  if (target !== index) { index = target; render(); }
}
$('choose').onclick = () => $('folder').click();
$('folder').onchange = (event) => {
  const selected = [...event.target.files];
  if (!selected.length) return;
  files = selected.filter(file => file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp|ico)$/i.test(file.name))
    .sort((a, b) => collator.compare(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name));
  $('folder').value = '';
  if (!files.length) { $('notice').textContent = '선택한 폴더에 이미지가 없습니다. 다른 폴더를 선택해주세요.'; return; }
  index = 0;
  $('reverse').checked = false;
  $('notice').textContent = '';
  $('home').hidden = true;
  $('reader').hidden = false;
  render();
  $('back').focus();
};
$('back').onclick = () => {
  $('reader').hidden = true;
  $('home').hidden = false;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = undefined;
  $('page').removeAttribute('src');
  files = [];
  index = 0;
  $('choose').focus();
};
$('previous').onclick = () => move(-1);
$('next').onclick = () => move(1);
$('settings').onclick = () => $('preferences').showModal();
$('close-settings').onclick = () => $('preferences').close();
$('preferences').onclick = (event) => {
  if (event.target === $('preferences')) {
    const rect = $('preferences').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('preferences').close();
  }
};
$('reverse').onchange = () => { index = 0; render(); };
$('page').onerror = () => { $('page').hidden = true; $('image-error').hidden = false; };
document.addEventListener('keydown', (event) => {
  if ($('reader').hidden || $('preferences').open || event.altKey || event.ctrlKey || event.metaKey) return;
  if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'ArrowRight') move(1);
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'Home') { index = 0; render(); }
    if (event.key === 'End') { index = files.length - 1; render(); }
  }
});
let touchStart;
$('canvas').addEventListener('touchstart', event => {
  if (event.touches.length === 1) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  else touchStart = undefined;
}, { passive: true });
$('canvas').addEventListener('touchend', event => {
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
  touchStart = undefined;
}, { passive: true });
