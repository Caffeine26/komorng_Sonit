# lib/telemetry/

Error reporting and structured browser logging. Wraps Sentry on the client and
forwards critical errors to the backend log endpoint. Features should NOT
import Sentry directly — go through this module.
