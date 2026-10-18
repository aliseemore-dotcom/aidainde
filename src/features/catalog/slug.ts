const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // татарские буквы
  ә: 'a', ө: 'o', ү: 'u', җ: 'zh', ң: 'n', һ: 'h',
};

/** «Кофейня на Баумана» -> «kofeynya-na-baumana». Латиница, цифры и дефисы, до 80 символов. */
export function slugify(title: string): string {
  const latin = [...title.toLowerCase()].map((ch) => MAP[ch] ?? ch).join('');
  let s = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 80) s = s.slice(0, 80).replace(/-[^-]*$/, '') || s.slice(0, 80);
  return s || 'zapis';
}

/** Делает slug уникальным среди уже занятых: base, base-2, base-3… */
export function uniqueSlug(base: string, taken: Set<string>): string {
  let s = base; let n = 2;
  while (taken.has(s)) s = `${base.slice(0, 76)}-${n++}`;
  taken.add(s);
  return s;
}
