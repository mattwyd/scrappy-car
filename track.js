// Site-wide tracking for scrappycar.ca: PostHog, first/last-touch attribution,
// channel detection, and phone-tap context. Loaded on every page with `defer`.
// Existing Google Ads / GA4 phone conversions stay inline on each page; this
// file only adds to them.
(function () {
  var POSTHOG_KEY = 'phc_yRmsDYETa67YfsnAw3yg8zLsuoqrrBrGbRMehHjNNQcF';
  var POSTHOG_HOST = 'https://us.i.posthog.com';
  var BRAND = 'scrappycar';
  var ATTR_KEY = 'sc_attr';
  var TOUCH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'];
  var UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var AI_REFERRERS = /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai|you\.com|meta\.ai)$/;
  var SEARCH_REFERRERS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|search\.brave\.com)$/;
  var SOCIAL_REFERRERS = /(^|\.)(facebook\.com|instagram\.com|tiktok\.com|youtube\.com|reddit\.com|x\.com|t\.co|nextdoor\.com)$/;

  function store(fn) {
    try { return fn(window.localStorage); } catch (e) { return null; }
  }

  function readAttr() {
    var raw = store(function (s) { return s.getItem(ATTR_KEY); });
    try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
  }

  function referrerHost() {
    try {
      var host = document.referrer ? new URL(document.referrer).hostname : '';
      return host === location.hostname ? '' : host;
    } catch (e) { return ''; }
  }

  // Order matters: a paid click id beats everything, then explicit UTMs, then referrer.
  function channelFor(t) {
    if (t.gclid || t.gbraid || t.wbraid) return 'google_ads';
    if (t.fbclid) return 'meta';
    if (t.msclkid) return 'microsoft_ads';
    var src = (t.utm_source || '').toLowerCase();
    var med = (t.utm_medium || '').toLowerCase();
    if (src === 'google' && (t.utm_campaign || '').toLowerCase() === 'gbp') return 'gbp';
    if (/chatgpt|openai|perplexity|gemini|copilot|claude/.test(src)) return 'ai_assistant';
    if (med === 'social') return 'social';
    if (med === 'partner') return 'partner';
    if (med === 'cpc' || med === 'paid') return 'paid_other';
    var ref = t.referrer_host || '';
    if (AI_REFERRERS.test(ref)) return 'ai_assistant';
    if (SEARCH_REFERRERS.test(ref)) return 'organic';
    if (SOCIAL_REFERRERS.test(ref)) return 'social';
    if (ref) return 'referral';
    return 'direct';
  }

  // Capture this visit's touch. First touch is kept for 90 days; last touch is
  // overwritten whenever a visit arrives with a source (not on internal nav).
  var params = new URLSearchParams(location.search);
  var touch = { landing_page: location.pathname, referrer_host: referrerHost(), ts: Date.now() };
  var hasSource = !!touch.referrer_host;
  CLICK_IDS.concat(UTMS).forEach(function (k) {
    var v = params.get(k);
    if (v) { touch[k] = v.slice(0, 200); hasSource = true; }
  });
  touch.channel = channelFor(touch);

  var attr = readAttr();
  if (!attr.first || Date.now() - attr.first.ts > TOUCH_TTL_MS) attr.first = touch;
  if (hasSource || !attr.last) attr.last = touch;
  store(function (s) { s.setItem(ATTR_KEY, JSON.stringify(attr)); });
  window.scAttribution = attr;

  var area = (location.pathname.match(/^\/junk-cars\/([a-z-]+)/) || [])[1] || null;

  // PostHog snippet (official loader, unchanged).
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    session_recording: { maskAllInputs: true },
  });

  // Super properties ride along on every event. Never the raw gclid: only
  // whether one was present, so PostHog holds no ad-click identifiers.
  posthog.register({
    brand: BRAND,
    env: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'dev' : 'prod',
    page_area: area,
    channel: attr.last.channel,
    first_channel: attr.first.channel,
    referrer_host: attr.last.referrer_host || null,
    first_referrer_host: attr.first.referrer_host || null,
    utm_source: attr.last.utm_source || null,
    utm_campaign: attr.last.utm_campaign || null,
    gclid_present: !!(attr.last.gclid || attr.last.gbraid || attr.last.wbraid),
  });

  // Where on the page the tap happened, so we learn which CTA earns calls.
  function placementOf(el) {
    if (el.closest('nav')) return 'nav';
    if (el.closest('.hero')) return 'hero';
    if (el.closest('footer')) return 'footer';
    if (el.classList.contains('phone-big')) return 'cta_band';
    if (el.closest('.faq-body, .faq-item')) return 'faq';
    var section = el.closest('section');
    return section && section.id ? section.id : 'body';
  }

  document.addEventListener('click', function (e) {
    var tel = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (tel) {
      posthog.capture('phone_click', { placement: placementOf(tel), number: tel.getAttribute('href').slice(4) });
      return;
    }
    // FAQs are <details>; the click lands before the toggle, so !open means "opening".
    var summary = e.target.closest && e.target.closest('details > summary');
    if (summary && !summary.parentElement.open) {
      posthog.capture('faq_opened', { question: summary.textContent.replace(/\+\s*$/, '').trim().slice(0, 120) });
    }
  }, true);

  if (area) posthog.capture('area_page_viewed', { area: area });
})();
