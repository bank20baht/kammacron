# Spec: playbook — kammacron ในฐานะ Ansible ฉบับเรียบง่าย

Nov 25, 2026 · @bank20baht · สถานะ: **ตัดสินใจแล้ว กำลังทำ**

## เป้าหมาย

kammacron เป็นตัวสั่งงาน ไม่ใช่ตัวจัดการ git ทำหน้าที่สามอย่าง:

1. งานจะรัน **ที่ dir ไหน** (dir บนเครื่องนี้)
2. รัน **เมื่อไร** (การ์ดบนบอร์ดที่ถึงคิว ตามรอบของโปรเจกต์)
3. รัน **อะไร** (playbook)

แล้ว**รายงานผล**ลงบอร์ด ส่วนงานจะไปทำที่เครื่องไหนหรือด้วยวิธีไหน (worktree, ssh, deploy, migrate) เป็นเรื่องของ playbook และ instruction ของโปรเจกต์ kammacron ไม่เข้าไปยุ่ง

## สิ่งที่คงไว้

- การ์ดบนบอร์ดยังเป็นหน่วยงานเหมือนเดิม: `todo → doing → review/done`, `claude`/`human` และ `waits_on`
- รอบเวลาของโปรเจกต์ ปฏิทิน หน้า Runs สถิติ การแจ้งเตือน และ MCP

## Playbook

playbook คือลำดับ step ที่รันทุกครั้งที่ worker หยิบการ์ดหนึ่งใบ:

```yaml
# ตัวอย่างแบบ advanced
steps:
  - name: ทำการ์ด
    claude: {} # template: เรียก claude -p กับการ์ดนี้

  - name: test
    run: bun test

  - name: deploy ไปเครื่อง app
    run: ssh app@10.0.0.5 'cd /srv/app && git pull && ./restart.sh'
    timeout: 10m

  - name: migrate
    run: ssh db.internal './migrate.sh'
```

ถ้าโปรเจกต์ไม่มี playbook จะใช้ค่าเริ่มต้นที่มีแค่ step เดียว:

```yaml
steps:
  - claude: {}
```

ค่าเริ่มต้นนี้คือการใช้แบบ "แค่ `claude -p` ไปเฉยๆ"

### Step ชนิด `run`

- รัน `sh -c <คำสั่ง>` ใน dir ของโปรเจกต์ ด้วย PATH ของ worker
- ssh ไม่มี step ชนิดพิเศษ ใช้ `run: ssh …` ได้เลย โดยอาศัย key และ `~/.ssh/config` ของเครื่อง
- ตัวเลือก:
  - `timeout` (ค่าเริ่มต้น 15m)
  - `env` (ตัวแปรเพิ่มเติม)
  - `continue_on_error: true` (step ล้มแล้วยังไปต่อ)
- ข้อมูลของการ์ดส่งเข้าเป็น **ตัวแปร environment** ไม่ได้แทนลงในข้อความคำสั่ง จึงไม่มีทางที่ชื่อการ์ดจะกลายเป็นคำสั่ง shell:
  - `KAMMACRON_CARD_ID`
  - `KAMMACRON_CARD_TITLE`
  - `KAMMACRON_CARD_FILE` (path ของไฟล์ markdown ที่มีเนื้อหาการ์ดกับคอมเมนต์)
  - `KAMMACRON_RUN_ID`
  - `KAMMACRON_PROJECT_DIR`

### Step ชนิด `claude` (template)

- ทำแบบเดียวกับตอนนี้ คือรวม prompt จากการ์ด คอมเมนต์ run ก่อนหน้า `.claude-worker/prompt.md` และ Extra rules
- รันด้วย tool allowlist ไม่ใช้ `--dangerously-skip-permissions` และให้ MCP ของ kammacron กับ server ที่โปรเจกต์เปิดไว้
- ตัวเลือก ถ้าไม่ใส่จะใช้ค่าจาก settings ของโปรเจกต์:
  - `prompt` (ข้อความเพิ่มท้าย)
  - `model`
  - `max_turns`
  - `allow` (คำสั่ง Bash ที่อนุญาตเพิ่ม)
- ใส่ได้หลาย step ในหนึ่ง playbook เช่น step หนึ่งให้แก้โค้ด อีก step ให้เขียน changelog

### ผลของ run

- step รันตามลำดับ ถ้า step ไหนล้ม (และไม่ได้ตั้ง `continue_on_error`) จะหยุดทันที
- ผ่านครบทุก step:
  - การ์ดไปอยู่ตามที่ step `claude` ตั้งไว้ผ่าน MCP (done, review หรือถามคน)
  - ถ้า playbook ไม่มี step `claude` การ์ดจะไป `done`
- step ล้ม: การ์ดไป `review` โดยระบุว่าล้มที่ step ไหน พร้อม output ท้ายๆ ไว้ในคอมเมนต์
- หน้า Runs แสดงทีละ step: ชื่อ เวลา exit code และ output (step `claude` แสดง event stream แบบที่มีอยู่)

## สิ่งที่ตัดออกหรือย้ายไปเป็น step

| ตอนนี้                                                        | ต่อไป                                        |
| ----------------------------------------------------------- | ------------------------------------------- |
| `setup_command`                                             | step `run` ตัวแรก                            |
| `verify_command` + revert อัตโนมัติ                            | step `run` (ถ้าอยาก revert ให้เขียนเองในคำสั่ง)  |
| worktree แยก, การข้ามรอบเมื่อ dir สกปรก, การคืน branch          | ตัดออก ถ้าต้องการให้เขียนใน instruction หรือ step |
| gate (`max_diff_lines`, `protected_paths`), `claude/<card>` | ตัดออก                                       |
| ตรวจ ref ที่ขยับหลัง run แล้ว pause โปรเจกต์                      | ตัดออก                                       |
| `ship_policy` + Approve ที่ rebase แล้ว push ให้                | ตัดออก Review เหลือแค่ให้คนอ่าน ตอบ แล้วย้ายการ์ด   |
| badge แสดง branch ของ dir บนบอร์ด                            | คงไว้ (อ่านอย่างเดียว ไม่ได้แตะ git)              |

โปรเจกต์เดิมที่ตั้ง `setup_command` หรือ `verify_command` ไว้ ตอน migrate จะได้ playbook ที่มี step เหล่านี้ให้อัตโนมัติ

## การตัดสินใจ

| เรื่อง             | ตัดสินใจ                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| playbook เก็บที่ไหน | ใน DB แก้ในหน้า settings ของโปรเจกต์ ไม่มีไฟล์เพิ่มใน dir                                                     |
| เครื่องมือ git เดิม  | ตัดออกหมดตามตารางข้างบน                                                                                 |
| จำนวน playbook   | หลายอันต่อโปรเจกต์ (`default` และอันที่ตั้งชื่อ) การ์ดเลือกด้วย tag `playbook:<name>` และถูกหยิบได้แม้ไม่มี tag `claude` |
| schedules        | รันคำสั่ง shell หรือ playbook ก็ได้ แบบ playbook เปิดการ์ดใหม่ทุกรอบให้ worker รัน แต่ไม่เปิดซ้ำถ้าใบก่อนยังไม่ done      |

## ลำดับการทำ (หลังตัดสินใจ)

1. ตัวอ่านและตรวจ playbook พร้อม test
2. runner รันทีละ step ใช้ step `claude` จากโค้ดที่มีอยู่ แล้วเพิ่ม step `run`
3. ตาราง `run_steps` และหน้า Runs ที่แสดงทีละ step
4. ตัดของ git ที่ตกลงว่าจะเอาออก แล้ว migrate ค่าตั้งเดิมเป็น step
5. หน้าแก้ playbook ใน settings ของโปรเจกต์ พร้อมปุ่มเพิ่ม step `claude` (template) และ step `run`
6. อัปเดต docs site และ README
