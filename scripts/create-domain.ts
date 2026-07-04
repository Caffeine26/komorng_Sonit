#!/usr/bin/env tsx
/**
 * pnpm create-domain <name>
 *
 * Scaffolds a new hexagonal domain under backend/api/src/domains/<name>/
 * with all four layers (core, application, infra, api) and stub files.
 * Follows the shape of the `order` reference domain.
 *
 * After running:
 *   1. Edit backend/api/src/app.module.ts to import the new module.
 *   2. Add a section to database/prisma/schema.prisma if you need tables.
 *   3. Create contracts/<name>/ if this domain has public HTTP schemas.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rawName = process.argv[2];
if (!rawName || !/^[a-z][a-z0-9-]*$/.test(rawName)) {
  console.error('Usage: pnpm create-domain <kebab-case-name>');
  console.error('Example: pnpm create-domain promotions');
  process.exit(1);
}

const name = rawName;
const Name = toPascal(name);
const nameSnake = name.replace(/-/g, '_');

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), '..');
const domainRoot = resolve(repoRoot, `backend/api/src/domains/${name}`);

if (existsSync(domainRoot)) {
  console.error(`Domain "${name}" already exists at ${domainRoot}`);
  process.exit(1);
}

const dirs = [
  'core/entities',
  'core/value-objects',
  'core/services',
  'core/events',
  'core/ports',
  'core/errors',
  'application/use-cases',
  'application/queries',
  'application/handlers',
  'infra/repositories',
  'infra/mappers',
  'infra/publishers',
  'api/controllers',
  'api/dto',
  'api/presenters',
];

async function main(): Promise<void> {
  for (const d of dirs) {
    await mkdir(resolve(domainRoot, d), { recursive: true });
  }

  const files: Record<string, string> = {
    // ── core ──────────────────────────────────────────────────────────
    'core/entities/.gitkeep': '',
    'core/value-objects/.gitkeep': '',
    'core/services/.gitkeep': '',
    'core/events/.gitkeep': '',
    'core/errors/.gitkeep': '',

    [`core/ports/${name}.repository.port.ts`]: `// Port — interface for the ${name} repository.
// The concrete adapter lives in infra/repositories/.
export interface ${Name}Repository {
  // TODO: add methods as your use cases demand them.
  // save(entity: ${Name}Entity): Promise<void>;
  // findById(id: string): Promise<${Name}Entity | null>;
}

export const ${nameSnake.toUpperCase()}_REPOSITORY = Symbol('${nameSnake.toUpperCase()}_REPOSITORY');
`,

    // ── application ───────────────────────────────────────────────────
    [`application/use-cases/.gitkeep`]: '',
    [`application/queries/.gitkeep`]: '',
    [`application/handlers/.gitkeep`]: '',

    // ── infra ─────────────────────────────────────────────────────────
    [`infra/repositories/in-memory-${name}.repository.ts`]: `import { Injectable } from '@nestjs/common';
import type { ${Name}Repository } from '../../core/ports/${name}.repository.port';

@Injectable()
export class InMemory${Name}Repository implements ${Name}Repository {
  // TODO: implement the methods from the port.
}
`,

    // ── api ───────────────────────────────────────────────────────────
    [`api/controllers/${name}.controller.ts`]: `import { Controller, Get } from '@nestjs/common';

@Controller('${name}')
export class ${Name}Controller {
  @Get('health')
  health(): { domain: string; ok: true } {
    return { domain: '${name}', ok: true };
  }
}
`,

    [`api/${name}.module.ts`]: `import { Module } from '@nestjs/common';
import { ${Name}Controller } from './controllers/${name}.controller';
import { ${nameSnake.toUpperCase()}_REPOSITORY } from '../core/ports/${name}.repository.port';
import { InMemory${Name}Repository } from '../infra/repositories/in-memory-${name}.repository';

@Module({
  controllers: [${Name}Controller],
  providers: [
    {
      provide: ${nameSnake.toUpperCase()}_REPOSITORY,
      useClass: InMemory${Name}Repository,
    },
  ],
  exports: [],
})
export class ${Name}Module {}
`,

    // ── top-level ─────────────────────────────────────────────────────
    [`index.ts`]: `export { ${Name}Module } from './api/${name}.module';
`,

    [`README.md`]: `# ${Name} domain

_Scaffolded by \`pnpm create-domain ${name}\`. Follow the shape of \`order/\` — see its README._

## What does this domain own?

TODO: one paragraph.

## How does it connect to other domains?

- **Publishes:** TODO
- **Subscribes to:** TODO

## How do I add a new use case? (the recipe)

1. Entity in \`core/entities/\`
2. Port in \`core/ports/\` if needed
3. Use case in \`application/use-cases/\`
4. Adapter in \`infra/repositories/\`
5. Controller in \`api/controllers/\`
6. Contract in \`contracts/${name}/\`
7. Tests at all three levels
`,
  };

  for (const [rel, content] of Object.entries(files)) {
    const full = resolve(domainRoot, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }

  console.log(`✓ Created backend/api/src/domains/${name}/{core,application,infra,api}`);
  console.log(`✓ Created ${name}.module.ts, ${name}.controller.ts`);
  console.log(`✓ Created ${name}.repository.port.ts (port) + InMemory${Name}Repository (adapter)`);
  console.log(`✓ Created README.md`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Open backend/api/src/app.module.ts and add:`);
  console.log(`       import { ${Name}Module } from './domains/${name}/api/${name}.module';`);
  console.log(`     then add \`${Name}Module\` to the \`imports\` array.`);
  console.log(`  2. (optional) Add a contracts package at contracts/${name}/.`);
  console.log(`  3. (optional) Add a section to database/prisma/schema.prisma if this domain has tables.`);

  await tryPatchAppModule(name, Name);
}

async function tryPatchAppModule(name: string, Name: string): Promise<void> {
  const appModulePath = resolve(repoRoot, 'backend/api/src/app.module.ts');
  try {
    const content = await readFile(appModulePath, 'utf8');
    if (content.includes(`${Name}Module`)) {
      console.log(`ℹ️  ${Name}Module already referenced in app.module.ts — skipping auto-import`);
      return;
    }
    const importLine = `import { ${Name}Module } from './domains/${name}/api/${name}.module';`;
    // Insert import after the OrderModule import line (or top of domain imports).
    const patched = content
      .replace(
        /(import { OrderModule } from '\.\/domains\/order\/api\/order\.module';\n)/,
        `$1${importLine}\n`,
      )
      .replace(/(OrderModule,\n)/, `$1    ${Name}Module,\n`);

    if (patched !== content) {
      await writeFile(appModulePath, patched);
      console.log(`✓ Auto-registered ${Name}Module in app.module.ts`);
    } else {
      console.log(`ℹ️  Could not auto-patch app.module.ts — please add ${Name}Module manually`);
    }
  } catch {
    // Ignore — user can add manually.
  }
}

function toPascal(input: string): string {
  return input
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
