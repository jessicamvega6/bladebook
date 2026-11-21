#!/usr/bin/env bash
# BladeBook database-gate tests: ADR-021 decision 7 and ADR-022 decision 9, against dev's REAL table and tenant roles
# (owner, 2026-11-17, I11). Runbook: docs/runbooks/database-gate-tests.md
#
#   ./database-gate-tests.sh run      run every check and write a results file
#   ./database-gate-tests.sh clean    delete what an interrupted run wrote (TEST# items and its CODE#GATE… code)
#
# Nothing is copied: the policies are the deployed roles (infra/lib/tenant-roles.ts), read from the stack's outputs. The
# records are the seed's (dev's table is created from the seed file, ADR-028): coach A is a coach with booked seats from
# two families, A and B. Every test runs as a tenant session started from <prefix>-gate-test, a dev-only role you sign
# into, which has no DynamoDB access of its own. You (your own sign-in) only read the stack's outputs, pick the seed
# records by their keys, and delete the TEST# items the run wrote. The only writes are TEST# items, which no event
# consumer matches, and one CODE#GATE… code claim; all are deleted at the end. Written for macOS's bash 3.2.

set -uo pipefail

REGION="${AWS_REGION:-us-east-1}"
STACK="${BLADEBOOK_STACK:-bladebook-dev-app}"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""
cd "$(dirname "$0")"

die() { echo "ERROR: $*" >&2; exit 1; }
command -v aws >/dev/null || die "the AWS CLI is not installed"
command -v jq  >/dev/null || die "jq is not installed (brew install jq)"
aws sts get-caller-identity >/dev/null 2>&1 || die "not signed in to AWS. Run 'aws sso login --sso-session bladebook' and export AWS_PROFILE=bladebook-dev."

output() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
TABLE=$(output TableName);                   [ -n "$TABLE" ] && [ "$TABLE" != None ] || die "no TableName output on $STACK"
COACH_ROLE=$(output CoachTenantRoleArn)
CLIENT_ROLE=$(output ClientTenantRoleArn)
LOOKUP_ROLE=$(output CodeLookupRoleArn)
GATE_ROLE=$(output GateTestRoleArn);         [ -n "$GATE_ROLE" ] && [ "$GATE_ROLE" != None ] || die "no GateTestRoleArn: the gate role exists in dev only"
RUN=$(date +%s)

# ---------------------------------------------------------------- the seed's records, by key only

fixtures() {
  local scan
  scan=$(aws dynamodb scan --table-name "$TABLE" --output json \
    --projection-expression "PK, SK, clientId, studentStatus, coachId") || die "could not read the table's keys"
  # Coach A: the coach whose booked seats come from the most families; families A and B: two of them.
  COACH_A=$(jq -r '[.Items[] | select(.SK.S|startswith("SEAT#")) | {c:.PK.S, f:.clientId.S}] | group_by(.c)
    | map({c:.[0].c, n:(map(.f)|unique|length)}) | max_by(.n) | .c' <<<"$scan")
  COACH_B=$(jq -r --arg a "$COACH_A" '[.Items[] | select((.PK.S|startswith("COACH#")) and .SK.S=="PROFILE" and .PK.S!=$a) | .PK.S][0]' <<<"$scan")
  FAMILY_A=$(jq -r --arg a "$COACH_A" '[.Items[] | select(.PK.S==$a and (.SK.S|startswith("SEAT#"))) | .clientId.S] | unique | .[0]' <<<"$scan")
  FAMILY_B=$(jq -r --arg a "$COACH_A" '[.Items[] | select(.PK.S==$a and (.SK.S|startswith("SEAT#"))) | .clientId.S] | unique | .[1]' <<<"$scan")
  SEAT_A=$(jq -r --arg a "$COACH_A" --arg f "$FAMILY_A" '[.Items[] | select(.PK.S==$a and (.SK.S|startswith("SEAT#")) and .clientId.S==$f) | .SK.S][0]' <<<"$scan")
  SEAT_B=$(jq -r --arg a "$COACH_A" --arg f "$FAMILY_B" '[.Items[] | select(.PK.S==$a and (.SK.S|startswith("SEAT#")) and .clientId.S==$f) | .SK.S][0]' <<<"$scan")
  LESSON_1=$(jq -r --arg a "$COACH_A" '[.Items[] | select(.PK.S==$a and (.SK.S|startswith("LESSON#"))) | .SK.S] | sort | .[0]' <<<"$scan")
  LESSON_2=$(jq -r --arg a "$COACH_A" '[.Items[] | select(.PK.S==$a and (.SK.S|startswith("LESSON#"))) | .SK.S] | sort | .[1]' <<<"$scan")
  LESSON_B=$(jq -r --arg b "$COACH_B" '[.Items[] | select(.PK.S==$b and (.SK.S|startswith("LESSON#"))) | .SK.S] | sort | .[0]' <<<"$scan")
  ACTIVE_STUDENT=$(jq -r --arg a "$COACH_A" '[.Items[] | select(.PK.S==$a and (.SK.S|startswith("STUDENT#")) and .studentStatus.S=="ACTIVE") | .SK.S][0]' <<<"$scan")
  PENDING_STUDENT=$(jq -r --arg a "$COACH_A" '[.Items[] | select(.PK.S==$a and (.SK.S|startswith("STUDENT#")) and .studentStatus.S=="PENDING") | .SK.S][0]' <<<"$scan")
  CODE_A=$(jq -r --arg a "${COACH_A#COACH#}" '[.Items[] | select((.PK.S|startswith("CODE#")) and .coachId.S==$a) | .PK.S][0]' <<<"$scan")
  SKATER_CODE=$(jq -r '[.Items[] | select(.PK.S|startswith("SKATERCODE#")) | .PK.S][0]' <<<"$scan")
  local v
  for v in COACH_A COACH_B FAMILY_A FAMILY_B SEAT_A SEAT_B LESSON_1 LESSON_2 LESSON_B ACTIVE_STUDENT PENDING_STUDENT CODE_A SKATER_CODE; do
    eval "[ -n \"\${$v}\" ] && [ \"\${$v}\" != null ]" || die "the seed has no record for $v: rebuild dev from the seed (infra/README.md)"
  done
  FAMILY_A="CLIENT#${FAMILY_A}"; FAMILY_B="CLIENT#${FAMILY_B}"
  C_A="${COACH_A#COACH#}"; C_B="${COACH_B#COACH#}"; F_A="${FAMILY_A#CLIENT#}"
}

# ---------------------------------------------------------------- sessions and helpers

creds_from() { jq -r '.Credentials | "AWS_ACCESS_KEY_ID=\(.AccessKeyId) AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey) AWS_SESSION_TOKEN=\(.SessionToken)"'; }

# Run the AWS CLI as a temporary session, never as your own identity.
as() {
  local creds="$1"; shift
  [ -n "$creds" ] || { echo "NO_CREDENTIALS"; return 99; }
  # shellcheck disable=SC2086
  env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE $creds aws "$@"
}

assume() { # role-arn session-name [Key=…,Value=…]…
  local role="$1" name="$2"; shift 2
  if [ $# -gt 0 ]; then
    as "$GATE" sts assume-role --role-arn "$role" --role-session-name "$name" --tags "$@" --output json | creds_from
  else
    as "$GATE" sts assume-role --role-arn "$role" --role-session-name "$name" --output json | creds_from
  fi
}

key() { jq -nc --arg pk "$1" --arg sk "$2" '{PK:{S:$pk},SK:{S:$sk}}'; }
pkval() { jq -nc --arg v "$1" '{":pk":{S:$v}}'; }
pkskval() { jq -nc --arg v "$1" --arg s "$2" '{":pk":{S:$v},":sk":{S:$s}}'; }
names() { jq -nc --arg s "$1" '$s|split(",")|to_entries|map({key:"#p\(.key)",value:.value})|from_entries'; }
expr() { jq -rn --arg s "$1" '$s|split(",")|to_entries|map("#p\(.key)")|join(",")'; }

check() { # id expected description command…
  local id="$1" expect="$2" desc="$3"; shift 3
  local out rc got verdict
  out=$("$@" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then got=ALLOW
  elif grep -q "NO_CREDENTIALS" <<<"$out"; then got=NOSESSION
  elif grep -q "AccessDenied" <<<"$out"; then got=DENY
  elif grep -q "ConditionalCheckFailed" <<<"$out"; then got=CONDFAIL
  else got=ERROR; fi
  if [ "$got" = "$expect" ]; then verdict=PASS; else verdict=FAIL; fi
  printf '%-5s %-8s expected %-8s got %-9s %s\n' "$verdict" "$id" "$expect" "$got" "$desc" | tee -a "$RESULTS"
  if [ "$got" = ERROR ] || [ "$got" = NOSESSION ]; then
    printf '               %s\n' "$(tr '\n' ' ' <<<"$out" | head -c 400)" | tee -a "$RESULTS"
  fi
}

ddb() { local c="$1"; shift; as "$c" dynamodb "$@" --table-name "$TABLE" --output json; }
q()  { local c="$1" pk="$2"; shift 2; ddb "$c" query --key-condition-expression "PK = :pk" --expression-attribute-values "$(pkval "$pk")" "$@"; }
qp() { # creds pk sk-prefix attrs  (query with begins_with and a projection)
  ddb "$1" query --key-condition-expression "PK = :pk AND begins_with(SK, :sk)" \
    --expression-attribute-values "$(pkskval "$2" "$3")" \
    --projection-expression "$(expr "$4")" --expression-attribute-names "$(names "$4")"
}
qnp() { ddb "$1" query --key-condition-expression "PK = :pk AND begins_with(SK, :sk)" --expression-attribute-values "$(pkskval "$2" "$3")"; }
gp() { # creds pk sk attrs [extra args]  (get-item with a projection)
  local c="$1" pk="$2" sk="$3" a="$4"; shift 4
  ddb "$c" get-item --key "$(key "$pk" "$sk")" --projection-expression "$(expr "$a")" --expression-attribute-names "$(names "$a")" "$@"
}
qi() { local c="$1" idx="$2" pk="$3"; ddb "$c" query --index-name "$idx" --key-condition-expression "${idx}PK = :pk" --expression-attribute-values "$(pkval "$pk")"; }
transact() { as "$1" dynamodb transact-write-items --transact-items "$2" --output json; }
bget() { # creds attrs-or-empty pk:sk…  (BatchGetItem; an empty attrs means no projection)
  local c="$1" a="$2"; shift 2
  local keys="[]" k
  for k in "$@"; do keys=$(jq -c --argjson k "$(key "${k%%|*}" "${k#*|}")" '. + [$k]' <<<"$keys"); done
  local req
  if [ -n "$a" ]; then
    req=$(jq -nc --arg t "$TABLE" --argjson k "$keys" --arg p "$(expr "$a")" --argjson n "$(names "$a")" \
      '{($t):{Keys:$k, ProjectionExpression:$p, ExpressionAttributeNames:$n}}')
  else
    req=$(jq -nc --arg t "$TABLE" --argjson k "$keys" '{($t):{Keys:$k}}')
  fi
  as "$c" dynamodb batch-get-item --request-items "$req" --output json
}
exists_as_owner() { aws dynamodb get-item --table-name "$TABLE" --key "$(key "$1" "$2")" --output json | jq -e '.Item' >/dev/null 2>&1; }

# What the lesson-time reads may name: a few of the allowlist's lesson fields (ADR-022 d3, written 2026-11-17).
LESSON_FIELDS="PK,SK,lessonDate,startTime,startsAtUtc,durationMinutes,priceMinor,currency,lessonStatus,seatsTaken,maxSkaters"

# ---------------------------------------------------------------- clean up

WRITTEN=""
wrote() { WRITTEN="${WRITTEN} $1|$2"; }
clean_written() {
  local k
  for k in $WRITTEN; do aws dynamodb delete-item --table-name "$TABLE" --key "$(key "${k%%|*}" "${k#*|}")" >/dev/null 2>&1; done
}
clean() { # an interrupted run's leftovers: TEST# items in any partition, and CODE#GATE… claims
  local items
  items=$(aws dynamodb scan --table-name "$TABLE" --output json --projection-expression "PK, SK" \
    --filter-expression "begins_with(SK, :t) OR begins_with(PK, :g)" \
    --expression-attribute-values '{":t":{"S":"TEST#"},":g":{"S":"CODE#GATE"}}' | jq -c '.Items[]')
  [ -z "$items" ] && { echo "Nothing to clean."; return; }
  while read -r k; do aws dynamodb delete-item --table-name "$TABLE" --key "$k" >/dev/null; done <<<"$items"
  echo "Deleted $(wc -l <<<"$items" | tr -d ' ') leftover item(s)."
}

# ---------------------------------------------------------------- the checks

run_tests() {
  RESULTS="gate-results-$(date +%Y%m%d-%H%M%S).txt"
  echo "BladeBook database-gate tests · ${TABLE} and its tenant roles (${STACK}) · ${REGION} · $(date)" | tee "$RESULTS"
  fixtures
  echo "Seed records: coach A, coach B, families A and B (seats with coach A), 3 lesson times, 2 skaters (ACTIVE, PENDING), 2 codes." | tee -a "$RESULTS"
  trap clean_written EXIT

  GATE=$(aws sts assume-role --role-arn "$GATE_ROLE" --role-session-name "gate-$RUN" --output json | creds_from) \
    || die "could not assume the gate-test role. Your sign-in must be able to assume roles in dev."
  COACH=$(assume "$COACH_ROLE" coach-a Key=coachId,Value="$C_A")
  ACTIVE=$(assume "$CLIENT_ROLE" family-a Key=clientId,Value="$F_A" Key=coachId,Value="$C_A" Key=linkStatus,Value=ACTIVE)
  PENDING=$(assume "$CLIENT_ROLE" family-a-pending Key=clientId,Value="$F_A" Key=coachId,Value="$C_A" Key=linkStatus,Value=PENDING)
  FIRST=$(assume "$CLIENT_ROLE" family-a-first Key=clientId,Value="$F_A")
  LOOKUP=$(assume "$LOOKUP_ROLE" code-lookup)
  local v
  for v in COACH ACTIVE PENDING FIRST LOOKUP; do
    eval "[ -n \"\$$v\" ]" || echo "WARNING: could not start the $v session; its checks will show NOSESSION." | tee -a "$RESULTS"
  done

  echo | tee -a "$RESULTS"
  echo "== ADR-021 decision 7 · coach-tenant, as coach A ==" | tee -a "$RESULTS"
  check 021-1a ALLOW "GetItem own profile"                     ddb "$COACH" get-item --key "$(key "$COACH_A" PROFILE)"
  check 021-1b ALLOW "Query own partition"                     q "$COACH" "$COACH_A" --max-items 5
  check 021-2a DENY  "GetItem coach B's profile"               ddb "$COACH" get-item --key "$(key "$COACH_B" PROFILE)"
  check 021-2b DENY  "Query coach B's partition"               q "$COACH" "$COACH_B" --max-items 5
  wrote "$COACH_B" "TEST#021-2c-$RUN"; wrote "$FAMILY_A" "TEST#021-6a-$RUN"
  wrote "$COACH_B" "TEST#022-7b-$RUN"; wrote "$COACH_A" "TEST#022-8-$RUN"
  # Writes expected to be refused carry a condition that can't pass, so a wrongly allowed one still changes nothing.
  check 021-2c DENY  "PutItem into coach B"                    ddb "$COACH" put-item --item "$(key "$COACH_B" "TEST#021-2c-$RUN")"
  check 021-2d DENY  "UpdateItem coach B's profile"            ddb "$COACH" update-item --key "$(key "$COACH_B" PROFILE)" \
                                                                 --update-expression "SET gateTest = :v" --expression-attribute-values '{":v":{"S":"x"}}' \
                                                                 --condition-expression "attribute_not_exists(PK)"
  check 021-2e DENY  "DeleteItem coach B's profile"            ddb "$COACH" delete-item --key "$(key "$COACH_B" PROFILE)" \
                                                                 --condition-expression "attribute_not_exists(PK)"
  check 021-3a ALLOW "Query GSI3 for own coach"                qi "$COACH" GSI3 "$COACH_A"
  check 021-3b DENY  "Query GSI3 for coach B"                  qi "$COACH" GSI3 "$COACH_B"
  local tx
  tx=$(jq -nc --arg t "$TABLE" --arg a "$COACH_A" --arg b "$COACH_B" --arg s "TEST#021-4-$RUN" '[
    {Put:{TableName:$t, Item:{PK:{S:$a}, SK:{S:$s}}}}, {Put:{TableName:$t, Item:{PK:{S:$b}, SK:{S:$s}}}}]')
  wrote "$COACH_A" "TEST#021-4-$RUN"; wrote "$COACH_B" "TEST#021-4-$RUN"
  check 021-4  DENY  "Transaction: one item in A, one in B"   transact "$COACH" "$tx"
  if exists_as_owner "$COACH_A" "TEST#021-4-$RUN"; then
    printf '%-5s %-8s %s\n' FAIL 021-4v "coach A's half of the denied transaction WAS written" | tee -a "$RESULTS"
  else
    printf '%-5s %-8s %s\n' PASS 021-4v "nothing from the denied transaction was written" | tee -a "$RESULTS"
  fi
  tx=$(jq -nc --arg t "$TABLE" --arg a "$COACH_A" --arg c "$C_A" --arg r "$RUN" '[
    {Put:{TableName:$t, Item:{PK:{S:$a}, SK:{S:("TEST#021-5-"+$r)}}}},
    {Put:{TableName:$t, Item:{PK:{S:("CODE#GATE"+$r)}, SK:{S:"CODE"}, coachId:{S:$c}, coachFirstName:{S:"Gate"},
          coachLastName:{S:"Test"}}, ConditionExpression:"attribute_not_exists(PK)"}}]')
  wrote "$COACH_A" "TEST#021-5-$RUN"; wrote "CODE#GATE$RUN" CODE
  check 021-5  ALLOW "Transaction: own item plus a CODE# claim" transact "$COACH" "$tx"
  check 021-6a DENY  "PutItem under CLIENT#"                   ddb "$COACH" put-item --item "$(key "$FAMILY_A" "TEST#021-6a-$RUN")"
  check 021-6b DENY  "Query GSI1"                              qi "$COACH" GSI1 "$FAMILY_A"
  check 021-6c DENY  "Query GSI2"                              qi "$COACH" GSI2 "DATE#${SEAT_A:5:10}"
  check 021-6d DENY  "Scan the table"                          ddb "$COACH" scan --max-items 1
  check 021-6e DENY  "Query GSI4 (the deadline sweep's only)"  qi "$COACH" GSI4 DUE
  check 021-7a DENY  "AssumeRole with no coachId tag"          as "$GATE" sts assume-role --role-arn "$COACH_ROLE" --role-session-name notag
  check 021-7b DENY  "AssumeRole with an extra tag key"        as "$GATE" sts assume-role --role-arn "$COACH_ROLE" --role-session-name extratag \
                                                                 --tags Key=coachId,Value="$C_A" Key=extra,Value=x
  check 021-8  DENY  "DynamoDB with the gate role's own credentials" ddb "$GATE" get-item --key "$(key "$COACH_A" PROFILE)"

  echo | tee -a "$RESULTS"
  echo "== ADR-022 decision 9 · client-tenant, as family A of coach A ==" | tee -a "$RESULTS"
  check 022-1a ALLOW "Query own CLIENT# partition"             q "$ACTIVE" "$FAMILY_A"
  check 022-1b ALLOW "Query GSI1 for own seats"                qi "$ACTIVE" GSI1 "$FAMILY_A"
  check 022-2a DENY  "Query family B's partition"              q "$ACTIVE" "$FAMILY_B"
  check 022-2b DENY  "Query GSI1 for family B"                 qi "$ACTIVE" GSI1 "$FAMILY_B"
  check 022-3a ALLOW "Coach's lesson times, allowlisted fields" qp "$ACTIVE" "$COACH_A" LESSON# "$LESSON_FIELDS"
  check 022-3b ALLOW "Coach's weekly schedule, allowlisted"    gp "$ACTIVE" "$COACH_A" SCHEDULE#DEFAULT "PK,SK,days,blocks,scheduleVersion"
  check 022-4a DENY  "Lesson times with pendingLeave"          qp "$ACTIVE" "$COACH_A" LESSON# "$LESSON_FIELDS,pendingLeave"
  check 022-4b DENY  "Seats with studentName"                  qp "$ACTIVE" "$COACH_A" SEAT# "PK,SK,studentName"
  check 022-4c DENY  "Seats with clientId"                     qp "$ACTIVE" "$COACH_A" SEAT# "PK,SK,clientId"
  check 022-4d DENY  "Lesson times with no projection"         qnp "$ACTIVE" "$COACH_A" LESSON#
  check 022-5a DENY  "PENDING: coach's lesson times"           qp "$PENDING" "$COACH_A" LESSON# "$LESSON_FIELDS"
  check 022-5b DENY  "PENDING: coach's profile"                gp "$PENDING" "$COACH_A" PROFILE "firstName,lastName"
  check 022-5c ALLOW "ACTIVE: coach's profile"                 gp "$ACTIVE" "$COACH_A" PROFILE "firstName,lastName,coachTimezone,acceptsVenmo,venmoHandle"
  check 022-5d DENY  "ACTIVE: coach's profile with loginEmail" gp "$ACTIVE" "$COACH_A" PROFILE "firstName,loginEmail"
  check 022-6a DENY  "Coach B's profile"                       gp "$ACTIVE" "$COACH_B" PROFILE "firstName,lastName"
  check 022-6b DENY  "Coach B's lesson times"                  qp "$ACTIVE" "$COACH_B" LESSON# "$LESSON_FIELDS"
  wrote "$COACH_A" "TEST#022-7a-$RUN"
  check 022-7a ALLOW "Conditional write into coach A"          ddb "$ACTIVE" put-item --item "$(key "$COACH_A" "TEST#022-7a-$RUN")" --condition-expression "attribute_not_exists(PK)"
  check 022-7b DENY  "Conditional write into coach B"          ddb "$ACTIVE" put-item --item "$(key "$COACH_B" "TEST#022-7b-$RUN")" --condition-expression "attribute_not_exists(PK)"
  check 022-8  DENY  "Write to coach A with ReturnValues ALL_OLD" ddb "$ACTIVE" put-item --item "$(key "$COACH_A" "TEST#022-8-$RUN")" --return-values ALL_OLD

  # Row 9 records an answer. A write onto family B's seat that must fail its condition, first with no return option (the
  # control: the write itself is allowed), then asking for the old item back on failure.
  local out9 code9
  check 022-9a CONDFAIL "Control: write onto family B's seat, no return values" \
    ddb "$ACTIVE" put-item --item "$(key "$COACH_A" "$SEAT_B")" --condition-expression "attribute_not_exists(PK)"
  out9=$(ddb "$ACTIVE" put-item --item "$(key "$COACH_A" "$SEAT_B")" --condition-expression "attribute_not_exists(PK)" \
           --return-values-on-condition-check-failure ALL_OLD 2>&1)
  code9=$(grep -oE '\(([A-Za-z]+)\)' <<<"$out9" | head -1 | tr -d '()')
  if [ "$code9" = AccessDeniedException ]; then
    printf '%-5s %-8s %s\n' PASS 022-9b "With ALL_OLD on failure: refused by IAM, nothing comes back" | tee -a "$RESULTS"
  else
    printf '%-5s %-8s %s\n' FAIL 022-9b "With ALL_OLD on failure: ${code9:-the write succeeded} (expected AccessDeniedException)" | tee -a "$RESULTS"
  fi

  check 022-10a DENY  "First session (clientId only): coach's lesson times" qp "$FIRST" "$COACH_A" LESSON# "$LESSON_FIELDS"
  check 022-10b ALLOW "First session: own profile"             ddb "$FIRST" get-item --key "$(key "$FAMILY_A" PROFILE)"
  check 022-11a ALLOW "code-lookup: code with its name fields" gp "$LOOKUP" "$CODE_A" CODE "coachFirstName,coachLastName"
  check 022-11b DENY  "code-lookup: code with createdAt"       gp "$LOOKUP" "$CODE_A" CODE "coachId,createdAt"
  check 022-11c DENY  "code-lookup: code, no projection"       ddb "$LOOKUP" get-item --key "$(key "$CODE_A" CODE)"
  check 022-11d DENY  "code-lookup: Query a code"              q "$LOOKUP" "$CODE_A"
  check 022-11e DENY  "code-lookup: coach's profile"           gp "$LOOKUP" "$COACH_A" PROFILE "firstName"
  check 022-11f DENY  "code-lookup: a family's profile"        ddb "$LOOKUP" get-item --key "$(key "$FAMILY_A" PROFILE)"
  check 022-11g ALLOW "First session: the code with coachId (registration resolves it)" gp "$FIRST" "$CODE_A" CODE "coachId,coachFirstName"

  tx=$(jq -nc --arg t "$TABLE" --arg a "$COACH_A" --arg s "$PENDING_STUDENT" --arg r "$RUN" '[
    {ConditionCheck:{TableName:$t, Key:{PK:{S:$a}, SK:{S:$s}}, ConditionExpression:"studentStatus = :a",
      ExpressionAttributeValues:{":a":{S:"ACTIVE"}}}},
    {Put:{TableName:$t, Item:{PK:{S:$a}, SK:{S:("TEST#022-12-"+$r)}}}}]')
  wrote "$COACH_A" "TEST#022-12-$RUN"
  check 022-12  CONDFAIL "Transaction naming a PENDING skater: refused whole" transact "$ACTIVE" "$tx"
  if exists_as_owner "$COACH_A" "TEST#022-12-$RUN"; then
    printf '%-5s %-8s %s\n' FAIL 022-12v "the refused transaction's put WAS written" | tee -a "$RESULTS"
  else
    printf '%-5s %-8s %s\n' PASS 022-12v "nothing from the refused transaction was written" | tee -a "$RESULTS"
  fi
  check 022-13a ALLOW "Share-check: a skater's studentStatus only" gp "$ACTIVE" "$COACH_A" "$ACTIVE_STUDENT" "studentStatus"
  check 022-13b DENY  "Share-check with studentName"           gp "$ACTIVE" "$COACH_A" "$ACTIVE_STUDENT" "studentStatus,studentName"
  check 022-13c DENY  "Share-check, no projection"             ddb "$ACTIVE" get-item --key "$(key "$COACH_A" "$ACTIVE_STUDENT")"
  check 022-13d DENY  "Share-check as a PENDING session"       gp "$PENDING" "$COACH_A" "$ACTIVE_STUDENT" "studentStatus"
  check 022-14a ALLOW "BatchGetItem lesson times, allowlisted" bget "$ACTIVE" "$LESSON_FIELDS" "$COACH_A|$LESSON_1" "$COACH_A|$LESSON_2"
  check 022-14b DENY  "BatchGetItem with pendingLeave"         bget "$ACTIVE" "$LESSON_FIELDS,pendingLeave" "$COACH_A|$LESSON_1"
  check 022-14c DENY  "BatchGetItem, no projection"            bget "$ACTIVE" "" "$COACH_A|$LESSON_1"
  check 022-14d DENY  "BatchGetItem with a key in coach B"     bget "$ACTIVE" "$LESSON_FIELDS" "$COACH_A|$LESSON_1" "$COACH_B|$LESSON_B"
  check 022-14e DENY  "BatchGetItem as a PENDING session"      bget "$PENDING" "$LESSON_FIELDS" "$COACH_A|$LESSON_1"
  local keys15
  keys15=$(qp "$ACTIVE" "$COACH_A" SEAT# "PK,SK" 2>/dev/null | jq -r '.Items | length' 2>/dev/null)
  check 022-15  ALLOW "Seats' keys only (accepted risk: skater IDs, no names)" qp "$ACTIVE" "$COACH_A" SEAT# "PK,SK"
  printf '%-5s %-8s %s\n' INFO 022-15r "${keys15:-0} seat keys came back, as the 2026-11-17 amendment accepts" | tee -a "$RESULTS"
  check 022-16a DENY  "Family B's seat with studentName"       gp "$ACTIVE" "$COACH_A" "$SEAT_B" "studentName"
  check 022-16b DENY  "Family B's seat with clientId"          gp "$ACTIVE" "$COACH_A" "$SEAT_B" "clientId"
  check 022-16c DENY  "Family B's seat with seatStatus"        gp "$ACTIVE" "$COACH_A" "$SEAT_B" "seatStatus"
  check 022-16d DENY  "Family B's seat with partnerName"       gp "$ACTIVE" "$COACH_A" "$SEAT_B" "partnerName"
  check 022-16e ALLOW "Own seat with idempotencyKey, consistent" gp "$ACTIVE" "$COACH_A" "$SEAT_A" "idempotencyKey" --consistent-read
  check 022-17a ALLOW "GSI1: own seats, every attribute"       qi "$ACTIVE" GSI1 "$FAMILY_A"
  check 022-17b DENY  "GSI1: family B's seats"                 qi "$ACTIVE" GSI1 "$FAMILY_B"

  echo | tee -a "$RESULTS"
  echo "== ADR-MASTER §16 and I30 · share codes, the deadline index, one coach per write ==" | tee -a "$RESULTS"
  check sc-1a ALLOW "Share code: studentId and studentName"   gp "$FIRST" "$SKATER_CODE" CODE "studentId,studentName"
  check sc-1b DENY  "Share code with clientId"                gp "$FIRST" "$SKATER_CODE" CODE "studentId,clientId"
  check sc-1c DENY  "Share code, no projection"               ddb "$FIRST" get-item --key "$(key "$SKATER_CODE" CODE)"
  check sc-1d DENY  "code-lookup: a share code"               gp "$LOOKUP" "$SKATER_CODE" CODE "studentId,studentName"
  check gsi4    DENY  "A family querying GSI4"                qi "$ACTIVE" GSI4 DUE
  tx=$(jq -nc --arg t "$TABLE" --arg f "$FAMILY_A" --arg a "$COACH_A" --arg r "$RUN" '[
    {Put:{TableName:$t, Item:{PK:{S:$f}, SK:{S:("TEST#I30-"+$r)}}}}, {Put:{TableName:$t, Item:{PK:{S:$a}, SK:{S:("TEST#I30-"+$r)}}}}]')
  wrote "$FAMILY_A" "TEST#I30-$RUN"; wrote "$COACH_A" "TEST#I30-$RUN"
  check i30-a  ALLOW "Own items plus one coach's, through that coach's (waiting) session" transact "$PENDING" "$tx"
  tx=$(jq -nc --arg t "$TABLE" --arg f "$FAMILY_A" --arg a "$COACH_A" --arg r "$RUN" '[
    {Put:{TableName:$t, Item:{PK:{S:$f}, SK:{S:("TEST#I30b-"+$r)}}}}, {Put:{TableName:$t, Item:{PK:{S:$a}, SK:{S:("TEST#I30b-"+$r)}}}}]')
  wrote "$FAMILY_A" "TEST#I30b-$RUN"; wrote "$COACH_A" "TEST#I30b-$RUN"
  check i30-b  DENY  "The same through the first session (no coach tag)" transact "$FIRST" "$tx"

  summary
}

summary() {
  local pass fail
  pass=$(grep -c '^PASS' "$RESULTS"); fail=$(grep -c '^FAIL' "$RESULTS")
  {
    echo
    echo "== Summary =="
    echo "${pass} passed, ${fail} failed."
    [ "$fail" -gt 0 ] && echo "A FAIL is a finding: the deployed policy doesn't do what its ADR says. See the runbook, step 4."
    echo "Results saved to docs/runbooks/${RESULTS}. The TEST# items and the CODE#GATE code are deleted on exit."
  } | tee -a "$RESULTS"
}

case "${1:-}" in
  run)   run_tests ;;
  clean) clean ;;
  *) echo "usage: $0 run | clean"; exit 1 ;;
esac
