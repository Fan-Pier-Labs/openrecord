(function () {
  var originalFetch = window.fetch;
  window.fetch = function (url, opts) {
    opts = opts || {};
    if ((opts.method || 'GET').toUpperCase() === 'POST') {
      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');
      if (el) {
        opts.headers = opts.headers || {};
        if (!opts.headers['__RequestVerificationToken']) {
          opts.headers['__RequestVerificationToken'] = el.value;
        }
      }
    }
    return originalFetch.call(this, url, opts);
  };
})();
