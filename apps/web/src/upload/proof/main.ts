import {
  getConcurrencyFromSearch,
  getHoldFromSearch,
} from "@/upload/proof/runUploadProof/uploadProofInputHelpers";
import { runUploadProof } from "@/upload/proof/runUploadProof/runUploadProof";
import {
  makeIdleUploadProofState,
  type UploadProofState,
} from "@/upload/proof/uploadProofStateHelpers/uploadProofStateHelpers";

/*
 * The upload proof's page: `apps/web/upload-proof.html`, served by `pnpm dev`
 * and never built (decision 10). Plain DOM, deliberately: it is a harness for
 * the engine, not product UI, and it must load on a phone with nothing of the
 * app's around it. Picking files starts a run; `window.__uploadProof` is the
 * run's live state, which `pnpm upload:proof` and `e2e/upload.spec.ts` read.
 */

/** The element at `selector`, which this page's own HTML guarantees. */
function _requireElement<T extends Element>(
  functionOptions: Readonly<{ selector: string; type: abstract new () => T }>,
): T {
  const { selector, type } = functionOptions;

  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`upload-proof.html has no ${selector}`);
  }
  return element;
}

const input = _requireElement({ selector: "#files", type: HTMLInputElement });
const log = _requireElement({ selector: "#log", type: HTMLPreElement });
const summary = _requireElement({
  selector: "#summary",
  type: HTMLTableSectionElement,
});

const state = makeIdleUploadProofState({
  concurrency: getConcurrencyFromSearch(location.search),
  userAgent: navigator.userAgent,
});
Object.defineProperty(window, "__uploadProof", {
  value: state,
  configurable: true,
});

/** One line at the bottom of the log. */
function _appendLog(line: string): void {
  log.textContent = `${log.textContent ?? ""}${line}\n`;
}

/** One row per picked file, once the run has ended. */
function _renderSummary(ended: Readonly<UploadProofState>): void {
  summary.replaceChildren(
    ...ended.files.map((file) => {
      const row = document.createElement("tr");
      row.append(
        ...[
          file.name,
          file.contentType,
          String(file.bytes),
          file.outcome,
          file.problemCode ?? "",
          file.prepareMs === null ? "" : String(Math.round(file.prepareMs)),
          file.transferMs === null ? "" : String(Math.round(file.transferMs)),
          file.totalMs === null ? "" : String(Math.round(file.totalMs)),
        ].map((text) => {
          const cell = document.createElement("td");
          cell.textContent = text;
          return cell;
        }),
      );
      return row;
    }),
  );
}

input.addEventListener("change", () => {
  const isRunning =
    state.phase !== "idle" &&
    state.phase !== "finished" &&
    state.phase !== "failed";
  if (isRunning) {
    _appendLog("A run is already going; this pick is ignored");
    return;
  }
  const files = [...(input.files ?? [])];
  if (files.length === 0) {
    return;
  }
  Object.assign(state, makeIdleUploadProofState(state));
  _appendLog(`Picked ${files.length} files`);
  void runUploadProof({
    state,
    files,
    hold: getHoldFromSearch(location.search),
    onLog: _appendLog,
  }).then(() => {
    _appendLog(
      state.phase === "finished"
        ? `Finished in ${Math.round(state.wallMs ?? 0)} ms`
        : `Failed: ${state.error ?? "unknown"}`,
    );
    _renderSummary(state);
    // Picking the very same files again is not a change to the input, so
    // without this it would start nothing.
    input.value = "";
  });
});

_appendLog(`Ready, ${state.concurrency} at a time. Pick files to start.`);
