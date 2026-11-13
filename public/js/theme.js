// Mode tampilan: Shift (otomatis: terang siang, gelap malam), Dark, Bright.
// Disimpan per perangkat di browser. Dimuat di <head> supaya tidak berkedip.
(function () {
  var KEY = 'dewa-theme';
  var DAY_START = 6, DAY_END = 18; // Shift: terang jam 06:00-17:59, gelap selain itu
  function pref() { try { return localStorage.getItem(KEY) || 'shift'; } catch (e) { return 'shift'; } }
  function resolve(p) {
    if (p === 'dark' || p === 'bright') return p;
    var h = new Date().getHours();
    return h >= DAY_START && h < DAY_END ? 'bright' : 'dark';
  }
  function apply() {
    var t = resolve(pref());
    document.documentElement.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#0a1512' : '#12352f');
  }
  window.DewaTheme = {
    get: pref,
    set: function (p) { try { localStorage.setItem(KEY, p); } catch (e) {} apply(); }
  };
  apply();
  setInterval(apply, 60000); // Shift ikut berganti saat jam lewat
})();
