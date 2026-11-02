import React, { createContext, useContext, useEffect, useState } from 'react';
import { isLocale, locales, localeLabels, translate } from './translate';
import type { Locale } from './translate';
import { Select, SelectTrigger, SelectContent, SelectGroup, SelectItem, SelectValue } from '@/components/ui/select';

const storageKey = 'rapoo.locale';
const LocaleContext = createContext<{locale: Locale; setLocale: (locale: Locale) => void}>({ locale: 'en', setLocale: () => {} });
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try { const saved = localStorage.getItem(storageKey); return isLocale(saved) ? saved : 'en'; }
    catch { return 'en'; }
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, 'Título da página');
    const description = translate(locale, 'Descrição da página');
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    try { localStorage.setItem(storageKey, locale); } catch { /* Storage may be blocked; selection still works for this session. */ }
  }, [locale]);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}
export function useTranslation() {
  const {locale, setLocale} = useContext(LocaleContext);
  return {locale, setLocale, t: (source: string, values?: Record<string, string | number>) => translate(locale, source, values)};
}
export function LanguageSelect() {
  const {locale, setLocale, t} = useTranslation();
  return <div className="language-select"><label htmlFor="interface-language" className="sr-only">{t('Idioma')}</label><Select value={locale} onValueChange={value => { if (isLocale(value)) setLocale(value); }}><SelectTrigger id="interface-language" aria-label={t('Idioma')} className="w-36"><SelectValue><span className="hidden sm:inline">{localeLabels[locale]}</span><span className="sm:hidden">{locale.toUpperCase()}</span></SelectValue></SelectTrigger><SelectContent position="popper" align="end"><SelectGroup>{locales.map(value => <SelectItem key={value} value={value} lang={value}>{localeLabels[value]}</SelectItem>)}</SelectGroup></SelectContent></Select></div>;
}
