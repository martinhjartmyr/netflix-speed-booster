/**
 * Netflix Speed Booster - Popup & Options Controller
 */

(() => {
  'use strict';

  const DEFAULTS = {
    boostSpeed: 2.0,
    hotkey: 'KeyD',
    hotkeyDisplay: 'D',
    customHotkey: null,
    customHotkeyDisplay: null,
    mouseHoldEnabled: true,
    mouseHoldDelay: 250,
    showOverlay: true,
    preservePitch: true
  };

  const KEY_DISPLAY_MAP = {
    'Space': 'Space',
    'ArrowRight': '→ Right',
    'ArrowLeft': '← Left',
    'ArrowUp': '↑ Up',
    'ArrowDown': '↓ Down',
    'ShiftLeft': 'L-Shift',
    'ShiftRight': 'R-Shift',
    'ControlLeft': 'L-Ctrl',
    'ControlRight': 'R-Ctrl',
    'AltLeft': 'L-Alt',
    'AltRight': 'R-Alt',
    'MetaLeft': 'Cmd/Win',
    'MetaRight': 'Cmd/Win',
    'Tab': 'Tab',
    'CapsLock': 'Caps',
    'Backspace': 'Backspace',
    'Enter': 'Enter',
    'Minus': '-',
    'Equal': '=',
    'BracketLeft': '[',
    'BracketRight': ']',
    'Backslash': '\\',
    'Semicolon': ';',
    'Quote': "'",
    'Backquote': '`',
    'Comma': ',',
    'Period': '.',
    'Slash': '/'
  };

  // DOM Elements
  const speedDisplay = document.getElementById('speedDisplay');
  const speedSlider = document.getElementById('speedSlider');
  const presetGroup = document.getElementById('presetGroup');
  const hotkeyBtn = document.getElementById('hotkeyBtn');
  const hotkeyDisplay = document.getElementById('hotkeyDisplay');
  const hotkeyHint = document.getElementById('hotkeyHint');
  const shortcutPresets = document.getElementById('shortcutPresets');
  const customKeySelect = document.getElementById('customKeySelect');
  const recordInputBtn = document.getElementById('recordInputBtn');
  const recordBtnText = document.getElementById('recordBtnText');
  const overlayToggle = document.getElementById('overlayToggle');
  const badgePreviewBox = document.getElementById('badgePreviewBox');
  const previewSpeed = document.getElementById('previewSpeed');
  const previewStatus = document.getElementById('previewStatus');
  const mouseHoldToggle = document.getElementById('mouseHoldToggle');
  const mouseDelaySection = document.getElementById('mouseDelaySection');
  const mouseDelaySlider = document.getElementById('mouseDelaySlider');
  const delayDisplay = document.getElementById('delayDisplay');
  const resetBtn = document.getElementById('resetBtn');
  const saveStatus = document.getElementById('saveStatus');
  const statusBadge = document.getElementById('statusBadge');

  let currentSettings = { ...DEFAULTS };
  let isRecordingKey = false;
  let saveTimeout = null;

  const storage = chrome.storage.sync || chrome.storage.local;

  function formatSpeed(speed) {
    return Number(speed).toFixed(speed % 1 === 0 ? 1 : 2) + 'x';
  }

  function showSavedIndicator() {
    clearTimeout(saveTimeout);
    saveStatus.classList.add('visible');
    saveTimeout = setTimeout(() => {
      saveStatus.classList.remove('visible');
    }, 1200);
  }

  function notifyTabsOfSettings() {
    if (chrome.tabs?.query) {
      chrome.tabs.query({ url: '*://*.netflix.com/*' }, (tabs) => {
        tabs?.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: currentSettings }, () => {
            if (chrome.runtime.lastError) { /* ignore tab if not loaded */ }
          });
        });
      });
    }
  }

  function saveSettings() {
    storage.set(currentSettings, () => {
      if (chrome.runtime.lastError) {
        console.error('[Netflix Speed Booster] Save error:', chrome.runtime.lastError);
        return;
      }
      showSavedIndicator();
      notifyTabsOfSettings();
    });
  }

  function updatePresetButtons(speed) {
    const numSpeed = Number(speed);
    const buttons = presetGroup.querySelectorAll('.preset-btn');
    buttons.forEach((btn) => {
      const match = Math.abs(Number(btn.dataset.speed) - numSpeed) < 0.01;
      btn.classList.toggle('active', match);
    });
  }

  function updateShortcutChips(code) {
    if (!shortcutPresets) return;
    let isPreset = false;
    const chips = shortcutPresets.querySelectorAll('.shortcut-chip');
    chips.forEach((chip) => {
      const match = chip.dataset.code === code;
      chip.classList.toggle('active', match);
      if (match) isPreset = true;
    });

    if (customKeySelect) {
      if (!isPreset) {
        let opt = customKeySelect.querySelector(`option[value="${code}"]`);
        if (!opt) {
          opt = document.createElement('option');
          opt.value = code;
          opt.textContent = currentSettings.hotkeyDisplay || code;
          customKeySelect.appendChild(opt);
        }
        customKeySelect.value = code;
      } else {
        customKeySelect.value = '';
      }
    }
  }

  function updateOverlayPreview(showOverlay, speed) {
    if (previewSpeed) {
      previewSpeed.textContent = formatSpeed(speed);
    }
    if (badgePreviewBox) {
      badgePreviewBox.classList.toggle('disabled', !showOverlay);
    }
    if (previewStatus) {
      previewStatus.textContent = showOverlay ? 'Visible when pressed' : 'Disabled (No popup)';
      previewStatus.style.color = showOverlay ? '' : '#E50914';
    }
  }

  function setBoostSpeed(val, shouldSave = false) {
    currentSettings.boostSpeed = val;
    speedSlider.value = val;
    speedDisplay.textContent = formatSpeed(val);
    updatePresetButtons(val);
    updateOverlayPreview(currentSettings.showOverlay, val);
    if (shouldSave) {
      saveSettings();
    }
  }

  function applySettingsToUI(settings) {
    currentSettings = { ...settings };

    // Speed slider & display
    setBoostSpeed(currentSettings.boostSpeed, false);

    // Hotkey
    hotkeyDisplay.textContent = currentSettings.hotkeyDisplay || 'D';
    updateShortcutChips(currentSettings.hotkey);

    // Overlay toggle & preview
    overlayToggle.checked = currentSettings.showOverlay;
    updateOverlayPreview(currentSettings.showOverlay, currentSettings.boostSpeed);

    // Mouse hold
    mouseHoldToggle.checked = currentSettings.mouseHoldEnabled;
    mouseDelaySlider.value = currentSettings.mouseHoldDelay;
    delayDisplay.textContent = `${currentSettings.mouseHoldDelay} ms`;
    mouseDelaySection.style.opacity = currentSettings.mouseHoldEnabled ? '1' : '0.4';
    mouseDelaySlider.disabled = !currentSettings.mouseHoldEnabled;
  }

  function loadSettings() {
    storage.get(DEFAULTS, (items) => {
      if (chrome.runtime.lastError) {
        console.warn('[Netflix Speed Booster] Load error:', chrome.runtime.lastError);
        applySettingsToUI(DEFAULTS);
        return;
      }
      applySettingsToUI(items);
    });
  }

  // --- Speed Controls ---
  speedSlider.addEventListener('input', (e) => {
    setBoostSpeed(parseFloat(e.target.value), false);
  });

  speedSlider.addEventListener('change', () => {
    saveSettings();
  });

  presetGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    setBoostSpeed(parseFloat(btn.dataset.speed), true);
  });

  // --- Speed Popup (HUD) Display Toggle ---
  overlayToggle.addEventListener('change', (e) => {
    currentSettings.showOverlay = e.target.checked;
    updateOverlayPreview(currentSettings.showOverlay, currentSettings.boostSpeed);
    saveSettings();
  });

  // --- Hotkey Recording ---
  function friendlyKeyName(code, key) {
    if (!code && key) code = key;
    if (KEY_DISPLAY_MAP[code]) return KEY_DISPLAY_MAP[code];
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    if (key && key.length === 1) return key.toUpperCase();
    return code;
  }

  function startRecording() {
    isRecordingKey = true;
    hotkeyBtn.classList.add('recording');
    hotkeyDisplay.textContent = '...';
    if (recordInputBtn) {
      recordInputBtn.classList.add('recording');
      if (recordBtnText) recordBtnText.textContent = 'Press key...';
    }
    hotkeyHint.textContent = 'Press any key on keyboard now (Esc to cancel)';
    hotkeyHint.style.color = '#E50914';
  }

  function stopRecording() {
    isRecordingKey = false;
    hotkeyBtn.classList.remove('recording');
    if (recordInputBtn) {
      recordInputBtn.classList.remove('recording');
      if (recordBtnText) recordBtnText.textContent = 'Record Key';
    }
    hotkeyDisplay.textContent = currentSettings.hotkeyDisplay || 'D';
    updateShortcutChips(currentSettings.hotkey);
    hotkeyHint.textContent = 'Choose a preset, select from dropdown, or click Record Key';
    hotkeyHint.style.color = '';
  }

  function setHotkey(code, display, isCustom = false) {
    currentSettings.hotkey = code;
    currentSettings.hotkeyDisplay = display;
    if (isCustom) {
      currentSettings.customHotkey = code;
      currentSettings.customHotkeyDisplay = display;
    }
    hotkeyDisplay.textContent = display;
    updateShortcutChips(code);
    saveSettings();
  }

  // Dropdown key selector
  if (customKeySelect) {
    customKeySelect.addEventListener('change', (e) => {
      const code = e.target.value;
      if (!code) return;
      const optText = e.target.options[e.target.selectedIndex].text.replace(/^[→←↑↓]\s*/, '');
      const display = friendlyKeyName(code, optText);
      if (isRecordingKey) {
        stopRecording();
      }
      setHotkey(code, display, true);
    });
  }

  recordInputBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isRecordingKey) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  hotkeyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isRecordingKey) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (!isRecordingKey) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      stopRecording();
      return;
    }

    const code = e.code || e.key;
    const display = friendlyKeyName(code, e.key);
    isRecordingKey = false;
    hotkeyBtn.classList.remove('recording');
    if (recordInputBtn) {
      recordInputBtn.classList.remove('recording');
      if (recordBtnText) recordBtnText.textContent = 'Record Key';
    }
    hotkeyHint.textContent = 'Choose a preset, select from dropdown, or click Record Key';
    hotkeyHint.style.color = '';
    setHotkey(code, display, true);
  });

  // Shortcut chip buttons (1-click preset key selection)
  shortcutPresets.addEventListener('click', (e) => {
    e.stopPropagation();
    const chip = e.target.closest('.shortcut-chip');
    if (!chip) return;

    if (isRecordingKey) {
      stopRecording();
    }
    setHotkey(chip.dataset.code, chip.dataset.display, false);
  });

  // Cancel recording if clicking outside
  document.addEventListener('click', () => {
    if (isRecordingKey) {
      stopRecording();
    }
  });

  // --- Mouse Hold Controls ---
  mouseHoldToggle.addEventListener('change', (e) => {
    currentSettings.mouseHoldEnabled = e.target.checked;
    mouseDelaySection.style.opacity = currentSettings.mouseHoldEnabled ? '1' : '0.4';
    mouseDelaySlider.disabled = !currentSettings.mouseHoldEnabled;
    saveSettings();
  });

  mouseDelaySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    currentSettings.mouseHoldDelay = val;
    delayDisplay.textContent = `${val} ms`;
  });

  mouseDelaySlider.addEventListener('change', () => {
    saveSettings();
  });

  // --- Reset to Defaults ---
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
      applySettingsToUI(DEFAULTS);
      saveSettings();
    }
  });

  // --- Check Active Tab for Netflix via PING ---
  if (chrome.tabs?.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs?.[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'PING' }, (response) => {
          if (chrome.runtime.lastError || !response?.active) {
            statusBadge.textContent = 'Ready';
            return;
          }
          statusBadge.textContent = response.videoFound ? 'Playing' : 'Active';
          statusBadge.style.background = 'rgba(46, 204, 113, 0.2)';
          statusBadge.style.color = '#2ecc71';
          statusBadge.style.borderColor = 'rgba(46, 204, 113, 0.4)';
        });
      }
    });
  }

  // Initialize
  loadSettings();
})();
