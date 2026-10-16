/** One costly decode request, cancellable while queued or while awaiting it. */
type DecodeRequest<T> = {
  priority: "active" | "preview";
  signal: AbortSignal;
  work: () => Promise<T>;
};
type DecodeJob = {
  priority: "active" | "preview";
  start: () => void;
  cancel: () => void;
};
type DecodeContext = {
  jobs: DecodeJob[];
  isActive: boolean;
  isDisposed: boolean;
};

function _abortError(): DOMException {
  return new DOMException("Upload decoding cancelled", "AbortError");
}

function _drain(context: DecodeContext): void {
  if (context.isActive || context.isDisposed) {
    return;
  }
  const activeIndex = context.jobs.findIndex((job) => {
    return job.priority === "active";
  });
  const [job] = context.jobs.splice(Math.max(0, activeIndex), 1);
  if (job) {
    context.isActive = true;
    job.start();
  }
}

function _run<T>({
  context,
  options,
}: {
  context: DecodeContext;
  options: Readonly<DecodeRequest<T>>;
}): Promise<T> {
  if (context.isDisposed || options.signal.aborted) {
    return Promise.reject(_abortError());
  }
  return new Promise<T>((settle, fail) => {
    const cancel = () => {
      const index = context.jobs.indexOf(job);
      if (index >= 0) {
        context.jobs.splice(index, 1);
      }
      options.signal.removeEventListener("abort", cancel);
      fail(_abortError());
    };
    const job: DecodeJob = {
      priority: options.priority,
      cancel,
      start: () => {
        // Caller cancellation never releases an uncancellable underlying
        // decode.
        void (async () => {
          return options.work();
        })()
          .then(settle, fail)
          .finally(() => {
            options.signal.removeEventListener("abort", cancel);
            context.isActive = false;
            _drain(context);
          });
      },
    };
    options.signal.addEventListener("abort", cancel, { once: true });
    context.jobs.push(job);
    _drain(context);
  });
}

/** One session-owned decoder scheduler, independent from hash and PUT lanes. */
export function createUploadDecodeCoordinator(): UploadDecodeCoordinator {
  const context: DecodeContext = {
    jobs: [],
    isActive: false,
    isDisposed: false,
  };
  return {
    // Active preparation overtakes waiting previews without preempting a
    // decode.
    run: <T>(options: Readonly<DecodeRequest<T>>): Promise<T> => {
      return _run({ context, options });
    },
    // An executing decode retains its slot while queued work is rejected.
    dispose: (): void => {
      context.isDisposed = true;
      [...context.jobs].forEach((job) => {
        return job.cancel();
      });
    },
  };
}

/** The shared session dependency accepted by every upload preparation path. */
export type UploadDecodeCoordinator = {
  /** Queues a costly decode with the caller's cancellation signal. */
  run: <T>(options: Readonly<DecodeRequest<T>>) => Promise<T>;
  /** Rejects future/queued work while an active decode settles. */
  dispose: () => void;
};
