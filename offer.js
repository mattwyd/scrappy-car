// Instant-offer form. Ported from carca.sh; markup lives in index.html (#offer),
// styles in offer.css. Posts to /api/quote and /api/accept, which write to HubSpot.
// ---- INSTANT OFFER CALCULATOR ----
(function() {
  var calc = document.getElementById('calc');
  if (!calc) return;

  var picked = { running: null, condition: null, keys: null };
  var modelTypes = {};
  var photos = [];
  var quote = null;

  // Custom combobox — the native <datalist> dropdown is unstyleable and looks
  // like a browser artifact next to the rest of the page.
  function combobox(rootId, config) {
    var root = document.getElementById(rootId);
    var input = root.querySelector('.cbox-input');
    var panel = root.querySelector('.cbox-panel');
    var options = [];
    var filtered = [];
    var active = -1;

    function escapeHtml(str) {
      return str.replace(/[&<>"]/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function highlight(label, query) {
      var safe = escapeHtml(label);
      if (!query) return safe;
      var i = label.toLowerCase().indexOf(query.toLowerCase());
      if (i === -1) return safe;
      return escapeHtml(label.slice(0, i)) + '<b>' + escapeHtml(label.slice(i, i + query.length)) + '</b>' + escapeHtml(label.slice(i + query.length));
    }

    function render(query) {
      var q = (query || '').trim().toLowerCase();
      filtered = q ? options.filter(function(o) { return o.label.toLowerCase().indexOf(q) !== -1; }) : options.slice();
      // Prefix matches first: typing "cor" should surface Corolla before Ford Escort.
      if (q) {
        filtered.sort(function(a, b) {
          var ap = a.label.toLowerCase().indexOf(q) === 0 ? 0 : 1;
          var bp = b.label.toLowerCase().indexOf(q) === 0 ? 0 : 1;
          return ap - bp || a.label.localeCompare(b.label);
        });
      }
      active = filtered.length ? 0 : -1;

      if (!filtered.length) {
        panel.innerHTML = '<div class="cbox-empty">' +
          (config.emptyText || "Nothing matched — type it in and we'll sort it out.") + '</div>';
        return;
      }
      panel.innerHTML = filtered.map(function(o, i) {
        return '<div class="cbox-opt' + (i === active ? ' active' : '') + '" role="option" data-i="' + i + '">' +
          '<span>' + highlight(o.label, query ? query.trim() : '') + '</span>' +
          (o.tag ? '<span class="cbox-tag">' + escapeHtml(o.tag) + '</span>' : '') +
          '</div>';
      }).join('');
    }

    function open(query) {
      if (input.disabled) return;
      render(query);
      root.classList.add('open');
    }

    function close() {
      root.classList.remove('open');
    }

    function choose(i) {
      var opt = filtered[i];
      if (!opt) return;
      input.value = opt.label;
      close();
      if (config.onSelect) config.onSelect(opt);
    }

    function moveActive(delta) {
      if (!filtered.length) return;
      active = (active + delta + filtered.length) % filtered.length;
      [].forEach.call(panel.querySelectorAll('.cbox-opt'), function(el, i) {
        el.classList.toggle('active', i === active);
        if (i === active) el.scrollIntoView({ block: 'nearest' });
      });
    }

    input.addEventListener('focus', function() { open(''); });
    input.addEventListener('click', function() { open(input.value === lastChosen ? '' : input.value); });
    input.addEventListener('input', function() { open(input.value); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!root.classList.contains('open')) open(input.value); else moveActive(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Enter') {
        if (root.classList.contains('open') && active >= 0) { e.preventDefault(); choose(active); }
      } else if (e.key === 'Escape') { close(); }
    });
    panel.addEventListener('mousedown', function(e) {
      var opt = e.target.closest('.cbox-opt');
      if (!opt) return;
      e.preventDefault();
      choose(Number(opt.getAttribute('data-i')));
    });
    document.addEventListener('click', function(e) {
      if (!root.contains(e.target)) {
        close();
        if (config.onBlur) config.onBlur(input.value.trim());
      }
    });

    var lastChosen = '';
    return {
      setOptions: function(list) { options = list; },
      setEnabled: function(on, placeholder) {
        input.disabled = !on;
        if (placeholder) input.placeholder = placeholder;
      },
      clear: function() { input.value = ''; },
      value: function() { return input.value.trim(); },
    };
  }

  var modelHint = document.getElementById('modelHint');
  var errorEl = document.getElementById('calcError');
  var modelTypesByName = {};

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  var makeCombo = combobox('cb_make', {
    emptyText: "Not listed? Type it in and keep going.",
    onSelect: function() { onVehicleChange(); },
    onBlur: function() { onVehicleChange(); },
  });
  var modelCombo = combobox('cb_model', {
    emptyText: "Not listed? Type it in and keep going.",
    onSelect: function(opt) { modelTypesByName[opt.label.toLowerCase()] = opt.type; },
  });

  // Year stepper — +/- taps, no scroll capture. Opens on 2011.
  var yearHidden = document.getElementById('f_year');
  (function buildYearStepper() {
    var START = 2011, MIN = 1980, MAX = new Date().getFullYear() + 1;
    var valEl = document.getElementById('yearVal');
    var up = document.getElementById('yearUp');
    var down = document.getElementById('yearDown');
    var cur = START;
    function render() {
      valEl.textContent = String(cur);
      up.disabled = cur >= MAX;
      down.disabled = cur <= MIN;
      var sv = String(cur);
      if (yearHidden.value !== sv) { yearHidden.value = sv; onVehicleChange(); }
    }
    up.addEventListener('click', function() { if (cur < MAX) { cur++; render(); } });
    down.addEventListener('click', function() { if (cur > MIN) { cur--; render(); } });
    render();
  })();

  // Odometer slider — nobody knows their exact km; nearest 10k is plenty.
  (function odometer() {
    var range = document.getElementById('kmRange');
    var read = document.getElementById('kmRead');
    var hidden = document.getElementById('f_km');
    function update() {
      var v = Math.round(range.value / 10000) * 10000;
      hidden.value = String(v);
      read.textContent = Number(v).toLocaleString('en-CA') + (v >= Number(range.max) ? '+' : '');
    }
    range.addEventListener('input', update);
    update();
  })();

  // Location — fuzzy dropdown seeded with our coverage area; free text still allowed.
  var cityCombo = combobox('cb_city', {
    emptyText: "Not on the list? Type it in — if we can get there, we will.",
  });
  cityCombo.setOptions([
    'Scarborough','Port Union','West Rouge','Rouge Hill','Highland Creek','Malvern','Agincourt',
    'Guildwood','Morningside','Birch Cliff','Cliffside','Wexford','Steeles',"L'Amoreaux",
    'East York','Leaside','The Beaches','Danforth','East Toronto','North York','Don Mills','Toronto',
    'Pickering','Ajax','Whitby','Oshawa','Courtice','Bowmanville','Clarington','Uxbridge',
    'Markham','Unionville','Stouffville','Richmond Hill','Vaughan','Thornhill',
    'GTA (Greater Toronto Area)'
  ].map(function(c) { return { label: c }; }));

  fetch('/api/vehicles?makes=1&v=2')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      makeCombo.setOptions((d.makes || []).map(function(m) { return { label: m }; }));
    })
    .catch(function() {});

  var lastLookup = '';
  function onVehicleChange() {
    var year = val('f_year');
    var make = makeCombo.value();
    makeCombo.setEnabled(!!year, year ? 'Start typing… e.g. Ford' : 'Select a year first');
    if (!year || !make) {
      modelCombo.setEnabled(false, 'Select a make first');
      return;
    }
    var key = year + '|' + make.toLowerCase();
    if (key === lastLookup) return;
    lastLookup = key;

    modelCombo.clear();
    modelCombo.setEnabled(false, 'Loading models…');
    modelHint.textContent = '';
    modelTypesByName = {};

    fetch('/api/vehicles?v=2&year=' + encodeURIComponent(year) + '&make=' + encodeURIComponent(make))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var models = d.models || [];
        models.forEach(function(m) { modelTypesByName[m.name.toLowerCase()] = m.type; });
        modelCombo.setOptions(models.map(function(m) {
          return { label: m.name, type: m.type, tag: m.type === 'truck' ? 'Truck / SUV' : 'Car' };
        }));
        modelCombo.setEnabled(true, models.length ? 'Start typing… e.g. ' + models[0].name : 'Type your model');
        modelHint.textContent = models.length
          ? models.length + ' ' + year + ' ' + make + ' models on file'
          : "None on file for that year — type it in and we'll sort it out.";
      })
      .catch(function() {
        modelCombo.setEnabled(true, 'Type your model');
        modelHint.textContent = '';
      });
  }

  document.querySelectorAll('.pill-row').forEach(function(row) {
    var group = row.getAttribute('data-group');
    row.querySelectorAll('.pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        row.querySelectorAll('.pill').forEach(function(b) { b.classList.remove('on'); });
        btn.classList.add('on');
        picked[group] = btn.getAttribute('data-value');
      });
    });
  });

  // Downscale in the browser: keeps uploads inside the function body limit and
  // means a 12MP phone photo doesn't stall the form on rural data.
  function shrink(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        var img = new Image();
        img.onload = function() {
          var max = 1280;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('f_photos').addEventListener('change', function(e) {
    var files = [].slice.call(e.target.files || []).slice(0, 4);
    var thumbs = document.getElementById('photoThumbs');
    var label = document.getElementById('photoLabel');
    if (!files.length) return;
    label.textContent = 'Adding ' + files.length + ' photo' + (files.length > 1 ? 's' : '') + '…';

    Promise.all(files.map(function(f) {
      return shrink(f).then(function(dataUrl) {
        var img = document.createElement('img');
        img.src = dataUrl;
        thumbs.appendChild(img);
        return fetch('/api/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataUrl })
        }).then(function(r) { return r.ok ? r.json() : null; })
          .then(function(d) { if (d && d.url) photos.push(d.url); })
          .catch(function() {});
      });
    })).then(function() {
      label.textContent = photos.length ? photos.length + ' photo' + (photos.length > 1 ? 's' : '') + ' added — tap to add more' : 'Tap to add photos';
    });
  });

  function show(pane) {
    calc.querySelectorAll('.cpane').forEach(function(p) { p.classList.remove('on'); });
    var target = calc.querySelector('[data-pane="' + pane + '"]');
    if (target) target.classList.add('on');
    if (window.posthog) posthog.capture('form_step', { step: pane });
    var form = document.getElementById('calcForm');
    var numeric = pane === '1' || pane === '2' || pane === '3';
    form.style.display = numeric ? '' : 'none';
    calc.querySelector('#calcSteps').style.display = numeric ? '' : 'none';
    calc.querySelectorAll('.cstep').forEach(function(s) {
      var n = s.getAttribute('data-step');
      s.classList.toggle('on', n === pane);
      s.classList.toggle('done', numeric && Number(n) < Number(pane));
    });
    // Only reposition while stepping through the form, and only if the card has
    // drifted off screen. The valuing/result/done panes render in place so the
    // offer reveals right where the form was — no jump down the page.
    if (numeric) {
      var top = calc.getBoundingClientRect().top;
      if (top < 60 || top > window.innerHeight * 0.6) {
        window.scrollTo({ top: window.scrollY + top - 76, behavior: 'smooth' });
      }
    }
  }

  function fail(msg) { errorEl.textContent = msg; return false; }

  function validate(step) {
    errorEl.textContent = '';
    if (step === '2') {
      if (!val('f_year')) return fail('Pick the model year.');
      if (!val('f_make')) return fail('Which make is it?');
      if (!val('f_model')) return fail('Which model is it?');
    }
    if (step === '3') {
      if (!picked.running) return fail('Let us know if it starts and drives.');
      if (!picked.condition) return fail('Pick the overall condition.');
      if (!picked.keys) return fail('Let us know about keys and ownership.');
    }
    return true;
  }

  calc.querySelectorAll('.calc-next').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var next = btn.getAttribute('data-next');
      if (validate(next)) show(next);
    });
  });
  calc.querySelectorAll('.calc-back').forEach(function(btn) {
    btn.addEventListener('click', function() { errorEl.textContent = ''; show(btn.getAttribute('data-back')); });
  });

  var STAGES = [
    ['Looking up your vehicle…', 15],
    ['Checking body type and weight class…', 40],
    ['Applying our current prices…', 65],
    ['Factoring in condition…', 85],
    ['Finalizing your offer…', 100]
  ];

  function runValuing() {
    show('valuing');
    var fill = document.getElementById('cbarFill');
    var stage = document.getElementById('valuingStage');
    var i = 0;
    return new Promise(function(resolve) {
      (function step() {
        if (i >= STAGES.length) return resolve();
        stage.textContent = STAGES[i][0];
        fill.style.width = STAGES[i][1] + '%';
        i++;
        setTimeout(step, 620 + Math.random() * 320);
      })();
    });
  }

  document.getElementById('calcForm').addEventListener('submit', function(e) {
    e.preventDefault();
    errorEl.textContent = '';
    if (!val('f_name')) return fail('What name should we ask for?');
    var phoneDigits = val('f_phone').replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return fail('Enter a mobile number so we can book your pickup.');
    if (val('f_email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('f_email'))) return fail('That email looks off. Fix it or leave it blank.');

    var payload = {
      year: val('f_year'),
      make: val('f_make'),
      model: val('f_model'),
      body_type: modelTypesByName[val('f_model').toLowerCase()] || null,
      km: val('f_km'),
      is_running: picked.running === 'yes',
      condition: picked.condition,
      has_keys: picked.keys === 'yes',
      city: val('f_city'),
      name: val('f_name'),
      email: val('f_email'),
      phone: val('f_phone'),
      notes: val('f_notes'),
      photos: photos,
      company: val('f_hp'),
      page: location.pathname,
      attribution: window.scAttribution || null,
      posthog_id: window.posthog && posthog.get_distinct_id ? posthog.get_distinct_id() : null
    };

    var animation = runValuing();
    var request = fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); });

    Promise.all([animation, request]).then(function(results) {
      var res = results[1];
      if (!res.ok) throw new Error(res.body && res.body.error);
      quote = res.body;
      document.getElementById('resultAmount').textContent = '$' + res.body.offer;
      document.getElementById('resultVehicle').textContent =
        payload.year + ' ' + payload.make + ' ' + payload.model + (payload.km ? ' · ' + Number(payload.km).toLocaleString('en-CA') + ' km' : '');
      // GA4 event: mark as a key event in GA4, import into Google Ads as secondary.
      if (typeof gtag === 'function') {
        gtag('event', 'quote_generated', { value: res.body.offer, currency: 'CAD' });
      }
      if (window.posthog) {
        posthog.capture('quote_generated', {
          offer: res.body.offer, year: payload.year, make: payload.make,
          model: payload.model, km: payload.km, is_running: payload.is_running,
          rust: payload.condition, city: payload.city
        });
      }
      show('result');
    }).catch(function() {
      show('3');
      errorEl.textContent = "Couldn't price that one. Check the details and try again.";
    });
  });

  document.getElementById('acceptBtn').addEventListener('click', function() {
    if (!quote) return;
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Locking it in…';

    fetch('/api/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: quote.id })
    }).then(function(r) {
      if (!r.ok) throw new Error('accept failed');
      return r.json();
    }).then(function() {
      // GA4 event: mark as a key event in GA4, import into Google Ads as a conversion.
      if (typeof gtag === 'function') {
        gtag('event', 'offer_accepted', { value: quote.offer, currency: 'CAD' });
      }
      if (window.posthog) {
        posthog.capture('offer_accepted', { offer: quote.offer, id: quote.id });
      }
      document.getElementById('doneAmount').textContent = '$' + quote.offer;
      show('done');

      var seconds = 60 * 60;
      var el = document.getElementById('countdown');
      if (el) (function tickDown() {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
        if (seconds > 0) { seconds--; setTimeout(tickDown, 1000); }
      })();
    }).catch(function() {
      btn.disabled = false;
      btn.textContent = 'Accept My Offer';
      document.getElementById('acceptError').textContent = "That didn't go through. Try again.";
    });
  });
})();
