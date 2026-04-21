/* ===== Telegram Web App Initialization ===== */

// Initialize Telegram Web App
const tg = window.Telegram?.WebApp || null;
const GOOGLE_ANALYTICS_ID = 'G-GY091TN67D';
const TELEMETRY_SUPABASE_URL = window.AIT_SUPABASE_URL || '';
const TELEMETRY_SUPABASE_ANON_KEY = window.AIT_SUPABASE_ANON_KEY || '';
const LAUNCH_TRACK_FLAG = 'ait_telegram_launch_tracked';

/**
 * Check whether app is opened inside Telegram Mini App container.
 * @returns {boolean}
 */
function isTelegramMiniApp() {
  return Boolean(tg && tg.initData);
}

/**
 * Check whether telemetry integration is configured.
 * @returns {boolean}
 */
function isLaunchTelemetryConfigured() {
  return Boolean(TELEMETRY_SUPABASE_URL && TELEMETRY_SUPABASE_ANON_KEY);
}

/**
 * Build payload for launch tracking.
 * @returns {object|null}
 */
function getLaunchPayload() {
  const user = tg?.initDataUnsafe?.user;
  if (!user || !user.id) {
    return null;
  }

  return {
    user_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    is_premium: Boolean(user.is_premium),
    is_bot: Boolean(user.is_bot),
    app_path: window.location.pathname,
    app_url: window.location.href,
    platform: tg?.platform || null,
    launch_source: 'telegram-mini-app'
  };
}

/**
 * Send one launch event per browser session to Supabase.
 * Uses anonymous key and public insert policy on a dedicated table.
 * @returns {Promise<void>}
 */
async function trackTelegramLaunch() {
  if (!isTelegramMiniApp() || !isLaunchTelemetryConfigured()) {
    return;
  }

  try {
    if (sessionStorage.getItem(LAUNCH_TRACK_FLAG) === '1') {
      return;
    }
  } catch (error) {
    console.warn('sessionStorage is not available:', error);
  }

  const payload = getLaunchPayload();
  if (!payload) {
    return;
  }

  const baseUrl = TELEMETRY_SUPABASE_URL.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/rest/v1/telegram_launches`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: TELEMETRY_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${TELEMETRY_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase telemetry failed (${response.status}): ${errorText}`);
    }

    try {
      sessionStorage.setItem(LAUNCH_TRACK_FLAG, '1');
    } catch (error) {
      console.warn('Cannot persist launch tracking flag:', error);
    }
  } catch (error) {
    console.error('Launch tracking error:', error);
  }
}

/* ===== Google Analytics ===== */

/**
 * Initialize Google Analytics 4.
 * Loads the gtag script once and sends the default page view.
 */
function initGoogleAnalytics() {
  if (!GOOGLE_ANALYTICS_ID || window.gtag) {
    return;
  }

  const analyticsScript = document.createElement('script');
  analyticsScript.async = true;
  analyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
  document.head.appendChild(analyticsScript);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_ANALYTICS_ID);
}

/**
 * Initialize Telegram Mini App
 */
function initTelegramApp() {
  if (!tg) {
    return;
  }

  tg.ready();
  tg.expand();

  // Set theme to dark
  tg.setHeaderColor('#1a1a1a');
  tg.setBackgroundColor('#1a1a1a');

  // Disable vertical swipe (iOS)
  tg.disableVerticalSwipes();

  // Log user data (for debugging)
  if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    console.log('User:', tg.initDataUnsafe.user);
  }
}

/**
 * Get user display name
 * @returns {string} First name or "Користувач" if not available
 */
function getUserName() {
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    return tg.initDataUnsafe.user.first_name || 'Користувач';
  }
  return 'Користувач';
}

/**
 * Get user ID
 * @returns {number|null} User ID or null
 */
function getUserId() {
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    return tg.initDataUnsafe.user.id;
  }
  return null;
}

/* ===== localStorage Utilities ===== */

/**
 * Save data to localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to save (will be JSON stringified)
 */
function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving data for key "${key}":`, error);
  }
}

/**
 * Load data from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} Parsed value or defaultValue
 */
function loadData(key, defaultValue = null) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (error) {
    console.error(`Error loading data for key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Clear data from localStorage
 * @param {string} key - Storage key
 */
function clearData(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error clearing data for key "${key}":`, error);
  }
}

/**
 * Clear all localStorage data
 */
function clearAllData() {
  try {
    localStorage.clear();
  } catch (error) {
    console.error('Error clearing all data:', error);
  }
}

/* ===== Navigation & Back Button ===== */

/**
 * Setup back button for sub-pages
 * @param {Function} onBack - Callback when back button is pressed
 */
function setupBackButton(onBack) {
  if (!tg || !tg.BackButton) {
    return;
  }

  tg.BackButton.onClick(onBack);
  tg.BackButton.show();
}

/**
 * Hide back button
 */
function hideBackButton() {
  if (tg && tg.BackButton) {
    tg.BackButton.hide();
  }
}

/**
 * Show back button
 */
function showBackButton() {
  if (tg && tg.BackButton) {
    tg.BackButton.show();
  }
}

/**
 * Navigate back
 */
function goBack() {
  window.history.back();
}

/**
 * Navigate to the main app screen
 */
function goToHome() {
  if (window.location.pathname.endsWith('/app/index.html') || window.location.pathname.endsWith('\\app\\index.html')) {
    return;
  }

  window.location.href = '../index.html';
}

/* ===== Main Menu Navigation ===== */

/**
 * Navigate to a page
 * @param {string} path - Relative path to navigate to
 */
function navigateTo(path) {
  window.location.href = path;
}

/* ===== Utility Functions ===== */

/**
 * Format number as currency (UAH)
 * @param {number} value - Number to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Format number with thousands separator
 * @param {number} value - Number to format
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted number
 */
function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Show notification (using Telegram or alert fallback)
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'error', 'info'
 */
function showNotification(message, type = 'info') {
  if (tg && tg.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

/**
 * Show confirm dialog
 * @param {string} message - Message to display
 * @param {Function} onConfirm - Callback if confirmed
 * @param {Function} onCancel - Callback if cancelled
 */
function showConfirm(message, onConfirm, onCancel = null) {
  if (tg && tg.showConfirm) {
    tg.showConfirm(message, (result) => {
      if (result) {
        onConfirm();
      } else if (onCancel) {
        onCancel();
      }
    });
  } else {
    if (confirm(message)) {
      onConfirm();
    } else if (onCancel) {
      onCancel();
    }
  }
}

/**
 * Request phone number from user
 * @param {Function} onSuccess - Callback with phone number
 * @param {Function} onError - Callback on error
 */
function requestPhoneNumber(onSuccess, onError = null) {
  if (tg && tg.requestContact) {
    tg.requestContact((contact) => {
      if (contact) {
        onSuccess(contact.phone_number);
      } else if (onError) {
        onError();
      }
    });
  } else if (onError) {
    onError();
  }
}

/* ===== Close App ===== */

/**
 * Close the Mini App
 */
function closeApp() {
  if (tg && tg.close) {
    tg.close();
  }
}

/* ===== Init on page load ===== */
document.addEventListener('DOMContentLoaded', function() {
  initGoogleAnalytics();
  initTelegramApp();
  void trackTelegramLaunch();
});
