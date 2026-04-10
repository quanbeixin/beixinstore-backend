# Notification Center - Feishu App API Integration

## Scope

This document describes the current notification sending path used by the notification center module.

- Backend stack: Node.js + Express + mysql2/promise
- Layering: routes -> controller -> model
- API prefix: `/api`
- Notification sender: Feishu App API (not webhook)
- Template concept: removed from runtime path, message is configured on rule level

## Current Runtime Behavior

1. Rule management APIs use existing notification module routes:
- `GET /api/notification/rules`
- `POST /api/notification/rules`
- `PUT /api/notification/rules/:id`
- `DELETE /api/notification/rules/:id`

2. Event trigger API:
- `POST /api/notification/event`
- Input: `eventType + data`

3. Event processing flow:
- Load candidate rules by `eventType` and business line
- Evaluate rule condition JSON in model layer
- Resolve receivers
  - Legacy receiver table: `notification_rule_receivers`
  - Fallback receiver config: `receiver_config_json`
- Render rule-level text (`message_title` / `message_content`)
- Send through Feishu App API (`open_id` / `chat_id`)
- Persist send logs

## Storage Strategy

Current implementation now uses a single table set (legacy schema) only:

- `notification_rules`
- `notification_templates`
- `notification_logs`
- `notification_rule_receivers`
- `notification_send_control` (persisted send mode + whitelist; replaces process-memory-only override)

Model behavior:

- `models/NotificationRule.js`
  - direct CRUD on `notification_rules`
  - receiver sync on `notification_rule_receivers`
- `models/NotificationEvent.js`
  - rule matching from `notification_rules`
  - receiver parsing from `notification_rule_receivers`
  - log write to `notification_logs`
  - send text directly from rule message fields (no template lookup)

## Feishu App Configuration

Use environment variables:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_TIMEOUT_MS` (optional, default 8000)
- `NOTIFICATION_SEND_MODE` (optional, default `live`)
  - `live`: normal send
  - `shadow`: rule matching + log only, skip real send
  - `whitelist`: send only to whitelist ids
- `NOTIFICATION_TEST_OPEN_IDS` (optional, comma-separated `open_id`)
- `NOTIFICATION_TEST_CHAT_IDS` (optional, comma-separated `chat_id`)
- `NOTIFICATION_PORTAL_BASE_URL` (optional, e.g. `https://admin.example.com`, used for demand/bug detail action link)

Token strategy:

- Fetch `tenant_access_token` from
  - `POST /open-apis/auth/v3/tenant_access_token/internal`
- In-memory cache with pre-expiry refresh

Send APIs:

- User message: `receive_id_type=open_id`
- Group message: `receive_id_type=chat_id`

### Send Mode Behavior

- `shadow` mode:
  - event/rule processing remains active
  - no real Feishu API send
  - notification logs are written with skipped status

- `whitelist` mode:
  - only targets in whitelist are really sent
  - non-whitelist targets are skipped and logged as skipped

- `live` mode:
  - current default behavior, all matched targets are sent

## UX Constraint Alignment

Frontend rule form no longer asks user for webhook.

- Receiver UI keeps business-friendly fields (role based)
- Technical send credentials are system-level env config
- Rule UI includes direct message title/content configuration for MVP (no template page dependency)

## Known Operational Requirement

If messages are not sent, check these first:

1. Receiver expansion result is empty (no matched users / no `feishu_open_id`)
2. Rule/template disabled
3. Feishu app credential or permission scope issues
