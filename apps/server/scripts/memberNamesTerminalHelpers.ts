import { closeSync, openSync } from "node:fs";
import { emitKeypressEvents } from "node:readline";
import { ReadStream, WriteStream } from "node:tty";

/** One semantic theme with stream-specific plain output. */
const THEME = {
  heading: "97",
  info: "36",
  success: "32",
  error: "31",
  warning: "33",
  selection: "1;32",
  prompt: "97",
} as const;

/** Formats command copy with the shared stream-aware semantic theme. */
export function memberNamesMessage(
  message: string,
  kind: keyof typeof THEME,
  stream: NodeJS.WriteStream = process.stderr,
): string {
  return stream.isTTY &&
    !process.env["NO_COLOR"] &&
    process.env["TERM"] !== "dumb"
    ? `\u001b[${THEME[kind]}m${message}\u001b[0m`
    : message;
}

export type Action = "audit" | "stage";

export type Arguments = {
  action: Action | undefined;
  databasePath: string | undefined;
  assignmentsPath: string | undefined;
};

type Terminal = Readonly<{
  input: ReadStream;
  output: WriteStream;
  close: () => void;
}>;

/** Signals cancellation before any catalog side effects. */
export class MemberNamesCancelled extends Error {}

function _openTerminal(): Terminal {
  let inputDescriptor: number | undefined;
  try {
    inputDescriptor = openSync("/dev/tty", "r");
    const outputDescriptor = openSync("/dev/tty", "w");
    const input = new ReadStream(inputDescriptor);
    const output = new WriteStream(outputDescriptor);
    return {
      input,
      output,
      close: () => {
        input.setRawMode(false);
        input.destroy();
        output.destroy();
      },
    };
  } catch {
    if (inputDescriptor !== undefined) {
      closeSync(inputDescriptor);
    }
    throw new Error(
      "Missing required arguments and no controlling terminal is available.",
    );
  }
}

function _renderChoice(
  terminal: Terminal,
  label: string,
  choices: readonly string[],
  selected: number,
): void {
  terminal.output.write(
    `${memberNamesMessage(label, "heading", terminal.output)}\n${choices
      .map((choice, index) => {
        return index === selected
          ? memberNamesMessage(`> ${choice}`, "selection", terminal.output)
          : `  ${choice}`;
      })
      .join("\n")}\n`,
  );
}

function _prepareTerminalInput(input: ReadStream): void {
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
}

function _getSelectionFromKey(
  key: Readonly<{ name?: string; ctrl?: boolean }>,
  selected: number,
  count: number,
): number | "cancel" | "confirm" {
  if (
    (key.ctrl && ["c", "d"].includes(key.name ?? "")) ||
    key.name === "escape"
  ) {
    return "cancel";
  }
  if (key.name === "return") {
    return "confirm";
  }
  if (["up", "k"].includes(key.name ?? "")) {
    return (selected - 1 + count) % count;
  }
  if (["down", "j"].includes(key.name ?? "")) {
    return (selected + 1) % count;
  }
  return selected;
}

async function _choose(
  terminal: Terminal,
  label: string,
  choices: readonly string[],
): Promise<number> {
  const { input, output } = terminal;
  let selected = 0;
  _prepareTerminalInput(input);
  _renderChoice(terminal, label, choices, selected);
  return new Promise((accept, reject) => {
    const finish = (error?: Error) => {
      input.off("keypress", onKey);
      input.off("end", onEnd);
      input.setRawMode(false);
      input.pause();
      if (error) {
        reject(error);
      } else {
        accept(selected);
      }
    };
    const onEnd = finish.bind(
      undefined,
      new MemberNamesCancelled("MemberNamesCancelled."),
    );
    const onKey = (
      _value: string,
      key: Readonly<{ name?: string; ctrl?: boolean }>,
    ) => {
      const selection = _getSelectionFromKey(key, selected, choices.length);
      if (selection === "cancel") {
        finish(new MemberNamesCancelled("MemberNamesCancelled."));
        return;
      }
      if (selection === "confirm") {
        finish();
        return;
      }
      if (selection === selected) {
        return;
      }
      selected = selection;
      // Plain mode preserves selection states without cursor control sequences.
      if (
        output.isTTY &&
        !process.env["NO_COLOR"] &&
        process.env["TERM"] !== "dumb"
      ) {
        output.write(`\u001b[${choices.length + 1}A\u001b[J`);
      }
      _renderChoice(terminal, label, choices, selected);
    };
    input.on("keypress", onKey);
    input.on("end", onEnd);
  });
}

async function _ask(terminal: Terminal, label: string): Promise<string> {
  const { input, output } = terminal;
  let answer = "";
  _prepareTerminalInput(input);
  output.write(`${memberNamesMessage(label, "prompt", output)}: `);
  return new Promise((accept, reject) => {
    const finish = (error?: Error) => {
      input.off("keypress", onKey);
      input.off("end", onEnd);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) {
        reject(error);
      } else {
        accept(answer.trim());
      }
    };
    const onEnd = finish.bind(
      undefined,
      new MemberNamesCancelled("MemberNamesCancelled."),
    );
    const onKey = (
      value: string,
      key: Readonly<{ name?: string; ctrl?: boolean; meta?: boolean }>,
    ) => {
      if (key.ctrl && ["c", "d"].includes(key.name ?? "")) {
        finish(new MemberNamesCancelled("MemberNamesCancelled."));
        return;
      }
      if (key.name === "return") {
        finish();
        return;
      }
      if (key.name === "backspace") {
        answer = Array.from(answer).slice(0, -1).join("");
        output.write(`\n${label}: ${answer}`);
      } else if (!key.ctrl && !key.meta && value && !/\p{Cc}/u.test(value)) {
        answer += value;
        output.write(value);
      }
    };
    input.on("keypress", onKey);
    input.on("end", onEnd);
  });
}

export type CompleteArguments = Readonly<{
  action: Action;
  databasePath: string;
  assignmentsPath: string | undefined;
}>;

async function _getActionFromTerminal(terminal: Terminal): Promise<Action> {
  const selected = await _choose(terminal, "Member name rollout", [
    "Audit names (read-only)",
    "Stage assignments (application stopped)",
    "Cancel",
  ]);
  if (selected === 2) {
    throw new MemberNamesCancelled("MemberNamesCancelled.");
  }
  return selected === 0 ? "audit" : "stage";
}

async function _getPathsFromTerminal(
  terminal: Terminal,
  args: Arguments,
  action: Action,
): Promise<CompleteArguments> {
  const databasePath =
    args.databasePath ??
    (await _ask(terminal, "Existing catalog path (required, no default)"));
  const assignmentsPath =
    action === "stage"
      ? (args.assignmentsPath ??
        (await _ask(terminal, "Assignments JSON file (required, no default)")))
      : undefined;
  if (!databasePath || (action === "stage" && !assignmentsPath)) {
    throw new Error("Required paths cannot be empty.");
  }
  if (
    action === "stage" &&
    (await _choose(terminal, "Are all application processes stopped?", [
      "No, cancel",
      "Yes, stage assignments",
    ])) !== 1
  ) {
    throw new MemberNamesCancelled("MemberNamesCancelled.");
  }
  return { action, databasePath, assignmentsPath };
}

/** Collects missing command values from an owned controlling terminal. */
export async function completeMemberNamesArguments(
  args: Arguments,
): Promise<CompleteArguments> {
  if (
    args.action &&
    args.databasePath &&
    (args.action === "audit" || args.assignmentsPath)
  ) {
    return {
      action: args.action,
      databasePath: args.databasePath,
      assignmentsPath: args.assignmentsPath,
    };
  }
  const terminal = _openTerminal();
  try {
    const action = args.action ?? (await _getActionFromTerminal(terminal));
    return await _getPathsFromTerminal(terminal, args, action);
  } finally {
    terminal.close();
  }
}
