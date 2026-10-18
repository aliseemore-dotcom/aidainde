/**
 * Разбор CSV из Excel и Google Таблиц: BOM, разделитель `;` `,` или таб (определяется по первой строке),
 * кавычки с удвоением, переводы строк внутри ячеек.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  let delim = ',';
  let best = -1;
  for (const d of [';', ',', '\t']) {
    let n = 0; let q = false;
    for (const ch of firstLine) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
    if (n > best) { best = n; delim = d; }
  }
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let q = false;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); rows.push(row); row = []; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') { if (src[i + 1] === '\n') i++; endRow(); }
    else cell += ch;
  }
  if (cell.length || row.length) endRow();
  return rows;
}
