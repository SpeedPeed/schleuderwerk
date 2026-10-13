// Plattform-Anbindung: Vibration, Bildschirm wach halten, Pause im Hintergrund.
// Läuft im Browser und später in der Android-App (Capacitor) – dort mit nativen Plugins.

const cap = () => window.Capacitor && window.Capacitor.Plugins;

export const platform = {
  vibration: true,
  wakeLock: null,

  isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  },

  haptic(kind) {
    if (!this.vibration) return;
    const H = cap() && cap().Haptics;
    if (H && this.isNative()) {
      try {
        if (kind === 'light') H.impact({ style: 'LIGHT' });
        else if (kind === 'medium') H.impact({ style: 'MEDIUM' });
        else if (kind === 'heavy') H.impact({ style: 'HEAVY' });
        else if (kind === 'success') H.notification({ type: 'SUCCESS' });
      } catch (_) { /* egal */ }
      return;
    }
    const pat = { light: 10, medium: 25, heavy: [40, 30, 50], success: [15, 40, 20] }[kind] || 15;
    try { navigator.vibrate && navigator.vibrate(pat); } catch (_) { /* egal */ }
  },

  async keepAwake(on) {
    try {
      const K = cap() && cap().KeepAwake;
      if (K && this.isNative()) { on ? await K.keepAwake() : await K.allowSleep(); return; }
      if (on && 'wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      } else if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch (_) { /* nicht verfügbar – egal */ }
  },

  onPauseResume(onPause, onResume) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onPause(); else onResume();
    });
    const A = cap() && cap().App;
    if (A && this.isNative()) {
      A.addListener('pause', onPause);
      A.addListener('resume', onResume);
    }
  },

  // Android-Zurück-Taste (im Browser ohne Wirkung)
  onBackButton(handler) {
    const A = cap() && cap().App;
    if (A && this.isNative()) A.addListener('backButton', handler);
  },

  exitApp() {
    const A = cap() && cap().App;
    if (A && this.isNative()) A.exitApp();
  },

  // In der App: CSS-Klasse für Abstand zur Kamera-Aussparung
  markNative() {
    if (this.isNative()) document.body.classList.add('native');
  },
};
