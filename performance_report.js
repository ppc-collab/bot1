/*
  Google Ads MCC — Щоденний звіт по ефективності рекламного кабінету
  Надсилає в Telegram щоденну зведену статистику з порівнянням по кожному акаунту

  Налаштування таблиці (скопіювати існуючу або створити нову):
    Лист "Accounts":
      A: Account ID
      B: Chat ID (Telegram)

  Встановити запуск скрипта раз на день (рекомендовано: 8–10 ранку)

  Автор: на основі скрипта https://t.me/nikitenkoa
*/

var config = {
  spreadsheet_url: 'https://docs.google.com/spreadsheets/d/1yeZSE5UdzrNtGKPXPgSjKevb8WKW3j8a7495caOWKiY/edit?gid=0#gid=0',
  accountsSheetName: 'Accounts',
  botToken: '8106252010:AAFVw6Df2txnIIL5gw7ch11KJ0wC9I3HhJ0',
  testMode: false
};

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

function main() {
  var ss = SpreadsheetApp.openByUrl(config.spreadsheet_url);
  var sheet = ss.getSheetByName(config.accountsSheetName);
  var rows = sheet.getRange('A2:B').getValues().filter(function(r) { return r[0] !== ''; });

  rows.forEach(function(row) {
    var accountId = String(row[0]);
    var chatId    = String(row[1]);

    if (!chatId) {
      Logger.log('Не вказано ChatId для акаунта: ' + accountId);
      return;
    }

    var account = findAccountRecursively(accountId);
    if (!account) {
      Logger.log('Акаунт не знайдено: ' + accountId);
      return;
    }

    MccApp.select(account);

    try {
      var message = buildDailyReport();
      if (config.testMode) {
        Logger.log('=== ЗВІТ ДЛЯ ' + accountId + ' ===\n' + message);
      } else {
        sendTelegramMessage(chatId, message);
      }
    } catch (e) {
      Logger.log('Помилка для акаунта ' + accountId + ': ' + e.message);
    }
  });
}

// ─── REPORT BUILDER ───────────────────────────────────────────────────────────

function buildDailyReport() {
  var acc  = AdsApp.currentAccount();
  var name = acc.getName();
  var curr = acc.getCurrencyCode();
  var tz   = acc.getTimeZone();

  var today   = new Date();
  var yestDate  = new Date(today); yestDate.setDate(today.getDate() - 1);
  var dbDate    = new Date(today); dbDate.setDate(today.getDate() - 2);
  var p7Start   = new Date(today); p7Start.setDate(today.getDate() - 14);
  var p7End     = new Date(today); p7End.setDate(today.getDate() - 8);

  var yestStr   = Utilities.formatDate(yestDate, tz, 'yyyy-MM-dd');
  var dbStr     = Utilities.formatDate(dbDate, tz, 'yyyy-MM-dd');
  var p7StartStr= Utilities.formatDate(p7Start, tz, 'yyyy-MM-dd');
  var p7EndStr  = Utilities.formatDate(p7End, tz, 'yyyy-MM-dd');

  var yest      = getStatsByRange(yestStr, yestStr);
  var dayBefore = getStatsByRange(dbStr, dbStr);
  var last7     = getStatsByPeriod('LAST_7_DAYS');
  var prev7     = getStatsByRange(p7StartStr, p7EndStr);
  var thisMonth = getStatsByPeriod('THIS_MONTH');
  var lastMonth = getStatsByPeriod('LAST_MONTH');

  var displayDate = Utilities.formatDate(yestDate, tz, 'dd.MM.yyyy');

  var msg = '';
  msg += '<b>📊 ' + escapeHtml(name) + '</b>\n';
  msg += '📅 Звіт за ' + displayDate + '\n';
  msg += '──────────────────\n\n';

  // Yesterday absolute stats
  msg += '<b>🗓 Вчора</b>\n';
  msg += statsBlock(yest, curr);

  // Day-over-day comparison
  msg += '\n<b>📈 Вчора vs Позавчора</b>\n';
  msg += comparisonBlock(yest, dayBefore, curr);

  // Week-over-week comparison
  msg += '\n<b>📆 Останні 7 днів vs Попередні 7</b>\n';
  msg += comparisonBlock(last7, prev7, curr);

  // Month comparison
  msg += '\n<b>🗓 Цей місяць vs Минулий</b>\n';
  msg += comparisonBlock(thisMonth, lastMonth, curr);

  // Conclusions
  msg += '\n<b>💡 Висновки</b>\n';
  msg += buildConclusions(yest, dayBefore, last7, prev7, thisMonth, lastMonth, curr);

  return msg;
}

// ─── STATS BLOCKS ─────────────────────────────────────────────────────────────

function statsBlock(s, curr) {
  var msg = '';
  msg += '💸 Витрати: <b>' + fmtMoney(s.cost) + ' ' + curr + '</b>\n';
  msg += '👁 Покази: <b>' + fmtInt(s.impressions) + '</b>\n';
  msg += '🖱 Кліки: <b>' + fmtInt(s.clicks) + '</b>\n';
  msg += '📊 CTR: <b>' + fmtPct(s.ctr) + '%</b>\n';
  msg += '💰 Сер. CPC: <b>' + fmtMoney(s.avgCpc) + ' ' + curr + '</b>\n';
  if (s.conversions > 0) {
    msg += '🎯 Конверсії: <b>' + fmtDec(s.conversions) + '</b>\n';
    msg += '💲 CPA: <b>' + fmtMoney(s.cpa) + ' ' + curr + '</b>\n';
  }
  return msg;
}

function comparisonBlock(curr, prev, currency) {
  var msg = '';

  msg += '💸 Витрати: ' + fmtChangeNeutral(curr.cost, prev.cost)
    + ' (' + fmtMoney(curr.cost) + ' vs ' + fmtMoney(prev.cost) + ' ' + currency + ')\n';

  msg += '🖱 Кліки: ' + fmtChangePositive(curr.clicks, prev.clicks)
    + ' (' + fmtInt(curr.clicks) + ' vs ' + fmtInt(prev.clicks) + ')\n';

  msg += '👁 Покази: ' + fmtChangePositive(curr.impressions, prev.impressions)
    + ' (' + fmtInt(curr.impressions) + ' vs ' + fmtInt(prev.impressions) + ')\n';

  msg += '📊 CTR: ' + fmtChangePositive(curr.ctr, prev.ctr)
    + ' (' + fmtPct(curr.ctr) + '% vs ' + fmtPct(prev.ctr) + '%)\n';

  // For CPC: lower is better → inverse direction
  msg += '💰 CPC: ' + fmtChangeInverse(curr.avgCpc, prev.avgCpc)
    + ' (' + fmtMoney(curr.avgCpc) + ' vs ' + fmtMoney(prev.avgCpc) + ' ' + currency + ')\n';

  if (curr.conversions > 0 || prev.conversions > 0) {
    msg += '🎯 Конверсії: ' + fmtChangePositive(curr.conversions, prev.conversions)
      + ' (' + fmtDec(curr.conversions) + ' vs ' + fmtDec(prev.conversions) + ')\n';
    if (curr.cpa > 0 || prev.cpa > 0) {
      msg += '💲 CPA: ' + fmtChangeInverse(curr.cpa, prev.cpa)
        + ' (' + fmtMoney(curr.cpa) + ' vs ' + fmtMoney(prev.cpa) + ' ' + currency + ')\n';
    }
  }

  return msg;
}

// ─── CONCLUSIONS ──────────────────────────────────────────────────────────────

function buildConclusions(yest, db, last7, prev7, thisMonth, lastMonth, currency) {
  var lines = [];

  var costDod   = pctChange(yest.cost, db.cost);
  var clicksDod = pctChange(yest.clicks, db.clicks);
  var ctrDod    = pctChange(yest.ctr, db.ctr);
  var cpcDod    = pctChange(yest.avgCpc, db.avgCpc);

  var costWow   = pctChange(last7.cost, prev7.cost);
  var clicksWow = pctChange(last7.clicks, prev7.clicks);
  var ctrWow    = pctChange(last7.ctr, prev7.ctr);
  var cpcWow    = pctChange(last7.avgCpc, prev7.avgCpc);

  // Day-over-day insights
  if (Math.abs(costDod) > 20) {
    lines.push(costDod > 0
      ? '⚠️ Витрати різко зросли вчора на ' + fmtAbs(costDod) + '% — перевірте ставки та бюджети'
      : '📉 Витрати впали на ' + fmtAbs(costDod) + '% — можливо, обмеження бюджету або зниження активності');
  }

  if (ctrDod > 10) {
    lines.push('✅ CTR покращився на ' + fmtAbs(ctrDod) + '% вчора — оголошення стають релевантнішими');
  } else if (ctrDod < -10) {
    lines.push('⚠️ CTR знизився на ' + fmtAbs(ctrDod) + '% вчора — варто переглянути тексти оголошень');
  }

  if (cpcDod < -10) {
    lines.push('✅ CPC знизився на ' + fmtAbs(cpcDod) + '% — вартість кліка стала ефективнішою');
  } else if (cpcDod > 15) {
    lines.push('⚠️ CPC зріс на ' + fmtAbs(cpcDod) + '% вчора — можливе посилення конкуренції');
  }

  // Week-over-week insights
  if (Math.abs(costWow) > 15) {
    lines.push(costWow > 0
      ? '📈 Тижневі витрати зросли на ' + fmtAbs(costWow) + '% vs попередній тиждень'
      : '📉 Тижневі витрати знизились на ' + fmtAbs(costWow) + '% vs попередній тиждень');
  }

  if (ctrWow > 5) {
    lines.push('✅ Тижневий CTR виріс на ' + fmtAbs(ctrWow) + '% — позитивна тенденція');
  } else if (ctrWow < -5) {
    lines.push('⚠️ Тижневий CTR впав на ' + fmtAbs(ctrWow) + '% — тренд погіршується');
  }

  if (cpcWow < -10) {
    lines.push('✅ Середній CPC за тиждень знизився на ' + fmtAbs(cpcWow) + '% — ефективність зростає');
  }

  // Month context
  var monthCostPct = lastMonth.cost > 0 ? (thisMonth.cost / lastMonth.cost * 100).toFixed(0) : 0;
  lines.push('🗓 Поточний місяць: витрачено <b>' + fmtMoney(thisMonth.cost) + ' ' + currency
    + '</b> (' + monthCostPct + '% від минулого місяця — ' + fmtMoney(lastMonth.cost) + ' ' + currency + ')');

  if (lines.length === 1) {
    lines.unshift('✅ Показники стабільні, значних змін не виявлено');
  }

  return lines.join('\n') + '\n';
}

// ─── STATS FETCHING ───────────────────────────────────────────────────────────

function getStatsByPeriod(dateRange) {
  var q = 'SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions '
    + 'FROM campaign '
    + 'WHERE segments.date DURING ' + dateRange
    + ' AND campaign.status != "REMOVED"';
  return runStatsQuery(q);
}

function getStatsByRange(startDate, endDate) {
  var q = 'SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions '
    + 'FROM campaign '
    + "WHERE segments.date BETWEEN '" + startDate + "' AND '" + endDate + "'"
    + ' AND campaign.status != "REMOVED"';
  return runStatsQuery(q);
}

function runStatsQuery(q) {
  var totals = { cost: 0, clicks: 0, impressions: 0, conversions: 0 };
  try {
    var report = AdsApp.search(q);
    while (report.hasNext()) {
      var r = report.next();
      totals.cost        += (r.metrics.costMicros    || 0) / 1e6;
      totals.clicks      += parseInt(r.metrics.clicks      || 0);
      totals.impressions += parseInt(r.metrics.impressions || 0);
      totals.conversions += parseFloat(r.metrics.conversions || 0);
    }
  } catch (e) {
    Logger.log('Помилка запиту статистики: ' + e.message + '\nЗапит: ' + q);
  }
  totals.ctr    = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.avgCpc = totals.clicks      > 0 ? totals.cost / totals.clicks               : 0;
  totals.cpa    = totals.conversions > 0 ? totals.cost / totals.conversions           : 0;
  return totals;
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────

function pctChange(curr, prev) {
  if (!prev || prev === 0) return 0;
  return ((curr - prev) / prev) * 100;
}

function fmtAbs(val) {
  return Math.abs(val).toFixed(1);
}

// Neutral arrow (up/down without good/bad coloring)
function fmtChangeNeutral(curr, prev) {
  var pct = pctChange(curr, prev);
  var arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '→');
  return arrow + ' ' + (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
}

// Positive: up = good (✅), down = bad (⚠️)
function fmtChangePositive(curr, prev) {
  var pct = pctChange(curr, prev);
  if (Math.abs(pct) < 1) return '→ 0.0%';
  return pct > 0
    ? '✅▲ +' + pct.toFixed(1) + '%'
    : '⚠️▼ ' + pct.toFixed(1) + '%';
}

// Inverse: down = good (✅), up = bad (⚠️)
function fmtChangeInverse(curr, prev) {
  var pct = pctChange(curr, prev);
  if (Math.abs(pct) < 1) return '→ 0.0%';
  return pct < 0
    ? '✅▼ ' + pct.toFixed(1) + '%'
    : '⚠️▲ +' + pct.toFixed(1) + '%';
}

function fmtMoney(val) {
  return (parseFloat(val) || 0).toFixed(2);
}

function fmtInt(val) {
  return parseInt(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDec(val) {
  return (parseFloat(val) || 0).toFixed(1);
}

function fmtPct(val) {
  return (parseFloat(val) || 0).toFixed(2);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── TELEGRAM ─────────────────────────────────────────────────────────────────

function sendTelegramMessage(chatId, message) {
  var url     = 'https://api.telegram.org/bot' + config.botToken + '/sendMessage';
  var payload = { chat_id: chatId, text: message, parse_mode: 'HTML' };
  var options = { method: 'post', contentType: 'application/json',
                  payload: JSON.stringify(payload) };
  UrlFetchApp.fetch(url, options);
}

// ─── DEBUG / TEST FUNCTIONS ───────────────────────────────────────────────────

// Крок 1: перевірити що Telegram-бот живий і chat_id правильний
function testTelegram() {
  var CHAT_ID = 'ВСТАВТЕ_ВАШ_CHAT_ID';
  sendTelegramMessage(CHAT_ID, '✅ З\'єднання з Telegram працює! Бот активний.');
  Logger.log('Повідомлення відправлено до chat_id: ' + CHAT_ID);
}

// Крок 2: повний тест звіту для конкретного акаунту (без таблиці)
function testReport() {
  var ACCOUNT_ID = 'ВСТАВТЕ_ID_АКАУНТУ'; // формат: 123-456-7890
  var CHAT_ID    = 'ВСТАВТЕ_ВАШ_CHAT_ID';

  Logger.log('Шукаємо акаунт: ' + ACCOUNT_ID);
  var account = findAccountRecursively(ACCOUNT_ID);

  if (!account) {
    Logger.log('❌ Акаунт не знайдено. Перевірте ID акаунту та доступ MCC.');
    return;
  }

  Logger.log('✅ Акаунт знайдено: ' + account.getName());
  MccApp.select(account);

  var message = buildDailyReport();
  Logger.log('=== ТЕКСТ ПОВІДОМЛЕННЯ ===\n' + message);
  sendTelegramMessage(CHAT_ID, message);
  Logger.log('✅ Повідомлення відправлено!');
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
    Logger.log('Акаунт не знайдено під цим MCC: ' + e.message);
  }
  return null;
}
