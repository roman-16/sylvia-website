const SOURCE_LANGUAGE = "en";
const ALTERNATE_LANGUAGE = "de";
const LANGUAGES = [SOURCE_LANGUAGE, ALTERNATE_LANGUAGE];
const STORAGE_KEY = "sylvia:lang";
const LOCALISED_ATTRIBUTES = ["alt", "aria-label", "content", "placeholder", "title"];
const LOCALISED_TARGETS = [null, ...LOCALISED_ATTRIBUTES];
const LOCALISED_SELECTOR = [
  `[data-${ALTERNATE_LANGUAGE}]`,
  ...LOCALISED_ATTRIBUTES.map((name) => `[data-${ALTERNATE_LANGUAGE}-${name}]`),
].join(",");

const PHRASES = {
  workCount: {
    en: (n) => `${n} ${n === 1 ? "work" : "works"}`,
    de: (n) => `${n} ${n === 1 ? "Arbeit" : "Arbeiten"}`,
  },
};

const languageListeners = new Set();
let language = SOURCE_LANGUAGE;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const phrase = (key, ...args) => PHRASES[key][language](...args);

const datasetKey = (prefix, attribute) =>
  attribute === null
    ? prefix
    : prefix + attribute.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase());

const readValue = (element, attribute) =>
  attribute === null ? element.textContent : element.getAttribute(attribute);

const writeValue = (element, attribute, value) => {
  if (attribute === null) element.textContent = value;
  else element.setAttribute(attribute, value);
};

const applyLanguage = (next) => {
  language = next;
  document.documentElement.lang = next;

  for (const element of document.querySelectorAll(LOCALISED_SELECTOR)) {
    for (const attribute of LOCALISED_TARGETS) {
      const alternate = datasetKey(ALTERNATE_LANGUAGE, attribute);
      if (!(alternate in element.dataset)) continue;

      const source = datasetKey(SOURCE_LANGUAGE, attribute);
      if (!(source in element.dataset)) element.dataset[source] = readValue(element, attribute) ?? "";

      writeValue(element, attribute, element.dataset[next === ALTERNATE_LANGUAGE ? alternate : source]);
    }
  }

  for (const button of document.querySelectorAll("[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === next));
  }

  for (const listener of languageListeners) listener();
};

const rememberLanguage = (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage unavailable */
  }
};

const preferredLanguage = () => {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  if (LANGUAGES.includes(stored)) return stored;

  const primary = navigator.languages?.[0] ?? navigator.language ?? "";
  return primary.toLowerCase().startsWith("de") ? ALTERNATE_LANGUAGE : SOURCE_LANGUAGE;
};

const setUpLanguage = () => {
  for (const button of document.querySelectorAll("[data-lang]")) {
    button.addEventListener("click", () => {
      applyLanguage(button.dataset.lang);
      rememberLanguage(button.dataset.lang);
    });
  }
};

const setUpInPageLinks = () => {
  const behavior = prefersReducedMotion() ? "auto" : "smooth";

  for (const link of document.querySelectorAll('a[href^="#"]')) {
    link.addEventListener("click", (event) => {
      const target = document.getElementById(link.getAttribute("href").slice(1));
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior, block: "start" });
      target.focus({ preventScroll: true });
    });
  }
};

const setUpHeader = () => {
  const header = document.querySelector("[data-header]");
  if (!header) return;

  if (!document.querySelector(".hero")) {
    header.classList.add("is-stuck");
    return;
  }

  const sentinel = document.createElement("div");
  sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:80px;pointer-events:none";
  document.body.prepend(sentinel);

  new IntersectionObserver(
    ([entry]) => header.classList.toggle("is-stuck", !entry.isIntersecting),
    { threshold: 0 },
  ).observe(sentinel);
};

const setUpReveals = () => {
  for (const group of document.querySelectorAll("[data-stagger]")) {
    group.querySelectorAll(".reveal").forEach((element, index) => {
      element.style.setProperty("--reveal-delay", `${index * 60}ms`);
    });
  }

  const revealed = document.querySelectorAll(".reveal");

  if (prefersReducedMotion()) {
    for (const element of revealed) element.classList.add("is-in");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
  );

  for (const element of revealed) observer.observe(element);
};

const setUpGallery = () => {
  const gallery = document.querySelector("[data-works]");
  const dialog = document.querySelector("[data-lightbox]");
  if (!gallery || !dialog) return;

  const works = [...gallery.querySelectorAll(".work")];
  const filters = [...document.querySelectorAll("[data-filter]")];
  const counter = document.querySelector("[data-count]");
  const image = dialog.querySelector("[data-lb-image]");
  const meta = dialog.querySelector("[data-lb-meta]");
  const position = dialog.querySelector("[data-lb-count]");

  let visible = works;
  let index = 0;

  const roomForOverlay = window.matchMedia("(min-width: 48rem)");

  const renderCount = () => {
    if (counter) counter.textContent = phrase("workCount", visible.length);
  };

  const renderSlide = () => {
    const work = visible[index];
    const source = work.querySelector("img");

    image.src = source.currentSrc || source.src;
    image.alt = source.alt;
    image.width = source.width;
    image.height = source.height;

    const flatten = (element) => element.textContent.replace(/\s+/g, " ").trim();
    const title = flatten(work.querySelector(".work__title"));
    const facts = flatten(work.querySelector(".work__facts"));
    const status = [...work.querySelectorAll(".work__status > span")].map(flatten);

    meta.textContent = [title, facts, ...status].join(" · ");
    position.textContent = `${String(index + 1).padStart(2, "0")} / ${String(visible.length).padStart(2, "0")}`;
  };

  let scale = 1;
  let panX = 0;
  let panY = 0;

  const drawTransform = () => {
    image.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    dialog.classList.toggle("is-zoomed", scale > 1);
  };

  const naturalScale = () =>
    image.offsetWidth > 0 ? Math.min(Math.max(image.naturalWidth / image.offsetWidth, 1), 4) : 1;

  const clampPan = () => {
    const slackX = Math.max(0, (image.offsetWidth * scale - window.innerWidth) / 2);
    const slackY = Math.max(0, (image.offsetHeight * scale - window.innerHeight) / 2);
    panX = Math.min(Math.max(panX, -slackX), slackX);
    panY = Math.min(Math.max(panY, -slackY), slackY);
  };

  const resetZoom = () => {
    scale = 1;
    panX = 0;
    panY = 0;
    drawTransform();
  };

  const zoomAround = (next, clientX, clientY) => {
    const box = image.getBoundingClientRect();
    const restingX = box.left + box.width / 2 - panX;
    const restingY = box.top + box.height / 2 - panY;
    const factor = next / scale;

    panX = clientX - restingX - factor * (clientX - restingX - panX);
    panY = clientY - restingY - factor * (clientY - restingY - panY);
    scale = next;

    clampPan();
    drawTransform();
  };

  let dragged = false;

  image.addEventListener("click", (event) => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (scale > 1) resetZoom();
    else zoomAround(naturalScale(), event.clientX, event.clientY);
  });

  image.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const next = Math.min(Math.max(scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), 1), 4);
      if (next === 1) resetZoom();
      else zoomAround(next, event.clientX, event.clientY);
    },
    { passive: false },
  );

  image.addEventListener("pointerdown", (event) => {
    if (scale === 1) return;

    const fromX = event.clientX - panX;
    const fromY = event.clientY - panY;
    const startX = event.clientX;
    const startY = event.clientY;
    image.setPointerCapture(event.pointerId);
    dialog.classList.add("is-panning");

    const move = (moved) => {
      if (Math.hypot(moved.clientX - startX, moved.clientY - startY) > 4) dragged = true;
      panX = moved.clientX - fromX;
      panY = moved.clientY - fromY;
      clampPan();
      drawTransform();
    };

    const drop = () => {
      dialog.classList.remove("is-panning");
      image.removeEventListener("pointermove", move);
      image.removeEventListener("pointerup", drop);
      image.removeEventListener("pointercancel", drop);
    };

    image.addEventListener("pointermove", move);
    image.addEventListener("pointerup", drop);
    image.addEventListener("pointercancel", drop);
  });

  const open = (work) => {
    index = Math.max(0, visible.indexOf(work));
    resetZoom();
    renderSlide();
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add("is-locked");
  };

  const step = (delta) => {
    index = (index + delta + visible.length) % visible.length;
    resetZoom();
    renderSlide();
  };

  const applyFilter = (next) => {
    visible = works.filter((work) => next === "all" || work.dataset.category === next);

    for (const work of works) work.hidden = !visible.includes(work);
    for (const button of filters) button.setAttribute("aria-pressed", String(button.dataset.filter === next));

    renderCount();
  };

  for (const button of filters) {
    button.addEventListener("click", () => applyFilter(button.dataset.filter));
  }

  for (const work of works) {
    work.querySelector(".work__frame").addEventListener("click", (event) => {
      event.preventDefault();
      if (roomForOverlay.matches) open(work);
    });
  }

  roomForOverlay.addEventListener("change", () => {
    if (!roomForOverlay.matches && dialog.open) dialog.close();
  });

  dialog.querySelector("[data-lb-prev]").addEventListener("click", () => step(-1));
  dialog.querySelector("[data-lb-next]").addEventListener("click", () => step(1));
  dialog.querySelector("[data-lb-close]").addEventListener("click", () => dialog.close());

  let swipedRecently = false;
  let touchOrigin = null;
  let pressOrigin = null;

  dialog.addEventListener("pointerdown", (event) => {
    pressOrigin = { x: event.clientX, y: event.clientY, target: event.target };
  });

  dialog.addEventListener("click", (event) => {
    const origin = pressOrigin;
    pressOrigin = null;

    if (swipedRecently) return;
    if (event.target.closest("img, button, a")) return;
    if (!origin || origin.target !== event.target) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6) return;
    if (!getSelection().isCollapsed) return;

    dialog.close();
  });

  dialog.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      touchOrigin = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );

  dialog.addEventListener(
    "touchend",
    (event) => {
      if (!touchOrigin) return;

      const touch = event.changedTouches[0];
      const shiftX = touch.clientX - touchOrigin.x;
      const shiftY = touch.clientY - touchOrigin.y;
      touchOrigin = null;

      if (scale > 1) return;
      if (Math.abs(shiftX) < 45 || Math.abs(shiftX) <= Math.abs(shiftY)) return;

      step(shiftX < 0 ? 1 : -1);
      swipedRecently = true;
      setTimeout(() => {
        swipedRecently = false;
      }, 400);
    },
    { passive: true },
  );

  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("is-locked");

    const frame = visible[index]?.querySelector(".work__frame");
    if (!frame) return;

    frame.focus({ preventScroll: true });

    const box = frame.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) frame.scrollIntoView({ block: "center" });
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  });

  languageListeners.add(() => {
    renderCount();
    if (dialog.open) renderSlide();
  });

  dialog.querySelector("[data-lb-enquire]").addEventListener("click", () => {
    const slug = visible[index].dataset.slug;
    dialog.close();
    enquireAbout("work", slug);
  });

  applyFilter("all");
};

const enquireAbout = (topic, slug) => {
  const form = document.querySelector("[data-form]");
  const section = document.getElementById("contact");
  if (!form || !section) return;

  const chosen = form.querySelector(`[name="topic"][value="${topic}"]`);
  if (chosen) {
    chosen.checked = true;
    chosen.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const select = form.querySelector("[data-work-select]");
  if (slug && select) select.value = slug;

  section.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  form.querySelector("#name").focus({ preventScroll: true });
};

const setUpContact = () => {
  const form = document.querySelector("[data-form]");
  if (!form) return;

  const select = form.querySelector("[data-work-select]");
  const workField = form.querySelector("[data-work-field]");
  const subject = form.querySelector("[data-form-subject]");
  const errorNote = form.querySelector("[data-form-error]");
  const done = document.querySelector("[data-form-done]");
  const submit = form.querySelector("[data-submit]");
  const busy = submit.querySelector(".is-busy");
  const idle = submit.querySelector("span:not(.is-busy)");

  const chosenTopic = () => form.querySelector('[name="topic"]:checked')?.value ?? "other";

  const renderWorkOptions = () => {
    const keep = select.value;
    for (const option of [...select.options].slice(1)) option.remove();

    for (const work of document.querySelectorAll(".work")) {
      select.append(new Option(work.querySelector(".work__title").textContent.trim(), work.dataset.slug));
    }
    select.value = keep;
  };

  const syncTopic = () => {
    workField.hidden = chosenTopic() !== "work";
  };

  const composeSubject = () => {
    const topic = chosenTopic();
    if (topic === "work") {
      const chosen = select.selectedOptions[0];
      return `Enquiry: ${chosen?.value ? chosen.textContent.trim() : "piece not specified"}`;
    }
    return topic === "commission" ? "Enquiry: Commission" : "Enquiry: General";
  };

  for (const radio of form.querySelectorAll('[name="topic"]')) {
    radio.addEventListener("change", syncTopic);
  }

  for (const button of document.querySelectorAll("[data-enquire]")) {
    button.addEventListener("click", () => {
      enquireAbout(button.dataset.enquire, button.closest(".work")?.dataset.slug);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorNote.hidden = true;
    subject.value = composeSubject();
    submit.disabled = true;
    idle.hidden = true;
    busy.hidden = false;

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      if (!response.ok) throw new Error(String(response.status));

      form.hidden = true;
      done.hidden = false;
      done.focus?.();
    } catch {
      errorNote.hidden = false;
    } finally {
      submit.disabled = false;
      idle.hidden = false;
      busy.hidden = true;
    }
  });

  languageListeners.add(renderWorkOptions);
  renderWorkOptions();
  syncTopic();
};

const setUpStructuredData = () => {
  const works = [...document.querySelectorAll(".work")];
  if (!works.length) return;

  const artist = {
    "@type": "Person",
    "@id": "#sylvia",
    name: "Sylvia Pasmangiu",
    jobTitle: "Painter",
    email: "mailto:pasmangiusylvia@gmx.at",
    address: { "@type": "PostalAddress", addressCountry: "AT" },
    sameAs: ["https://www.instagram.com/sylviapsn.art/"],
  };

  const artworks = works.map((work) => {
    const image = work.querySelector("img");
    const entry = {
      "@type": "VisualArtwork",
      name: work.querySelector(".work__title").textContent.trim(),
      creator: { "@id": "#sylvia" },
      artform: "Painting",
      artMedium: work.dataset.medium,
      image: new URL(image.getAttribute("src"), location.href).href,
      width: { "@type": "Distance", name: `${work.dataset.width} cm` },
      height: { "@type": "Distance", name: `${work.dataset.height} cm` },
    };
    if (work.dataset.created) entry.dateCreated = work.dataset.created;
    if (image.alt) entry.description = image.alt;
    return entry;
  });

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": [artist, ...artworks] });
  document.head.append(script);
};

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

setUpLanguage();
setUpInPageLinks();
setUpHeader();
setUpReveals();
setUpGallery();
setUpContact();
setUpStructuredData();
applyLanguage(preferredLanguage());
