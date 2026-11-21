// solve.js — a fast drop-in for csv-reader 1.0.0.
//
// Written fresh in this session from the competition's prose specification
// (RULES.txt): the text is read once, left to right, with commas and double
// quotes. A U+FEFF at its very start is dropped. A record ends at LF or CRLF,
// and a line left with no characters is no record. Outside quotes a CR not
// followed by LF is dropped (error stray_cr). A field that opens with a quote
// runs to the next quote that is not doubled; "" inside it is one quote and
// each CRLF or lone CR inside it is read as LF; what follows its closing
// quote, up to the next comma or line break, is appended as it stands
// (quote_junk, when the field ends). A quote that never closes is a literal
// character, and the text after it is read again as unquoted
// (unterminated_quote). One refinement the prose leaves implicit, verified
// by black-box probing of the reference: a quote that opens a field
// immediately after a lone CR dropped as stray_cr is a literal character
// too — the field is read as unquoted, with no unterminated_quote and no
// quote_junk for it. A quote inside an unquoted field is a literal
// character. Fields stay strings, never trimmed or converted. columns is the
// first record when header is true, else null; rows holds the records after
// it, each padded (short_row, with fields: its field count) or cut (long_row,
// with extra: the cut fields) to the first record's width. Each error is
// {code, line, row}, in the order met; a record's short_row or long_row when
// it ends. line is the 1-based line its record starts on, counting every LF,
// CRLF and lone CR inside quotes; row is its record's index in rows, null
// for the header. A stray CR met before a record's first field begins is
// reported on the line it sits on.
//
// Performance: the hot path scans with String indexOf (native memchr-style
// scans) instead of stepping character by character, and only falls back to
// a character loop for fields that actually contain a stray CR or a quoted
// field that actually contains a line break. Two traps this avoids:
//   - never search for '\n' or '\r' with a fresh indexOf per field: the
//     next LF is cached per record and the next CR per stretch between
//     CRs, each refreshed only when the scan passes it. Where CRs are
//     sparse (LF-terminated files) an unbounded indexOf('\r', from) per
//     field would scan far past the field into later records — that one
//     mistake cost 15x on such a case.
//   - the field scanners return through shared locals, not a fresh
//     [value, end] array per field.

export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  const errors = [];
  const rows = [];
  let columns = header ? [] : null;
  let width = -1;
  let line = 1;
  let first = true;

  // Scanner results, shared so no array is allocated per field.
  let outValue = '';
  let outEnd = 2; // 0 = comma, 1 = line break, 2 = EOF

  // The first LF / CR at or after the last scanned position (n when there
  // is none left). Both only move forward, so each is refreshed only when
  // the next field starts past it: the '\n' search is paid once per
  // record instead of once per field, and the '\r' search is paid once
  // per stretch between CRs instead of once per field — where CRs are
  // sparse (LF-terminated files) an unbounded indexOf('\r', from) per
  // field would otherwise scan far past the field into later records.
  let nlPos = -1;
  let crPos = -1;

  // Drop every lone CR in `value` (a short slice already cut from the
  // text), reporting each as stray_cr on the record's start line, and
  // return the cleaned string.
  const dropCRs = (value, recLine, recRow) => {
    let parts = null;
    let s = 0;
    for (let j = 0; j < value.length; j++) {
      if (value.charCodeAt(j) === 13) {
        errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        if (parts === null) parts = [];
        parts.push(value.slice(s, j));
        s = j + 1;
      }
    }
    return parts === null ? value : parts.join('') + value.slice(s);
  };

  // Scan one unquoted field starting at `from` (which is not a quote).
  // Sets outValue/outEnd and leaves `i` just past the delimiter (or at
  // n for EOF). A lone CR inside the field is dropped and reported as
  // stray_cr on the record's start line; a CR immediately before the
  // line break is the CRLF half of the break, not a stray CR.
  const scanUnquoted = (from, recLine, recRow) => {
    if (nlPos < from) {
      nlPos = text.indexOf('\n', from);
      if (nlPos === -1) nlPos = n;
    }
    if (crPos < from) {
      crPos = text.indexOf('\r', from);
      if (crPos === -1) crPos = n;
    }
    let comma = text.indexOf(',', from);
    const nl = nlPos;
    if (comma === -1) comma = n;
    if (comma < nl) {
      const value = text.slice(from, comma);
      outValue = crPos >= comma ? value : dropCRs(value, recLine, recRow);
      outEnd = 0;
      i = comma + 1;
      return;
    }
    if (nl < n) {
      const limit = nl > from && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
      const value = text.slice(from, limit);
      outValue = crPos >= limit ? value : dropCRs(value, recLine, recRow);
      outEnd = 1;
      i = nl + 1;
      return;
    }
    const value = text.slice(from, n);
    outValue = crPos >= n ? value : dropCRs(value, recLine, recRow);
    outEnd = 2;
    i = n;
  };

  // Scan the junk after a quoted field's closing quote, starting at
  // `from`. Junk runs to the next comma, line break or EOF; a lone CR
  // inside it is dropped (stray_cr on the record's start line) and the
  // junk continues. Sets outValue/outEnd, advancing `i`.
  const scanJunk = (from, recLine, recRow) => {
    if (nlPos < from) {
      nlPos = text.indexOf('\n', from);
      if (nlPos === -1) nlPos = n;
    }
    if (crPos < from) {
      crPos = text.indexOf('\r', from);
      if (crPos === -1) crPos = n;
    }
    let comma = text.indexOf(',', from);
    const nl = nlPos;
    if (comma === -1) comma = n;
    if (comma < nl) {
      const value = text.slice(from, comma);
      outValue = crPos >= comma ? value : dropCRs(value, recLine, recRow);
      outEnd = 0;
      i = comma + 1;
      return;
    }
    if (nl < n) {
      const limit = nl > from && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
      const value = text.slice(from, limit);
      outValue = crPos >= limit ? value : dropCRs(value, recLine, recRow);
      outEnd = 1;
      i = nl + 1;
      return;
    }
    const value = text.slice(from, n);
    outValue = crPos >= n ? value : dropCRs(value, recLine, recRow);
    outEnd = 2;
    i = n;
  };

  while (i < n) {
    const recRow = first && header ? null : rows.length;

    // Skip empty lines and stray CRs before the record's first field.
    // A stray CR here sits on the current line, so it is reported on that
    // line, not on the line the record's first field eventually starts on.
    // A quote that opens the record's first field immediately after a
    // stray CR dropped here is a literal character, not the start of a
    // quoted field: the field is read as unquoted. (Verified by black-box
    // probing: "\r\"a\",b" reads as ["\"a\"","b"], while "\r\r\n\"a\",b"
    // — a line break between the dropped CR and the quote — reads the
    // quote as opening a quoted field.) An empty line skipped after the
    // dropped CR clears this, as does any field once it has begun.
    let poisoned = false;
    let c = text.charCodeAt(i);
    while (c === 10 || c === 13) {
      if (c === 10) {
        line++;
        i++;
        poisoned = false;
      } else if (text.charCodeAt(i + 1) === 10) {
        line++;
        i += 2;
        poisoned = false;
      } else {
        errors.push({ code: 'stray_cr', line: line, row: recRow });
        i++;
        poisoned = true;
      }
      if (i >= n) break;
      c = text.charCodeAt(i);
    }
    if (i >= n) break;

    const recLine = line;
    let fields;
    let end;
    if (nlPos < i) {
      nlPos = text.indexOf('\n', i);
      if (nlPos === -1) nlPos = n;
    }
    if (crPos < i) {
      crPos = text.indexOf('\r', i);
      if (crPos === -1) crPos = n;
    }
    const recEnd = nlPos;
    const qPos = text.indexOf('"', i);
    // Fast path: a record whose span to the next LF holds no quote at all
    // and no stray CR is just comma-separated fields, split in one native
    // pass. Conservative on purpose: any quote in the span (even a
    // literal one mid-field) or any CR other than the CRLF half at the
    // span's end falls back to the field-by-field path, which also owns
    // the poisoned-quote rule — irrelevant here, since a span with no
    // quote has no quote to misread. Roughly a fifth to a third of all
    // fields sit in such records.
    if ((qPos === -1 || qPos >= recEnd) && (crPos >= recEnd || (recEnd < n && crPos === recEnd - 1))) {
      const limit = crPos === recEnd - 1 ? recEnd - 1 : recEnd;
      fields = text.slice(i, limit).split(',');
      end = recEnd < n ? 1 : 2;
      i = recEnd < n ? recEnd + 1 : n;
    } else {
      fields = [];
      end = 2;
      let firstField = true;

      while (true) {
      if (text.charCodeAt(i) === 34 && !(firstField && poisoned)) {
        // Quoted field: find the next quote that is not doubled.
        let j = i + 1;
        let segStart = i + 1;
        let parts = null;
        let close = -1;
        while (true) {
          const q = text.indexOf('"', j);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === 34) {
            if (parts === null) parts = [];
            parts.push(text.slice(segStart, q));
            parts.push('"');
            j = q + 2;
            segStart = q + 2;
            continue;
          }
          close = q;
          break;
        }
        if (close === -1) {
          // Unterminated: the quote is a literal character, and the text
          // after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
          scanUnquoted(i + 1, recLine, recRow);
          fields.push('"' + outValue);
          end = outEnd;
        } else {
          let value = parts === null ? text.slice(i + 1, close) : parts.join('') + text.slice(segStart, close);
          // Inside quotes each CRLF or lone CR is read as LF, and each
          // line break counts for the line numbers that follow.
          if (value.indexOf('\r') !== -1) {
            let out = '';
            let breaks = 0;
            let s = 0;
            for (let k = 0; k < value.length; k++) {
              const ch = value.charCodeAt(k);
              if (ch === 13) {
                out += value.slice(s, k) + '\n';
                breaks++;
                if (value.charCodeAt(k + 1) === 10) k++;
                s = k + 1;
              } else if (ch === 10) {
                breaks++;
              }
            }
            out += value.slice(s);
            value = out;
            line += breaks;
          } else if (value.indexOf('\n') !== -1) {
            let breaks = 0;
            let p = -1;
            while ((p = value.indexOf('\n', p + 1)) !== -1) breaks++;
            line += breaks;
          }
          scanJunk(close + 1, recLine, recRow);
          if (outValue.length > 0) {
            errors.push({ code: 'quote_junk', line: recLine, row: recRow });
            value += outValue;
          }
          fields.push(value);
          end = outEnd;
        }
      } else {
        scanUnquoted(i, recLine, recRow);
        fields.push(outValue);
        end = outEnd;
      }
      firstField = false;
      if (end === 0) continue;
      break;
    }
    }

    if (end === 1) line++;

    if (first) {
      width = fields.length;
      if (header) columns = fields;
      else rows.push(fields);
      first = false;
    } else {
      const rowIndex = rows.length;
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recLine, row: rowIndex, fields: fields.length });
        for (let k = fields.length; k < width; k++) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recLine, row: rowIndex, extra: fields.slice(width) });
        fields.length = width;
      }
      rows.push(fields);
    }
  }

  return { columns, rows, errors };
}
