const $ = (id) => document.getElementById(id);
let files = [];
let index = 0;
let imageUrls = [];
let pageDrag;
let momentumFrame;
let dragFrame;
let pageBarTimer;
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
  updatePageBar();
}
function clearPages() {
  stopMomentum();
  hidePageBar();
  pageDrag = undefined;
  $('canvas').classList.remove('dragging');
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
  stopMomentum();
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
  pageDrag = undefined;
  $('canvas').classList.remove('dragging');
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
// Track recent motion for a velocity- and acceleration-sensitive release.
// Vertical reading and pinch zoom stay native.
$('canvas').addEventListener('touchstart', event => {
  if ($('scroll-mode').checked || !files.length) return;
  if (event.touches.length !== 1) {
    finishPageDrag(true);
    return;
  }
  const canvas = $('canvas');
  const left = getPagePosition();
  stopMomentum(true);
  canvas.classList.add('dragging');
  canvas.scrollTo({ left: canvas.scrollLeft, behavior: 'instant' });
  const touch = event.touches[0];
  pageDrag = {
    x: touch.clientX, y: touch.clientY,
    left, targetLeft: left, startIndex: index,
    horizontal: false, samples: [{ left, time: performance.now() }],
  };
}, { passive: true });
$('canvas').addEventListener('touchmove', event => {
  if (!pageDrag || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const dx = touch.clientX - pageDrag.x;
  const dy = touch.clientY - pageDrag.y;
  if (!pageDrag.horizontal) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
    if (Math.abs(dy) > Math.abs(dx)) {
      finishPageDrag(true);
      return;
    }
    pageDrag.horizontal = true;
  }
  event.preventDefault();
  const canvas = $('canvas');
  const width = canvas.clientWidth;
  pageDrag.targetLeft = Math.max(0, Math.min((files.length - 1) * width, pageDrag.left - dx));
  if (dragFrame === undefined) {
    pageDrag.frameTime = performance.now();
    dragFrame = requestAnimationFrame(followPageDrag);
  }
  const now = performance.now();
  pageDrag.samples.push({ left: pageDrag.targetLeft, time: now });
  pageDrag.samples = pageDrag.samples.filter(sample => now - sample.time <= 120);
}, { passive: false });
function followPageDrag(now) {
  dragFrame = undefined;
  if (!pageDrag) return;
  const position = getPagePosition();
  const remaining = pageDrag.targetLeft - position;
  const elapsed = Math.max(1, now - pageDrag.frameTime);
  pageDrag.frameTime = now;
  const blend = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1 - Math.exp(-elapsed / 24);
  setPagePosition(Math.abs(remaining) < 1 ? pageDrag.targetLeft : position + remaining * blend);
  if (Math.abs(pageDrag.targetLeft - getPagePosition()) >= 1) {
    dragFrame = requestAnimationFrame(followPageDrag);
  }
}
// Keep a virtual horizontal position so the spring can swing past either edge.
function getPagePosition() {
  return $('canvas').scrollLeft - (parseFloat($('canvas').style.getPropertyValue('--page-offset')) || 0);
}
function setPagePosition(position) {
  const canvas = $('canvas');
  const maximum = Math.max(0, (files.length - 1) * canvas.clientWidth);
  const bounded = Math.max(0, Math.min(maximum, position));
  canvas.scrollLeft = bounded;
  canvas.style.setProperty('--page-offset', `${bounded - position}px`);
}
function stopMomentum(preservePosition = false) {
  cancelAnimationFrame(dragFrame);
  dragFrame = undefined;
  cancelAnimationFrame(momentumFrame);
  momentumFrame = undefined;
  $('canvas').classList.remove('dragging');
  if (!preservePosition) $('canvas').style.removeProperty('--page-offset');
}
function animateToPage(target, velocity) {
  const canvas = $('canvas');
  const start = getPagePosition();
  const end = target * canvas.clientWidth;
  const distance = end - start;
  const approachMs = Math.min(180, Math.max(90, Math.abs(distance) / Math.max(3, Math.abs(velocity) * 2)));
  const settleMs = 380;
  const amplitude = Math.min(18, Math.abs(distance) * 0.08 + Math.abs(velocity) * 1.5);
  const direction = Math.sign(distance) || Math.sign(velocity) || 1;
  // This clock starts at release, rather than at the first rendered frame.
  const began = performance.now();
  canvas.classList.add('dragging');
  const step = now => {
    const elapsed = now - began;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || elapsed >= approachMs + settleMs) {
      setPagePosition(end);
      stopMomentum();
      index = target;
      updateHeader();
      return;
    }
    if (elapsed < approachMs) {
      // Fast approach to the selected page after the finger is lifted.
      const progress = Math.max(0, elapsed / approachMs);
      setPagePosition(start + distance * (1 - (1 - progress) ** 3));
    } else {
      // Alternating offsets with an exponentially shrinking amplitude.
      const seconds = (elapsed - approachMs) / 1000;
      const swing = direction * amplitude * Math.exp(-8 * seconds) * Math.sin(40 * seconds);
      setPagePosition(end + swing);
    }
    momentumFrame = requestAnimationFrame(step);
  };
  momentumFrame = requestAnimationFrame(step);
}
function finishPageDrag(cancelled = false) {
  if (!pageDrag) return;
  const drag = pageDrag;
  cancelAnimationFrame(dragFrame);
  dragFrame = undefined;
  pageDrag = undefined;
  const canvas = $('canvas');
  const width = canvas.clientWidth;
  const samples = drag.samples;
  let velocity = 0;
  let acceleration = 0;
  // A pause before release cancels the flick instead of using stale movement.
  if (!cancelled && drag.horizontal && performance.now() - samples.at(-1).time < 90 && samples.length > 1) {
    const last = samples.at(-1);
    const first = samples[0];
    velocity = (last.left - first.left) / Math.max(1, last.time - first.time);
    if (samples.length >= 3) {
      const middle = samples[Math.floor(samples.length / 2)];
      const earlySpeed = (middle.left - first.left) / Math.max(1, middle.time - first.time);
      const lateSpeed = (last.left - middle.left) / Math.max(1, last.time - middle.time);
      acceleration = (lateSpeed - earlySpeed) / Math.max(1, (last.time - first.time) / 2);
    }
  }
  const boost = Math.sign(velocity) === Math.sign(acceleration) ? Math.min(0.6, Math.abs(acceleration) * 30) : 0;
  const projection = Math.abs(velocity) > 0.35 ? velocity * 180 * (1 + boost) : 0;
  const projected = getPagePosition() + Math.max(-width * 3, Math.min(width * 3, projection));
  const target = Math.max(0, Math.min(files.length - 1, Math.round(projected / width)));
  if (cancelled || !drag.horizontal) {
    index = Math.max(0, Math.min(files.length - 1, Math.round(canvas.scrollLeft / width)));
    scrollToPage('instant');
    updateHeader();
  } else animateToPage(target, velocity);
}
$('canvas').addEventListener('touchend', () => finishPageDrag(), { passive: true });
$('canvas').addEventListener('touchcancel', () => finishPageDrag(true), { passive: true });
new ResizeObserver(() => {
  finishPageDrag(true);
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
  if (event.target === $('page-range')) return;
  if ($('reader').hidden || $('preferences').open || event.altKey || event.ctrlKey || event.metaKey) return;
  if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'ArrowRight') move(1);
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'Home') move(-files.length);
    if (event.key === 'End') move(files.length);
  }
});

function updatePageBar() {
  const total = files.length;
  $('page-range').max = String(total);
  $('page-range').value = String(index + 1);
  $('page-range').disabled = total <= 1;
  $('page-range').setAttribute('aria-valuetext', `${index + 1} / ${total}`);
  $('page-total').textContent = total;
  $('page-bubble').textContent = index + 1;
  const fraction = total > 1 ? index / (total - 1) : 0;
  // Range thumbs move within half a thumb's width at either endpoint.
  $('page-bubble').style.left = `calc(${fraction * 100}% + ${8 - fraction * 16}px)`;
}
function hidePageBar() {
  clearTimeout(pageBarTimer);
  $('page-bar').hidden = true;
}
function showPageBar() {
  if (!files.length) return;
  clearTimeout(pageBarTimer);
  $('page-bar').hidden = false;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) {
    pageBarTimer = setTimeout(() => {
      if (!$('page-bar').contains(document.activeElement)) hidePageBar();
    }, 4000);
  }
}
$('viewer').addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse') return;
  const bounds = $('viewer').getBoundingClientRect();
  if (event.clientY >= bounds.bottom - 100) showPageBar();
  else if (!$('page-bar').contains(document.activeElement)) hidePageBar();
});
$('viewer').addEventListener('pointerleave', () => {
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !$('page-bar').contains(document.activeElement)) hidePageBar();
});
$('viewer').addEventListener('click', event => {
  if (matchMedia('(hover: hover) and (pointer: fine)').matches || $('page-bar').contains(event.target)) return;
  const bounds = $('viewer').getBoundingClientRect();
  if (event.clientY >= bounds.bottom - 100) {
    if ($('page-bar').hidden) showPageBar();
    else hidePageBar();
  } else hidePageBar();
});
$('page-range').addEventListener('input', () => {
  pageDrag = undefined;
  index = Number($('page-range').value) - 1;
  scrollToPage('instant');
  updateHeader();
  showPageBar();
});
$('page-range').addEventListener('blur', showPageBar);
