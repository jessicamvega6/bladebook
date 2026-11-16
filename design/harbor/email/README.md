# BladeBook emails

Every email in the MVP (Minimum Viable Product, the first release), drawn in the Harbor look and built as
Amazon SES (Simple Email Service) templates that can be loaded and sent as they are.

**Open `static/index.html`** to see each email rendered with the Coach Dana sample data, at desktop and phone
width, with its plain-text part and template source.

The list comes from `FeatureDecriptions/Email templates Needed:`. Wording follows the Harbor design's sample
copy (`design/harbor/coach/screens-money-profile.js`, `MP_TEMPLATES`) where that exists.

## Files

| Path | What it is |
|---|---|
| `templates.mjs` | The source: every email as a list of blocks (paragraph, lesson list, details box, button, notice, code, amount), with its trigger, sender, headers and sample data |
| `build.mjs` | Builds everything below: `node design/harbor/email/build.mjs` |
| `gallery.html` | The shell for the preview page |
| `ses/<name>.json` | One SES template per email: `TemplateName` and `TemplateContent` (`Subject`, `Html`, `Text`) |
| `ses/sample-data/<name>.json` | The sample `TemplateData` for each template |
| `cognito/cognito-code.html`, `cognito/messages.json` | The one code email Cognito sends, with its subject |
| `static/index.html` | The preview gallery (generated) |

Edit `templates.mjs`, then rebuild. Don't edit `ses/` or `static/` by hand.

## The emails

**To families (8):** booking confirmation, day-of reminder, payment reminder, lesson cancelled by the coach,
schedule change (cancellations, price increases and decreases in one email, ADR-020), skater approved, sign-up
declined, skater removed.

**Shared lessons (8):** invitation, invitation declined, invitation withdrawn, no longer available, joined (one
template for both families, worded by `isInviter`), the other skater can't make it (keep or cancel), cancelled
with no answer, remaining dates cancelled.

**To the coach (5):** morning email, a family cancelled late, unpaid lessons (weekly), lessons that
passed before they could be cancelled, confirm your business email.

**Sent by Cognito (1):** one code email for sign-up, forgot password and a changed email.

## The layout

- 600px wide and table-based, with every style inline, so it holds up in Gmail, Outlook and Apple Mail. Outlook
  gets a fixed 600px wrapper and Arial in place of Figtree.
- Text is 17px and buttons are 18px, at least 48px tall, and full width on a phone, because many readers are older.
- Every email opens with a coral label naming the kind of email, then a headline giving the main fact, so the
  email makes sense before anyone reads the body.
- Family emails show the coach first ("Coach Dana Whitfield, via BladeBook") and say in the footer that a reply
  goes to the coach. Coach emails say that replies aren't read.
- Harbor is light-only. Each email declares `color-scheme: light`, which most mail apps respect. Outlook.com and
  Gmail apps in dark mode may still darken it; the colours were chosen to stay readable if they do.
- Buttons never act on their own. Every one opens a BladeBook page that needs signing in, where the person
  chooses, because mail scanners open links (ADR-026 d5). This covers the shared-lesson invitation, keep or
  cancel, and confirming a business email.

## Loading the templates into SES

With the AWS CLI (Command-Line Interface), one template per file:

```
aws sesv2 create-email-template --cli-input-json file://design/harbor/email/ses/booking-confirmation.json
aws sesv2 update-email-template --cli-input-json file://design/harbor/email/ses/booking-confirmation.json
```

With Terraform, read the same files:

```hcl
locals {
  email_dir = "${path.module}/../design/harbor/email/ses"
  email_templates = {
    for f in fileset(local.email_dir, "*.json") :
    trimsuffix(f, ".json") => jsondecode(file("${local.email_dir}/${f}")).TemplateContent
  }
}

resource "aws_ses_template" "email" {
  for_each = local.email_templates
  name     = "${var.env}-${each.key}"
  subject  = each.value.Subject
  html     = each.value.Html
  text     = each.value.Text
}
```

Give each name the environment as a prefix (`dev-`, `prod-`) so the accounts can't mix them up.

To check a template against its sample data once it's in SES:

```
aws sesv2 test-render-email-template --template-name booking-confirmation \
  --template-data "$(cat design/harbor/email/ses/sample-data/booking-confirmation.json)"
```

## Sending one from a Lambda

```java
sesClient.sendEmail(SendEmailRequest.builder()
    .fromEmailAddress("Dana Whitfield via BladeBook <lessons@" + domain + ">")
    .replyToAddresses(coach.businessEmail())          // family emails only (ADR-016 d8)
    .destination(d -> d.toAddresses(client.email()))
    .content(c -> c.template(t -> t
        .templateName(env + "-booking-confirmation")
        .templateData(json)))                           // the same shape as ses/sample-data/
    .build());
```

## What the sending Lambda must pass

SES fills in placeholders and does nothing else. The templates use only `{{name}}`, `{{#if name}}…{{else}}…{{/if}}`
and `{{#each list}}…{{/each}}`, so:

- **Format everything first.** Dates (`Wed, Oct 21`), times (`6:30 AM`), lengths (`30 min`) and amounts (`$50`) arrive
  as finished strings, in the coach's timezone and currency.
- **Pass the choices as true or false.** SES can't compare values, so wording that depends on a count comes from
  flags the Lambda sets: `oneLesson`, `plural`, `shared`, `isInviter`, `repeats`. An empty list counts as false, so
  `{{#if cancelled}}` hides the Cancelled section when nothing was cancelled.
- **Inside a list, only the item's own fields are visible.** `{{coachFirst}}` doesn't work inside `{{#each lessons}}`;
  put what's needed on each item.
- **Don't escape anything yourself.** SES escapes `{{name}}` in the HTML. The plain-text part uses `{{{name}}}`, so an `&`
  stays an `&` there. The coach's payment instructions are passed as a list of lines (`instructionLines`), so each
  line break shows.

The sample data in `ses/sample-data/` is the contract: each file holds every field its template uses. The build
fails if a template uses a field its sample doesn't have, and the previews were checked against the Handlebars
library itself (4.7.8) to make sure they match what SES renders.

## Cognito's code email

This isn't an SES template. **BladeBook uses no Cognito custom message trigger** (owner, 2026-11-06), so Cognito
sends the user pool's one verification message for every code: sign-up, forgot password and a changed email.
Cognito fills in only `{####}` (the code), so the email:

- works for all three cases: "Enter this code on the BladeBook page that asked for it";
- names no coach or family;
- states no expiry, because a sign-up code lasts 24 hours and a password code lasts 1 hour.

Paste the HTML from `cognito/cognito-code.html` into the user pool's verification message, with the subject from
`messages.json`. It is about 5,500 characters, well under Cognito's 20,000-character limit.

Set the user pool to send its email through SES, from the same domain as the other emails. Left at Cognito's
default, it sends from Cognito's own address with a low daily limit.

## Open questions

1. **The sending address.** The templates assume `lessons@<domain>` for From and `no-reply@<domain>` for coach
   emails. The domain isn't chosen yet.
2. **Who sends the business-email confirmation.** `architecture.md` doesn't name a function; it's marked `api-coach` here.
3. **The undecided emails** below.

## Not drawn

- **Phase 2:** the coach's daily report (owner, 2026-11-11; its MVP draft is `coach-daily-report` in `templates.mjs` at commit `fc93e38`); "just booked, then cancelled"; the missed-lesson fee reminder; coach-chosen cancellation reasons.
- **Phase 2, shared lessons (ADR-033 d6):** the consent-link invitation, the two "not yet accepted" warnings,
  "expired, not yet accepted", "invited skater not accepted", "no longer available after the coach's Accept".
- **Undecided (ADR-031):** a "kept at full price" confirmation; a confirmation for cancelling one freed date.
  ~~Whether a shared series that loses a skater sends one email per date or one per series.~~ *Ruled 2026-11-13 by the
  owner (G-38): one per series. The invitation, joined, declined, withdrawn, no longer available, keep or cancel and
  the coach's late-cancellation emails each list every date they cover (`lessons`, with `oneLesson`, `lessonCount`
  and the first `date` and `time` for the one-date wording). The day-of reminder is one per family per coach per
  day (G-37).*
