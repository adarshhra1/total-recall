/**
 * ============================================================================
 * Unprompted — Speaking Practice Space
 * ----------------------------------------------------------------------------
 * A client-side application that extracts topics from Obsidian vaults via
 * [[wikilinks]], allows timed speaking practice with countdown timers,
 * tracks practiced threads, and stores history locally and as Markdown.
 *
 * Compatible with GitHub Pages (100% static client-side, zero backend needed).
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. Constants & Default Configurations
     ========================================================================== */

  /**
   * LocalStorage keys used across the application.
   */
  const STORAGE_KEYS = {
    HISTORY: 'unpromptedHistory',
    SKIPPED: 'unpromptedSkipped',
    SETTINGS: 'unpromptedSettings',
    RATINGS: 'unpromptedRatings',
    SEEN: 'unpromptedSeen',
    TOPICS: 'unpromptedTopics',
    VAULT_NAME: 'unpromptedVaultName',
  };

  /**
   * Default fallback prompts when no Obsidian vault is connected.
   */
  const DEMO_TOPICS = [
    'Attention is a form of love',
    'The architecture of a good morning',
    'What makes an idea sticky?',
    'A note you keep returning to',
    'The space between signal and noise',
    'How taste becomes a compass',
    'The useful friction of boredom',
    'What does enough feel like?',
  ];

  /**
   * Default application settings.
   */
  const DEFAULT_SETTINGS = {
    timer: 60, // Default duration in seconds (60, 180, 300)
    spin: 2200, // Spin animation duration in milliseconds
    weighted: true, // Prioritize older & lower-rated topics
    dark: false, // Dark mode active flag
  };

  /* ==========================================================================
     2. Application State
     ========================================================================== */

  let topics = [];
  let notes = {};
  let currentTopic = '';
  let topicWasPracticed = false;
  let activeTimer = null;
  let remainingSeconds = 0;
  let plannedSeconds = 0;
  let extensionsCount = 0;
  let isSpinning = false;
  let latestHistoryEntry = null;

  // Load persistent state from localStorage
  let settings = {
    ...DEFAULT_SETTINGS,
    ...loadJSON(STORAGE_KEYS.SETTINGS, {}),
  };

  let skippedTopics = loadJSON(STORAGE_KEYS.SKIPPED, []);
  let topicRatings = loadJSON(STORAGE_KEYS.RATINGS, {});
  let lastSeenTimestamps = loadJSON(STORAGE_KEYS.SEEN, {});

  /* ==========================================================================
     3. DOM Element Selectors Helper
     ========================================================================== */

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const dom = {
    // Top bar
    vaultStatus: $('#vaultStatus'),
    vaultStatusWrapper: $('#vaultStatusWrapper'),
    settingsBtn: $('#settingsBtn'),

    // Step 01: Setup
    setupCard: $('#setupCard'),
    browseBtn: $('#browseBtn'),
    filesBtn: $('#filesBtn'),
    historyBtn: $('#historyBtn'),
    folderInput: $('#folderInput'),
    filesInput: $('#filesInput'),
    historyInput: $('#historyInput'),
    connectedBar: $('#connectedBar'),
    connectedName: $('#connectedName'),
    connectedCount: $('#connectedCount'),
    changeVault: $('#changeVault'),

    // Step 02: Practice
    countLabel: $('#countLabel'),
    statusDot: $('#statusDot'),
    stateLabel: $('#stateLabel'),
    topic: $('#topic'),
    topicMeta: $('#topicMeta'),
    ratingContainer: $('#rating'),

    // Controls
    timerButtons: $$('.timer'),
    spinBtn: $('#spinBtn'),
    startBtn: $('#startBtn'),
    skipBtn: $('#skipBtn'),
    resetBtn: $('#resetBtn'),

    // Lists
    recentList: $('#recentList'),
    skippedList: $('#skippedList'),
    clearBtn: $('#clearBtn'),
    clearSkipped: $('#clearSkipped'),

    // Fullscreen Focus Timer
    focusTimer: $('#focusTimer'),
    focusTopic: $('#focusTopic'),
    focusClock: $('#focusClock'),
    addTimeBtn: $('#addTime'),
    finishTimerBtn: $('#finishTimer'),

    // Summary Modal
    summaryModal: $('#summaryModal'),
    summaryTopic: $('#summaryTopic'),
    statSpoke: $('#statSpoke'),
    statPlanned: $('#statPlanned'),
    statExtensions: $('#statExtensions'),
    statMode: $('#statMode'),
    sessionRatingContainer: $('#sessionRating'),
    closeSummaryBtn: $('#closeSummary'),

    // Drawer & Modals
    topicsDrawer: $('#topicsDrawer'),
    topicsList: $('#topicsList'),
    closeTopicsBtn: $('#closeTopics'),
    settingsModal: $('#settingsModal'),
    closeSettingsBtn: $('#closeSettings'),
    defaultTimerSelect: $('#defaultTimer'),
    spinDurationSelect: $('#spinDuration'),
    weightedChoiceCheck: $('#weightedChoice'),
    darkModeCheck: $('#darkMode'),
    resetDataBtn: $('#resetData'),

    // Footer & Feedback
    exportHistoryBtn: $('#exportHistory'),
    toast: $('#toast'),
  };

  /* ==========================================================================
     4. Helper & Utility Functions
     ========================================================================== */

  /**
   * Safely loads and parses JSON from localStorage.
   */
  function loadJSON(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      console.warn(`Error reading localStorage for key "${key}":`, e);
      return fallback;
    }
  }

  /**
   * Saves a value as JSON to localStorage.
   */
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Error saving to localStorage for key "${key}":`, e);
    }
  }

  /**
   * Formats a total duration in seconds to "MM:SS" format.
   */
  function formatTime(totalSeconds) {
    const safeSecs = Math.max(0, Math.floor(totalSeconds));
    const mins = String(Math.floor(safeSecs / 60)).padStart(2, '0');
    const secs = String(safeSecs % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  /**
   * Displays a temporary toast message to the user.
   */
  let toastTimer = null;
  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('show');
    }, 2400);
  }

  /**
   * Updates the UI status label and color badge.
   */
  function updateStateIndicator(label, colorType = '') {
    if (dom.stateLabel) dom.stateLabel.textContent = label;
    if (!dom.statusDot) return;

    const colors = {
      spinning: '#c58b2d', // Amber
      active: '#67a676',   // Green
      ended: '#d47935',    // Orange
      complete: '#5a86b8', // Blue
    };

    dom.statusDot.style.backgroundColor = colors[colorType] || 'var(--accent)';
  }

  /**
   * Retrieves the full practice history array.
   */
  function getHistory() {
    return loadJSON(STORAGE_KEYS.HISTORY, []);
  }

  /**
   * Persists the practice history array.
   */
  function setHistory(historyArray) {
    saveJSON(STORAGE_KEYS.HISTORY, historyArray);
  }

  /**
   * Saves settings to localStorage.
   */
  function persistSettings() {
    saveJSON(STORAGE_KEYS.SETTINGS, settings);
  }

  /* ==========================================================================
     5. Vault Parsing & [[Wikilink]] Extraction
     ========================================================================== */

  /**
   * Extracts Obsidian wikilinks [[Topic]] from Markdown text.
   * Handles aliases [[Topic|Label]] and header links [[Topic#Header]].
   */
  function extractTopicsFromMarkdown(fileRecords) {
    const extracted = [];
    const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

    fileRecords.forEach((file) => {
      if (!file.text) return;
      for (const match of file.text.matchAll(wikilinkRegex)) {
        const topicName = match[1].trim();
        if (topicName) {
          extracted.push(topicName);
        }
      }
    });

    // Deduplicate and filter out empty strings
    return [...new Set(extracted.filter(Boolean))];
  }

  /**
   * Recursively traverses directory handles using File System Access API.
   */
  async function recordsFromDirectoryHandle(dirHandle) {
    let records = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory') {
        records = records.concat(await recordsFromDirectoryHandle(entry));
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        try {
          const file = await entry.getFile();
          records.push({
            name: entry.name,
            text: await file.text(),
          });
        } catch (err) {
          console.warn(`Could not read file ${entry.name}:`, err);
        }
      }
    }
    return records;
  }

  /**
   * Processes an array of File objects or parsed record objects.
   * Also supports extracting ZIP archives using JSZip.
   */
  async function processIncomingFiles(fileList, vaultLabel) {
    let markdownFiles = [];

    // Check if any file is a ZIP archive
    const zipFile = fileList.find((f) => f.name && f.name.toLowerCase().endsWith('.zip'));

    try {
      if (zipFile && window.JSZip) {
        showToast('Extracting ZIP vault…');
        const zip = await window.JSZip.loadAsync(zipFile);
        const mdZipEntries = Object.values(zip.files).filter(
          (f) => !f.dir && f.name.toLowerCase().endsWith('.md')
        );

        markdownFiles = await Promise.all(
          mdZipEntries.map(async (f) => ({
            name: f.name.split('/').pop(),
            text: await f.async('text'),
          }))
        );
      } else {
        markdownFiles = await Promise.all(
          fileList
            .filter((f) => f.name && f.name.toLowerCase().endsWith('.md'))
            .map(async (f) => ({
              name: f.name,
              text: typeof f.text === 'function' ? await f.text() : f.text,
            }))
        );
      }

      // Cache raw notes for deeper reference
      notes = {};
      markdownFiles.forEach((file) => {
        const cleanName = file.name.replace(/\.md$/i, '').toLowerCase();
        notes[cleanName] = file.text;
      });

      const extractedTopics = extractTopicsFromMarkdown(markdownFiles);
      connectVault(extractedTopics, vaultLabel || 'Vault connected');

      if (!extractedTopics.length) {
        showToast('No [[wikilinks]] found in Markdown files');
      } else {
        showToast(`Loaded ${extractedTopics.length} topics from vault`);
      }
    } catch (err) {
      console.error('Failed to process files:', err);
      showToast('Could not read those files');
    }
  }

  /**
   * Connects and registers topics from a vault.
   */
  function connectVault(topicList, label) {
    topics = [...new Set(topicList)].filter(Boolean);

    // Update Topbar Status
    if (dom.vaultStatus) dom.vaultStatus.textContent = label || 'Vault connected';
    if (dom.vaultStatusWrapper) dom.vaultStatusWrapper.classList.add('connected');

    // Update Setup card & Connected banner
    if (dom.setupCard) dom.setupCard.classList.add('is-hidden');
    if (dom.connectedBar) dom.connectedBar.classList.add('is-visible');
    if (dom.connectedName) dom.connectedName.textContent = label || 'Vault connected';
    if (dom.connectedCount) dom.connectedCount.textContent = `${topics.length} topics ready`;

    // Update Practice Section
    if (dom.countLabel) dom.countLabel.textContent = `${topics.length} topics loaded`;

    if (topics.length > 0) {
      dom.topic.innerHTML = 'Your topics are ready<br><small>spin when you want a thread</small>';
      dom.topicMeta.textContent = 'Spin when you want a thread';
      updateStateIndicator('READY WHEN YOU ARE', 'active');
    } else {
      dom.topic.innerHTML = 'No wikilinks found<br><small>add [[links]] to your notes</small>';
      dom.topicMeta.textContent = 'Add [[wikilinks]] to your notes to create topics';
      updateStateIndicator('NO TOPICS FOUND', '');
    }

    renderTopicsDrawer();
    saveJSON(STORAGE_KEYS.TOPICS, topics);
    saveJSON(STORAGE_KEYS.VAULT_NAME, label || 'Vault connected');
    syncControlButtons();
  }

  /**
   * Disconnects vault and resets topic list.
   */
  function disconnectVault() {
    if (activeTimer) endSpeakingTimer(false);

    topics = [];
    notes = {};
    currentTopic = '';

    localStorage.removeItem(STORAGE_KEYS.TOPICS);
    localStorage.removeItem(STORAGE_KEYS.VAULT_NAME);

    if (dom.setupCard) dom.setupCard.classList.remove('is-hidden');
    if (dom.connectedBar) dom.connectedBar.classList.remove('is-visible');
    if (dom.vaultStatusWrapper) dom.vaultStatusWrapper.classList.remove('connected');
    if (dom.vaultStatus) dom.vaultStatus.textContent = 'No vault connected';
    if (dom.countLabel) dom.countLabel.textContent = '0 topics loaded';
    if (dom.ratingContainer) dom.ratingContainer.hidden = true;

    dom.topic.innerHTML = 'Connect your vault<br><small>and your topics will appear here</small>';
    dom.topicMeta.textContent = 'Spin is available as a preview · connect a vault for your topics';
    updateStateIndicator('NO VAULT CONNECTED', '');

    renderTopicsDrawer();
    syncControlButtons();
    showToast('Vault disconnected');
  }

  /* ==========================================================================
     6. Recommendation Engine (Weighted Selection)
     ========================================================================== */

  /**
   * Generates a weighted topic pool favoring:
   * 1. Lower-rated topics (less familiar)
   * 2. Topics not practiced recently (higher age)
   */
  function getWeightedTopicPool() {
    if (!settings.weighted || !topics.length) {
      return topics.length ? topics : DEMO_TOPICS;
    }

    const now = Date.now();
    return topics.flatMap((t) => {
      // Days since last seen, capped at 30 days
      const daysSinceSeen = Math.min(30, (now - (lastSeenTimestamps[t] || 0)) / 86400000);
      // Rating: 1 (unfamiliar) to 5 (mastered), default 3
      const userRating = topicRatings[t] || 3;
      // Formula: lower rating & higher age give greater weight
      const weight = Math.max(1, (6 - userRating) * (1 + daysSinceSeen / 7));
      return Array(Math.ceil(weight)).fill(t);
    });
  }

  /* ==========================================================================
     7. Topic Selection & Familiarity Rating
     ========================================================================== */

  /**
   * Selects a topic and activates the practice controls.
   */
  function selectTopic(topicTitle) {
    currentTopic = topicTitle;
    dom.topic.textContent = topicTitle;
    dom.topicMeta.textContent = 'say the first thing that comes to mind';

    // Familiarity Rating Controls
    if (dom.ratingContainer) {
      dom.ratingContainer.hidden = false;
      const currentRating = topicRatings[topicTitle] || 0;
      $$('[data-rating]').forEach((btn) => {
        btn.classList.toggle('selected', Number(btn.dataset.rating) === currentRating);
      });
    }

    updateStateIndicator('YOUR THREAD', 'active');
    syncControlButtons();
  }

  /**
   * Updates disabled states for interactive controls.
   */
  function syncControlButtons() {
    const hasTopic = !!currentTopic;
    const isRunning = !!activeTimer;

    if (dom.startBtn) dom.startBtn.disabled = !hasTopic || isRunning;
    if (dom.skipBtn) dom.skipBtn.disabled = !hasTopic || isRunning;

    dom.timerButtons.forEach((btn) => {
      btn.disabled = isRunning;
    });
  }

  /* ==========================================================================
     8. Timer & Speaking Session Engine
     ========================================================================== */

  /**
   * Starts the speaking practice timer and opens fullscreen focus view.
   */
  function startSpeakingSession() {
    if (!currentTopic) {
      showToast('Spin for a topic before starting the timer');
      return;
    }

    topicWasPracticed = true;
    remainingSeconds = settings.timer;
    plannedSeconds = settings.timer;
    extensionsCount = 0;

    dom.focusTopic.textContent = currentTopic;
    dom.focusClock.textContent = formatTime(remainingSeconds);
    dom.focusTimer.classList.add('is-visible');
    dom.startBtn.textContent = 'Timer running';

    clearInterval(activeTimer);
    activeTimer = setInterval(() => {
      remainingSeconds--;
      dom.focusClock.textContent = formatTime(remainingSeconds);

      if (remainingSeconds <= 0) {
        endSpeakingTimer(true, true);
      }
    }, 1000);

    syncControlButtons();
  }

  /**
   * Adds extra time (+30 seconds) to the active speaking session.
   */
  function extendSessionTime() {
    if (activeTimer) {
      remainingSeconds += 30;
      extensionsCount++;
      dom.focusClock.textContent = formatTime(remainingSeconds);
      showToast('+30 seconds added');
    }
  }

  /**
   * Completes or cancels an active speaking session.
   */
  function endSpeakingTimer(showSummary = true, isComplete = false) {
    clearInterval(activeTimer);
    activeTimer = null;

    dom.focusTimer.classList.remove('is-visible');
    dom.startBtn.textContent = 'Start timer';

    if (currentTopic && plannedSeconds) {
      const spokeDuration = plannedSeconds + extensionsCount * 30 - Math.max(0, remainingSeconds);

      // Record last seen timestamp
      lastSeenTimestamps[currentTopic] = Date.now();
      saveJSON(STORAGE_KEYS.SEEN, lastSeenTimestamps);

      // Record to history
      const historyList = getHistory();
      latestHistoryEntry = {
        date: new Date().toISOString(),
        topic: currentTopic,
        spoke: formatTime(spokeDuration),
        planned: formatTime(plannedSeconds),
        extra: `+${extensionsCount * 30} sec`,
        rating: null,
      };
      historyList.push(latestHistoryEntry);
      setHistory(historyList);

      renderRecentThreads();

      // Populate Summary Modal
      dom.summaryTopic.textContent = currentTopic;
      dom.statSpoke.textContent = formatTime(spokeDuration);
      dom.statPlanned.textContent = formatTime(plannedSeconds);
      dom.statExtensions.textContent = `+${extensionsCount * 30} sec`;
      dom.statMode.textContent = 'Speaking practice';

      // Reset session rating buttons
      $$('[data-session-rating]').forEach((b) => b.classList.remove('selected'));

      if (showSummary) {
        dom.summaryModal.hidden = false;
        updateStateIndicator(
          isComplete ? 'SESSION COMPLETE' : 'SESSION ENDED',
          isComplete ? 'complete' : 'ended'
        );
      }
    }

    syncControlButtons();
  }

  /* ==========================================================================
     9. UI Rendering (Recent Threads, Skipped Topics, Drawer)
     ========================================================================== */

  /**
   * Renders the list of recently practiced threads.
   */
  function renderRecentThreads() {
    const historyList = getHistory();
    // Unique topics in reverse chronological order
    const uniqueTopics = [...new Set(historyList.map((h) => h.topic).reverse())];

    if (!uniqueTopics.length) {
      dom.recentList.innerHTML = '<div class="empty">Your practiced topics will collect here.</div>';
      return;
    }

    dom.recentList.innerHTML = uniqueTopics
      .slice(0, 8)
      .map((t) => `<button class="recent-item recent-topic" type="button">${escapeHTML(t)}</button>`)
      .join('');

    dom.recentList.querySelectorAll('.recent-topic').forEach((btn) => {
      btn.onclick = () => selectTopic(btn.textContent);
    });
  }

  /**
   * Renders the list of skipped topics.
   */
  function renderSkippedTopics() {
    if (!skippedTopics.length) {
      dom.skippedList.innerHTML = '<div class="empty">Topics you can return to later.</div>';
      return;
    }

    dom.skippedList.innerHTML = skippedTopics
      .map((t) => `<button class="recent-item skipped-item" type="button">${escapeHTML(t)}</button>`)
      .join('');

    dom.skippedList.querySelectorAll('.skipped-item').forEach((btn) => {
      btn.onclick = () => {
        const topicText = btn.textContent;
        selectTopic(topicText);
        skippedTopics = skippedTopics.filter((x) => x !== topicText);
        saveJSON(STORAGE_KEYS.SKIPPED, skippedTopics);
        renderSkippedTopics();
      };
    });
  }

  /**
   * Renders all topics in the slide-over drawer.
   */
  function renderTopicsDrawer() {
    if (!topics.length) {
      dom.topicsList.innerHTML = '<p class="empty">No topics loaded yet.</p>';
      return;
    }

    dom.topicsList.innerHTML = topics
      .map((t) => `<button class="topic-row" type="button">${escapeHTML(t)}</button>`)
      .join('');

    dom.topicsList.querySelectorAll('.topic-row').forEach((btn) => {
      btn.onclick = () => {
        selectTopic(btn.textContent);
        dom.topicsDrawer.classList.remove('is-open');
        dom.countLabel.setAttribute('aria-expanded', 'false');
      };
    });
  }

  /**
   * Simple HTML escaping helper for safe template interpolation.
   */
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ==========================================================================
     10. History Markdown Export & Import Engine
     ========================================================================== */

  /**
   * Exports session history as a beautifully formatted Markdown file.
   */
  function exportHistoryAsMarkdown() {
    const entries = getHistory();
    if (!entries.length) {
      showToast('No history to export yet');
      return;
    }

    const lines = [
      '# Unprompted History',
      '',
      `Exported: ${new Date().toISOString()}`,
      '',
      ...entries.map(
        (x) =>
          `## ${x.date} · ${x.topic}\n\n` +
          `- Spoke for: ${x.spoke || '—'}\n` +
          `- Planned: ${x.planned || '—'}\n` +
          `- Extra time: ${x.extra || '—'}\n` +
          `- Session rating: ${x.rating || 'Not rated'}\n`
      ),
    ];

    const markdownContent = lines.join('\n');
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = downloadUrl;
    link.download = 'Unprompted History.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    showToast(`${entries.length} sessions exported`);
  }

  /**
   * Imports session history from an exported Markdown file.
   */
  async function importHistoryFromMarkdown(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const headingRegex = /^##\s+(.+?)\s+·\s+(.+)$/gm;
      const parsedItems = [];

      let match;
      while ((match = headingRegex.exec(text)) !== null) {
        const dateStr = match[1].trim();
        const topicStr = match[2].trim();

        // Extract block between this heading and the next heading
        const startIdx = match.index;
        const nextHeadingIdx = text.indexOf('\n## ', startIdx + 1);
        const block = text.slice(startIdx, nextHeadingIdx > -1 ? nextHeadingIdx : text.length);

        const extractBulletValue = (label) => {
          const m = block.match(new RegExp(`^-\\s*${label}:\\s*(.+)$`, 'm'));
          return m ? m[1].trim() : '';
        };

        const ratingVal = extractBulletValue('Session rating');

        parsedItems.push({
          date: dateStr,
          topic: topicStr,
          spoke: extractBulletValue('Spoke for'),
          planned: extractBulletValue('Planned'),
          extra: extractBulletValue('Extra time'),
          rating: ratingVal === 'Not rated' || !ratingVal ? null : Number(ratingVal) || null,
        });
      }

      const existingHistory = getHistory();
      const existingKeys = new Set(existingHistory.map((x) => `${x.date}|${x.topic}`));
      const newItems = parsedItems.filter((x) => !existingKeys.has(`${x.date}|${x.topic}`));

      if (newItems.length > 0) {
        setHistory([...existingHistory, ...newItems]);
        renderRecentThreads();
      }

      const skippedCount = parsedItems.length - newItems.length;
      showToast(
        `${newItems.length} new sessions imported${
          skippedCount > 0 ? ` (${skippedCount} duplicates skipped)` : ''
        }`
      );
    } catch (err) {
      console.error('Failed to import history:', err);
      showToast('Could not import history file');
    }
  }

  /* ==========================================================================
     11. Event Listeners & Interactions
     ========================================================================== */

  // --- Step 01: Vault Setup Listeners ---

  // Browse Directory Button (Modern File System Access API or native fallback)
  dom.browseBtn.onclick = async () => {
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        const records = await recordsFromDirectoryHandle(dirHandle);
        return processIncomingFiles(records, dirHandle.name);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('showDirectoryPicker failed, falling back to input:', err);
      }
    }
    dom.folderInput.click();
  };

  dom.folderInput.onchange = (e) => {
    const files = [...e.target.files];
    const folderName = files[0]?.webkitRelativePath?.split('/')[0] || 'Vault folder';
    processIncomingFiles(files, folderName);
  };

  dom.filesBtn.onclick = () => dom.filesInput.click();
  dom.filesInput.onchange = (e) => processIncomingFiles([...e.target.files], 'Selected files');

  dom.historyBtn.onclick = () => dom.historyInput.click();
  dom.historyInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      importHistoryFromMarkdown(file);
      e.target.value = '';
    }
  };

  dom.changeVault.onclick = disconnectVault;

  // --- Step 02: Spin & Selection Listeners ---

  dom.spinBtn.onclick = () => {
    if (isSpinning) return;

    // If the current topic was abandoned, keep it available in Skipped.
    // This happens before selecting the next topic so the old topic is not lost.
    const abandonedTopic = currentTopic;
    if (abandonedTopic && !topicWasPracticed) {
      skippedTopics = [
        abandonedTopic,
        ...skippedTopics.filter((topic) => topic !== abandonedTopic)
      ];
      saveJSON(STORAGE_KEYS.SKIPPED, skippedTopics);
      renderSkippedTopics();
    }

    isSpinning = true;

    const pool = getWeightedTopicPool();
    let iterationCount = 0;
    const maxIterations = Math.max(12, Math.round(settings.spin / 90));

    updateStateIndicator('SPINNING…', 'spinning');
    dom.spinBtn.disabled = true;

    const spinInterval = setInterval(() => {
      const randomTopic = pool[Math.floor(Math.random() * pool.length)];
      dom.topic.textContent = randomTopic;

      iterationCount++;
      if (iterationCount >= maxIterations) {
        clearInterval(spinInterval);
        const finalTopic = pool[Math.floor(Math.random() * pool.length)];
        selectTopic(finalTopic);
        isSpinning = false;
        dom.spinBtn.disabled = false;
      }
    }, 90);
  };

  dom.skipBtn.onclick = () => {
    if (!currentTopic) return;
    skippedTopics = [currentTopic, ...skippedTopics.filter((x) => x !== currentTopic)];
    saveJSON(STORAGE_KEYS.SKIPPED, skippedTopics);
    renderSkippedTopics();
    dom.resetBtn.click();
    showToast('Topic skipped');
  };

  dom.resetBtn.onclick = () => {
    if (activeTimer) endSpeakingTimer(false);
    currentTopic = '';
    topicWasPracticed = false;
    dom.summaryModal.hidden = true;
    if (dom.ratingContainer) dom.ratingContainer.hidden = true;

    if (topics.length > 0) {
      dom.topic.innerHTML = 'Your topics are ready<br><small>spin when you want a thread</small>';
      updateStateIndicator('READY WHEN YOU ARE', 'active');
    } else {
      dom.topic.innerHTML = 'Connect your vault<br><small>and your topics will appear here</small>';
      updateStateIndicator('NO VAULT CONNECTED', '');
    }
    syncControlButtons();
  };

  // Familiarity Rating Click Handlers
  $$('[data-rating]').forEach((btn) => {
    btn.onclick = () => {
      if (!currentTopic) return;
      const score = Number(btn.dataset.rating);
      topicRatings[currentTopic] = score;
      saveJSON(STORAGE_KEYS.RATINGS, topicRatings);

      $$('[data-rating]').forEach((x) => x.classList.toggle('selected', x === btn));
      showToast('Topic rating saved');
    };
  });

  // --- Timer Controls Listeners ---

  dom.timerButtons.forEach((btn) => {
    btn.onclick = () => {
      if (!activeTimer) {
        settings.timer = Number(btn.dataset.time);
        persistSettings();
        dom.timerButtons.forEach((x) => x.classList.toggle('active', x === btn));
      }
    };
  });

  dom.startBtn.onclick = startSpeakingSession;
  dom.addTimeBtn.onclick = extendSessionTime;
  dom.finishTimerBtn.onclick = () => endSpeakingTimer(true, false);

  // --- Session Flow Rating Listeners ---
  $$('[data-session-rating]').forEach((btn) => {
    btn.onclick = () => {
      const score = Number(btn.dataset.sessionRating);
      $$('[data-session-rating]').forEach((b) => b.classList.toggle('selected', b === btn));

      // Update the latest history record with session rating
      if (latestHistoryEntry) {
        latestHistoryEntry.rating = score;
        const historyList = getHistory();
        if (historyList.length > 0) {
          historyList[historyList.length - 1].rating = score;
          setHistory(historyList);
        }
        showToast('Session rating saved');
      }
    };
  });

  dom.closeSummaryBtn.onclick = () => {
    dom.summaryModal.hidden = true;
  };

  // --- All Topics Drawer Listeners ---

  dom.countLabel.onclick = () => {
    const isNowOpen = dom.topicsDrawer.classList.toggle('is-open');
    dom.countLabel.setAttribute('aria-expanded', String(isNowOpen));
    renderTopicsDrawer();
  };

  dom.closeTopicsBtn.onclick = () => {
    dom.topicsDrawer.classList.remove('is-open');
    dom.countLabel.setAttribute('aria-expanded', 'false');
  };

  // --- Settings Modal Listeners ---

  dom.settingsBtn.onclick = () => {
    dom.settingsModal.hidden = false;
  };

  dom.closeSettingsBtn.onclick = () => {
    dom.settingsModal.hidden = true;
  };

  dom.defaultTimerSelect.value = String(settings.timer);
  dom.spinDurationSelect.value = String(settings.spin);
  dom.weightedChoiceCheck.checked = !!settings.weighted;
  dom.darkModeCheck.checked = !!settings.dark;

  dom.defaultTimerSelect.onchange = (e) => {
    settings.timer = Number(e.target.value);
    persistSettings();
    dom.timerButtons.forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.time) === settings.timer);
    });
    showToast('Default timer saved');
  };

  dom.spinDurationSelect.onchange = (e) => {
    settings.spin = Number(e.target.value);
    persistSettings();
    showToast('Spin duration saved');
  };

  dom.weightedChoiceCheck.onchange = (e) => {
    settings.weighted = e.target.checked;
    persistSettings();
    showToast('Topic weighting saved');
  };

  dom.darkModeCheck.onchange = (e) => {
    settings.dark = e.target.checked;
    document.body.classList.toggle('dark', settings.dark);
    persistSettings();
    showToast('Theme updated');
  };

  dom.resetDataBtn.onclick = () => {
    if (confirm('Reset all locally stored topics, ratings, skips, and history?')) {
      Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
      topicRatings = {};
      lastSeenTimestamps = {};
      skippedTopics = [];
      renderRecentThreads();
      renderSkippedTopics();
      disconnectVault();
      showToast('All local data reset');
      dom.settingsModal.hidden = true;
    }
  };

  // --- Recent & Skipped Clear Handlers ---

  dom.clearBtn.onclick = () => {
    if (getHistory().length && confirm('Clear all practiced topics from history?')) {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
      renderRecentThreads();
      showToast('History cleared');
    }
  };

  dom.clearSkipped.onclick = () => {
    skippedTopics = [];
    localStorage.removeItem(STORAGE_KEYS.SKIPPED);
    renderSkippedTopics();
    showToast('Skipped list cleared');
  };

  dom.exportHistoryBtn.onclick = exportHistoryAsMarkdown;

  // Global Keyboard Shortcuts (Escape to dismiss drawers & modals)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dom.settingsModal.hidden = true;
      dom.summaryModal.hidden = true;
      dom.topicsDrawer.classList.remove('is-open');
      dom.countLabel.setAttribute('aria-expanded', 'false');
    }
  });

  /* ==========================================================================
     12. Initial Application Bootstrapping
     ========================================================================== */

  function initApp() {
    // Apply saved dark theme preference
    if (settings.dark) {
      document.body.classList.add('dark');
    }

    // Set active timer button to match current setting
    dom.timerButtons.forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.time) === settings.timer);
    });

    // Restore cached vault topics if previously saved
    const savedTopics = loadJSON(STORAGE_KEYS.TOPICS, []);
    const savedVaultName = localStorage.getItem(STORAGE_KEYS.VAULT_NAME);

    if (savedTopics.length > 0) {
      topics = savedTopics;
      dom.countLabel.textContent = `${topics.length} topics loaded`;
      dom.setupCard.classList.add('is-hidden');
      dom.connectedBar.classList.add('is-visible');
      dom.connectedName.textContent = savedVaultName || 'Vault connected';
      dom.connectedCount.textContent = `${topics.length} topics ready`;
      if (dom.vaultStatus) dom.vaultStatus.textContent = savedVaultName || 'Vault connected';
      if (dom.vaultStatusWrapper) dom.vaultStatusWrapper.classList.add('connected');
      updateStateIndicator('READY WHEN YOU ARE', 'active');
      dom.topicMeta.textContent = 'Topics restored from this browser';
      renderTopicsDrawer();
    }

    renderRecentThreads();
    renderSkippedTopics();
    syncControlButtons();
  }

  // Run initialization on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
