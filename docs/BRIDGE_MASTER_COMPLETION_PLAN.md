# BRIDGE MASTER COMPLETION PLAN

Ngày audit: **2026-09-08**, UTC+7. Phạm vi: khảo sát source và runtime, lập kế hoạch; không sửa source, không tạo PR, không deploy, không gửi task mới cho agent.

Repo source of truth: https://github.com/machxanht/BridgeChatgpt

Root thực tế: `E:\AI\Bridge`; app: `E:\AI\Bridge\Apps\BridgeChatgpt`. File này nằm tại root `docs/`, không phải `Apps/BridgeChatgpt/docs/`. Workspace mặc định của phiên Codex trên ổ C không phải checkout được audit.

Baseline GitHub `main` và local HEAD cùng là **6700fca51cdbabe8378ba107c7185d32c9eeaefd**. Mọi đường dẫn source dưới đây tương đối với `E:\AI\Bridge`, và mọi line/symbol tham chiếu gắn với SHA này. Các con số cấu hình mục tiêu là quyết định thiết kế cần kiểm thử, không phải số đo hiệu năng hiện tại.

## 1. CURRENT STATE

### 1.1 Evidence ledger — những gì đã kiểm tra

| ID | Kiểm tra trong lượt audit | Kết quả và giới hạn |
|---|---|---|
| E01 | `git remote -v`, `git rev-parse HEAD`, `git ls-remote origin refs/heads/main`, `git status --short` tại root E | Remote đúng repo; HEAD = main = SHA trên. Không có tracked diff. Có sẵn ba untracked file `runtime/astra.txt`, `runtime/codex-e2e.txt`, `runtime/codex-e2e2.txt`; không sửa/xóa chúng. |
| E02 | Railway list deployments, service config | Deployment **be370e49-82dc-457d-85c1-a98d2d651026**, SUCCESS, created `2026-09-08T11:02:28.242Z`, updated `11:03:11.803Z`; metadata commitHash đúng SHA baseline. Một replica tại iad, persistent volume `/app/data`, healthcheck `/api/health`. |
| E03 | Railway deploy logs của E02 | `11:03:09Z` nạp `/app/data/bridge.sqlite`; Gemini API worker idle; GitHub bus local 5s/remote 60s; batch orchestrator 15s. Đây là startup proof, không phải agent proof. |
| E04 | HTTP logs Railway khoảng `11:29:30–11:30:55Z`; thêm cửa sổ `11:00–11:05Z` của deployment hiện hành | Worker GET tasks và browser GET wake queue khoảng 2s/lần. Cửa sổ thứ hai trả 204 entries, không có 5xx. Không thể suy ra không có 502 ngoài cửa sổ này hoặc ở deployment trước. |
| E05 | GET có auth `/api/tasks?limit=300` khoảng `11:31–11:32Z`, chỉ in metadata/error đã chọn | **100 tasks**: 46 completed, 27 pending, 18 failed, 3 assigned, 6 cancelled, 0 working trong snapshot. Không phải chỉ có 100 do limit=300: snapshot hiện chứa 100 records. |
| E06 | GET registry, wake queue, health | Registry có target ChatGPT và Studio cho Bridge. `/wake-queue` trả `events: []`, `event_count: 0` tại `11:31:00.944Z`; health ok. Không kiểm chứng model thật bằng health/registry label. |
| E07 | CLI thật trên PC | `agy --version` = **1.1.27**; `agy --help`, `agy models`, `agy help models`; `codex.cmd --version` = **0.153.4** và `codex.cmd exec --help`. Không chạy generation/coding task trong audit. |
| E08 | `npm run lint` | **FAIL**: 9 lỗi TS2554 tại `tests/wakeQueue.test.ts` lines 101,117,128,147,160,164,175,183,186: hàm nhận 0 đối số nhưng tests truyền 2. |
| E09 | `node --import tsx Apps/BridgeChatgpt/tests/wakeQueue.test.ts` | **FAIL** tại line 102: actual 0, expected 2. Test còn mong legacy delivery, trong khi producer đã bị tắt. |
| E10 | Tests riêng: auth, singleFlight, chatReturn, wakeDelivery; `node --check .../cli-agent-worker.mjs` | **PASS trong phạm vi từng test**. Không chứng minh auth an toàn tổng thể, CLI native, Windows cleanup hoặc E2E. Không chạy full `npm test` vì test DB có thao tác với state local; full build không chạy trong lượt chỉ viết plan. |
| E11 | Browser production read-only: AX tree, mở selector, screenshot | Có đủ sáu labels, dark UI, timestamps, human bên phải/agent bên trái, reply lịch sử thật đang được render. Có duplicate human messages, raw Markdown, mặc định Auto · Sol + Gemini, cả sáu selector hiện 0 req · 0 tok, không có feedback cho TASK-100 failed. Không gửi tin mới; light theme/mobile/restart chưa thử. |
| E12 | Local runtime | `runtime/cli-worker.err.log` chứa hai dòng `/api/tasks?limit=300 502`, không timestamp/stack. CIM nhận diện một process chạy `cli-agent-worker.mjs`, PID 12648, started khoảng `18:02:49` UTC+7. Process còn sống không chứng minh đang dùng chính xác bytes source hiện tại. |
| E13 | Đọc source tracked toàn bộ wake references và execution path | Xem inventory ở §2.2. Không đọc cookie, credential profile, không sửa Windows startup hoặc extension đã cài. |

Đã đọc AGENTS.md và bộ START_HERE/HANDOFF/ARCHITECTURE/SECURITY/RUNBOOK/ROADMAP/PROJECT_STANDARD/FREE_FIRST_POLICY. Mô tả cũ như “PC chưa có điện”, “wake queue phát prompt” không được dùng làm hiện trạng. Theo yêu cầu lần này chỉ tạo tài liệu này; không sửa bộ handoff khác hay push tài liệu lên GitHub.

Railway config còn một staged patch ID `5574a77f-48d3-499f-bd6d-786bfeb0d4aa`, báo 28 changes; chưa áp dụng trong audit. Không trộn staged configuration với active deployment. Start command hiện còn sửa `workspace-registry.json` để ép workspace đầu tiên `execution_target=pc` mỗi startup; cần đưa invariant này vào migration/config rõ ràng khi triển khai.

### 1.2 Agent matrix — exact IDs đã xác nhận và trạng thái thật

| UI agent | Transport bắt buộc | Model ID được chọn cho target | Evidence hiện có | Trạng thái E2E hiện tại |
|---|---|---|---|---|
| Sol 5.6 | ChatGPT browser | Chọn/kiểm tra Sol 5.6 tại ChatGPT UI; không giả định API slug | TASK-12/13 và các reply cũ còn trong DB/UI; TASK-98/99 pending; current queue luôn rỗng | **FAIL dispatch theo source hiện tại**; full current model/tool E2E chưa chứng minh |
| Gemini 3.8 Flash | Antigravity CLI | `gemini-3.8-flash-high` | `agy models` liệt kê exact ID; TASK-54/56 có reply render trong UI | Simple return lịch sử quan sát được; A/B trên release hiện hành chưa chứng minh |
| Claude Sonnet 4.6 | Antigravity CLI | `claude-sonnet-4-6` | CLI list ghi Thinking; TASK-97 có answer; TASK-100 failed `empty agent answer` | Tool/repo FAIL ở bản ghi lịch sử TASK-100; sau thay đổi permissions chưa chứng minh |
| Claude Opus 4.6 | Antigravity CLI | `claude-opus-4-6-thinking` | Exact ID có trong CLI; TASK-65 reply Opus hiện trong UI | Simple return lịch sử; E/F hiện hành chưa chứng minh |
| Codex Sol | Codex CLI | `gpt-5.6-sol` | Help xác nhận `-m`, stdin `-`, `-o`, sandbox, cwd; TASK-95/96 trả answer hiển thị | Simple return lịch sử; model execution trace và coding H chưa chứng minh |
| Codex Astra | Codex CLI | `gpt-6-astra` | Source pin ID; local `runtime/astra.txt` ghi ASTRA_OK | File rời không có task/conversation/execution provenance: **chưa chứng minh I/J** |

Không lấy câu model tự nhận “tôi là X” làm model proof. Không coi chữ E2E trong prompt hoặc answer là E2E test. Ví dụ prompt ghi “Opus” nhưng selector/binding có thể vẫn là Sonnet; phải kiểm tra lựa chọn, persisted route và native execution evidence cùng nhau.

### 1.3 PASS thật / FAIL / chưa chứng minh

**PASS có giới hạn:** source/deployment SHA khớp, persistent DB đã load, CLI binary/help/model-list chạy được, một số helper tests pass, UI render được reply lịch sử và metadata tên/giờ. Đó là các assertion cụ thể, không phải xác nhận sản phẩm đã hoàn thiện.

**FAIL đã có evidence:** lint và wake test; browser dispatch; duplicate human bubbles; TASK-100 empty answer; contract vẫn cho completed rỗng (TASK-49/53); `TaskStatus` không khai báo failed dù runtime ghi failed; không có conversation ID trong task/message schema.

**Chưa chứng minh:** mọi cặp simple + useful tool/coding qua toàn đường đi trên current release; exact browser model; local browser MCP/tool availability; actual AGY tool cwd; scoped permissions trên Windows; cleanup descendants; claim recovery sau restart; user Stop thực sự dừng CLI; persist crash-safety; light/mobile; PC startup; CI run status trên exact SHA. CI source có lint/tests/build nhưng audit không truy xuất được bằng chứng run tương ứng, không gắn nhãn CI PASS.

## 2. ROOT CAUSES

### 2.1 Những lỗi chính và evidence gắn component

| ID | Symptom | Exact component/file | Root cause và evidence | Kết luận |
|---|---|---|---|---|
| RC01 | Sol không nhận tin mới | `server/wakeQueue.ts:25,29`; `server/resourceRoutes.ts:57`; `browser-wake/service-worker.js:115,213`; `scripts/cli-agent-worker.mjs:17` | Cả hai queue builders luôn `return []`; extension chỉ poll endpoint đó; CLI bỏ qua `chatgpt`. E06 xác nhận queue rỗng khi TASK-98/99 pending. Không có đường thay thế current source. | Boundary hỏng: persisted task → browser delivery. Không sửa bằng khôi phục legacy prompt. |
| RC02 | Sai routing/duplicate, CLI phụ thuộc Studio | `src/components/BridgeChatPanelV2.tsx:14–16`; `server/resourceRegistry.ts` ResourceProvider; `server/taskBinding.ts` | Auto fan-out hai POST tasks và hai POST messages. `pick()` cho cả năm CLI model đều dùng `studio_targets[0]`; assignee tất cả CLI là gemini. Identity được mã hóa trong description do client tự gửi; server createTask không xác thực exact transport/model/target. | Thiếu agent registry có typed transport, không phải chỉ đổi label UI. |
| RC03 | Follow-up mất ngữ cảnh, trả nhầm nhóm lịch sử | `src/types.ts` Task/Message; `server/db.ts` schema; `scripts/cli-agent-worker.mjs` prompt/run; `BridgeChatPanelV2.tsx:13` | Không có conversation_id/turn_id; feed lọc project/workspace rồi trộn tất cả target. Mỗi CLI call chỉ nhận text hiện tại; không truyền history hay resume ID. Browser thì dùng một resource conversation cho project. | Persistence theo project không đáp ứng conversation ownership. |
| RC04 | AGY simple có thể trả lời nhưng research/tool không làm được | `scripts/cli-agent-worker.mjs:16`; `runtime`/production TASK-100; official AGY headless/permissions | Current code dùng skip-all, chỉ trim stdout và kiểm tra nonempty, bỏ diagnostics/status cấu trúc. AGY headless có thể soft-deny tool vẫn exit 0 (reference R2). Default read_url là Ask. Không có policy/scoped preflight; `cwd` OS chưa đủ chứng minh AGY active project. TASK-97 tự nói scratch là tín hiệu cần kiểm tra, không là bằng chứng filesystem. | Cơ chế lỗi permission đã được đối chiếu contract; **chưa có stderr để kết luận chính xác read_url là nguyên nhân TASK-100**. Commit 6700fca không có useful-task proof sau fix. |
| RC05 | Một CLI chậm chặn cả nhóm; timeout có thể để orphan | `scripts/cli-agent-worker.mjs:14–18`; `pc-executor/core.ts:90–121` | `execFileSync` trong for-loop chặn event loop, dùng chung 180s cho mọi task, buffer mặc định, không native progress. Startup `token()` và `await tick()` ở top level không retry/catch. setInterval không guard tick còn chờ HTTP. Không có process-tree ownership/kill. | Async lifecycle và supervisor thiếu; current worker là serialization toàn nhóm, không phải lanes concurrent. |
| RC06 | Stale lane/duplicate execution/ghi đè kết quả | `server/db.ts:553–640,657–759`; `server/singleFlight.ts`; `server/workspaceTaskRouter.ts:15–25,62–125`; `server/studioRelay.ts:292`; `server/geminiWorker.ts:303` | REST claim có mutex + conditional SQL đáng giữ. Nhưng bound claim dùng mutex khác, đọc rồi update không cùng CAS; không lọc exact model. updateTask không check attempt owner/version/terminal invariants. Không task lease/attempt; recordHeartbeat không reclaim task. Lane key tách model nên không bảo vệ shared files giữa model/CLI/executor. | Cần một claim/commit boundary và workspace write lock chung. Stale recovery trong executorStore là job khác, không tự bảo vệ task CLI. |
| RC07 | HTTP lỗi có thể mất answer hoặc đánh failed task đã xong | `scripts/cli-agent-worker.mjs:11,17–18`; `server/routes.ts:258–287,336`; E12, TASK-91 | fetch không deadline, lỗi chỉ endpoint+status. Cùng catch bao trùm claim, run và completion; fail PATCH dù claim response có thể mất nhưng server đã claim; completion có thể commit trước khi response mất. Answer chỉ ở RAM, không result outbox. | Đây là **root cause xử lý 502 sai**. Nguyên nhân Railway phát 502 chưa xác định; route GET tasks trả 500 trong catch, không chủ động trả 502. |
| RC08 | UI giấu pending/failed, lịch sử biến mất sau nhiều task | `BridgeChatPanelV2.tsx:12–17`; `src/App.tsx:54`; `ProjectRouterV2.tsx`; `server/db.ts:389` | busy chỉ kéo dài POST, không generation; feed chỉ completed nonempty và human, không pending/failed; dedupe theo task_id+content+from không gộp hai task của Auto. Latest 300 tasks/messages, slice 100 bubbles; không pagination conversation. | Screenshot E11 xác nhận UI không hiện TASK-100 failed. Tên/icon đã có mapping nhưng không được server attest. |
| RC09 | Có thể enqueue privileged execution mà không xác thực người dùng | `server/auth.ts:34–110`; `server/routes.ts:68,273,336`; worker run | requireAuth chấp nhận User-Agent và Sec-Fetch-* như identity, trong khi HTTP client ngoài browser tự đặt được headers. Missing token thành open mode. CORS không sửa lỗi authentication. Child thừa kế process.env; AGY skip-all, cwd không là sandbox. | Lỗi source xác định, không khai thác live. Phải sửa trước khi bật coding daemon. Existing auth tests pass không phủ threat model này. |
| RC10 | DB ack nhưng có thể không durable; tests không chặn release | `server/db.ts:37–49,66–76`; `tests/wakeQueue.test.ts`; `.github/workflows/ci.yml`; E02/E08/E09 | Mỗi mutation export toàn DB đồng bộ, write thẳng file, catch persist error rồi tiếp tục; lỗi đọc DB tạo fresh DB. Lint/test lỗi nhưng server vẫn build/deploy được vì build không typecheck. Pipeline currently không chứng minh gating trước Railway rollout. | Crash/disk fault là failure mode source-level, chưa fault-inject production. Phải thêm durable commit + deploy gate, không chỉ restart policy. |

**Các phân biệt tránh sửa nhầm:**

- E05 không có working task hiện tại; stale working là lỗ hổng recovery chứng minh từ code, không được ghi rằng đang có task working bị kẹt.
- TASK-94 `spawnSync ...codex.cmd EINVAL` là lỗi lịch sử. Current code đã qua `cmd.exe /d /s /c`, stdin và output file; TASK-95/96 có result. Không kế hoạch “sửa EINVAL” như thể fix chưa tồn tại; phải giữ và kiểm thử contract Windows đã sửa.
- Worker đọc Railway variables **một lần khi startup**, không mỗi poll/message. `complete-chat.mjs` lại đọc variables mỗi invocation; tối ưu đúng nơi, không dựng root cause không có thật.
- API Gemini worker đang disabled (`GEMINI_WORKER_ENABLED=false`, config model cũ `gemini-2.5-flash`). Nó vẫn là path có thể nhận nhầm gemini-assigned task nếu bật lại. Không gọi đó là silent fallback đang xảy ra khi chưa có trace.
- Native model và permission metadata chưa được lưu per attempt. Không thể từ persisted answer xác nhận binary/model/permissions thực thi ở thời điểm đó.

### 2.2 Legacy wake inventory — phải đóng toàn bộ đường tái sinh

| Layer | File/call site | Hiện trạng | Xử lý cuối cùng |
|---|---|---|---|
| Producer | `server/wakeQueue.ts` | Disabled, empty builder | Xóa legacy builder/type khi callers được retire; không re-enable vì tests cũ. |
| REST compatibility | `server/resourceRoutes.ts` `/wake-queue`; `server/androidWake.ts` `/queue`; mounts `server.ts` | Còn expose; đều đi vào builder rỗng | Tombstone 410 có client-stop signal trong migration; không trả executable events. Xóa handler/mount sau cutover đã kiểm kê client. |
| Browser consumer/poller | `browser-wake/service-worker.js` alarm, 2s interval, onStartup, onInstalled | Vẫn chạy, production logs thấy poll 2s | Gỡ alarm/poll legacy, đọc protocol version; move delivery nội bộ vào transport mới cùng extension. |
| Retry | service-worker `deliveredEvents`, `redeliveryMinutes`, resetDelivered, targetOpenAttempts | Event chỉ được suppress trong khoảng thời gian; hết hạn có thể inject lại. Persist delivery cuối whole cycle; restart giữa cycle có thể mất checkpoint. | Receipt durable trước/qua từng step; không resend một turn đã gửi. |
| Visible wrapper | service-worker `fastChatPrompt`, prefix `Bridge Fast Chat`, popup/manifest | Còn text Bridge Wake, UI manual wake/reset | Xóa wrapper/hướng dẫn orchestration khỏi model chat; rename extension thành Bridge Browser Transport; bỏ manual wake/reset khỏi user flow. |
| Android consumer | `android-wake/.../WakeService.java`, `BridgeAccessibilityService.java`, `WakeState.java` | Endpoint hardcoded host legacy; polling/recovery còn tồn tại, có thể dùng state cached | Retire Android injection/recovery path; bản client cũ phải stop, clear pending delivery có kiểm soát. Tablet chỉ dùng Bridge UI. Không nhận việc từ endpoint legacy. |
| Build/package | `.github/workflows/ci.yml`, browser/android READMEs | Vẫn đóng gói Bridge Wake | Đóng gói đúng extension protocol version; CI assert không có executable legacy producer/consumer. |
| Alternate entrypoints | `server/githubCommandBus.ts`, inbox `runtime/bridge-bus/inbox/wake-browser-*.json`; MCP/batch/Studio | Đây là entrypoints task/update/review, không tìm thấy builder độc lập tạo literal legacy header trong tracked source đã search | Phải reject routing/review Fast Chat qua legacy consumers; receipt/tombstone cho command bus tránh replay migration. Runtime inbox là dữ liệu, không được tự thực thi khi audit. |

Search dùng `git grep` tracked repo cho Bridge Wake, BRIDGE_WAKE, wake-queue, buildWakeQueue, redelivery; đọc cả browser + Android consumers. Không tìm thấy current producer xây literal `Bridge Wake — TASK-xx`; điều này không chứng minh extension/APK cũ ngoài repo hoặc cached queue đã bị gỡ. Không dựa vào xóa chuỗi trong source để tuyên bố đã hết spam.

## 3. TARGET ARCHITECTURE

### 3.1 Một kiến trúc duy nhất

Giữ **một Express server trên Railway, một database sql.js persisted tại `/app/data`, một PC runner trong Bridge root, và một extension ChatGPT browser transport**. Dùng Node/Windows native primitives; không thêm broker, Redis, microservice, paid AI API hay coding-agent engine. PC executor hiện có và các native CLI tiếp tục thực thi công việc; Bridge chỉ quản lý identity, ownership, state, locking và result delivery.

```text
Bridge conversation composer
  → authenticated POST turn (client_message_id, conversation_id, selected_agent, text)
  → atomic persist human message + internal task + immutable route
  → one claim service (transport identity + model + attempt + lease)
       ├─ PC runner → AGY native CLI (Gemini / Sonnet / Opus)
       ├─ PC runner → Codex native CLI (Sol / Astra)
       └─ browser extension → exact mapped ChatGPT conversation (Sol 5.6)
  → fenced completion commit + unique assistant message + ordered event
  → SSE to exact Bridge conversation; cursor GET recovers missed events

All repo mutation, including browser MCP/executor work:
  → one E:\AI\Bridge workspace writer lock
  → real file/command/test evidence
```

Root E là cwd cho mọi local CLI của Bridge theo yêu cầu. Không nhận cwd từ user text/client. Registry của project khác phải được giữ nhưng không cho CLI silently chạy project khác tại root E; route không thuộc Bridge root đã được xác thực thì báo unavailable. Mở rộng project khác là scope riêng, không sửa semantics ghép cặp PC hiện tại.

### 3.2 Typed identity và conversation

- Một server-side registry nhỏ cho sáu entries: `agent_id`, `transport`, `model_id`, display_name, icon_key, capabilities, availability, protocol_version. Exact IDs theo §1.2; không enum model trong prose/HTML comments làm authority.
- Client gửi agent_id; server resolve route. Thiếu AGY model/CLI auth/browser model thì reject rõ hoặc đánh unavailable. Không chuyển sang model khác, không chọn Studio URL cho Codex.
- `conversations`: id, workspace/project, created/updated; `messages`: id, conversation_id, turn_id, role, agent_id, content, created_at, sequence. Route của turn immutable kể cả khi người dùng đổi selector sau khi Send.
- Một turn = một human message + một internal task + tối đa một canonical assistant final. Request UUID sinh trước Send, giữ qua retry/reload; unique `(conversation_id, client_message_id)` với payload hash. Cùng key khác payload → 409.
- Native session map theo `(conversation_id, agent_id, transport)`; AGY `--conversation ID`, Codex explicit `exec resume ID` khi đã xác minh help/contract. Tuyệt đối không dùng “continue most recent” dùng chung máy. Trước khi resume, validate model/cwd/scope; không mang session của agent khác sang.
- Khi đổi agent trong một conversation, agent mới nhận transcript user/assistant cần thiết từ DB và tạo native session riêng; ghi last delivered sequence để không lặp history. Không gửi task wrapper/logs. Không tự bật fan-out; phiên bản hoàn thiện này mặc định một selected agent, default Sol 5.6 nếu available, nếu không thì yêu cầu chọn agent available.
- Migration history: tạo một legacy conversation mỗi project từ dữ liệu có evidence binding. Không đoán phân nhóm hội thoại cũ; ambiguous task/record đưa vào archive quản trị. Preserve original text/time, không replay pending legacy task tự động.

### 3.3 Lifecycle và ownership duy nhất cho chat lẫn coding turn

```text
pending → working → completed
                 → failed
pending/working → cancelled
working → pending chỉ khi safe retry đã được quyết định có evidence
```

`claimed` là action tạo working attempt, không thêm status. Không review/blocked/wake state trong user turn. Tool progress, delivery step và recovery là internal fields/events. Quality/test của coding task là công việc native agent thực hiện trong working; không auto-review vòng hai rồi giấu final.

Task fields tối thiểu bổ sung: `conversation_id`, `turn_id`, `agent_id`, `transport`, `model_id`, `access_mode`, `attempt_id`, `attempt_count`, `owner_id`, `owner_epoch`, `lease_expires_at`, `deadline_at`, `next_attempt_at`, `error_code`, `result_hash`, `completed_at`. FKs/unique/index enforced tại DB boundary. Không cho PATCH tùy ý sửa identity, result terminal hoặc ownership.

| Action | Authority/invariant |
|---|---|
| Create | Authenticated user; transaction tạo message/task/route; ack sau durable persist. |
| Claim | Authenticated worker/extension capability; exact route; pending due; CAS trong **một** mutex/transaction chung cho REST/MCP/relay. Return attempt token scoped task+owner+epoch. |
| Heartbeat | Owner+attempt khớp; mỗi 10s, lease 45s; không đổi message timestamps. Heartbeat không kéo dài absolute deadline. |
| Complete | Chỉ current attempt, status working, nonempty final và valid terminal native result; commit task + assistant message + event atomically. Unique turn final. Same retry/hash → cùng receipt; different hash → 409. |
| Fail | Current attempt; error code + user-safe text; terminal không được stale completion ghi đè. Infrastructure retry và model failure là hai loại khác nhau. |
| Cancel | User identity scoped conversation; revoke ownership; stop child/tool actions, xác nhận cleanup trước khi cho writer kế tiếp. Không chỉ đổi status trên server. |
| Recovery | Server startup + sweep 10s; expired lease không tự cho second writer chạy. Reconcile PC receipt/outbox/process trước; mục tiêu recovery ≤60s sau khi runner kết nối và cleanup đã xác nhận. |

Deadlines khởi điểm: simple 120s; tool/research 600s; coding/test 1200s; ceiling 1800s khi task thật cần. Waiting pending có deadline hữu hạn: transport offline báo ngay; quá 10 phút không thể nhận → failed/transport_unavailable, không treo vô hạn. UI không lộ các timer này.

Retry: tối đa 3 delivery/request attempts với backoff jitter 1s, 3s, 10s và deadline; tối đa **2 execution attempts** chỉ cho read-only/idempotent task khi biết attempt trước đã dừng. Không tự rerun mutating task sau uncertain execution. Outbox completion retry tối đa 5 lần trong 2 phút; giữ record durable nếu vẫn lỗi, đánh delivery unconfirmed local và reconcile khi kết nối lại, không gọi model lần nữa. Health discovery của daemon có thể tiếp tục backoff tối đa 60s nhưng không biến thành infinite execution retry của task.

### 3.4 Concurrency đơn giản nhưng đúng

- Một coordinator PC, ban đầu tối đa hai CLI executions độc lập; một active turn mỗi `(conversation, agent)` và một per-model lane; browser một active turn trên mỗi mapped tab. Không chạy execFileSync trong loop.
- Hai read-only tasks có thể chạy song song nếu runtime enforce read-only. Read/write classification từ capability an toàn; không đoán keyword. Nếu quyền native không bảo đảm read-only thì task lấy write lock bảo thủ.
- **Một workspace RW lock cho canonical `E:\AI\Bridge`**, writer exclusive với cả readers cần snapshot ổn định. Một lock cho toàn repo đơn giản hơn file-lock vì agent có thể phát hiện file mới. Unknown/tool/coding = write-capable mặc định. Không đánh `related_files: []` là read-only.
- Lock được persist/lease trong cùng claim transaction và runner giữ khóa local OS trên path cố định trong runtime. PC executor jobs, browser MCP jobs, git sync/build có ghi file cũng phải dùng coordinator này; không tạo lock riêng trong mỗi adapter.
- Reentrant child executor job dùng đúng parent attempt token; không lấy writer lock lần hai gây deadlock. CLI được native tool access trực tiếp trong cùng owned process boundary.
- PC mất mạng: runner tự dừng child trước lease hết (margin 10s). Server không mở writer mới chỉ vì clock hết; chờ PC chứng minh cũ chết hoặc PC restart xác nhận boot epoch mới. Không thể chứng minh thì terminal execution_uncertain, fence workspace đến khi reconcile; các simple/read lanes khác tiếp tục được nếu không đụng vùng fenced.
- Không hứa exactly-once external side effects. Bảo đảm at-most-one active writer và idempotent result commit; uncertain write cần review diff, không retry mù.

### 3.5 Durable state, result và shutdown

Giữ sql.js một replica. Gộp mutation vào một transaction, export một lần, ghi temporary file cùng directory, flush, atomic replace và backup last-known-good. Persist failure rollback/reload committed in-memory state và trả lỗi, không ack. Startup DB hỏng phải fail readiness và hướng dẫn restore, không tạo DB rỗng. Xác minh atomic replace theo filesystem Railway thật; không ghi WAL SQLite nếu vẫn dùng sql.js.

Runner lưu attempt receipt trước spawn và final outbox trước completion POST vào `runtime/agent-runs/<attempt_id>/` dưới E; atomic JSON/text write, ACL không cho model sửa coordination state. Result delivery retry chỉ submit exact stored bytes/hash. Dùng native Node async spawn, stdin backpressure, bounded stdout/stderr, process PID+start time+boot epoch. Windows launcher sở hữu process tree qua Job Object kill-on-close; không kill theo tên tất cả node/agy/codex trên PC. taskkill chỉ được dùng targeted tree cleanup khi verify PID/start identity và cần fallback cleanup, không là policy boundary chính.

### 3.6 Sol browser delivery nội bộ

Registry vẫn cung cấp exact ChatGPT resource URL nhưng mapping là `(Bridge conversation, native ChatGPT conversation, selected model)`, không một resource mặc định trộn mọi conversation. Endpoint mới thuộc cùng server, ví dụ `/api/browser-transport/claim`, `/receipt`, `/complete`; protocol version 2, scoped extension auth và chung task attempt service. Không endpoint legacy nào phát events mới.

Extension nhận task qua bounded long-poll 20s khi browser awake; alarm chỉ khởi động lại transport khi MV3 suspend, không inject tin để “đánh thức” ChatGPT. Không cần tab ChatGPT mở thì lặp mở tab: mở tối đa một lần cho turn thật đã claim; giữ inactive, exact URL. Nếu login/model unavailable → failed với feedback rõ; không tự login đổi profile/model.

State receipt persist theo step: claimed → preparing → send_started → sent(native user-message ID) → answer_observed(native assistant ID/hash) → committed. Chuẩn bị prompt là **nội dung user**, không header Bridge Wake, TASK, binding, retry/review instructions. Model/tool context dùng native scoped tool/session configuration, không nhét orchestration control vào user-visible chat.

Before-send checkpoint có durable turn/attempt và DOM baseline. Sau restart ở send_started nhưng không rõ có gửi chưa: đối chiếu exact native message ID/text/order; ambiguous → delivery_uncertain, **không gửi lại**. Chỉ thu assistant gắn đúng user turn; regenerate/manual edit/đổi URL làm invalidate claim nếu không reconcile được. DOM ổn định 700ms hoặc composer rỗng không đủ chứng minh final; verify message relation, generation stopped, no pending tool activity, native terminal indicator. Save answer trước submit, retry submit không reinject.

Useful work Sol: dùng ChatGPT session thật có Bridge executor MCP scoped theo attempt/workspace, đưa tool jobs qua cùng PC coordinator. `executorMcp.ts`, `executorRoutes.ts`, `executorRouting.ts`, `pc-executor/core.ts` đã có nền tảng để adapt. Không thay Sol bằng Codex và không yêu cầu model chạy complete-chat helper để trả lời. Nếu session/browser account không expose tool connector cần thiết, **L là release blocker**; extension đọc DOM không tự tạo ra capability read/code/test. Phase 1 phải xác minh điều này trước khi viết transport.

### 3.7 Reference contracts được sử dụng

- **R1:** [openai/codex](https://github.com/openai/codex), cùng output `codex.cmd exec --help` của binary 0.153.4 tại E07. Adapt stdin, explicit model/cwd/sandbox, output-last-message, JSON events, explicit session resume; không xây lại tool loop. Exact CLI account entitlement/model availability còn cần native run evidence.
- **R2:** [Antigravity headless](https://antigravity.google/docs/cli/headless): structured terminal/result events, conversation identity và soft-denial khác process failure. Dùng output-format stream-json để tách final/progress, không suy PASS từ exit 0. Binary/help E07 là version gate, docs đang ghi v1.1.25 còn binary là 1.1.27; cần fixture thật trước parse.
- **R3:** [Antigravity permissions](https://antigravity.google/docs/cli/permissions): action(target), deny > ask > allow; URL policy mặc định Ask; file scope và Windows normalization phải test. Không đề xuất flag allowlist tưởng tượng. Chính sách chi tiết của Bridge ở §8 là yêu cầu thiết kế, không phải tuyên bố runtime đã enforce.
- **R4:** [Antigravity sandbox](https://antigravity.google/docs/cli/sandbox): tài liệu liệt kê Linux namespaces/macOS sandbox-exec; không chứng minh Windows support. Không được gắn `--sandbox` rồi gọi Windows isolation PASS.
- **R5:** [google-antigravity/antigravity-cli](https://github.com/google-antigravity/antigravity-cli) và [changelog](https://raw.githubusercontent.com/google-antigravity/antigravity-cli/main/CHANGELOG.md): reference chính thức cho release/contract, không giả định repo này expose toàn source engine.

## 4. IMPLEMENTATION PHASES

Thực hiện **tuần tự 1 → 9**. Mỗi phase phải lưu evidence và commit checkpoint khi coding agent được giao triển khai; chỉ triển khai/deploy trong lượt có authorization tương ứng. Không tiếp tục phase phụ thuộc nếu blocker capability/security chưa đóng. “E2E verification” có simulator ở phase nền chỉ là integration gate; không được đánh A–L PASS bằng simulator.

### PHASE 1 — Chốt baseline, capability và contract kiểm chứng được

**Goal:** loại bỏ giả định về AGY cwd/permissions, browser tools và Windows process isolation trước khi viết adapter.

**Files/components involved:** `scripts/cli-agent-worker.mjs`, `tests/`, `tests/wakeQueue.test.ts`, `package.json`, `.github/workflows/ci.yml`, native CLI, browser mapped session; thêm test fixture/contract notes trong docs và test folder.

**Exact changes:**
1. Recheck remote SHA/live SHA; preserve existing untracked artifacts. Record binary version/path/hash, runner boot/source hash, active/staged Railway config separately.
2. Thay tests đòi wake spam bằng test legacy queue disabled; không restore producer. Đưa worker syntax/adapter tests vào npm test; test DB dùng isolated fixture dưới root, không production/local live DB.
3. Probe native AGY bằng từng exact model: metadata init cwd/tools/permission mode và terminal event; đọc file fixture known hash, chạy safe repo read và một approved URL. Reproduce default headless read_url denial vào fixture rồi scoped-allow rerun. Không sửa runtime global permissions mù.
4. Verify AGY `--project`/`--add-dir` từ CLI help, chọn/pin native project chứa E root và assert actual tool path; không dựa vào câu agent tự kể scratch. Verify Codex two model IDs, auth mode, stdin Unicode, final file và `exec resume --help`.
5. Inspect Sol 5.6 model selector và Bridge executor MCP availability trên đúng mapped ChatGPT session. Probe useful read-only work trả final về test Bridge conversation khi transport khả dụng; current transport chưa có thì lưu capability evidence riêng, chưa PASS K/L.
6. Xác minh Windows constrained execution/process Job Object bằng harmless fixtures; nếu native AGY sandbox không bảo vệ Windows, dùng boundary Windows được quy định §8; **không skip-all để vượt gate**.

**What must NOT change:** không đổi model/transport, không fake final, không dùng production tasks cũ làm smoke, không re-enable wake.

**Tests:** current failures được thay bằng assertions đúng invariant; fixture parser success/denial/error/empty; permission positive/negative; stdout/stdin Unicode.

**E2E verification:** capability probes ghi actual model/session/tool/path/result; chưa giao diện tích hợp thì đánh UNPROVEN, không fake E2E.

**PASS criteria:** lint green; legacy-disabled test green; đủ exact native model contracts; browser useful-tool path khả thi và Windows boundary chứng minh. Mục nào không khả thi là blocker có evidence, không đổi sang architecture khác để che thiếu sót.

**Rollback point:** baseline code snapshot; mọi profile/config thử nghiệm scoped và có bản restore; không rollback queue thành spam.

**Dependencies:** none. Một-time cài policy/identity/startup ngoài E, nếu cần, chỉ thực hiện khi có phạm vi authorization cụ thể; chuẩn bị artifact trong E trước.

### PHASE 2 — Xác thực user/runner và cấp quyền tối thiểu

**Goal:** không để public API biến thành local unrestricted execution daemon.

**Files/components involved:** `server/auth.ts`, `server.ts`, `server/routes.ts`, `server/executorPairing.ts`, `executorRoutes.ts`, `executorMcp.ts`, worker credential bootstrap, `tests/auth.test.ts`.

**Exact changes:** bỏ User-Agent/Sec-Fetch identity bypass; production missing auth config fail closed. Tạo authenticated browser session HttpOnly/Secure/SameSite, CSRF defense cho mutations, narrow CORS. Tách user/controller credential, CLI runner credential, browser transport credential và attempt capability. Remove query-string master auth cho mutations. Token chỉ nằm coordinator, không nằm prompt/browser MAIN-world/child env. Cấu hình auth rotation có một bounded refresh, revoke đúng worker.

**What must NOT change:** machine-scoped PC pairing hiện có; một PC phục vụ project registry theo scope; native subscription auth, không API-key fallback.

**Tests:** fake browser headers từ anonymous client phải 401; CSRF/cross-origin rejected; worker sai scope không claim/complete; revoked attempt rejected; child env không chứa Bridge/Railway/GitHub control secrets.

**E2E verification:** test user session gửi một turn tới instrumented test consumer; endpoint→runner authorized flow và denied flow. Chưa native final thì chưa A–L PASS.

**PASS criteria:** không privileged mutation anonymous; không master token trong output/browser bundle/child; selected identity đúng scope.

**Rollback point:** session/token migration có thời hạn; nếu auth lỗi, disable dispatch để phục hồi cấu hình, không restore browser-header bypass.

**Dependencies:** Phase 1.

### PHASE 3 — Typed routing, conversations và durable commit

**Goal:** một user turn có identity và lịch sử bền vững, đúng agent/model.

**Files/components involved:** `server/db.ts`, `server/routes.ts`, `server/taskBinding.ts`, `server/resourceRegistry.ts`, `server/workspaceTaskRouter.ts`, `src/types.ts`, `BridgeChatPanelV2.tsx` phần API/feed tối thiểu, mới `server/agentRegistry.ts` nhỏ; tests migration/turn routes.

**Exact changes:** migrate schema §3.2–3.3; create atomic turn endpoint, unique request/hash, typed server route, immutable fields, indexes `(status,next_attempt_at,agent_id,created_at)` và `(conversation_id,sequence)`. Persist messages/task/event cùng commit; replace persist swallowing/fresh-empty recovery theo §3.5. Create conversation native session mapping. Archive old ambiguous statuses/bindings; pending cũ giữ lịch sử và fail migration_required hoặc chỉ requeue sau operator xác nhận, không tự replay. Structured errors đưa user-safe messages riêng với private diagnostics.

Wire tối thiểu composer và feed hiện có sang create-turn/conversation API ngay trong phase này, với explicit selected agent từ registry; giữ layout. Cho phép tạo/chọn test conversation và render canonical final để Phase 5–6 kiểm tra UI thật mà không phụ thuộc Phase 7. Bỏ dual POST tạo task/message cũ trên đường mới. Phase 7 hoàn thiện UX, pagination, error/loading/theme và loại bỏ UI branches cũ; không trì hoãn đường UI kiểm chứng cơ bản đến Phase 7.

**What must NOT change:** original answer/content/timestamps; six IDs; giữ project/executor registry và findings ngoài chat không bị mất. Không export task wrapper cho UI; không đổi schema phá hoại không backup.

**Tests:** migration trên bản sao DB với 100+ records; two simultaneous duplicate POST; same key different payload; old pending outside 300; conversation separation; simulate disk-full/failed rename/corrupt DB/startup.

**E2E verification:** atomic user→task→test completion→conversation read; reload >300 task history, verify no lost human message nếu POST message lỗi (endpoint riêng đã bỏ).

**PASS criteria:** one accepted turn/one human row; durable final acknowledged only after commit; no empty completed; identity impossible to forge in description; restore DB test passes.

**Rollback point:** backup DB trước migration + schema version; stop dispatch trước restore; export/import mới phát sinh để không mất turns, không chạy binary cũ trên schema mới thiếu compatibility.

**Dependencies:** Phase 2.

### PHASE 4 — Claim, lease, locking và recovery chung

**Goal:** không duplicate execution, không stale task chặn lane vô thời hạn, không hai writers cùng root.

**Files/components involved:** `server/db.ts`, `singleFlight.ts`, `workspaceTaskRouter.ts`, `studioRelay.ts`, `geminiWorker.ts`, `executorStore.ts`, `executorRoutes.ts`, `executorMcp.ts`, `pc-executor/core.ts`, `missionControl.ts` stop/cancel.

**Exact changes:** một transaction claim service với owner/epoch/CAS, heartbeat/complete/fail/cancel API; tất cả old claim paths gọi service chung hoặc reject chat turn. Disable API Gemini/Studio/batch/GitHub bus ownership đối với six chat routes, không để legacy consumer cướp việc. Add durable RW workspace lock và runner reconciliation, lease/deadline/retry §3.3. Stop thật tới child; release sau cleanup acknowledgment. Reject expired epoch results và terminal overwrite. Executor lease recovery không tự replay uncertain writer.

**What must NOT change:** concurrent reads an toàn, no global pause vì một quota/model fail; không per-file lock graph hoặc queue engine mới.

**Tests:** two workers + REST/relay simultaneous claim; same lane FIFO; different models same-file conflict; browser tool vs CLI write; old working expired; PC partition before/after launch; cancellation race; duplicate complete same/different hash; writer restart held lock.

**E2E verification:** two real agents thực hiện bounded fixture work trong cùng root khi adapter Phase 5 sẵn sàng; ở phase này test consumers chỉ chứng minh arbitration. Gate native concurrency phải chạy lại ở Phase 9.

**PASS criteria:** một owner per attempt, không overlapping writers, no blind retry after possible writes; unaffected lane tiếp tục; expired/stale task có terminal/recovery outcome rõ.

**Rollback point:** pause new claims, drain/stop known attempts, preserve lock/receipt data. Không rollback thành unfenced claim khi child còn chạy.

**Dependencies:** Phase 3.

### PHASE 5 — Native CLI adapters và PC runner bền vững

**Goal:** năm CLI routes đọc/code/test thật, final thật về DB, UI có thể nhận trực tiếp.

**Files/components involved:** `scripts/cli-agent-worker.mjs`, `scripts/complete-chat.mjs`, mới hai adapter modules nhỏ cùng folder, native Windows launcher dưới `pc-executor/`, tests adapters/runner; credential config scoped runtime.

**Exact changes:**
1. Đổi execFileSync sang async spawn; một guarded scheduling loop, server filtered claim không GET latest 300; capacity per-model/global; request timeout và retry taxonomy; structured logs timestamps/request/attempt/PID/version/exit.
2. AGY stream-json input/output contract đã probe, explicit exact model/native project, approved permission profile; stderr riêng; process exit + terminal event + response + required-tool outcome. Detect soft permission denial, WAITING/ERROR/empty → failed đúng code, không báo success giả. Save native conversation ID và resume exact ID.
3. Codex giữ Windows cmd shim đúng contract, prompt qua stdin, output-last-message file dưới `runtime/agent-runs`, explicit `-C E:\AI\Bridge`, model, workspace-write hoặc verified read-only profile. Static trusted argv launcher; user text không nằm cmd string. JSON logs/progress không thành final; output file mới per attempt chống stale file. Validate exit và final file; captured native session resume mapping. Không dùng skip-git-repo-check nếu root đã verified Git và flag không cần.
4. Deadlines/phân loại auth/quota/model_missing/permission/timeout/empty/output_limit; no retry đổi model. Native process group owned Job Object, WindowsHide, bounded resource/output and kill; health heartbeat independent child.
5. Boot reconnect/reconcile outbox trước claim. Cached scoped credential không gọi Railway variables mỗi task; bỏ complete-chat helper khỏi hot path, chỉ giữ scoped diagnostic tool nếu còn cần và không bypass completion invariant. Explicit child env và protected outbox.

**What must NOT change:** native CLI tool engine; model IDs; Sol browser route; no paid API fallback; không sửa files ngoài assigned workspace/task.

**Tests:** production-like Windows .cmd path có spaces, Unicode/newline/metachar prompt, large bounded output, native timeout, child grandchild cleanup, stale answer file, API lost ack, startup 502/auth missing, reconnect/rotation, resume isolation, tool denial.

**E2E verification:** A–J theo §5 từ Bridge test UI hoặc tạm turn endpoint + visible conversation kết quả; endpoint-only chưa đủ PASS. Read/test/write cases dùng fixture có expected diff và tests độc lập.

**PASS criteria:** cả năm exact CLI models simple và useful tasks có final hiển thị đúng conversation; tool/coding evidence có cwd/path/command/test outcome, không chỉ CLI launched.

**Rollback point:** stop runner, flush outbox/reconcile, rollback adapter version riêng; unavailable agent hiển thị rõ. Không fallback sang binary cũ skip-all hoặc model khác.

**Dependencies:** Phase 4; security/capability Phase 1–2 vẫn green.

### PHASE 6 — Sol browser transport nội bộ và retire legacy wake

**Goal:** Sol 5.6 nhận một yêu cầu thật, thực hiện useful work, trả đúng final; không wake spam.

**Files/components involved:** `browser-wake/service-worker.js`, manifest/popup, `server/resourceRoutes.ts`, `server/wakeQueue.ts`, `server/androidWake.ts`, `server.ts`, `executorMcp.ts`, CI extension package và tests browser transport; protocol endpoints mới cùng server.

**Exact changes:** implement §3.6, consume common claim/complete; persisted DOM message receipt, no task header, no redelivery timer; long-poll/backoff and MV3 restart reconciliation. Explicit model/session check. Bind scoped executor tools for Sol useful work to parent attempt. Delete legacy runtime branches và retire APK injection; stale old endpoint trả tombstone, old queue/cache không tái phát. Cập nhật installed extension version đúng release và validate browser polling thực tế; không reset login/profile.

**What must NOT change:** Sol dùng ChatGPT Web; user drafts và active tabs khác; no fake message to keep browser awake; no MCP/worker metadata trong answer/chat; không đọc response từ unrelated tab.

**Tests:** busy/draft, wrong URL/model, multiple profiles/extensions claim race, manual interleaving, late tool result, regenerate, ambiguous send, worker suspend/restart từng receipt step, completion 502, tab closed/logout, cached legacy event/old Android retry.

**E2E verification:** K và L; L phải read file thật, useful repo analysis và safe executor test qua browser agent rồi final UI. Một controlled write fixture thêm vào L khi khả năng coding được quảng bá. Một conversation mới và hai sequential turns prove context.

**PASS criteria:** one user send→one native user turn→one final exact Bridge conversation; no Bridge Wake/TASK wrapper; no retry reinjection; Sol useful tool path proven. Missing MCP capability vẫn blocker, không downgrade thành simple-only release.

**Rollback point:** disable new browser claims, reconcile receipt, keep legacy disabled; restore transport checkpoint sau cleanup. Không restore old Wake APK/extension để chữa sự cố.

**Dependencies:** Phase 5 và Phase 1 browser capability proof.

### PHASE 7 — Chat UI đơn giản, đúng conversation và feedback

**Goal:** dùng hằng ngày như chatbox: chọn một agent, gửi, xem tiến độ và final trực tiếp.

**Files/components involved:** `BridgeChatPanelV2.tsx`, `ProjectRouterV2.tsx`, `ProjectSetupStatusBar.tsx`, `WorkspaceView.tsx`, `src/App.tsx`, `src/types.ts`, `src/index.css`, obsolete `BridgeChatPanel.tsx`/routing helpers sau xác minh imports.

**Exact changes:** wire atomic turn/conversation API, remove default dual-agent Auto; selector từ server registry, correct icon+label; persist selected agent/conversation/draft; one optimistic human row reconciled by client_message_id; pending/working/failed/cancelled user-friendly state per turn và retry explicit new attempt/turn policy. Server final message canonical; no result synthesis from task.description/result. Time immutable message.created_at, full date accessible. Paginate >100 bubbles; preserve scroll when reading older text. Hide task/review/binding/wake/error stacks; render code/Markdown safely theo capability hiện có, không unsafe HTML. Unknown usage hiển thị unavailable hoặc bỏ khỏi selector, không 0 giả. Available status dựa worker capability heartbeat, không target registered.

**What must NOT change:** no task dashboard trong chat, retain project switch, dark/light, human-right/agent-left, exact requested model, no misleading “online” từ registry.

**Tests:** double click/offline POST/reload; two conversations same project, switch agent during run, out-of-order reply, multi-agent explicit histories isolated; failed task visible; safe Markdown/code; theme/time/accessibility/responsive.

**E2E verification:** repeat A–L through actual composer, refresh UI sau mỗi final; follow-up nhớ nonce; screenshot light/dark desktop/tablet; no technical orchestration content trong DOM feed.

**PASS criteria:** message count/identity/content/time chính xác, failure luôn có feedback, no duplicate human/final, no disappearing history over 300 tasks, no model fallback.

**Rollback point:** UI version checkpoint chỉ dùng versioned conversation API; rollback không trở về fan-out default hay task wrappers.

**Dependencies:** Phase 6.

### PHASE 8 — Giảm latency, visibility và vận hành/restart

**Goal:** Bridge overhead thấp, reconnect bền và điều tra 502 bằng evidence.

**Files/components involved:** `server.ts`, `server/routes.ts`, `server/db.ts`, `missionControl.ts`, `resourceRegistry.ts`, `projectSetup.ts`, UI pollers, runner/browser loops, runtime launcher, `docs/RUNBOOK.md`, Railway config.

**Exact changes:** one authenticated SSE feed/conversation có ordered cursor; bounded reconnect và incremental GET fallback; keepalive 15s. Worker/browser long-poll claims 20s rồi backoff idle; no scan 300. Registry cache/invalidation; remove setup mutation khỏi GET registry; no Git status/log subprocess trên mỗi chat refresh; quota endpoint off hot path. Instrument turn timings, event-loop delay, DB export/write, CPU/RSS, process exit, upstream status/request-id. Liveness tách readiness và runner availability. Graceful SIGTERM: stop claims, flush persist, reconcile ownership không kill task vô cớ khi Railway restart. Single replica và volume invariant; đưa start-command registry mutation thành versioned migration. Prepare supervised startup/reconnect dưới root; verify PC boot + browser login availability theo scope đã được authorize.

**What must NOT change:** no new microservice/dependency nếu Node/native Windows đủ; không che lỗi 502 bằng infinite retry; không fake provider quota hoặc performance.

**Tests:** disconnect SSE/replay cursor; 502/503 timeout faults; graceful and abrupt server/runner restart; disk full; PC restart; dependency offline; no work while executor identity chưa reconcile.

**E2E verification:** run recovery matrix §6 với real final before/after faults; collect timing distributions §7. Chạy Railway restart trên test environment trước, chỉ rollout được phép sau gate; không restart production như bước audit.

**PASS criteria:** không mất accepted turn/final; bounded errors; unaffected lanes recover; 502 incident có timestamp + upstream correlation hoặc được ghi unresolved và chặn reliability acceptance nếu vẫn lặp.

**Rollback point:** retain event cursor history/outbox; disable performance layer độc lập nếu cần, dùng bounded incremental polling chung contract. Restore config từng field, không accept staged patch không liên quan.

**Dependencies:** Phase 7.

### PHASE 9 — Full E2E, fault campaign và release gate

**Goal:** một release đủ evidence để dùng hằng ngày và handoff không phải đoán.

**Files/components involved:** all tests, `.github/workflows/ci.yml`, runtime/extension version manifest, `docs/HANDOFF.md`, `ROADMAP.md`, `RUNBOOK.md`, `SECURITY.md`, plan evidence checklist.

**Exact changes:** gate exact candidate SHA bằng lint/full tests/build/startup; Windows native adapter integration bắt buộc ngoài Ubuntu unit CI. Bind promotion tới passed candidate SHA, không auto-release broken main. Execute A–L + expanded write/useful tests; faults §6; 30 phút idle/no-wake và soak tối thiểu 2 giờ với số lượt/quota đã thống nhất. Lưu sanitized evidence: request/turn/conversation/attempt/native session/model/cwd/versions, final hash/UI capture, test results, elapsed times; không credentials. Document known provider limitations và recovery actions. Verify deployed SHA, PC runner SHA, installed extension protocol version; cập nhật stale handoff.

**What must NOT change:** no PASS từ HTTP200/task created/CLI launched/agent self-report, no bypass permission để xanh matrix, không quảng bá agent unavailable là complete.

**Tests:** toàn bộ relevant suite chạy isolated DB; green Linux + Windows; fault injection deterministic; no legacy runtime generation; baseline history restore.

**E2E verification:** tất cả matrix rows PASS trên exact candidate; controlled release promotion sau đó smoke mỗi transport trên deployed candidate và verify final UI, không chỉ health.

**PASS criteria:** §9 Definition of Done đầy đủ. Một agent/tool path unproven = chưa hoàn thành toàn bộ project theo mục tiêu này.

**Rollback point:** prior gated release + matching extension/runner + backup/migration recovery; pause write dispatch trước rollback; preserve new turns/outbox. Không quay về legacy wake hay unrestricted execution.

**Dependencies:** Phase 8 và toàn bộ gates trước đó.

## 5. E2E MATRIX

### 5.1 Protocol kiểm chứng

Mỗi run tạo conversation riêng và nonce riêng qua **UI thật**. Record selected agent, server immutable route, native runtime/model/version, conversation/turn/attempt, cwd/tool trace, final bytes/hash và UI rendering. Expected assertions lấy từ verifier độc lập, không để model tự đánh giá PASS.

- **Simple S:** yêu cầu trả exact nonce; một follow-up hỏi lại nonce. Không cần tool trong lượt simple; phải kiểm tra context follow-up không tạo native session nhầm.
- **Tool R:** đọc file fixture `runtime/e2e/<run_id>/input.txt` trong root có nonce không nằm prompt và hash known; tìm symbol thật trong repo; đọc URL official đã allowlisted để trích một fact kiểm chứng được; final nêu evidence đúng. Không cho đơn thuần “tôi có thể đọc”.
- **Coding C:** sửa đúng fixture nhỏ `runtime/e2e/<run_id>/subject.*` để pass một test độc lập; chạy test; verifier kiểm diff allowlist và kết quả command. Không dùng source production làm fixture hoặc tự push/deploy. Build/test có side effects lấy writer lock.
- **Browser useful B:** Sol session dùng scoped Bridge executor tool đọc fixture thật và chạy test read-only/analysis có output, final về cùng UI; thêm C khi Sol được công bố có quyền coding.

| ID | Agent | Model / transport | Case bắt buộc | Evidence để PASS | Trạng thái audit hiện tại |
|---|---|---|---|---|---|
| A | Gemini | gemini-3.8-flash-high / AGY | S | exact nonce + follow-up + final UI | UNPROVEN current release |
| B | Gemini | như A | R; thêm C cho coding capability | actual file+URL/tool evidence + final | UNPROVEN |
| C | Sonnet | claude-sonnet-4-6 / AGY | S | native model/cwd session + final UI | UNPROVEN current release |
| D | Sonnet | như C | R + C | scoped read_url/command không prompt, actual diff/test/final | TASK-100 failed lịch sử; post-fix UNPROVEN |
| E | Opus | claude-opus-4-6-thinking / AGY | S | exact selected route + final UI | UNPROVEN current release |
| F | Opus | như E | R + C | actual tools/diff/test/final | UNPROVEN |
| G | Codex Sol | gpt-5.6-sol / Codex | S | stdin→native model→output final→UI, follow-up | TASK-95/96 historical return, fresh G UNPROVEN |
| H | Codex Sol | như G | C + repo read | cwd E, sandbox, real edit/test, final | UNPROVEN |
| I | Codex Astra | gpt-6-astra / Codex | S | native requested ID + final UI | UNPROVEN, ASTRA_OK file không đủ |
| J | Codex Astra | như I | C + repo read | actual scoped edit/test/final | UNPROVEN |
| K | Sol 5.6 | ChatGPT browser | S | native UI model + correlated DOM turn + final UI | FAIL dispatch current source |
| L | Sol 5.6 | ChatGPT browser + scoped executor MCP | B; thêm C cho coding | actual PC work + same browser/Bridge conversation final | UNPROVEN capability, dispatch blocked |

### 5.2 Cross-cutting E2E bắt buộc

| Case | Expected result |
|---|---|
| Reload sau completed và khi working | Đúng conversation, mỗi human/final một lần, pending/working visible, reconnect lấy missed events. |
| Hai conversations cùng project, cùng agent | Không lẫn native session/history/result. |
| Đổi selector khi turn đang chạy | Turn đang chạy giữ original model/name/icon; turn mới dùng model mới. |
| Hai agents read concurrent | Overlap được chứng minh bằng attempt times, answers đúng hai conversations. |
| Same lane hai requests | FIFO, một active attempt; failure đầu không treo request sau. |
| Hai agents cùng file/coding + browser tool | Writer serialization; no overlapping diffs; delegated tool không deadlock. |
| Force CLI fail/auth/quota/timeout | Terminal feedback rõ, next eligible lane tiếp tục, không fallback model. |
| Restart worker khi đang chạy/khi có outbox | Dừng/reconcile process đúng ownership, không rerun known final, final hiển thị một lần. |
| Stale working/lease hết | Reconcile old PID/boot epoch; no blind writer retry, terminal bounded. |
| Railway restart/redeploy cùng schema | Accepted turn/history không mất; runner reconnect; result delivery retried idempotently. |
| PC restart + browser startup | One runner instance; boot epoch mới; exact auth/model availability rechecked; không Wake prompt/tab spam. |
| 301+ tasks và >100 messages | Claim oldest eligible dù ngoài old scan window; history paginated vẫn truy xuất được. |
| Idle 30 phút + MV3 suspend + old cached delivery | Không tạo chat/message mới; không inject legacy header; không mở tab định kỳ. |
| Dark/light, tablet, long code, timestamp | UI readable, no clipping, raw technical metadata hidden, accessible names. |

## 6. FAILURE & RECOVERY MATRIX

| Failure | Detect/evidence | Recovery được chọn | Retry/terminal rule | Invariant/gate |
|---|---|---|---|---|
| GET/claim 502 | HTTP code + timestamp + request-id + upstream logs | Backoff; với claim ack mất, query attempt receipt trước | 3 request attempts; no fail PATCH từ non-owner | Không execute task mà chưa có ownership chắc chắn. |
| Completion 502/response lost | Outbox hash, query canonical turn receipt | Submit cùng attempt/result hash, không rerun CLI | 5 delivery retries/2m, preserve outbox for reconnect | Đúng một assistant final; terminal cũ immutable. |
| Worker crash lúc startup | Supervisor exit/error, readiness absent | Bounded startup retries, heartbeat unavailable; phục hồi config/auth khi needed | 5 startup retries/5m rồi degraded; operator feedback | Không để top-level rejected fetch biến mất không log. |
| Worker crash giữa execution | Lease/runner boot/PID receipt | Job Object cleanup; reconcile; read-only safe retry, write uncertain failure | Max 2 safe exec attempts | Không thả writer lock khi chưa chứng minh old child chết. |
| Working task stale nhưng PC online | Last attempt heartbeat + deadline | Stop exact attempt, cleanup receipt; terminal hoặc safe retry | Absolute deadline không được heartbeat gia hạn | Không lane head block forever. |
| Orphan descendants | Owned Job Object/process receipt | Kill owned group, verify process start identity | Cleanup deadline 10s; unresolved fence | Không kill unrelated Codex sessions trên PC. |
| CLI timeout | Native terminal absent và deadline | Terminate tree, record timeout, preserve diagnostics | No mutating auto retry; max 2 safe reads | Test background grandchild không sống sót. |
| Empty answer/partial only | Final contract/file/event validation | failed/empty_answer hoặc invalid_final | No completed empty; no retry write | UI có feedback, không silent disappearance. |
| Tool permission soft-denied | Structured event/stderr; expected tool evidence absent | failed/permission_required; fix scoped policy, user retry | Không skip-all, no model switch | Simple success không che R/C failure. |
| Invalid/missing model | Preflight catalog/native error/browser selector | Mark exact agent unavailable | No execution retry sang model khác | UI nói đúng unavailable. |
| Auth expired | Native auth error, 401 scoped transport | One credential refresh nếu đã có authorized mechanism; nếu không cần user login | Terminal/auth_required; circuit riêng account | Không mở nhiều browser login prompts. |
| Quota exhausted | Native quota/rate-limit code/diagnostic | Fail affected task, mark account cooldown/reset when known | Không rapid poll; no automatic substitute | Other independent providers/models tiếp tục khi quota scope cho phép. |
| Duplicate create/claim/result | Unique request ID, CAS attempt, result hash | Return existing receipt/reject conflict | Idempotent replay only | Không tạo hai human/final hoặc charge generation hai lần. |
| Server restart | Process boot/readiness, persisted schema | Load committed DB, sweep leases, runner reconcile | Bounded connection retry | Không tạo fresh DB nếu corrupt. |
| PC restart | New boot epoch + absent old processes | Restore runner/outbox/native availability before claim | Ambiguous writes failed/review diff | Không tự replay old pending legacy work. |
| Network partition | Request timeout + missed lease renewal | Stop active writer before lease margin; preserve outbox | Terminal/reconcile, no endless active lease | Server không cấp second writer trên uncertainty. |
| Railway redeploy | Verified SHA/protocol + connection loss | Graceful drain, durable DB, version handshake | Old protocol rejected; coordinated retry | UI/runner/extension compatible exact release. |
| DB disk-full/corruption | Persist error/readiness failure, backup verification | Fail ack; restore verified backup with reconciliation | Không tự bỏ dữ liệu/tạo DB trắng | Accepted turn không mất im lặng. |
| Browser sent rồi crash | Durable step/native user-message correlation | Reattach exact native message; capture result | Ambiguous → failed/delivery_uncertain | Không reinject một prompt đã có thể gửi. |
| Browser generation >timeout/manual interleave | DOM relation, native generation/tool state | Do not capture unrelated reply; safe stop/reconcile | Terminal, no blind resend | No wrong-conversation completion. |
| Pending unsupported legacy route | Migration scan incl old/auto/unbound | Archive/fail migration_required, remove from active lane | No inference/replay | Không giữ zombie head để compatibility. |

**502 investigation còn phải hoàn thành:** hai dòng log local không có thời gian, TASK-91 là claim 502 ở `10:26:53.993Z`; deployment hiện hành bắt đầu 11:03Z. Coding agent cần lấy logs/metrics đúng deployment khoảng 10:26Z, upstreamErrors/restart/OOM/event-loop/DB persist timings. Không gán 502 cho limit=300, Railway hay CPU bằng suy đoán. Có thể giảm payload và harden retries trước, nhưng root incident closure phải có evidence hoặc được ghi rõ chưa xác định.

## 7. PERFORMANCE IMPROVEMENTS

### 7.1 Baseline source và số call

| Current path | Cost hiện tại có evidence | Exact improvement |
|---|---|---|
| V2 load mỗi 4.5s | 4 GET: registry/tasks/messages/quota ≈53.3 requests/phút mỗi visible panel | Initial conversation snapshot rồi SSE; cursor delta fallback, quota ngoài hot path. |
| App mỗi 3s | ≈20 GET workspace/phút; mỗi workspace buildMissionControlData gọi Git status/log | Stop workspace/mission-control poll khi chỉ chat; data riêng lazy/slow refresh. |
| ProjectRouter mỗi 10s | ≈6 GET registry/phút, trùng panel | Một registry cache/provider, invalidate on edit/transport change. |
| ProjectSetupStatusBar | Thêm load ngoài ba vòng trên; registry GET gọi ensureProjectSetup | Tách query khỏi setup action; refresh khi job event. Không tính thêm cadence chưa đo vào tổng. |
| CLI worker 2s | ≈30 GET latest 300/phút khi idle; for-loop scans và nhiều rejected claims | One filtered long-poll claim/capacity; SQL index và oldest eligible, không client scan. |
| Browser 2s + alarm ≥30s | Poll queue rỗng vẫn liên tục, logs E04 xác nhận | Internal delivery long-poll + one idle backoff, no visible wake. |
| Explicit send | POST task + POST human message, rồi 4 GET load; worker GET/claim/PATCH riêng | Một atomic POST turn + event push; claim+complete+heartbeat theo task, không human POST riêng. |
| Auto send | Hai tasks + hai human POST, fan-out hai models | Default single agent; explicit grouping là scope riêng sau completion plan. |
| Railway credential | Worker một lần startup; helper một lần mỗi invocation | Scoped credential lifecycle cached, helper khỏi hot path; không query variables mỗi answer. |
| CLI startup/context | Mỗi prompt process mới, synchronous output; không native session resume | Async native calls, exact resume và incremental context; tối ưu warm process chỉ sau measurement, không shared global session. |
| DB writes | Full export sync nhiều lần cho task/activity/message/claim/status | Một durable transaction export/commit mỗi state action; coalesce noncritical metrics, không delay durability của user turn. |

Tổng polling source tối thiểu của panel+App+router ≈79 requests/phút/client, chưa tính setup status, worker, extension. Đây là phép tính từ interval, **không phải measured browser traffic**: timer background bị throttling (E04 có UI burst khoảng một phút). Không lấy API latency proxy 10–38ms làm end-to-end user latency; network PC↔Railway cũng có chi phí.

### 7.2 Measurement và acceptance budgets

Lưu times monotonic tại mỗi process, UTC timestamps để correlate: user click → accepted → claimed → native started → first visible progress/token → native final → persisted → rendered. Không trừ timestamps khác máy để lấy latency nếu chưa kiểm sai lệch clock.

Proposed budgets để validate trong Phase 8–9: local optimistic user bubble ≤100ms; pending acknowledgment p95 ≤1s; accepted→dispatch p95 ≤2s khi runner online/idle; native-final→Bridge-render p95 ≤1.5s; Bridge-added overhead p95 ≤3s (không gồm provider inference/tool work). Simple answer total đo riêng theo model/cold/warm, report p50/p95 thay vì hứa mọi model trả trong một số giây cố định.

Tối thiểu 20 simple samples/model cho performance campaign khi included quota được phép, một cold và nhiều warm, record failures chứ không loại outlier tùy ý. Không cần tool cho simple nonce. Nếu provider latency cao, thông báo đúng đang xử lý; không thay model để đạt SLO. Thử số lượng thấp hơn phải ghi insufficient sample, không gọi p95 đáng tin.

Mục tiêu idle visible UI không full-snapshot polling; fallback tối đa một incremental request/5s khi SSE unavailable; server long-poll bounded 20s, no extra scan. Giữ dependencies hiện có, không xây runtime model pool trước khi evidence cho thấy startup là bottleneck chính.

## 8. SECURITY MODEL

### 8.1 Trust boundary

Trusted human gửi authorized coding request trong Bridge workspace; model output, repo docs, web content là untrusted inputs. Authenticating user là điều kiện trước khi worker nhận việc. Không xem AGENTS prompt, argv allowlist hay cwd là OS isolation.

Coordinator giữ scoped Bridge credential và execution receipts; agent child chỉ được native provider auth cần thiết và task-specific tool capability. Không expose Railway variables/full environment/master MCP token cho child, stdout, UI, prompt hoặc source. Native provider auth là dữ liệu của CLI launcher, không copy cookie/profile khác để tiện headless.

Runner đang phục vụ phải chạy từ release snapshot bất biến do coordinator kiểm soát trong runtime, khác source checkout mà coding agent được phép sửa. Promotion source thành runner release chỉ qua quality gate, không tự hot-load file vừa được model sửa. Nếu cùng identity có thể sửa ACL hoặc snapshot này thì boundary chưa đạt; Phase 2 phải chứng minh việc tách quyền thực sự.

### 8.2 Chosen Windows boundary

Thiết kế chọn **Windows restricted execution identity + owned Job Object + native permission policy**, ngay trên PC hiện tại, cwd canonical E. Chuẩn bị launcher bằng PowerShell/.NET/native Windows API trong repo; không thêm service phân tán hoặc engine mới. Job Object chỉ giải quyết lifetime/resource/process cleanup, **không** tự sandbox filesystem/network.

Identity phải có write chỉ project/task paths đã authorized và temp/cache đã tách dưới runtime; read OS/runtime binaries theo nhu cầu, không read thư mục cá nhân/secrets ngoài scope; ACL/OS restrictions cần enforce cả child/grandchild và prevent elevated/unsandboxed escape. Coordinator/outbox/credential và control-plane state không writable bởi agent dù cùng root. Native CLI auth/cache cần exact narrow mount/ACL đã kiểm tra, không blanket profile access.

Network outbound cho provider runtime và URL tool được phép theo account/task profile; URL tool validate host/scheme/redirect, block localhost/private/link-local/metadata và DNS rebinding. Approved dependencies/docs GitHub/official domains theo task, không wildcard mọi internet. Shell không được lấy unrestricted egress như đường vòng read_url. OS/network enforcement phải thử bằng child process thật; hostname rule của CLI không tự hạn chế `node`/PowerShell chạy network. Nếu Windows runtime không hỗ trợ enforce được boundary này, Phase 1/2 **BLOCKED capability**, coding route không được mở bằng skip-all. Đây là gate thực thi cho kiến trúc đã chọn, không lời hứa native AGY Windows sandbox tồn tại.

Cần một-time setup identity/ACL/startup ngoài root thì coding agent chuẩn bị manifest thay đổi và rollback cụ thể; phạm vi ngoài root phải được user authorize trước khi apply. Plan hiện tại không thực hiện các thay đổi đó.

### 8.3 Policy cụ thể cho tools

| Capability | Allow | Deny/require explicit further authority |
|---|---|---|
| Files | Read assigned Bridge source/fixture; write assigned task path dưới canonical root khi write lock held | `..`, sibling prefix, UNC, other drives, NT device/ADS paths, junction/symlink escape, secrets/state/auth/control files; canonical realpath và closest existing ancestor cho file mới. |
| Native commands | Git read-only subcommands cụ thể, rg; reviewed npm test/lint/build; scoped native edit/test workflow | Bare `command(git)` quá rộng; push/reset/clean/config/hooks, package install, curl-to-shell, system config, arbitrary shell startup scripts không tự allow. |
| npm/build/test | Only reviewed scripts của SHA/project/task, dưới same write policy và OS boundary | `npm test` có thể chạy arbitrary script; không coi executable allowlist là an toàn nếu agent sửa package script. Test nội dung/diff policy và constrain child OS. |
| read_url | HTTPS domain allowlist của useful task, safe redirects và addresses | `read_url(*)`, internal services/secrets URLs, arbitrary upload/exfiltration. |
| execute_url | Chỉ exact ChatGPT transport operations trong extension hoặc explicit user-authorized site task | Không cấp generic web actuation để giải quyết read_url denial. |
| MCP | Specific Bridge executor methods với attempt token; paths/commands revalidated server + PC | Master MCP token, unrelated remote desktop/files/tools, cross-task completion. |
| Models | Exact IDs và matching account capability | Any auto fallback, unknown-model success, model claim chỉ qua prose. |

AGY policy dùng schema được CLI version support: `permissions.allow/ask/deny` action(target); `read_url(github.com)` khác `execute_url(github.com)`. Validate precedence: broad ask/deny có thể override narrow allow. Không viết `deny(*)` rồi giả định narrow allow thắng. Windows normalization của AGY cần negative test cross-drive/identical suffix; realpath/OS boundary vẫn quyết định.

Profile read-only phải deny writes thực sự kể cả workspace auto-allow; nếu không enforce, treat request as writer. For coding, allow native read/write/edit/test trong scope; settings/rules do operator kiểm soát ngoài writable task files. Không cấp `--dangerously-skip-permissions` mặc định. Codex `workspace-write` không đồng nghĩa không đọc ngoài workspace hoặc cấm mọi network; inspect exact effective config/native sandbox behavior và enforce extra boundary khi cần. CLI binaries installed ngoài E là executable dependency đã biết, không mở rộng quyền đọc/sửa files người dùng bên cạnh chúng.

### 8.4 Mandatory negative evidence

Harmless fixtures phải chứng minh: child không read/write ngoài assigned root; symlink/junction escape denied; altered npm script không thoát OS policy; shell network không vượt URL policy; wrong-task token denied; auth headers giả denied; policy ask headless → explicit terminal failure; no secret in logs/final. Negative fixtures được chuẩn bị trong phạm vi cho phép hoặc approved sandbox, không thử đọc secret thật để “test security”.

## 9. DEFINITION OF DONE

Bridge chỉ hoàn thành khi tất cả điều kiện sau cùng đúng trên một release xác định:

1. Sáu exact agents/models và đúng ba transports trong §1.2; không silent fallback. Availability phản ánh runtime, không label registration.
2. A–L PASS qua real Bridge UI; AGY/Codex/Sol useful tool/coding thật có độc lập file/test evidence. Raw echo file/HTTP response không thay được proof.
3. Một turn = một human message + tối đa một final, correct conversation/native session/model/name/icon/time; multi-turn context đúng; reload/pagination không mất.
4. Không còn executable legacy wake producer/consumer/retry/cache path; old clients không tái inject. Không technical wrapper/wake/review message trong user chat. Idle/restart tests không spawn chats/tabs để wake.
5. One claim service, immutable routing, attempt lease/epoch, workspace write lock áp dụng CLI + browser MCP + executor; no overlapping writers/duplicate execution.
6. Failure/recovery matrix PASS gồm CLI/tool permission/timeout/auth/quota, process-tree cleanup, crash/restart/partition, durable outbox, Railway redeploy và PC restart. Uncertain writes không auto-replay.
7. Auth/scoped Windows filesystem/network/command/tool boundary có positive và negative evidence; no master secrets to model. Không “tạm skip-all” trong release config.
8. Persist failure không ack success; corrupt DB không reset im lặng; backup restore được thử; one-replica/sql.js volume invariant verified.
9. Performance đo theo model, p95 Bridge overhead đạt budget hoặc blocker có nguyên nhân đã sửa và retest. Không fake quota/latency.
10. lint/full isolated tests/build/production smoke + Windows native tests green cho exact candidate; deployed SHA, PC runner và extension protocol matching. Staged Railway patch được rà soát, không apply ngẫu nhiên.
11. Simple UI light/dark/tablet, loading/error/retry/cancel/scroll/context đúng; không dashboard hóa. User không cần hiểu queue/lease/task wrapper.
12. Handoff/Runbook/Security/Roadmap cập nhật source/live evidence và recovery procedure. Không còn unresolved correctness/security blocker hoặc “chưa chứng minh” ở mandatory matrix.

Mục tiêu này giảm vòng lặp fix/deploy bằng gates trước promotion; không cam kết browser DOM/provider/network sẽ không thay đổi. Khi chúng đổi, fail rõ và giữ state, không trả nhầm/kích hoạt fallback.

## 10. EXECUTION CHECKLIST

### Phase 1

- [ ] Recheck GitHub/local/deploy SHA; ghi exact binary versions và installed extension/runtime version.
- [ ] Preserve ba runtime files có sẵn; tạo test area riêng, không đụng data live.
- [ ] Sửa wake tests theo legacy-disabled invariant, không bật queue.
- [ ] Capture AGY native model/cwd/tool/status và denial fixtures cho cả ba IDs.
- [ ] Verify two Codex model native execution + stdin/output/resume contract.
- [ ] Verify Sol model và scoped MCP useful-work capability.
- [ ] Verify Windows execution boundary khả thi, list exact missing capability nếu blocked.
- [ ] **Quality Gate:** lint + contract/unit tests green, no speculative CLI flags.
- [ ] **E2E:** lưu capability evidence; chưa integrated thì giữ A–L UNPROVEN.

### Phase 2

- [ ] Remove header-only browser authentication; production fail closed.
- [ ] Implement browser session/CSRF, scoped runner/extension/attempt identities.
- [ ] Restrict child environment/control-state access; credential rotation bounded.
- [ ] **Quality Gate:** forged-header/cross-scope/CSRF/revoked-token negative tests pass.
- [ ] **E2E:** authorized request reaches scoped consumer, unauthorized cannot enqueue.

### Phase 3

- [ ] Back up DB and version migration; restore test first.
- [ ] Add conversations/messages/turns, immutable server-side registry routes.
- [ ] Atomic create endpoint with client_message_id/hash and unique final.
- [ ] Replace persist swallow and fresh-empty-on-corrupt behavior.
- [ ] Archive ambiguous legacy rows, never replay old pending work automatically.
- [ ] **Quality Gate:** migration/disk failure/idempotency/cross-conversation tests pass.
- [ ] **E2E:** accepted turn survives restart and returns once in conversation read/UI.

### Phase 4

- [ ] Unify REST/relay/MCP/worker claims into one CAS service.
- [ ] Add leases/deadlines/epochs/attempts and fenced completion/cancel.
- [ ] Apply root RW writer lock to CLI, executor, browser tools and Git sync.
- [ ] Stop unsafe legacy consumers of chat tasks; verify API Gemini cannot steal them.
- [ ] Reconcile stale working/PID/outbox before requeue; no blind write retry.
- [ ] **Quality Gate:** races, same-file conflict, partition, late result and cleanup pass.
- [ ] **E2E:** record arbitration separately; real-agent concurrency pending Phase 5/9.

### Phase 5

- [ ] Async runner with guarded scheduler, scoped filtered claim and heartbeat.
- [ ] Native AGY stream final/error/denial parser and correct project/session.
- [ ] Native Codex Windows stdin/cwd/model/output-file and exact resume.
- [ ] Durable attempt receipt/outbox; process Job Object and targeted cleanup.
- [ ] Classify auth/quota/model/permission/empty/timeouts; no fallback.
- [ ] Cache scoped credentials; retire helper on response hot path.
- [ ] **Quality Gate:** Windows real CLI/child tree/API-loss tests pass.
- [ ] **E2E:** A–J plus useful coding evidence and visible final, record exact model.

### Phase 6

- [ ] Implement authenticated protocol-v2 browser claim/receipt/complete.
- [ ] Map Bridge/native conversation + model; send only actual user content.
- [ ] Durable send/answer checkpoints; no reinject after uncertain send.
- [ ] Scoped Sol executor MCP obeys same parent lock/attempt.
- [ ] Retire queue builders/endpoints/popup retry/Android cached delivery and legacy CI package.
- [ ] Verify installed extension version and actual polling; preserve browser logins.
- [ ] **Quality Gate:** DOM correlation/MV3/duplicate extension/restart/no-wake tests pass.
- [ ] **E2E:** K/L real final + useful PC work; no substitute Codex path.

### Phase 7

- [ ] One selected agent; remove implicit dual send.
- [ ] Canonical conversation feed, one optimistic human ID, persistent session/draft.
- [ ] Per-turn pending/working/failed/cancelled/retry/cancel UX without internals.
- [ ] Correct names/icons/times, pagination, unknown usage, scroll and safe formatting.
- [ ] **Quality Gate:** UI isolation/reload/double-click/mobile/light/dark tests pass.
- [ ] **E2E:** Repeat A–L via final composer and refresh each conversation.

### Phase 8

- [ ] SSE/cursor replay + bounded fallback; eliminate duplicate full snapshots.
- [ ] Filtered long-poll claims; cache registry; remove setup writes/Git subprocess hot path.
- [ ] Instrument 502/DB/event-loop/attempt/native/final/render timings.
- [ ] Graceful server shutdown, runner reconnect/startup, PC boot/version handshake.
- [ ] Review active vs staged Railway config; controlled migration of startup registry mutation.
- [ ] **Quality Gate:** fault matrix, durable backup restore and performance budgets pass.
- [ ] **E2E:** restart worker/server/PC/Railway with real final received exactly once.

### Phase 9

- [ ] Run lint/full isolated npm tests/build/startup on exact candidate.
- [ ] Run real Windows CLI and browser compatibility gates; no local fixture claimed as E2E.
- [ ] A–L and expanded negative/concurrency/recovery matrix all PASS.
- [ ] Idle no-wake 30m + soak 2h + measured samples; quota scope agreed before generation campaign.
- [ ] Pin deployment + runner + extension candidate versions, verify after authorized promotion.
- [ ] Review unresolved issues against Definition of Done; any mandatory gap blocks completion.
- [ ] Update HANDOFF/ROADMAP/RUNBOOK/SECURITY with evidence and concrete restore commands.
- [ ] **Quality Gate:** no known security/correctness blocker, no undocumented fallback.
- [ ] **E2E:** final production smoke mỗi transport returns actual final in exact conversation.

---

Audit completion artifact: tài liệu này. Chưa thực hiện bất kỳ implementation phase nào. Các kiểm tra và dữ liệu source/runtime ở §1 là evidence của lượt khảo sát; các checkbox còn trống là công việc cho coding agent tiếp theo.
