// ── ToDoBot Web Terminal ─────────────────────────────────────────────────────
// A terminal-style todo app that syncs with GitHub Gists.
// No frameworks, no dependencies, just vibes.

(() => {
    "use strict";

    // ── DOM ──────────────────────────────────────────────────────────────────
    const output = document.getElementById("output");
    const input = document.getElementById("input");

    // ── State ────────────────────────────────────────────────────────────────
    let tasks = [];
    let config = {}; // { gist_id, token }
    let inputCallback = null; // for interactive prompts
    let commandHistory = [];
    let historyIndex = -1;

    // ── Storage ──────────────────────────────────────────────────────────────
    function loadConfig() {
        try {
            config = JSON.parse(localStorage.getItem("todobot_config") || "{}");
        } catch { config = {}; }
    }

    function saveConfig() {
        localStorage.setItem("todobot_config", JSON.stringify(config));
    }

    function loadTasks() {
        try {
            tasks = JSON.parse(localStorage.getItem("todobot_tasks") || "[]");
        } catch { tasks = []; }
    }

    function saveTasks() {
        localStorage.setItem("todobot_tasks", JSON.stringify(tasks));
    }

    function nextId() {
        if (tasks.length === 0) return 1;
        return Math.max(...tasks.map(t => t.id)) + 1;
    }

    // ── Output helpers ───────────────────────────────────────────────────────
    function print(html) {
        const div = document.createElement("div");
        div.innerHTML = html;
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    }

    function printRaw(text) {
        const div = document.createElement("div");
        div.textContent = text;
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
    }

    function clear() {
        output.innerHTML = "";
    }

    function s(cls, text) {
        // Escape HTML in text
        const safe = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return `<span class="${cls}">${safe}</span>`;
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
        // Approximate characters that fit in the terminal
        const charWidth = 8.4; // rough monospace char width at 14px
        return Math.min(Math.floor(output.clientWidth / charWidth), 100);
    }

    function pad(str, width, align = "left") {
        if (str.length >= width) return str.substring(0, width);
        const diff = width - str.length;
        if (align === "right") return " ".repeat(diff) + str;
        if (align === "center") {
            const left = Math.floor(diff / 2);
            return " ".repeat(left) + str + " ".repeat(diff - left);
        }
        return str + " ".repeat(diff);
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

    // Robot sidebar
    const ROBOT_LINES = [
        { w: 9, html: s("c-robot", "  ┌─┤ ├─┐") },
        { w: 9, html: s("c-robot", "  │ ◉ ◉ │") },
        { w: 9, html: s("c-robot", "  └┬─┬─┬┘") },
        { w: 9, html: `  ${s("c-dim", "todobot")}` },
    ];
    const ROBOT_W = 9;
    const ROBOT_BLANK = " ".repeat(ROBOT_W);

    function renderTable() {
        if (tasks.length === 0) {
            print("");
            print(`  ${s("c-robot", "  ┌─┤ ├─┐")}`);
            print(`  ${s("c-robot", "  │ ◉ ◉ │")}  ${s("c-dim", "No tasks yet! Add one with:")} ${s("c-cyan", 'add "your task"')}`);
            print(`  ${s("c-robot", "  └┬─┬─┬┘")}`);
            print("");
            return;
        }

        const sorted = [...tasks].sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            return a.id - b.id;
        });

        const tw = getTermWidth();
        const robotPad = ROBOT_W + 2;
        const idW = 4;
        const statusW = 4;
        const dateW = 11;
        const taskW = Math.max(tw - robotPad - idW - statusW - dateW - 13, 20);

        const H = "─", V = "│";
        const TL = "╭", TR = "╮", BL = "╰", BR = "╯";
        const TD = "┬", TU = "┴", TR2 = "├", TL2 = "┤", X = "┼";

        const lines = [];

        // Header
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

            // First line
            lines.push(
                s("c-border", V) + " " + s(idCls, pad(tid, idW, "right")) + " " +
                s("c-border", V) + "  " + statusIcon + "   " +
                s("c-border", V) + " " + s(textCls, pad(wrapped[0], taskW)) + " " +
                s("c-border", V) + " " + s(dateCls, pad(dateStr, dateW, "center")) + " " +
                s("c-border", V)
            );

            // Continuation lines
            for (let i = 1; i < wrapped.length; i++) {
                lines.push(
                    s("c-border", V) + " " + pad("", idW) + " " +
                    s("c-border", V) + " " + pad("", statusW) + " " +
                    s("c-border", V) + " " + s(textCls, pad(wrapped[i], taskW)) + " " +
                    s("c-border", V) + " " + pad("", dateW) + " " +
                    s("c-border", V)
                );
            }
        }

        // Bottom border
        lines.push(s("c-border", BL + H.repeat(idW+2) + TU + H.repeat(statusW+2) + TU + H.repeat(taskW+2) + TU + H.repeat(dateW+2) + BR));

        // Progress bar
        const total = tasks.length;
        const doneCount = tasks.filter(t => t.done).length;
        const pending = total - doneCount;
        const barW = 20;
        const filled = total ? Math.round((doneCount / total) * barW) : 0;
        const bar = s("c-bar-filled", "█".repeat(filled)) + s("c-bar-empty", "░".repeat(barW - filled));
        lines.push(`${s("c-dim", "  ")}${bar}  ${s("c-dim", `${doneCount}/${total} done  •  ${pending} pending`)}`);

        // Pair with robot (vertically centred)
        const nTable = lines.length;
        const nRobot = ROBOT_LINES.length;
        const robotStart = Math.max(0, Math.floor((nTable - nRobot) / 2));

        print("");
        for (let i = 0; i < nTable; i++) {
            const ri = i - robotStart;
            const rPart = (ri >= 0 && ri < nRobot) ? ROBOT_LINES[ri].html : ROBOT_BLANK;
            print(`  ${rPart} ${lines[i]}`);
        }
        print("");
    }

    // ── Gist API ─────────────────────────────────────────────────────────────
    async function gistPush() {
        if (!config.token || !config.gist_id) return { ok: false, err: "Not configured" };

        try {
            const resp = await fetch(`https://api.github.com/gists/${config.gist_id}`, {
                method: "PATCH",
                headers: {
                    "Authorization": `token ${config.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    files: { "tasks.json": { content: JSON.stringify(tasks, null, 2) } }
                }),
            });
            if (!resp.ok) return { ok: false, err: `HTTP ${resp.status}: ${resp.statusText}` };
            return { ok: true };
        } catch (e) {
            return { ok: false, err: e.message };
        }
    }

    async function gistPull() {
        if (!config.token || !config.gist_id) return { ok: false, err: "Not configured" };

        try {
            const resp = await fetch(`https://api.github.com/gists/${config.gist_id}`, {
                headers: { "Authorization": `token ${config.token}` },
            });
            if (!resp.ok) return { ok: false, err: `HTTP ${resp.status}: ${resp.statusText}` };

            const data = await resp.json();
            const file = data.files["tasks.json"];
            if (!file) return { ok: false, err: "No tasks.json in gist" };

            tasks = JSON.parse(file.content);
            saveTasks();
            return { ok: true };
        } catch (e) {
            return { ok: false, err: e.message };
        }
    }

    async function gistCreate() {
        if (!config.token) return { ok: false, err: "No token" };

        try {
            const resp = await fetch("https://api.github.com/gists", {
                method: "POST",
                headers: {
                    "Authorization": `token ${config.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    description: "ToDoBot tasks",
                    public: false,
                    files: { "tasks.json": { content: JSON.stringify(tasks, null, 2) } }
                }),
            });
            if (!resp.ok) return { ok: false, err: `HTTP ${resp.status}: ${resp.statusText}` };

            const data = await resp.json();
            return { ok: true, id: data.id };
        } catch (e) {
            return { ok: false, err: e.message };
        }
    }

    // ── Spinner helper ───────────────────────────────────────────────────────
    function showSpinner(message) {
        const div = document.createElement("div");
        div.innerHTML = `  <span class="spinner"></span> ${s("c-reset", message)}`;
        div.id = "spinner-line";
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
        return div;
    }

    function hideSpinner(spinnerDiv) {
        if (spinnerDiv && spinnerDiv.parentNode) {
            spinnerDiv.parentNode.removeChild(spinnerDiv);
        }
    }

    // ── Interactive prompt ───────────────────────────────────────────────────
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
            inputCallback = (val) => {
                input.type = "text";
                resolve(val);
            };
        });
    }

    // ── Commands ─────────────────────────────────────────────────────────────
    function cmdAdd(text) {
        if (!text) {
            print(`\n  ${s("c-bright-red", "✘")}  Usage: ${s("c-cyan", 'add "task text"')}\n`);
            return;
        }
        const id = nextId();
        tasks.push({ id, text, done: false, created: new Date().toISOString() });
        saveTasks();
        print(`\n  ${s("c-bright-green", "✔")} Added task ${s("c-magenta", "#" + id)}: ${s("c-bright-white", text)}\n`);
    }

    function cmdList() {
        renderTable();
    }

    function cmdDone(idStr) {
        if (!idStr) {
            print(`\n  ${s("c-bright-red", "✘")}  Usage: ${s("c-cyan", "done <id>")}\n`);
            return;
        }
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
            print(`\n  ${s("c-bright-red", "✘")}  ID must be a number.\n`);
            return;
        }
        const task = tasks.find(t => t.id === id);
        if (!task) {
            print(`\n  ${s("c-bright-red", "✘")}  Task ${s("c-magenta", "#" + id)} not found.\n`);
            return;
        }
        if (task.done) {
            print(`\n  ${s("c-bright-yellow", "⚠")}  Task ${s("c-magenta", "#" + id)} is already done.\n`);
            return;
        }
        task.done = true;
        saveTasks();
        print(`\n  ${s("c-bright-green", "✔")}  Nice! Completed ${s("c-magenta", "#" + id)}: ${s("c-dim c-strike", task.text)}\n`);
    }

    function cmdRemove(idStr) {
        if (!idStr) {
            print(`\n  ${s("c-bright-red", "✘")}  Usage: ${s("c-cyan", "rm <id>")}\n`);
            return;
        }
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
            print(`\n  ${s("c-bright-red", "✘")}  ID must be a number.\n`);
            return;
        }
        const idx = tasks.findIndex(t => t.id === id);
        if (idx === -1) {
            print(`\n  ${s("c-bright-red", "✘")}  Task ${s("c-magenta", "#" + id)} not found.\n`);
            return;
        }
        const removed = tasks.splice(idx, 1)[0];
        saveTasks();
        print(`\n  ${s("c-bright-red", "🗑")}  Removed ${s("c-magenta", "#" + id)}: ${s("c-dim", removed.text)}\n`);
    }

    async function cmdSync(sub) {
        if (sub === "status") {
            if (config.gist_id) {
                print(`\n  ${s("c-bright-green", "✔")}  Gist configured: ${s("c-dim", config.gist_id)}`);
                print(`  ${s("c-bright-green", "✔")}  Token: ${s("c-dim", "••••" + config.token.slice(-4))}\n`);
            } else {
                print(`\n  ${s("c-dim", "No gist configured. Run:")} ${s("c-cyan", "sync")}\n`);
            }
            return;
        }

        if (sub === "pull") {
            if (!config.gist_id || !config.token) {
                print(`\n  ${s("c-bright-red", "✘")}  No gist configured. Run: ${s("c-cyan", "sync")}\n`);
                return;
            }
            const sp = showSpinner("Pulling from gist...");
            const result = await gistPull();
            hideSpinner(sp);
            if (result.ok) {
                print(`  ${s("c-bright-green", "✔")}  Pulled from gist\n`);
            } else {
                print(`  ${s("c-bright-red", "✘")}  ${result.err}\n`);
            }
            return;
        }

        if (sub === "reset") {
            config = {};
            saveConfig();
            print(`\n  ${s("c-bright-green", "✔")}  Sync config cleared.\n`);
            return;
        }

        // Default: push (or setup first)
        if (!config.token || !config.gist_id) {
            await setupSync();
            if (!config.token || !config.gist_id) return;
        }

        const sp = showSpinner("Pushing to gist...");
        const result = await gistPush();
        hideSpinner(sp);
        if (result.ok) {
            print(`  ${s("c-bright-green", "✔")}  Pushed to gist\n`);
        } else {
            print(`  ${s("c-bright-red", "✘")}  ${result.err}\n`);
        }
    }

    async function setupSync() {
        print(`\n  ${s("c-bold c-bright-white", "Gist sync setup")}\n`);

        if (!config.token) {
            print(`  ${s("c-bold c-bright-white", "How to create a token:")}`);
            print(`  ${s("c-dim", "1.")} Go to <a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>`);
            print(`  ${s("c-dim", "2.")} Click ${s("c-bright-white", "Generate new token")} → ${s("c-bright-white", "classic")}`);
            print(`  ${s("c-dim", "3.")} Name it something like ${s("c-bright-white", '"ToDoBot"')}`);
            print(`  ${s("c-dim", "4.")} Tick only the ${s("c-bold", "gist")} scope`);
            print(`  ${s("c-dim", "5.")} Click ${s("c-bright-white", "Generate token")} and copy it`);
            print("");
            const token = await promptSecret("Paste your token: ");
            if (!token || !token.trim()) {
                print(`  ${s("c-dim", "Cancelled.")}\n`);
                return;
            }
            config.token = token.trim();
            saveConfig();
            print(`  ${s("c-bright-green", "✔")}  Token saved\n`);
        }

        print(`    ${s("c-cyan", "[") + s("c-bright-white", "c") + s("c-cyan", "]")}  Create a new private gist`);
        print(`    ${s("c-cyan", "[") + s("c-bright-white", "e") + s("c-cyan", "]")}  Enter an existing gist ID\n`);

        const choice = await prompt("Choose: ");
        if (!choice) {
            print(`  ${s("c-dim", "Cancelled.")}\n`);
            return;
        }

        const c = choice.trim().toLowerCase();

        if (c === "c") {
            const sp = showSpinner("Creating private gist...");
            const result = await gistCreate();
            hideSpinner(sp);
            if (result.ok) {
                config.gist_id = result.id;
                saveConfig();
                print(`  ${s("c-bright-green", "✔")}  Gist created: ${s("c-dim", result.id)}\n`);
            } else {
                print(`  ${s("c-bright-red", "✘")}  ${result.err}\n`);
            }
        } else if (c === "e") {
            const gistInput = await prompt("Gist ID (or URL): ");
            if (!gistInput || !gistInput.trim()) {
                print(`  ${s("c-dim", "Cancelled.")}\n`);
                return;
            }
            // Extract ID from URL if needed
            const gistId = gistInput.trim().replace(/\/$/, "").split("/").pop();
            config.gist_id = gistId;
            saveConfig();
            print(`  ${s("c-bright-green", "✔")}  Gist configured: ${s("c-dim", gistId)}\n`);

            // Auto-pull after entering existing gist
            const sp = showSpinner("Pulling from gist...");
            const result = await gistPull();
            hideSpinner(sp);
            if (result.ok) {
                print(`  ${s("c-bright-green", "✔")}  Pulled tasks from gist\n`);
            } else {
                print(`  ${s("c-bright-yellow", "⚠")}  Pull failed: ${s("c-dim", result.err)}\n`);
            }
        } else {
            print(`  ${s("c-dim", "Cancelled.")}\n`);
        }
    }

    function cmdHelp() {
        print("");
        print(`  ${s("c-bold c-bright-white", "COMMANDS")}`);
        print(`    ${s("c-cyan", "add")} ${s("c-dim", '"task text"')}       add a new task`);
        print(`    ${s("c-cyan", "ls")}                    list all tasks`);
        print(`    ${s("c-cyan", "done")} ${s("c-dim", "<id>")}             mark a task as done`);
        print(`    ${s("c-cyan", "rm")} ${s("c-dim", "<id>")}               remove a task`);
        print(`    ${s("c-cyan", "sync")}                  push tasks to gist`);
        print(`    ${s("c-cyan", "sync pull")}             pull tasks from gist`);
        print(`    ${s("c-cyan", "sync status")}           show sync config`);
        print(`    ${s("c-cyan", "sync reset")}            clear sync config`);
        print(`    ${s("c-cyan", "clear")}                 clear the screen`);
        print(`    ${s("c-cyan", "help")}                  show this help`);
        print("");
    }

    function cmdClear() {
        clear();
    }

    // ── Command router ───────────────────────────────────────────────────────
    async function handleCommand(raw) {
        const trimmed = raw.trim();
        if (!trimmed) return;

        // Add to history
        commandHistory.unshift(trimmed);
        if (commandHistory.length > 50) commandHistory.pop();
        historyIndex = -1;

        // Echo the command
        print(`  ${s("c-cyan", "❯")} ${s("c-bright-white", trimmed)}`);

        const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
        const cmd = parts[0]?.toLowerCase();
        const args = parts.slice(1).map(a => a.replace(/^"|"$/g, ""));

        switch (cmd) {
            case "add":
                cmdAdd(args.join(" "));
                break;
            case "ls":
            case "list":
                cmdList();
                break;
            case "done":
                cmdDone(args[0]);
                break;
            case "rm":
            case "remove":
            case "del":
            case "delete":
                cmdRemove(args[0]);
                break;
            case "sync":
                await cmdSync(args[0]?.toLowerCase());
                break;
            case "clear":
            case "cls":
                cmdClear();
                break;
            case "help":
            case "?":
                cmdHelp();
                break;
            default:
                print(`\n  ${s("c-bright-red", "✘")}  Unknown command: ${s("c-bright-white", cmd)}`);
                cmdHelp();
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
                await handleCommand(val);
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                input.value = commandHistory[historyIndex];
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                input.value = commandHistory[historyIndex];
            } else {
                historyIndex = -1;
                input.value = "";
            }
        }
    });

    // Focus input on click anywhere
    document.addEventListener("click", () => input.focus());

    // ── Boot ─────────────────────────────────────────────────────────────────
    async function boot() {
        loadConfig();
        loadTasks();

        print(s("c-robot", "  ┌─┤ ├─┐") + "  " + s("c-bold c-bright-white", "T o D o B o t"));
        print(s("c-robot", "  │ ◉ ◉ │") + "  " + s("c-dim", "your friendly task buddy"));
        print(s("c-robot", "  └┬─┬─┬┘") + "  " + s("c-dim", "type ") + s("c-cyan", "help") + s("c-dim", " to get started"));
        print("");

        // Auto-pull if configured
        if (config.token && config.gist_id) {
            const sp = showSpinner("Syncing from gist...");
            const result = await gistPull();
            hideSpinner(sp);
            if (result.ok) {
                print(`  ${s("c-bright-green", "✔")}  Synced from gist\n`);
            } else {
                print(`  ${s("c-bright-yellow", "⚠")}  Sync failed: ${s("c-dim", result.err)}\n`);
            }
        }

        renderTable();
    }

    boot();
})();
