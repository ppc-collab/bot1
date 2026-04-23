/*
  Google Ads MCC — Щоденний звіт для акаунтів послуг (лідген)

  Таблиця (лист "Accounts"):
    A: Account ID | B: Chat ID

  Запуск: раз на день (рекомендовано 8–10 ранку)
  Автор: на основі скрипта https://t.me/nikitenkoa
*/

var config = {
  spreadsheet_url: 'https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit',
  accountsSheetName: 'Accounts',
  botToken: 'YOUR_BOT_TOKEN',
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

  var today    = new Date();
  var yestDate = new Date(today); yestDate.setDate(today.getDate() - 1);
  var l7s      = new Date(today); l7s.setDate(today.getDate() - 7);
  var p7s      = new Date(today); p7s.setDate(today.getDate() - 14);
  var p7e      = new Date(today); p7e.setDate(today.getDate() - 8);
  var l30s     = new Date(today); l30s.setDate(today.getDate() - 30);
  var p30s     = new Date(today); p30s.setDate(today.getDate() - 60);
  var p30e     = new Date(today); p30e.setDate(today.getDate() - 31);

  var yestStr = fmtDate(yestDate, tz);
  var yest    = getStats(yestStr,           yestStr);
  var last7   = getStats(fmtDate(l7s, tz),  yestStr);
  var prev7   = getStats(fmtDate(p7s, tz),  fmtDate(p7e, tz));
  var last30  = getStats(fmtDate(l30s, tz), yestStr);
  var prev30  = getStats(fmtDate(p30s, tz), fmtDate(p30e, tz));

  var budget   = getAccountBudgetRemaining();
  var avgDaily = last7.cost / 7;
  var daysLeft = (budget !== null && avgDaily > 0) ? Math.floor(budget / avgDaily) : null;

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
  msg += '👁 Покази: '      + fmtInt(s.impressions)       + '\n';
  msg += '🖱 Кліки: '       + fmtInt(s.clicks)             + '\n';
  msg += '📊 CTR: '         + fmtPct(s.ctr)                + '%\n';
  msg += '💰 CPC: '         + fmtMoney(s.avgCpc)           + ' ' + sym + '\n';
  msg += '🎯 Конверсії: '   + fmtDec(s.conversions)        + '\n';
  msg += '💲 CPA: '         + fmtMoney(s.cpa)              + ' ' + sym + '\n';
  msg += '💸 Витрати: '     + fmtMoney(s.cost)             + ' ' + sym + '\n';
  msg += '·\n';
  msg += '📡 IS: '          + fmtPct(s.impressionShare)    + '%\n';
  msg += '🔻 Lost Бюджет: ' + fmtPct(s.lostBudget)        + '%\n';
  msg += '🔻 Lost Рейтинг: '+ fmtPct(s.lostRank)          + '%\n';
  return msg;
}

function blockDynamics(curr, prev) {
  var msg = '';
  msg += '👁 Покази       ' + sig(curr.impressions,     prev.impressions,     true)  + '\n';
  msg += '🖱 Кліки        ' + sig(curr.clicks,          prev.clicks,          true)  + '\n';
  msg += '📊 CTR          ' + sig(curr.ctr,             prev.ctr,             true)  + '\n';
  msg += '💰 CPC          ' + sig(curr.avgCpc,          prev.avgCpc,          false) + '\n';
  msg += '🎯 Конверсії    ' + sig(curr.conversions,     prev.conversions,     true)  + '\n';
  msg += '💲 CPA          ' + sig(curr.cpa,             prev.cpa,             false) + '\n';
  msg += '💸 Витрати      ' + sigNeutral(curr.cost,     prev.cost)                   + '\n';
  msg += '·\n';
  msg += '📡 IS           ' + sig(curr.impressionShare, prev.impressionShare,  true)  + '\n';
  msg += '🔻 Lost Бюджет  ' + sig(curr.lostBudget,     prev.lostBudget,      false) + '\n';
  msg += '🔻 Lost Рейтинг ' + sig(curr.lostRank,       prev.lostRank,        false) + '\n';
  return msg;
}

// ─── SIGNALS ──────────────────────────────────────────────────────────────────

function buildSignals(last7, prev7, last30, prev30, daysLeft) {
  var lines = [];

  var conv7   = pct(last7.conversions,     prev7.conversions);
  var clicks7 = pct(last7.clicks,          prev7.clicks);
  var cpa7    = pct(last7.cpa,             prev7.cpa);
  var cost7   = pct(last7.cost,            prev7.cost);
  var cpa30   = pct(last30.cpa,            prev30.cpa);
  var conv30  = pct(last30.conversions,    prev30.conversions);

  // Конверсії впали, кліки стабільні → лендинг або форма
  if (conv7 < -10 && Math.abs(clicks7) < 5) {
    lines.push('Конверсії ' + fmtSign(conv7) + '% при стабільних кліках — перевірте лендинг або форму заявки');
  } else if (conv7 < -15) {
    lines.push('Конверсії ' + fmtSign(conv7) + '% за тиждень — потрібен аналіз кампаній і трафіку');
  }

  // CPA виросла
  if (cpa7 > 20) {
    lines.push('CPA ' + fmtSign(cpa7) + '% за тиждень — зросла конкуренція або погіршилась якість трафіку');
  }

  // Витрати ростуть, конверсії падають
  if (cost7 > 10 && conv7 < -5) {
    lines.push('Витрати ' + fmtSign(cost7) + '% при конверсіях ' + fmtSign(conv7) + '% — бюджет витрачається неефективно');
  }

  // IS просідає через бюджет (абсолютне значення, не динаміка)
  if (last7.lostBudget > 20) {
    lines.push('Lost IS Budget ' + fmtPct(last7.lostBudget) + '% — бюджет обмежує охоплення, розгляньте збільшення');
  }

  // IS просідає через рейтинг
  if (last7.lostRank > 30) {
    lines.push('Lost IS Rank ' + fmtPct(last7.lostRank) + '% — проблема з якістю оголошень або ставками');
  }

  // IS падає в динаміці
  if (pct(last7.impressionShare, prev7.impressionShare) < -10) {
    lines.push('Impression Share ' + fmtSign(pct(last7.impressionShare, prev7.impressionShare)) + '% за тиждень — втрачаємо частку аукціону');
  }

  // Системний тренд CPA
  if (cpa7 > 15 && cpa30 > 15) {
    lines.push('CPA зростає і за 7, і за 30 днів — системна проблема ефективності');
  }

  // Бюджет акаунту
  if (daysLeft !== null && daysLeft <= 3) {
    lines.push('🚨 Бюджет закінчується через ' + daysLeft + ' ' + pluralDays(daysLeft) + ' — термінове поповнення');
  } else if (daysLeft !== null && daysLeft <= 7) {
    lines.push('Бюджет закінчується через ~' + daysLeft + ' ' + pluralDays(daysLeft) + ' — плануйте поповнення');
  }

  return lines;
}

// ─── STATS FETCHING ───────────────────────────────────────────────────────────

function getStats(startDate, endDate) {
  var q = 'SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, '
    + 'metrics.conversions, '
    + 'metrics.search_impression_share, '
    + 'metrics.search_budget_lost_impression_share, '
    + 'metrics.search_rank_lost_impression_share '
    + 'FROM campaign '
    + "WHERE segments.date BETWEEN '" + startDate + "' AND '" + endDate + "'"
    + ' AND campaign.status != "REMOVED"';

  // IS зважуємо по імпресіях: IS_account = Σ(IS_i × imp_i) / Σ(imp_i)
  // Для точнішого результату рахуємо eligible impressions: elig_i = imp_i / IS_i
  var t = {
    cost: 0, clicks: 0, impressions: 0, conversions: 0,
    totalEligible: 0, lostBEligible: 0, lostREligible: 0
  };

  try {
    var report = AdsApp.search(q);
    while (report.hasNext()) {
      var r   = report.next();
      var imp = parseInt(r.metrics.impressions || 0);
      var is  = parseFloat(r.metrics.searchImpressionShare           || 0);
      var lb  = parseFloat(r.metrics.searchBudgetLostImpressionShare || 0);
      var lr  = parseFloat(r.metrics.searchRankLostImpressionShare   || 0);

      t.cost        += (r.metrics.costMicros || 0) / 1e6;
      t.clicks      += parseInt(r.metrics.clicks || 0);
      t.impressions += imp;
      t.conversions += parseFloat(r.metrics.conversions || 0);

      // eligible impressions для кампанії (якщо IS > 0)
      var eligible = (is > 0) ? imp / is : 0;
      t.totalEligible += eligible;
      t.lostBEligible += lb * eligible;
      t.lostREligible += lr * eligible;
    }
  } catch (e) {
    Logger.log('Помилка запиту статистики: ' + e.message);
  }

  var elig = t.totalEligible;
  t.ctr             = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  t.avgCpc          = t.clicks      > 0 ? t.cost / t.clicks                : 0;
  t.cpa             = t.conversions > 0 ? t.cost / t.conversions           : 0;
  t.impressionShare = elig          > 0 ? (t.impressions  / elig) * 100    : 0;
  t.lostBudget      = elig          > 0 ? (t.lostBEligible / elig) * 100   : 0;
  t.lostRank        = elig          > 0 ? (t.lostREligible / elig) * 100   : 0;

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
      var r     = report.next();
      var limit = r.accountBudget.adjustedSpendingLimitMicros;
      if (!limit || limit > 1e15) return null; // UNLIMITED
      return (limit - r.accountBudget.amountServedMicros) / 1e6;
    }
  } catch (e) {
    Logger.log('Бюджет акаунту не знайдено: ' + e.message);
  }
  return null;
}

// ─── SIGNAL FORMATTERS ────────────────────────────────────────────────────────

function sig(curr, prev, higherIsBetter) {
  var p = pct(curr, prev);
  if (Math.abs(p) < config.stableThresholdPct) return '⚪ ' + fmtSign(p) + '%';
  var good = higherIsBetter ? p > 0 : p < 0;
  return (good ? '🟢' : '🔴') + ' ' + fmtSign(p) + '%';
}

function sigNeutral(curr, prev) {
  var p = pct(curr, prev);
  if (Math.abs(p) < config.stableThresholdPct) return '⚪ ' + fmtSign(p) + '%';
  return (p > 0 ? '🔼' : '🔽') + ' ' + fmtSign(p) + '%';
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

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
  return parseInt(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDec(val) {
  return (parseFloat(val) || 0).toFixed(1);
}

function fmtPct(val) {
  return (parseFloat(val) || 0).toFixed(1);
}

function fmtDate(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'день';
  if ([2, 3, 4].indexOf(n % 10) > -1 && [12, 13, 14].indexOf(n % 100) === -1) return 'дні';
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
  if (code === 400 && body.parameters && body.parameters.migrate_to_chat_id) {
    var newChatId = body.parameters.migrate_to_chat_id;
    Logger.log('⚠️ Chat мігрував. Старий ID: ' + chatId + ' → Новий ID: ' + newChatId + '. Оновіть таблицю!');
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
