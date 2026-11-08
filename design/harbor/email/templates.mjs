/* BladeBook emails — every MVP email, written once as blocks and built into SES templates.
   Each template's strings use SES's Handlebars placeholders: {{name}}, {{#if name}}…{{else}}…{{/if}},
   {{#each list}}…{{/each}}. Nothing else (no helpers): SES does no date or money formatting, so the
   sending Lambda passes every date, time and amount already formatted in the coach's timezone and currency.
   Source of the list: FeatureDecriptions/Email templates Needed: (MVP only; Phase 2 and undecided emails
   are listed in README.md and not drawn). Wording follows the Harbor design's sample copy
   (design/harbor/coach/screens-money-profile.js, MP_TEMPLATES) where it exists. */

/* ---------- shared sample data (the Harbor demo: Coach Dana Whitfield, Wed Oct 14 2026) ---------- */
const COACH = {
  coachName: 'Dana Whitfield', coachFirst: 'Dana', coachInitials: 'DW',
  coachBusinessEmail: 'dana@whitfieldskating.com',
};
const URLS = {
  myBookingsUrl: 'https://bladebook.app/bookings',
  bookUrl: 'https://bladebook.app/book',
  homeUrl: 'https://bladebook.app/',
};
const FAMILY = { ...COACH, ...URLS, familyFirst: 'Grace', noticeHours: '24' };
const COACH_SELF = {
  coachFirst: 'Dana',
  rinksideUrl: 'https://bladebook.app/coach/rinkside',
  calendarUrl: 'https://bladebook.app/coach/calendar',
  lessonsUrl: 'https://bladebook.app/coach/lessons',
  paymentsUrl: 'https://bladebook.app/coach/payments',
};

/* Who each email comes from. Family emails: From "<coach> via BladeBook", Reply-To the coach's
   business email (ADR-016 d8). Coach emails: From "BladeBook", Reply-To no-reply. */
const FROM_FAMILY = { from: '{{coachName}} via BladeBook <lessons@{domain}>', replyTo: '{{coachBusinessEmail}}' };
const FROM_COACH = { from: 'BladeBook <lessons@{domain}>', replyTo: 'no-reply@{domain}' };

export const TEMPLATES = [
  /* =========================== To families =========================== */
  {
    name: 'booking-confirmation', group: 'families', title: 'Booking confirmation',
    when: 'When a family books one or more lessons.', sender: 'λ Booking confirmation', switchable: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: '{{#if oneLesson}}Booked: {{skaterNames}}’s lesson on {{firstDate}}{{else}}Booked: {{lessonCount}} lessons with Coach {{coachFirst}}{{/if}}',
    preheader: '{{#if oneLesson}}{{firstDate}} at {{firstTime}} at {{rink}}.{{else}}Starting {{firstDate}} at {{firstTime}}.{{/if}}',
    eyebrow: 'Lesson booked',
    headline: '{{#if oneLesson}}{{skaterNames}} is booked{{else}}{{skaterNames}} {{#if plural}}are{{else}}is{{/if}} booked for {{lessonCount}} lessons{{/if}}',
    blocks: [
      'Hi {{familyFirst}},',
      'Here’s what you booked with Coach {{coachFirst}}:',
      { lessons: { each: 'lessons', primary: '{{date}} · {{time}}', secondary: '{{skater}} · {{length}} · {{rink}}{{#if sharedWith}} · shared with {{sharedWith}}{{/if}}', aside: '{{price}}' } },
      { if: 'repeats', then: [{ notice: { tone: 'info', text: 'These lessons repeat every week until <b>{{repeatsUntil}}</b>. You can change or stop them on My bookings.' } }] },
      'Need to cancel? Use My bookings. Cancelling within {{noticeHours}} hours of a lesson may mean a fee.',
      { button: { label: 'See my bookings', href: '{{myBookingsUrl}}' } },
    ],
    sample: {
      ...FAMILY, oneLesson: false, plural: false, skaterNames: 'Mia', lessonCount: '3', firstDate: 'Wed, Oct 21', firstTime: '6:30 AM', rink: 'Pelham Civic Center',
      repeats: true, repeatsUntil: 'Wed, Nov 4',
      lessons: [
        { date: 'Wed, Oct 21', time: '6:30 AM', skater: 'Mia', length: '30 min', rink: 'Pelham Civic Center', price: '$50' },
        { date: 'Wed, Oct 28', time: '6:30 AM', skater: 'Mia', length: '30 min', rink: 'Pelham Civic Center', price: '$50' },
        { date: 'Wed, Nov 4', time: '6:30 AM', skater: 'Mia', length: '30 min', rink: 'Pelham Civic Center', price: '$50' },
      ],
    },
  },
  {
    name: 'day-of-reminder', group: 'families', title: 'Day-of reminder',
    when: 'The morning of each lesson, one email per family per day.', sender: 'λ Day-of reminder', switchable: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: 'Today: {{skaterNames}}’s lesson{{#if plural}}s{{/if}} at {{firstTime}}',
    preheader: 'With Coach {{coachFirst}} at {{rink}}.',
    eyebrow: 'Today',
    headline: '{{skaterNames}} skate{{#if plural}}{{else}}s{{/if}} with Coach {{coachFirst}} today',
    blocks: [
      'Hi {{familyFirst}},',
      { lessons: { each: 'lessons', primary: '{{time}} · {{skater}}', secondary: '{{length}} · {{rink}}{{#if sharedWith}} · shared with {{sharedWith}}{{/if}}' } },
      'See you at the rink.',
      { fine: 'Can’t make it? Cancel on My bookings. The lesson is inside Coach {{coachFirst}}’s {{noticeHours}}-hour notice period, so a fee may apply.' },
      { button: { label: 'See my bookings', href: '{{myBookingsUrl}}', secondary: true } },
    ],
    sample: {
      ...FAMILY, skaterNames: 'Mia and Noah', plural: true, firstTime: '6:30 AM', rink: 'Pelham Civic Center',
      lessons: [
        { time: '6:30 AM', skater: 'Mia', length: '30 min', rink: 'Pelham Civic Center' },
        { time: '7:00 AM', skater: 'Noah', length: '30 min', rink: 'Pelham Civic Center', sharedWith: 'Leo M.' },
      ],
    },
  },
  {
    name: 'payment-reminder', group: 'families', title: 'Payment reminder',
    when: 'After a lesson is checked in.', sender: 'λ Payment reminder', switchable: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: 'Payment for {{skater}}’s lesson on {{date}}',
    preheader: '{{amount}} for the lesson on {{date}}.',
    eyebrow: 'Payment',
    headline: 'Thanks for {{skater}}’s lesson',
    blocks: [
      'Hi {{familyFirst}},',
      'Thanks for {{skater}}’s lesson with Coach {{coachFirst}} on <b>{{date}} at {{time}}</b>.',
      { amount: { label: '{{#if shared}}{{skater}}’s share of the shared lesson{{else}}Amount for this lesson{{/if}}', value: '{{amount}}' } },
      { h: 'How to pay Coach {{coachFirst}}' },
      { lines: 'instructionLines' },
      { if: 'methods', then: [{ lessons: { each: 'methods', primary: '{{label}}', aside: '{{handle}}' } }] },
      { fine: 'Already paid? You don’t need to do anything. Questions about payment? Reply to this email and it goes to Coach {{coachFirst}}.' },
    ],
    sample: {
      ...FAMILY, skater: 'Mia', date: 'Wed, Oct 14', time: '6:30 AM', amount: '$50', shared: false,
      instructionLines: [{ line: 'Please pay within a week of the lesson.' }, { line: 'Cash is fine at the rink, or use one of these:' }],
      methods: [{ label: 'Venmo', handle: '@dana-skates' }, { label: 'Cash App', handle: '$DanaWhitfield' }, { label: 'Cash', handle: 'At the rink' }],
    },
  },
  {
    name: 'lesson-cancelled-by-coach', group: 'families', title: 'Lesson cancelled by the coach',
    when: 'When the coach cancels a lesson, a day or a week. One email per family.', sender: 'λ Change notifier', always: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: '{{#if oneLesson}}Cancelled: {{skaterNames}}’s lesson on {{firstDate}}{{else}}Cancelled: {{lessonCount}} lessons with Coach {{coachFirst}}{{/if}}',
    preheader: 'You won’t be charged.',
    eyebrow: 'Lesson cancelled',
    headline: 'Coach {{coachFirst}} cancelled {{#if oneLesson}}a lesson{{else}}{{lessonCount}} lessons{{/if}}',
    blocks: [
      'Hi {{familyFirst}},',
      'Coach {{coachFirst}} can’t teach {{#if oneLesson}}this lesson{{else}}these lessons{{/if}}, so {{#if oneLesson}}it’s{{else}}they’re{{/if}} cancelled:',
      { lessons: { each: 'lessons', primary: '{{date}} · {{time}}', secondary: '{{skater}} · {{rink}}', strike: true } },
      { notice: { tone: 'success', text: 'You won’t be charged.' } },
      { button: { label: 'Book another time', href: '{{bookUrl}}' } },
    ],
    sample: {
      ...FAMILY, oneLesson: true, skaterNames: 'Mia', firstDate: 'Wed, Oct 21', lessonCount: '1',
      lessons: [{ date: 'Wed, Oct 21', time: '6:30 AM', skater: 'Mia', rink: 'Pelham Civic Center' }],
    },
  },
  {
    name: 'schedule-change', group: 'families', title: 'Schedule change',
    when: 'When a coach’s schedule save cancels or re-prices a family’s lessons. One email per family per save (ADR-020).', sender: 'λ Change notifier', always: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: 'Changes to your upcoming lessons with Coach {{coachFirst}}',
    preheader: '{{#if cancelled}}Some lessons are cancelled. {{/if}}{{#if priceDown}}Good news: some lessons cost less. {{/if}}{{#if priceUp}}Some later lessons have a new price.{{/if}}',
    eyebrow: 'Schedule change',
    headline: 'Coach {{coachFirst}} changed their schedule',
    blocks: [
      'Hi {{familyFirst}},',
      'This changes some of your upcoming lessons.',
      { if: 'cancelled', then: [
        { h: 'Cancelled' },
        { lessons: { each: 'cancelled', primary: '{{date}} · {{time}}', secondary: '{{skater}}', strike: true } },
        { fine: 'You won’t be charged for these. Book another time on BladeBook.' },
      ] },
      { if: 'priceDown', then: [
        { h: 'Good news: {{priceDownSummary}}' },
        { lessons: { each: 'priceDown', primary: '{{date}} · {{time}}', secondary: '{{skater}}', aside: '<s>{{oldPrice}}</s> {{newPrice}}' } },
      ] },
      { if: 'priceUp', then: [
        { h: 'New price' },
        { lessons: { each: 'priceUp', primary: '{{date}} · {{time}}', secondary: '{{skater}}', aside: '{{oldPrice}} → <b>{{newPrice}}</b>' } },
        { fine: 'A higher price applies only to lessons more than {{noticeHours}} hours away. If you’d rather not keep a lesson at the new price, you can cancel it on My bookings with no charge until the notice period starts.' },
      ] },
      { button: { label: 'See my bookings', href: '{{myBookingsUrl}}' } },
    ],
    sample: {
      ...FAMILY,
      cancelled: [{ date: 'Mon, Nov 2', time: '6:00 AM', skater: 'Mia' }],
      priceDown: [], priceDownSummary: '',
      priceUp: [{ date: 'Wed, Nov 4', time: '6:30 AM', skater: 'Mia', oldPrice: '$50', newPrice: '$55' }, { date: 'Wed, Nov 11', time: '6:30 AM', skater: 'Mia', oldPrice: '$50', newPrice: '$55' }],
    },
  },
  {
    name: 'skater-approved', group: 'families', title: 'Skater approved',
    when: 'When the coach approves a skater. With several coaches, one per coach.', sender: 'λ Student link sync', switchable: false,
    ...FROM_FAMILY, to: 'sarah.park@example.com',
    subject: '{{skater}} can now book lessons with Coach {{coachFirst}}',
    preheader: 'Coach {{coachFirst}} approved {{skater}}. Booking is open.',
    eyebrow: 'You’re all set',
    headline: 'Coach {{coachFirst}} approved {{skater}}',
    blocks: [
      'Hi {{familyFirst}},',
      'Good news: Coach {{coachName}} approved {{skater}}. You can see Coach {{coachFirst}}’s open times and book lessons now.',
      { button: { label: 'Book a lesson', href: '{{bookUrl}}' } },
      { fine: 'Sign in with the email and password you used to sign up.' },
    ],
    sample: { ...FAMILY, familyFirst: 'Sarah', skater: 'Ava' },
  },
  {
    name: 'signup-declined', group: 'families', title: 'Sign-up declined',
    when: 'When the coach declines a new skater (ADR-002 d2b).', sender: 'λ Student link sync', always: true,
    ...FROM_FAMILY, to: 'sarah.park@example.com',
    subject: 'Your sign-up with {{coachName}}',
    preheader: '{{skater}}’s sign-up wasn’t accepted.',
    eyebrow: 'Sign-up',
    headline: 'About {{skater}}’s sign-up',
    blocks: [
      'Hi {{familyFirst}},',
      '{{coachName}} doesn’t have room for new students right now, so {{skater}}’s sign-up wasn’t accepted.',
      'If you have questions, reply to this email and it goes to Coach {{coachFirst}}.',
    ],
    sample: { ...FAMILY, familyFirst: 'Sarah', skater: 'Ava' },
  },
  {
    name: 'skater-removed', group: 'families', title: 'Skater removed by the coach',
    when: 'When the coach removes a skater and that cancels upcoming lessons. Not sent when nothing was cancelled.', sender: 'λ Student link sync', always: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: '{{skater}}’s upcoming lessons with Coach {{coachFirst}} are cancelled',
    preheader: 'You won’t be charged for them.',
    eyebrow: 'Lessons cancelled',
    headline: '{{skater}}’s upcoming lessons are cancelled',
    blocks: [
      'Hi {{familyFirst}},',
      'Coach {{coachName}} is no longer teaching {{skater}}, so these upcoming lessons are cancelled:',
      { lessons: { each: 'lessons', primary: '{{date}} · {{time}}', secondary: '{{rink}}', strike: true } },
      { notice: { tone: 'success', text: 'You won’t be charged for these lessons. Past lessons stay on your account.' } },
      'If you have questions, reply to this email and it goes to Coach {{coachFirst}}.',
    ],
    sample: {
      ...FAMILY, skater: 'Noah',
      lessons: [{ date: 'Fri, Oct 16', time: '7:00 AM', rink: 'Pelham Civic Center' }, { date: 'Fri, Oct 23', time: '7:00 AM', rink: 'Pelham Civic Center' }],
    },
  },

  /* ---------- Shared lessons (ADR-026, ADR-031, ADR-033) ---------- */
  {
    name: 'share-invitation', group: 'shared', title: 'Invitation to share a lesson',
    when: 'To the invited family, when another family enters their skater’s share code, or invites a skater onto a freed place (ADR-031 d10).', sender: 'λ Invite (consumer-invite)', always: true,
    ...FROM_FAMILY, to: 'tom.okafor@example.com',
    subject: '{{inviterName}} invited {{skater}} to share a lesson',
    preheader: '{{date}} at {{time}} with Coach {{coachFirst}}. {{skater}}’s share is {{share}}.',
    eyebrow: 'Shared lesson invitation',
    headline: '{{inviterName}} invited {{skater}} to share a lesson',
    blocks: [
      'Hi {{familyFirst}},',
      '{{inviterName}} invited {{skater}} to share {{inviterSkater}}’s lesson with Coach {{coachFirst}}. The lesson’s price is split, so {{skater}}’s share is {{share}}.',
      { details: { rows: [['When', '{{date}} at {{time}}'], ['Where', '{{rink}}'], ['Length', '{{length}}'], ['{{skater}}’s share', '<b>{{share}}</b> (the lesson is {{fullPrice}})']] } },
      'If you accept, {{skater}} is booked straight away. If nobody answers before the lesson starts, the invitation expires and nothing is booked.',
      { button: { label: 'See the invitation', href: '{{invitationUrl}}' } },
      { fine: 'The button opens BladeBook and asks you to sign in. Nothing changes until you choose Accept or Decline there.' },
    ],
    sample: {
      ...FAMILY, familyFirst: 'Tom', inviterName: 'Grace Chen', inviterSkater: 'Mia', skater: 'Zoe',
      date: 'Fri, Oct 16', time: '8:30 AM', rink: 'Pelham Civic Center', length: '30 min', share: '$25', fullPrice: '$50',
      invitationUrl: 'https://bladebook.app/invitations/8f2c1a',
    },
  },
  {
    name: 'share-invitation-declined', group: 'shared', title: 'Shared lesson invitation declined',
    when: 'To the inviting family, when the invited family declines.', sender: 'λ Invite (consumer-invite)', always: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: '{{inviteeName}} declined the invitation for {{inviteeSkater}}',
    preheader: '{{skater}}’s lesson on {{date}} goes ahead as a private lesson.',
    eyebrow: 'Shared lesson',
    headline: '{{inviteeSkater}} won’t be joining',
    blocks: [
      'Hi {{familyFirst}},',
      '{{inviteeName}} declined your invitation for {{inviteeSkater}} to share {{skater}}’s lesson. The lesson goes ahead as a private lesson for {{skater}}.',
      { details: { rows: [['When', '{{date}} at {{time}}'], ['Where', '{{rink}}'], ['Price', '{{price}}']] } },
      { button: { label: 'See my bookings', href: '{{myBookingsUrl}}', secondary: true } },
    ],
    sample: { ...FAMILY, inviteeName: 'Tom Okafor', inviteeSkater: 'Zoe', skater: 'Mia', date: 'Fri, Oct 16', time: '8:30 AM', rink: 'Pelham Civic Center', price: '$50' },
  },
  {
    name: 'share-invitation-withdrawn', group: 'shared', title: 'Shared lesson invitation withdrawn',
    when: 'To the invited family, when the inviting family withdraws the invitation.', sender: 'λ Invite (consumer-invite)', always: true,
    ...FROM_FAMILY, to: 'tom.okafor@example.com',
    subject: '{{inviterName}} withdrew the invitation for {{skater}}',
    preheader: 'Nothing was booked for {{skater}}.',
    eyebrow: 'Shared lesson',
    headline: 'The invitation was withdrawn',
    blocks: [
      'Hi {{familyFirst}},',
      '{{inviterName}} withdrew the invitation for {{skater}} to share the lesson with Coach {{coachFirst}} on <b>{{date}} at {{time}}</b>.',
      { notice: { tone: 'info', text: 'Nothing was booked for {{skater}}, and you don’t need to do anything.' } },
    ],
    sample: { ...FAMILY, familyFirst: 'Tom', inviterName: 'Grace Chen', skater: 'Zoe', date: 'Fri, Oct 16', time: '8:30 AM' },
  },
  {
    name: 'share-no-longer-available', group: 'shared', title: 'Shared lesson no longer available',
    when: 'To the invited family, when the invitation reaches the lesson’s start unanswered, or they try to accept and the lesson has gone or their skater is no longer the coach’s student.', sender: 'λ Invite (consumer-invite)', always: true,
    ...FROM_FAMILY, to: 'tom.okafor@example.com',
    subject: '{{inviterName}}’s invitation is no longer available',
    preheader: 'Nothing was booked for {{skater}}.',
    eyebrow: 'Shared lesson',
    headline: 'This invitation is no longer available',
    blocks: [
      'Hi {{familyFirst}},',
      '{{inviterName}}’s invitation for {{skater}} to share the lesson with Coach {{coachFirst}} on <b>{{date}} at {{time}}</b> is no longer available, so {{skater}} wasn’t added.',
      { notice: { tone: 'info', text: 'Nothing was booked for {{skater}}, and you won’t be charged.' } },
      { button: { label: 'Book a lesson', href: '{{bookUrl}}', secondary: true } },
    ],
    sample: { ...FAMILY, familyFirst: 'Tom', inviterName: 'Grace Chen', skater: 'Zoe', date: 'Fri, Oct 16', time: '8:30 AM' },
  },
  {
    name: 'share-joined', group: 'shared', title: 'Shared lesson joined',
    when: 'To both families, when the invited skater joins (ADR-031 d14). The same template, worded for each side by isInviter.', sender: 'λ Invite (consumer-invite)', always: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com and tom.okafor@example.com',
    subject: '{{#if isInviter}}{{otherSkater}} is sharing {{skater}}’s lesson on {{date}}{{else}}{{skater}} is booked to share a lesson on {{date}}{{/if}}',
    preheader: '{{skater}}’s share is {{share}}.',
    eyebrow: 'Shared lesson booked',
    headline: '{{skater}} and {{otherSkater}} are sharing a lesson',
    blocks: [
      'Hi {{familyFirst}},',
      '{{#if isInviter}}{{otherFamily}} accepted your invitation. {{otherSkater}} is now sharing {{skater}}’s lesson with Coach {{coachFirst}}, so the price is split.{{else}}{{skater}} is booked to share {{otherSkater}}’s lesson with Coach {{coachFirst}}.{{/if}}',
      { details: { rows: [['When', '{{date}} at {{time}}'], ['Where', '{{rink}}'], ['Skaters', '{{skater}} and {{otherSkater}}'], ['{{skater}}’s share', '<b>{{share}}</b> (the lesson is {{fullPrice}})']] } },
      'Need to cancel? Use My bookings. Cancelling within {{noticeHours}} hours of the lesson may mean a fee.',
      { button: { label: 'See my bookings', href: '{{myBookingsUrl}}' } },
    ],
    sample: { ...FAMILY, isInviter: true, otherFamily: 'Tom Okafor', skater: 'Mia', otherSkater: 'Zoe', date: 'Fri, Oct 16', time: '8:30 AM', rink: 'Pelham Civic Center', share: '$25', fullPrice: '$50' },
  },
  {
    name: 'share-other-cant-make-it', group: 'shared', title: 'Shared lesson — the other skater can’t make it',
    when: 'To the family who stays, when the other skater leaves before the notice period. Answer by: the start of the notice period or 7 days after the other skater left, whichever comes first (ADR-031 d8).', sender: 'λ Invite (consumer-invite)', always: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: 'Please choose: keep or cancel {{skater}}’s lesson on {{date}}',
    preheader: '{{otherSkater}} can’t make it. Answer by {{answerBy}}.',
    eyebrow: 'Your answer needed',
    headline: '{{otherSkater}} can’t make {{skater}}’s shared lesson',
    blocks: [
      'Hi {{familyFirst}},',
      '{{otherSkater}} won’t be at the lesson they were sharing with {{skater}}. You can keep it as a private lesson for {{skater}}, or cancel it with no charge.',
      { details: { rows: [['When', '{{date}} at {{time}}'], ['Where', '{{rink}}'], ['Keep it', 'Private lesson at the full <b>{{fullPrice}}</b> ({{skater}}’s share was {{share}})'], ['Cancel it', 'No charge']] } },
      { notice: { tone: 'warning', title: 'Please answer by {{answerBy}}', text: 'If you don’t answer by then, the lesson is cancelled with no charge.' } },
      { button: { label: 'Choose on My bookings', href: '{{myBookingsUrl}}' } },
      { fine: 'The button opens BladeBook and asks you to sign in. Nothing changes until you choose there.' },
    ],
    sample: { ...FAMILY, skater: 'Mia', otherSkater: 'Owen B.', date: 'Mon, Oct 19', time: '6:00 AM', rink: 'Pelham Civic Center', fullPrice: '$50', share: '$25', answerBy: 'Sun, Oct 18 at 6:00 AM' },
  },
  {
    name: 'share-cancelled-no-answer', group: 'shared', title: 'Shared lesson cancelled, no answer',
    when: 'To the family who stays, when they didn’t answer by the answer-by time. Sent at once by the hourly check.', sender: 'λ Change notifier (after the deadline sweep)', always: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: 'Cancelled: {{skater}}’s lesson on {{date}}',
    preheader: 'No answer by {{answerBy}}, so it’s cancelled with no charge.',
    eyebrow: 'Lesson cancelled',
    headline: '{{skater}}’s lesson on {{date}} is cancelled',
    blocks: [
      'Hi {{familyFirst}},',
      'We asked whether to keep {{skater}}’s lesson on <b>{{date}} at {{time}}</b> as a private lesson after {{otherSkater}} couldn’t make it. We didn’t get an answer by {{answerBy}}, so the lesson is cancelled.',
      { notice: { tone: 'success', text: 'You won’t be charged.' } },
      { button: { label: 'Book another time', href: '{{bookUrl}}' } },
    ],
    sample: { ...FAMILY, skater: 'Mia', otherSkater: 'Owen B.', date: 'Mon, Oct 19', time: '6:00 AM', answerBy: 'Sun, Oct 18 at 6:00 AM' },
  },
  {
    name: 'share-dates-cancelled', group: 'shared', title: 'Shared lesson dates cancelled',
    when: 'To the family who stays, when they choose “Cancel all remaining dates” (ADR-031 d9). The coach isn’t emailed.', sender: 'λ Change notifier', always: true,
    ...FROM_FAMILY, to: 'grace.chen@example.com',
    subject: 'Cancelled: {{lessonCount}} of {{skater}}’s shared lessons',
    preheader: 'No charge for any of them.',
    eyebrow: 'Lessons cancelled',
    headline: 'You cancelled {{lessonCount}} lessons',
    blocks: [
      'Hi {{familyFirst}},',
      'As you asked, these remaining dates of {{skater}}’s shared lesson with Coach {{coachFirst}} are cancelled:',
      { lessons: { each: 'lessons', primary: '{{date}} · {{time}}', secondary: '{{rink}}', strike: true } },
      { notice: { tone: 'success', text: 'You won’t be charged for any of them.' } },
      { button: { label: 'Book another time', href: '{{bookUrl}}', secondary: true } },
    ],
    sample: {
      ...FAMILY, skater: 'Mia', lessonCount: '3',
      lessons: [{ date: 'Mon, Oct 26', time: '6:00 AM', rink: 'Pelham Civic Center' }, { date: 'Mon, Nov 2', time: '6:00 AM', rink: 'Pelham Civic Center' }, { date: 'Mon, Nov 9', time: '6:00 AM', rink: 'Pelham Civic Center' }],
    },
  },

  /* =========================== To the coach =========================== */
  {
    name: 'coach-morning', group: 'coach', title: 'Morning email',
    when: 'Around 7 AM on days with lessons, to the coach’s login email (ADR-023). Switch is Phase 2.', sender: 'λ Day-of reminder', switchable: true,
    ...FROM_COACH, to: 'dana.whitfield@gmail.com (login email)',
    subject: 'Today: {{lessonCount}} lessons, starting at {{firstTime}}',
    preheader: 'Open the rinkside app to check skaters in.',
    eyebrow: '{{today}}',
    headline: '{{lessonCount}} lessons today',
    blocks: [
      'Good morning, {{coachFirst}}.',
      { button: { label: 'Open the rinkside app', href: '{{rinksideUrl}}' } },
      { fine: 'Check skaters in from your phone. It uses the same email and password as the coach website.' },
      { h: 'Your lessons' },
      { lessons: { each: 'lessons', primary: '{{time}} · {{skaters}}', secondary: '{{length}} · {{rink}}{{#if shared}} · shared{{/if}}' } },
    ],
    sample: {
      ...COACH_SELF, today: 'Wed, Oct 14', lessonCount: '5', firstTime: '6:00 AM',
      lessons: [
        { time: '6:00 AM', skaters: 'Sam R. & Leo M.', length: '30 min', rink: 'Pelham Civic Center', shared: true },
        { time: '6:30 AM', skaters: 'Mia C.', length: '30 min', rink: 'Pelham Civic Center' },
        { time: '7:00 AM', skaters: 'Noah C.', length: '30 min', rink: 'Pelham Civic Center' },
        { time: '8:30 AM', skaters: 'Owen B.', length: '30 min', rink: 'Pelham Civic Center' },
        { time: '10:00 AM', skaters: 'Leo M.', length: '45 min', rink: 'Pelham Civic Center' },
      ],
    },
  },
  {
    name: 'coach-daily-report', group: 'coach', title: 'Daily report',
    when: 'Every evening at 9 PM, to the coach’s login email. A snapshot: a check-in sent later doesn’t re-send it.', sender: 'λ End-of-day report', switchable: true,
    ...FROM_COACH, to: 'dana.whitfield@gmail.com (login email)',
    subject: 'Today: {{lessonCount}} lessons, {{checkedInCount}} checked in{{#if pending}}, {{pendingCount}} not recorded{{/if}}',
    preheader: '{{#if pending}}{{pendingCount}} not recorded yet.{{else}}Everything is recorded.{{/if}}',
    eyebrow: 'Daily report · {{today}}',
    headline: '{{#if pending}}{{pendingCount}} not recorded yet{{else}}Everything is recorded{{/if}}',
    blocks: [
      { stats: [['Lessons', '{{lessonCount}}'], ['Checked in', '{{checkedInCount}}'], ['No-show', '{{noShowCount}}'], ['Not recorded', '{{pendingCount}}']] },
      { if: 'pending', then: [
        { h: 'Not recorded' },
        { lessons: { each: 'pending', primary: '{{time}} · {{skater}}', secondary: '{{rink}}' } },
        { notice: { tone: 'warning', text: 'If you checked these in at the rink without signal, open the rinkside app where you have signal and they’ll send. Otherwise, record them on your lesson list.' } },
        { button: { label: 'Open the rinkside app', href: '{{rinksideUrl}}' } },
        { fine: 'Or record them on your <a href="{{lessonsUrl}}" style="color:#0E6C68;font-weight:700">lesson list</a>.' },
      ] },
      { if: 'checkedIn', then: [
        { h: 'Checked in' },
        { lessons: { each: 'checkedIn', primary: '{{time}} · {{skater}}' } },
      ] },
      { if: 'noShow', then: [
        { h: 'No-show' },
        { lessons: { each: 'noShow', primary: '{{time}} · {{skater}}' } },
      ] },
    ],
    sample: {
      ...COACH_SELF, today: 'Wed, Oct 14', lessonCount: '5', checkedInCount: '4', noShowCount: '0', pendingCount: '1',
      pending: [{ time: '10:00 AM', skater: 'Leo M.', rink: 'Pelham Civic Center' }],
      checkedIn: [{ time: '6:00 AM', skater: 'Sam R. & Leo M.' }, { time: '6:30 AM', skater: 'Mia C.' }, { time: '7:00 AM', skater: 'Noah C.' }, { time: '8:30 AM', skater: 'Owen B.' }],
      noShow: [],
    },
  },
  {
    name: 'coach-late-cancellation', group: 'coach', title: 'A family cancelled late',
    when: 'When a family cancels inside the coach’s notice period (ADR-009). Earlier cancellations send nothing.', sender: 'λ Change notifier', always: true,
    ...FROM_COACH, to: 'dana.whitfield@gmail.com (login email)',
    subject: 'Late cancellation: {{skater}}, {{date}} at {{time}}',
    preheader: '{{familyName}} cancelled inside your {{noticeHours}}-hour notice period.',
    eyebrow: 'Late cancellation',
    headline: '{{skater}} cancelled {{date}} at {{time}}',
    blocks: [
      '{{familyName}} cancelled {{skater}}’s lesson on <b>{{date}} at {{time}}</b>, inside your {{noticeHours}}-hour notice period. You may charge a late cancellation fee.',
      { details: { rows: [['Lesson', '{{date}} at {{time}}'], ['Where', '{{rink}}'], ['Cancelled', '{{cancelledAt}}'], ['Family', '{{familyName}}']] } },
      '{{#if sharedWith}}{{sharedWith}} keeps the lesson at their share.{{else}}The time is open for booking again.{{/if}}',
      { button: { label: 'See your calendar', href: '{{calendarUrl}}' } },
    ],
    sample: { ...COACH_SELF, familyName: 'Grace Chen', skater: 'Mia C.', date: 'Fri, Oct 16', time: '8:30 AM', rink: 'Pelham Civic Center', cancelledAt: 'Thu, Oct 15 at 7:42 PM', noticeHours: '24', sharedWith: '' },
  },
  {
    name: 'coach-unpaid-weekly', group: 'coach', title: 'Unpaid lessons',
    when: 'Weekly, Monday morning, listing each lesson once when it first crosses the threshold (ADR-018).', sender: 'λ Unpaid-lesson reminder', switchable: true,
    ...FROM_COACH, to: 'dana.whitfield@gmail.com (login email)',
    subject: '{{lessonCount}} lessons are still unpaid',
    preheader: '{{total}} in all.',
    eyebrow: 'Weekly · unpaid lessons',
    headline: '{{lessonCount}} lessons are still unpaid',
    blocks: [
      'These lessons are more than a week old and haven’t been marked paid:',
      { lessons: { each: 'lessons', primary: '{{skater}}', secondary: '{{date}}', aside: '{{amount}}' } },
      { amount: { label: 'Total', value: '{{total}}' } },
      'Mark each one paid or waived on Payments.',
      { button: { label: 'Open Payments', href: '{{paymentsUrl}}' } },
    ],
    sample: {
      ...COACH_SELF, lessonCount: '4', total: '$175',
      lessons: [{ skater: 'Leo M.', date: 'Fri, Sep 4', amount: '$50' }, { skater: 'Ella A.', date: 'Fri, Oct 2', amount: '$25' }, { skater: 'Ella A.', date: 'Fri, Oct 9', amount: '$50' }, { skater: 'Owen B.', date: 'Mon, Oct 5', amount: '$50' }],
    },
  },
  {
    name: 'coach-lessons-passed', group: 'coach', title: 'Lessons that passed before they could be cancelled',
    when: 'When a stuck schedule change finishes after some of its lessons’ times (ADR-010, LESSON_PASSED).', sender: 'λ Change notifier', always: true,
    ...FROM_COACH, to: 'dana.whitfield@gmail.com (login email)',
    subject: '{{lessonCount}} lessons passed before they could be cancelled',
    preheader: 'You can waive them and contact the families.',
    eyebrow: 'Schedule change',
    headline: 'Some lessons couldn’t be cancelled in time',
    blocks: [
      'Your schedule change has finished. These lessons were due to be cancelled, but their time passed before the cancellation could be applied:',
      { lessons: { each: 'lessons', primary: '{{date}} · {{time}}', secondary: '{{skater}} · {{familyName}}' } },
      'The families weren’t told these were cancelled. You can waive the lessons on Payments, and reply to the families yourself.',
      { button: { label: 'Open Payments', href: '{{paymentsUrl}}' } },
    ],
    sample: { ...COACH_SELF, lessonCount: '2', lessons: [{ date: 'Mon, Nov 2', time: '6:00 AM', skater: 'Mia C.', familyName: 'Grace Chen' }, { date: 'Mon, Nov 2', time: '6:30 AM', skater: 'Owen B.', familyName: 'Priya Banerjee' }] },
  },
  {
    name: 'business-email-confirmation', group: 'coach', title: 'Confirm your business email',
    when: 'To a coach’s new business email, at sign-up step 4 or from Profile. Sent by BladeBook, not Cognito.', sender: 'api-coach (not yet named in architecture.md)', always: true,
    ...FROM_COACH, to: 'dana@whitfieldskating.com (the new address)',
    subject: 'Confirm your business email for BladeBook',
    preheader: 'Families will reply to this address once it’s confirmed.',
    eyebrow: 'Business email',
    headline: 'Confirm this email address',
    blocks: [
      'Hi {{coachFirst}},',
      'You asked to use <b>{{newEmail}}</b> as your business email on BladeBook. Families’ replies to your lesson emails will come here.',
      { button: { label: 'Confirm this address', href: '{{confirmUrl}}' } },
      { fine: 'The button opens BladeBook, where you choose Confirm. The link works until {{expiresAt}}.' },
      { fine: 'Didn’t ask for this? You can ignore this email. Nothing changes until the address is confirmed.' },
    ],
    sample: { coachFirst: 'Dana', newEmail: 'dana@whitfieldskating.com', confirmUrl: 'https://bladebook.app/coach/confirm-email/4b7e9d', expiresAt: 'Fri, Oct 16 at 8:15 AM' },
  },
];

/* =========================== Sent by Cognito =========================== */
/* Not an SES template. Cognito fills in only {####} (the code) and {username}, and with no custom message
   trigger (owner, 2026-11-06) it sends this one message for every code: sign-up, forgot password and a
   changed email. So it names no coach or family and states no expiry (24 hours for a sign-up code, 1 hour
   for a password code). Pasted into the user pool's message settings (see README). */
export const COGNITO = [
  {
    name: 'cognito-code', group: 'cognito', title: 'Verification code',
    when: 'Every code Cognito sends: sign-up (family step 3, coach step 2), forgot password, and a family’s changed email. One message for all three.', sender: 'Cognito (the user pool’s verification message)',
    from: 'BladeBook <lessons@{domain}>', replyTo: 'no-reply@{domain}', to: 'the address being confirmed',
    subject: 'Your BladeBook code: {####}',
    preheader: 'Enter this code on the BladeBook page that asked for it.',
    eyebrow: 'Your code', headline: 'Your BladeBook code',
    blocks: [
      'Enter this code on the BladeBook page that asked for it:',
      { code: '{####}' },
      { fine: 'Didn’t ask for a code? You can ignore this email. Nothing changes without it.' },
    ],
  },
];
