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
  // Nhiều email CC (cách nhau bằng dấu phẩy, chấm phẩy, khoảng trắng hoặc xuống dòng) -> mảng không trùng; null nếu có email sai hoặc quá 10 email
  var EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  function parseEmails(text) {
    var out = [], seen = {}, parts = String(text == null ? '' : text).split(/[\s,;]+/);
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i];
      if (!t) continue;
      if (t.length > 80 || !EMAIL_RE.test(t)) return null;
      var k = t.toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(t); }
    }
    return out.length <= 10 ? out : null;
  }
  // Gộp nhiều danh sách email, bỏ trùng và bỏ email đã nằm ở ô To
  function mergeEmails(lists, exclude) {
    var out = [], seen = {};
    (exclude || []).forEach(function (e) { if (e) seen[String(e).toLowerCase()] = 1; });
    (lists || []).forEach(function (l) { (l || []).forEach(function (e) { var k = String(e).toLowerCase(); if (e && !seen[k]) { seen[k] = 1; out.push(e); } }); });
    return out;
  }
  // Đường dẫn soạn sẵn email trong Gmail
  function gmailUrl(to, cc, subject, body) {
    return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to || '') + '&cc=' + encodeURIComponent((cc || []).join(',')) +
      '&su=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
  }
  function mailQuery(cc, subject, body) {
    return 'cc=' + encodeURIComponent((cc || []).join(',')) + '&subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
  }
  // Mở thẳng app Gmail trên iPhone
  function gmailAppUrl(to, cc, subject, body) {
    return 'googlegmail:///co?to=' + encodeURIComponent(to || '') + '&' + mailQuery(cc, subject, body);
  }
  // Mở app thư mặc định (thường là Gmail trên Android)
  function mailtoUrl(to, cc, subject, body) {
    return 'mailto:' + (to || '') + '?' + mailQuery(cc, subject, body);
  }
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
        cc: parseEmails(Array.isArray(p.cc) ? p.cc.join(',') : '') || [],
        cats: cats, services: services || []
      });
      if (p.cycle === 'week' || p.cycle === 'month') out[out.length - 1].cycle = p.cycle;
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

  // ---- Trạng thái đơn, tiền đã duyệt, hoa hồng ----
  // Đơn cũ chưa có trạng thái đơn được coi là đã chốt (Thành công).
  var ORDER_STATUSES = ['processing', 'success', 'cancelled'];
  var ORDER_STATUS_LABELS = { processing: 'Đang xử lý', success: 'Thành công', cancelled: 'Hủy' };
  function orderStatusOf(b) { return b && ORDER_STATUSES.indexOf(b.orderStatus) >= 0 ? b.orderStatus : 'success'; }
  // Phiếu thu cũ chưa có trạng thái được coi là đã duyệt.
  function isApproved(p) { return !!p && p.status !== 'pending'; }
  function paidOf(b) {
    return ((b && b.payments) || []).reduce(function (a, p) { return a + (isApproved(p) ? (Number(p.amount) || 0) : 0); }, 0);
  }
  function pendingOf(b) {
    return ((b && b.payments) || []).reduce(function (a, p) { return a + (isApproved(p) ? 0 : (Number(p.amount) || 0)); }, 0);
  }
  function commissionOf(b) {
    var c = b && b.commission;
    return c && Number(c.amount) > 0 ? Number(c.amount) : 0;
  }
  // Hoa hồng chỉ phải trả khi đơn đã Thành công.
  function commissionDue(b) { return orderStatusOf(b) === 'success' ? commissionOf(b) : 0; }
  function phoneKey(x) { return String(x == null ? '' : x).replace(/\D/g, ''); }
  function bookingCustomerId(b, customers) {
    if (b && b.customerId) return b.customerId;
    var k = phoneKey(b && b.phone);
    if (!k) return '';
    for (var i = 0; i < (customers || []).length; i++) if (phoneKey(customers[i].phone) === k) return customers[i].id;
    return '';
  }
  // Mỗi khách: doanh thu (đơn Thành công), đã thu (phiếu đã duyệt), công nợ, tiền nhận trước (đơn đang xử lý), tiền cần hoàn (đơn hủy)
  function customerLedger(bookings, customers) {
    var rows = {}, order = [];
    (customers || []).forEach(function (c) {
      rows[c.id] = { id: c.id, name: c.name, phone: c.phone || '', kind: c.kind || 'retail', note: c.note || '', orders: [], count: 0, revenue: 0, paid: 0, debt: 0, prepaid: 0, refundDue: 0 };
      order.push(c.id);
    });
    (bookings || []).forEach(function (b) {
      var id = bookingCustomerId(b, customers);
      if (!id || !rows[id]) return;
      var r = rows[id], st = orderStatusOf(b), paid = paidOf(b);
      r.orders.push(b.id); r.count++;
      if (st === 'success') { r.revenue += b.totalAmt || 0; r.paid += paid; r.debt += (b.totalAmt || 0) - paid; }
      else if (st === 'processing') r.prepaid += paid;
      else r.refundDue += paid;
    });
    return order.map(function (id) { return rows[id]; });
  }
  // Hoa hồng theo cộng tác viên (chỉ đơn Thành công)
  function commissionStats(bookings, customers) {
    var by = {}, order = [], total = 0, paid = 0;
    (bookings || []).forEach(function (b) {
      var amt = commissionDue(b);
      if (!(amt > 0)) return;
      var id = (b.commission && b.commission.ctvId) || '';
      if (!by[id]) {
        var c = null;
        for (var i = 0; i < (customers || []).length; i++) if (customers[i].id === id) c = customers[i];
        by[id] = { id: id, name: c ? c.name : 'Chưa chọn cộng tác viên', count: 0, total: 0, paid: 0, unpaid: 0, orders: [] };
        order.push(id);
      }
      var r = by[id], isPaid = !!(b.commission && b.commission.paid);
      r.count++; r.total += amt; r.orders.push(b.id);
      if (isPaid) { r.paid += amt; paid += amt; } else r.unpaid += amt;
      total += amt;
    });
    return { rows: order.map(function (id) { return by[id]; }), total: total, paid: paid, unpaid: total - paid };
  }

  // ---- Công nợ đối tác (mình nợ đối tác) ----
  // Giá net tính vào công nợ ngay khi tạo đơn (kể cả Đang xử lý); đơn Hủy thì bỏ.
  // Kỳ trả tính theo ngày đặt phòng (ngày tạo đơn). Đối tác không đặt chu kỳ thì mặc định theo tháng.
  var NO_PARTNER = '_none';
  function cycleOf(p) { return p && p.cycle === 'week' ? 'week' : 'month'; }
  function parseVnDate(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s == null ? '' : s).trim());
    if (!m) return null;
    var d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? d : null;
  }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dm(d) { return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); }
  function periodOf(d, cycle) {
    if (!d) return { key: 'x', label: 'Không rõ ngày đặt', start: 0 };
    if (cycle === 'week') {
      var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
      var sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      return { key: 'w' + ymd(mon), label: 'Tuần ' + dm(mon) + ' - ' + dm(sun) + '/' + sun.getFullYear(), start: mon.getTime() };
    }
    return { key: 'm' + d.getFullYear() + '-' + p2(d.getMonth() + 1), label: 'Tháng ' + p2(d.getMonth() + 1) + '/' + d.getFullYear(), start: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
  }
  function supPaidOf(b, key) {
    var r = b && b.supPaid && b.supPaid[key];
    return r && Number(r.amount) > 0 ? Number(r.amount) : 0;
  }
  // Mỗi đối tác: danh sách kỳ trả, mỗi kỳ có các đơn, số net phải trả và đã trả
  function supplierLedger(bookings, partners) {
    var rows = {}, order = [];
    (bookings || []).forEach(function (b) {
      var cancelled = orderStatusOf(b) === 'cancelled';
      var per = {};
      (b.svcs || []).forEach(function (s) {
        var key = s.partnerId || NO_PARTNER;
        if (!per[key]) per[key] = { net: 0, missing: 0, name: s.partner || '' };
        if (s.totalNet > 0) per[key].net += s.totalNet; else per[key].missing++;
        if (!per[key].name && s.partner) per[key].name = s.partner;
      });
      Object.keys(per).forEach(function (key) {
        var x = per[key], paid = supPaidOf(b, key);
        if (!x.net && !x.missing && !paid) return;
        var p = key === NO_PARTNER ? null : findPartner(partners, key);
        if (!rows[key]) {
          rows[key] = { id: key, name: p ? p.name : (key === NO_PARTNER ? 'Chưa chọn đối tác' : (x.name || 'Đối tác đã xóa')), cycle: cycleOf(p), periods: {}, plist: [], total: 0, paid: 0, owed: 0, refund: 0, missing: 0 };
          order.push(key);
        }
        var r = rows[key];
        if (cancelled) { r.refund += paid; return; }
        var pd = periodOf(parseVnDate(b.created), r.cycle);
        if (!r.periods[pd.key]) { r.periods[pd.key] = { key: pd.key, label: pd.label, start: pd.start, total: 0, paid: 0, owed: 0, missing: 0, orders: [] }; r.plist.push(r.periods[pd.key]); }
        var q = r.periods[pd.key];
        q.orders.push({ id: b.id, name: b.name, net: x.net, paid: paid, owed: x.net - paid, missing: x.missing });
        q.total += x.net; q.paid += paid; q.owed += x.net - paid; q.missing += x.missing;
        r.total += x.net; r.paid += paid; r.owed += x.net - paid; r.missing += x.missing;
      });
    });
    return order.map(function (k) {
      var r = rows[k]; r.plist.sort(function (a, b) { return b.start - a.start; }); delete r.periods; return r;
    }).sort(function (a, b) { return b.owed - a.owed; });
  }

  // ---- Nhập nhiều đơn từ file CSV (mỗi dòng một dịch vụ, các dòng cùng "Nhóm đơn" gộp thành một đơn) ----
  var IMPORT_HEAD = ['Nhóm đơn', 'Mã tham chiếu', 'Tên khách', 'SĐT', 'Ngày tạo đơn', 'Trạng thái đơn', 'Đã thu', 'Cộng tác viên', 'Hoa hồng', 'Hoa hồng đã trả',
    'Loại dịch vụ', 'Đối tác', 'Tên dịch vụ', 'Ngày đi hoặc nhận phòng', 'Ngày về hoặc trả phòng', 'Chiều (Một chiều hoặc Khứ hồi)', 'Đơn vị',
    'Số lượng', 'Giá bán', 'Giá net', 'SL người lớn', 'Giá bán người lớn', 'Net người lớn', 'SL trẻ em', 'Giá bán trẻ em', 'Net trẻ em', 'SL cao tuổi', 'Giá bán cao tuổi', 'Net cao tuổi', 'Ghi chú'];
  var IMPORT_REQUIRED = ['Tên khách', 'SĐT', 'Loại dịch vụ', 'Đối tác', 'Tên dịch vụ'];
  var IMPORT_MAX_ROWS = 1000;
  function normTxt(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  // Đọc CSV: tự nhận dấu ngăn cột (phẩy, chấm phẩy, tab), có ngoặc kép, bỏ BOM
  function parseCsv(text) {
    var t = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    var first = t.split(/\r?\n/)[0] || '';
    var sep = ',', best = (first.match(/,/g) || []).length, semi = (first.match(/;/g) || []).length, tab = (first.match(/\t/g) || []).length;
    if (semi > best) { sep = ';'; best = semi; }
    if (tab > best) { sep = '\t'; }
    var rows = [], row = [], cell = '', q = false, i = 0, c;
    for (; i < t.length; i++) {
      c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        row.push(cell); cell = ''; rows.push(row); row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function csvCellOut(v) { var s = String(v == null ? '' : v); return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function importTemplateRows(cats, partners) {
    cats = cats && cats.length ? cats : DEFAULT_CATS;
    var none = null, grp = null;
    // Ưu tiên loại đã có đối tác để dòng ví dụ chạy thử được ngay
    var hasP = function (c) { return partnersForCat(partners, c.id).length > 0; };
    [true, false].forEach(function (needP) {
      cats.forEach(function (c) {
        if (needP && !hasP(c)) return;
        if (!none && c.people === 'none') none = c;
        if (!grp && c.people !== 'none') grp = c;
      });
    });
    var pn = function (c) { var l = c ? partnersForCat(partners, c.id) : []; return l.length ? l[0].name : 'Tên đối tác'; };
    var rows = [IMPORT_HEAD.slice()];
    var blank = function () { return IMPORT_HEAD.map(function () { return ''; }); };
    var set = function (r, k, v) { r[IMPORT_HEAD.indexOf(k)] = v; return r; };
    if (none) {
      var r1 = blank();
      set(r1, 'Nhóm đơn', 'VD1'); set(r1, 'Mã tham chiếu', 'SHEET-001'); set(r1, 'Tên khách', 'VÍ DỤ Nguyễn Văn A'); set(r1, 'SĐT', '0901234567');
      set(r1, 'Ngày tạo đơn', '25/11/2026'); set(r1, 'Trạng thái đơn', 'Thành công'); set(r1, 'Đã thu', '500000'); set(r1, 'Cộng tác viên', 'Tên CTV'); set(r1, 'Hoa hồng', '100000'); set(r1, 'Hoa hồng đã trả', 'Đã trả');
      set(r1, 'Loại dịch vụ', none.name); set(r1, 'Đối tác', pn(none)); set(r1, 'Tên dịch vụ', 'Deluxe Sea View');
      set(r1, 'Ngày đi hoặc nhận phòng', '251226'); set(r1, 'Ngày về hoặc trả phòng', '271226'); set(r1, 'Đơn vị', 'phòng');
      set(r1, 'Số lượng', '1'); set(r1, 'Giá bán', '1200000'); set(r1, 'Giá net', '900000'); set(r1, 'Ghi chú', 'Ghi chú nếu có');
      rows.push(r1);
    }
    if (grp) {
      var r2 = blank();
      set(r2, 'Nhóm đơn', 'VD1'); set(r2, 'Loại dịch vụ', grp.name); set(r2, 'Đối tác', pn(grp)); set(r2, 'Tên dịch vụ', 'Vé vui chơi ví dụ');
      set(r2, 'Ngày đi hoặc nhận phòng', '261226'); set(r2, 'Đơn vị', 'vé');
      set(r2, 'SL người lớn', '2'); set(r2, 'Giá bán người lớn', '880000'); set(r2, 'Net người lớn', '700000');
      set(r2, 'SL trẻ em', '1'); set(r2, 'Giá bán trẻ em', '650000'); set(r2, 'Net trẻ em', '500000');
      rows.push(r2);
    }
    return rows;
  }
  // Có dấu BOM để Excel hiểu tiếng Việt; xuống dòng kiểu Windows
  function importTemplateCsv(cats, partners) {
    return '\uFEFF' + importTemplateRows(cats, partners).map(function (r) { return r.map(csvCellOut).join(','); }).join('\r\n');
  }
  function moneyOf(s) { var d = String(s == null ? '' : s).replace(/\D/g, ''); return d ? parseInt(d, 10) : null; }
  // dd/mm/yyyy, d/m/yy, dd-mm-yyyy, dd.mm.yyyy -> dd/mm/yyyy; null nếu sai
  function normCreated(s) {
    var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/.exec(String(s == null ? '' : s).trim());
    if (!m) return null;
    var y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    var d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (d.getFullYear() !== y || d.getMonth() !== parseInt(m[2], 10) - 1 || d.getDate() !== parseInt(m[1], 10)) return null;
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + y;
  }
  // 251126, 25/11/26, 25/11/2026 -> 251126 (Excel hay làm mất số 0 đầu nên bù lại)
  function normDate6(s) {
    var raw = String(s == null ? '' : s).trim();
    if (!raw) return '';
    var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/.exec(raw);
    if (m) return p2(+m[1]) + p2(+m[2]) + m[3].slice(-2);
    var d = raw.replace(/\D/g, '');
    if (d.length === 5) d = '0' + d;
    if (d.length === 8) d = d.slice(0, 4) + d.slice(6);
    return d;
  }
  var STATUS_WORDS = { 'đang xử lý': 'processing', 'dang xu ly': 'processing', 'processing': 'processing', 'thành công': 'success', 'thanh cong': 'success', 'success': 'success', 'hủy': 'cancelled', 'huỷ': 'cancelled', 'đã hủy': 'cancelled', 'đã huỷ': 'cancelled', 'huy': 'cancelled', 'cancelled': 'cancelled' };
  // rows: mảng các dòng đã đọc từ CSV (dòng đầu là tiêu đề). ctx: {cats, partners, today}
  function buildImport(rows, ctx) {
    var out = { orders: [], errors: [], skipped: 0, fatal: '' };
    if (!rows || !rows.length) { out.fatal = 'File trống.'; return out; }
    var idx = {};
    rows[0].forEach(function (h, i) { var k = normTxt(h); if (k && idx[k] === undefined) idx[k] = i; });
    var col = {};
    IMPORT_HEAD.forEach(function (h) { col[h] = idx[normTxt(h)]; });
    var miss = IMPORT_REQUIRED.filter(function (h) { return col[h] === undefined; });
    if (miss.length) { out.fatal = 'File chưa đúng mẫu, thiếu cột: ' + miss.join(', ') + '. Hãy tải lại file mẫu.'; return out; }
    if (rows.length - 1 > IMPORT_MAX_ROWS) { out.fatal = 'File có quá ' + IMPORT_MAX_ROWS + ' dòng. Chia nhỏ rồi nhập từng phần.'; return out; }
    var cats = ctx.cats || DEFAULT_CATS, partners = ctx.partners || [];
    var byGroup = {}, order = [], skipG = {};
    var get = function (r, h) { var i = col[h]; return i === undefined ? '' : String(r[i] == null ? '' : r[i]).trim(); };
    for (var li = 1; li < rows.length; li++) {
      var r = rows[li], line = li + 1;
      if (!r.some(function (x) { return String(x).trim() !== ''; })) continue;
      var nm = get(r, 'Tên khách');
      var g = get(r, 'Nhóm đơn') || ('#dòng' + line), o = byGroup[g], fresh = !o;
      if (normTxt(nm).indexOf('ví dụ') === 0) { skipG[g] = 1; out.skipped++; continue; }
      if (skipG[g] && !nm) { out.skipped++; continue; }
      var err = function (m) { out.errors.push({ line: line, msg: m }); if (o) o.bad = true; };
      if (fresh) {
        o = byGroup[g] = { group: g, line: line, bad: false, svcs: [], lines: [] };
        order.push(o);
        var phone = get(r, 'SĐT');
        if (!nm) err('Thiếu tên khách.');
        else if (nm.length > 100 || /[<>]/.test(nm)) err('Tên khách không hợp lệ (tối đa 100 ký tự, không dùng < >).');
        if (!phone || !validPhone(phone) || phone.length > 30) err('SĐT thiếu hoặc không hợp lệ.');
        var created = get(r, 'Ngày tạo đơn') ? normCreated(get(r, 'Ngày tạo đơn')) : (ctx.today || '');
        if (!created) err('Ngày tạo đơn chưa đúng (dạng dd/mm/yyyy).');
        var stw = get(r, 'Trạng thái đơn'), st = stw ? STATUS_WORDS[normTxt(stw)] : 'success';
        if (!st) err('Trạng thái đơn chỉ nhận: Đang xử lý, Thành công, Hủy.');
        var ref = get(r, 'Mã tham chiếu');
        if (ref.length > 40 || /[<>]/.test(ref)) err('Mã tham chiếu tối đa 40 ký tự, không dùng < >.');
        var paid = moneyOf(get(r, 'Đã thu')) || 0, comm = moneyOf(get(r, 'Hoa hồng')) || 0, ctvName = get(r, 'Cộng tác viên');
        if (ctvName.length > 100 || /[<>]/.test(ctvName)) err('Tên cộng tác viên không hợp lệ.');
        if (comm > 0 && !ctvName) err('Có hoa hồng nhưng chưa ghi tên cộng tác viên.');
        o.name = nm; o.phone = phone; o.created = created; o.orderStatus = st || 'success'; o.ref = ref; o.paid = paid;
        o.ctvName = ctvName; o.commission = comm; o.commissionPaid = /^(đã trả|da tra|có|co|x|yes|1)$/.test(normTxt(get(r, 'Hoa hồng đã trả')));
      }
      o.lines.push(line);
      var cname = get(r, 'Loại dịch vụ'), cat = null;
      cats.forEach(function (c) { if (!cat && normTxt(c.name) === normTxt(cname)) cat = c; });
      if (!cat) { err('Loại dịch vụ "' + cname + '" chưa có trong Cài đặt > Loại dịch vụ.'); continue; }
      var pname = get(r, 'Đối tác'), pt = null;
      partners.forEach(function (p) { if (!pt && normTxt(p.name) === normTxt(pname)) pt = p; });
      if (!pt) { err('Đối tác "' + pname + '" chưa có trong Cài đặt > Đối tác.'); continue; }
      var f = { catId: cat.id, catName: cat.name, partnerId: pt.id, partner: pt.name, note: get(r, 'Ghi chú'), dateMode: cat.dateMode, people: cat.people,
        name: get(r, 'Tên dịch vụ'), dateIn: normDate6(get(r, 'Ngày đi hoặc nhận phòng')), dateOut: normDate6(get(r, 'Ngày về hoặc trả phòng')),
        trip: /khứ|khu hoi|round/.test(normTxt(get(r, 'Chiều (Một chiều hoặc Khứ hồi)'))) ? 'round' : 'oneway', unit: get(r, 'Đơn vị') };
      if (cat.people === 'none') {
        f.qty = get(r, 'Số lượng'); f.price = moneyOf(get(r, 'Giá bán')); f.net = moneyOf(get(r, 'Giá net'));
      } else {
        f.lines = {};
        [['al', 'người lớn'], ['tre', 'trẻ em'], ['nct', 'cao tuổi']].forEach(function (k) {
          f.lines[k[0]] = { qty: get(r, 'SL ' + k[1]), price: get(r, 'Giá bán ' + k[1]) === '' ? '' : moneyOf(get(r, 'Giá bán ' + k[1])), net: moneyOf(get(r, 'Net ' + k[1])) };
        });
      }
      var b = buildService(f);
      if (!b.ok) { err(b.error); continue; }
      o.svcs.push(b.svc);
    }
    order.forEach(function (o) {
      if (!o.bad && !o.svcs.length) { out.errors.push({ line: o.line, msg: 'Đơn không có dịch vụ nào.' }); o.bad = true; }
      if (!o.bad) {
        o.totalAmt = o.svcs.reduce(function (a, s) { return a + (s.total || 0); }, 0);
        if (o.paid > o.totalAmt) { out.errors.push({ line: o.line, msg: 'Đã thu (' + o.paid + ') lớn hơn tổng đơn (' + o.totalAmt + ').' }); o.bad = true; }
      }
      if (!o.bad) out.orders.push(o);
    });
    out.badOrders = order.filter(function (o) { return o.bad; }).length;
    return out;
  }

  // ---- Thống kê theo loại ----
  function statsByCat(bookings, cats) {
    var rows = {}, order = [];
    (bookings || []).forEach(function (b) {
      if (orderStatusOf(b) === 'cancelled') return;
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
  var CSV_HEAD = ['Mã đơn', 'Ngày tạo', 'Khách', 'SĐT', 'Trạng thái', 'Loại dịch vụ', 'Dịch vụ', 'Nhóm', 'Chiều', 'Ngày đi', 'Ngày về', 'Số lượng', 'Đơn giá bán', 'Thành tiền', 'Đơn giá net', 'Tổng net', 'Tổng đơn', 'Đã thu', 'Còn lại', 'Trạng thái đơn', 'Hoa hồng', 'Hoa hồng đã trả'];
  function legacyQty(l) {
    var t = (l.qty + ' ' + (l.unit || '')).trim();
    if (l.qty2 != null && l.unit2 !== 'đêm') t += ' x ' + l.qty2 + ' ' + (l.unit2 || '');
    return t.trim();
  }
  function csvRows(bookings, statusLabels, cats) {
    var rows = [CSV_HEAD.slice()];
    (bookings || []).forEach(function (b) {
      var paid = paidOf(b);
      var st = (statusLabels && statusLabels[b.status]) || b.status;
      var os = ORDER_STATUS_LABELS[orderStatusOf(b)], hh = commissionOf(b) || '', hhPaid = commissionOf(b) ? (b.commission.paid ? 'Đã trả' : 'Chưa trả') : '';
      var svcs = b.svcs && b.svcs.length ? b.svcs : [null];
      svcs.forEach(function (s) {
        if (!s) { rows.push([b.id, b.created, b.name, b.phone, st, '', '', '', '', '', '', '', '', '', '', '', b.totalAmt, paid, b.totalAmt - paid, os, hh, hhPaid]); return; }
        var chieu = s.trip === 'round' ? 'Khứ hồi' : s.trip === 'oneway' ? 'Một chiều' : '';
        svcLines(s).forEach(function (l) {
          var qtyTxt = l.key ? (l.qty + ' ' + (l.unit || '')).trim() : (l.qty ? legacyQty(l) : '');
          rows.push([b.id, b.created, b.name, b.phone, st, catNameOf(s, cats), s.name || '', l.label || '', chieu, s.dateIn || '', s.dateOut || '', qtyTxt,
            l.price == null ? '' : l.price, l.total || '', l.net || '', l.totalNet || '', b.totalAmt, paid, b.totalAmt - paid, os, hh, hhPaid]);
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
    ORDER_STATUSES: ORDER_STATUSES, ORDER_STATUS_LABELS: ORDER_STATUS_LABELS, orderStatusOf: orderStatusOf, isApproved: isApproved, paidOf: paidOf, pendingOf: pendingOf,
    IMPORT_HEAD: IMPORT_HEAD, parseCsv: parseCsv, importTemplateRows: importTemplateRows, importTemplateCsv: importTemplateCsv, buildImport: buildImport, normCreated: normCreated, normDate6: normDate6,
    NO_PARTNER: NO_PARTNER, cycleOf: cycleOf, parseVnDate: parseVnDate, periodOf: periodOf, supPaidOf: supPaidOf, supplierLedger: supplierLedger,
    commissionOf: commissionOf, commissionDue: commissionDue, bookingCustomerId: bookingCustomerId, customerLedger: customerLedger, commissionStats: commissionStats,
    NOTE_MAX: NOTE_MAX, cleanText: cleanText, validPhone: validPhone, validEmail: validEmail, validPartnerName: validPartnerName,
    parseServices: parseServices, parseEmails: parseEmails, mergeEmails: mergeEmails, gmailUrl: gmailUrl, gmailAppUrl: gmailAppUrl, mailtoUrl: mailtoUrl, normalizePartners: normalizePartners, partnersForCat: partnersForCat, findPartner: findPartner
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BK = api;
})(typeof window !== 'undefined' ? window : this);
