(function (window) {
  'use strict';
  const ATC = window.ATC = window.ATC || {};

  ATC.makeAuthSession = function (storageKey) {
    return {
      getKey: () => { try { return sessionStorage.getItem(storageKey); } catch (_) { return null; } },
      setKey: key => { try { sessionStorage.setItem(storageKey, key); } catch (_) {} },
      clearKey: () => { try { sessionStorage.removeItem(storageKey); } catch (_) {} }
    };
  };

  ATC.startClock = function (timeEl) {
    const update = () => {
      if (!timeEl) return;
      const now = new Date();
      const pad = value => String(value).padStart(2, '0');
      timeEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  };

  ATC.startAutoRefresh = function (ms, onTick, onRefresh) {
    let nextRefresh = Date.now() + ms;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') {
        nextRefresh = Date.now() + ms;
        return;
      }
      if (Date.now() >= nextRefresh) {
        nextRefresh = Date.now() + ms;
        await onRefresh();
      }
      if (onTick) onTick(Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  };
})(window);
