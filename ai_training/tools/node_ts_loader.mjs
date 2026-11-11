import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const parentURL = context.parentURL ?? pathToFileURL(path.join(process.cwd(), 'index.ts')).href;
      const parent = fileURLToPath(parentURL);
      const base = specifier.startsWith('/')
        ? specifier
        : path.resolve(path.dirname(parent), specifier);
      const candidates = [
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx')
      ];
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    throw error;
  }
}
