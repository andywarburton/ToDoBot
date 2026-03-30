// ── ToDoBot Web Terminal (Wizard Mode) ───────────────────────────────────────
// A terminal-style todo app that syncs with GitHub Gists.
// No frameworks, no dependencies, just vibes.

(() => {
    "use strict";

    // ── DOM ──────────────────────────────────────────────────────────────────
    const output = document.getElementById("output");
    const input = document.getElementById("input");

    // ── State ────────────────────────────────────────────────────────────────
    let allTasks = []; // includes soft-deleted (for sync)
    let tasks = [];    // visible tasks (filtered)
    let config = {}; // { gist_id, token }
    let inputCallback = null;
    let activeFilter = null; // current tag filter

    // ── Storage ──────────────────────────────────────────────────────────────
    function loadConfig() {
        try { config = JSON.parse(localStorage.getItem("todobot_config") || "{}"); }
        catch { config = {}; }
    }

    function saveConfig() {
        localStorage.setItem("todobot_config", JSON.stringify(config));
    }

    function loadTasks() {
        try { allTasks = JSON.parse(localStorage.getItem("todobot_tasks") || "[]"); }
        catch { allTasks = []; }
        tasks = allTasks.filter(t => !t.deleted);
    }

    function saveTasks() {
        localStorage.setItem("todobot_tasks", JSON.stringify(allTasks));
        tasks = allTasks.filter(t => !t.deleted);
        // Auto-push to gist if configured
        if (config.token && config.gist_id) {
            gistPush().catch(() => {});
        }
    }

    function nextId() {
        if (allTasks.length === 0) return 1;
        return Math.max(...allTasks.map(t => t.id)) + 1;
    }

    // ── Output helpers ───────────────────────────────────────────────────────
    function print(html) {
        const div = document.createElement("div");
        div.innerHTML = html;
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    }

    function clear() {
        output.innerHTML = "";
    }

    function s(cls, text) {
        const safe = String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return `<span class="${cls}">${safe}</span>`;
    }

    // Like s() but allows HTML through (for links etc)
    function sRaw(cls, html) {
        return `<span class="${cls}">${html}</span>`;
    }

    function highlightTags(text, wrapCls) {
        const safe = String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return safe.replace(/#\w+/g, match =>
            `</span><span class="c-tag">${match}</span><span class="${wrapCls}">`
        );
    }

    // ── Date formatting ──────────────────────────────────────────────────────
    function relativeDate(isoStr) {
        const created = new Date(isoStr);
        const now = new Date();
        const diffMs = now - created;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 2) return "just now";
        if (diffHr < 1) return `${diffMin}m ago`;
        if (diffDay < 1) return `${diffHr}h ago`;
        if (diffDay === 1) return "yesterday";
        if (diffDay < 7) return `${diffDay}d ago`;
        if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
        return created.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
    }

    // ── Table rendering ──────────────────────────────────────────────────────
    function getTermWidth() {
        const charWidth = 8.4;
        return Math.min(Math.floor(output.clientWidth / charWidth), 120);
    }

    function pad(str, width, align = "left") {
        str = String(str);
        if (str.length >= width) return str.substring(0, width);
        const diff = width - str.length;
        const sp = "\u00A0"; // non-breaking space
        if (align === "right") return sp.repeat(diff) + str;
        if (align === "center") {
            const left = Math.floor(diff / 2);
            return sp.repeat(left) + str + sp.repeat(diff - left);
        }
        return str + sp.repeat(diff);
    }

    function wrapText(text, width) {
        if (text.length <= width) return [text];
        const lines = [];
        const words = text.split(" ");
        let line = "";
        for (const word of words) {
            if (line.length + word.length + (line ? 1 : 0) <= width) {
                line += (line ? " " : "") + word;
            } else {
                if (line) lines.push(line);
                line = word;
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    function renderTable(statusMsg) {
        const filtered = activeFilter
            ? tasks.filter(t => t.text.toLowerCase().includes(`#${activeFilter}`.toLowerCase()))
            : tasks;

        if (tasks.length === 0) {
            print("");
            print(`  ${s("c-robot", "  ┌─┤▪├─┐")}`);
            print(`  ${s("c-robot", "  │ ◕ ◕ │")}  ${s("c-dim", "No tasks yet! Type")} ${s("c-cyan", "a")} ${s("c-dim", "to add one")}`);
            print(`  ${s("c-robot", "  └─┤_├─┘")}`);
            print("");
            return;
        }

        if (filtered.length === 0 && activeFilter) {
            print(`\n  ${s("c-dim", "No tasks matching")} #${activeFilter}${s("c-dim", ".")}\n`);
            return;
        }

        const sorted = [...filtered].sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            return a.id - b.id;
        });

        const tw = getTermWidth();
        const idW = 4, statusW = 4, dateW = 11;
        const taskW = Math.max(tw - idW - statusW - dateW - 17, 20);

        const H = "─", V = "│";
        const TL = "╭", TR = "╮", BL = "╰", BR = "╯";
        const TD = "┬", TU = "┴", TR2 = "├", TL2 = "┤", X = "┼";

        const lines = [];

        lines.push(s("c-border", TL + H.repeat(idW+2) + TD + H.repeat(statusW+2) + TD + H.repeat(taskW+2) + TD + H.repeat(dateW+2) + TR));
        lines.push(
            s("c-border", V) + " " + s("c-bold c-bright-white", pad("ID", idW, "center")) + " " +
            s("c-border", V) + " " + s("c-bold c-bright-white", pad("", statusW, "center")) + " " +
            s("c-border", V) + " " + s("c-bold c-bright-white", pad("TASK", taskW)) + " " +
            s("c-border", V) + " " + s("c-bold c-bright-white", pad("ADDED", dateW, "center")) + " " +
            s("c-border", V)
        );
        lines.push(s("c-border", TR2 + H.repeat(idW+2) + X + H.repeat(statusW+2) + X + H.repeat(taskW+2) + X + H.repeat(dateW+2) + TL2));

        for (let idx = 0; idx < sorted.length; idx++) {
            const t = sorted[idx];
            const tid = String(t.id);
            const dateStr = relativeDate(t.created);

            if (idx > 0) {
                lines.push(
                    s("c-border", TR2) + s("c-border-dim", H.repeat(idW+2)) + s("c-border", X) +
                    s("c-border-dim", H.repeat(statusW+2)) + s("c-border", X) +
                    s("c-border-dim", H.repeat(taskW+2)) + s("c-border", X) +
                    s("c-border-dim", H.repeat(dateW+2)) + s("c-border", TL2)
                );
            }

            const wrapped = wrapText(t.text, taskW);
            let statusIcon, textCls, idCls, dateCls;
            if (t.done) {
                statusIcon = s("c-done", "✔");
                textCls = "c-dim c-strike";
                idCls = "c-dim";
                dateCls = "c-dim";
            } else {
                statusIcon = s("c-pending", "○");
                textCls = "c-bright-white";
                idCls = "c-magenta";
                dateCls = "c-bright-black";
            }

            const firstPadded = pad(wrapped[0], taskW);
            const firstHl = highlightTags(firstPadded, textCls);
            lines.push(
                s("c-border", V) + " " + s(idCls, pad(tid, idW, "right")) + " " +
                s("c-border", V) + "  " + statusIcon + "   " +
                s("c-border", V) + " " + sRaw(textCls, firstHl) + " " +
                s("c-border", V) + " " + s(dateCls, pad(dateStr, dateW, "center")) + " " +
                s("c-border", V)
            );

            for (let i = 1; i < wrapped.length; i++) {
                const extraPadded = pad(wrapped[i], taskW);
                const extraHl = highlightTags(extraPadded, textCls);
                lines.push(
                    s("c-border", V) + " " + pad("", idW) + " " +
                    s("c-border", V) + " " + pad("", statusW) + " " +
                    s("c-border", V) + " " + sRaw(textCls, extraHl) + " " +
                    s("c-border", V) + " " + pad("", dateW) + " " +
                    s("c-border", V)
                );
            }
        }

        lines.push(s("c-border", BL + H.repeat(idW+2) + TU + H.repeat(statusW+2) + TU + H.repeat(taskW+2) + TU + H.repeat(dateW+2) + BR));

        // Footer: robot + progress bar + status
        const total = tasks.length;
        const doneCount = tasks.filter(t => t.done).length;
        const pending = total - doneCount;
        const barW = 20;
        const filled = total ? Math.round((doneCount / total) * barW) : 0;
        const bar = s("c-bar-filled", "█".repeat(filled)) + s("c-bar-empty", "░".repeat(barW - filled));
        const filterInfo = activeFilter ? `  •  ${s("c-bright-cyan", "#" + activeFilter)}` : "";
        const statusExtra = statusMsg ? `  ${statusMsg}` : "";

        lines.push(`  ${s("c-robot", "┌─┤▪├─┐")}`);
        lines.push(`  ${s("c-robot", "│ ◕ ◕ │")}  ${bar}  ${doneCount}/${total} done  •  ${pending} pending${filterInfo}${statusExtra}`);
        lines.push(`  ${s("c-robot", "└─┤_├─┘")}  ${s("c-dim", 'add "task"  •  done &lt;id&gt;  •  rm &lt;id&gt;')}`);

        print("");
        for (const line of lines) {
            print(`  ${line}`);
        }
    }

    // ── Merge ─────────────────────────────────────────────────────────────────
    function mergeTasks(local, remote) {
        const localById = {};
        local.forEach(t => localById[t.id] = t);
        const remoteById = {};
        remote.forEach(t => remoteById[t.id] = t);
        const allIds = new Set([...Object.keys(localById), ...Object.keys(remoteById)].map(Number));
        const merged = [];
        for (const id of [...allIds].sort((a, b) => a - b)) {
            const lt = localById[id];
            const rt = remoteById[id];
            if (lt && !rt) { merged.push(lt); }
            else if (rt && !lt) { merged.push(rt); }
            else {
                const lMod = lt.modified || lt.created || "";
                const rMod = rt.modified || rt.created || "";
                merged.push(lMod >= rMod ? lt : rt);
            }
        }
        return merged;
    }

    // ── Gist API ─────────────────────────────────────────────────────────────
    async function gistPush() {
        if (!config.token || !config.gist_id) return { ok: false, err: "Not configured" };
        try {
            const resp = await fetch(`https://api.github.com/gists/${config.gist_id}`, {
                method: "PATCH",
                headers: { "Authorization": `token ${config.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ files: { "tasks.json": { content: JSON.stringify(allTasks, null, 2) } } }),
            });
            if (!resp.ok) return { ok: false, err: `HTTP ${resp.status}` };
            return { ok: true };
        } catch (e) { return { ok: false, err: e.message }; }
    }

    async function gistPull() {
        if (!config.token || !config.gist_id) return { ok: false, err: "Not configured" };
        try {
            const resp = await fetch(`https://api.github.com/gists/${config.gist_id}`, {
                headers: { "Authorization": `token ${config.token}` },
            });
            if (!resp.ok) return { ok: false, err: `HTTP ${resp.status}` };
            const data = await resp.json();
            const file = data.files["tasks.json"];
            if (!file) return { ok: false, err: "No tasks.json in gist" };
            const remoteTasks = JSON.parse(file.content);
            allTasks = mergeTasks(allTasks, remoteTasks);
            saveTasks();
            return { ok: true };
        } catch (e) { return { ok: false, err: e.message }; }
    }

    async function gistCreate() {
        if (!config.token) return { ok: false, err: "No token" };
        try {
            const resp = await fetch("https://api.github.com/gists", {
                method: "POST",
                headers: { "Authorization": `token ${config.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    description: "ToDoBot tasks", public: false,
                    files: { "tasks.json": { content: JSON.stringify(allTasks, null, 2) } }
                }),
            });
            if (!resp.ok) return { ok: false, err: `HTTP ${resp.status}` };
            const data = await resp.json();
            return { ok: true, id: data.id };
        } catch (e) { return { ok: false, err: e.message }; }
    }

    // ── Spinner ──────────────────────────────────────────────────────────────
    function showSpinner(message) {
        const div = document.createElement("div");
        div.innerHTML = `  <span class="spinner"></span> ${s("c-reset", message)}`;
        div.id = "spinner-line";
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
        return div;
    }

    function hideSpinner(el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // ── Prompt ───────────────────────────────────────────────────────────────
    function prompt(question) {
        return new Promise(resolve => {
            print(`  ${s("c-cyan", "▸")} ${question}`);
            inputCallback = resolve;
        });
    }

    function promptSecret(question) {
        return new Promise(resolve => {
            print(`  ${s("c-cyan", "▸")} ${question}`);
            input.type = "password";
            inputCallback = (val) => { input.type = "text"; resolve(val); };
        });
    }

    // ── Redraw ───────────────────────────────────────────────────────────────
    function redraw(message) {
        clear();
        loadTasks();
        renderTable(message);
        printMenu();
    }

    function printMenu() {
        print("");
        const tip = s("c-dim", "(tip:") + " d 3 " + s("c-dim", "or") + " r 5 " + s("c-dim", "to skip ID prompt)");
        print(`  ${s("c-bold c-bright-white", "What would you like to do?")}  ${tip}`);
        print("");
        const actions = [
            ["a", "Add",    "c-bright-green"],
            ["d", "Done",   "c-bright-yellow"],
            ["r", "Remove", "c-bright-red"],
            ["f", "Filter", "c-bright-blue"],
            ["s", "Sync",   "c-bright-magenta"],
            ["l", "List",   "c-cyan"],
        ];
        const line = actions.map(([key, label, cls]) =>
            `${s("c-cyan", "[")}${s("c-bright-white", key)}${s("c-cyan", "]")} ${s(cls, label)}`
        ).join("   ");
        print(`    ${line}`);
        print("");
    }

    // ── Sync setup ───────────────────────────────────────────────────────────
    async function setupSync() {
        print(`\n  ${s("c-bold c-bright-white", "Gist sync setup")}\n`);

        if (!config.token) {
            print(`  ${s("c-bold c-bright-white", "How to create a token:")}`);
            print(`  ${s("c-dim", "1.")} Go to ${sRaw("", '<a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>')}`);
            print(`  ${s("c-dim", "2.")} Click ${s("c-bright-white", "Generate new token")} → ${s("c-bright-white", "classic")}`);
            print(`  ${s("c-dim", "3.")} Name it something like ${s("c-bright-white", '"ToDoBot"')}`);
            print(`  ${s("c-dim", "4.")} Tick only the ${s("c-bold", "gist")} scope`);
            print(`  ${s("c-dim", "5.")} Click ${s("c-bright-white", "Generate token")} and copy it`);
            print("");

            const token = await promptSecret("Paste your token: ");
            if (!token || !token.trim()) { redraw(); return false; }
            config.token = token.trim();
            saveConfig();
            print(`  ${s("c-bright-green", "✔")}  Token saved\n`);
        }

        print(`    ${s("c-cyan", "[")}${s("c-bright-white", "c")}${s("c-cyan", "]")}  Create a new private gist`);
        print(`    ${s("c-cyan", "[")}${s("c-bright-white", "e")}${s("c-cyan", "]")}  Enter an existing gist ID\n`);

        const choice = await prompt("Choose: ");
        if (!choice) { redraw(); return false; }

        const c = choice.trim().toLowerCase();

        if (c === "c") {
            const sp = showSpinner("Creating private gist...");
            const result = await gistCreate();
            hideSpinner(sp);
            if (result.ok) {
                config.gist_id = result.id;
                saveConfig();
                redraw(`  ${s("c-bright-green", "✔")}  Gist created: ${s("c-dim", result.id)}\n`);
                return true;
            } else {
                redraw(`  ${s("c-bright-red", "✘")}  ${result.err}\n`);
                return false;
            }
        } else if (c === "e") {
            const gistInput = await prompt("Gist ID (or URL): ");
            if (!gistInput || !gistInput.trim()) { redraw(); return false; }
            const gistId = gistInput.trim().replace(/\/$/, "").split("/").pop();
            config.gist_id = gistId;
            saveConfig();

            const sp = showSpinner("Pulling from gist...");
            const result = await gistPull();
            hideSpinner(sp);
            if (result.ok) {
                redraw(`  ${s("c-bright-green", "✔")}  Synced from gist\n`);
            } else {
                redraw(`  ${s("c-bright-yellow", "⚠")}  Pull failed: ${s("c-dim", result.err)}\n`);
            }
            return true;
        }

        redraw();
        return false;
    }

    // ── Action handler ───────────────────────────────────────────────────────
    async function handleInput(raw) {
        const trimmed = raw.trim();
        if (!trimmed) return;

        const parts = trimmed.split(/\s+/);
        const action = parts[0].toLowerCase();
        const arg = parts.slice(1).join(" ");

        switch (action) {
            case "a":
            case "add": {
                let text = arg;
                if (!text) {
                    clear();
                    renderTable();
                    text = await prompt("What do you need to do? ");
                    if (!text || !text.trim()) { redraw(); return; }
                }
                const id = nextId();
                const now = new Date().toISOString();
                allTasks.push({ id, text: text.trim(), done: false, created: now, modified: now });
                saveTasks();
                redraw(`  ${s("c-bright-green", "✔")} Added task ${s("c-magenta", "#" + id)}: ${s("c-bright-white", text.trim())}\n`);
                break;
            }

            case "d":
            case "done": {
                let tidStr = arg;
                if (!tidStr) {
                    const pending = tasks.filter(t => !t.done);
                    if (pending.length === 0) { redraw(`  ${s("c-bright-green", "✨")} No pending tasks!\n`); return; }
                    clear();
                    renderTable();
                    tidStr = await prompt("Which task did you finish? ID: ");
                    if (!tidStr) { redraw(); return; }
                }
                const tid = parseInt(tidStr.trim(), 10);
                if (isNaN(tid)) { redraw(`  ${s("c-bright-red", "✘")}  Please enter a valid task ID.\n`); return; }
                const task = allTasks.find(t => !t.deleted && t.id === tid);
                if (!task) { redraw(`  ${s("c-bright-red", "✘")}  Task ${s("c-magenta", "#" + tid)} not found.\n`); return; }
                if (task.done) { redraw(`  ${s("c-bright-yellow", "⚠")}  Task ${s("c-magenta", "#" + tid)} is already done.\n`); return; }
                task.done = true;
                task.modified = new Date().toISOString();
                saveTasks();
                redraw(`  ${s("c-bright-green", "✔")}  Nice! Completed ${s("c-magenta", "#" + tid)}: ${s("c-dim c-strike", task.text)}\n`);
                break;
            }

            case "r":
            case "rm":
            case "remove": {
                let tidStr = arg;
                if (!tidStr) {
                    if (tasks.length === 0) { redraw(`  ${s("c-dim", "No tasks to remove.")}\n`); return; }
                    clear();
                    renderTable();
                    tidStr = await prompt("Which task to remove? ID: ");
                    if (!tidStr) { redraw(); return; }
                }
                const tid = parseInt(tidStr.trim(), 10);
                if (isNaN(tid)) { redraw(`  ${s("c-bright-red", "✘")}  Please enter a valid task ID.\n`); return; }
                const task = allTasks.find(t => !t.deleted && t.id === tid);
                if (!task) { redraw(`  ${s("c-bright-red", "✘")}  Task ${s("c-magenta", "#" + tid)} not found.\n`); return; }
                task.deleted = true;
                task.modified = new Date().toISOString();
                saveTasks();
                redraw(`  ${s("c-bright-red", "🗑")}  Removed ${s("c-magenta", "#" + tid)}: ${s("c-dim", task.text)}\n`);
                break;
            }

            case "s":
            case "sync": {
                const sub = arg.toLowerCase();
                if (sub === "status") {
                    if (config.gist_id) {
                        redraw(`  ${s("c-bright-green", "✔")}  Gist: ${s("c-dim", config.gist_id)}  Token: ${s("c-dim", "••••" + config.token.slice(-4))}\n`);
                    } else {
                        redraw(`  ${s("c-dim", "No gist configured. Type")} ${s("c-cyan", "s")} ${s("c-dim", "to set up.")}\n`);
                    }
                    return;
                }
                if (sub === "pull") {
                    if (!config.gist_id || !config.token) { redraw(`  ${s("c-bright-red", "✘")}  No gist configured. Type ${s("c-cyan", "s")} to set up.\n`); return; }
                    const sp = showSpinner("Pulling from gist...");
                    const result = await gistPull();
                    hideSpinner(sp);
                    if (result.ok) { redraw(`  ${s("c-bright-green", "✔")}  Pulled from gist\n`); }
                    else { redraw(`  ${s("c-bright-red", "✘")}  ${result.err}\n`); }
                    return;
                }
                if (sub === "reset") {
                    config = {};
                    saveConfig();
                    redraw(`  ${s("c-bright-green", "✔")}  Sync config cleared.\n`);
                    return;
                }

                // Default: pull (merge) then push, or setup
                if (!config.token || !config.gist_id) {
                    clear();
                    renderTable();
                    const ok = await setupSync();
                    if (!ok) return;
                    loadConfig();
                    if (!config.token || !config.gist_id) return;
                }
                // Pull first to merge
                const spPull = showSpinner("Pulling from gist...");
                await gistPull();
                hideSpinner(spPull);
                // Then push merged result
                const sp = showSpinner("Pushing to gist...");
                const result = await gistPush();
                hideSpinner(sp);
                if (result.ok) { redraw(`  ${s("c-bright-green", "✔")}  Synced with gist\n`); }
                else { redraw(`  ${s("c-bright-red", "✘")}  ${result.err}\n`); }
                break;
            }

            case "f":
            case "filter": {
                if (arg) {
                    activeFilter = arg.trim().replace(/^#/, "");
                    redraw(`  ${s("c-bright-cyan", "▸")}  Filtering by ${s("c-bright-cyan", "#" + activeFilter)}\n`);
                } else {
                    activeFilter = null;
                    redraw(`  ${s("c-dim", "Filter cleared")}\n`);
                }
                break;
            }

            case "l":
            case "ls":
            case "list": {
                if (config.token && config.gist_id) {
                    const sp = showSpinner("Syncing from gist...");
                    const result = await gistPull();
                    hideSpinner(sp);
                    if (result.ok) { redraw(`  ${s("c-bright-green", "✔")}  Synced from gist\n`); }
                    else { redraw(`  ${s("c-bright-yellow", "⚠")}  Pull failed: ${s("c-dim", result.err)}\n`); }
                } else {
                    redraw();
                }
                break;
            }

            case "clear":
            case "cls":
                redraw();
                break;

            case "help":
            case "?":
                clear();
                print("");
                print(`  ${s("c-bold c-bright-white", "COMMANDS")}  ${s("c-dim", "(type a command below)")}`);
                print(`    ${s("c-cyan", "a")} ${s("c-dim", '"text"')}   ${s("c-cyan", "l")}   ${s("c-cyan", "d")} ${s("c-dim", "<id>")}   ${s("c-cyan", "r")} ${s("c-dim", "<id>")}   ${s("c-cyan", "f")} ${s("c-dim", "[tag]")}   ${s("c-cyan", "help")}`);
                print(`    ${s("c-cyan", "s")} ${s("c-dim", "[pull|status|reset]")}              ${s("c-dim", "(no args = sync)")}`);
                print("");
                printMenu();
                break;

            default:
                redraw(`  ${s("c-bright-red", "✘")}  Unknown command. Type ${s("c-cyan", "help")} for options.\n`);
        }
    }

    // ── Input handling ───────────────────────────────────────────────────────
    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            const val = input.value;
            input.value = "";

            if (inputCallback) {
                const cb = inputCallback;
                inputCallback = null;
                cb(val);
            } else {
                await handleInput(val);
            }
        }
    });

    document.addEventListener("click", () => input.focus());

    // ── Boot ─────────────────────────────────────────────────────────────────
    async function boot() {
        loadConfig();
        loadTasks();

        // Auto-pull if configured
        if (config.token && config.gist_id) {
            const sp = showSpinner("Syncing from gist...");
            const result = await gistPull();
            hideSpinner(sp);
            if (result.ok) {
                redraw(`  ${s("c-bright-green", "✔")}  Synced from gist\n`);
            } else {
                redraw(`  ${s("c-bright-yellow", "⚠")}  Sync failed: ${s("c-dim", result.err)}\n`);
            }
        } else {
            redraw();
        }
    }

    boot();
})();
