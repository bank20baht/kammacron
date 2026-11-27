# kammacron — ผลรีวิว UX สำหรับแก้ไขต่อ

วันที่รีวิว: 27 พฤศจิกายน 2026

เอกสารนี้รวบรวมผลตรวจโค้ดและหน้าจอผ่าน Ego Lite เพื่อให้ Claude นำไปแก้ไขต่อ ยังไม่ได้แก้ application code ตามรายการด้านล่าง

## ขอบเขตและข้อกำหนด

- ตรวจ Board, Runs, Review, Cron, Calendar, Stats, Settings และฟอร์มสร้าง Project/Cron บน desktop และ viewport มือถือ 390px รวมทั้ง light/dark theme
- ใช้ข้อมูลพรีวิวที่มีโปรเจกต์เดียว ไม่มี task/run/review queue ให้ตรวจกรณีข้อมูลจำนวนมาก จึงแยกข้อที่ยืนยันจากหน้าจอจริงออกจากข้อที่พบจากโค้ด
- ไม่ได้สั่ง worker ทำงาน ไม่ได้ล้างข้อมูล และไม่ได้บันทึกค่าที่เปลี่ยนระหว่างตรวจฟอร์ม
- รักษา Angular และ `@20baht/ui` / `@20baht/angular` เป็นพื้นฐานเดิม ขณะรีวิวติดตั้งเวอร์ชัน 0.3.41
- ใช้ public APIs และ composition ของ library ห้ามสร้าง functional components ซ้ำ หรือแก้ library internals
- รักษา business logic และ API contracts เดิม หากพบข้อจำกัด reusable ของ library จริง ให้ตรวจ APIs ก่อนบันทึกใน `LIB_GAP.md`
- คงภาพตกแต่งแบบวัตถุชนบทชิ้นเดียวที่อนุมัติแล้ว ไม่ต้องสร้าง artwork ใหม่เพื่อแก้รายการนี้

## 1. P1 — Clean now ใช้ค่าคนละชุดกับพรีวิว

**หลักฐาน:** ยืนยันจากโค้ดหน้าเว็บและ backend ไม่ได้ทดลองลบข้อมูลจริง

ตำแหน่ง:

- `apps/web/src/app/modules/settings/data-settings.component.ts` — `changed()`, `read(choice)`, `clean()` และปุ่ม Clean now
- `apps/server/src/routes/system.ts` — `GET /data` และ `POST /data/clean`
- `apps/server/src/services/retention.ts` — `cleanUp()`

เมื่อเปลี่ยน retention โดยยังไม่ Save หน้าเว็บขอสรุปด้วยค่าที่เลือกใหม่ แต่ `clean()` เรียก endpoint โดยไม่บันทึกค่าที่เลือก และ backend อ่าน retention ที่บันทึกอยู่เดิม จึงอาจลบข้อมูลไม่ตรงกับพรีวิว เช่น เปลี่ยนจากเก็บ 7 วันเป็นเก็บตลอด พรีวิวไม่มีรายการที่จะลบ แต่กด Clean แล้ว backend ยังใช้ 7 วัน

แนวทางแก้:

- แยกสถานะค่าที่บันทึกแล้วกับค่าที่กำลังแก้ให้ชัด ปิด Clean now เมื่อมีค่าที่เปลี่ยนและยังไม่ Save พร้อมข้อความว่าต้องบันทึกหรือยกเลิกการแก้ไขก่อน
- ก่อนล้าง ให้แสดงสรุปตามค่าที่บันทึกแล้วและขอยืนยันด้วย dialog ของ library โดยแยกรายการที่จะลบกับรายการที่จะ archive
- ห้ามบันทึก retention ใหม่โดยเงียบ ๆ เมื่อผู้ใช้กด Clean

เกณฑ์ตรวจรับ:

- เมื่อมีการเปลี่ยน retention ที่ยังไม่ Save จะสั่งล้างไม่ได้
- หลัง Save สำเร็จ สรุปและคำสั่งล้างใช้ retention ชุดเดียวกัน
- หาก Save ล้มเหลว ต้องไม่เปิดทางให้ล้างโดยอ้างอิงพรีวิวของค่าที่ยังไม่บันทึก
- ยกเลิก dialog แล้วไม่มีคำสั่งล้างส่งออกไป
- ทดสอบกรณีนี้ด้วย fixture แยกเท่านั้น ไม่ล้างข้อมูลจริงของผู้ใช้

## 2. P2 — ออกจาก Project Settings แล้ว draft หายโดยไม่มีคำเตือน

**หลักฐาน:** ทดลองในหน้าจอจริง แก้ชื่อจนแถบ Save ขึ้น แล้วคลิก Board ออกจากหน้าได้โดยไม่มีคำเตือน เมื่อกลับมาค่าที่ร่างไว้หาย

ตำแหน่ง:

- `apps/web/src/app/modules/settings/project-settings.component.html` — `baht-save-bar` ที่มี `warn-on-leave`
- `apps/web/src/app/modules/settings/project-settings.component.ts` — `dirty`, `go()`, `save()`, `discard()`
- `apps/web/src/app/app.routes.ts` — route `settings/projects/:id`
- `apps/web/src/app/modules/settings/playbook-editor.component.ts` — ตรวจพฤติกรรม draft ของ editor ด้วย

`warn-on-leave` ใน library รุ่นที่ตรวจผูกกับ `beforeunload` จึงไม่ครอบคลุม Angular route navigation

แนวทางแก้:

- เพิ่มการป้องกันการออกจาก route เมื่อมี draft ด้วยกลไก Angular ที่เหมาะสม และ dialog ของ library
- ตรวจการสลับออกจาก Playbook tab ด้วย เพราะ editor ถูกถอดออกจาก DOM เมื่อเปลี่ยน tab
- ตรวจปุ่มภายในหน้า sidebar และ browser Back ให้มีพฤติกรรมสอดคล้องกัน

เกณฑ์ตรวจรับ:

- เมื่อ dirty การเปลี่ยนหน้า/ออกจาก editor ที่จะทำให้ draft หายต้องให้ผู้ใช้ตัดสินใจก่อน
- เลือกอยู่ต่อแล้ว draft คงอยู่ครบ เลือกทิ้งแล้วจึงเปลี่ยนหน้าได้
- หลัง Save สำเร็จหรือ Discard แล้วไม่เตือนซ้ำ
- ฟังก์ชันเตือนตอน reload/ปิด tab เดิมยังทำงาน

## 3. P2 — โหลดข้อมูลผิดพลาดแล้วไม่มี error state และ Retry ที่ชัดเจน

**หลักฐาน:** ทดลองบล็อก request ของ Stats ใน browser พบว่าพื้นที่ข้อมูลหายไปโดยไม่มีคำอธิบายหรือ Retry ส่วน Review พบจากโค้ดว่าไม่มี branch แสดง error ของการโหลด queue

ตำแหน่ง:

- `apps/web/src/app/modules/stats/stats.component.ts` — template ที่อ่าน `stats.value()` และ resource loader
- `apps/web/src/app/modules/review/review.component.ts` — branch `cards().data` / skeleton

แนวทางแก้:

- แยก loading, error, empty และ loaded ให้ชัด โดยใช้ `baht-error-state` และปุ่มลองใหม่จาก library
- สำหรับ Angular resource ให้ตรวจสถานะก่อนอ่าน value เมื่อ request ล้มเหลว
- ใช้การ reload/resubscribe ที่ API ปัจจุบันรองรับ ไม่เพิ่ม polling ซ้ำซ้อน
- ตรวจหน้าที่มีรูปแบบเดียวกัน เช่น Cron และ Project wizard และแก้เฉพาะกรณีที่ยืนยันว่ามีปัญหา

เกณฑ์ตรวจรับ:

- request ล้มเหลวแล้วมีข้อความที่เข้าใจได้และทางลองใหม่ ไม่ค้าง skeleton หรือว่างเปล่า
- ลองใหม่หลังเครือข่ายกลับมาแล้วเห็นข้อมูลตามปกติ
- ข้อมูลว่างจริงแสดง empty state ไม่แสดงเป็น error
- เปลี่ยนช่วงเวลาใน Stats แล้ว error/loading state สอดคล้องกับ request ล่าสุด

## 4. P2 — รายการ Cron job ไม่มีทางแก้ไขงานเดิม

**หลักฐาน:** ตรวจ template รายการ Cron และ API ปัจจุบัน รายการมี Last run, เปิด/ปิด และ Remove แต่ไม่มี Edit ขณะที่ backend รองรับ `PATCH /schedules/:id` อยู่แล้ว

ตำแหน่ง:

- `apps/web/src/app/modules/cron/cron-jobs.component.ts`
- `apps/web/src/app/modules/cron/cron-wizard.component.ts`
- `apps/web/src/app/shared/cron-wizard.ts`
- `apps/server/src/routes/runs.ts` — `PATCH /schedules/:id`

แนวทางแก้:

- เพิ่ม Edit โดย reuse wizard/form composition เดิม พร้อมเติมค่าของ job ที่เลือก
- รองรับการแก้เวลา prompt และค่าที่เกี่ยวข้องกับชนิดงาน ผ่าน contract ที่มีอยู่
- แสดงโหมดสร้าง/แก้ไขให้ชัด และรักษาค่าที่ไม่ได้เปลี่ยน
- แสดงชื่อโปรเจกต์ให้ชัดทั้งในรายการและฟอร์มที่ล็อกโปรเจกต์ไว้ ปัจจุบันเมื่อมีโปรเจกต์เดียว tabs ไม่แสดง และหัวรายการเขียนเพียง “Jobs of this project”

เกณฑ์ตรวจรับ:

- แก้ job เดิมแล้วใช้ PATCH กับ id เดิม ไม่ลบแล้วสร้างใหม่
- ประวัติและความเชื่อมโยงกับ run เดิมยังอยู่
- ยกเลิกแล้วไม่บันทึก การบันทึกล้มเหลวแล้วยังเก็บค่าที่กรอกไว้ให้ลองใหม่
- เปิด Edit หลายงานต่อกันแล้วไม่มีค่าของงานก่อนหน้าค้าง
- ทดสอบ job ที่สร้างด้วย interval และ cron รวมถึงชนิดงานที่รองรับ

## 5. P2 — Calendar บนมือถือใช้พื้นที่ก่อนถึงข้อมูลมาก และหาวันนี้ได้ช้า

**หลักฐาน:** ตรวจหน้าจอจริงที่ 390px หัวหน้า คำอธิบาย รูป และตัวกรองกินพื้นที่มากก่อนถึงตาราง มุมมอง Week เริ่มที่ต้นสัปดาห์ทำให้วันนี้อาจอยู่นอกส่วนที่มองเห็นในแนวนอน

ตำแหน่ง:

- `apps/web/src/app/modules/calendar/calendar.component.ts` — page header, tools และค่าเริ่มต้น `view()` เป็น `week`
- `apps/web/src/styles.css` — page spacing และ public PageHeader art sizing

แนวทางแก้:

- เมื่อไม่มีมุมมองที่ผู้ใช้เลือกไว้ ให้พิจารณา default เป็น Day บนมือถือ และคง Week บน desktop
- เคารพ `?view=...&date=...` และการเลือกของผู้ใช้เสมอ ไม่เปลี่ยนมุมมองทับขณะใช้งานเพราะ resize
- ลดพื้นที่หัวหน้าเฉพาะหน้าจอแคบผ่าน composition/public APIs โดยรักษารูปตกแต่งให้เล็กและไม่แย่งพื้นที่ตาราง
- ทำให้ Today พาไปเห็นวันที่เกี่ยวข้องจริง ตรวจ public APIs ของ calendar ก่อนปรับ scroll behavior

เกณฑ์ตรวจรับ:

- เปิดบนมือถือแล้วเข้าถึงวันปัจจุบันได้โดยไม่ต้องเลื่อนแนวนอนหาเองในค่าเริ่มต้น
- ลิงก์ที่ระบุมุมมองและวันที่ยังเปิดตรงตามนั้น
- สลับ Day/Week/Month, Previous/Next และ Today ได้ตามปกติ
- ไม่เกิด horizontal overflow ของทั้งหน้า ตารางที่ต้องเลื่อนมีขอบเขตของตัวเอง

## 6. P2 — Review บนมือถือวาง queue ทั้งหมดก่อนรายละเอียด

**หลักฐาน:** พบจากโค้ด ยังไม่ได้ยืนยันด้วย queue จำนวนมากใน browser เพราะข้อมูลพรีวิวไม่มีงานรอ Review

ตำแหน่ง:

- `apps/web/src/app/modules/review/review.component.ts` — `.split`, breakpoint ต่ำกว่า 900px, queue และรายละเอียดที่เลือก

เมื่อจอแคบ layout เปลี่ยนเป็นคอลัมน์เดียว แต่ queue ทุกใบยังอยู่ก่อนรายละเอียด ผู้ใช้ที่มีงานรอตรวจจำนวนมากจึงต้องเลื่อนผ่านทั้งรายการก่อนตัดสินใจ และคลิกเปลี่ยนงานแล้วอาจไม่เห็นว่ารายละเอียดเปลี่ยนตรงไหน

แนวทางแก้:

- ตรวจด้วย fixture หลายรายการก่อนเลือกวิธีแก้
- บนมือถือให้แยกมุมรายการกับมุมรายละเอียด มีทางกลับ queue และไปงานถัดไปที่ชัดเจน โดยคง layout สองฝั่งบน desktop
- รักษา `?card=<id>` และการเข้าตรงจากลิงก์เดิม
- ตรวจ keyboard interaction ของ queue ปัจจุบันประกาศ `listbox`/`option` แต่รองรับเพียง Enter และให้ทุก option เป็น tab stop หากคง semantics นี้ให้เติม keyboard behavior ที่สอดคล้อง หรือใช้ navigation primitive ที่เหมาะสมจาก library

เกณฑ์ตรวจรับ:

- ใช้ fixture อย่างน้อย 20 งาน แล้วเลือกงานบนมือถือเพื่อเข้าถึงรายละเอียดได้ทันที
- ทำรายการด้วย keyboard ได้ และ focus อยู่ในตำแหน่งที่เข้าใจได้หลังเปลี่ยนมุม/เปลี่ยนงาน
- deep link ยังเลือกงานถูกต้อง
- approve/send back สำเร็จแล้วการเลือกงานถัดไปและ empty state ถูกต้อง

## 7. P3 — Stats บอกว่ามีหนึ่ง run ทั้งที่ตัวเลขเป็นศูนย์

**หลักฐาน:** พบจากหน้าจอจริง: Runs = 0 แต่ alert แสดง “Only one run in this period: no trend yet.”

ตำแหน่ง:

- `apps/web/src/app/modules/stats/stats.component.ts` — เงื่อนไข `s.total.runs <= 1`
- `apps/web/src/app/core/i18n/en/stats.ts` — `noTrend` และข้อความภาษาอื่นที่มีอยู่

แนวทางแก้และเกณฑ์ตรวจรับ:

- แยกข้อความ/การแสดงผลกรณี 0 run กับ 1 run
- 0 run ต้องสื่อว่ายังไม่มีข้อมูล 1 run จึงสื่อว่ายังไม่มีแนวโน้ม และมากกว่า 1 run ไม่แสดงข้อความนี้
- ใช้ i18n เดิม ไม่ hardcode ข้อความใน template

## การส่งมอบและตรวจสอบ

1. เริ่มข้อ 1–3 ก่อน แล้วจึง workflow และ mobile UX
2. ตรวจ public APIs ของ `@20baht/ui` เวอร์ชันที่ติดตั้งจริงก่อนลงมือ โดยเฉพาะ dialog, error state, workflow, calendar และ navigation
3. ทดสอบกรณีเสี่ยงข้อมูลสูญหายด้วยข้อมูลแยก เพิ่ม regression tests ที่ตรวจพฤติกรรมสำคัญ ไม่เขียน test ที่เพียงสะท้อน implementation
4. ตรวจ desktop/mobile, light/dark, keyboard และการคง draft หลัง error
5. รันคำสั่ง lint, format check, typecheck, build และ tests ที่เกี่ยวข้องตาม scripts ปัจจุบันของ repository แก้ regression ที่เกิดจากงานนี้
6. สรุปสิ่งที่แก้ ผลตรวจ และข้อที่ยังยืนยันไม่ได้ หากมีการเปลี่ยน composition/interaction ที่ควรบันทึก ให้ปรับ `DESIGN.md` ให้ตรงกับผลลัพธ์จริง

หมายเหตุ: หน้าขาวที่พบตอนเปิด dev server เก่าพอร์ต 4300 ไม่รวมเป็นข้อบกพร่องของ application ในรีวิวนี้ เพราะเปิด dev server ใหม่พอร์ต 4301 แล้วแสดงผลได้ตามปกติ
