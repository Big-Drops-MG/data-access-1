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
  DEFAULT_MAIL_FROM_SUBDOMAIN,
  SesIdentityError,
  buildDnsRecordsFromSes,
  deleteSesDomainIdentity,
  mailFromDomainFor,
  provisionSesDomainIdentity,
} from "./ses-identity.js"
export type {
  DeleteSesIdentityInput,
  DeleteSesIdentityResult,
  DnsRecordDraft,
  ProvisionSesIdentityInput,
  ProvisionedSesIdentity,
  SesIdentityClient,
} from "./ses-identity.js"
