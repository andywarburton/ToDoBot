# ToDoBot

```
  ┌─┤ ├─┐
  │ ◉ ◉ │   your friendly terminal task manager
  └┬─┬─┬┘
```

> **Disclaimer:** This is vibe coded slop but it actually works quite well.

A simple, colourful todo list that runs entirely in the terminal. Written in Python 3 with zero dependencies — just the standard library.

Also available as a **web app** at [andywarburton.github.io/ToDoBot](https://andywarburton.github.io/ToDoBot/) — same terminal look and feel, syncs with the same gist.

## Features

- **Quick CLI commands** — `todo add "task"`, `todo ls`, `todo done 3`, `todo rm 3`
- **Interactive wizard** — just type `todo` for a menu-driven interface
- **Cloud sync** — sync tasks across devices via a private GitHub Gist
- **Web version** — same terminal UI in the browser via GitHub Pages

## Install

```sh
git clone https://github.com/andywarburton/ToDoBot.git ~/ToDoBot
cd ~/ToDoBot
./install.sh
```

The installer will:
1. Check for Python 3
2. Offer to install the [GitHub CLI](https://cli.github.com) (`gh`) for cloud sync
3. Offer to run `gh auth login` if not already authenticated
4. Symlink `todo` into `~/.local/bin` and add it to your PATH

Re-running `install.sh` is safe — it won't duplicate PATH entries or touch your data.

## Usage

```
todo                      interactive wizard
todo add "buy milk"       add a task
todo ls                   list all tasks
todo done <id>            mark a task as done
todo rm <id>              remove a task
todo sync                 push tasks to your private gist
todo sync pull            pull tasks from your private gist
todo sync status          show sync config
todo help                 show help
```

### Interactive wizard shortcuts

In the wizard, you can combine actions with IDs for speed:

```
d 3       mark task #3 as done
r 5       remove task #5
a walk dog    add "walk dog"
```

## Cloud sync

Tasks sync to a **private** GitHub Gist via the `gh` CLI. On first run of `todo sync`, you'll be asked to either create a new gist or enter an existing gist ID. The wizard auto-pulls on open and auto-pushes on quit.

To set up on a new device:
1. Install ToDoBot and `gh` using `install.sh`
2. Run `todo sync` and choose **Enter an existing gist ID**
3. Paste the gist ID from your other device (`todo sync status` to find it)

## Data storage

All data lives in `~/.todo/` (outside this repo):

| File | Purpose |
|------|---------|
| `~/.todo/tasks.json` | Your tasks |
| `~/.todo/config.json` | Gist ID for sync |

## Requirements

- Python 3.6+
- A terminal with colour support (virtually all modern terminals)
- `gh` CLI (optional, for cloud sync)

## License

MIT
