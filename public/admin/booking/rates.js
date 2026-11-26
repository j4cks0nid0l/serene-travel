/* Bảng giá net khách sạn: tính giá theo đêm qua nhiều mùa, gợi ý đối tác rẻ nhất,
   nhập hàng loạt từ CSV và đọc file Commitment. Chạy được cả trình duyệt (RT) lẫn node (test). */
(function (root) {
  'use strict';

  var MIN_NET = 50000, MAX_NET = 100000000, MAX_ROWS = 600, NOTE_MAX = 2000;
  var NO_P = '_none';

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function dmy(s) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function parseDmy(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s == null ? '' : s).trim());
    if (!m) return null;
    var d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? ymd(d) : null;
  }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
  }
  function key(name) { return String(name == null ? '' : name).trim().toLowerCase().replace(/\s+/g, ' '); }
  function txt(x, max) {
    if (x == null) return '';
    var y = String(x).trim().replace(/\s+/g, ' ');
    return y.length > max || /[<>]/.test(y) ? null : y;
  }
  // "2.148.000" hoặc "2,148,000" hoặc "2148000" -> số nguyên; chữ lẫn vào thì bỏ
  function parseMoney(s) {
    var t = String(s == null ? '' : s).trim();
    if (!/^\d{1,3}([.,]\d{3})+$|^\d{5,9}$/.test(t)) return null;
    return parseInt(t.replace(/[.,]/g, ''), 10);
  }

  // ---- Làm sạch một danh sách dòng giá ----
  // dòng: {p:'' hoặc id đối tác, room, label, from:'YYYY-MM-DD', to, net, sat:null hoặc số}
  function cleanRows(v) {
    if (!Array.isArray(v) || v.length > MAX_ROWS) return null;
    var out = [];
    for (var i = 0; i < v.length; i++) {
      var r = v[i];
      if (!r || typeof r !== 'object') return null;
      var room = txt(r.room, 120), label = txt(r.label, 60), p = r.p == null ? '' : String(r.p);
      if (!room || label === null || (p && !/^[A-Za-z0-9_-]{1,40}$/.test(p))) return null;
      var f = parseYmd(r.from), t = parseYmd(r.to);
      if (!f || !t || f > t) return null;
      var net = Number(r.net);
      if (!Number.isInteger(net) || net < 1 || net > MAX_NET) return null;
      var sat = null;
      if (r.sat != null && r.sat !== '') { sat = Number(r.sat); if (!Number.isInteger(sat) || sat < 1 || sat > MAX_NET) return null; }
      out.push({ p: p, room: room, label: label, from: r.from, to: r.to, net: net, sat: sat });
    }
    return out;
  }

  // ---- Giá một đêm ----
  function nightPrice(row, d) { return row.sat != null && d.getDay() === 6 ? row.sat : row.net; }

  // Tính tiền net cho một đối tác, một hạng phòng, từ ngày nhận đến ngày trả (đêm trả phòng không tính)
  // Nếu một đêm trùng nhiều dòng (hai mùa chồng ngày) thì lấy giá thấp nhất.
  function quote(rows, partnerKey, room, inYmd, outYmd) {
    var a = parseYmd(inYmd), b = parseYmd(outYmd), rk = key(room);
    var res = { total: 0, nights: 0, missing: [], perNight: [] };
    if (!a || !b || b <= a) return res;
    var mine = rows.filter(function (r) { return (r.p || NO_P) === partnerKey && key(r.room) === rk; });
    for (var d = new Date(a); d < b; d.setDate(d.getDate() + 1)) {
      var s = ymd(d), best = null;
      for (var i = 0; i < mine.length; i++) {
        if (mine[i].from <= s && s <= mine[i].to) { var pr = nightPrice(mine[i], d); if (best == null || pr < best) best = pr; }
      }
      res.nights++;
      if (best == null) res.missing.push(s); else { res.total += best; res.perNight.push(best); }
    }
    return res;
  }

  function roomsOf(rows) {
    var seen = {}, out = [];
    rows.forEach(function (r) { var k = key(r.room); if (!seen[k]) { seen[k] = 1; out.push(r.room); } });
    return out;
  }
  // Tìm hạng phòng khớp chữ gõ vào: khớp đúng, rồi đến chứa nhau. Không chắc thì trả null.
  function matchRoom(rows, q) {
    var k = key(q); if (!k) return null;
    var rooms = roomsOf(rows), i;
    for (i = 0; i < rooms.length; i++) if (key(rooms[i]) === k) return rooms[i];
    var hit = rooms.filter(function (r) { var x = key(r); return x.indexOf(k) >= 0 || k.indexOf(x) >= 0; });
    return hit.length === 1 ? hit[0] : null;
  }

  // Gợi ý: mọi đối tác có giá cho hạng phòng, rẻ nhất lên đầu. Đối tác thiếu đêm xếp sau.
  // Trả {room, options:[{p,total,nights,missing,avg,exactAvg}], best}
  function suggest(rows, room, inYmd, outYmd) {
    var rk = key(room), keys = [], seen = {};
    rows.forEach(function (r) { var k = r.p || NO_P; if (key(r.room) === rk && !seen[k]) { seen[k] = 1; keys.push(k); } });
    var options = keys.map(function (k) {
      var q = quote(rows, k, room, inYmd, outYmd);
      return { p: k, total: q.total, nights: q.nights, missing: q.missing.length, avg: q.nights - q.missing.length ? Math.round(q.total / (q.nights - q.missing.length)) : 0,
        exactAvg: q.nights > 0 && q.missing.length === 0 && q.total % q.nights === 0 };
    });
    options.sort(function (x, y) { return (x.missing > 0) - (y.missing > 0) || x.total - y.total; });
    return { room: room, options: options, best: options.length && options[0].missing === 0 ? options[0] : null };
  }

  // ---- CSV nhập hàng loạt ----
  var HEAD = ['Khách sạn', 'Địa chỉ', 'Hotline', 'Đối tác', 'Hạng phòng', 'Tên mùa', 'Từ ngày', 'Đến ngày', 'Giá net 1 đêm', 'Giá net đêm thứ 7', 'Ghi chú khách sạn'];

  function csvCell(v) { var s = v == null ? '' : String(v); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }

  function exportRows(recs, partners) {
    var nameOf = {}; (partners || []).forEach(function (p) { nameOf[p.id] = p.name; });
    var out = [HEAD];
    recs.forEach(function (h) {
      (h.rows || []).forEach(function (r, i) {
        out.push([h.name, i ? '' : (h.address || ''), i ? '' : (h.phone || ''), r.p ? (nameOf[r.p] || '') : '', r.room, r.label, dmy(r.from), dmy(r.to), r.net, r.sat == null ? '' : r.sat, i ? '' : (h.note || '')]);
      });
    });
    return out;
  }
  function templateCsv() {
    return toCsv([HEAD,
      ['VÍ DỤ Khách sạn A', '1 Đường B, Nha Trang', '0258 000 000', '', 'Deluxe Sea View', 'Thấp điểm', '01/01/2027', '31/03/2027', 1200000, '', 'VÍ DỤ: trẻ dưới 6 tuổi miễn phí, phụ thu giường phụ 400.000đ'],
      ['VÍ DỤ Khách sạn A', '', '', '', 'Deluxe Sea View', 'Cao điểm', '01/04/2027', '31/08/2027', 1500000, 1700000, ''],
      ['VÍ DỤ Khách sạn A', '', '', '', 'Suite', 'Thấp điểm', '01/01/2027', '31/03/2027', 2400000, '', '']]);
  }

  // rows: mảng các mảng (kết quả parseCsv). Dòng đầu là tiêu đề. Dòng có "VÍ DỤ" ở cột khách sạn bị bỏ qua.
  // opts: {partners, defaultPartner}. Trả {items:[{name,address,phone,note,rows}], errors:[{line,msg}], fatal}
  function buildRates(rows, opts) {
    opts = opts || {};
    var partners = opts.partners || [], res = { items: [], errors: [], fatal: '' };
    if (!rows || !rows.length) { res.fatal = 'File trống.'; return res; }
    var head = rows[0].map(function (c) { return String(c || '').trim().replace(/^﻿/, ''); });
    var ix = {}; HEAD.forEach(function (h) { ix[h] = head.indexOf(h); });
    var need = ['Khách sạn', 'Hạng phòng', 'Từ ngày', 'Đến ngày', 'Giá net 1 đêm'];
    for (var n = 0; n < need.length; n++) if (ix[need[n]] < 0) { res.fatal = 'Thiếu cột "' + need[n] + '". Hãy dùng đúng file mẫu.'; return res; }
    var pByName = {}; partners.forEach(function (p) { pByName[key(p.name)] = p.id; });
    var byHotel = {}, order = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i], line = i + 1;
      var g = function (h) { return ix[h] < 0 ? '' : String(r[ix[h]] == null ? '' : r[ix[h]]).trim(); };
      if (!r.some(function (c) { return String(c || '').trim(); })) continue;
      var hn = g('Khách sạn');
      if (/^VÍ DỤ/i.test(hn)) continue;
      if (!hn) { res.errors.push({ line: line, msg: 'Thiếu tên khách sạn' }); continue; }
      var nm = txt(hn, 120); if (!nm) { res.errors.push({ line: line, msg: 'Tên khách sạn quá dài hoặc có ký tự < >' }); continue; }
      var pn = g('Đối tác'), pid = '';
      if (pn) { pid = pByName[key(pn)]; if (!pid) { res.errors.push({ line: line, msg: 'Chưa có đối tác "' + pn + '" trong phần mềm' }); continue; } }
      else if (opts.defaultPartner) pid = opts.defaultPartner;
      var f = parseDmy(g('Từ ngày')), t = parseDmy(g('Đến ngày'));
      if (!f || !t) { res.errors.push({ line: line, msg: 'Ngày phải dạng dd/mm/yyyy' }); continue; }
      if (f > t) { res.errors.push({ line: line, msg: 'Ngày bắt đầu sau ngày kết thúc' }); continue; }
      var net = parseMoney(g('Giá net 1 đêm')) || (/^\d{5,9}$/.test(g('Giá net 1 đêm')) ? parseInt(g('Giá net 1 đêm'), 10) : null);
      if (!net || net < MIN_NET || net > MAX_NET) { res.errors.push({ line: line, msg: 'Giá net không hợp lệ' }); continue; }
      var sat = null, st = g('Giá net đêm thứ 7');
      if (st) { sat = parseMoney(st) || (/^\d{5,9}$/.test(st) ? parseInt(st, 10) : null); if (!sat || sat < MIN_NET || sat > MAX_NET) { res.errors.push({ line: line, msg: 'Giá đêm thứ 7 không hợp lệ' }); continue; } }
      var room = txt(g('Hạng phòng'), 120); if (!room) { res.errors.push({ line: line, msg: 'Thiếu hoặc sai hạng phòng' }); continue; }
      var label = txt(g('Tên mùa'), 60); if (label === null) { res.errors.push({ line: line, msg: 'Tên mùa quá dài' }); continue; }
      var hk = key(nm), h = byHotel[hk];
      if (!h) { h = byHotel[hk] = { name: nm, address: '', phone: '', note: '', rows: [] }; order.push(hk); }
      if (!h.address && g('Địa chỉ')) h.address = g('Địa chỉ').slice(0, 200);
      if (!h.phone && g('Hotline')) h.phone = g('Hotline').slice(0, 80);
      if (!h.note && g('Ghi chú khách sạn')) h.note = g('Ghi chú khách sạn').slice(0, NOTE_MAX);
      h.rows.push({ p: pid, room: room, label: label, from: f, to: t, net: net, sat: sat });
    }
    order.forEach(function (k) {
      var h = byHotel[k];
      var seen = {}, dup = false;
      h.rows = h.rows.filter(function (x) { var s = [x.p, key(x.room), x.from, x.to].join('|'); if (seen[s]) { dup = true; return false; } seen[s] = 1; return true; });
      if (dup) res.errors.push({ line: 0, msg: h.name + ': có dòng trùng (cùng đối tác, hạng phòng, khoảng ngày), đã giữ dòng đầu' });
      if (h.rows.length > MAX_ROWS) { res.errors.push({ line: 0, msg: h.name + ': quá ' + MAX_ROWS + ' dòng giá' }); return; }
      res.items.push(h);
    });
    return res;
  }

  // ---- Đọc file Commitment (bản xuất text, mỗi sheet bắt đầu bằng "## Sheet name: ...") ----
  function parseCsvText(text) {
    var rows = [], row = [], cell = '', q = false, i = 0, c;
    text = String(text).replace(/\r\n?/g, '\n');
    for (; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  // "01/12/2026 - 22/12/2026", "01.12.26 - 22.12.26", "09/11 - 15/12/2026" (thiếu năm đầu thì lấy năm cuối)
  var D = '(\\d{1,2})[./](\\d{1,2})';
  var RANGE = new RegExp(D + '(?:[./](\\d{4}|\\d{2}))?\\s*(?:-|–|—|đến|to)\\s*' + D + '[./](\\d{4}|\\d{2})(?!\\d)', 'g');
  function mk(d, m, y) { y = String(y); if (y.length === 2) y = '20' + y; return parseDmy(d + '/' + m + '/' + y); }
  function seasonOf(cell) {
    var ranges = [], m, c = String(cell || '');
    RANGE.lastIndex = 0;
    while ((m = RANGE.exec(c))) {
      var endYmd = mk(m[4], m[5], m[6]);
      if (!endYmd) return { bad: true };
      var endY = +endYmd.slice(0, 4), f;
      if (m[3]) f = mk(m[1], m[2], m[3]);
      else { f = mk(m[1], m[2], endY); if (f && f > endYmd) f = mk(m[1], m[2], endY - 1); }
      if (!f || f > endYmd) return { bad: true };
      ranges.push([f, endYmd]);
    }
    if (!ranges.length) return null;
    // còn ngày lẻ mà không đọc được thành khoảng thì không chắc, bỏ cả bảng
    var rest = c.replace(RANGE, ' ');
    if (/\b\d{1,2}[./]\d{1,2}(?![\d])/.test(rest)) return { bad: true };
    var label = rest.split('\n').map(function (s) { return s.replace(/[:\-–,]+$/, '').trim(); }).filter(Boolean)[0] || '';
    return { label: label.slice(0, 60), ranges: ranges };
  }
  var HDR = /^(hạng|loại)\s*phòng/i;

  // Cảnh báo khi mùa chồng ngày (cùng hạng phòng, giá khác nhau) hoặc một khoảng dài quá 13 tháng
  function overlapWarn(list) {
    var by = {}, i, j;
    list.forEach(function (r) { (by[key(r.room)] = by[key(r.room)] || []).push(r); });
    for (var k in by) {
      var a = by[k];
      for (i = 0; i < a.length; i++) {
        if ((parseYmd(a[i].to) - parseYmd(a[i].from)) / 86400000 > 400) return 'Có mùa dài hơn 13 tháng (nghi sai năm)';
        for (j = i + 1; j < a.length; j++) if (a[i].from <= a[j].to && a[j].from <= a[i].to) return 'Có mùa chồng ngày nhau (hạng "' + a[i].room + '")';
      }
    }
    return '';
  }
  function parseSheet(name, body) {
    var rows = parseCsvText(body), info = { name: name, address: '', phone: '', updated: '' }, i;
    for (i = 0; i < Math.min(rows.length, 14); i++) {
      var k = String(rows[i][0] || '').trim().toLowerCase(), v = String(rows[i][1] || '').trim();
      if (k.indexOf('tên ks') === 0 && v) info.name = v;
      else if (k.indexOf('địa chỉ') === 0) info.address = v;
      else if (k === 'hotline') info.phone = v;
      else if (k.indexOf('ngày update') === 0) info.updated = v;
    }
    var heads = [];
    rows.forEach(function (r, idx) { if (HDR.test(String(r[0] || '').trim())) heads.push(idx); });
    if (!heads.length) return { info: info, tables: [], why: 'Không thấy bảng "Hạng phòng"' };
    var tables = [], whys = [];
    heads.forEach(function (hi) {
      var hr = rows[hi], cols = [], bad = false;
      for (var c = 1; c < hr.length; c++) {
        var s = seasonOf(hr[c]);
        if (s && s.bad) { bad = true; break; }
        if (s) cols.push({ c: c, s: s });
      }
      if (bad) { whys.push('Ngày ở tiêu đề mùa không rõ'); return; }
      if (!cols.length) { whys.push('Tiêu đề mùa không có ngày dạng dd/mm/yyyy'); return; }
      var out = [], end = rows.length;
      for (var r = hi + 1; r < rows.length; r++) {
        var rr = rows[r], room = String(rr[0] || '').trim();
        if (!room && r === hi + 1 && !rr.some(function (x) { return String(x || '').trim(); })) continue; // dòng trống ngay dưới tiêu đề
        if (!room) { end = r; break; }
        var any = false;
        cols.forEach(function (col) {
          var net = parseMoney(rr[col.c]);
          if (net == null || net < MIN_NET || net > MAX_NET) return;
          any = true;
          col.s.ranges.forEach(function (rg) { out.push({ p: '', room: room.replace(/\s+/g, ' ').slice(0, 120), label: col.s.label, from: rg[0], to: rg[1], net: net, sat: null }); });
        });
        if (!any) { end = r; break; }
      }
      if (out.length) tables.push({ rows: out, endRow: end, warn: overlapWarn(out) }); else whys.push('Bảng không có dòng giá đọc được');
    });
    var note = '';
    if (tables.length) {
      var from = tables[tables.length - 1].endRow;
      note = rows.slice(from).map(function (r) { return r.filter(Boolean).join(' ').trim(); }).filter(Boolean).join('\n').replace(/[<>]/g, '').slice(0, NOTE_MAX);
    }
    return { info: info, tables: tables, note: note, why: whys.join('; ') };
  }

  // Trả {ok:[hotel], review:[hotel], skipped:[{sheet,why}]}
  // ok: đúng một bảng giá đọc được. review: nhiều bảng (nhiều chương trình), cần bạn xem trước khi nhập.
  function parseCommitment(text) {
    var parts = String(text).split(/^## Sheet name: (.*)$/m), res = { ok: [], review: [], skipped: [] };
    for (var i = 1; i < parts.length; i += 2) {
      var nm = parts[i].trim(), r = parseSheet(nm, parts[i + 1]);
      if (!r.tables.length) {
        // sheet đầu file (DANH MỤC...) và sheet không phải khách sạn nằm ở đây, không phải lỗi
        if (/^(danh mục|thông tin serene|code chủ|giá ks tóm tắt|voucher)/i.test(nm)) continue;
        res.skipped.push({ sheet: nm, why: r.why }); continue;
      }
      var hotel = { name: r.info.name, address: r.info.address, phone: r.info.phone, updated: r.info.updated, note: r.note, sheet: nm, rows: [], tables: r.tables.length, warn: [] };
      r.tables.forEach(function (t) { hotel.rows = hotel.rows.concat(t.rows); if (t.warn) hotel.warn.push(t.warn); });
      if (r.tables.length > 1) hotel.warn.push('Có ' + r.tables.length + ' bảng giá (nhiều chương trình), cần chọn bảng đúng');
      if (r.why) hotel.warn.push('Có bảng khác trong sheet không đọc được: ' + r.why);
      if (!hotel.warn.length) { var cw = overlapWarn(hotel.rows); if (cw) hotel.warn.push(cw); }
      (hotel.warn.length ? res.review : res.ok).push(hotel);
    }
    return res;
  }

  var api = {
    MIN_NET: MIN_NET, NO_P: NO_P, HEAD: HEAD, key: key, dmy: dmy, parseDmy: parseDmy, parseMoney: parseMoney,
    cleanRows: cleanRows, nightPrice: nightPrice, quote: quote, roomsOf: roomsOf, matchRoom: matchRoom, suggest: suggest,
    toCsv: toCsv, exportRows: exportRows, templateCsv: templateCsv, buildRates: buildRates,
    parseCsvText: parseCsvText, parseSheet: parseSheet, parseCommitment: parseCommitment
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RT = api;
})(typeof window !== 'undefined' ? window : this);
