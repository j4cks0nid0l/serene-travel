// Quản trị website: trang chủ, dịch vụ và cẩm nang.
// Giao diện không dùng code inline; bộ làm sạch HTML chạy ở trình duyệt (cleanWord) và máy chủ (sanitize).

const $ = (id) => document.getElementById(id);

const state = {
  csrf: '',
  items: [], // nội dung đã lưu trên máy chủ
  defaults: [], // nội dung mặc định từ defaults.json
  current: 'settings', // mục đang mở
  section: 'banner', // nhóm đang xem trong phần Cài đặt
  dirty: false, // có thay đổi chưa lưu
  range: null, // vị trí con trỏ trong trình soạn thảo
  manageFilter: 'all',
  manageQuery: '',
  importing: false,
};

const FIELD_LABELS = {
  heroTitle: 'Tiêu đề trang chủ',
  heroSubtitle: 'Lời giới thiệu trang chủ',
  heroImage: 'Ảnh chính trang chủ',
  aboutTitle: 'Tiêu đề phần Về Serene',
  aboutBody: 'Giới thiệu Serene',
  founderName: 'Tên người sáng lập',
  founderImage: 'Ảnh người sáng lập',
  cardVinpearl: 'Ảnh đại diện Combo Vinpearl',
  cardHotel: 'Ảnh đại diện Khách sạn / Resort',
  cardTour: 'Ảnh đại diện Tour trong ngày',
  cardTicket: 'Ảnh đại diện Vé các loại',
  company: 'Tên công ty',
  phone: 'Điện thoại',
  email: 'Email liên hệ',
  address: 'Địa chỉ',
  hours: 'Giờ làm việc',
  zalo: 'Liên kết Zalo',
};
const IMAGE_FIELDS = new Set(['heroImage', 'founderImage', 'cardVinpearl', 'cardHotel', 'cardTour', 'cardTicket']);
const CARD_KEYS = ['cardVinpearl', 'cardHotel', 'cardTour', 'cardTicket'];
const SERVICE_GROUPS = [
  { key: 'tour', title: 'Tour', ids: ['service-tour-dao', 'service-city-tour', 'service-private-tour', 'service-tour-trong-ngay'] },
  { key: 'stay', title: 'Lưu trú', ids: ['service-khach-san-4-sao', 'service-khach-san-5-sao', 'service-resort-nghi-duong', 'service-can-ho', 'service-homestay', 'service-villa', 'service-khach-san-resort'] },
  { key: 'ticket', title: 'Vé', ids: ['service-ve-vinpearl', 'service-ve-tham-quan', 'service-ve-may-bay', 'service-ve-cac-loai'] },
  { key: 'move', title: 'Di chuyển', ids: ['service-dua-don-san-bay', 'service-thue-xe-may', 'service-thue-xe-tu-lai'] },
  { key: 'combo', title: 'Combo Vinpearl', ids: ['service-combo-vinpearl'] },
];
const STATES = { live: ['Đã đăng', 'live'], draft: ['Lưu nháp', 'draft'], hidden: ['Đang ẩn', 'hidden'] };
const ALIGN_COMMANDS = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const BODY_LIMIT = 150000;
const PUBLISH_CONFIRM = 'Đăng nội dung này lên website để khách xem?';
const IMPORT_CONFIRM = 'Nhập nội dung mới sẽ thay nội dung đang soạn. Tiêu đề và mô tả hiện tại được giữ. Bạn muốn tiếp tục?';

// Nhóm mở sẵn trong thanh điều hướng, nhớ theo phiên làm việc.
const openGroups = new Set(['home']);
let navQuery = '';

// ---------- Tiện ích chung ----------

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const showStatus = (text) => {
  $('status').textContent = text;
};
const showError = (e) => showStatus(e.message);
const markDirty = (message = 'Có thay đổi chưa lưu.') => {
  state.dirty = true;
  showStatus(message);
};
const norm = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
// Trả về thông báo nếu nội dung chưa đủ để đăng; chuỗi rỗng nghĩa là đủ.
// Máy chủ kiểm tra cùng quy tắc trong putContent().
function hasContent(html) {
  return /<img\s/i.test(html) || html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim().length > 0;
}
function publishProblem(p, id) {
  if (id === 'settings') return '';
  if (!p.summary?.trim()) return 'Cần có mô tả ngắn trước khi đăng.';
  if (!hasContent(p.body || '')) return 'Cần có nội dung trước khi đăng.';
  return '';
}

// ---------- Gọi máy chủ ----------

function showLogin() {
  $('workspace').hidden = true;
  $('login').hidden = false;
  $('login-layout').hidden = false;
  document.body.classList.add('login-screen');
  for (const id of ['logout', 'booking-link', 'posts-link', 'hub-link', 'hub']) $(id).hidden = true;
  state.csrf = '';
}

async function api(path, method = 'GET', body) {
  const isBlob = body instanceof Blob;
  const response = await fetch('/api/' + path, {
    method,
    headers: { ...(isBlob ? { 'content-type': body.type } : { 'content-type': 'application/json' }), 'x-csrf-token': state.csrf },
    body: isBlob ? body : body ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await response.json();
  } catch {
    throw Error('Máy chủ chưa sẵn sàng.');
  }
  if (response.status === 401) {
    showLogin();
    throw Error(json.error || 'Vui lòng đăng nhập lại.');
  }
  if (!response.ok) throw Error(json.error || 'Không xử lý được yêu cầu.');
  return json;
}

async function upload(file) {
  if (!file) return '';
  if (file.size > 5 * 1024 * 1024) throw Error('Ảnh tối đa 5 MB.');
  showStatus('Đang tải ảnh…');
  return (await api('upload', 'POST', file)).url;
}

// Làm sạch HTML nhập vào hoặc tải về: chỉ giữ thẻ định dạng cho phép và ảnh đã tải lên.
// Dùng cho cả nội dung dán từ Word/HTML lẫn nội dung đã lưu.
function cleanWord(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = el('div');
  const allowed = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'IMG', 'BLOCKQUOTE']);
  const boxClasses = { BLOCKQUOTE: ['pocket', 'cta'], P: ['photo-note'] };
  const pictureSource = /^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+|\/media\/[a-zA-Z0-9._-]+)$/;

  function walk(node, parent) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        parent.append(document.createTextNode(child.textContent));
        continue;
      }
      if (child.nodeType !== 1 || ['SCRIPT', 'STYLE', 'SVG', 'MATH', 'IFRAME', 'OBJECT'].includes(child.tagName)) continue;
      if (!allowed.has(child.tagName)) {
        walk(child, parent);
        continue;
      }
      const tag = /H[1456]/.test(child.tagName) ? 'H2' : child.tagName;
      const copy = el(tag.toLowerCase());
      const className = child.getAttribute('class') || '';
      const alignment = /^align-(left|center|right|justify)$/.exec(className)?.[1];
      if (alignment && ['P', 'H2', 'H3', 'LI', 'BLOCKQUOTE'].includes(tag)) copy.className = 'align-' + alignment;
      const kept = className.split(/\s+/).filter((c) => (boxClasses[child.tagName] || []).includes(c));
      if (kept.length) copy.className = [copy.className, ...kept].filter(Boolean).join(' ');
      if (tag === 'IMG') {
        const src = child.getAttribute('src') || '';
        if (!pictureSource.test(src)) continue;
        copy.src = src;
        copy.alt = child.getAttribute('alt') || 'Ảnh trong bài viết';
      }
      if (tag === 'A') {
        try {
          const url = new URL(child.getAttribute('href'));
          if (['https:', 'http:'].includes(url.protocol)) {
            copy.href = url.href;
            copy.target = '_blank';
            copy.rel = 'noopener noreferrer';
          }
        } catch {
          // Liên kết không hợp lệ: giữ chữ, bỏ liên kết.
        }
      }
      walk(child, copy);
      parent.append(copy);
    }
  }
  walk(doc.body, out);
  return out;
}
const cleanHtml = (html) => cleanWord(html || '').innerHTML;

// ---------- Dữ liệu mục ----------

function findItem(id) {
  return state.items.find((x) => x.id === id);
}
// Nội dung hiện hành của một mục: mặc định, cộng với bản nháp (nếu có).
function contentOf(id) {
  const item = findItem(id);
  return { ...(state.defaults.find((x) => x.id === id) || {}), ...(item?.draft || {}) };
}
function pageData(id) {
  const p = contentOf(id);
  return Object.fromEntries(['title', 'summary', 'category', 'author', 'body', 'cover', 'places'].map((k) => [k, p[k] || '']));
}
function available() {
  const result = new Map(state.defaults.map((x) => [x.id, x]));
  state.items.forEach((x) => result.set(x.id, { id: x.id, ...x.draft }));
  return [...result.values()];
}
const stateOf = (item) => (item?.published ? 'live' : item?.draft?.hidden ? 'hidden' : 'draft');
const groupOf = (x) => x.category || 'Chưa chọn mục';

// ---------- Phần Cài đặt (trang chủ và công ty) ----------

// Nhãn trường: mặc định trong code, cộng với nhãn từ home-fields.json (phải tải trước khi dựng các ô nhập).
const fields = { ...FIELD_LABELS };
for (const f of await fetch('/home-fields.json')
  .then((r) => {
    if (!r.ok) throw Error();
    return r.json();
  })
  .catch(() => [])) {
  fields[f.key] = f.label;
}
const imageSyncers = {};

function makeText(key, label, it) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement(it.area ? 'textarea' : 'input');
  input.id = 'setting-' + key;
  input.maxLength = 12000;
  if (it.area) {
    input.rows = it.area;
    wrapper.classList.add('wide');
  }
  if (it.wide) wrapper.classList.add('wide');
  wrapper.append(input);
  return wrapper;
}

function makeImage(key, label) {
  const wrap = el('div', 'image-field');
  const thumb = el('div', 'thumb');
  const img = el('img');
  img.alt = '';
  const empty = el('span', null, 'Chưa có ảnh');
  thumb.append(img, empty);
  const info = el('div', 'image-info');
  const title = el('strong', null, label);
  const pick = el('label', 'file-button');
  const word = el('span', null, 'Chọn ảnh');
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/jpeg,image/png,image/webp';
  picker.setAttribute('aria-label', 'Chọn ' + label.toLowerCase());
  pick.append(word, picker);
  info.append(title, pick);
  const input = document.createElement('input');
  input.type = 'hidden';
  input.id = 'setting-' + key;
  wrap.append(thumb, info, input);

  const sync = () => {
    const v = input.value;
    img.hidden = !v;
    empty.hidden = !!v;
    if (v) img.src = v;
    else img.removeAttribute('src');
    word.textContent = v ? 'Đổi ảnh' : 'Chọn ảnh';
  };
  imageSyncers[key] = sync;
  picker.onchange = async () => {
    try {
      const url = await upload(picker.files[0]);
      if (url) {
        input.value = url;
        sync();
        markDirty('Ảnh đã tải. Lưu nháp hoặc đăng để áp dụng.');
      }
    } catch (e) {
      showError(e);
    }
    picker.value = '';
  };
  return wrap;
}

function makeField(it) {
  if (it.image) return it.image in fields ? makeImage(it.image, it.label || fields[it.image]) : null;
  return it.text in fields ? makeText(it.text, it.label || fields[it.text], it) : null;
}

function makeItems(items) {
  const grid = el('div', 'grid');
  for (const it of items) {
    if (it.blocks) {
      const blocks = el('div', 'blocks');
      for (const b of it.blocks) {
        const nodes = b.items.map(makeField).filter(Boolean);
        if (!nodes.length) continue;
        const box = el('div', 'block');
        box.append(el('h3', null, b.title), ...nodes);
        blocks.append(box);
      }
      if (blocks.children.length) grid.append(blocks);
    } else {
      const node = makeField(it);
      if (node) {
        if (it.image) node.classList.add('wide');
        grid.append(node);
      }
    }
  }
  return grid;
}

const numbered = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1));
const cardName = (n) => (fields[CARD_KEYS[n - 1]] || '').replace('Ảnh đại diện ', '');

const specs = [
  { id: 'banner', title: 'Banner đầu trang', desc: 'Phần đầu tiên khách nhìn thấy khi mở website.', items: [{ image: 'heroImage' }, { text: 'heroTitle', area: 2 }, { text: 'heroSubtitle', area: 3 }] },
  {
    id: 'about',
    title: 'Về Serene',
    desc: 'Câu chuyện thương hiệu và người sáng lập.',
    items: [{ text: 'aboutTitle', area: 2 }, { text: 'aboutBody', area: 7 }, { blocks: [{ title: 'Người sáng lập', items: [{ text: 'founderName', label: 'Tên người sáng lập' }, { image: 'founderImage' }] }] }],
  },
  {
    id: 'services',
    title: 'Thẻ dịch vụ',
    desc: 'Khối giới thiệu 4 nhóm dịch vụ chính trên trang chủ.',
    items: [
      { text: 'homeServicesTitle', area: 2 },
      { text: 'homeServicesText', area: 3 },
      {
        blocks: numbered(4, (n) => ({
          title: 'Thẻ ' + n + (cardName(n) ? ' - ' + cardName(n) : ''),
          items: [{ image: CARD_KEYS[n - 1], label: 'Ảnh thẻ' }, { text: 'homeCard' + n + 'Title', label: 'Tiêu đề thẻ' }, { text: 'homeCard' + n + 'Text', label: 'Mô tả thẻ', area: 3 }],
        })),
      },
    ],
  },
  {
    id: 'process',
    title: 'Các bước tư vấn',
    desc: 'Quy trình 3 bước từ lúc khách liên hệ đến khi chốt dịch vụ.',
    items: [{ text: 'homeProcessTitle' }, { blocks: numbered(3, (n) => ({ title: 'Bước ' + n, items: [{ text: 'homeStep' + n + 'Title', label: 'Tiêu đề bước' }, { text: 'homeStep' + n + 'Text', label: 'Mô tả bước', area: 3 }] })) }],
  },
  {
    id: 'faq',
    title: 'Câu hỏi thường gặp',
    desc: 'Những câu khách hay hỏi nhất.',
    items: [{ text: 'homeFaqTitle' }, { blocks: numbered(3, (n) => ({ title: 'Câu hỏi ' + n, items: [{ text: 'homeFaq' + n + 'Question', label: 'Câu hỏi' }, { text: 'homeFaq' + n + 'Answer', label: 'Trả lời', area: 3 }] })) }],
  },
  {
    id: 'company',
    title: 'Thông tin công ty',
    desc: 'Để trống thông tin chưa có; website sẽ không hiển thị ô trống.',
    items: [{ text: 'company' }, { text: 'phone' }, { text: 'email' }, { text: 'hours' }, { text: 'address', wide: true }, { text: 'zalo', wide: true }],
  },
];

function collectKeys(list, used) {
  for (const it of list) {
    if (it.image) used.add(it.image);
    if (it.text) used.add(it.text);
    if (it.blocks) it.blocks.forEach((b) => collectKeys(b.items, used));
  }
}

// Các trường trang chủ không nằm trong nhóm nào sẽ vào mục "Nội dung khác".
const used = new Set();
collectKeys(
  specs.flatMap((g) => g.items),
  used,
);
const leftovers = Object.keys(fields).filter((k) => !used.has(k));
if (leftovers.length) specs.push({ id: 'other', title: 'Nội dung khác', desc: 'Các mục còn lại của trang chủ.', items: leftovers.map((k) => (IMAGE_FIELDS.has(k) ? { image: k } : { text: k })) });

function buildSettingsSections() {
  for (const group of specs) {
    const section = el('section', 'group');
    section.dataset.group = group.id;
    section.hidden = true;
    section.append(el('p', 'group-desc', group.desc), makeItems(group.items));
    group.empty = !section.querySelector('.grid>*');
    $('settings-fields').append(section);
  }
}
buildSettingsSections();

function showSection(id) {
  state.section = id;
  document.querySelectorAll('.group').forEach((g) => (g.hidden = g.dataset.group !== id));
}
const syncImages = () => Object.values(imageSyncers).forEach((f) => f());

// ---------- Thanh điều hướng ----------

function navLabel(text, count) {
  const h = el('h2', null, text);
  if (count != null) h.append(el('span', null, String(count)));
  return h;
}
function navButton(it) {
  const b = el('button', it.active ? 'active' : '');
  b.type = 'button';
  b.textContent = it.title;
  if (it.active) b.setAttribute('aria-current', 'page');
  b.onclick = it.run;
  return b;
}
function filterItems(items, groupTitle) {
  return items.filter((i) => !navQuery || norm(i.title).includes(navQuery) || (groupTitle && norm(groupTitle).includes(navQuery)));
}
function navGroup(key, title, items) {
  const list = filterItems(items, title);
  if (!list.length) return null;
  if (items.length === 1) return navButton(list[0]);
  const details = el('details', 'nav-group');
  details.open = !!navQuery || openGroups.has(key) || items.some((i) => i.active);
  const summary = el('summary');
  summary.append(title, el('span', 'count', String(items.length)));
  details.append(summary);
  list.forEach((i) => details.append(navButton(i)));
  details.ontoggle = () => {
    if (navQuery) return;
    if (details.open) openGroups.add(key);
    else openGroups.delete(key);
  };
  return details;
}
function sectionItem(g) {
  return {
    title: g.title,
    active: state.current === 'settings' && state.section === g.id,
    run: () => {
      if (state.current === 'settings') {
        showSection(g.id);
        $('page-title').textContent = g.title;
        window.scrollTo(0, 0);
        renderNav();
      } else open('settings', false, g.id);
    },
  };
}
const pageItem = (x) => ({ title: x.title || 'Bài chưa đặt tên', active: x.id === state.current, run: () => open(x.id) });

function renderNav() {
  navQuery = norm($('nav-search').value.trim());
  const root = $('nav');
  root.replaceChildren();
  const append = (...nodes) => nodes.filter(Boolean).forEach((n) => root.append(n));

  // Trang chủ & công ty
  const home = specs.filter((g) => g.id !== 'company' && !g.empty).map(sectionItem);
  const company = specs.find((g) => g.id === 'company');
  const top = [navGroup('home', 'Trang chủ', home), company && !company.empty ? navGroup('company', 'Thông tin công ty', [sectionItem(company)]) : null].filter(Boolean);
  if (top.length) append(navLabel('Trang chủ & công ty'), ...top);

  // Dịch vụ
  const all = available().filter((x) => x.id !== 'settings');
  const services = all.filter((x) => x.id.startsWith('service-'));
  const posts = all.filter((x) => !x.id.startsWith('service-'));
  const placed = new Set();
  const groups = [];
  for (const g of SERVICE_GROUPS) {
    const list = services.filter((x) => g.ids.includes(x.id));
    list.forEach((x) => placed.add(x.id));
    if (list.length) groups.push(navGroup(g.key, g.title, list.map(pageItem)));
  }
  const rest = services.filter((x) => !placed.has(x.id));
  if (rest.length) groups.push(navGroup('other-services', 'Dịch vụ khác', rest.map(pageItem)));
  if (groups.some(Boolean)) append(navLabel('Dịch vụ', services.length), ...groups);

  // Cẩm nang
  const newPostButton = el('button', 'primary new-post', '+ Viết bài cẩm nang');
  newPostButton.type = 'button';
  newPostButton.onclick = newPost;
  append(
    navLabel('Cẩm nang', posts.length),
    newPostButton,
    navButton({ title: 'Quản lý bài viết', active: state.current === 'manage', run: () => open('manage') }),
  );

  if (!root.children.length) root.append(el('p', 'nav-empty', 'Không tìm thấy mục nào.'));
}

// ---------- Quản lý bài viết ----------

function renderManage() {
  const rowsAll = available()
    .filter((x) => x.id.startsWith('post-'))
    .map((x) => {
      const item = findItem(x.id);
      return { ...x, state: stateOf(item), updated: item?.updated || '' };
    });
  const q = norm(state.manageQuery.trim());

  const filters = $('manage-filters');
  filters.replaceChildren();
  const count = (k) => rowsAll.filter((x) => k === 'all' || x.state === k).length;
  for (const [k, label] of [
    ['all', 'Tất cả'],
    ['draft', 'Lưu nháp'],
    ['live', 'Đã đăng'],
    ['hidden', 'Đang ẩn'],
  ]) {
    const b = el('button', 'chip' + (state.manageFilter === k ? ' on' : ''), label + ' (' + count(k) + ')');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(state.manageFilter === k));
    b.onclick = () => {
      state.manageFilter = k;
      renderManage();
    };
    filters.append(b);
  }

  const rows = rowsAll
    .filter((x) => (state.manageFilter === 'all' || x.state === state.manageFilter) && (!q || norm((x.title || '') + ' ' + groupOf(x)).includes(q)))
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || (a.title || '').localeCompare(b.title || '', 'vi'));

  const body = $('manage-rows');
  body.replaceChildren();
  for (const x of rows) {
    const tr = document.createElement('tr');
    const td = (label, node) => {
      const c = el('td');
      c.dataset.label = label;
      c.append(node);
      tr.append(c);
    };
    const name = el('button', 'row-link', x.title || 'Bài chưa đặt tên');
    name.type = 'button';
    name.onclick = () => open(x.id);
    td('Tên', name);
    td('Chuyên mục', document.createTextNode(groupOf(x)));
    td('Trạng thái', el('span', 'badge ' + STATES[x.state][1], STATES[x.state][0]));
    td('Cập nhật', document.createTextNode(x.updated ? new Date(x.updated).toLocaleDateString('vi-VN') : 'Chưa lưu'));
    const act = el('button', 'row-act', x.state === 'live' ? 'Ẩn' : 'Đăng');
    act.type = 'button';
    act.onclick = () => toggleState(x.id, x.state === 'live' ? 'unpublish' : 'publish', act);
    td('Thao tác', act);
    body.append(tr);
  }
  $('manage-empty').hidden = rows.length > 0;
  $('manage-table').hidden = !rows.length;
  $('manage-count').textContent = rows.length + ' mục';
}

async function toggleState(id, mode, btn) {
  const p = pageData(id);
  const title = p.title || 'mục này';
  const question = mode === 'publish' ? `Đăng "${title}" lên website để khách xem?` : `Ẩn "${title}" khỏi website? Nội dung vẫn được giữ.`;
  if (!confirm(question)) return;
  if (mode === 'publish') {
    const problem = publishProblem(p, id);
    if (problem) return showError(Error(problem));
  }
  btn.disabled = true;
  try {
    await api('content/' + id, 'PUT', { data: p, mode });
    await refresh();
    renderManage();
    showStatus(mode === 'publish' ? `Đã đăng "${title}".` : `Đã ẩn "${title}" khỏi website.`);
  } catch (e) {
    showError(e);
    btn.disabled = false;
  }
}

// ---------- Mở và lưu mục ----------

function setBadge(item) {
  const b = $('state-badge');
  const st = STATES[stateOf(item)];
  b.textContent = st[0];
  b.className = 'badge ' + st[1];
}

function open(id, force = false, sec) {
  if (!force && state.dirty && !confirm('Có nội dung chưa lưu. Bạn muốn bỏ thay đổi?')) return;
  state.current = id;
  const item = findItem(id);
  const p = contentOf(id);
  const manage = id === 'manage';
  const settings = id === 'settings';
  if (settings && sec) state.section = sec;

  $('settings').hidden = !settings;
  $('article').hidden = settings || manage;
  $('manage').hidden = !manage;
  document.querySelector('.sheet').classList.toggle('managing', manage);
  $('preview').hidden = settings || manage;
  $('unpublish').hidden = settings || manage || !item?.published;

  if (manage) {
    $('page-title').textContent = 'Quản lý bài viết';
    renderManage();
  } else if (settings) {
    $('page-title').textContent = specs.find((g) => g.id === state.section)?.title || 'Trang chủ';
    for (const key of Object.keys(fields)) $('setting-' + key).value = p[key] || '';
    syncImages();
    showSection(state.section);
  } else {
    $('page-title').textContent = p.title || 'Bài viết mới';
    for (const key of ['title', 'summary', 'category', 'author', 'cover']) $(key).value = p[key] || '';
    renderPlaces(id.startsWith('post-') ? p.places : '');
    $('body').innerHTML = cleanHtml(p.body);
    updateCover();
  }

  state.dirty = false;
  state.range = null;
  $('word-status').textContent = '';
  if (!manage) setBadge(item);
  if (manage) showStatus('');
  else if (item?.published) showStatus('Đang có nội dung công khai. Lưu nháp không thay đổi bản đã đăng.');
  else if (stateOf(item) === 'hidden') showStatus('Bài đang ẩn khỏi website. Bấm Đăng lên website để hiển thị lại.');
  else showStatus('Nội dung chưa được đăng.');
  renderNav();
  if (!force) window.scrollTo(0, 0);
}

function placesValue() {
  return [...document.querySelectorAll('#places-list input:checked')].map((x) => x.value).join(',') || '-';
}
function placeCount(key) {
  return state.items
    .filter((x) => x.id.startsWith('post-') && x.published)
    .filter((x) => {
      const pl = String(x.published.places || '');
      return key === 'cam-nang' ? !pl || pl.split(',').includes('cam-nang') : pl.split(',').includes(key);
    }).length;
}
function renderPlaces(selected) {
  const card = $('places-card');
  const box = $('places-list');
  card.hidden = !state.current.startsWith('post-');
  box.replaceChildren();
  const on = new Set(String(selected || 'cam-nang').split(',').filter(Boolean));
  const all = available();
  const option = (id, text) => {
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.value = id;
    check.checked = on.has(id);
    label.append(check, document.createTextNode(text + ' (' + placeCount(id) + ')'));
    box.append(label);
  };
  option('cam-nang', 'Cẩm nang');
  for (const g of SERVICE_GROUPS) {
    const list = g.ids.map((id) => all.find((x) => x.id === id)).filter(Boolean);
    if (!list.length) continue;
    box.append(el('p', 'places-group', g.title));
    for (const x of list) option(x.id, x.title || x.id);
  }
}
function updateCover() {
  const value = $('cover').value;
  $('cover-preview').hidden = !value;
  if (value) $('cover-preview').src = value;
  else $('cover-preview').removeAttribute('src');
}

// Dữ liệu đang có trên màn hình, dùng để lưu.
function data() {
  if (state.current === 'settings') return Object.fromEntries(Object.keys(fields).map((k) => [k, $('setting-' + k).value]));
  return {
    title: $('title').value,
    summary: $('summary').value,
    category: $('category').value,
    author: $('author').value,
    body: $('body').innerHTML,
    cover: $('cover').value,
    places: placesValue(),
  };
}

async function refresh() {
  state.items = (await api('content')).items;
  renderNav();
}

async function save(mode) {
  if (mode === 'publish' && !confirm(PUBLISH_CONFIRM)) return;
  if (mode === 'unpublish' && !confirm('Gỡ bài khỏi website? Bản nháp vẫn được giữ.')) return;
  const payload = data();
  if (mode === 'publish') {
    const problem = publishProblem(payload, state.current);
    if (problem) return showError(Error(problem));
  }
  const buttons = [...document.querySelectorAll('.savebar button')];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await api('content/' + state.current, 'PUT', { data: payload, mode });
    state.dirty = false;
    await refresh();
    $('unpublish').hidden = state.current === 'settings' || !findItem(state.current)?.published;
    setBadge(findItem(state.current));
    showStatus(
      mode === 'publish' ? 'Đã đăng. Mở website để kiểm tra.' : mode === 'unpublish' ? 'Đã gỡ khỏi website.' : 'Đã lưu bản nháp trên hệ thống.',
    );
  } catch (e) {
    showError(e);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

function newPost() {
  if (state.dirty && !confirm('Có thay đổi chưa lưu. Bỏ thay đổi để viết bài mới?')) return;
  state.dirty = false;
  const id = 'post-' + crypto.randomUUID();
  state.defaults.push({ id, title: '', body: '', author: 'Serene Travel', category: 'Kinh nghiệm du lịch', places: '-' });
  open(id, true);
  $('title').focus();
}

// ---------- Trình soạn thảo ----------

function restoreSelection() {
  $('body').focus();
  if (state.range) {
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(state.range);
  }
}
function changed() {
  markDirty();
}
function hasEditorContent() {
  return $('body').textContent.trim() || $('body').querySelector('img');
}
async function insertImages(files) {
  for (const f of files) {
    try {
      const url = await upload(f);
      if (url) {
        restoreSelection();
        document.execCommand('insertImage', false, url);
        changed();
      }
    } catch (err) {
      showError(err);
    }
  }
}
function updateAlignment() {
  const s = getSelection();
  if (!$('body').contains(s.anchorNode)) return;
  const node = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
  const align = getComputedStyle(node).textAlign;
  document.querySelectorAll('[data-align]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.align === (align === 'start' ? 'left' : align))));
}
function dataUrlToBlob(url) {
  const [header, data] = url.split(',');
  const type = header.slice(5, header.indexOf(';'));
  return new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type });
}

// Chuyển file Word sang HTML trong Web Worker để không chặn giao diện.
function convertWord(buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./import-worker.js');
    const stop = (fn, value) => {
      clearTimeout(timer);
      worker.terminate();
      fn(value);
    };
    const timer = setTimeout(() => stop(reject, Error('File xử lý quá lâu. Hãy thử file nhỏ hơn.')), 20000);
    worker.onmessage = (e) => (e.data.error ? stop(reject, Error(e.data.error)) : stop(resolve, e.data));
    worker.onerror = () => stop(reject, Error('Không mở được bộ đọc Word. Hãy tải lại trang rồi thử lại.'));
    worker.postMessage(buffer, [buffer]);
  });
}

async function importWord(file) {
  if (!file || state.importing) return;
  $('word-import').open = true;
  const report = $('word-status');
  if (!/\.docx$/i.test(file.name)) {
    report.textContent = 'Chỉ nhận file .docx. Với file .doc, hãy mở trong Word rồi lưu thành .docx.';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    report.textContent = 'File Word tối đa 10 MB.';
    return;
  }
  if (hasEditorContent() && !confirm(IMPORT_CONFIRM)) return;

  state.importing = true;
  const controls = [...$('workspace').querySelectorAll('button,input,select,textarea')].map((c) => [c, c.disabled]);
  controls.forEach(([c]) => (c.disabled = true));
  $('body').contentEditable = 'false';
  report.textContent = 'Đang đọc file Word…';
  try {
    const result = await convertWord(await file.arrayBuffer());
    const clean = cleanWord(result.html);
    if (!clean.textContent.trim() && !clean.querySelector('img')) throw Error('File không có nội dung hỗ trợ để nhập.');
    const pictures = [...clean.querySelectorAll('img')];
    for (let i = 0; i < pictures.length; i++) {
      report.textContent = `Đang tải ảnh ${i + 1}/${pictures.length}…`;
      pictures[i].src = await upload(dataUrlToBlob(pictures[i].src));
    }
    if (clean.innerHTML.length > BODY_LIMIT) throw Error('Bài viết quá dài. Hãy chia thành các bài nhỏ hơn.');
    $('body').innerHTML = clean.innerHTML;
    if (!$('title').value.trim()) $('title').value = file.name.replace(/\.docx$/i, '').slice(0, 180);
    state.range = null;
    changed();
    report.textContent =
      'Đã nhập nội dung' +
      (pictures.length ? ' và ' + pictures.length + ' ảnh' : '') +
      '. Hãy kiểm tra định dạng, căn lề rồi lưu nháp. Bố cục phức tạp có thể khác Word.' +
      (result.warnings ? ' Một số thành phần trong file có thể không được giữ.' : '');
  } catch (e) {
    report.textContent = 'Chưa nhập được: ' + e.message + ' Nội dung đang soạn được giữ nguyên.';
  } finally {
    state.importing = false;
    controls.forEach(([c, disabled]) => (c.disabled = disabled));
    $('body').contentEditable = 'true';
    $('word-file').value = '';
  }
}

async function importHtml(file) {
  if (!file || state.importing) return;
  $('word-import').open = true;
  const report = $('word-status');
  if (!/\.html?$/i.test(file.name)) {
    report.textContent = 'Chỉ nhận file .html.';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    report.textContent = 'File HTML tối đa 2 MB.';
    return;
  }
  if (hasEditorContent() && !confirm(IMPORT_CONFIRM)) return;

  state.importing = true;
  try {
    const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
    const h1 = doc.body.querySelector('h1');
    const heading = h1 ? h1.textContent.trim() : '';
    if (h1) h1.remove();
    const clean = cleanWord(doc.body.innerHTML);
    if (!clean.textContent.trim() && !clean.querySelector('img')) throw Error('File không có nội dung hỗ trợ để nhập.');
    if (clean.innerHTML.length > BODY_LIMIT) throw Error('Bài viết quá dài. Hãy chia thành các bài nhỏ hơn.');
    $('body').innerHTML = clean.innerHTML;
    if (!$('title').value.trim()) $('title').value = (heading || doc.title || file.name.replace(/\.html?$/i, '')).slice(0, 180);
    const metaDesc = doc.querySelector('meta[name=description]')?.getAttribute('content') || '';
    if (!$('summary').value.trim() && metaDesc) $('summary').value = metaDesc.slice(0, 1000);
    state.range = null;
    changed();
    report.textContent = 'Đã nhập nội dung từ HTML. Hãy kiểm tra rồi lưu nháp. Thẻ lạ và mã script sẽ bị bỏ.';
  } catch (e) {
    report.textContent = 'Chưa nhập được: ' + e.message + ' Nội dung đang soạn được giữ nguyên.';
  } finally {
    state.importing = false;
    $('html-file').value = '';
  }
}

function importFile(file) {
  return /\.html?$/i.test(file?.name || '') ? importHtml(file) : importWord(file);
}

function showPreview() {
  const p = data();
  const article = $('preview-content');
  article.replaceChildren();
  const body = el('div');
  body.append(...cleanWord(p.body).childNodes);
  article.append(el('h1', null, p.title), el('p', null, p.summary), body);
  $('preview-dialog').showModal();
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify({ id: state.current, data: data() }, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = state.current + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Đăng nhập, phiên và khu chọn ----------

function showApp() {
  $('login').hidden = true;
  $('login-layout').hidden = true;
  document.body.classList.remove('login-screen');
  for (const id of ['logout', 'booking-link', 'posts-link', 'hub-link']) $(id).hidden = false;
}
function showHub() {
  $('workspace').hidden = true;
  $('hub').hidden = false;
}
function showWeb() {
  $('hub').hidden = true;
  $('workspace').hidden = false;
  open(state.current, true);
}
async function enter() {
  state.defaults = (await fetch('/defaults.json').then((r) => r.json())).items;
  await refresh();
  showApp();
  if (location.hash === '#web') showWeb();
  else showHub();
}

// ---------- Gắn sự kiện ----------

function bindEvents() {
  $('hub-web').onclick = () => {
    location.hash = '#web';
    showWeb();
  };
  $('hub-link').onclick = (e) => {
    e.preventDefault();
    if (!$('workspace').hidden && state.dirty && !confirm('Có thay đổi chưa lưu. Bỏ thay đổi để quay lại màn hình chọn khu?')) return;
    state.dirty = false;
    history.replaceState(null, '', '/admin/');
    showHub();
  };
  $('login').onsubmit = async (e) => {
    e.preventDefault();
    $('login-status').textContent = 'Đang đăng nhập…';
    try {
      const r = await api('login', 'POST', { email: $('email').value, password: $('password').value });
      state.csrf = r.csrf;
      $('password').value = '';
      if (r.role && r.role !== 'owner') {
        location.href = '/admin/booking/';
        return;
      }
      await enter();
      $('login-status').textContent = '';
    } catch (err) {
      $('login-status').textContent = err.message;
    }
  };
  $('logout').onclick = async () => {
    if (state.dirty && !confirm('Có thay đổi chưa lưu. Vẫn đăng xuất?')) return;
    try {
      await api('logout', 'POST');
      location.reload();
    } catch (e) {
      showError(e);
    }
  };
  $('toggle-password').onclick = () => {
    const show = $('password').type === 'password';
    $('password').type = show ? 'text' : 'password';
    $('toggle-password').textContent = show ? 'Ẩn' : 'Hiện';
    $('toggle-password').setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    $('toggle-password').setAttribute('aria-pressed', String(show));
  };

  $('nav-search').oninput = renderNav;
  $('manage-search').oninput = (e) => {
    state.manageQuery = e.target.value;
    renderManage();
  };
  $('title').addEventListener('input', () => {
    $('page-title').textContent = $('title').value || 'Bài viết mới';
  });
  document.querySelector('.sheet').addEventListener('input', () => {
    if (state.current !== 'manage') markDirty();
  });

  $('save').onclick = () => save('draft');
  $('publish').onclick = () => save('publish');
  $('unpublish').onclick = () => save('unpublish');
  $('preview').onclick = showPreview;
  $('close-preview').onclick = () => $('preview-dialog').close();
  $('backup').onclick = downloadBackup;
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.querySelectorAll('.more-menu button').forEach((b) => b.addEventListener('click', () => ($('more').open = false)));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#more')) $('more').open = false;
  });

  // Thanh công cụ định dạng
  document.querySelectorAll('[data-cmd]').forEach((b) => {
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => {
      restoreSelection();
      document.execCommand(b.dataset.cmd, false, null);
      changed();
    };
  });
  $('block').onchange = (e) => {
    restoreSelection();
    document.execCommand('formatBlock', false, e.target.value);
    changed();
  };
  document.querySelectorAll('[data-align]').forEach((button) => {
    button.onmousedown = (e) => e.preventDefault();
    button.onclick = () => {
      restoreSelection();
      document.execCommand(ALIGN_COMMANDS[button.dataset.align], false, null);
      changed();
      updateAlignment();
    };
  });
  $('insert-link').onmousedown = (e) => e.preventDefault();
  $('insert-link').onclick = () => {
    const input = prompt('Nhập liên kết bắt đầu bằng https://');
    if (!input) return;
    try {
      const url = new URL(input);
      if (!['https:', 'http:'].includes(url.protocol)) throw Error('Giao thức không hợp lệ');
      restoreSelection();
      const s = getSelection();
      if (s.isCollapsed) {
        const a = el('a', null, url.href);
        a.href = url.href;
        s.getRangeAt(0).insertNode(a);
      } else document.execCommand('createLink', false, url.href);
      changed();
    } catch {
      showStatus('Liên kết chưa hợp lệ.');
    }
  };
  $('insert-image').onmousedown = (e) => e.preventDefault();
  $('insert-image').onclick = () => $('body-image').click();
  $('body-image').onchange = async (e) => {
    try {
      const url = await upload(e.target.files[0]);
      if (url) {
        restoreSelection();
        document.execCommand('insertImage', false, url);
        changed();
      }
    } catch (err) {
      showError(err);
    }
    e.target.value = '';
  };

  // Ảnh đại diện
  $('cover-file').onchange = async (e) => {
    try {
      $('cover').value = await upload(e.target.files[0]);
      updateCover();
      changed();
    } catch (err) {
      showError(err);
    }
    e.target.value = '';
  };
  $('clear-cover').onclick = () => {
    $('cover').value = '';
    updateCover();
    changed();
  };

  // Dán, kéo thả vào trình soạn thảo
  $('body').addEventListener('paste', (e) => {
    const pics = [...(e.clipboardData.files || [])].filter((f) => IMAGE_TYPES.includes(f.type));
    e.preventDefault();
    if (pics.length) {
      insertImages(pics);
      return;
    }
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    changed();
  });
  $('body').addEventListener('dragover', (e) => e.preventDefault());
  $('body').addEventListener('drop', (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const pics = files.filter((f) => IMAGE_TYPES.includes(f.type));
    if (pics.length) insertImages(pics);
    else if (files[0]) importFile(files[0]);
  });

  // Nhập Word/HTML
  $('word-file').onchange = (e) => importWord(e.target.files[0]);
  $('html-file').onchange = (e) => importHtml(e.target.files[0]);
  const drop = $('word-drop');
  drop.onclick = () => $('word-file').click();
  drop.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $('word-file').click();
    }
  };
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  };
  drop.ondragleave = () => drop.classList.remove('dragover');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    importFile(e.dataTransfer.files[0]);
  };

  // Một trình lắng nghe duy nhất cho vị trí con trỏ: lưu vị trí và cập nhật nút căn lề.
  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && $('body').contains(s.anchorNode)) state.range = s.getRangeAt(0).cloneRange();
    updateAlignment();
  });
}

// ---------- Khởi động ----------

bindEvents();

try {
  const r = await api('session');
  state.csrf = r.csrf;
  if (r.role && r.role !== 'owner') location.href = '/admin/booking/';
  else await enter();
} catch (e) {
  $('login-status').textContent = e.message === 'Vui lòng đăng nhập.' ? '' : e.message;
}
