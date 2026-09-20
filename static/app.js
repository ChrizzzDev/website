"use strict";
document.documentElement.classList.replace("no-js", "js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const statusMessage = document.querySelector("#site-status");
const messages = document.body?.dataset || {};
function announce(message) {
  if (statusMessage) statusMessage.textContent = message;
}

// Keep the self-hosting example useful on the visitor's machine. The Linux
// command in the markup remains a functional no-JavaScript fallback.
const vDownloadCommand = document.querySelector("[data-v-download-command]");
const vReleaseUrl = "https://github.com/vlang/v/releases/latest/download/";

function vDownloadDetails(platform, architecture = "") {
  const normalizedPlatform = platform.toLowerCase();
  const normalizedArchitecture = architecture.toLowerCase();

  if (normalizedPlatform.includes("win")) {
    return {
      archive: "v_windows.zip",
      command:
        "curl.exe -LO " +
        vReleaseUrl +
        "v_windows.zip\n" +
        "Expand-Archive v_windows.zip -DestinationPath v\n" +
        "cd v\n" +
        "Measure-Command { .\\v.exe self }",
    };
  }

  if (normalizedPlatform.includes("mac")) {
    const archive = normalizedArchitecture.includes("x86")
      ? "v_macos_x86_64.zip"
      : "v_macos_arm64.zip";
    return {
      archive,
      command:
        "curl -LO " +
        vReleaseUrl +
        archive +
        "\nunzip " +
        archive.replace(".zip", "") +
        " && cd v\n" +
        "time ./v self",
    };
  }

  return {
    archive: "v_linux.zip",
    command:
      "wget " +
      vReleaseUrl +
      "v_linux.zip\n" +
      "unzip v_linux && cd v\n" +
      "time ./v self",
  };
}

function updateVDownloadCommand(platform, architecture) {
  if (!vDownloadCommand) return;
  const download = vDownloadDetails(platform, architecture);
  vDownloadCommand.textContent = download.command;
  vDownloadCommand.dataset.vDownloadArchive = download.archive;
}

if (vDownloadCommand) {
  const userAgentData = navigator.userAgentData;
  const fallbackPlatform = navigator.userAgent || navigator.platform || "Linux";
  updateVDownloadCommand(userAgentData?.platform || fallbackPlatform);

  // Chromium client hints distinguish Intel and Apple Silicon Macs. Safari
  // intentionally masks that distinction, so it receives the Apple Silicon
  // build that is already the site's default download.
  userAgentData
    ?.getHighEntropyValues(["architecture", "platform"])
    .then(({ architecture, platform }) =>
      updateVDownloadCommand(platform || fallbackPlatform, architecture),
    )
    .catch(() => {});
}

// Navigation remains ordinary links; the menu is only needed on small screens.
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector("#main-nav");
function closeMenu() {
  menuToggle?.setAttribute("aria-expanded", "false");
  mainNav?.classList.remove("is-open");
}
menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  mainNav.classList.toggle("is-open", open);
});
mainNav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (menuToggle?.getAttribute("aria-expanded") === "true") {
      closeMenu();
      menuToggle.focus();
    }
    document
      .querySelectorAll(".download-menu[open], .hero-download-menu[open]")
      .forEach((menu) => menu.removeAttribute("open"));
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
  document
    .querySelectorAll(".download-menu[open], .hero-download-menu[open]")
    .forEach((menu) => {
      if (!menu.contains(event.target)) menu.removeAttribute("open");
    });
});

const language = document.querySelector("#select_lang");
language?.addEventListener("change", async () => {
  const previous = document.documentElement.lang;
  language.disabled = true;
  try {
    const response = await fetch(
      "/change_lang/" + encodeURIComponent(language.value),
      { method: "POST" },
    );
    if (!response.ok) throw new Error("Language change failed");
    window.location.reload();
  } catch {
    language.value = previous;
    language.disabled = false;
		announce(messages.i18nLanguageError);
  }
});

// Pause for keyboard interaction, pointer hover, background tabs, or offscreen
// content. A user pause persists across slide changes.
const showcase = document.querySelector(".showcase");
if (showcase) {
  const slides = [...showcase.querySelectorAll(".demo-slide")];
  const tabs = [...showcase.querySelectorAll('[role="tab"]')];
  const toggle = showcase.querySelector("#demo-toggle");
  let current = 0;
  let elapsed = 0;
  let previousTime = 0;
  // The primary showcase video is intentionally configured to autoplay.
  let userPaused = false;
  let hovering = false;
  let focused = false;
  let inView = true;
  let fullVideo = false;
  let frame = 0;
  const paused = () =>
    userPaused ||
    hovering ||
    focused ||
    !inView ||
    document.hidden ||
    fullVideo;

  function syncMedia() {
    slides.forEach((slide, index) => {
      const video = slide.querySelector("video");
      if (!video) return;
      if (video.dataset.recording) {
        if (index !== current || !inView || document.hidden) video.pause();
        return;
      }
      if (index !== current) {
        video.pause();
        return;
      }
      if (video.dataset.src) {
        video.src = video.dataset.src;
        delete video.dataset.src;
      }
      if (userPaused || !inView || document.hidden || fullVideo) {
        video.pause();
        return;
      }
      // Set the media state in addition to the markup attributes. This keeps
      // muted autoplay reliable in browsers that inspect the property when
      // deciding whether an automatic play request is allowed.
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.play().catch(() => {
        /* Native controls remain available if autoplay is blocked. */
      });
    });
    if (paused()) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    } else if (!frame) frame = requestAnimationFrame(tick);
  }
  function syncButton() {
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(userPaused));
      toggle.setAttribute(
        "aria-label",
		userPaused ? messages.i18nResumeDemos : messages.i18nPauseDemos,
      );
      toggle.innerHTML =
        '<span aria-hidden="true">' + (userPaused ? "▶" : "Ⅱ") + "</span>";
    }
    syncMedia();
  }
  function selectSlide(index, focusTab = false) {
    current = (index + slides.length) % slides.length;
    elapsed = 0;
    previousTime = 0;
    fullVideo = false;
    slides.forEach((slide, i) => {
      slide.hidden = i !== current;
      slide.classList.toggle("is-active", i === current);
      const iframe = slide.querySelector("iframe");
      if (iframe && i !== current) {
        iframe.remove();
        slide
          .querySelectorAll(".doom-media > img, .doom-media > button")
          .forEach((el) => {
            el.hidden = false;
          });
      }
      const video = slide.querySelector("video");
      if (video && i !== current) video.pause();
      tabs[i].setAttribute("aria-selected", String(i === current));
      tabs[i].tabIndex = i === current ? 0 : -1;
      tabs[i].querySelector(".tab-progress").style.transform = "scaleX(0)";
    });
    if (focusTab) tabs[current].focus({ preventScroll: true });
    // Scroll only the tab strip, never the visitor's document.
    const strip = showcase.querySelector(".demo-tabs");
    const tab = tabs[current];
    if (
      tab.offsetLeft < strip.scrollLeft ||
      tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth
    ) {
      strip.scrollTo({
        left: tab.offsetLeft - strip.offsetLeft,
        behavior: reducedMotion.matches ? "instant" : "smooth",
      });
    }
    syncMedia();
  }
  function tick(timestamp) {
    frame = 0;
    if (paused()) {
      previousTime = 0;
      return;
    }
    if (previousTime) elapsed += Math.min(timestamp - previousTime, 100);
    previousTime = timestamp;
    const duration = Number(slides[current].dataset.duration) || 12000;
    tabs[current].querySelector(".tab-progress").style.transform =
      "scaleX(" + Math.min(elapsed / duration, 1) + ")";
    if (elapsed >= duration) selectSlide(current + 1);
    if (!frame) frame = requestAnimationFrame(tick);
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectSlide(i));
    tab.addEventListener("keydown", (event) => {
      const destinations = {
        ArrowRight: current + 1,
        ArrowLeft: current - 1,
        Home: 0,
        End: slides.length - 1,
      };
      if (event.key in destinations) {
        event.preventDefault();
        selectSlide(destinations[event.key], true);
      }
    });
  });
  showcase
    .querySelector("#demo-prev")
    ?.addEventListener("click", () => selectSlide(current - 1));
  showcase
    .querySelector("#demo-next")
    ?.addEventListener("click", () => selectSlide(current + 1));
  toggle?.addEventListener("click", () => {
    userPaused = !userPaused;
    syncButton();
  });
  showcase.addEventListener("mouseenter", () => {
    hovering = true;
    syncMedia();
  });
  showcase.addEventListener("mouseleave", () => {
    hovering = false;
    syncMedia();
  });
  showcase.addEventListener("focusin", () => {
    focused = true;
    syncMedia();
  });
  showcase.addEventListener("focusout", () => {
    queueMicrotask(() => {
      focused = showcase.contains(document.activeElement);
      syncMedia();
    });
  });
  document.addEventListener("visibilitychange", syncMedia);
  new IntersectionObserver(
    (entries) => {
      inView = entries[0].isIntersecting;
      syncMedia();
    },
    { threshold: 0.15 },
  ).observe(showcase);
  showcase.querySelectorAll("[data-youtube]").forEach((button) =>
    button.addEventListener("click", () => {
      const iframe = document.createElement("iframe");
		iframe.title = messages.i18nDoomVideoTitle;
      iframe.src =
        "https://www.youtube-nocookie.com/embed/" +
        button.dataset.youtube +
        "?autoplay=1&rel=0";
      iframe.allow =
        "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      button.parentElement.querySelector("img").hidden = true;
      button.hidden = true;
      button.parentElement.append(iframe);
      fullVideo = true;
      userPaused = true;
      syncButton();
      iframe.focus();
    }),
  );
  showcase
    .querySelector("[data-local-video]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      const source = event.currentTarget.dataset.localVideo;
      let video = document.querySelector(".recording-player");
      if (!video) {
        video = document.createElement("video");
        video.className = "recording-player";
        video.dataset.recording = "true";
        video.src = source;
        video.controls = true;
        video.playsInline = true;
        video.setAttribute(
          "aria-label",
		messages.i18nRecordingLabel,
        );
        const track = document.createElement("track");
        track.kind = "captions";
        track.src = "/media/compilation.vtt";
        track.srclang = "en";
		track.label = messages.i18nEnglish;
        video.append(track);
        document.querySelector(".terminal-window").append(video);
      }
      fullVideo = true;
      userPaused = true;
      syncButton();
      video.play().catch(() => {});
      video.focus();
    });
  syncButton();
}

async function copyText(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
		button.textContent = messages.i18nCopied;
		announce(messages.i18nCopiedStatus);
  } catch {
    // Select the source so copying still works without clipboard permission.
    const source =
      document.getElementById(button.dataset.copy) ||
      document.querySelector(".example-code:not([hidden])");
    if (source) {
      const range = document.createRange();
      range.selectNodeContents(source);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
		button.textContent = messages.i18nSelectCopy;
    announce(
		messages.i18nClipboardError,
    );
  }
  window.setTimeout(() => {
    button.textContent = original;
  }, 2200);
}
document.querySelectorAll("[data-copy]").forEach((button) =>
  button.addEventListener("click", () => {
    const source = document.getElementById(button.dataset.copy);
    if (source) copyText(source.textContent.trim(), button);
  }),
);
const exampleSelect = document.querySelector("#example-select");
exampleSelect?.addEventListener("change", () => {
  document.querySelectorAll(".example-code").forEach((example) => {
    example.hidden = example.id !== exampleSelect.value;
  });
});
document
  .querySelector("[data-copy-example]")
  ?.addEventListener("click", (event) => {
    const example = document.querySelector(".example-code:not([hidden])");
    if (example) copyText(example.textContent.trim(), event.currentTarget);
  });
document.querySelectorAll("[data-scroll]").forEach((button) =>
  button.addEventListener("click", () => {
    const track = document.getElementById(button.dataset.scroll);
    track?.scrollBy({
      left: Number(button.dataset.direction) * (track.clientWidth * 0.85),
      behavior: reducedMotion.matches ? "instant" : "smooth",
    });
  }),
);
function revealFeature() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const target = document.getElementById(hash);
  if (target?.matches(".feature-detail")) target.open = true;
}
window.addEventListener("hashchange", revealFeature);
revealFeature();
// All example text is escaped before highlighting; no remote syntax library.
function highlight(code) {
  const tokens =
    /(\/\/[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\b(?:fn|mut|pub|struct|return|if|else|for|in|or|import|sql|select|from|where|limit|insert|into|true|false)\b)/g;
  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const match of code.matchAll(tokens)) {
    fragment.append(document.createTextNode(code.slice(last, match.index)));
    const span = document.createElement("span");
    span.className = match[0].startsWith("//")
      ? "comment"
      : /^["']/.test(match[0])
        ? "string"
        : "keyword";
    span.textContent = match[0];
    fragment.append(span);
    last = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(code.slice(last)));
  return fragment;
}
document
  .querySelectorAll(".example-code")
  .forEach((code) => code.replaceChildren(highlight(code.textContent)));
// Autoplay is confined to the showcase. Detailed legacy videos stay user-controlled.
