/** Minimal ARF (multipart/report; feedback-report) for FakeImapServer tests. */
export function buildArfMessage(input: {
  reportMessageId: string
  originalMessageId: string
  recipientEmail: string
  feedbackType?: string
}): string {
  const boundary = "BOUNDARY_ARF_TEST"
  return [
    `From: fbl@outlook.com`,
    `To: reporting-tool@dataaccess.net`,
    `Subject: FW: Complaint`,
    `Message-ID: <${input.reportMessageId}>`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/report; report-type=feedback-report; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `This is an email abuse report.`,
    ``,
    `--${boundary}`,
    `Content-Type: message/feedback-report`,
    ``,
    `Feedback-Type: ${input.feedbackType ?? "abuse"}`,
    `User-Agent: Microsoft JMRP`,
    `Version: 1`,
    `Original-Mail-Message-ID: <${input.originalMessageId}>`,
    `Original-Rcpt-To: ${input.recipientEmail}`,
    ``,
    `--${boundary}`,
    `Content-Type: message/rfc822`,
    ``,
    `From: news@mail.example.com`,
    `To: ${input.recipientEmail}`,
    `Message-ID: <${input.originalMessageId}>`,
    `Subject: Hello`,
    ``,
    `Body`,
    ``,
    `--${boundary}--`,
    ``,
  ].join("\r\n")
}

/** Minimal DSN (multipart/report; delivery-status). */
export function buildDsnMessage(input: {
  reportMessageId: string
  originalMessageId: string
  recipientEmail: string
  action?: string
}): string {
  const boundary = "BOUNDARY_DSN_TEST"
  return [
    `From: MAILER-DAEMON@mx.example.com`,
    `To: reporting-tool@dataaccess.net`,
    `Subject: Delivery Status Notification (Failure)`,
    `Message-ID: <${input.reportMessageId}>`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/report; report-type=delivery-status; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `The message could not be delivered.`,
    ``,
    `--${boundary}`,
    `Content-Type: message/delivery-status`,
    ``,
    `Reporting-MTA: dns; mx.example.com`,
    `Action: ${input.action ?? "failed"}`,
    `Status: 5.1.1`,
    `Final-Recipient: rfc822; ${input.recipientEmail}`,
    `Original-Message-ID: <${input.originalMessageId}>`,
    ``,
    `--${boundary}`,
    `Content-Type: message/rfc822`,
    ``,
    `From: news@mail.example.com`,
    `To: ${input.recipientEmail}`,
    `Message-ID: <${input.originalMessageId}>`,
    `Subject: Hello`,
    ``,
    `Body`,
    ``,
    `--${boundary}--`,
    ``,
  ].join("\r\n")
}

export function buildUnrelatedMessage(messageId: string): string {
  return [
    `From: friend@example.com`,
    `To: reporting-tool@dataaccess.net`,
    `Subject: Hello`,
    `Message-ID: <${messageId}>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `Just a normal email.`,
    ``,
  ].join("\r\n")
}
