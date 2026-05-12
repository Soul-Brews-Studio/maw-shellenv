/**
 * maw shellenv — emit shell init code for `eval "$(maw shellenv <shell>)"`.
 *
 * Pattern stolen from `direnv hook`, `zoxide init`, `starship init`,
 * `brew shellenv`, `rbenv init` — five precedents users already trust.
 *
 * The emitted snippet defines a `maw()` shell function that intercepts
 * `maw warp [<oracle>]` (does in-shell `cd` via `command maw locate
 * --path`) and passes every other subcommand through to the real
 * binary. `warp` is shell-only by design — see issue #812 / ADR 0001.
 *
 * Phase A: zsh + bash. fish deferred to v2 (genuinely different syntax).
 */
import { UserError } from "./internal/user-error";
import { zshSnippet } from "./snippets/zsh";
import { bashSnippet } from "./snippets/bash";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const SUPPORTED_SHELLS = ["zsh", "bash"] as const;
export type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

const HELP = `usage: maw shellenv [<shell>] [--install]

Emit shell init code for eval-style installation.

  Install (auto):
    maw shellenv --install         # auto-detect $SHELL, append to rc file

  Install (manual):
    eval "$(maw shellenv zsh)"     # add to ~/.zshrc
    eval "$(maw shellenv bash)"    # add to ~/.bashrc

Available shells: ${SUPPORTED_SHELLS.join(", ")}

The emitted snippet installs:
  maw()    intercepts \`maw warp <oracle>\` (in-shell cd)
  claude() auto-fallback when --continue fails (no prior session)

`;

export interface ShellenvOpts {
  help?: boolean;
  install?: boolean;
}

const EVAL_LINE_PREFIX = 'eval "$(maw shellenv';

function detectShell(): SupportedShell | null {
  const shellEnv = process.env.SHELL || "";
  if (shellEnv.endsWith("/zsh")) return "zsh";
  if (shellEnv.endsWith("/bash")) return "bash";
  return null;
}

function rcFileFor(shell: SupportedShell): string {
  return join(homedir(), shell === "zsh" ? ".zshrc" : ".bashrc");
}

async function installToRc(shell: SupportedShell): Promise<void> {
  const rc = rcFileFor(shell);
  const evalLine = `eval "$(maw shellenv ${shell})"`;
  const block = `\n# maw shellenv — auto-installed by 'maw shellenv --install'\n${evalLine}\n`;

  if (existsSync(rc)) {
    const content = readFileSync(rc, "utf-8");
    if (content.includes(EVAL_LINE_PREFIX)) {
      console.log(`\x1b[33m✓\x1b[0m already installed in ${rc}`);
      console.log(`  Reload: \x1b[36msource ${rc}\x1b[0m`);
      return;
    }
    writeFileSync(rc, content + block);
  } else {
    writeFileSync(rc, block);
  }
  console.log(`\x1b[32m✓\x1b[0m appended to ${rc}`);
  console.log(`  Reload: \x1b[36msource ${rc}\x1b[0m`);
  console.log(`  Or open a new terminal.`);
}

function emit(shell: SupportedShell): string {
  switch (shell) {
    case "zsh":
      return zshSnippet();
    case "bash":
      return bashSnippet();
  }
}

function isSupported(s: string): s is SupportedShell {
  return (SUPPORTED_SHELLS as readonly string[]).includes(s);
}

export async function cmdShellenv(
  shell: string | undefined,
  opts: ShellenvOpts = {},
): Promise<void> {
  if (opts.help) {
    console.log(HELP);
    return;
  }

  // --install mode: auto-detect shell + append to rc file
  if (opts.install) {
    const detectedShell = shell && isSupported(shell) ? shell : detectShell();
    if (!detectedShell) {
      console.error(
        `Error: could not detect shell from $SHELL='${process.env.SHELL || ""}'. Pass explicitly: maw shellenv <zsh|bash> --install`,
      );
      throw new UserError("could not detect shell");
    }
    await installToRc(detectedShell);
    return;
  }

  if (!shell) {
    console.error(
      `Error: shell '' not supported. Available: ${SUPPORTED_SHELLS.join(", ")}`,
    );
    throw new UserError("missing shell argument");
  }

  if (!isSupported(shell)) {
    console.error(
      `Error: shell '${shell}' not supported. Available: ${SUPPORTED_SHELLS.join(", ")}`,
    );
    throw new UserError(`unsupported shell: ${shell}`);
  }

  console.log(emit(shell));
}
