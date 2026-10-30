export const PACKAGE_NAME = "@workspace/emails" as const

export {
  LIST_UNSUBSCRIBE_HEADER,
  LIST_UNSUBSCRIBE_POST,
  LIST_UNSUBSCRIBE_POST_HEADER,
  MailTransportError,
  createMailTransport,
  createSesTransport,
  createSmtpTransport,
} from "./mail-transport.js"
export type {
  MailTransport,
  MailTransportOverrides,
  MailTransportSettings,
  RenderedMessage,
  SendResult,
  SesEmailClient,
  SmtpSender,
} from "./mail-transport.js"
export {
  SesIdentityError,
  buildDnsRecordsFromSes,
  mailFromDomainFor,
  provisionSesDomainIdentity,
} from "./ses-identity.js"
export type {
  DnsRecordDraft,
  ProvisionSesIdentityInput,
  ProvisionedSesIdentity,
  SesIdentityClient,
} from "./ses-identity.js"
