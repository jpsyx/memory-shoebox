/* Prototype behaviour only. None of this is product code: it exists so the
   renditions can be compared and so the two ideas that matter, fanning a
   burst and pinning a note to a moment, can actually be tried. */

const RENDITIONS = ["porcelain", "slate", "day", "night"];
const STORAGE_KEY = "famgram-rendition";

function applyRendition(name) {
  document.documentElement.dataset.rendition = name;
  document.querySelectorAll("[data-set-rendition]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.setRendition === name),
    );
  });
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* Private windows throw here. The page still works. */
  }
}

/* Chromium does not always invalidate an inherited `color` that resolves
   through a var() chain when the rendition attribute changes, so switching
   live can leave stale text colours behind. Reloading is the honest
   comparison anyway: each palette renders exactly as a real visit renders it. */
function initRenditionSwitch() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  applyRendition(RENDITIONS.includes(stored) ? stored : "day");

  document.querySelectorAll("[data-set-rendition]").forEach((button) => {
    button.addEventListener("click", () => {
      if (
        button.dataset.setRendition ===
        document.documentElement.dataset.rendition
      ) {
        return;
      }
      applyRendition(button.dataset.setRendition);
      location.reload();
    });
  });
}

/* --- The pile ------------------------------------------------------------
   The pile is a column layout in CSS, so nothing here needs to measure or
   place it. Every print keeps its own proportions and the columns pack flush:
   cropping a family archive to squares cuts faces out of it. */

/* --- One control across the whole field ----------------------------------
   The archive is scrolled, but a pile that grows for years needs a way to
   land somewhere without scrolling to it. A native select because the
   audience skews older and native affordances beat invented ones here. */
function initJump() {
  const jump = document.querySelector("[data-jump]");
  if (!jump) {
    return;
  }
  jump.addEventListener("change", () => {
    const day = document.getElementById(jump.value);
    if (day) {
      day.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

/* --- Mess ----------------------------------------------------------------
   A fridge door is not a grid. This gives every print a small rotation and
   offset so the pile reads as stuck up rather than laid out, and lets the two
   readings be compared side by side.

   The values are seeded from each print's position rather than Math.random,
   so a reload does not reshuffle the whole wall. */
/* In the product this is an instance-level setting, chosen once by whoever
   runs the deployment, not a per-viewer preference (see PRODUCT.md, Instance
   settings). Here it is a switch purely so the two can be compared. */
const PILE_MODES = ["tidy", "messy"];
const PILE_KEY = "famgram-pile";

function seededUnit(index) {
  // A cheap deterministic hash: enough scatter to look unsorted, stable
  // across reloads so the wall does not jitter every time you visit.
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function scatterPrints() {
  document
    .querySelectorAll(
      ".day__pile > .print, .stack > .print, .stack__fan .print",
    )
    .forEach((print, index) => {
      const a = seededUnit(index);
      const b = seededUnit(index + 101);
      const c = seededUnit(index + 211);
      print.style.setProperty("--r", `${(a * 5 - 2.5).toFixed(2)}deg`);
      print.style.setProperty("--dx", `${(b * 10 - 5).toFixed(1)}px`);
      print.style.setProperty("--dy", `${(c * 10 - 5).toFixed(1)}px`);
      print.style.setProperty("--z", String(1 + Math.floor(a * 6)));
    });
}

function applyPileMode(mode) {
  document.documentElement.dataset.pile = mode;
  document.querySelectorAll("[data-set-pile]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.setPile === mode),
    );
  });
  try {
    localStorage.setItem(PILE_KEY, mode);
  } catch {
    /* Private windows throw here. */
  }
}

function initPileSwitch() {
  let stored = null;
  try {
    stored = localStorage.getItem(PILE_KEY);
  } catch {
    stored = null;
  }
  scatterPrints();
  applyPileMode(PILE_MODES.includes(stored) ? stored : "messy");

  document.querySelectorAll("[data-set-pile]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPileMode(button.dataset.setPile);
    });
  });
}

/* --- Stacks --------------------------------------------------------------
   The whole point of the direction: a burst of forty near-identical frames is
   one object in the pile until you ask for it, so a birthday does not bury
   the rest of the day. */
function initStacks() {
  document.querySelectorAll("[data-stack]").forEach((stack) => {
    const opener = stack.querySelector("[data-stack-open]");
    const closer = stack.querySelector("[data-stack-close]");

    const setOpen = (open) => {
      stack.classList.toggle("stack--open", open);
      if (opener) {
        opener.setAttribute("aria-expanded", String(open));
      }
      // A column-spanning fan sizes itself; nothing to measure.
    };

    if (opener) {
      opener.addEventListener("click", () => {
        setOpen(true);
        // Bring the fan's head into view: on a long burst the label and the
        // way out would otherwise sit above the fold.
        stack.scrollIntoView({ block: "start", behavior: "smooth" });
        const firstFrame = stack.querySelector(".stack__fan .print");
        if (firstFrame) {
          firstFrame.focus({ preventScroll: true });
        }
      });
    }

    if (closer) {
      closer.addEventListener("click", () => {
        setOpen(false);
        if (opener) {
          opener.focus({ preventScroll: true });
        }
      });
    }

    stack.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && stack.classList.contains("stack--open")) {
        setOpen(false);
        if (opener) {
          opener.focus({ preventScroll: true });
        }
      }
    });
  });
}

/* --- The video sheet ----------------------------------------------------
   A note can be pinned to a moment. Clicking the stamp seeks there, and every
   pinned note shows as a mark standing on the scrubber at its own time. */
function initVideoSheet() {
  const video = document.querySelector("[data-video]");
  const scrubber = document.querySelector("[data-scrubber]");
  if (!video || !scrubber) {
    return;
  }

  const played = scrubber.querySelector("[data-played]");
  const clock = document.querySelector("[data-clock]");
  const play = document.querySelector("[data-play]");
  const playIcon = document.querySelector("[data-play-icon]");

  const PLAY_PATH = "M8 5.5v13l11-6.5z";
  const PAUSE_PATH = "M9 5.5h2.5v13H9zM14.5 5.5H17v13h-2.5z";

  const format = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  };

  const placeMarks = () => {
    if (!video.duration) {
      return;
    }
    scrubber.querySelectorAll("[data-at]").forEach((mark) => {
      mark.style.left = `${(Number(mark.dataset.at) / video.duration) * 100}%`;
    });
  };

  video.addEventListener("loadedmetadata", placeMarks);
  video.addEventListener("timeupdate", () => {
    if (!video.duration) {
      return;
    }
    played.style.width = `${(video.currentTime / video.duration) * 100}%`;
    if (clock) {
      clock.textContent = `${format(video.currentTime)} / ${format(video.duration)}`;
    }
  });

  if (play) {
    play.addEventListener("click", () => {
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
    const syncPlay = () => {
      const isPlaying = !video.paused;
      play.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
      playIcon.firstElementChild.setAttribute(
        "d",
        isPlaying ? PAUSE_PATH : PLAY_PATH,
      );
    };
    video.addEventListener("play", syncPlay);
    video.addEventListener("pause", syncPlay);
  }

  document.querySelectorAll("[data-seek]").forEach((stamp) => {
    stamp.addEventListener("click", (event) => {
      // A mark sits inside the scrubber, so without this its click also runs
      // the bar handler below and immediately seeks somewhere else. Keyboard
      // activation is the worst case: it reports no coordinates, so the bar
      // handler would compute a negative time and jump to the start.
      event.stopPropagation();
      video.currentTime = Number(stamp.dataset.seek);
      video.play().catch(() => {
        /* Autoplay policy. The seek still lands. */
      });
    });
  });

  scrubber.addEventListener("click", (event) => {
    if (event.target.closest("[data-seek]")) {
      return;
    }
    const box = scrubber.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    video.currentTime = Math.min(Math.max(fraction, 0), 1) * video.duration;
  });
}

/* --- The composer -------------------------------------------------------
   Demonstrates the states a real one needs: empty and disabled, typing and
   enabled, sending, and back to empty. */
function initComposer() {
  document.querySelectorAll("[data-composer]").forEach((form) => {
    const field = form.querySelector("textarea");
    const submit = form.querySelector("button[type='submit']");
    if (!field || !submit) {
      return;
    }

    const sync = () => {
      submit.disabled = field.value.trim().length === 0;
    };
    sync();
    field.addEventListener("input", sync);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = "Sending";
      setTimeout(() => {
        submit.textContent = "Send";
        field.value = "";
        sync();
      }, 900);
    });
  });
}

initRenditionSwitch();
initPileSwitch();
initJump();
initStacks();
initVideoSheet();
initComposer();
