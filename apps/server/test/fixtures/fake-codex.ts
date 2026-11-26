#!/usr/bin/env bun
/**
 * Stands in for `codex exec --json` in the worker tests: reads the prompt on stdin, does what
 * FAKE_SCENARIO says through kammacron's MCP (with the token in KAMMACRON_RUN_TOKEN), and prints
 * the JSON lines the real one prints.
 */
const args = process.argv.slice(2)
const prompt = await new Response(Bun.stdin.stream()).text()
const scenario = process.env['FAKE_SCENARIO'] ?? 'take'
const urlArg = args.find((a) => a.startsWith('mcp_servers.kammacron.url=')) ?? ''
const url = JSON.parse(urlArg.slice(urlArg.indexOf('=') + 1)) as string
const token = process.env['KAMMACRON_RUN_TOKEN'] ?? ''

const out = (line: unknown) => {
  console.log(JSON.stringify(line))
}
const DONE_ITEM = 'item.completed'
let rpcId = 0
const tool = async (name: string, toolArgs: Record<string, unknown>) => {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: { name, arguments: toolArgs },
    }),
  })
  const text = await r.text()
  out({
    type: DONE_ITEM,
    item: { id: `t${String(rpcId)}`, type: 'mcp_tool_call', server: 'kammacron', tool: name },
  })
  return text
}

out({ type: 'thread.started', thread_id: 'fake-thread' })
out({ type: 'turn.started' })

// the first card the prompt lists, as a board-using schedule hands them over
const listed = /^- #(\d+) /m.exec(prompt)?.[1]

switch (scenario) {
  case 'take': {
    if (!listed) {
      out({ type: DONE_ITEM, item: { type: 'agent_message', text: 'no card to take' } })
      break
    }
    await tool('move_card', { id: listed, status: 'doing' })
    await tool('add_comment', { id: listed, body: `codex did #${listed}` })
    await tool('move_card', { id: listed, status: 'done' })
    out({ type: DONE_ITEM, item: { type: 'agent_message', text: `took #${listed}` } })
    break
  }
  case 'other-card': {
    // FAKE_CARD is a card of another project: the run's token must not reach it
    const answer = await tool('add_comment', { id: process.env['FAKE_CARD'] ?? '0', body: 'x' })
    out({ type: DONE_ITEM, item: { type: 'agent_message', text: answer } })
    break
  }
  case 'echo':
    out({ type: DONE_ITEM, item: { type: 'agent_message', text: prompt } })
    break
  case 'fail':
    out({ type: 'turn.failed', error: { message: 'stream disconnected' } })
    process.exit(1)
}
out({
  type: 'turn.completed',
  usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 },
})
