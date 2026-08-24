import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(__dirname, '../src');

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? typescriptFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function importsIn(directory: string): Array<{ file: string; specifier: string }> {
  return typescriptFiles(directory).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/(?:from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => ({
      file: relative(sourceRoot, file).replaceAll('\\', '/'),
      specifier: match[1]
    }));
  });
}

describe('service architecture boundaries', () => {
  it('does not let backend modules import worker implementation modules', () => {
    const violations = importsIn(join(sourceRoot, 'backend')).filter(({ specifier }) => specifier.includes('/worker/'));
    expect(violations).toEqual([]);
  });

  it('does not let worker modules import backend implementation modules', () => {
    const violations = importsIn(join(sourceRoot, 'worker')).filter(({ specifier }) => specifier.includes('/backend/'));
    expect(violations).toEqual([]);
  });

  it('keeps Workflow modules deterministic and free of infrastructure imports', () => {
    const forbidden = [
      '@prisma/client',
      'shared/database',
      'shared/config',
      'shared/logging',
      'node:fs',
      'node:http',
      'node:crypto'
    ];
    const violations = importsIn(join(sourceRoot, 'worker', 'workflows')).filter(({ specifier }) =>
      forbidden.some((value) => specifier.includes(value))
    );
    expect(violations).toEqual([]);
  });

  it('keeps shared modules independent from both application implementations', () => {
    const violations = importsIn(join(sourceRoot, 'shared')).filter(
      ({ specifier }) => specifier.includes('/backend/') || specifier.includes('/worker/')
    );
    expect(violations).toEqual([]);
  });
});
