/* Đọc và tạo file Excel (.xlsx) ngay trong trình duyệt, không cần thư viện ngoài.
   Đọc: sheet đầu tiên thành mảng các dòng (chữ). Ngày trong Excel đổi thành dd/mm/yyyy.
   Tạo: file có tiêu đề, ô chọn từ danh sách, cột định dạng văn bản. */
(function (root) {
  'use strict';

  var MAX_UNZIP = 30 * 1024 * 1024;

  // ---------- Giải nén zip ----------
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
  function utf8(bytes) { return new TextDecoder('utf-8').decode(bytes); }

  async function inflateRaw(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Trả về {tên: hàm đọc nội dung}
  function listZip(buf) {
    var d = new Uint8Array(buf), i, eocd = -1;
    for (i = d.length - 22; i >= Math.max(0, d.length - 65557); i--) if (u32(d, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Không phải file Excel (.xlsx).');
    var n = u16(d, eocd + 10), p = u32(d, eocd + 16), files = {};
    for (i = 0; i < n; i++) {
      if (u32(d, p) !== 0x02014b50) throw new Error('File Excel bị hỏng.');
      var method = u16(d, p + 10), csize = u32(d, p + 20), usize = u32(d, p + 24), nl = u16(d, p + 28), el = u16(d, p + 30), cl = u16(d, p + 32), lo = u32(d, p + 42);
      var name = utf8(d.subarray(p + 46, p + 46 + nl));
      files[name] = { method: method, csize: csize, usize: usize, lo: lo };
      p += 46 + nl + el + cl;
    }
    return { d: d, files: files };
  }
  async function readEntry(z, name) {
    var f = z.files[name]; if (!f) return null;
    if (f.usize > MAX_UNZIP) throw new Error('File Excel quá lớn.');
    var d = z.d, o = f.lo;
    if (u32(d, o) !== 0x04034b50) throw new Error('File Excel bị hỏng.');
    var start = o + 30 + u16(d, o + 26) + u16(d, o + 28), raw = d.subarray(start, start + f.csize);
    var out = f.method === 0 ? raw : f.method === 8 ? await inflateRaw(raw) : null;
    if (!out) throw new Error('File Excel dùng kiểu nén không hỗ trợ.');
    return utf8(out);
  }

  // ---------- Đọc XML đơn giản ----------
  function unesc(s) {
    return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function (m, e) {
      if (e === 'amp') return '&'; if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
      var c = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : '';
    });
  }
  function attr(s, name) { var m = new RegExp('\\b' + name + '="([^"]*)"').exec(s); return m ? unesc(m[1]) : ''; }
  function textOf(xml) { var out = '', re = /<t\b[^>]*>([\s\S]*?)<\/t>/g, m; while ((m = re.exec(xml))) out += unesc(m[1]); return out; }
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0, i; if (!m) return -1; for (i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }

  function dateFormats(styles) {
    // trả về mảng: với mỗi kiểu ô (xf), có phải ngày không
    var custom = {}, re = /<numFmt\b([^>]*)\/>/g, m;
    while ((m = re.exec(styles))) custom[attr(m[1], 'numFmtId')] = attr(m[1], 'formatCode');
    var xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles), out = [];
    if (!xfs) return out;
    re = /<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g;
    while ((m = re.exec(xfs[1]))) {
      var id = attr(m[1], 'numFmtId'), n = parseInt(id, 10), isDate = (n >= 14 && n <= 22) || (n >= 45 && n <= 47);
      if (!isDate && custom[id]) isDate = /[dy]/i.test(custom[id].replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
      out.push(isDate);
    }
    return out;
  }
  function serialToDmy(v) {
    var d = new Date(Math.round((v - 25569) * 86400000));
    if (isNaN(d)) return String(v);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  }
  function numText(v) { var n = Number(v); return isFinite(n) && Math.abs(n) < 1e15 ? String(n) : String(v); }

  // Đọc sheet đầu tiên. buf: ArrayBuffer. Trả về Promise<mảng dòng>.
  async function readFirstSheet(buf) {
    var z = listZip(buf), wb = await readEntry(z, 'xl/workbook.xml');
    if (!wb) throw new Error('Không phải file Excel (.xlsx).');
    var sh = /<sheet\b([^>]*?)\/?>/.exec(wb); if (!sh) throw new Error('File Excel không có sheet nào.');
    var rid = attr(sh[1], 'r:id'), rels = await readEntry(z, 'xl/_rels/workbook.xml.rels') || '', target = '', re = /<Relationship\b([^>]*?)\/?>/g, m;
    while ((m = re.exec(rels))) if (attr(m[1], 'Id') === rid) target = attr(m[1], 'Target');
    var path = target ? (target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target) : 'xl/worksheets/sheet1.xml';
    var sheet = await readEntry(z, path); if (sheet == null) throw new Error('Không đọc được sheet đầu tiên.');
    var ss = await readEntry(z, 'xl/sharedStrings.xml'), strings = [];
    if (ss) { re = /<si\b[^>]*>([\s\S]*?)<\/si>/g; while ((m = re.exec(ss))) strings.push(textOf(m[1])); }
    var styles = await readEntry(z, 'xl/styles.xml'), isDate = styles ? dateFormats(styles) : [];
    var rows = [], rr = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, rm, auto = 0;
    while ((rm = rr.exec(sheet))) {
      var ri = attr(rm[1], 'r') ? parseInt(attr(rm[1], 'r'), 10) - 1 : auto; auto = ri + 1;
      if (ri > 20000) break;
      var cells = [], cr = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm, next = 0;
      while ((cm = cr.exec(rm[2] || ''))) {
        var a = cm[1], ci = attr(a, 'r') ? colIndex(attr(a, 'r')) : next; next = ci + 1;
        if (ci < 0 || ci > 200) continue;
        var t = attr(a, 't'), body = cm[2] || '', vm = /<v>([\s\S]*?)<\/v>/.exec(body), v = vm ? unesc(vm[1]) : '', val = '';
        if (t === 's') val = strings[parseInt(v, 10)] || '';
        else if (t === 'inlineStr') val = textOf(body);
        else if (t === 'str' || t === 'e') val = v;
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (v !== '') { var s = parseInt(attr(a, 's'), 10); val = isDate[s] ? serialToDmy(Number(v)) : numText(v); }
        while (cells.length < ci) cells.push('');
        cells[ci] = val;
      }
      while (rows.length < ri) rows.push([]);
      rows[ri] = cells;
    }
    while (rows.length && !rows[rows.length - 1].some(function (c) { return String(c).trim() !== ''; })) rows.pop();
    return rows;
  }

  // ---------- Tạo file xlsx ----------
  var CRC = (function () { var t = [], n, k, c; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff, i; for (i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colName(i) { var s = ''; i++; while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }

  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    function w16(a, v) { a.push(v & 255, (v >> 8) & 255); }
    function w32(a, v) { a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data), h = [];
      w32(h, 0x04034b50); w16(h, 20); w16(h, 0x0800); w16(h, 0); w16(h, 0); w16(h, 0x21); w32(h, crc); w32(h, data.length); w32(h, data.length); w16(h, name.length); w16(h, 0);
      parts.push(new Uint8Array(h), name, data);
      var c = [];
      w32(c, 0x02014b50); w16(c, 20); w16(c, 20); w16(c, 0x0800); w16(c, 0); w16(c, 0); w16(c, 0x21); w32(c, crc); w32(c, data.length); w32(c, data.length);
      w16(c, name.length); w16(c, 0); w16(c, 0); w16(c, 0); w16(c, 0); w32(c, 0); w32(c, off);
      central.push(new Uint8Array(c), name);
      off += h.length + name.length + data.length;
    });
    var csize = 0; central.forEach(function (p) { csize += p.length; });
    var e = []; w32(e, 0x06054b50); w16(e, 0); w16(e, 0); w16(e, files.length); w16(e, files.length); w32(e, csize); w32(e, off); w16(e, 0);
    var all = parts.concat(central, [new Uint8Array(e)]), total = 0; all.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), o = 0; all.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  // sheets: [{name, rows:[[...]], widths:[..], textCols:[chỉ số cột], wrapCols:[..], validations:[{sqref,type:'list'|'whole'|'custom',formula,formula2,error}], note:true}]
  // Ô là số thì ghi số, là chữ thì ghi chữ. Dòng đầu là tiêu đề (tô màu). note:true nghĩa là sheet chỉ có chữ để đọc.
  function build(sheets) {
    var files = [], i;
    files.push({ name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map(function (s, k) { return '<Override PartName="/xl/worksheets/sheet' + (k + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' });
    files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, k) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (k + 1) + '" r:id="rId' + (k + 1) + '"/>'; }).join('') + '</sheets></workbook>' });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, k) { return '<Relationship Id="rId' + (k + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (k + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
    // kiểu ô: 0 thường, 1 tiêu đề, 2 văn bản, 3 xuống dòng, 4 ví dụ (nghiêng xám)
    files.push({ name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF7A7A7A"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3A7D99"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' });
    sheets.forEach(function (s, k) {
      var text = {}, wrap = {}; (s.textCols || []).forEach(function (c) { text[c] = 1; }); (s.wrapCols || []).forEach(function (c) { wrap[c] = 1; });
      var cols = (s.widths || []).map(function (w, c) { return '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"' + (text[c] ? ' style="2"' : wrap[c] ? ' style="3"' : '') + '/>'; }).join('');
      var rows = s.rows.map(function (r, ri) {
        return '<row r="' + (ri + 1) + '"' + (ri === 0 && !s.note ? ' ht="32" customHeight="1"' : '') + '>' + r.map(function (v, ci) {
          if (v === '' || v == null) return '';
          var ref = colName(ci) + (ri + 1), st = ri === 0 && !s.note ? 1 : (s.exampleRows && s.exampleRows.indexOf(ri) >= 0) ? 4 : text[ci] ? 2 : wrap[ci] ? 3 : 0;
          if (typeof v === 'number') return '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><v>' + v + '</v></c>';
          return '<c r="' + ref + '" t="inlineStr"' + (st ? ' s="' + st + '"' : '') + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
        }).join('') + '</row>';
      }).join('');
      var dv = (s.validations || []).map(function (v) {
        return '<dataValidation type="' + v.type + '"' + (v.type === 'whole' ? ' operator="between"' : '') + ' allowBlank="1" showErrorMessage="1" errorTitle="' + esc(v.title || 'Giá trị chưa đúng') + '" error="' + esc(v.error || '') + '" sqref="' + v.sqref + '"><formula1>' + esc(v.formula) + '</formula1>' + (v.formula2 ? '<formula2>' + esc(v.formula2) + '</formula2>' : '') + '</dataValidation>';
      }).join('');
      var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"' + (s.note ? ' showGridLines="0"' : '') + (k === 0 ? ' tabSelected="1"' : '') + '>' + (s.note ? '' : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>') + '</sheetView></sheetViews>' + (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' + rows + '</sheetData>' + (dv ? '<dataValidations count="' + (s.validations || []).length + '">' + dv + '</dataValidations>' : '') + '</worksheet>';
      files.push({ name: 'xl/worksheets/sheet' + (k + 1) + '.xml', data: xml });
    });
    return zip(files);
  }

  var api = { readFirstSheet: readFirstSheet, build: build, colName: colName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XR = api;
})(typeof window !== 'undefined' ? window : this);
