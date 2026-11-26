#!/usr/bin/env bun
/**
 * Stands in for `claude -p` in the worker tests: reads the prompt, does what FAKE_SCENARIO says
 * in the project directory (commit, push, call kammacron's MCP), and prints stream-json like the real one.
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const prompt = await new Response(Bun.stdin.stream()).text()
const cardId = Number(/# Card #(\d+)/.exec(prompt)?.[1])
const scenario = process.env['FAKE_SCENARIO'] ?? 'push'
const mcpPath = args[args.indexOf('--mcp-config') + 1] ?? ''
const mcp = (
  JSON.parse(readFileSync(mcpPath, 'utf8')) as {
    mcpServers: { kammacron: { url: string; headers: Record<string, string> } }
  }
).mcpServers.kammacron

const out = (line: unknown) => {
  console.log(JSON.stringify(line))
}
const sh = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' })
  out({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: cmd.join(' ') } }] },
  })
  out({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          content: r.stdout.toString() + r.stderr.toString(),
          is_error: r.exitCode !== 0,
        },
      ],
    },
  })
  return r.exitCode
}
let rpcId = 0
const tool = async (name: string, args: Record<string, unknown>) => {
  const r = await fetch(mcp.url, {
    method: 'POST',
    headers: {
      ...mcp.headers,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  return r.status
}
const commit = async (file: string, text: string) => {
  await Bun.write(file, text)
  sh(['git', 'add', file])
  sh([
    'git',
    '-c',
    'user.name=fake',
    '-c',
    'user.email=fake@x',
    'commit',
    '-m',
    `fix: card ${String(cardId)}`,
  ])
}
const result = (extra: Record<string, unknown> = {}) => {
  out({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 3,
    total_cost_usd: 0.01,
    session_id: 'fake-session',
    result: `DONE card=#${String(cardId)}`,
    permission_denials: [],
    ...extra,
  })
}

out({ type: 'system', subtype: 'init', session_id: 'fake-session', tools: [] })
out({
  type: 'assistant',
  message: { content: [{ type: 'text', text: `working on #${String(cardId)} (${scenario})` }] },
})

switch (scenario) {
  case 'push':
    await commit('fixed.txt', `fixed ${String(cardId)}\n`)
    sh(['git', 'push', 'origin', 'HEAD:main'])
    await tool('add_comment', { id: String(cardId), body: 'pushed the fix' })
    await tool('move_card', { id: String(cardId), status: 'done' })
    result()
    break
  case 'done':
    await tool('add_comment', { id: String(cardId), body: 'did it' })
    await tool('move_card', { id: String(cardId), status: 'done' })
    result()
    break
  case 'review':
    await tool('move_card', { id: String(cardId), status: 'review', reason: 'needs a person' })
    result()
    break
  case 'silent':
    result()
    break
  case 'auth':
    out({
      type: 'assistant',
      error: 'authentication_failed',
      message: { content: [{ type: 'text', text: 'Failed to authenticate. API Error: 401' }] },
    })
    result({
      is_error: true,
      api_error_status: 401,
      terminal_reason: 'api_error',
      result: 'Failed to authenticate. API Error: 401 OAuth access token is invalid.',
    })
    process.exit(1)
    break
  case 'rate':
    result({ is_error: true, api_error_status: 429, result: 'API Error: 429 rate limit' })
    process.exit(1)
    break
  case 'sleep':
    await Bun.sleep(60_000)
    result()
    break
  case 'args': {
    // says how it was started: the agent it runs as, that agent's definition, and the model
    const after = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null)
    result({
      result: JSON.stringify({
        agent: after('--agent'),
        agents: JSON.parse(after('--agents') ?? 'null') as unknown,
        model: after('--model'),
      }),
    })
    break
  }
}
