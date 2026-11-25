/**
 * Builds the npm package `kammacron` into dist/package: the server and CLI bundled for Bun
 * (dependencies stay external, so PGlite finds its wasm and data files), the migrations, the web
 * app, a package.json with the bin, and the README. `bun run pack` then `npm publish dist/package`.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const out = join(root, 'dist', 'package')
const server = join(root, 'apps', 'server')
const run = async (cmd: string[], cwd: string) => {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(' ')} failed`)
}

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

await run(['bun', 'run', 'build'], join(root, 'apps', 'web'))
await run(
  [
    'bun',
    'build',
    'src/cli.ts',
    '--target',
    'bun',
    '--packages',
    'external',
    '--outfile',
    join(out, 'cli.js'),
  ],
  server,
)
await cp(join(server, 'drizzle'), join(out, 'drizzle'), { recursive: true })
await cp(join(root, 'apps', 'web', 'dist', 'web', 'browser'), join(out, 'web'), { recursive: true })

const serverPkg = JSON.parse(await readFile(join(server, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}
const rootPkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
  version?: string
}
const version = process.env['KAMMACRON_VERSION'] ?? rootPkg.version ?? '0.1.0'
const pkg = {
  name: 'kammacron',
  version,
  description: 'Kanban + MCP + an unattended Claude Code worker, on your own machine',
  type: 'module',
  bin: { kammacron: 'cli.js' },
  files: ['cli.js', 'drizzle', 'web', 'README.md'],
  engines: { bun: '>=1.3.0' },
  license: 'MIT',
  repository: { type: 'git', url: 'git+https://github.com/bank20baht/kammacron.git' },
  dependencies: serverPkg.dependencies,
}
await writeFile(join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
await cp(join(root, 'README.md'), join(out, 'README.md'))
// the bin needs a shebang Bun reads
const cli = await readFile(join(out, 'cli.js'), 'utf8')
if (!cli.startsWith('#!')) await writeFile(join(out, 'cli.js'), `#!/usr/bin/env bun\n${cli}`)
console.log(`dist/package: kammacron ${version}`)
