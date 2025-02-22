import type { CSpellSettings } from '@cspell/cspell-types';
import { describe, expect, test } from 'vitest';

import { getDefaultSettings, mergeSettings } from './Settings/index.js';
import type { TraceResult } from './trace.js';
import { traceWords } from './trace.js';

const timeout = 20000;

describe('Verify trace', () => {
    test(
        'tests tracing a word',
        async () => {
            const words = ['apple'];
            const config = await getSettings({ ignoreWords: ['apple'], flagWords: ['apple'] });
            const results = await traceWords(words, config, {});
            expect(results.map(({ dictName, found }) => ({ dictName, found }))).toEqual(
                expect.arrayContaining([
                    { dictName: 'en-gb', found: true },
                    { dictName: 'en_us', found: true },
                    { dictName: 'cpp', found: true },
                    { dictName: 'typescript', found: false },
                    { dictName: 'companies', found: true },
                    { dictName: 'softwareTerms', found: false },
                    { dictName: '[ignoreWords]', found: true },
                    { dictName: '[words]', found: false },
                    { dictName: '[flagWords]', found: true },
                ]),
            );
        },
        { timeout },
    );

    // cspell:ignore *error* *code* hte colour
    test.each`
        word           | languageId   | locale       | ignoreCase | allowCompoundWords | dictName           | dictActive | found    | forbidden | noSuggest | foundWord
        ${'apple'}     | ${undefined} | ${undefined} | ${true}    | ${undefined}       | ${'en_us'}         | ${true}    | ${true}  | ${false}  | ${false}  | ${'apple'}
        ${'apple'}     | ${undefined} | ${undefined} | ${true}    | ${undefined}       | ${'en-gb'}         | ${false}   | ${true}  | ${false}  | ${false}  | ${'apple'}
        ${'Apple'}     | ${undefined} | ${undefined} | ${false}   | ${undefined}       | ${'en_us'}         | ${true}    | ${true}  | ${false}  | ${false}  | ${'Apple'}
        ${'Apple'}     | ${undefined} | ${undefined} | ${false}   | ${undefined}       | ${'companies'}     | ${true}    | ${true}  | ${false}  | ${false}  | ${'Apple'}
        ${'Apple'}     | ${undefined} | ${undefined} | ${false}   | ${undefined}       | ${'cpp'}           | ${false}   | ${true}  | ${false}  | ${false}  | ${'apple'}
        ${'café'}      | ${undefined} | ${undefined} | ${true}    | ${undefined}       | ${'en_us'}         | ${true}    | ${true}  | ${false}  | ${false}  | ${'café'}
        ${'errorcode'} | ${undefined} | ${undefined} | ${true}    | ${undefined}       | ${'en_us'}         | ${true}    | ${false} | ${false}  | ${false}  | ${undefined}
        ${'errorcode'} | ${undefined} | ${undefined} | ${true}    | ${true}            | ${'en_us'}         | ${true}    | ${true}  | ${false}  | ${false}  | ${'error+code'}
        ${'errorcode'} | ${'cpp'}     | ${undefined} | ${true}    | ${true}            | ${'cpp'}           | ${true}    | ${true}  | ${false}  | ${false}  | ${'error+code'}
        ${'errorcode'} | ${'cpp'}     | ${undefined} | ${true}    | ${undefined}       | ${'cpp'}           | ${true}    | ${false} | ${false}  | ${false}  | ${undefined}
        ${'hte'}       | ${undefined} | ${undefined} | ${true}    | ${undefined}       | ${'en_us'}         | ${true}    | ${false} | ${false}  | ${false}  | ${undefined}
        ${'hte'}       | ${undefined} | ${undefined} | ${true}    | ${undefined}       | ${'[flagWords]'}   | ${true}    | ${true}  | ${true}   | ${false}  | ${'hte'}
        ${'Colour'}    | ${undefined} | ${undefined} | ${true}    | ${undefined}       | ${'[ignoreWords]'} | ${true}    | ${true}  | ${false}  | ${true}   | ${'colour'}
    `(
        'trace word "$word" in $dictName',
        async (params) => {
            const { word, languageId, ignoreCase, locale, allowCompoundWords } = params;
            const { dictName, dictActive, found, forbidden, noSuggest, foundWord } = params;
            const words = [word];
            const config = await getSettings({ allowCompoundWords, flagWords: ['hte'], ignoreWords: ['colour'] });
            const results = await traceWords(words, config, { locale, languageId, ignoreCase });
            const byName = results.reduce(
                (a, b) => {
                    a[b.dictName] = b;
                    return a;
                },
                {} as Record<string, TraceResult>,
            );

            // console.log(JSON.stringify(byName));

            expect(byName[dictName]).toEqual(
                oc({
                    dictActive,
                    dictName,
                    forbidden,
                    found,
                    foundWord,
                    noSuggest,
                    word,
                }),
            );
        },
        { timeout },
    );

    test(
        'tracing with missing dictionary.',
        async () => {
            const words = ['apple'];
            const defaultConfig = await getSettings();
            const dictionaryDefinitions = (defaultConfig.dictionaryDefinitions || []).concat([
                {
                    name: 'bad dict',
                    path: './missing.txt',
                },
            ]);
            const config: CSpellSettings = {
                ...defaultConfig,
                dictionaryDefinitions,
            };
            const results = await traceWords(words, config, {});
            expect(Object.keys(results)).not.toHaveLength(0);
            const foundIn = results.filter((r) => r.found);
            expect(foundIn).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        dictName: 'en_us',
                        dictSource: expect.stringContaining('en_US.trie.gz'),
                    }),
                ]),
            );

            const resultsWithErrors = results.filter((r) => !!r.errors);
            expect(resultsWithErrors).toHaveLength(1);

            expect(resultsWithErrors).toContainEqual(
                expect.objectContaining({
                    dictName: 'bad dict',
                    dictSource: './missing.txt',
                    errors: expect.arrayContaining([
                        expect.objectContaining({
                            message: expect.stringContaining('failed to load'),
                        }),
                    ]),
                }),
            );
        },
        { timeout },
    );
});

function oc<T>(t: T): T {
    return expect.objectContaining(t);
}

async function getSettings(...settings: CSpellSettings[]): Promise<CSpellSettings> {
    return settings.reduce((a, b) => mergeSettings(a, b), await getDefaultSettings(true));
}
