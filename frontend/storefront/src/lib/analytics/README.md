# lib/analytics/

Analytics + product event tracking. Provider-agnostic — wrap whatever vendor
you pick (PostHog, Mixpanel, Plausible) behind a small interface so features
import `track('event_name', { ... })` and stay vendor-free.
