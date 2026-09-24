const SYSTEM_COLUMNS = ["処理ID", "処理状態", "GitHub Issue", "処理エラー"];

function scriptConfig() {
  const properties = PropertiesService.getScriptProperties();
  const workerUrl = properties.getProperty("FEEDBACK_WORKER_URL");
  const secret = properties.getProperty("FEEDBACK_WEBHOOK_SECRET");
  if (!workerUrl || !secret) {
    throw new Error(
      "FEEDBACK_WORKER_URL / FEEDBACK_WEBHOOK_SECRET が未設定です",
    );
  }
  return { workerUrl, secret };
}

function first(namedValues, name) {
  const values = namedValues[name];
  return values && values.length > 0 ? String(values[0]).trim() : "";
}

function feedbackKind(value) {
  if (value === "不具合報告") return "bug";
  if (value === "機能追加リクエスト") return "request";
  if (value === "その他") return "question";
  throw new Error(`未知の報告種別です: ${value || "(空)"}`);
}

function feedbackDetails(namedValues, kind) {
  const field =
    kind === "bug"
      ? "不具合内容"
      : kind === "request"
        ? "追加してほしい機能内容"
        : "報告内容";
  const details = first(namedValues, field);
  if (!details) throw new Error(`${field}が空です`);
  return details;
}

function feedbackSummary(details) {
  const firstLine = details.split(/\r?\n/, 1)[0].trim();
  return (firstLine || details).slice(0, 120);
}

function ensureSystemColumns(sheet) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    for (const name of SYSTEM_COLUMNS) {
      if (!headers.includes(name)) {
        headers.push(name);
        sheet.getRange(1, headers.length).setValue(name);
      }
    }
    return Object.fromEntries(
      SYSTEM_COLUMNS.map((name) => [name, headers.indexOf(name) + 1]),
    );
  } finally {
    lock.releaseLock();
  }
}

function signature(body, secret) {
  return Utilities.computeHmacSha256Signature(
    body,
    secret,
    Utilities.Charset.UTF_8,
  )
    .map((byte) => ((byte + 256) % 256).toString(16).padStart(2, "0"))
    .join("");
}

function sendFeedback(payload) {
  const config = scriptConfig();
  const body = JSON.stringify(payload);
  const response = UrlFetchApp.fetch(config.workerUrl, {
    method: "post",
    contentType: "application/json",
    payload: body,
    headers: { "X-Feedback-Signature": signature(body, config.secret) },
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const result = JSON.parse(response.getContentText() || "{}");
  if (status < 200 || status >= 300 || !result.issueUrl) {
    throw new Error(
      `Worker ${status}: ${result.error || "Issue URLがありません"}`,
    );
  }
  return result.issueUrl;
}

/** 回答先Spreadsheetに、インストール型の「フォーム送信時」トリガーとして設定する。 */
function onFormSubmit(event) {
  const sheet = event.range.getSheet();
  const row = event.range.getRow();
  const columns = ensureSystemColumns(sheet);
  const idCell = sheet.getRange(row, columns["処理ID"]);
  const id = idCell.getValue() || Utilities.getUuid();
  idCell.setValue(id);
  sheet.getRange(row, columns["処理状態"]).setValue("processing");

  const named = event.namedValues;
  const kind = feedbackKind(first(named, "報告種別を選択してください"));
  const details = feedbackDetails(named, kind);
  const payload = {
    id,
    submittedAt: new Date().toISOString(),
    kind,
    summary: feedbackSummary(details),
    details,
    context: first(named, "環境情報"),
  };

  try {
    const issueUrl = sendFeedback(payload);
    sheet.getRange(row, columns["処理状態"]).setValue("created");
    sheet.getRange(row, columns["GitHub Issue"]).setValue(issueUrl);
    sheet.getRange(row, columns["処理エラー"]).clearContent();
  } catch (error) {
    sheet.getRange(row, columns["処理状態"]).setValue("failed");
    sheet
      .getRange(row, columns["処理エラー"])
      .setValue(String(error).slice(0, 2000));
    throw error;
  }
}
