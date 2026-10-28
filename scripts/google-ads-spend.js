// Google Ads script: sends daily ad spend to the Scrappy Car books.
//
// Set up once in Google Ads: Tools > Bulk actions > Scripts > + New script.
// Paste this in, put the books key in BOOKS_KEY (it's the part after "#k="
// in the Books link), Authorize, Run once to check, then set Frequency to
// Daily. It resends the last 7 days each time, so a missed day fills itself in.

var BOOKS_KEY = 'PASTE_BOOKS_KEY_HERE';
var ENDPOINT = 'https://scrappycar.ca/api/books';

function main() {
  var rows = AdsApp.report(
    'SELECT segments.date, metrics.cost_micros FROM customer WHERE segments.date DURING LAST_7_DAYS'
  ).rows();
  var days = [];
  while (rows.hasNext()) {
    var r = rows.next();
    days.push({ date: r['segments.date'], cost: Number(r['metrics.cost_micros']) / 1e6 });
  }
  var res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Books-Key': BOOKS_KEY },
    payload: JSON.stringify({ type: 'ad_spend', days: days }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
