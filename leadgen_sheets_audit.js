/*



*/

const config = {
  spreadsheet_url: 'https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit',
  ads_account_id: 'XXX-XXX-XXXX'
};

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

function main() {
  var spreadsheet = getSpreadsheet(config.spreadsheet_url);
  MccApp.select(MccApp.accounts().withIds([config.ads_account_id]).get().next());

  try {
    setValues(getSheet(spreadsheet, 'changeHistory'), getAccountChangeHistory());
    Logger.log('changeHistory OK');
  } catch (e) { Logger.log('changeHistory ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'accountStats'), getAccountStats());
    Logger.log('accountStats OK');
  } catch (e) { Logger.log('accountStats ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'campaignStats'), getCampaignStats());
    Logger.log('campaignStats OK');
  } catch (e) { Logger.log('campaignStats ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'adGroupStats'), getAdGroupStats());
    Logger.log('adGroupStats OK');
  } catch (e) { Logger.log('adGroupStats ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'keywordStats'), getKeywordStats());
    Logger.log('keywordStats OK');
  } catch (e) { Logger.log('keywordStats ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'searchTermsReport'), getSearchTermsReport());
    Logger.log('searchTermsReport OK');
  } catch (e) { Logger.log('searchTermsReport ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'adsPerformance'), getAdsPerformance());
    Logger.log('adsPerformance OK');
  } catch (e) { Logger.log('adsPerformance ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'conversionActions'), getConversionActions());
    Logger.log('conversionActions OK');
  } catch (e) { Logger.log('conversionActions ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'geoPerformance'), getGeoPerformance());
    Logger.log('geoPerformance OK');
  } catch (e) { Logger.log('geoPerformance ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'devicePerformance'), getDevicePerformance());
    Logger.log('devicePerformance OK');
  } catch (e) { Logger.log('devicePerformance ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'scheduleByDay'), getScheduleByDay());
    Logger.log('scheduleByDay OK');
  } catch (e) { Logger.log('scheduleByDay ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'scheduleByHour'), getScheduleByHour());
    Logger.log('scheduleByHour OK');
  } catch (e) { Logger.log('scheduleByHour ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'audiencePerformance'), getAudiencePerformance());
    Logger.log('audiencePerformance OK');
  } catch (e) { Logger.log('audiencePerformance ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'budgetPacingReport'), getBudgetPacingReport());
    Logger.log('budgetPacingReport OK');
  } catch (e) { Logger.log('budgetPacingReport ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'landingPageReport'), getLandingPageReport());
    Logger.log('landingPageReport OK');
  } catch (e) { Logger.log('landingPageReport ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'performanceMaxSettings'), getPerformanceMaxSettings());
    Logger.log('performanceMaxSettings OK');
  } catch (e) { Logger.log('performanceMaxSettings ERROR: ' + e); }

  try {
    setValues(getSheet(spreadsheet, 'performanceMaxStats'), getPerformanceMaxStats());
    Logger.log('performanceMaxStats OK');
  } catch (e) { Logger.log('performanceMaxStats ERROR: ' + e); }
}

// ─── 1. CHANGE HISTORY (last 29 days — API limit) ────────────────────────────

function getAccountChangeHistory() {
  var today = new Date();
  var endDate = new Date(today); endDate.setDate(today.getDate() - 1);
  var startDate = new Date(today); startDate.setDate(today.getDate() - 29);
  var tz = AdsApp.currentAccount().getTimeZone();
  var start = Utilities.formatDate(startDate, tz, 'yyyy-MM-dd');
  var end   = Utilities.formatDate(endDate,   tz, 'yyyy-MM-dd');

  var query = `
    SELECT
      campaign.name,
      ad_group.name,
      change_event.change_date_time,
      change_event.change_resource_type,
      change_event.changed_fields,
      change_event.client_type,
      change_event.new_resource,
      change_event.old_resource,
      change_event.resource_change_operation,
      change_event.resource_name,
      change_event.user_email
    FROM change_event
    WHERE change_event.change_date_time BETWEEN '${start}' AND '${end}'
    ORDER BY change_event.change_date_time DESC
    LIMIT 1000
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'date', 'user_email', 'client_type', 'campaign', 'ad_group',
    'change_resource_type', 'changed_fields', 'new_resource',
    'old_resource', 'resource_change_operation', 'resource_name'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    report.push([
      row.changeEvent.changeDateTime || '',
      row.changeEvent.userEmail || '',
      row.changeEvent.clientType || '',
      (row.campaign && row.campaign.name) || '',
      (row.adGroup && row.adGroup.name) || '',
      row.changeEvent.changeResourceType || '',
      row.changeEvent.changedFields || '',
      row.changeEvent.newResource || '',
      row.changeEvent.oldResource || '',
      row.changeEvent.resourceChangeOperation || '',
      row.changeEvent.resourceName || ''
    ]);
  }

  return report;
}

// ─── 2. ACCOUNT STATS (daily) ─────────────────────────────────────────────────

function getAccountStats() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY segments.date
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Date', 'Impressions', 'Clicks', 'CTR %',
    'Cost', 'Avg CPC', 'Conversions', 'Conv. Rate %', 'CPL', 'Conv. Value', 'ROAS'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;
    var val  = row.metrics.conversionsValue || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.segments.date || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0),
      round(val),
      round(cost > 0 ? val / cost : 0)
    ]);
  }

  return report;
}

// ─── 3. CAMPAIGN STATS (daily) ────────────────────────────────────────────────

function getCampaignStats() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY campaign.name, segments.date
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Date', 'Campaign ID', 'Campaign', 'Status', 'Channel Type',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.segments.date || '',
      row.campaign.id || '',
      row.campaign.name || '',
      row.campaign.status || '',
      row.campaign.advertisingChannelType || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 4. AD GROUP STATS (aggregated) ──────────────────────────────────────────

function getAdGroupStats() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY campaign.name, ad_group.name
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Ad Group ID', 'Ad Group', 'Status',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.adGroup.id || '',
      row.adGroup.name || '',
      row.adGroup.status || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 5. KEYWORD STATS (aggregated + Quality Score) ───────────────────────────

function getKeywordStats() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM keyword_view
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_criterion.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY metrics.clicks DESC
    LIMIT 2000
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Status',
    'Quality Score', 'Ad Relevance', 'Landing Page Exp.', 'Expected CTR',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;
    var qi   = row.adGroupCriterion.qualityInfo || {};

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.name || '',
      row.adGroup.name || '',
      row.adGroupCriterion.keyword.text || '',
      row.adGroupCriterion.keyword.matchType || '',
      row.adGroupCriterion.status || '',
      qi.qualityScore || '',
      qi.creativeQualityScore || '',
      qi.postClickQualityScore || '',
      qi.searchPredictedCtr || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 6. SEARCH TERMS REPORT (aggregated) ─────────────────────────────────────

function getSearchTermsReport() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      search_term_view.search_term,
      search_term_view.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM search_term_view
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY metrics.clicks DESC
    LIMIT 2000
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Ad Group ID', 'Ad Group',
    'Search Term', 'Status',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.adGroup.id || '',
      row.adGroup.name || '',
      row.searchTermView.searchTerm || '',
      row.searchTermView.status || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 7. ADS PERFORMANCE (aggregated) ─────────────────────────────────────────

function getAdsPerformance() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group_ad
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY metrics.clicks DESC
    LIMIT 1000
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Ad Group ID', 'Ad Group',
    'Ad ID', 'Ad Type', 'Final URL', 'Status',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row  = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;
    var urls = row.adGroupAd.ad.finalUrls;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.adGroup.id || '',
      row.adGroup.name || '',
      row.adGroupAd.ad.id || '',
      row.adGroupAd.ad.type || '',
      (urls && urls.length > 0) ? urls[0] : '',
      row.adGroupAd.status || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 8. CONVERSION ACTIONS (daily) ───────────────────────────────────────────

function getConversionActions() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      segments.date,
      segments.conversion_action,
      segments.conversion_action_name,
      segments.conversion_action_category,
      metrics.conversions,
      metrics.all_conversions
    FROM customer
    WHERE segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY segments.date, segments.conversion_action_name
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Date', 'Conversion Action', 'Category',
    'Conversions', 'All Conversions'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    report.push([
      AdsApp.currentAccount().getName(),
      row.segments.date || '',
      row.segments.conversionActionName || '',
      row.segments.conversionActionCategory || '',
      row.metrics.conversions || 0,
      row.metrics.allConversions || 0
    ]);
  }

  return report;
}

// ─── 9. GEO PERFORMANCE (aggregated) ─────────────────────────────────────────

function getGeoPerformance() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      geographic_view.country_criterion_id,
      geographic_view.location_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM geographic_view
    WHERE segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY metrics.clicks DESC
    LIMIT 2000
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Location Type', 'Country Criterion ID',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.geographicView.locationType || '',
      row.geographicView.countryCriterionId || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 10. DEVICE PERFORMANCE (aggregated) ──────────────────────────────────────

function getDevicePerformance() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      segments.device,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY campaign.name, segments.device
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Device',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.segments.device || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 11. SCHEDULE — BY DAY OF WEEK (aggregated) ───────────────────────────────

function getScheduleByDay() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      segments.day_of_week,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY campaign.name, segments.day_of_week
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Day of Week',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.segments.dayOfWeek || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 12. SCHEDULE — BY HOUR OF DAY (aggregated) ───────────────────────────────

function getScheduleByHour() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      segments.hour,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY campaign.name, segments.hour
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Hour (0–23)',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.segments.hour || 0,
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 13. AUDIENCE PERFORMANCE (aggregated) ────────────────────────────────────

function getAudiencePerformance() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.type,
      ad_group_criterion.bid_modifier,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group_audience_view
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_criterion.status NOT IN ('REMOVED', 'PAUSED')
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY metrics.clicks DESC
    LIMIT 1000
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Ad Group ID', 'Ad Group',
    'Audience Criterion ID', 'Audience Type', 'Bid Modifier',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.adGroup.id || '',
      row.adGroup.name || '',
      row.adGroupCriterion.criterionId || '',
      row.adGroupCriterion.type || '',
      row.adGroupCriterion.bidModifier || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 14. BUDGET PACING REPORT (daily) ────────────────────────────────────────

function getBudgetPacingReport() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      segments.date,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY campaign.name, segments.date
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Date', 'Campaign ID', 'Campaign',
    'Daily Budget', 'Spend', 'Budget Utilization %', 'Remaining Budget',
    'Projected Monthly Spend', 'Conversions', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row    = rows.next();
    var budget = row.campaignBudget.amountMicros ? row.campaignBudget.amountMicros / 1000000 : 0;
    var spend  = row.metrics.costMicros ? row.metrics.costMicros / 1000000 : 0;
    var conv   = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.segments.date || '',
      row.campaign.id || '',
      row.campaign.name || '',
      round(budget),
      round(spend),
      round(budget > 0 ? (spend / budget) * 100 : 0),
      round(budget - spend),
      round(spend * 30),
      conv,
      round(conv > 0 ? spend / conv : 0)
    ]);
  }

  return report;
}

// ─── 15. LANDING PAGE REPORT (aggregated, all campaign types) ─────────────────

function getLandingPageReport() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      landing_page_view.unexpanded_final_url,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM landing_page_view
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY metrics.clicks DESC
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Channel Type', 'Final URL',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.campaign.advertisingChannelType || '',
      row.landingPageView.unexpandedFinalUrl || '',
      imp, clk,
      round((row.metrics.ctr || 0) * 100),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── 16. PMAX SETTINGS ────────────────────────────────────────────────────────

function getPerformanceMaxSettings() {
  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.advertising_channel_sub_type,
      campaign.start_date_time,
      campaign.end_date_time,
      campaign.final_url_suffix,
      campaign.brand_guidelines_enabled,
      campaign.optimization_score,
      campaign.target_cpa.target_cpa_micros,
      campaign.target_roas.target_roas,
      campaign.maximize_conversions.target_cpa_micros,
      campaign.maximize_conversion_value.target_roas,
      campaign_budget.name,
      campaign_budget.amount_micros,
      bidding_strategy.name,
      bidding_strategy.type
    FROM campaign
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
    ORDER BY campaign.name
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Campaign ID', 'Campaign', 'Status',
    'Channel Type', 'Channel Sub Type', 'Start Date', 'End Date',
    'Budget Name', 'Daily Budget', 'Bidding Strategy', 'Bidding Strategy Type',
    'Target CPA', 'Target ROAS', 'Final URL Suffix',
    'Brand Guidelines Enabled', 'Optimization Score'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var targetCpa =
      (row.campaign.targetCpa && row.campaign.targetCpa.targetCpaMicros) ||
      (row.campaign.maximizeConversions && row.campaign.maximizeConversions.targetCpaMicros) || 0;
    var targetRoas =
      (row.campaign.targetRoas && row.campaign.targetRoas.targetRoas) ||
      (row.campaign.maximizeConversionValue && row.campaign.maximizeConversionValue.targetRoas) || 0;
    var budget = (row.campaignBudget && row.campaignBudget.amountMicros)
      ? row.campaignBudget.amountMicros / 1000000 : 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.campaign.id || '',
      row.campaign.name || '',
      row.campaign.status || '',
      row.campaign.advertisingChannelType || '',
      row.campaign.advertisingChannelSubType || '',
      row.campaign.startDateTime || '',
      row.campaign.endDateTime || '',
      (row.campaignBudget && row.campaignBudget.name) || '',
      budget,
      (row.biddingStrategy && row.biddingStrategy.name) || '',
      (row.biddingStrategy && row.biddingStrategy.type) || '',
      targetCpa ? targetCpa / 1000000 : '',
      targetRoas || '',
      row.campaign.finalUrlSuffix || '',
      String(row.campaign.brandGuidelinesEnabled || false),
      row.campaign.optimizationScore || ''
    ]);
  }

  return report;
}

// ─── 17. PMAX STATS (daily) ───────────────────────────────────────────────────

function getPerformanceMaxStats() {
  var dateRange = getDateRange(120).split(',');

  var query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND campaign.status = 'ENABLED'
      AND segments.date BETWEEN '${dateRange[0]}' AND '${dateRange[1]}'
    ORDER BY campaign.name, segments.date
  `;

  var rows = AdsApp.search(query);

  var report = [[
    'Account', 'Date', 'Campaign ID', 'Campaign', 'Status',
    'Impressions', 'Clicks', 'CTR %', 'Cost', 'Avg CPC',
    'Conversions', 'Conv. Rate %', 'CPL'
  ]];

  while (rows.hasNext()) {
    var row = rows.next();
    var imp  = row.metrics.impressions || 0;
    var clk  = row.metrics.clicks || 0;
    var cost = (row.metrics.costMicros || 0) / 1000000;
    var conv = row.metrics.conversions || 0;

    report.push([
      AdsApp.currentAccount().getName(),
      row.segments.date || '',
      row.campaign.id || '',
      row.campaign.name || '',
      row.campaign.status || '',
      imp, clk,
      round(imp > 0 ? (clk / imp) * 100 : 0),
      round(cost),
      round(clk > 0 ? cost / clk : 0),
      conv,
      round(clk > 0 ? (conv / clk) * 100 : 0),
      round(conv > 0 ? cost / conv : 0)
    ]);
  }

  return report;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getSpreadsheet(url) {
  return SpreadsheetApp.openByUrl(url);
}

function getSheet(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function setValues(sheet, values) {
  sheet.clear();
  if (!values || !values.length || !values[0] || !values[0].length) return;
  sheet
    .getRange(1, 1, values.length, values[0].length)
    .setValues(values);
}

function getDateRange(daysBack) {
  var today     = new Date();
  var endDate   = new Date(today); endDate.setDate(today.getDate() - 1);
  var startDate = new Date(today); startDate.setDate(today.getDate() - daysBack);
  var tz        = AdsApp.currentAccount().getTimeZone();
  return Utilities.formatDate(startDate, tz, 'yyyy-MM-dd') + ',' +
         Utilities.formatDate(endDate,   tz, 'yyyy-MM-dd');
}

function round(value) {
  return Math.round(value * 100) / 100;
}
