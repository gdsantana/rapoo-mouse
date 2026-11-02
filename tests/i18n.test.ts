import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messages } from '../apps/web/src/i18n/messages.ts';
import { isLocale, locales, translate } from '../apps/web/src/i18n/translate.ts';

test('all messages provide all locales with matching placeholders', () => {
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [key, entry] of Object.entries(messages)) {
    for (const locale of locales) {
      assert(entry[locale].length > 0, `${key}: ${locale}`);
      assert.deepEqual(placeholders(entry[locale]), placeholders(entry.en), `${key}: ${locale}`);
    }
  }
});
test('locale validation, interpolation and existing device statuses', () => {
  assert(isLocale('en')); assert(isLocale('pt-BR')); assert(isLocale('es-ES'));
  assert(!isLocale('fr')); assert(!isLocale(null));
  assert.equal(translate('en', 'Conectar mouse'), 'Connect mouse');
  assert.equal(translate('pt-BR', 'Conectar mouse'), 'Conectar mouse');
  assert.equal(translate('es-ES', 'Conectar mouse'), 'Conectar ratón');
  assert.equal(translate('en', '{count} interface encontrada', {count: 1}), '1 interface found');
  assert.equal(translate('es-ES', 'Estágio {current} de {total}', {current: 2, total: 3}), 'Nivel 2 de 3');
  assert.equal(translate('en', '3 interface(s) inspecionada(s).'), '3 interfaces inspected.');
  assert.equal(translate('en', 'HID error 0xBA'), 'HID error 0xBA');
});
