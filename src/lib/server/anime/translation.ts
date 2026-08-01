import { env as transformersEnv, pipeline } from '@huggingface/transformers';

const chunkLength = 180;
const model = 'onnx-community/opus-mt-ja-en';

transformersEnv.cacheDir = '.cache/transformers';

async function createTranslator() {
    return pipeline('translation', model, { dtype: 'q4' });
}

let translator: ReturnType<typeof createTranslator> | undefined;

export function translationChunks(text: string) {
    const sentences = text.trim().match(/[^。！？!?]+[。！？!?]?/gu) ?? [];
    const chunks: string[] = [];

    for (const sentence of sentences) {
        const value = sentence.trim();
        if (!value) {
            continue;
        }

        for (let index = 0; index < value.length; index += chunkLength) {
            const part = value.slice(index, index + chunkLength);
            chunks.push(part);
        }
    }

    return chunks;
}

export async function translateToEnglish(texts: string[]) {
    if (!texts.length) {
        return [];
    }
    translator ??= createTranslator();
    const translate = await translator;
    const segments = texts.flatMap((text, textIndex) =>
        translationChunks(text).map((value) => ({ textIndex, value })),
    );
    const translated = texts.map(() => [] as string[]);

    for (const segment of segments) {
        const [result] = await translate(segment.value);
        if (result?.translation_text.trim()) {
            translated[segment.textIndex].push(result.translation_text.trim());
        }
    }

    return translated.map((parts) => parts.join(' '));
}
