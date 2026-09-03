/** Capitaliza cada palabra del nombre para mostrarlo (el dato guardado no cambia). */
export function formatContactName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toLocaleUpperCase("es") + word.slice(1) : word))
    .join(" ");
}
