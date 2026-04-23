/*
  Google Ads MCC — Щоденний звіт по ефективності рекламного кабінету

  Таблиця (лист "Accounts"):
    A: Account ID | B: Chat ID

  Запуск: раз на день (рекомендовано 8–10 ранку)
  Автор: на основі скрипта https://t.me/nikitenkoa
*/

var config = {
  spreadsheet_url: 'https://docs.google.com/spreadsheets/d/1yeZSE5UdzrNtGKPXPgSjKevb8WKW3j8a7495caOWKiY/edit?gid=0#gid=0',
  accountsSheetName: 'Accounts',
  botToken: '8106252010:AAFVw6Df2txnIIL5gw7ch11KJ0wC9I3HhJ0',
  stableThresholdPct: 2,  // зміна менше цього % = ⚪ стабільно
  testMode: false
};

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

function main() {
  var ss    = SpreadsheetApp.openByUrl(config.spreadsheet_url);
  var sheet = ss.getSheetByName(config.accountsSheetName);
  var rows  = sheet.getRange('A2:B').getValues().filter(function(r) { return r[0] !== ''; });

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
  var sym  = curr === 'UAH' ? '₴' : curr;

  var today = new Date();
  var yestDate = new Date(today); yestDate.setDate(today.getDate() - 1);

  // Last 7 days: today-7 → yesterday
  var l7s = new Date(today); l7s.setDate(today.getDate() - 7);
  // Previous 7 days: today-14 → today-8
  var p7s = new Date(today); p7s.setDate(today.getDate() - 14);
  var p7e = new Date(today); p7e.setDate(today.getDate() - 8);
  // Last 30 days: today-30 → yesterday
  var l30s = new Date(today); l30s.setDate(today.getDate() - 30);
  // Previous 30 days: today-60 → today-31
  var p30s = new Date(today); p30s.setDate(today.getDate() - 60);
  var p30e = new Date(today); p30e.setDate(today.getDate() - 31);

  var yestStr = fmtDate(yestDate, tz);
  var yest    = getStats(yestStr, yestStr);
  var last7   = getStats(fmtDate(l7s, tz),  yestStr);
  var prev7   = getStats(fmtDate(p7s, tz),  fmtDate(p7e, tz));
  var last30  = getStats(fmtDate(l30s, tz), yestStr);
  var prev30  = getStats(fmtDate(p30s, tz), fmtDate(p30e, tz));

  var budget       = getAccountBudgetRemaining();
  var avgDaily     = last7.cost / 7;
  var daysLeft     = (budget !== null && avgDaily > 0) ? Math.floor(budget / avgDaily) : null;

  var msg = '';
  msg += '📊 <b>' + escapeHtml(name) + '</b> · ' + Utilities.formatDate(yestDate, tz, 'dd.MM.yyyy') + '\n';
  msg += '━━━━━━━━━━━━━━━\n\n';

  msg += '<b>Вчора</b>\n';
  msg += blockYesterday(yest, sym);

  msg += '\n<b>7 днів</b> (vs попередні 7)\n';
  msg += blockDynamics(last7, prev7);

  msg += '\n<b>30 днів</b> (vs попередні 30)\n';
  msg += blockDynamics(last30, prev30);

  if (daysLeft !== null) {
    msg += '\n⏳ <b>Бюджет:</b> ~' + daysLeft + ' ' + pluralDays(daysLeft) + ' до вичерпання\n';
    msg += '(залишок ' + fmtMoney(budget) + ' ' + sym + ' · темп ' + fmtMoney(avgDaily) + ' ' + sym + '/день)\n';
  }

  var signals = buildSignals(last7, prev7, last30, prev30, daysLeft);
  if (signals.length > 0) {
    msg += '\n⚠️ <b>Сигнали:</b>\n';
    signals.forEach(function(s) { msg += '· ' + s + '\n'; });
  }

  return msg;
}

// ─── MESSAGE BLOCKS ───────────────────────────────────────────────────────────

function blockYesterday(s, sym) {
  var msg = '';
  msg += '👁 Покази: '     + fmtInt(s.impressions)  + '\n';
  msg += '🖱 Кліки: '      + fmtInt(s.clicks)        + '\n';
  msg += '💰 CPC: '        + fmtMoney(s.avgCpc)      + ' ' + sym + '\n';
  msg += '🎯 Конверсії: '  + fmtDec(s.conversions)   + '\n';
  msg += '💲 CPA: '        + fmtMoney(s.cpa)         + ' ' + sym + '\n';
  msg += '💎 Цінність: '   + fmtInt(s.value)         + ' ' + sym + '\n';
  msg += '📈 ROAS: '       + fmtDec(s.roas)          + '\n';
  msg += '💸 Витрати: '    + fmtMoney(s.cost)        + ' ' + sym + '\n';
  return msg;
}

function blockDynamics(curr, prev) {
  var msg = '';
  msg += '👁 Покази      ' + sig(curr.impressions, prev.impressions, true)  + '\n';
  msg += '🖱 Кліки       ' + sig(curr.clicks,      prev.clicks,      true)  + '\n';
  msg += '💰 CPC         ' + sig(curr.avgCpc,       prev.avgCpc,      false) + '\n';
  msg += '🎯 Конверсії   ' + sig(curr.conversions,  prev.conversions, true)  + '\n';
  msg += '💲 CPA         ' + sig(curr.cpa,          prev.cpa,         false) + '\n';
  msg += '💎 Цінність    ' + sig(curr.value,        prev.value,       true)  + '\n';
  msg += '📈 ROAS        ' + sig(curr.roas,         prev.roas,        true)  + '\n';
  msg += '💸 Витрати     ' + sigNeutral(curr.cost,  prev.cost)               + '\n';
  return msg;
}

// ─── SIGNALS ──────────────────────────────────────────────────────────────────

function buildSignals(last7, prev7, last30, prev30, daysLeft) {
  var lines = [];

  var conv7   = pct(last7.conversions,  prev7.conversions);
  var clicks7 = pct(last7.clicks,       prev7.clicks);
  var cpa7    = pct(last7.cpa,          prev7.cpa);
  var roas7   = pct(last7.roas,         prev7.roas);
  var cost7   = pct(last7.cost,         prev7.cost);

  var cpa30   = pct(last30.cpa,         prev30.cpa);
  var roas30  = pct(last30.roas,        prev30.roas);
  var conv30  = pct(last30.conversions, prev30.conversions);

  // Конверсії впали, кліки стабільні → проблема сайту / офера
  if (conv7 < -10 && Math.abs(clicks7) < 5) {
    lines.push('Конверсії ' + fmtSign(conv7) + '% за тиждень при стабільних кліках — перевірте сайт або офер');
  } else if (conv7 < -15) {
    lines.push('Конверсії ' + fmtSign(conv7) + '% за тиждень — сильне падіння, потрібен аналіз кампаній');
  }

  // CPA різко виросла
  if (cpa7 > 20) {
    lines.push('CPA ' + fmtSign(cpa7) + '% за тиждень — ефективність погіршується');
  }

  // ROAS впав
  if (roas7 < -15) {
    lines.push('ROAS ' + fmtSign(roas7) + '% за тиждень — перевірте цінність конверсій у кампаніях');
  }

  // Витрати ростуть, конверсії падають
  if (cost7 > 10 && conv7 < -5) {
    lines.push('Витрати ' + fmtSign(cost7) + '% при конверсіях ' + fmtSign(conv7) + '% — бюджет витрачається неефективно');
  }

  // Системний тренд: CPA погіршується і за тиждень, і за місяць
  if (cpa7 > 15 && cpa30 > 15) {
    lines.push('CPA зростає стабільно і за 7, і за 30 днів — системна проблема ефективності');
  }

  // Системний тренд: ROAS падає на обох горизонтах
  if (roas7 < -10 && roas30 < -10) {
    lines.push('ROAS падає і за 7, і за 30 днів — перегляньте стратегію ставок та офер');
  }

  // Бюджет
  if (daysLeft !== null && daysLeft <= 3) {
    lines.push('🚨 Бюджет закінчується через ' + daysLeft + ' ' + pluralDays(daysLeft) + ' — потрібне термінове поповнення');
  } else if (daysLeft !== null && daysLeft <= 7) {
    lines.push('Бюджет закінчується через ~' + daysLeft + ' ' + pluralDays(daysLeft) + ' — плануйте поповнення');
  }

  return lines;
}

// ─── SIGNAL FORMATTERS ────────────────────────────────────────────────────────

// higherIsBetter=true: ріст → 🟢, падіння → 🔴 (Покази, Кліки, Конверсії, Цінність, ROAS)
// higherIsBetter=false: падіння → 🟢, ріст → 🔴 (CPC, CPA)
function sig(curr, prev, higherIsBetter) {
  var p = pct(curr, prev);
  if (Math.abs(p) < config.stableThresholdPct) return '⚪ ' + fmtSign(p) + '%';
  var good = higherIsBetter ? p > 0 : p < 0;
  return (good ? '🟢' : '🔴') + ' ' + fmtSign(p) + '%';
}

// Витрати — нейтральна метрика (просто напрямок)
function sigNeutral(curr, prev) {
  var p = pct(curr, prev);
  if (Math.abs(p) < config.stableThresholdPct) return '⚪ ' + fmtSign(p) + '%';
  return (p > 0 ? '🔼' : '🔽') + ' ' + fmtSign(p) + '%';
}

// ─── STATS FETCHING ───────────────────────────────────────────────────────────

function getStats(startDate, endDate) {
  var q = 'SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, '
    + 'metrics.conversions, metrics.conversions_value '
    + 'FROM campaign '
    + "WHERE segments.date BETWEEN '" + startDate + "' AND '" + endDate + "'"
    + ' AND campaign.status != "REMOVED"';

  var t = { cost: 0, clicks: 0, impressions: 0, conversions: 0, value: 0 };
  try {
    var report = AdsApp.search(q);
    while (report.hasNext()) {
      var r = report.next();
      t.cost        += (r.metrics.costMicros         || 0) / 1e6;
      t.clicks      += parseInt(r.metrics.clicks       || 0);
      t.impressions += parseInt(r.metrics.impressions  || 0);
      t.conversions += parseFloat(r.metrics.conversions      || 0);
      t.value       += parseFloat(r.metrics.conversionsValue || 0);
    }
  } catch (e) {
    Logger.log('Помилка запиту статистики: ' + e.message);
  }

  t.avgCpc = t.clicks      > 0 ? t.cost  / t.clicks      : 0;
  t.cpa    = t.conversions > 0 ? t.cost  / t.conversions : 0;
  t.roas   = t.cost        > 0 ? t.value / t.cost        : 0;
  return t;
}

function getAccountBudgetRemaining() {
  var q = 'SELECT account_budget.adjusted_spending_limit_micros, '
    + 'account_budget.amount_served_micros '
    + 'FROM account_budget '
    + "WHERE account_budget.status = 'APPROVED'";
  try {
    var report = AdsApp.search(q);
    if (report.hasNext()) {
      var r      = report.next();
      var limit  = r.accountBudget.adjustedSpendingLimitMicros;
      var served = r.accountBudget.amountServedMicros;
      // limit = null або > 1e15 означає UNLIMITED
      if (!limit || limit > 1e15) return null;
      return (limit - served) / 1e6;
    }
  } catch (e) {
    Logger.log('Бюджет акаунту не знайдено: ' + e.message);
  }
  return null;
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────

function pct(curr, prev) {
  if (!prev || prev === 0) return 0;
  return ((curr - prev) / prev) * 100;
}

function fmtSign(val) {
  return (val >= 0 ? '+' : '') + val.toFixed(1);
}

function fmtMoney(val) {
  return (parseFloat(val) || 0).toFixed(2);
}

function fmtInt(val) {
  return parseInt(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDec(val) {
  return (parseFloat(val) || 0).toFixed(1);
}

function fmtDate(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'день';
  if ([2,3,4].indexOf(n % 10) > -1 && [12,13,14].indexOf(n % 100) === -1) return 'дні';
  return 'днів';
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

  // Група оновилась до супергрупи — новий chat_id приходить у відповіді
  if (code === 400 && body.parameters && body.parameters.migrate_to_chat_id) {
    var newChatId = body.parameters.migrate_to_chat_id;
    Logger.log('⚠️ Chat мігрував до супергрупи. Старий ID: ' + chatId + ' → Новий ID: ' + newChatId + '. Оновіть таблицю!');

    payload.chat_id = newChatId;
    options.payload  = JSON.stringify(payload);
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
    Logger.log('Акаунт не знайдено під цим MCC: ' + e.message);
  }
  return null;
}

// ─── TEST FUNCTIONS ───────────────────────────────────────────────────────────

function testTelegram() {
  var CHAT_ID = 'ВСТАВТЕ_ВАШ_CHAT_ID';
  sendTelegramMessage(CHAT_ID, '✅ Зʼєднання з Telegram працює!');
}

function testReport() {
  var ACCOUNT_ID = 'ВСТАВТЕ_ID_АКАУНТУ'; // формат: 123-456-7890
  var CHAT_ID    = 'ВСТАВТЕ_ВАШ_CHAT_ID';

  var account = findAccountRecursively(ACCOUNT_ID);
  if (!account) { Logger.log('❌ Акаунт не знайдено'); return; }

  MccApp.select(account);
  var message = buildDailyReport();
  Logger.log(message);
  sendTelegramMessage(CHAT_ID, message);
}
