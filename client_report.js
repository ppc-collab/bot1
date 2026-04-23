/*
  Google Ads MCC — Client Daily Report
  Sends a clean daily summary to client Telegram chats (English)

  Spreadsheet (sheet "Clients"):
    A: Account ID | B: Chat ID

  Schedule: once daily (recommended 9–10 AM)
  Author: based on script https://t.me/nikitenkoa
*/

var config = {
  spreadsheet_url: 'https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit',
  clientsSheetName: 'Clients',
  botToken: 'YOUR_BOT_TOKEN',
  testMode: false
};

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

function main() {
  var ss    = SpreadsheetApp.openByUrl(config.spreadsheet_url);
  var sheet = ss.getSheetByName(config.clientsSheetName);
  if (!sheet) {
    Logger.log('❌ Sheet "' + config.clientsSheetName + '" not found. Check the sheet name in config.');
    return;
  }
  var rows  = sheet.getRange('A2:B').getValues().filter(function(r) { return r[0] !== ''; });

  rows.forEach(function(row) {
    var accountId = String(row[0]);
    var chatId    = String(row[1]);

    if (!chatId) {
      Logger.log('No ChatId for account: ' + accountId);
      return;
    }

    var account = findAccountRecursively(accountId);
    if (!account) {
      Logger.log('Account not found: ' + accountId);
      return;
    }

    MccApp.select(account);

    try {
      var message = buildClientReport();
      if (config.testMode) {
        Logger.log('=== CLIENT REPORT FOR ' + accountId + ' ===\n' + message);
      } else {
        sendTelegramMessage(chatId, message);
      }
    } catch (e) {
      Logger.log('Error for account ' + accountId + ': ' + e.message);
    }
  });
}

// ─── REPORT BUILDER ───────────────────────────────────────────────────────────

function buildClientReport() {
  var acc  = AdsApp.currentAccount();
  var name = acc.getName();
  var curr = acc.getCurrencyCode();
  var tz   = acc.getTimeZone();
  var sym  = curr === 'UAH' ? '₴' : curr;

  var today    = new Date();
  var yestDate = new Date(today); yestDate.setDate(today.getDate() - 1);
  var l7Start  = new Date(today); l7Start.setDate(today.getDate() - 7);

  var yestStr = fmtDate(yestDate, tz);
  var yest    = getStats(yestStr, yestStr);
  var l7Cost  = getL7Cost(fmtDate(l7Start, tz), yestStr);

  var budget   = getAccountBudgetRemaining();
  var avgDaily = l7Cost / 7;
  var daysLeft = (budget !== null && avgDaily > 0) ? Math.floor(budget / avgDaily) : null;

  var d = yestDate;
  var dateStr = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();

  var LINE_WIDTH = 24;

  var msg = '';
  msg += '📊 <b>' + escapeHtml(name) + '</b>\n';
  msg += 'Daily Report · ' + dateStr + '\n\n';
  msg += '<pre>';
  msg += row('Impressions', fmtInt(yest.impressions),         LINE_WIDTH);
  msg += row('Clicks',      fmtInt(yest.clicks),              LINE_WIDTH);
  msg += row('CTR',         fmtPct(yest.ctr) + '%',           LINE_WIDTH);
  msg += row('CPC',         sym + fmtMoney(yest.avgCpc),      LINE_WIDTH);
  msg += row('Cost',        sym + fmtMoneyInt(yest.cost),     LINE_WIDTH);
  if (yest.conversions > 0) {
    msg += row('Conversions', fmtDec(yest.conversions),       LINE_WIDTH);
  }
  msg += '</pre>';

  if (budget !== null) {
    msg += '\n💰 Budget left: ' + sym + fmtMoneyInt(budget);
    if (daysLeft !== null) {
      msg += ' (~' + daysLeft + ' days at current pace)';
    }
    msg += '\n';
  }

  return msg;
}

// ─── ROW FORMATTER ────────────────────────────────────────────────────────────

// Right-aligns value within a fixed total line width
function row(label, value, width) {
  var spaces = width - label.length - value.length;
  return label + repeat(' ', Math.max(2, spaces)) + value + '\n';
}

function repeat(char, n) {
  var s = '';
  for (var i = 0; i < n; i++) s += char;
  return s;
}

// ─── STATS FETCHING ───────────────────────────────────────────────────────────

function getStats(startDate, endDate) {
  var q = 'SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions '
    + 'FROM campaign '
    + "WHERE segments.date BETWEEN '" + startDate + "' AND '" + endDate + "'"
    + ' AND campaign.status != "REMOVED"';

  var t = { cost: 0, clicks: 0, impressions: 0, conversions: 0 };
  try {
    var report = AdsApp.search(q);
    while (report.hasNext()) {
      var r = report.next();
      t.cost        += (r.metrics.costMicros    || 0) / 1e6;
      t.clicks      += parseInt(r.metrics.clicks      || 0);
      t.impressions += parseInt(r.metrics.impressions || 0);
      t.conversions += parseFloat(r.metrics.conversions || 0);
    }
  } catch (e) {
    Logger.log('Stats query error: ' + e.message);
  }
  t.ctr    = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  t.avgCpc = t.clicks      > 0 ? t.cost / t.clicks               : 0;
  return t;
}

// Separate light query just for 7-day cost (for avg daily spend)
function getL7Cost(startDate, endDate) {
  var q = 'SELECT metrics.cost_micros FROM campaign '
    + "WHERE segments.date BETWEEN '" + startDate + "' AND '" + endDate + "'"
    + ' AND campaign.status != "REMOVED"';
  var total = 0;
  try {
    var report = AdsApp.search(q);
    while (report.hasNext()) {
      total += (report.next().metrics.costMicros || 0) / 1e6;
    }
  } catch (e) {
    Logger.log('L7 cost query error: ' + e.message);
  }
  return total;
}

function getAccountBudgetRemaining() {
  var q = 'SELECT account_budget.adjusted_spending_limit_micros, '
    + 'account_budget.amount_served_micros '
    + 'FROM account_budget '
    + "WHERE account_budget.status = 'APPROVED'";
  try {
    var report = AdsApp.search(q);
    if (report.hasNext()) {
      var r     = report.next();
      var limit = r.accountBudget.adjustedSpendingLimitMicros;
      if (!limit || limit > 1e15) return null; // UNLIMITED
      return (limit - r.accountBudget.amountServedMicros) / 1e6;
    }
  } catch (e) {
    Logger.log('Budget query error: ' + e.message);
  }
  return null;
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────

function fmtInt(val) {
  return parseInt(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtMoney(val) {
  return (parseFloat(val) || 0).toFixed(2);
}

// Comma-formatted with 2 decimal places: 9,321.12
function fmtMoneyInt(val) {
  var n = parseFloat(val) || 0;
  var parts = n.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function fmtPct(val) {
  return (parseFloat(val) || 0).toFixed(2);
}

function fmtDec(val) {
  return (parseFloat(val) || 0).toFixed(1);
}

function fmtDate(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── TELEGRAM ─────────────────────────────────────────────────────────────────

function sendTelegramMessage(chatId, message) {
  var url     = 'https://api.telegram.org/bot' + config.botToken + '/sendMessage';
  var payload = { chat_id: chatId, text: message, parse_mode: 'HTML' };
  var options = { method: 'post', contentType: 'application/json',
                  payload: JSON.stringify(payload), muteHttpExceptions: true };

  var response = UrlFetchApp.fetch(url, options);
  var code     = response.getResponseCode();
  if (code === 200) return;

  var body = JSON.parse(response.getContentText());
  if (code === 400 && body.parameters && body.parameters.migrate_to_chat_id) {
    var newChatId = body.parameters.migrate_to_chat_id;
    Logger.log('⚠️ Chat migrated. Old ID: ' + chatId + ' → New ID: ' + newChatId + '. Update your spreadsheet!');
    payload.chat_id = newChatId;
    options.payload = JSON.stringify(payload);
    UrlFetchApp.fetch(url, options);
    return;
  }

  throw new Error('Telegram API ' + code + ': ' + response.getContentText());
}

// ─── ACCOUNT LOOKUP ───────────────────────────────────────────────────────────

function findAccountRecursively(accountId, mccApp) {
  mccApp = mccApp || MccApp;
  try {
    var iter = mccApp.accounts().withIds([accountId]).get();
    if (iter.hasNext()) return iter.next();

    var subMccIter = mccApp.accounts().withCondition('AccountCanManageClients = TRUE').get();
    while (subMccIter.hasNext()) {
      var subMcc = subMccIter.next();
      mccApp.select(subMcc);
      var found = findAccountRecursively(accountId, MccApp);
      if (found) return found;
      mccApp = MccApp;
    }
  } catch (e) {
    Logger.log('Account not found under this MCC: ' + e.message);
  }
  return null;
}

// ─── TEST FUNCTIONS ───────────────────────────────────────────────────────────

function testTelegram() {
  var CHAT_ID = 'YOUR_CHAT_ID';
  sendTelegramMessage(CHAT_ID, '✅ Telegram connection works!');
}

function testReport() {
  var ACCOUNT_ID = 'YOUR_ACCOUNT_ID'; // format: 123-456-7890
  var CHAT_ID    = 'YOUR_CHAT_ID';

  var account = findAccountRecursively(ACCOUNT_ID);
  if (!account) { Logger.log('❌ Account not found'); return; }

  MccApp.select(account);
  var message = buildClientReport();
  Logger.log(message);
  sendTelegramMessage(CHAT_ID, message);
}
