/* Tính tiền và dữ liệu dịch vụ cho trang Booking.
   Viết tách riêng để chạy được cả trên trình duyệt (BK) lẫn trong test (node). */
(function (root) {
  'use strict';

  var GROUPS = { al: 'Người lớn', tre: 'Trẻ em', nct: 'Người cao tuổi' };
  var PEOPLE = { 'none': [], 'al-tre': ['al', 'tre'], 'al-tre-nct': ['al', 'tre', 'nct'] };
  var DATE_MODES = ['single', 'range', 'trip'];
  var DEFAULT_CATS = [
    { id: 'hotel', name: 'Phòng khách sạn', dateMode: 'range', people: 'none' },
    { id: 'tour', name: 'Tour', dateMode: 'single', people: 'al-tre-nct' },
    { id: 'xe', name: 'Xe', dateMode: 'single', people: 'none' },
    { id: 've', name: 'Vé tàu/xe/máy bay', dateMode: 'trip', people: 'al-tre' },
    { id: 'vui', name: 'Vé vui chơi/tham quan', dateMode: 'single', people: 'al-tre-nct' },
    { id: 'an', name: 'Ăn uống', dateMode: 'single', people: 'al-tre' }
  ];
  var LEGACY_CAT_ID = 'xe';
  var NOTE_MAX = 300;

  // ---- Ngày (gõ DDMMYY, hiện dd/mm/yy) ----
  function digits(raw) { return String(raw == null ? '' : raw).replace(/\D/g, ''); }
  function parseDate6(raw) {
    var s = digits(raw);
    if (s.length !== 6) return null;
    var d = parseInt(s.slice(0, 2), 10), m = parseInt(s.slice(2, 4), 10), y = 2000 + parseInt(s.slice(4, 6), 10);
    if (m < 1 || m > 12 || d < 1) return null;
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }
  function nightsBetween(a, b) {
    var d1 = parseDate6(a), d2 = parseDate6(b);
    if (!d1 || !d2) return 0;
    return Math.max(0, diffDays(d1, d2));
  }
  // '' = để trống (được), 'bad' = gõ dở hoặc ngày không có thật
  function dateState(raw) {
    var s = digits(raw);
    if (!s) return 'empty';
    return parseDate6(s) ? 'ok' : 'bad';
  }

  // ---- Loại dịch vụ ----
  var ID_RE = /^[a-z0-9]{1,20}$/;
  function validName(n) { return typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 30 && !/[<>"&]/.test(n); }
  function normalizeCats(raw) {
    if (!Array.isArray(raw) || !raw.length) return DEFAULT_CATS.map(function (c) { return Object.assign({}, c); });
    var out = [], seen = {};
    raw.forEach(function (c) {
      if (!c || typeof c !== 'object' || !ID_RE.test(c.id || '') || seen[c.id] || !validName(c.name)) return;
      if (DATE_MODES.indexOf(c.dateMode) < 0 || !PEOPLE[c.people]) return;
      seen[c.id] = 1;
      out.push({ id: c.id, name: c.name.trim(), dateMode: c.dateMode, people: c.people });
    });
    return out.length ? out : DEFAULT_CATS.map(function (c) { return Object.assign({}, c); });
  }
  function findCat(cats, id) {
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i];
    return null;
  }
  function catIdOf(s) { return (s && s.catId) || LEGACY_CAT_ID; }
  function catNameOf(s, cats) {
    var c = findCat(cats || DEFAULT_CATS, catIdOf(s));
    return c ? c.name : ((s && s.cat) || 'Xe');
  }
  function isLegacy(s) { return !s || !s.catId; }
  function isGroup(s) { return !!(s && Array.isArray(s.lines) && s.lines.length); }
  function groupKeys(people) { return (PEOPLE[people] || []).slice(); }

  // ---- Đối tác ----
  // Tên, dịch vụ: không dùng < >. SĐT chỉ số và ký tự thường gặp. Email phải có dạng a@b.c
  function cleanText(x, max) {
    if (typeof x !== 'string') return null;
    var t = x.trim().replace(/\s+/g, ' ');
    if (t.length > max || /[<>]/.test(t)) return null;
    return t;
  }
  function validPhone(x) { var t = cleanText(x, 30); return t !== null && /^[0-9+().\s-]*$/.test(t); }
  function validEmail(x) { var t = cleanText(x, 80); return t !== null && (t === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)); }
  function validPartnerName(x) { var t = cleanText(x, 60); return t !== null && t.length >= 1; }
  // Văn bản nhiều dòng (mỗi dòng một dịch vụ) -> mảng; null nếu có dòng không hợp lệ
  function parseServices(text) {
    var out = [], lines = String(text == null ? '' : text).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var t = cleanText(lines[i], 80);
      if (t === null) return null;
      if (t && out.indexOf(t) < 0) out.push(t);
    }
    return out.length <= 100 ? out : null;
  }
  function normalizePartners(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [], ids = {};
    raw.forEach(function (p) {
      if (!p || typeof p !== 'object' || !ID_RE.test(p.id || '') || ids[p.id]) return;
      if (!validPartnerName(p.name)) return;
      var cats = Array.isArray(p.cats) ? p.cats.filter(function (c) { return typeof c === 'string' && ID_RE.test(c); }) : [];
      var services = Array.isArray(p.services) ? parseServices(p.services.join('\n')) : [];
      ids[p.id] = 1;
      out.push({
        id: p.id, name: cleanText(p.name, 60),
        phone: validPhone(p.phone || '') ? cleanText(p.phone || '', 30) : '',
        email: validEmail(p.email || '') ? cleanText(p.email || '', 80) : '',
        cats: cats, services: services || []
      });
    });
    return out;
  }
  function partnersForCat(partners, catId) {
    return (partners || []).filter(function (p) { return (p.cats || []).indexOf(catId) >= 0; });
  }
  function findPartner(partners, id) {
    for (var i = 0; i < (partners || []).length; i++) if (partners[i].id === id) return partners[i];
    return null;
  }

  // ---- Dựng dịch vụ từ dữ liệu form ----
  // f: {catId,catName,partnerId,partner,note,dateMode,people,name,dateIn,dateOut,trip,unit,qty,price,net,lines:{al:{qty,price,net}}}
  // price: số hoặc null nếu để trống (0 là "miễn phí" có chủ ý). net: số, 0/null nếu chưa có.
  function fail(msg) { return { ok: false, error: msg }; }
  function buildService(f) {
    var name = String(f.name || '').trim();
    if (!f.catId) return fail('Chọn loại dịch vụ.');
    var partner = String(f.partner || '').trim();
    if (!f.partnerId || !partner) return fail('Chọn đối tác.');
    if (!name) return fail('Nhập tên dịch vụ.');
    var note = String(f.note || '').trim();
    if (note.length > NOTE_MAX) return fail('Ghi chú tối đa ' + NOTE_MAX + ' ký tự.');
    var dateIn = String(f.dateIn || ''), dateOut = String(f.dateOut || '');
    var mode = f.dateMode, trip = mode === 'trip' ? (f.trip === 'round' ? 'round' : 'oneway') : null;
    var useOut = mode === 'range' || (mode === 'trip' && trip === 'round');
    if (!useOut) dateOut = '';
    var inLabel = mode === 'range' ? 'Ngày nhận phòng' : 'Ngày đi';
    var outLabel = mode === 'range' ? 'Ngày trả phòng' : 'Ngày về';
    if (mode === 'range') {
      if (dateState(dateIn) !== 'ok') return fail(inLabel + ' chưa đúng (gõ dạng DDMMYY).');
      if (dateState(dateOut) !== 'ok') return fail(outLabel + ' chưa đúng (gõ dạng DDMMYY).');
    } else {
      if (dateState(dateIn) === 'bad') return fail(inLabel + ' chưa đúng (gõ dạng DDMMYY).');
      if (useOut && dateState(dateOut) === 'bad') return fail(outLabel + ' chưa đúng (gõ dạng DDMMYY).');
    }
    var nights = 0;
    if (useOut && dateState(dateIn) === 'ok' && dateState(dateOut) === 'ok') {
      nights = diffDays(parseDate6(dateIn), parseDate6(dateOut));
      if (mode === 'range' && nights < 1) return fail(outLabel + ' phải sau ' + inLabel.toLowerCase() + ' ít nhất 1 ngày.');
      if (mode === 'trip' && nights < 0) return fail(outLabel + ' không được trước ngày đi.');
    }
    var svc = {
      cat: f.catName, catId: f.catId, dateMode: mode, people: f.people, name: name,
      dateIn: dateIn, dateOut: dateOut, partnerId: String(f.partnerId), partner: partner
    };
    if (note) svc.note = note;
    if (trip) svc.trip = trip;

    if (f.people === 'none') {
      var qty = parseInt(f.qty, 10);
      if (!(qty >= 1)) return fail('Số lượng phải từ 1 trở lên.');
      var price = Number(f.price);
      if (!(price > 0)) return fail('Nhập giá bán.');
      var net = Number(f.net) > 0 ? Number(f.net) : 0;
      var mult = mode === 'range' ? nights : 1;
      var units = qty * mult;
      svc.qty1 = qty; svc.unit1 = f.unit || '';
      svc.qty2 = mode === 'range' ? nights : null; svc.unit2 = mode === 'range' ? 'đêm' : null;
      svc.price = price; svc.netPrice = net > 0 ? net : null;
      svc.total = price * units; svc.totalNet = net > 0 ? net * units : null;
      return { ok: true, svc: svc };
    }

    var keys = groupKeys(f.people), lines = [], total = 0, totalNet = 0, allNet = true;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], g = (f.lines && f.lines[k]) || {};
      var q = parseInt(g.qty, 10);
      if (!(q > 0)) continue;
      if (g.price === null || g.price === undefined || g.price === '' || !(Number(g.price) >= 0))
        return fail('Nhập giá bán cho nhóm ' + GROUPS[k] + '.');
      var p = Number(g.price), nn = Number(g.net) > 0 ? Number(g.net) : 0;
      var line = { k: k, label: GROUPS[k], qty: q, price: p, netPrice: nn > 0 ? nn : null, total: q * p, totalNet: nn > 0 ? nn * q : null };
      total += line.total;
      if (nn > 0) totalNet += line.totalNet; else allNet = false;
      lines.push(line);
    }
    if (!lines.length) return fail('Nhập số lượng cho ít nhất một nhóm.');
    if (!(total > 0)) return fail('Dịch vụ chưa có giá bán.');
    svc.unit = f.unit || '';
    svc.lines = lines; svc.total = total; svc.totalNet = allNet ? totalNet : null;
    return { ok: true, svc: svc };
  }

  // ---- Đọc dịch vụ để hiển thị (cả đơn cũ lẫn đơn mới) ----
  function svcLines(s) {
    if (isGroup(s)) {
      return s.lines.map(function (l) {
        return { key: l.k, label: l.label || GROUPS[l.k] || '', qty: l.qty, unit: s.unit || '', price: l.price, net: l.netPrice || null, total: l.total, totalNet: l.totalNet || null };
      });
    }
    return [{ key: null, label: '', qty: s.qty1, unit: s.unit1 || '', qty2: s.qty2 == null ? null : s.qty2, unit2: s.unit2 || '', price: s.price, net: s.netPrice || null, total: s.total, totalNet: s.totalNet || null }];
  }
  // Số đơn vị để nhân giá của dịch vụ không chia nhóm (đơn cũ: cột 1 x cột 2)
  function unitsOf(s) {
    var q1 = s.qty1 || 1;
    return (s.qty2 ? q1 * s.qty2 : q1) || 1;
  }
  // Ghi giá net: nets là số (dịch vụ không chia nhóm) hoặc {al:..,tre:..} (chia nhóm)
  function applyNet(s, nets) {
    if (isGroup(s)) {
      var sum = 0, all = true;
      s.lines.forEach(function (l) {
        var n = Number(nets && nets[l.k]) || 0;
        l.netPrice = n > 0 ? n : null;
        l.totalNet = n > 0 ? n * l.qty : null;
        if (n > 0) sum += l.totalNet; else all = false;
      });
      s.totalNet = all ? sum : null;
      return s;
    }
    var n1 = Number(nets) || 0;
    s.netPrice = n1 > 0 ? n1 : null;
    s.totalNet = n1 > 0 ? n1 * unitsOf(s) : null;
    return s;
  }
  function netState(s) {
    if (isGroup(s)) {
      var have = s.lines.filter(function (l) { return l.netPrice > 0; }).length;
      return have === 0 ? 'none' : have === s.lines.length ? 'full' : 'partial';
    }
    return s.totalNet ? 'full' : 'none';
  }

  // ---- Thống kê theo loại ----
  function statsByCat(bookings, cats) {
    var rows = {}, order = [];
    (bookings || []).forEach(function (b) {
      (b.svcs || []).forEach(function (s) {
        var id = catIdOf(s);
        if (!rows[id]) { rows[id] = { id: id, name: catNameOf(s, cats), count: 0, revenue: 0, netRevenue: 0, net: 0, netCount: 0 }; order.push(id); }
        var r = rows[id];
        r.count++; r.revenue += s.total || 0;
        if (s.totalNet) { r.netCount++; r.netRevenue += s.total || 0; r.net += s.totalNet; }
      });
    });
    return order.map(function (id) {
      var r = rows[id]; r.profit = r.netRevenue - r.net; return r;
    });
  }

  // ---- CSV: mỗi nhóm người một dòng ----
  var CSV_HEAD = ['Mã đơn', 'Ngày tạo', 'Khách', 'SĐT', 'Trạng thái', 'Loại dịch vụ', 'Dịch vụ', 'Nhóm', 'Chiều', 'Ngày đi', 'Ngày về', 'Số lượng', 'Đơn giá bán', 'Thành tiền', 'Đơn giá net', 'Tổng net', 'Tổng đơn', 'Đã thu', 'Còn lại'];
  function legacyQty(l) {
    var t = (l.qty + ' ' + (l.unit || '')).trim();
    if (l.qty2 != null && l.unit2 !== 'đêm') t += ' x ' + l.qty2 + ' ' + (l.unit2 || '');
    return t.trim();
  }
  function csvRows(bookings, statusLabels, cats) {
    var rows = [CSV_HEAD.slice()];
    (bookings || []).forEach(function (b) {
      var paid = (b.payments || []).reduce(function (a, p) { return a + p.amount; }, 0);
      var st = (statusLabels && statusLabels[b.status]) || b.status;
      var svcs = b.svcs && b.svcs.length ? b.svcs : [null];
      svcs.forEach(function (s) {
        if (!s) { rows.push([b.id, b.created, b.name, b.phone, st, '', '', '', '', '', '', '', '', '', '', '', b.totalAmt, paid, b.totalAmt - paid]); return; }
        var chieu = s.trip === 'round' ? 'Khứ hồi' : s.trip === 'oneway' ? 'Một chiều' : '';
        svcLines(s).forEach(function (l) {
          var qtyTxt = l.key ? (l.qty + ' ' + (l.unit || '')).trim() : (l.qty ? legacyQty(l) : '');
          rows.push([b.id, b.created, b.name, b.phone, st, catNameOf(s, cats), s.name || '', l.label || '', chieu, s.dateIn || '', s.dateOut || '', qtyTxt,
            l.price == null ? '' : l.price, l.total || '', l.net || '', l.totalNet || '', b.totalAmt, paid, b.totalAmt - paid]);
        });
      });
    });
    return rows;
  }

  var api = {
    GROUPS: GROUPS, PEOPLE: PEOPLE, DATE_MODES: DATE_MODES, DEFAULT_CATS: DEFAULT_CATS, LEGACY_CAT_ID: LEGACY_CAT_ID,
    parseDate6: parseDate6, diffDays: diffDays, nightsBetween: nightsBetween, dateState: dateState,
    normalizeCats: normalizeCats, findCat: findCat, catIdOf: catIdOf, catNameOf: catNameOf, validName: validName,
    isLegacy: isLegacy, isGroup: isGroup, groupKeys: groupKeys,
    buildService: buildService, svcLines: svcLines, unitsOf: unitsOf, applyNet: applyNet, netState: netState,
    statsByCat: statsByCat, csvRows: csvRows,
    NOTE_MAX: NOTE_MAX, cleanText: cleanText, validPhone: validPhone, validEmail: validEmail, validPartnerName: validPartnerName,
    parseServices: parseServices, normalizePartners: normalizePartners, partnersForCat: partnersForCat, findPartner: findPartner
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BK = api;
})(typeof window !== 'undefined' ? window : this);
