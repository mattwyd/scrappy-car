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

  // Engagement state for PostHog: where people start, which field they were on
  // when they left, and what happened once they saw an offer.
  var currentPane = '1';
  var started = false;
  var startedAt = 0;
  var submitted = false;
  var lastField = null;
  var doneFields = {};
  var touchedFields = {};
  var stepStartedAt = 0;
  var away = false;      // tab hidden or closing since the last time it was visible
  var offerLeft = false; // the offer was marked abandoned by leaving, not by a decision
  var offerShownAt = 0;
  var offerResolved = false;
  var offerTimer = null;
  var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

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

  function track(event, props, beacon) {
    if (!window.posthog) return;
    // sendBeacon survives the page closing, which is exactly when abandon events fire.
    posthog.capture(event, props || {}, beacon ? { transport: 'sendBeacon' } : undefined);
  }

  function buzz(pattern) {
    if (!reduceMotion && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  // ---- Progress meter and per-field check marks ----
  // Year and odometer start filled in with defaults, so they don't count toward
  // progress (the meter starts at 0%) and only get a check mark once changed.
  var PREFILLED = { year: true, km: true };
  var REQUIRED = ['make', 'model', 'running', 'condition', 'keys', 'name', 'city', 'phone'];
  var STEP_FIELDS = { '1': ['year', 'make', 'model'], '2': ['running', 'condition', 'keys'], '3': ['name', 'city', 'phone'] };
  var progFill = document.getElementById('cprogFill');
  var progLabel = document.getElementById('cprogLabel');
  var cheerEl = document.getElementById('calcCheer');

  function fieldStatus() {
    var phone = val('f_phone').replace(/\D/g, '');
    var email = val('f_email');
    return {
      year: !!val('f_year'),
      make: !!val('f_make'),
      model: !!val('f_model'),
      km: !!val('f_km'),
      running: !!picked.running,
      condition: !!picked.condition,
      keys: !!picked.keys,
      photos: photos.length > 0,
      name: val('f_name').length >= 1,
      city: !!val('f_city'),
      phone: phone.length >= 10 && phone.length <= 11,
      email: !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      notes: !!val('f_notes'),
    };
  }

  function percentDone(st) {
    return Math.round(REQUIRED.filter(function(f) { return st[f]; }).length / REQUIRED.length * 100);
  }

  function celebrate(el) {
    if (!el || reduceMotion) return;
    el.classList.remove('pop');
    void el.offsetWidth; // restart the animation
    el.classList.add('pop');
  }

  function refresh() {
    var st = fieldStatus();
    Object.keys(st).forEach(function(f) {
      var el = calc.querySelector('.field[data-field="' + f + '"]');
      if (el) el.classList.toggle('done', st[f] && (!PREFILLED[f] || !!touchedFields[f]));
      if (st[f] && !doneFields[f]) {
        doneFields[f] = true;
        // Defaults that were filled before anyone touched the form don't count.
        if (started) {
          celebrate(el);
          buzz(8);
          track('form_field_completed', { field: f, step: currentPane });
        }
      }
    });
    var pct = percentDone(st);
    if (progFill) progFill.style.width = pct + '%';
    if (progLabel) progLabel.textContent = pct >= 100 ? 'Ready to calculate' : pct === 0 ? "Let's get started" : pct + '% to your offer';
    Object.keys(STEP_FIELDS).forEach(function(step) {
      var btn = calc.querySelector('.cpane[data-pane="' + step + '"] .btn-primary');
      if (btn) btn.classList.toggle('ready', STEP_FIELDS[step].every(function(f) { return st[f]; }));
    });
  }

  var refreshQueued = false;
  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function() { refreshQueued = false; refresh(); });
  }

  function fieldOf(target) {
    var f = target && target.closest && target.closest('.field[data-field]');
    return f ? f.getAttribute('data-field') : null;
  }

  function markStarted(field) {
    if (started) return;
    started = true;
    startedAt = Date.now();
    stepStartedAt = startedAt;
    track('form_started', { placement: location.pathname === '/' ? 'home' : location.pathname, first_field: field });
    // Step 1 is on screen from page load, so its funnel step is logged on first touch.
    track('form_step', { step: currentPane });
  }

  // One set of capture-phase listeners sees every field, including the custom
  // comboboxes and pill buttons, without touching each widget's own handlers.
  ['pointerdown', 'focusin', 'input', 'change'].forEach(function(type) {
    calc.addEventListener(type, function(e) {
      if (!e.target.closest || !e.target.closest('#calcForm')) return;
      var f = fieldOf(e.target);
      markStarted(f);
      if (!f) return;
      lastField = f;
      // First touch of each question. Touched but never completed is where people stall.
      if (!touchedFields[f]) {
        touchedFields[f] = true;
        track('form_field_touched', { field: f, step: currentPane });
      }
    }, true);
  });
  ['click', 'input', 'change', 'focusout', 'mousedown', 'keyup'].forEach(function(type) {
    calc.addEventListener(type, scheduleRefresh);
  });

  // ---- Confetti and the offer count-up ----
  function confetti(power) {
    if (reduceMotion) return;
    var rect = calc.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var canvas = document.createElement('canvas');
    canvas.className = 'cconfetti';
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    calc.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    var colors = ['#39d353', '#6ee787', '#27a83e', '#ffffff', '#facc15'];
    var parts = [];
    for (var i = 0; i < Math.round(70 * power); i++) {
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
      var speed = 5 + Math.random() * 7 * power;
      parts.push({
        x: rect.width / 2, y: rect.height * 0.32,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
        w: 6 + Math.random() * 5, h: 3 + Math.random() * 4, c: colors[i % colors.length],
      });
    }
    var t0 = performance.now();
    var LIFE = 1700;
    (function frame(t) {
      var age = t - t0;
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.globalAlpha = Math.max(0, 1 - age / LIFE);
      parts.forEach(function(p) {
        p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (age < LIFE) requestAnimationFrame(frame);
      else canvas.remove();
    })(t0);
  }

  function countUp(el, to) {
    if (reduceMotion) { el.textContent = '$' + to; return; }
    var t0 = performance.now();
    var DUR = 950;
    (function tick(t) {
      var p = Math.min(1, (t - t0) / DUR);
      el.textContent = '$' + Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

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

  // "Use my location": pick the nearest service area to the phone's position.
  // Matching happens here in the browser, so coordinates never leave the device;
  // only the area name goes into the form. Centres are approximate.
  var AREA_CENTRES = [
    ['Port Union', 43.785, -79.140], ['West Rouge', 43.796, -79.123], ['Rouge Hill', 43.781, -79.131],
    ['Highland Creek', 43.786, -79.178], ['Morningside', 43.782, -79.205], ['Guildwood', 43.749, -79.198],
    ['Malvern', 43.807, -79.222], ['Agincourt', 43.785, -79.278], ['Scarborough', 43.773, -79.258],
    ['Cliffside', 43.707, -79.244], ['Birch Cliff', 43.693, -79.265], ['Wexford', 43.745, -79.295],
    ["L'Amoreaux", 43.799, -79.306], ['Steeles', 43.815, -79.315], ['The Beaches', 43.671, -79.296],
    ['Danforth', 43.680, -79.340], ['East York', 43.691, -79.327], ['Leaside', 43.707, -79.367],
    ['Don Mills', 43.745, -79.346], ['North York', 43.762, -79.411], ['Toronto', 43.653, -79.383],
    ['Pickering', 43.838, -79.087], ['Ajax', 43.851, -79.020], ['Whitby', 43.898, -78.943],
    ['Oshawa', 43.897, -78.866], ['Courtice', 43.905, -78.790], ['Bowmanville', 43.913, -78.688],
    ['Uxbridge', 44.109, -79.121], ['Markham', 43.856, -79.337], ['Unionville', 43.868, -79.312],
    ['Stouffville', 43.971, -79.244], ['Richmond Hill', 43.883, -79.440], ['Thornhill', 43.815, -79.424],
    ['Vaughan', 43.836, -79.498],
  ];
  var NEAR_KM = 12;

  function kmBetween(lat1, lon1, lat2, lon2) {
    var rad = Math.PI / 180;
    var a = Math.pow(Math.sin((lat2 - lat1) * rad / 2), 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin((lon2 - lon1) * rad / 2), 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  (function locationButton() {
    var btn = document.getElementById('locBtn');
    var text = document.getElementById('locBtnText');
    var hint = document.getElementById('locHint');
    var cityInput = document.getElementById('f_city');
    if (!btn) return;
    function done(msg, result, area) {
      hint.textContent = msg;
      btn.disabled = false;
      text.textContent = 'Use my location';
      track('location_autofill', { result: result, area: area || null });
    }
    btn.addEventListener('click', function() {
      if (!navigator.geolocation) return done("Location isn't available here. Type your area instead.", 'unsupported');
      btn.disabled = true;
      text.textContent = 'Finding you…';
      hint.textContent = '';
      navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        var best = null, bestKm = Infinity;
        AREA_CENTRES.forEach(function(a) {
          var d = kmBetween(lat, lon, a[1], a[2]);
          if (d < bestKm) { bestKm = d; best = a[0]; }
        });
        if (bestKm <= NEAR_KM) {
          cityInput.value = best;
          scheduleRefresh();
          done('Filled in from your location. Not quite right? Just type over it.', 'filled', best);
        } else {
          done("You look to be outside our usual area. Type your town and we'll confirm we can get there.", 'outside_area', best);
        }
      }, function(err) {
        done(err && err.code === 1 ? 'No problem. Just type your area instead.' : "Couldn't get your location. Type your area instead.",
          err && err.code === 1 ? 'denied' : 'unavailable');
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 });
    });
  })();

  // v=3: the make list was trimmed; the bump skips the week-long CDN cache.
  fetch('/api/vehicles?makes=1&v=3')
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
        celebrate(btn);
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
      if (photos.length) track('photo_uploaded', { count: photos.length });
      scheduleRefresh();
    });
  });

  // Keep the card on screen. Leaving step 3 swaps a tall form for a short card,
  // so on a phone the page used to end up below it (and the Accept button out of
  // view). Check after layout, and again once the on-screen keyboard has closed.
  function keepCardInView() {
    function check() {
      var top = calc.getBoundingClientRect().top;
      if (top < 60 || top > window.innerHeight * 0.6) {
        window.scrollTo({ top: window.scrollY + top - 76, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
    requestAnimationFrame(check);
    setTimeout(check, 350);
  }

  var CHEERS = {
    '1': function() { return 'Takes about a minute. Free towing is always included.'; },
    '2': function() {
      var v = [val('f_year'), val('f_make'), val('f_model')].filter(Boolean).join(' ');
      return v ? 'Nice. ' + v + ' locked in. Three quick taps about its condition.' : 'Three quick taps about its condition.';
    },
    '3': function() { return 'Last step. Where should we send the tow truck?'; },
  };

  function show(pane) {
    var prev = currentPane;
    currentPane = pane;
    stepStartedAt = Date.now();
    calc.querySelectorAll('.cpane').forEach(function(p) { p.classList.remove('on'); });
    var target = calc.querySelector('[data-pane="' + pane + '"]');
    if (target) target.classList.add('on');
    track('form_step', { step: pane });
    var form = document.getElementById('calcForm');
    var numeric = pane === '1' || pane === '2' || pane === '3';
    form.style.display = numeric ? '' : 'none';
    calc.querySelector('#calcSteps').style.display = numeric ? '' : 'none';
    var prog = document.getElementById('calcProg');
    if (prog) prog.style.display = numeric ? '' : 'none';
    if (cheerEl) {
      cheerEl.style.display = numeric ? '' : 'none';
      if (numeric) cheerEl.textContent = CHEERS[pane]();
    }
    calc.querySelectorAll('.cstep').forEach(function(s) {
      var n = s.getAttribute('data-step');
      var done = numeric && Number(n) < Number(pane);
      s.classList.toggle('on', n === pane);
      s.classList.toggle('done', done);
      var badge = s.querySelector('i');
      if (badge) badge.textContent = done ? '✓' : n;
      if (done && Number(n) === Number(prev) && Number(pane) > Number(prev)) celebrate(s);
    });
    if (numeric && Number(pane) > Number(prev)) buzz(14);
    // Close the phone keyboard before measuring, or the measurement is off.
    if (!numeric && document.activeElement && document.activeElement.blur) document.activeElement.blur();
    keepCardInView();
  }

  function fail(msg, field) {
    errorEl.textContent = msg;
    track('form_error', { step: currentPane, field: field || null, error: msg });
    var el = field && calc.querySelector('.field[data-field="' + field + '"]');
    if (el && !reduceMotion) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    return false;
  }

  function validate(step) {
    errorEl.textContent = '';
    if (step === '2') {
      if (!val('f_year')) return fail('Pick the model year.', 'year');
      if (!val('f_make')) return fail('Which make is it?', 'make');
      if (!val('f_model')) return fail('Which model is it?', 'model');
    }
    if (step === '3') {
      if (!picked.running) return fail('Let us know if it starts and drives.', 'running');
      if (!picked.condition) return fail('Pick the overall condition.', 'condition');
      if (!picked.keys) return fail('Let us know about keys and ownership.', 'keys');
    }
    return true;
  }

  calc.querySelectorAll('.calc-next').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var next = btn.getAttribute('data-next');
      refresh(); // credit fields finished just now to this step, not the next one
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
    if (!val('f_name')) return fail('What name should we ask for?', 'name');
    var phoneDigits = val('f_phone').replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return fail('Enter a mobile number so we can book your pickup.', 'phone');
    if (val('f_email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('f_email'))) return fail('That email looks off. Fix it or leave it blank.', 'email');
    submitted = true;

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
      document.getElementById('resultVehicle').textContent =
        payload.year + ' ' + payload.make + ' ' + payload.model + (payload.km ? ' · ' + Number(payload.km).toLocaleString('en-CA') + ' km' : '');
      // Record the lead in Google Ads and retain the GA4 event for analytics.
      if (typeof gtag === 'function') {
        // Enhanced conversions for leads: the tag hashes these before sending, so a
        // later "Picked up" deal can be matched to the ad click without the gclid.
        gtag('set', 'user_data', {
          phone_number: phoneDigits.length === 10 ? '+1' + phoneDigits : '+' + phoneDigits,
          email: payload.email || undefined
        });
        gtag('event', 'conversion', {
          send_to: 'AW-18023473103/RSPpCIiElaYdEM-_oZJD',
          value: res.body.offer,
          currency: 'CAD'
        });
        gtag('event', 'quote_generated', { value: res.body.offer, currency: 'CAD', send_to: 'G-Y42H4S5V5G' });
      }
      if (window.posthog) {
        posthog.capture('quote_generated', {
          offer: res.body.offer, year: payload.year, make: payload.make,
          model: payload.model, km: payload.km, is_running: payload.is_running,
          rust: payload.condition, city: payload.city
        });
      }
      show('result');
      countUp(document.getElementById('resultAmount'), res.body.offer);
      setTimeout(function() { confetti(1); buzz([12, 50, 18]); }, reduceMotion ? 0 : 650);
      offerShownAt = Date.now();
      offerResolved = false;
      // Ten minutes on the offer screen without a decision counts as walking away.
      offerTimer = setTimeout(function() { resolveOffer('offer_abandoned', { reason: 'no_decision_10m' }); }, 10 * 60 * 1000);
    }).catch(function() {
      submitted = false;
      show('3');
      errorEl.textContent = "Couldn't price that one. Check the details and try again.";
    });
  });

  // Exactly one outcome per offer shown: accepted, declined, or abandoned.
  function resolveOffer(event, props, beacon) {
    if (!offerShownAt || offerResolved) return;
    offerResolved = true;
    clearTimeout(offerTimer);
    var base = { offer: quote && quote.offer, seconds_on_offer: Math.round((Date.now() - offerShownAt) / 1000) };
    Object.keys(props || {}).forEach(function(k) { base[k] = props[k]; });
    track(event, base, beacon);
  }

  document.getElementById('declineToggle').addEventListener('click', function() {
    this.hidden = true;
    document.getElementById('declinePanel').hidden = false;
    track('offer_decline_opened', { offer: quote && quote.offer });
  });
  document.querySelectorAll('#declinePanel .pill').forEach(function(btn) {
    btn.addEventListener('click', function() {
      btn.classList.add('on');
      resolveOffer('offer_declined', { reason: btn.getAttribute('data-reason') });
      document.getElementById('declinePanel').hidden = true;
      document.getElementById('declineThanks').hidden = false;
    });
  });

  // Leaving mid-form or walking away from an offer. On phones the page going
  // hidden is the last event you can count on (switching apps or swiping the
  // tab away often never fires pagehide), so that is the main signal. Hidden
  // also fires when someone checks a text and comes back, so returning sends
  // form_resumed / offer_resumed: an abandon with no resume after it is a real one.
  function leaveSnapshot(how) {
    var st = fieldStatus();
    var stepFields = STEP_FIELDS[currentPane] || [];
    var now = Date.now();
    return {
      how: how,
      step: currentPane,
      last_field: lastField,
      last_field_done: !!(lastField && st[lastField]),
      step_missing: stepFields.filter(function(f) { return !st[f]; }).join(',') || null,
      fields_done: Object.keys(st).filter(function(f) { return st[f]; }).join(','),
      percent: percentDone(st),
      seconds_in_form: Math.round((now - startedAt) / 1000),
      seconds_on_step: Math.round((now - stepStartedAt) / 1000),
    };
  }

  function onLeave(how) {
    if (away) return;
    away = true;
    if (started && !submitted) track('form_abandoned', leaveSnapshot(how), true);
    if (offerShownAt && !offerResolved) {
      resolveOffer('offer_abandoned', { reason: 'left_page', how: how }, true);
      offerLeft = true;
    }
  }

  function onReturn() {
    if (!away) return;
    away = false;
    if (started && !submitted) track('form_resumed', { step: currentPane, last_field: lastField });
    if (offerLeft) {
      // Back on the offer screen: a later accept or decline should still count.
      offerLeft = false;
      offerResolved = false;
      track('offer_resumed', { offer: quote && quote.offer });
      offerTimer = setTimeout(function() { resolveOffer('offer_abandoned', { reason: 'no_decision_10m' }); }, 10 * 60 * 1000);
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') onLeave('hidden');
    else onReturn();
  });
  window.addEventListener('pagehide', function() { onLeave('closed'); });
  window.addEventListener('pageshow', function(e) { if (e.persisted) onReturn(); });

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
        gtag('event', 'offer_accepted', { value: quote.offer, currency: 'CAD', send_to: 'G-Y42H4S5V5G' });
      }
      // Accepting always counts, even after "Not ready yet?" or the 10-minute timeout.
      offerResolved = false;
      resolveOffer('offer_accepted', { id: quote.id });
      document.getElementById('doneAmount').textContent = '$' + quote.offer;
      show('done');
      setTimeout(function() { confetti(1.6); buzz([20, 60, 20, 60, 30]); }, reduceMotion ? 0 : 120);

      var seconds = 60 * 60;
      var el = document.getElementById('countdown');
      if (el) (function tickDown() {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
        if (seconds > 0) { seconds--; setTimeout(tickDown, 1000); }
      })();
    }).catch(function() {
      track('offer_accept_failed', { offer: quote.offer, id: quote.id });
      btn.disabled = false;
      btn.textContent = 'Accept My Offer';
      document.getElementById('acceptError').textContent = "That didn't go through. Try again.";
    });
  });

  refresh();
})();
