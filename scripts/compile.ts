/**
 * A single-file binary: `bun run compile` → dist/bin/kammacron-<os>-<arch> (or --target, e.g.
 * bun-linux-x64). Bun embeds files imported `with { type: 'file' }`; this script generates an entry
 * that imports every migration, the built web app and PGlite's wasm and data that way, unpacks
 * them under <data>/app/<version>/ on first start, and then runs the CLI.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

const root = join(import.meta.dir, '..')
const server = join(root, 'apps', 'server')
const web = join(root, 'apps', 'web', 'dist', 'web', 'browser')
const work = join(root, 'dist', 'compile')
const target = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length)

const run = async (cmd: string[], cwd: string) => {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(' ')} failed`)
}
const walk = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { withFileTypes: true })).flatMap((d) => [d]).length === 0
    ? []
    : (
        await Promise.all(
          (await readdir(dir, { withFileTypes: true })).map((d) =>
            d.isDirectory() ? walk(join(dir, d.name)) : Promise.resolve([join(dir, d.name)]),
          ),
        )
      ).flat()

await rm(work, { recursive: true, force: true })
await mkdir(work, { recursive: true })
await run(['bun', 'run', 'build'], join(root, 'apps', 'web'))

const pglite = dirname(Bun.resolveSync('@electric-sql/pglite', server))
const version =
  (JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version?: string })
    .version ?? '0.0.0'
const assets: [string, string][] = [
  ...(await walk(join(server, 'drizzle'))).map((f): [string, string] => [
    `drizzle/${relative(join(server, 'drizzle'), f)}`,
    f,
  ]),
  ...(await walk(web)).map((f): [string, string] => [`web/${relative(web, f)}`, f]),
]
const lines = [
  "import { mkdir, writeFile } from 'node:fs/promises'",
  "import { homedir } from 'node:os'",
  "import { dirname, join } from 'node:path'",
  `import pgliteWasm from ${JSON.stringify(join(pglite, 'pglite.wasm'))} with { type: 'file' }`,
  `import initdbWasm from ${JSON.stringify(join(pglite, 'initdb.wasm'))} with { type: 'file' }`,
  `import pgliteData from ${JSON.stringify(join(pglite, 'pglite.data'))} with { type: 'file' }`,
  `import { usePgliteAssets } from ${JSON.stringify(join(server, 'src', 'db', 'index.ts'))}`,
  ...assets.map(
    ([, file], i) => `import a${String(i)} from ${JSON.stringify(file)} with { type: 'file' }`,
  ),
  `const ASSETS: [string, string][] = [${assets.map(([name], i) => `[${JSON.stringify(name)}, a${String(i)}]`).join(', ')}]`,
  'const flag = Bun.argv.indexOf("--data-dir")',
  "const dataDir = (flag > 0 ? Bun.argv[flag + 1] : undefined) ?? process.env['KAMMACRON_DATA_DIR'] ?? join(homedir(), '.kammacron')",
  `const app = join(dataDir, 'app', ${JSON.stringify(version)})`,
  "if (!(await Bun.file(join(app, 'ok')).exists())) {",
  '  for (const [name, file] of ASSETS) {',
  '    await mkdir(dirname(join(app, name)), { recursive: true })',
  '    await writeFile(join(app, name), new Uint8Array(await Bun.file(file).arrayBuffer()))',
  '  }',
  "  await writeFile(join(app, 'ok'), '')",
  '}',
  "process.env['KAMMACRON_MIGRATIONS'] ??= join(app, 'drizzle')",
  `process.env['KAMMACRON_VERSION'] ??= ${JSON.stringify(version)}`,
  "process.env['KAMMACRON_WEB_DIR'] ??= join(app, 'web')",
  'usePgliteAssets({',
  '  pgliteWasmModule: await WebAssembly.compile(await Bun.file(pgliteWasm).arrayBuffer()),',
  '  initdbWasmModule: await WebAssembly.compile(await Bun.file(initdbWasm).arrayBuffer()),',
  '  fsBundle: new Blob([await Bun.file(pgliteData).arrayBuffer()]),',
  '})',
  `await import(${JSON.stringify(join(server, 'src', 'cli.ts'))})`,
]
await writeFile(join(work, 'entry.ts'), `${lines.join('\n')}\n`)

const name = `kammacron-${target?.replace(/^bun-/, '') ?? `${process.platform}-${process.arch}`}`
const outfile = join(root, 'dist', 'bin', name)
await mkdir(dirname(outfile), { recursive: true })
await run(
  [
    'bun',
    'build',
    join(work, 'entry.ts'),
    '--compile',
    '--minify',
    ...(target ? ['--target', target] : []),
    '--outfile',
    outfile,
  ],
  server,
)
console.log(`${outfile} (kammacron ${version}, ${String(assets.length)} embedded files)`)
