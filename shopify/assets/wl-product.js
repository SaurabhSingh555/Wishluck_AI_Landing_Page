/* Wishluck product form enhancement (~2KB). Progressive: without JS the form posts to /cart/add with the selected variant id. */
(function () {
  function init(root) {
    var dataEl = root.querySelector('[data-wl-variants]');
    var form = root.querySelector('form');
    if (!dataEl || !form) return;
    var variants = JSON.parse(dataEl.textContent);
    var idInput = form.querySelector('[data-wl-variant-id]');
    var priceEl = root.querySelector('[data-wl-price]');
    var compareEl = root.querySelector('[data-wl-compare]');
    var saveEl = root.querySelector('[data-wl-save]');
    var status = root.querySelector('[data-wl-status]');
    var qty = form.querySelector('input[name="quantity"]');
    var formId = form.getAttribute('id'); /* NB: form.id is shadowed by the hidden input[name=id] */
    var buttons = document.querySelectorAll('[data-wl-atc][form="' + formId + '"], #' + formId + ' [data-wl-atc]');
    var sticky = root.querySelector('[data-wl-sticky]');
    var optionSets = [].slice.call(root.querySelectorAll('.wl-option'));
    var label = (buttons[0] && buttons[0].getAttribute('data-label')) || 'Add to cart';
    function selected() {
      return optionSets.map(function (fs) { var c = fs.querySelector('input:checked'); return c ? c.value : null; });
    }
    function match(opts) {
      return variants.find(function (v) { return v.options.every(function (o, i) { return opts[i] == null || o === opts[i]; }); });
    }
    function refreshAvailability() {
      var cur = selected();
      optionSets.forEach(function (fs, idx) {
        [].slice.call(fs.querySelectorAll('input')).forEach(function (input) {
          var test = cur.slice(); test[idx] = input.value;
          var v = match(test);
          var l = fs.querySelector('label[for="' + input.id + '"]');
          if (l) l.classList.toggle('is-unavailable', !v || !v.available);
        });
      });
    }
    function update() {
      var v = match(selected());
      if (!v) { setStatus('This combination is unavailable.', 'error'); buttons.forEach(function (b) { b.disabled = true; }); return; }
      idInput.value = v.id;
      if (priceEl) priceEl.textContent = v.price;
      if (compareEl) { compareEl.textContent = v.compare; compareEl.hidden = !v.onSale; }
      if (saveEl) { saveEl.textContent = v.save ? 'Save ' + v.save + '%' : ''; saveEl.hidden = !v.onSale; }
      buttons.forEach(function (b) {
        b.disabled = !v.available;
        var s = b.querySelector('[data-wl-atc-label]'); if (s) s.textContent = v.available ? label : 'Sold out';
      });
      if (sticky) { var sp = sticky.querySelector('[data-wl-sticky-price]'); if (sp) sp.textContent = v.price; }
      setStatus(v.available ? '' : 'This variant is sold out.', v.available ? '' : 'error');
      refreshAvailability();
      try { var u = new URL(location.href); u.searchParams.set('variant', v.id); history.replaceState(null, '', u); } catch (e) {}
    }
    function setStatus(msg, type) { if (status) { status.textContent = msg; status.setAttribute('data-type', type || ''); } }
    optionSets.forEach(function (fs) { fs.addEventListener('change', update); });
    root.querySelectorAll('[data-wl-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = parseInt(qty.value, 10) || 1; n += parseInt(b.getAttribute('data-wl-qty'), 10); qty.value = Math.max(1, n);
      });
    });
    form.addEventListener('submit', function (e) {
      var url = form.getAttribute('data-cart-add-url');
      if (!url || !window.fetch) return;
      var cross = false;
      try { cross = new URL(url, location.href).origin !== location.origin; } catch (err) {}
      var q = Math.max(1, parseInt(qty ? qty.value : '1', 10) || 1);
      if (cross) {
        /* Studio preview only: the theme is not served from the store domain, so use Shopify's cart permalink. */
        e.preventDefault();
        var o = new URL(url, location.href).origin;
        window.open(o + '/cart/' + idInput.value + ':' + q, '_blank', 'noopener');
        setStatus('Preview mode: opened the source store cart with this variant.', 'ok');
        return;
      }
      e.preventDefault();
      buttons.forEach(function (b) { b.disabled = true; b.setAttribute('aria-busy', 'true'); });
      setStatus('Adding…', '');
      fetch(url, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.body.description || res.body.message || 'Could not add to cart.');
          setStatus('Added to cart.', 'ok');
          document.dispatchEvent(new CustomEvent('wl:cart-added', { detail: res.body }));
          var cartLink = root.querySelector('[data-wl-cart-link]'); if (cartLink) cartLink.hidden = false;
        })
        .catch(function (err) { setStatus(err.message, 'error'); })
        .then(function () { buttons.forEach(function (b) { b.removeAttribute('aria-busy'); }); update(); });
    });
    if (sticky) {
      /* Show the sticky bar whenever the inline button is not FULLY in the viewport, so one add-to-cart control is always reachable. */
      var main = form.querySelector('[data-wl-atc]');
      var raf = 0;
      var check = function () {
        raf = 0;
        var r = main.getBoundingClientRect();
        var fully = r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight);
        sticky.classList.toggle('is-visible', !fully);
      };
      var queue = function () { if (!raf) raf = requestAnimationFrame(check); };
      window.addEventListener('scroll', queue, { passive: true });
      window.addEventListener('resize', queue);
      window.addEventListener('load', queue);
      document.addEventListener('wl:layout', queue);
      setTimeout(queue, 400);
      check();
    }
    refreshAvailability();
  }
  function thumbs() {
    document.querySelectorAll('[data-wl-thumb]').forEach(function (t) {
      t.addEventListener('click', function () {
        var i = t.getAttribute('data-wl-thumb'); var scope = t.closest('.wl-media');
        scope.querySelectorAll('.wl-media__item').forEach(function (li) { li.classList.toggle('is-active', li.getAttribute('data-i') === i); });
        scope.querySelectorAll('[data-wl-thumb]').forEach(function (x) { x.setAttribute('aria-current', String(x === t)); });
      });
    });
  }
  function boot() { document.querySelectorAll('[data-wl-product]').forEach(init); thumbs(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
