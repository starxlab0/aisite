export type DiffRow = {
  label: string;
  published: string;
  draft: string;
  added?: string[];
  removed?: string[];
};

export type DiffSection = {
  title: string;
  rows: DiffRow[];
};

export function getDiffSections(
  kind: "product" | "collection" | "faq",
  publishedPayload: any,
  draftPayload: any,
): DiffSection[] {
  if (kind === "product") return diffProduct(publishedPayload, draftPayload);
  if (kind === "collection") return diffCollection(publishedPayload, draftPayload);
  return diffFaq(publishedPayload, draftPayload);
}

function diffProduct(publishedPayload: any, draftPayload: any): DiffSection[] {
  const p = publishedPayload ?? {};
  const d = draftPayload ?? {};

  const rowsBasic = diffTextRows([
    ["Title", p.title, d.title],
    ["Subtitle", p.subtitle, d.subtitle],
    ["Short description", p.shortDescription, d.shortDescription],
  ]);

  const rowsLists = [
    diffListRow("Key benefits", p.keyBenefits, d.keyBenefits),
    diffListRow("Who it’s for", p.whoItsFor, d.whoItsFor),
    diffListRow("Why it feels different", p.whyItFeelsDifferent, d.whyItFeelsDifferent),
    diffListRow("Care instructions", p.careInstructions, d.careInstructions),
    diffListRow("What’s in box", p.whatsInBox, d.whatsInBox),
  ].filter(Boolean) as DiffRow[];

  return [
    { title: "核心文案", rows: rowsBasic },
    { title: "列表内容", rows: rowsLists },
  ].filter((s) => s.rows.length > 0);
}

function diffCollection(publishedPayload: any, draftPayload: any): DiffSection[] {
  const p = publishedPayload ?? {};
  const d = draftPayload ?? {};

  const rowsHero = diffTextRows([
    ["Hero title", p.hero?.title, d.hero?.title],
    ["Hero summary", p.hero?.summary, d.hero?.summary],
  ]);

  const linksRow = diffListRow("Internal links", p.internalLinks, d.internalLinks);
  const rowsMeta = (linksRow ? [linksRow] : []) as DiffRow[];

  const pSections = Array.isArray(p.sections) ? p.sections : [];
  const dSections = Array.isArray(d.sections) ? d.sections : [];
  const max = Math.max(pSections.length, dSections.length);
  const rowsSections: DiffRow[] = [];

  for (let i = 0; i < max; i += 1) {
    const ps = pSections[i] ?? {};
    const ds = dSections[i] ?? {};
    rowsSections.push(
      ...diffTextRows([
        [`Section #${i + 1} title`, ps.title, ds.title],
        [`Section #${i + 1} content`, ps.content, ds.content],
      ]),
    );
  }

  return [
    { title: "Hero", rows: rowsHero },
    { title: "链接", rows: rowsMeta },
    { title: "Sections", rows: rowsSections },
  ].filter((s) => s.rows.length > 0);
}

function diffFaq(publishedPayload: any, draftPayload: any): DiffSection[] {
  const p = publishedPayload ?? {};
  const d = draftPayload ?? {};

  const rowsTitle = diffTextRows([["Title", p.title, d.title]]);

  const pItems = Array.isArray(p.items) ? p.items : [];
  const dItems = Array.isArray(d.items) ? d.items : [];
  const max = Math.max(pItems.length, dItems.length);
  const rowsItems: DiffRow[] = [];

  for (let i = 0; i < max; i += 1) {
    const pi = pItems[i] ?? {};
    const di = dItems[i] ?? {};
    rowsItems.push(
      ...diffTextRows([
        [`Item #${i + 1} question`, pi.question, di.question],
        [`Item #${i + 1} answer`, pi.answer, di.answer],
        [`Item #${i + 1} category`, pi.intent ?? pi.category, di.intent ?? di.category],
      ]),
    );
  }

  return [
    { title: "标题", rows: rowsTitle },
    { title: "条目", rows: rowsItems },
  ].filter((s) => s.rows.length > 0);
}

function diffTextRows(rows: Array<[string, unknown, unknown]>): DiffRow[] {
  return rows
    .map(([label, pv, dv]) => {
      const published = toText(pv);
      const draft = toText(dv);
      return { label, published, draft };
    })
    .filter((r) => r.published !== r.draft);
}

function diffListRow(label: string, pv: unknown, dv: unknown): DiffRow | null {
  const p = toStringList(pv);
  const d = toStringList(dv);
  if (joinLines(p) === joinLines(d)) return null;

  const removed = p.filter((x) => !d.includes(x));
  const added = d.filter((x) => !p.includes(x));

  return {
    label,
    published: joinLines(p),
    draft: joinLines(d),
    ...(added.length ? { added } : null),
    ...(removed.length ? { removed } : null),
  };
}

function toText(value: unknown): string {
  if (value == null) return "∅";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

function toStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  return String(value)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinLines(items: string[]): string {
  return items.length ? items.join("\n") : "∅";
}
