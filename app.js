const $ = (id) => document.getElementById(id);
let files = [];
let index = 0;
let imageUrls = [];
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const orderedFiles = () => $('reverse').checked ? [...files].reverse() : files;
function updateHeader() {
  const file = orderedFiles()[index];
  if (!file) return;
  $('counter').textContent = `${index + 1}/${files.length}`;
  $('filename').textContent = file.name;
  $('filename').title = file.webkitRelativePath || file.name;
  $('previous').disabled = index === 0;
  $('next').disabled = index === files.length - 1;
}
function clearPages() {
  $('canvas').replaceChildren();
  imageUrls.forEach(url => URL.revokeObjectURL(url));
  imageUrls = [];
}
function render() {
  clearPages();
  const pages = orderedFiles().map((file, pageIndex) => {
    const slide = document.createElement('div');
    slide.className = 'slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-label', `${pageIndex + 1}/${files.length}`);
    const image = document.createElement('img');
    const url = URL.createObjectURL(file);
    imageUrls.push(url);
    image.src = url;
    image.alt = file.name;
    image.draggable = false;
    image.loading = Math.abs(pageIndex - index) <= 1 ? 'eager' : 'lazy';
    image.onerror = () => {
      image.hidden = true;
      const message = document.createElement('p');
      message.className = 'image-error';
      message.textContent = '이 이미지를 표시할 수 없습니다. 다음 페이지로 넘겨주세요.';
      slide.append(message);
    };
    slide.append(image);
    return slide;
  });
  $('canvas').append(...pages);
  scrollToPage('instant');
  updateHeader();
}
function scrollToPage(behavior = 'smooth') {
  const slide = $('canvas').children[index];
  if (!slide) return;
  $('canvas').scrollTo({
    left: $('scroll-mode').checked ? 0 : slide.offsetLeft,
    top: $('scroll-mode').checked ? slide.offsetTop : 0,
    behavior: matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : behavior,
  });
}
function move(delta) {
  index = Math.max(0, Math.min(files.length - 1, index + delta));
  scrollToPage();
  updateHeader();
}
$('previous').onclick = () => move(-1);
$('next').onclick = () => move(1);
$('scroll-mode').onchange = () => {
  $('canvas').classList.toggle('scroll-mode', $('scroll-mode').checked);
  scrollToPage('instant');
};
$('canvas').addEventListener('scroll', () => {
  if (!files.length) return;
  if ($('scroll-mode').checked) {
    const slides = [...$('canvas').children];
    const position = $('canvas').scrollTop + 1;
    index = slides.findLastIndex(slide => slide.offsetTop <= position);
    index = Math.max(0, index);
  } else {
    index = Math.max(0, Math.min(files.length - 1, Math.round($('canvas').scrollLeft / $('canvas').clientWidth)));
  }
  updateHeader();
}, { passive: true });
new ResizeObserver(() => {
  if (files.length) scrollToPage('instant');
}).observe($('canvas'));
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
  clearPages();
  files = [];
  index = 0;
  $('choose').focus();
};
$('settings').onclick = () => $('preferences').showModal();
$('close-settings').onclick = () => $('preferences').close();
$('preferences').onclick = (event) => {
  if (event.target === $('preferences')) {
    const rect = $('preferences').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('preferences').close();
  }
};
$('reverse').onchange = () => { index = 0; render(); };
document.addEventListener('keydown', (event) => {
  if ($('reader').hidden || $('preferences').open || event.altKey || event.ctrlKey || event.metaKey) return;
  if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'ArrowRight') move(1);
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'Home') move(-files.length);
    if (event.key === 'End') move(files.length);
  }
});
