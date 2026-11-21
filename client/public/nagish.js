/*
 * The accessibility button, on the app and on the server-rendered pages.
 *
 * Open-Nagish paints into a shadow host marked `all: initial`. That host is an
 * inline box at the end of the document, so the button scrolls away with the
 * page: a phone shows it, then the page gets tall and it is gone. The host rule
 * in each document makes the host the window. This file then locks the trigger
 * to the corner, because a resize (the phone's address bar) otherwise writes a
 * top and a left that park the button off screen.
 *
 * Served from this origin on purpose. The server pages allow scripts from
 * 'self' only, so a copy loaded from a CDN would never run there.
 */
(function () {
  window.OpenNagishConfig = {
    language: 'he',
    position: 'bottom-left',
    statementUrl: '/accessibility',
    statementData: {
      orgName: 'Urban365',
      orgEmail: 'accessibility@urban365.com',
    },
  };

  var trigger =
    '.anid-trigger{position:fixed!important;z-index:2147483647!important;top:auto!important;right:auto!important;left:1.25rem!important;width:56px!important;height:56px!important;margin:0!important;display:flex!important;pointer-events:auto!important;bottom:calc(1.25rem + env(safe-area-inset-bottom, 0px))!important}' +
    '@media (max-width:639px){.anid-trigger{bottom:calc(4.5rem + env(safe-area-inset-bottom, 0px))!important}}' +
    '.anid-panel{pointer-events:auto!important}';

  function pin() {
    var host = document.getElementById('opennagish-widget');
    if (!host || !host.shadowRoot || host.dataset.pinned === '1') return false;
    var style = document.createElement('style');
    style.textContent = trigger;
    host.shadowRoot.appendChild(style);
    host.dataset.pinned = '1';
    return true;
  }

  var lib = document.createElement('script');
  lib.src = '/open-nagish.min.js';
  lib.async = false;
  lib.onload = function () {
    if (pin()) return;
    var watch = new MutationObserver(function () {
      if (pin()) watch.disconnect();
    });
    if (document.body) watch.observe(document.body, { childList: true });
    setTimeout(function () {
      watch.disconnect();
    }, 10000);
  };
  document.head.appendChild(lib);
})();
