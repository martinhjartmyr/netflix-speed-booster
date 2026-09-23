/**
 * Netflix Speed Booster - Content Script
 * Press and hold a hotkey or click and hold the video to speed up playback.
 */

(() => {
  'use strict';

  // Default settings
  const DEFAULT_CONFIG = {
    hotkey: 'KeyD',
    hotkeyDisplay: 'D',
    customHotkey: null,
    customHotkeyDisplay: null,
    boostSpeed: 2.0,
    mouseHoldEnabled: true,
    mouseHoldDelay: 250, // ms before 2x activates on click down
    showOverlay: true,
    preservePitch: true
  };

  let config = { ...DEFAULT_CONFIG };

  // Runtime state
  let currentVideo = null;
  let savedPlaybackRate = 1.0;
  let isKeyHeld = false;
  let isMouseHeld = false;
  let mouseHoldTimer = null;
  let suppressNextClick = false;
  let mouseStartX = 0;
  let mouseStartY = 0;
  let hudElement = null;
  let isSpeedBoosted = false;

  // Load settings from storage
  function loadConfig() {
    const storageArea = chrome.storage.sync || chrome.storage.local;
    storageArea.get(DEFAULT_CONFIG, (items) => {
      if (chrome.runtime.lastError) {
        console.warn('[Netflix Speed Booster] Storage read error:', chrome.runtime.lastError);
        return;
      }
      config = { ...DEFAULT_CONFIG, ...items };
      updateHudContent();
    });
  }

  // Listen for setting changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' || areaName === 'local') {
      for (const [key, change] of Object.entries(changes)) {
        if (key in config) {
          config[key] = change.newValue;
        }
      }
      updateHudContent();
      if (!config.showOverlay) {
        hideHud();
      }
      // If currently boosted and boost speed changed, update it live
      if (isSpeedBoosted && currentVideo) {
        setVideoSpeed(config.boostSpeed);
      }
    }
  });

  // Find active Netflix video element
  function findVideo() {
    const video = document.querySelector('video');
    if (video && video !== currentVideo) {
      currentVideo = video;
      attachVideoEvents(video);
    }
    return currentVideo;
  }

  // Handle Netflix's internal player attempts to revert ratechange
  function attachVideoEvents(video) {
    if (video._nfxSpeedBound) return;
    video._nfxSpeedBound = true;

    // Ratechange interception
    video.addEventListener('ratechange', (e) => {
      if (isSpeedBoosted) {
        if (video.playbackRate !== config.boostSpeed) {
          video.playbackRate = config.boostSpeed;
        }
        e.stopImmediatePropagation();
      }
    }, true);

    // Ensure audio pitch correction is preserved
    if (config.preservePitch) {
      video.preservesPitch = true;
      video.mozPreservesPitch = true;
      video.webkitPreservesPitch = true;
    }
  }

  // Create or retrieve HUD overlay
  function getOrCreateHud() {
    if (hudElement && document.contains(hudElement)) {
      return hudElement;
    }

    const existing = document.getElementById('nfx-speed-hud');
    if (existing) {
      hudElement = existing;
      return hudElement;
    }

    const container = document.createElement('div');
    container.id = 'nfx-speed-hud';
    container.className = 'nfx-speed-hud-container';
    container.innerHTML = `
      <div class="nfx-speed-badge">
        <div class="nfx-speed-icon-wrapper">
          <svg class="nfx-speed-icon" viewBox="0 0 24 24">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
          </svg>
        </div>
        <span class="nfx-speed-text">${formatSpeed(config.boostSpeed)}</span>
        <span class="nfx-speed-label">Speed</span>
      </div>
    `;

    hudElement = container;
    mountHud(container);
    return hudElement;
  }

  function mountHud(hud) {
    // Mount inside fullscreen element or player container if possible, else body
    const targetParent = document.fullscreenElement ||
                         document.querySelector('.watch-video') ||
                         document.querySelector('.VideoContainer') ||
                         document.body;

    if (targetParent && !targetParent.contains(hud)) {
      targetParent.appendChild(hud);
      if (targetParent === document.body) {
        hud.classList.add('nfx-hud-fixed');
      } else {
        hud.classList.remove('nfx-hud-fixed');
      }
    }
  }

  function formatSpeed(speed) {
    return Number(speed).toFixed(speed % 1 === 0 ? 1 : 2) + 'x';
  }

  function updateHudContent() {
    if (!hudElement) return;
    const textEl = hudElement.querySelector('.nfx-speed-text');
    if (textEl) {
      textEl.textContent = formatSpeed(config.boostSpeed);
    }
  }

  function showHud() {
    if (!config.showOverlay) {
      hideHud();
      return;
    }
    const hud = getOrCreateHud();
    mountHud(hud);
    updateHudContent();
    hud.classList.add('nfx-hud-visible');
  }

  function hideHud() {
    if (!hudElement) return;
    hudElement.classList.remove('nfx-hud-visible');
  }

  // Safe playbackRate setter
  function setVideoSpeed(speed) {
    const video = findVideo();
    if (!video) return;

    if (config.preservePitch) {
      video.preservesPitch = true;
      video.mozPreservesPitch = true;
      video.webkitPreservesPitch = true;
    }

    try {
      video.playbackRate = speed;
    } catch (err) {
      console.warn('[Netflix Speed Booster] Failed to set playbackRate:', err);
    }
  }

  // Activate boost
  function startSpeedBoost() {
    const video = findVideo();
    if (!video) return;

    if (!isSpeedBoosted) {
      // Save the current normal playback rate so we restore correctly
      // (Netflix allows 0.5, 0.75, 1.0, 1.25, 1.5 in native menu)
      savedPlaybackRate = video.playbackRate || 1.0;
      isSpeedBoosted = true;
      setVideoSpeed(config.boostSpeed);
      showHud();
    }
  }

  // Deactivate boost
  function stopSpeedBoost() {
    if (isSpeedBoosted && !isKeyHeld && !isMouseHeld) {
      isSpeedBoosted = false;
      const video = findVideo();
      if (video) {
        setVideoSpeed(savedPlaybackRate);
      }
      hideHud();
    }
  }

  // Consume an event completely to prevent propagation to Netflix or browser defaults
  function consumeEvent(e) {
    if (!e) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
  }

  // Check if active target is editable text element
  function isInteractiveElement(target) {
    if (!target) return false;
    const tagName = target.tagName ? target.tagName.toLowerCase() : '';
    return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
  }

  // Check if target is an interactive player control (button, slider, scrubber, etc.)
  function isInteractiveControl(target, clientX, clientY, videoRect) {
    if (!target) return false;

    // 1. Skip our own HUD badge
    if (target.closest?.('.nfx-speed-hud-container')) return true;

    // 2. Direct interactive elements: buttons, sliders, links, inputs, dropdowns
    if (target.closest?.(
      'button, [role="button"], [role="slider"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="dialog"], input, a, select, textarea, [data-uia*="button"], [data-uia*="control-"], [data-uia*="timeline"], [data-uia*="scrubber"], [data-uia*="audio-subtitle"], [data-uia*="episodes"]'
    )) {
      return true;
    }

    // 3. Top-left back button area (Netflix back arrow & title)
    if (clientX < videoRect.left + 140 && clientY < videoRect.top + 90) return true;

    // 4. Bottom control bar strip (play button, timeline, volume, audio/subtitles)
    if (clientY > videoRect.bottom - 90) return true;

    // 5. Skip credits / Next episode buttons
    if (target.closest?.('.skip-credits, [data-uia*="skip"], [data-uia*="next-episode"]')) return true;

    return false;
  }

  // Check if click coordinates fall within the active video area (not on controls)
  function isClickInVideoArea(e) {
    const video = findVideo();
    if (!video) return false;

    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    // Must be inside the video bounding box and not on an interactive control
    const inVideoBounds = (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );

    return inVideoBounds && !isInteractiveControl(e.target, e.clientX, e.clientY, rect);
  }

  // --- Keyboard Event Listeners ---
  function matchesHotkey(e) {
    if (!config.hotkey) return false;

    // Direct event code match (e.g. "KeyD", "ArrowRight", "Space")
    if (e.code && e.code === config.hotkey) return true;

    // Modifier key group match (left or right variant)
    if (config.hotkey.startsWith('Shift') && e.code?.startsWith('Shift')) return true;
    if (config.hotkey.startsWith('Control') && e.code?.startsWith('Control')) return true;
    if (config.hotkey.startsWith('Alt') && e.code?.startsWith('Alt')) return true;
    if (config.hotkey.startsWith('Meta') && e.code?.startsWith('Meta')) return true;

    // Key character match (case-insensitive for letters and direct for symbols)
    if (e.key && config.hotkey) {
      if (e.key.toLowerCase() === config.hotkey.toLowerCase()) return true;
      if (config.hotkey.startsWith('Key') && e.key.toLowerCase() === config.hotkey.slice(3).toLowerCase()) return true;
      if (config.hotkey.startsWith('Digit') && e.key === config.hotkey.slice(5)) return true;
    }
    return false;
  }

  function handleHotkeyEvent(e) {
    if (isInteractiveElement(e.target) || !matchesHotkey(e)) return;

    consumeEvent(e);

    if (e.type === 'keydown') {
      if (e.repeat) return;
      isKeyHeld = true;
      startSpeedBoost();
    } else if (e.type === 'keyup') {
      isKeyHeld = false;
      stopSpeedBoost();
    }
  }

  window.addEventListener('keydown', handleHotkeyEvent, true);
  window.addEventListener('keyup', handleHotkeyEvent, true);
  window.addEventListener('keypress', (e) => {
    if (!isInteractiveElement(e.target) && matchesHotkey(e)) {
      consumeEvent(e);
    }
  }, true);

  // --- Mouse / Pointer Click-and-Hold Event Listeners ---
  let holdTriggerActive = false;
  let lastDownTime = 0;

  function handlePointerOrMouseDown(e) {
    if (!config.mouseHoldEnabled || e.button !== 0) return; // Left click only

    const now = Date.now();
    // Avoid double-triggering when pointerdown and mousedown fire in rapid succession
    if (holdTriggerActive && (now - lastDownTime < 150)) return;

    // Check if the click occurred on the video viewing area
    if (!isClickInVideoArea(e)) return;

    lastDownTime = now;
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    holdTriggerActive = true;

    clearTimeout(mouseHoldTimer);
    mouseHoldTimer = setTimeout(() => {
      if (holdTriggerActive) {
        isMouseHeld = true;
        suppressNextClick = true;
        startSpeedBoost();
      }
    }, config.mouseHoldDelay);
  }

  window.addEventListener('pointerdown', handlePointerOrMouseDown, true);
  window.addEventListener('mousedown', handlePointerOrMouseDown, true);

  window.addEventListener('mousemove', (e) => {
    // Only cancel the pending timer BEFORE the boost has activated, allowing up to 25px of movement
    if (mouseHoldTimer && !isMouseHeld) {
      const dist = Math.hypot(e.clientX - mouseStartX, e.clientY - mouseStartY);
      if (dist > 25) {
        clearTimeout(mouseHoldTimer);
        mouseHoldTimer = null;
        holdTriggerActive = false;
      }
    }
  }, true);

  function handleMouseRelease(e) {
    holdTriggerActive = false;
    clearTimeout(mouseHoldTimer);
    mouseHoldTimer = null;

    if (isMouseHeld) {
      isMouseHeld = false;
      stopSpeedBoost();
      consumeEvent(e);
    }
  }

  window.addEventListener('pointerup', handleMouseRelease, true);
  window.addEventListener('mouseup', handleMouseRelease, true);
  window.addEventListener('pointercancel', handleMouseRelease, true);

  // Suppress the click event if mouse hold was triggered
  window.addEventListener('click', (e) => {
    if (suppressNextClick) {
      consumeEvent(e);
      suppressNextClick = false;
    }
  }, true);

  // --- Window Blur / Tab Visibility Reset ---
  // Revert speed if user switches tabs or alt-tabs while holding
  function resetHoldState() {
    clearTimeout(mouseHoldTimer);
    mouseHoldTimer = null;
    isKeyHeld = false;
    isMouseHeld = false;
    suppressNextClick = false;
    stopSpeedBoost();
  }

  window.addEventListener('blur', resetHoldState);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetHoldState();
    }
  });

  // Watch for fullscreen change to re-anchor HUD if needed
  document.addEventListener('fullscreenchange', () => {
    if (hudElement && document.contains(hudElement)) {
      mountHud(hudElement);
    }
  });

  // Respond to popup status queries and live settings updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'PING') {
      sendResponse({ active: true, videoFound: !!findVideo() });
    } else if (message && message.type === 'SETTINGS_UPDATED') {
      if (message.settings) {
        config = { ...config, ...message.settings };
        updateHudContent();
        if (!config.showOverlay) {
          hideHud();
        }
        if (isSpeedBoosted && currentVideo) {
          setVideoSpeed(config.boostSpeed);
        }
      }
      sendResponse({ active: true, updated: true });
    }
    return true;
  });

  // Observe DOM for dynamic Netflix video mount / unmount
  const observer = new MutationObserver(() => {
    findVideo();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial load
  loadConfig();
  findVideo();
})();
