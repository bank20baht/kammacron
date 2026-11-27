import { inFilter, mergeEvents, timelineEvents, took, type RunEventRow } from './run-events'

const at = (s: number) => new Date(Date.UTC(2026, 10, 27, 2, 40, s)).toISOString()
let seq = 0
const ev = (type: string, summary: string, data: unknown, s: number): RunEventRow => ({
  seq: ++seq,
  type,
  summary,
  data,
  created_at: at(s),
})

describe('run events', () => {
  it('pairs a Claude call with its result by id: both say how long it took', () => {
    const rows = timelineEvents([
      ev(
        'tool_use',
        'Bash git status',
        { id: 't1', name: 'Bash', input: { command: 'git status' } },
        8,
      ),
      ev('tool_result', 'M index.html', { tool_use_id: 't1', content: ' M index.html' }, 9),
    ])
    expect(rows.map((r) => [r.kind, r.tool, r.ms, r.status, r.look])).toEqual([
      ['tool_use', 'Bash', 1000, null, 'command'],
      ['tool_result', 'Bash', 1000, 'success', 'mono'],
    ])
    expect(rows[0]?.full).toBe('git status')
  })

  it("counts an edit's lines and says when the allowlist refused a call", () => {
    const rows = timelineEvents([
      ev(
        'tool_use',
        'Edit /shop/index.html',
        {
          id: 'e',
          name: 'Edit',
          input: { file_path: '/shop/index.html', old_string: 'a\nb', new_string: 'a\nc\nd' },
        },
        14,
      ),
      ev(
        'tool_use',
        'Bash git commit',
        { id: 'c', name: 'Bash', input: { command: 'git commit' } },
        22,
      ),
      ev(
        'tool_result',
        'error: Permission to use Bash …',
        {
          tool_use_id: 'c',
          is_error: true,
          content: 'Permission to use Bash with command git commit has been denied.',
        },
        23,
      ),
    ])
    expect(rows[0]?.diff).toEqual({ added: 3, removed: 2 })
    expect(rows[0]?.full).toBe('/shop/index.html')
    expect(rows[2]?.status).toBe('denied')
    expect(rows[2]?.icon).toBe('shield')
    const [edit, , denied] = rows
    expect(denied && inFilter(denied, 'errors')).toBe(true)
    expect(edit && inFilter(edit, 'errors')).toBe(false)
  })

  it("pairs Codex's call with the result right after it, and reads its exit code", () => {
    const rows = timelineEvents([
      ev('tool_use', 'Bash bun test', { command: 'bun test' }, 0),
      ev('tool_result', 'error: 1 fail', { exit_code: 1, aggregated_output: '1 fail' }, 3),
    ])
    expect(rows.map((r) => [r.ms, r.status])).toEqual([
      [3000, null],
      [3000, 'error'],
    ])
    expect(rows[1]?.full).toBe('1 fail')
  })

  it('falls back to the summary when the data was cut', () => {
    const [row] = timelineEvents([
      ev('tool_use', 'Write /a.txt', { truncated: true, json: '{"name":"Wri' }, 0),
    ])
    expect(row?.tool).toBe('Write')
    expect(row?.full).toBe('/a.txt')
    expect(row?.ms).toBeNull()
  })

  it('builds a row once: a new event leaves the rows before it as they were', () => {
    const call = ev('tool_use', 'Bash ls', { id: 'c', name: 'Bash', input: { command: 'ls' } }, 1)
    const said = ev('assistant', 'looking', { text: 'looking' }, 2)
    const first = timelineEvents([said, call])
    const result = ev('tool_result', 'a b', { tool_use_id: 'c', content: 'a b' }, 4)
    const next = timelineEvents([said, call, result])
    expect(next[0]).toBe(first[0])
    // the call's result arrived: its row is built again, with how long it took
    expect(next[1]).not.toBe(first[1])
    expect(next[1]?.ms).toBe(3000)
    expect(timelineEvents([said, call, result])[1]).toBe(next[1])
  })

  it('merges pages of events by seq, keeping the events it holds', () => {
    const [a, b, c, d] = [1, 2, 3, 4].map((n) => ({ ...ev('assistant', 'x', null, n), seq: n }))
    const held = [b, c].map((e) => e as RunEventRow)
    expect(mergeEvents(held, [c as RunEventRow])).toBe(held)
    const newer = mergeEvents(held, [{ ...(c as RunEventRow) }, d as RunEventRow])
    expect(newer.map((e) => e.seq)).toEqual([2, 3, 4])
    expect(newer[1]).toBe(c)
    expect(mergeEvents(newer, [a as RunEventRow]).map((e) => e.seq)).toEqual([1, 2, 3, 4])
  })

  it('says how long in ms, seconds or minutes', () => {
    expect(took(318)).toBe('318 ms')
    expect(took(4200)).toBe('4.2 s')
    expect(took(125_000)).toBe('2 min 5 s')
  })
})
