// modules/browser-ui.mjs
import { CONFIG, log } from "./config.mjs";
import { handleSortClick } from "./click-handler.mjs";
import { StateManager } from "./unload.mjs";

const CAT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1.1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75Z"/></svg>`;

function buildButtonXUL() {
  return `<toolbarbutton id="${CONFIG.BUTTON_ID}" command="${CONFIG.COMMAND_ID}" tooltiptext="AI Folder Sorter — Sort tabs into folders" class="toolbarbutton-1 chromeclass-toolbar-additional">
    <hbox class="toolbarbutton-box" align="center" style="pointer-events: none;">${CAT_ICON_SVG}</hbox>
  </toolbarbutton>`;
}

export function setButtonState(state) {
  const buttons = document.querySelectorAll(`#${CONFIG.BUTTON_ID}`);
  buttons.forEach((btn) => {
    btn.classList.remove("processing", "success");
    btn.removeAttribute("disabled");
    if (state === "processing") {
      btn.classList.add("processing");
      btn.setAttribute("disabled", "true");
    } else if (state === "success") {
      btn.classList.add("success");
      setTimeout(() => btn.classList.remove("success"), 1200);
    }
  });
}

export function setButtonStage(stage) {
  const tooltips = {
    rules: "AI Folder Sorter — applying your rules…",
    ai: "AI Folder Sorter — asking the AI to categorize…",
    grouping: "AI Folder Sorter — creating folders…",
  };
  const buttons = document.querySelectorAll(`#${CONFIG.BUTTON_ID}`);
  buttons.forEach((btn) => {
    btn.setAttribute("data-stage", stage);
    if (tooltips[stage]) btn.setAttribute("tooltiptext", tooltips[stage]);
  });
}

export function setupCommand() {
  const zenCommands = document.querySelector("commandset#zenCommandSet");
  if (!zenCommands) return false;

  if (!zenCommands.querySelector(`#${CONFIG.COMMAND_ID}`)) {
    try {
      const cmdFragment = window.MozXULElement.parseXULToFragment(
        `<command id="${CONFIG.COMMAND_ID}"/>`
      );
      zenCommands.appendChild(cmdFragment);
    } catch (e) {
      return false;
    }
  }

  if (!StateManager.get("commandListener")) {
    const listener = (event) => {
      if (event.target.id === CONFIG.COMMAND_ID) {
        handleSortClick({ currentTarget: null });
      }
    };
    zenCommands.addEventListener("command", listener);
    StateManager.set("commandListener", listener);
    StateManager.set("zenCommandSet", zenCommands);
  }
  return true;
}

function ensureButton(host) {
  if (!host || host.querySelector(`#${CONFIG.BUTTON_ID}`)) return;

  initializeWaveLine(host);

  try {
    const nativeClearButton = host.querySelector(".zen-workspace-close-unpinned-tabs-button");
    const fragment = window.MozXULElement.parseXULToFragment(buildButtonXUL());
    const button = fragment.firstChild;

    if (nativeClearButton) {
      host.insertBefore(button, nativeClearButton);
    } else {
      host.appendChild(button);
    }

    button.addEventListener("click", (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      triggerWaveAnimation(host);
      handleSortClick({ currentTarget: button });
    });
  } catch (e) {
    log.error("Failed to inject button:", e);
  }
}

export function addButtonToAllSeparators() {
  const separators = document.querySelectorAll(".pinned-tabs-container-separator");
  if (separators.length > 0) {
    separators.forEach(ensureButton);
    return true;
  }
  const periphery = document.querySelector("#tabbrowser-arrowscrollbox-periphery");
  if (periphery) {
    ensureButton(periphery);
    return true;
  }
  const tabsContainer = document.getElementById("tabbrowser-tabs");
  if (tabsContainer) {
    ensureButton(tabsContainer);
    return true;
  }
  return false;
}

export function setupWorkspaceHooks() {
  if (typeof window.gZenWorkspaces === "undefined") return false;
  if (StateManager.get("workspaceHooksInstalled")) return true;
  StateManager.set("workspaceHooksInstalled", true);

  StateManager.set("originalOnTabBrowserInserted", window.gZenWorkspaces.onTabBrowserInserted);
  StateManager.set("originalUpdateTabsContainers", window.gZenWorkspaces.updateTabsContainers);

  const originalOnTabBrowserInserted = window.gZenWorkspaces.onTabBrowserInserted;
  const originalUpdateTabsContainers = window.gZenWorkspaces.updateTabsContainers;

  window.gZenWorkspaces.onTabBrowserInserted = function (event) {
    if (typeof originalOnTabBrowserInserted === "function") {
      try { originalOnTabBrowserInserted.call(window.gZenWorkspaces, event); } catch (e) { }
    }
    setTimeout(() => addButtonToAllSeparators(), 0);
  };

  window.gZenWorkspaces.updateTabsContainers = function (...args) {
    if (typeof originalUpdateTabsContainers === "function") {
      try { originalUpdateTabsContainers.apply(window.gZenWorkspaces, args); } catch (e) { }
    }
    setTimeout(() => addButtonToAllSeparators(), 0);
  };
  return true;
}

export function registerKeyboardShortcut() {
  if (!StateManager.get("keydownListener")) {
    const listener = (e) => {
      if (e.altKey && e.shiftKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault();
        e.stopPropagation();
        handleSortClick({ currentTarget: null });
      }
    };
    document.addEventListener("keydown", listener);
    StateManager.set("keydownListener", listener);
  }
}

export function scheduleFallbackButton() {
  if (!StateManager.get("fallbackTimeoutScheduled")) {
    StateManager.set("fallbackTimeoutScheduled", true);
    const timerId = setTimeout(() => {
      const sidebarBtn = document.getElementById(CONFIG.BUTTON_ID);
      if (!sidebarBtn || sidebarBtn.offsetWidth === 0) {
        injectFloatingFallbackButton();
      }
    }, CONFIG.FALLBACK_BUTTON_DELAY_MS);
    StateManager.set("fallbackTimeout", timerId);
  }
}

export function injectFloatingFallbackButton() {
  if (document.getElementById("ai-folder-sorter-fallback")) return;

  const btn = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  btn.id = "ai-folder-sorter-fallback";
  btn.className = "ai-sorter-fallback-btn";
  btn.setAttribute("role", "button");
  btn.setAttribute("aria-label", "AI Folder Sorter (fallback button)");
  btn.title = "AI Folder Sorter — Click to sort tabs.\n\nShift+Drag to reposition.";

  const savedPos = Services.prefs.getStringPref("zen.ai-folder-sorter.fallback-pos", "");
  let pos = { top: 60, right: 16 };
  if (savedPos) {
    try { pos = JSON.parse(savedPos); } catch {}
  }

  Object.assign(btn.style, {
    position: "fixed",
    top: `${pos.top}px`,
    right: `${pos.right}px`,
    zIndex: "2147483647",
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    transition: "transform 120ms ease",
    fontFamily: "system-ui, -apple-system, sans-serif",
  });

  btn.innerHTML = CAT_ICON_SVG;

  btn.addEventListener("mouseenter", () => { btn.style.transform = "scale(1.1)"; });
  btn.addEventListener("mouseleave", () => { btn.style.transform = "scale(1)"; });

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleSortClick({ currentTarget: null });
  });

  let isDragging = false;
  let dragStartX = 0, dragStartY = 0, btnStartX = 0, btnStartY = 0;

  btn.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !e.shiftKey) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    btnStartX = btn.offsetLeft;
    btnStartY = btn.offsetTop;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    btn.style.left = `${btnStartX + e.clientX - dragStartX}px`;
    btn.style.top = `${btnStartY + e.clientY - dragStartY}px`;
    btn.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    try {
      Services.prefs.setStringPref("zen.ai-folder-sorter.fallback-pos", JSON.stringify({
        top: btn.offsetTop,
        right: window.innerWidth - btn.offsetLeft - btn.offsetWidth,
      }));
    } catch {}
  });

  document.documentElement.appendChild(btn);
  try {
    if (Services.prefs.getBoolPref("zen.ai-folder-sorter.hide-fallback", false)) {
      btn.style.display = "none";
    }
  } catch {}
}

let waveAnimationId;

function initializeWaveLine(separator) {
    if (!separator || separator.querySelector('svg.separator-line-svg')) return;

    // Check if the host is a separator (don't inject in periphery/fallback)
    if (!separator.classList.contains("pinned-tabs-container-separator")) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "separator-line-svg"); 
    svg.setAttribute("viewBox", "0 0 100 2"); 
    svg.setAttribute("preserveAspectRatio", "none"); 

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("id", `separator-path`); 
    path.setAttribute("class", "separator-path-segment"); 
    path.setAttribute("d", 'M 0 1 L 100 1'); 
    path.style.fill = "none";
    path.style.opacity = '1'; 
    path.setAttribute("stroke-width", "1"); 
    path.setAttribute("stroke-linecap", "round"); 
    
    svg.appendChild(path);
    separator.insertBefore(svg, separator.firstChild); 
}

function triggerWaveAnimation(separator) {
    if (!separator) return;
    const pathElement = separator.querySelector('#separator-path');
    if (!pathElement) return;

    window.cancelAnimationFrame(waveAnimationId);
    
    const maxAmplitude = 3;     
    const frequency = 8;        
    const segments = 50;        
    
    // Animation phases
    const growthDuration = 300;  // Time to reach full height
    const sustainDuration = 800; // Time to hold the wave
    const decayDuration = 500;   // Time to dampen back to flat
    const totalDuration = growthDuration + sustainDuration + decayDuration;

    let t = 0;                  
    let startTime = window.performance.now(); 

    function animateWaveLoop(timestamp) {
        const elapsedTime = timestamp - startTime;
        
        // STOP CONDITION: If the total duration is exceeded, reset to flat and exit
        if (elapsedTime >= totalDuration) {
            pathElement.setAttribute('d', 'M 0 1 L 100 1');
            return; 
        }
        
        // Calculate amplitude based on the current phase
        let currentAmplitude = 0;
        if (elapsedTime < growthDuration) {
            currentAmplitude = maxAmplitude * (elapsedTime / growthDuration);
        } else if (elapsedTime < growthDuration + sustainDuration) {
            currentAmplitude = maxAmplitude;
        } else {
            const decayElapsed = elapsedTime - (growthDuration + sustainDuration);
            currentAmplitude = maxAmplitude * (1 - (decayElapsed / decayDuration));
        }

        t += 0.5; // Horizontal movement speed

        let points = [];
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * 100; 
            const y = 1 + currentAmplitude * Math.sin((x / (100 / frequency) * 2 * Math.PI) + (t * 0.1)); 
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
        
        pathElement.setAttribute('d', "M" + points.join(" L"));
        waveAnimationId = window.requestAnimationFrame(animateWaveLoop);
    }
    
    animateWaveLoop(window.performance.now());
}