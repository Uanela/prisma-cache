export function toKebab(str: string): string {
  if (str === "") return "";

  const leading = str.match(/^ */)?.[0].length ?? 0;
  const trailing = str.match(/ *$/)?.[0].length ?? 0;

  if (leading + trailing >= str.length) {
    return "-";
  }

  const prefix = "-".repeat(leading);
  const suffix = "-".repeat(trailing);
  const middle = str.slice(leading, str.length - trailing || undefined);

  const result = middle
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([0-9])([a-zA-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  return prefix + result + suffix;
}
