import { messages } from './messages.ts';

export const locales = ['en', 'pt-BR', 'es-ES'] as const;
export type Locale = typeof locales[number];
export const localeLabels: Record<Locale, string> = { en: 'English', 'pt-BR': 'Português BR', 'es-ES': 'Español ES' };
export function isLocale(value: unknown): value is Locale {
  return locales.some(locale => locale === value);
}
export function translate(locale: Locale, source: string, values: Record<string, string | number> = {}): string {
  // Older device status messages contain a count rather than a catalog key.
  const inspected = source.match(/^(\d+) interface\(s\) inspecionada\(s\)\.$/);
  if (inspected) return translate(locale, Number(inspected[1]) === 1 ? '{count} interface inspecionada.' : '{count} interface(s) inspecionada(s).', { count: Number(inspected[1]) });
  const entry = messages[source as keyof typeof messages];
  const template = entry?.[locale] ?? source;
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => typeof values[key] === 'number' ? new Intl.NumberFormat(locale).format(values[key]) : String(values[key] ?? placeholder));
}
export function hasTranslation(source: string): boolean {
  return Object.hasOwn(messages, source);
}
