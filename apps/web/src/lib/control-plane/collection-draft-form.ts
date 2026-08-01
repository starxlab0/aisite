export function parseMultilineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCollectionCtaLinks(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hrefPart, ...labelParts] = line.split("|");
      const href = hrefPart?.trim() ?? "";
      const label = labelParts.join("|").trim();
      return { href, label: label || href };
    })
    .filter((item) => item.href);
}
