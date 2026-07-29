export const meta = {
  name: 'stack-decision',
  description: 'Resolve BladeBook\'s open stack decisions (§11) via an advocate/skeptic judge panel',
  whenToUse: 'When the architecture doc has unresolved technology choices that everything downstream depends on.',
  phases: [
    { title: 'Advocate', detail: 'one agent argues each coherent stack profile' },
    { title: 'Challenge', detail: 'a skeptic tries to kill each profile' },
    { title: 'Synthesize', detail: 'score all profiles, produce an ADR' },
  ],
}

const DOC = '/Users/jessicacovington/Desktop/Projects/BladeBook/docs/architecture.md'

const CONSTRAINTS = `
BladeBook is a scheduling / student-management / payment-reminder platform for
hockey and figure-skating coaches. Read the full architecture doc first:
  ${DOC}

Binding constraints (these are NOT up for debate — judge options against them):
- SOLO developer. Java is the language they know. React + TypeScript is already
  chosen for the frontend, so some TS is acceptable, but a second heavyweight
  backend language is a real cost.
- Target ~$2-10/month at idle. No always-on infrastructure: no NAT gateway, no
  idle DB instance, no load balancer. This is why DynamoDB was chosen over
  Postgres+VPC.
- Security-first: least-privilege IAM per Lambda, Cognito auth, encryption
  everywhere. Some students are minors, so child-data handling matters.
- Fixed stack decisions: AWS Lambda (Java), API Gateway HTTP API, DynamoDB
  single-table, EventBridge (bus + Scheduler), Cognito, SES/SNS, S3+CloudFront.
- Cold starts are user-visible: a parent or adult student booking a slot hits
  the API interactively. Low traffic means containers go cold constantly.
- Must be deployable via infrastructure-as-code from day one.

You may use WebSearch to find current cold-start benchmarks, CDK language
support status, or framework maturity signals. Today is 2026-07-28 — prefer
recent sources and say so when you rely on one.
`

const PROFILES = [
  {
    key: 'spring-snapstart',
    label: 'Spring Boot + SnapStart, CDK TypeScript',
    detail: `Java framework: Spring Boot on Lambda with SnapStart enabled.
IaC: AWS CDK in TypeScript. Repo: monorepo (backend + frontend + infra).
The "familiarity-first" bet: the most widely known Java stack, with SnapStart
papering over JVM cold starts, and CDK in its most mature language.`,
  },
  {
    key: 'quarkus-java',
    label: 'Quarkus, CDK Java',
    detail: `Java framework: Quarkus (JVM mode, or native via GraalVM if justified).
IaC: AWS CDK in Java. Repo: monorepo.
The "single-language" bet: one language across backend and infra, and the
fastest startup of the Java options without relying on SnapStart.`,
  },
  {
    key: 'micronaut-hybrid',
    label: 'Micronaut, CDK TypeScript',
    detail: `Java framework: Micronaut (compile-time DI, no runtime reflection).
IaC: AWS CDK in TypeScript. Repo: monorepo.
The "lean runtime" bet: minimal cold start via ahead-of-time wiring, paired
with the more mature CDK language.`,
  },
]

const ADVOCATE_SCHEMA = {
  type: 'object',
  properties: {
    profileKey: { type: 'string' },
    caseFor: { type: 'string', description: 'The strongest honest argument, 200-400 words' },
    coldStart: { type: 'string', description: 'Concrete expected cold-start behavior, with numbers and sources if found' },
    costImpact: { type: 'string', description: 'Effect on the ~$2-10/mo target, including any hidden costs' },
    soloDevErgonomics: { type: 'string', description: 'Build times, debugging, docs, AI-assistance quality, hiring irrelevant' },
    securityFit: { type: 'string', description: 'How well it supports per-Lambda least-privilege IAM and secrets handling' },
    strongestObjection: { type: 'string', description: 'The best argument AGAINST your own profile. Be honest.' },
  },
  required: ['profileKey', 'caseFor', 'coldStart', 'costImpact', 'soloDevErgonomics', 'securityFit', 'strongestObjection'],
}

const SKEPTIC_SCHEMA = {
  type: 'object',
  properties: {
    profileKey: { type: 'string' },
    flaws: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          severity: { type: 'string', enum: ['fatal', 'serious', 'annoying'] },
          evidence: { type: 'string' },
        },
        required: ['claim', 'severity', 'evidence'],
      },
    },
    overclaims: { type: 'string', description: 'Which advocate claims are unsupported, dated, or misleading' },
    verdict: { type: 'string', enum: ['viable', 'viable-with-caveats', 'avoid'] },
    reasoning: { type: 'string' },
  },
  required: ['profileKey', 'flaws', 'overclaims', 'verdict', 'reasoning'],
}

log(`Judging ${PROFILES.length} stack profiles for BladeBook`)

// Advocate -> skeptic runs per-profile with no barrier: profile A can be under
// challenge while profile C is still being argued.
const judged = await pipeline(
  PROFILES,
  (p) => agent(
    `${CONSTRAINTS}

You are advocating for ONE stack profile. Argue it as well as it can honestly
be argued — but you are being read by someone who will be stuck with this
choice for years, so do not oversell.

PROFILE: ${p.label}
${p.detail}

Ground every claim you can in something checkable: a benchmark, a doc, a
release note. Where you are reasoning from principle rather than evidence,
say so explicitly.`,
    { label: `advocate:${p.key}`, phase: 'Advocate', schema: ADVOCATE_SCHEMA },
  ),
  (advocacy, p) => {
    if (!advocacy) return null
    return agent(
      `${CONSTRAINTS}

You are a skeptic. Your job is to find the reasons this stack profile would
make a solo developer miserable or the project fail. Default to skepticism:
if a claim is unsupported, treat it as unsupported.

PROFILE: ${p.label}
${p.detail}

THE ADVOCATE'S CASE:
${JSON.stringify(advocacy, null, 2)}

Attack specifically:
- Is the cold-start claim real at this traffic level, or a benchmark artifact?
- What breaks operationally for ONE person with no platform team?
- Does the IaC language choice create friction the advocate glossed over?
- Are any claims out of date? Check current status where you can.
Do not manufacture flaws. If the profile is genuinely solid, say so and
return a short flaw list.`,
      { label: `challenge:${p.key}`, phase: 'Challenge', schema: SKEPTIC_SCHEMA },
    ).then((critique) => ({ profile: p, advocacy, critique }))
  },
)

const panel = judged.filter(Boolean)
log(`${panel.length}/${PROFILES.length} profiles survived to synthesis`)

// Genuine barrier: the synthesizer must compare all profiles against each other.
phase('Synthesize')

const adr = await agent(
  `${CONSTRAINTS}

You are writing an Architecture Decision Record for BladeBook. Below is a full
advocate/skeptic panel over the candidate stack profiles.

PANEL RESULTS:
${JSON.stringify(panel, null, 2)}

Resolve every open decision in §11 of the architecture doc:
  1. Java Lambda framework
  2. IaC language
  3. Repo layout
  4. Coach timezone handling (single-tz MVP vs. per-coach from the start)

Write a markdown ADR with this structure:
  # ADR-001: Backend Stack and Project Layout
  ## Status
  ## Context          (the constraints that actually drove this)
  ## Decision         (one clear call per open decision — no hedging)
  ## Rationale        (why, including which skeptic objections you accepted)
  ## Consequences     (what this makes easy, what it makes hard, what it forecloses)
  ## Revisit if       (concrete signals that should reopen this decision)

Rules:
- Pick a winner per decision. "It depends" is not an answer; the user has to
  type code tomorrow.
- You may mix profiles (e.g. one profile's framework with another's IaC
  language) if the panel supports it — but justify the combination.
- Where the panel disagreed, say so and explain which side you found more
  credible and why.
- Flag anything you could not verify as an explicit assumption.

Return ONLY the markdown document — no preamble, no commentary.`,
  { label: 'synthesize:adr', phase: 'Synthesize' },
)

return { adr, panel }
