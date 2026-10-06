#!/usr/bin/env bash
# BladeBook database-gate tests: ADR-021 decision 7 and ADR-022 decision 9.
# Runbook: docs/runbooks/database-gate-tests.md
#
#   ./database-gate-tests.sh setup      create the test table and IAM roles
#   ./database-gate-tests.sh seed       write the sample coaches, families and bookings
#   ./database-gate-tests.sh run        run every check and write a results file
#   ./database-gate-tests.sh teardown   delete the table and the roles
#
# Touches only resources named bb-gate-*. Written for macOS's bash 3.2.

set -uo pipefail

REGION="${AWS_REGION:-us-east-1}"
TABLE="bb-gate-test"
PREFIX="bb-gate"
ROLES="exec coach-tenant client-tenant code-lookup"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""

die() { echo "ERROR: $*" >&2; exit 1; }

command -v aws >/dev/null || die "the AWS CLI is not installed"
command -v jq  >/dev/null || die "jq is not installed (brew install jq)"

ACCT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
  || die "not signed in to AWS. Run 'aws sso login' or 'aws configure' first."
TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCT}:table/${TABLE}"
role_arn() { echo "arn:aws:iam::${ACCT}:role/${PREFIX}-$1"; }

confirm() {
  echo "Account: ${ACCT}   Region: ${REGION}   Identity: $(aws sts get-caller-identity --query Arn --output text)"
  printf 'This will %s. Continue? [y/N] ' "$1"
  read -r answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || die "stopped"
}

# ---------------------------------------------------------------- policies
# Copied from ADR-021 d2 and d5, and ADR-022 d3, d4, d6, d7 and d8 as of 2026-10-05.
# __TABLE_ARN__, __ACCT__ and __PREFIX__ are filled in by fill().

fill() { sed -e "s|__TABLE_ARN__|${TABLE_ARN}|g" -e "s|__ACCT__|${ACCT}|g" -e "s|__PREFIX__|${PREFIX}|g"; }

trust_account() { fill <<'EOF'
{ "Version": "2012-10-17", "Statement": [ {
  "Effect": "Allow", "Principal": { "AWS": "arn:aws:iam::__ACCT__:root" }, "Action": "sts:AssumeRole" } ] }
EOF
}

# The stand-in for a Lambda execution role: may assume the tenant roles, holds no DynamoDB actions.
exec_policy() { fill <<'EOF'
{ "Version": "2012-10-17", "Statement": [ {
  "Effect": "Allow", "Action": ["sts:AssumeRole", "sts:TagSession"],
  "Resource": ["arn:aws:iam::__ACCT__:role/__PREFIX__-coach-tenant",
               "arn:aws:iam::__ACCT__:role/__PREFIX__-client-tenant",
               "arn:aws:iam::__ACCT__:role/__PREFIX__-code-lookup"] } ] }
EOF
}

trust_coach_tenant() { fill <<'EOF'
{ "Version": "2012-10-17", "Statement": [ {
  "Effect": "Allow", "Principal": { "AWS": "arn:aws:iam::__ACCT__:role/__PREFIX__-exec" },
  "Action": ["sts:AssumeRole", "sts:TagSession"],
  "Condition": {
    "ForAllValues:StringEquals": { "aws:TagKeys": ["coachId"] },
    "Null": { "aws:RequestTag/coachId": "false" } } } ] }
EOF
}

coach_tenant_policy() { fill <<'EOF'
{ "Version": "2012-10-17", "Statement": [
  { "Sid": "OwnPartitionOnly", "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem",
               "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:ConditionCheckItem"],
    "Resource": ["__TABLE_ARN__", "__TABLE_ARN__/index/GSI3"],
    "Condition": { "ForAllValues:StringEquals": {
      "dynamodb:LeadingKeys": ["COACH#${aws:PrincipalTag/coachId}"] } } },
  { "Sid": "CoachCodeWrite", "Effect": "Allow",
    "Action": ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
               "dynamodb:ConditionCheckItem"],
    "Resource": "__TABLE_ARN__",
    "Condition": {
      "ForAllValues:StringLike": {
        "dynamodb:LeadingKeys": ["CODE#*"],
        "dynamodb:Attributes": ["PK", "SK", "coachId", "coachFirstName", "coachLastName",
                                "profilePhotoKey"] },
      "StringEqualsIfExists": { "dynamodb:ReturnValues": "NONE" } } } ] }
EOF
}

trust_client_tenant() { fill <<'EOF'
{ "Version": "2012-10-17", "Statement": [ {
  "Effect": "Allow", "Principal": { "AWS": "arn:aws:iam::__ACCT__:role/__PREFIX__-exec" },
  "Action": ["sts:AssumeRole", "sts:TagSession"],
  "Condition": {
    "ForAllValues:StringEquals": { "aws:TagKeys": ["clientId", "coachId", "linkStatus"] },
    "Null": { "aws:RequestTag/clientId": "false" } } } ] }
EOF
}

code_read_statement() { cat <<'EOF'
  { "Sid": "CoachCodeRead", "Effect": "Allow", "Action": "dynamodb:GetItem",
    "Resource": "__TABLE_ARN__",
    "Condition": {
      "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["CODE#*"] },
      "ForAllValues:StringEquals": { "dynamodb:Attributes": ["PK", "SK", "coachId",
        "coachFirstName", "coachLastName", "profilePhotoKey"] },
      "StringEquals": { "dynamodb:Select": "SPECIFIC_ATTRIBUTES" } } }
EOF
}

client_tenant_policy() { { cat <<'EOF'
{ "Version": "2012-10-17", "Statement": [
  { "Sid": "OwnClientPartition", "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem",
               "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:ConditionCheckItem"],
    "Resource": "__TABLE_ARN__",
    "Condition": { "ForAllValues:StringEquals": {
      "dynamodb:LeadingKeys": ["CLIENT#${aws:PrincipalTag/clientId}"] } } },
  { "Sid": "OwnClientIndex", "Effect": "Allow", "Action": "dynamodb:Query",
    "Resource": "__TABLE_ARN__/index/GSI1",
    "Condition": { "ForAllValues:StringEquals": {
      "dynamodb:LeadingKeys": ["CLIENT#${aws:PrincipalTag/clientId}"] } } },
  { "Sid": "CoachPartitionPublicRead", "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:Query"],
    "Resource": "__TABLE_ARN__",
    "Condition": {
      "ForAllValues:StringEquals": {
        "dynamodb:LeadingKeys": ["COACH#${aws:PrincipalTag/coachId}"],
        "dynamodb:Attributes": ["PK", "SK",
          "days", "blocks", "scheduleName", "tempId", "startDate", "endDate",
          "durationMinutes", "bookingStatus",
          "firstName", "lastName", "coachTimezone", "currency", "requiredNoticeHours",
          "profilePhotoKey", "displayPhoneToClients", "displayEmailToClients",
          "displayPaymentTypesToClients",
          "businessEmail", "phone", "paymentInstructions",
          "cashappHandle", "venmoHandle", "paypalHandle"] },
      "StringEquals": { "dynamodb:Select": "SPECIFIC_ATTRIBUTES",
                        "aws:PrincipalTag/linkStatus": "ACTIVE" } } },
  { "Sid": "CoachPartitionWrite", "Effect": "Allow",
    "Action": ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
               "dynamodb:ConditionCheckItem"],
    "Resource": "__TABLE_ARN__",
    "Condition": {
      "ForAllValues:StringEquals": {
        "dynamodb:LeadingKeys": ["COACH#${aws:PrincipalTag/coachId}"] },
      "StringEqualsIfExists": { "dynamodb:ReturnValues": "NONE" } } },
EOF
  code_read_statement
  echo '] }'
} | fill
}

trust_code_lookup() { fill <<'EOF'
{ "Version": "2012-10-17", "Statement": [ {
  "Effect": "Allow", "Principal": { "AWS": "arn:aws:iam::__ACCT__:role/__PREFIX__-exec" },
  "Action": "sts:AssumeRole" } ] }
EOF
}

code_lookup_policy() { { echo '{ "Version": "2012-10-17", "Statement": ['; code_read_statement; echo '] }'; } | fill; }

# ---------------------------------------------------------------- setup / teardown

# IAM takes a few seconds to recognise a new role as a principal. A trust policy naming
# bb-gate-exec straight after it was created fails with "Invalid principal", so retry that.
retry_iam() {
  local i out
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    out=$("$@" 2>&1) && { [ -n "$out" ] && echo "$out"; return 0; }
    grep -q "Invalid principal" <<<"$out" || { echo "$out" >&2; return 1; }
    echo "  IAM doesn't see the new role yet; waiting 5 seconds (attempt $i of 12)…"
    sleep 5
  done
  echo "$out" >&2; return 1
}

make_role() { # name trust-json policy-json  (safe to re-run: an existing role is updated)
  local name="${PREFIX}-$1"
  if aws iam get-role --role-name "$name" >/dev/null 2>&1; then
    echo "$name already exists; updating its trust and permissions."
    retry_iam aws iam update-assume-role-policy --role-name "$name" --policy-document "$2" \
      || die "could not update the trust policy on $name"
  else
    retry_iam aws iam create-role --role-name "$name" --assume-role-policy-document "$2" \
      --description "BladeBook gate test (temporary)" --output text --query Role.Arn \
      || die "could not create role $name"
  fi
  aws iam put-role-policy --role-name "$name" --policy-name gate --policy-document "$3" \
    || die "could not attach the policy to $name"
}

setup() {
  confirm "create table ${TABLE} and roles ${PREFIX}-{exec,coach-tenant,client-tenant,code-lookup}"
  for f in trust_account exec_policy trust_coach_tenant coach_tenant_policy trust_client_tenant \
           client_tenant_policy trust_code_lookup code_lookup_policy; do
    "$f" | jq empty || die "policy $f is not valid JSON"
  done

  if aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
    echo "Table ${TABLE} already exists; keeping it."
  else
    create_table
  fi

  echo "Creating roles…"
  make_role exec          "$(trust_account)"       "$(exec_policy)"
  make_role coach-tenant  "$(trust_coach_tenant)"  "$(coach_tenant_policy)"
  make_role client-tenant "$(trust_client_tenant)" "$(client_tenant_policy)"
  make_role code-lookup   "$(trust_code_lookup)"   "$(code_lookup_policy)"

  echo "Waiting 20 seconds for IAM to propagate…"
  sleep 20
  echo "Setup done. Next: ./database-gate-tests.sh seed"
}

create_table() {
  echo "Creating table ${TABLE}…"
  local gsi='[
    {"IndexName":"GSI1","KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
    {"IndexName":"GSI2","KeySchema":[{"AttributeName":"GSI2PK","KeyType":"HASH"},{"AttributeName":"GSI2SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
    {"IndexName":"GSI3","KeySchema":[{"AttributeName":"GSI3PK","KeyType":"HASH"},{"AttributeName":"GSI3SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'
  aws dynamodb create-table --table-name "$TABLE" --billing-mode PAY_PER_REQUEST \
    --attribute-definitions \
      AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
      AttributeName=GSI1PK,AttributeType=S AttributeName=GSI1SK,AttributeType=S \
      AttributeName=GSI2PK,AttributeType=S AttributeName=GSI2SK,AttributeType=S \
      AttributeName=GSI3PK,AttributeType=S AttributeName=GSI3SK,AttributeType=S \
    --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
    --global-secondary-indexes "$gsi" --output text --query TableDescription.TableArn \
    || die "could not create the table"
  aws dynamodb wait table-exists --table-name "$TABLE"
}

teardown() {
  confirm "delete table ${TABLE} and roles ${PREFIX}-*"
  for r in $ROLES; do
    aws iam delete-role-policy --role-name "${PREFIX}-$r" --policy-name gate 2>/dev/null
    aws iam delete-role --role-name "${PREFIX}-$r" 2>/dev/null && echo "Deleted role ${PREFIX}-$r"
  done
  aws dynamodb delete-table --table-name "$TABLE" --output text --query TableDescription.TableStatus 2>/dev/null \
    && aws dynamodb wait table-not-exists --table-name "$TABLE" && echo "Deleted table ${TABLE}"
  echo "Teardown done."
}

# ---------------------------------------------------------------- seed data

booking() { # pk sk client student date time  → a booking item, as the coach's partition holds it
  jq -nc --arg pk "$1" --arg sk "$2" --arg c "$3" --arg s "$4" --arg d "$5" --arg t "$6" \
    --arg coach "${1#COACH#}" '{PutRequest:{Item:{
      PK:{S:$pk}, SK:{S:$sk}, bookingStatus:{S:"BOOKED"}, durationMinutes:{N:"30"},
      studentId:{S:$s}, clientId:{S:$c}, clientEmail:{S:($c+"@example.com")},
      priceMinor:{N:"4500"}, paymentStatus:{S:"UNPAID"},
      GSI1PK:{S:("CLIENT#"+$c)}, GSI1SK:{S:("BOOKING#"+$d+"#"+$t)},
      GSI2PK:{S:("DATE#"+$d)},   GSI2SK:{S:("COACH#"+$coach+"#"+$t)},
      GSI3PK:{S:$pk},            GSI3SK:{S:("UNPAID#"+$d+"#"+$s)} }}}'
}
item() { # pk sk [name value]…  → a PutRequest with string attributes
  local pk="$1" sk="$2"; shift 2
  local obj; obj=$(jq -nc --arg pk "$pk" --arg sk "$sk" '{PK:{S:$pk},SK:{S:$sk}}')
  while [ $# -ge 2 ]; do obj=$(jq -c --arg k "$1" --arg v "$2" '. + {($k):{S:$v}}' <<<"$obj"); shift 2; done
  jq -c '{PutRequest:{Item:.}}' <<<"$obj"
}

seed() {
  local items
  items=$( {
    item COACH#coach-a PROFILE firstName Dana lastName Reyes coachTimezone America/New_York \
      currency USD businessEmail dana@example.com phone +15550100 paymentInstructions "Venmo, please" \
      venmoHandle @dana-reyes loginEmail dana.login@example.com
    item COACH#coach-a SCHEDULE#DEFAULT days MON,TUE blocks 16:00-18:00 scheduleName Fall
    booking COACH#coach-a "SLOT#2026-11-03#16:00#s1" client-a stu-a1 2026-11-03 16:00
    booking COACH#coach-a "SLOT#2026-11-03#16:30#s2" client-b stu-b1 2026-11-03 16:30
    item COACH#coach-a STUDENT#stu-a1 studentName "Mia R." studentStatus ACTIVE clientId client-a
    item COACH#coach-a STUDENT#stu-b1 studentName "Leo K." studentStatus ACTIVE clientId client-b
    item COACH#coach-b PROFILE firstName Sam lastName Ortiz
    booking COACH#coach-b "SLOT#2026-11-04#09:00#s3" client-c stu-c1 2026-11-04 09:00
    item CLIENT#client-a PROFILE email client-a@example.com
    item CLIENT#client-a "STUDENT#coach-a#stu-a1" linkStatus ACTIVE coachFirstName Dana
    item CLIENT#client-b PROFILE email client-b@example.com
    item CODE#DANA7K2Q CODE coachId coach-a coachFirstName Dana coachLastName Reyes createdAt 2026-10-05
  } | jq -sc --arg t "$TABLE" '{($t): .}' )
  aws dynamodb batch-write-item --request-items "$items" --output json \
    | jq -e '.UnprocessedItems == {}' >/dev/null || die "some items were not written; run seed again"
  echo "Seeded 12 items: coaches coach-a and coach-b, families client-a and client-b (both coach-a's), code DANA7K2Q."
  echo "Next: ./database-gate-tests.sh run"
}

# ---------------------------------------------------------------- test helpers

creds_from() { jq -r '.Credentials | "AWS_ACCESS_KEY_ID=\(.AccessKeyId) AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey) AWS_SESSION_TOKEN=\(.SessionToken)"'; }

# Run the AWS CLI as a temporary session, never as your own identity.
as() {
  local creds="$1"; shift
  [ -n "$creds" ] || { echo "NO_CREDENTIALS"; return 99; }
  # shellcheck disable=SC2086
  env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE $creds aws "$@"
}

assume() { # role session-name [Key=…,Value=…]…
  local role="$1" name="$2"; shift 2
  if [ $# -gt 0 ]; then
    as "$EXEC" sts assume-role --role-arn "$(role_arn "$role")" --role-session-name "$name" --tags "$@" --output json | creds_from
  else
    as "$EXEC" sts assume-role --role-arn "$(role_arn "$role")" --role-session-name "$name" --output json | creds_from
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
qnp() { # creds pk sk-prefix  (same query, no projection)
  ddb "$1" query --key-condition-expression "PK = :pk AND begins_with(SK, :sk)" --expression-attribute-values "$(pkskval "$2" "$3")"
}
gp() { # creds pk sk attrs  (get-item with a projection)
  ddb "$1" get-item --key "$(key "$2" "$3")" --projection-expression "$(expr "$4")" --expression-attribute-names "$(names "$4")"
}
qi() { local c="$1" idx="$2" pk="$3"; ddb "$c" query --index-name "$idx" --key-condition-expression "${idx}PK = :pk" --expression-attribute-values "$(pkval "$pk")"; }
transact() { as "$1" dynamodb transact-write-items --transact-items "$2" --output json; }

ALLOWED_SLOT="PK,SK,bookingStatus,durationMinutes"

# ---------------------------------------------------------------- the checks

run_tests() {
  RESULTS="gate-results-$(date +%Y%m%d-%H%M%S).txt"
  local run; run=$(date +%s)
  echo "BladeBook database-gate tests · account ${ACCT} · ${REGION} · $(date)" | tee "$RESULTS"

  EXEC=$(aws sts assume-role --role-arn "$(role_arn exec)" --role-session-name gate-exec --output json | creds_from) \
    || die "could not assume ${PREFIX}-exec. Did setup run? Wait a minute after setup and try again."
  [ -n "$EXEC" ] || die "could not assume ${PREFIX}-exec"
  COACH_A=$(assume coach-tenant coach-a Key=coachId,Value=coach-a)
  CLIENT_A=$(assume client-tenant client-a Key=clientId,Value=client-a Key=coachId,Value=coach-a Key=linkStatus,Value=ACTIVE)
  CLIENT_A_PENDING=$(assume client-tenant client-a-pending Key=clientId,Value=client-a Key=coachId,Value=coach-a Key=linkStatus,Value=PENDING)
  CLIENT_A_FIRST=$(assume client-tenant client-a-first Key=clientId,Value=client-a)
  LOOKUP=$(assume code-lookup code-lookup)
  for v in COACH_A CLIENT_A CLIENT_A_PENDING CLIENT_A_FIRST LOOKUP; do
    eval "[ -n \"\$$v\" ]" || echo "WARNING: could not start the $v session; its checks will show NOSESSION." | tee -a "$RESULTS"
  done

  echo | tee -a "$RESULTS"
  echo "== ADR-021 decision 7 · as coach A's tenant session (blocker #4) ==" | tee -a "$RESULTS"
  check 021-1a ALLOW "GetItem own profile"                     ddb "$COACH_A" get-item --key "$(key COACH#coach-a PROFILE)"
  check 021-1b ALLOW "Query own partition"                     q "$COACH_A" COACH#coach-a
  check 021-2a DENY  "GetItem coach B's profile"               ddb "$COACH_A" get-item --key "$(key COACH#coach-b PROFILE)"
  check 021-2b DENY  "Query coach B's partition"               q "$COACH_A" COACH#coach-b
  check 021-2c DENY  "PutItem into coach B"                    ddb "$COACH_A" put-item --item "$(key COACH#coach-b "TEST#021-2c-$run")"
  check 021-2d DENY  "UpdateItem coach B's profile"            ddb "$COACH_A" update-item --key "$(key COACH#coach-b PROFILE)" \
                                                                 --update-expression "SET lastName = :v" --expression-attribute-values '{":v":{"S":"Changed"}}'
  check 021-2e DENY  "DeleteItem coach B's profile"            ddb "$COACH_A" delete-item --key "$(key COACH#coach-b PROFILE)"
  check 021-3a ALLOW "OPEN · Query GSI3 for own coach"         qi "$COACH_A" GSI3 COACH#coach-a
  check 021-3b DENY  "OPEN · Query GSI3 for coach B"           qi "$COACH_A" GSI3 COACH#coach-b
  local tx4 tx5
  tx4=$(jq -nc --arg t "$TABLE" --arg r "$run" '[
    {Put:{TableName:$t, Item:{PK:{S:"COACH#coach-a"}, SK:{S:("TEST#021-4-"+$r)}}}},
    {Put:{TableName:$t, Item:{PK:{S:"COACH#coach-b"}, SK:{S:("TEST#021-4-"+$r)}}}}]')
  check 021-4  DENY  "Transaction: one item in A, one in B"   transact "$COACH_A" "$tx4"
  if aws dynamodb get-item --table-name "$TABLE" --key "$(key COACH#coach-a "TEST#021-4-$run")" --output json | jq -e '.Item' >/dev/null 2>&1; then
    printf '%-5s %-8s %s\n' FAIL 021-4v "coach A's half of the denied transaction WAS written" | tee -a "$RESULTS"
  else
    printf '%-5s %-8s %s\n' PASS 021-4v "nothing from the denied transaction was written" | tee -a "$RESULTS"
  fi
  tx5=$(jq -nc --arg t "$TABLE" --arg r "$run" '[
    {Put:{TableName:$t, Item:{PK:{S:"COACH#coach-a"}, SK:{S:("TEST#021-5-"+$r)}}}},
    {Put:{TableName:$t, Item:{PK:{S:("CODE#GATE"+$r)}, SK:{S:"CODE"}, coachId:{S:"coach-a"},
          coachFirstName:{S:"Dana"}, coachLastName:{S:"Reyes"}}, ConditionExpression:"attribute_not_exists(PK)"}}]')
  check 021-5  ALLOW "Transaction: own item plus a CODE# claim" transact "$COACH_A" "$tx5"
  check 021-6a DENY  "PutItem under CLIENT#"                   ddb "$COACH_A" put-item --item "$(key CLIENT#client-a "TEST#021-6a-$run")"
  check 021-6b DENY  "Query GSI1"                              qi "$COACH_A" GSI1 CLIENT#client-a
  check 021-6c DENY  "Query GSI2"                              qi "$COACH_A" GSI2 DATE#2026-11-03
  check 021-6d DENY  "Scan the table"                          ddb "$COACH_A" scan --max-items 1
  check 021-7a DENY  "AssumeRole with no coachId tag"          as "$EXEC" sts assume-role --role-arn "$(role_arn coach-tenant)" --role-session-name notag
  check 021-7b DENY  "AssumeRole with an extra tag key"        as "$EXEC" sts assume-role --role-arn "$(role_arn coach-tenant)" --role-session-name extratag \
                                                                 --tags Key=coachId,Value=coach-a Key=extra,Value=x
  check 021-8  DENY  "DynamoDB with the execution role's own credentials" ddb "$EXEC" get-item --key "$(key COACH#coach-a PROFILE)"

  echo | tee -a "$RESULTS"
  echo "== ADR-022 decision 9 · as client A, a family of coach A (blocker #5) ==" | tee -a "$RESULTS"
  check 022-1a ALLOW "Query own CLIENT# partition"             q "$CLIENT_A" CLIENT#client-a
  check 022-1b ALLOW "OPEN · Query GSI1 for own bookings"      qi "$CLIENT_A" GSI1 CLIENT#client-a
  check 022-2a DENY  "Query client B's partition"              q "$CLIENT_A" CLIENT#client-b
  check 022-2b DENY  "OPEN · Query GSI1 for client B"          qi "$CLIENT_A" GSI1 CLIENT#client-b
  check 022-3a ALLOW "Coach's slots, allowlisted fields"       qp "$CLIENT_A" COACH#coach-a SLOT# "$ALLOWED_SLOT"
  check 022-3b ALLOW "Coach's schedule, allowlisted fields"    qp "$CLIENT_A" COACH#coach-a SCHEDULE# "PK,SK,days,blocks,scheduleName"
  check 022-4a DENY  "Slots with studentId"                    qp "$CLIENT_A" COACH#coach-a SLOT# "$ALLOWED_SLOT,studentId"
  check 022-4b DENY  "Slots with clientEmail"                  qp "$CLIENT_A" COACH#coach-a SLOT# "$ALLOWED_SLOT,clientEmail"
  check 022-4c DENY  "Slots with priceMinor"                   qp "$CLIENT_A" COACH#coach-a SLOT# "$ALLOWED_SLOT,priceMinor"
  check 022-4d DENY  "Slots with no projection"                qnp "$CLIENT_A" COACH#coach-a SLOT#
  check 022-5a DENY  "PENDING: coach's slots"                  qp "$CLIENT_A_PENDING" COACH#coach-a SLOT# "$ALLOWED_SLOT"
  check 022-5b DENY  "PENDING: coach's profile"                gp "$CLIENT_A_PENDING" COACH#coach-a PROFILE "firstName,lastName"
  check 022-5c ALLOW "ACTIVE: coach's profile"                 gp "$CLIENT_A" COACH#coach-a PROFILE "firstName,lastName"
  check 022-6a DENY  "Coach B's profile"                       gp "$CLIENT_A" COACH#coach-b PROFILE "firstName,lastName"
  check 022-6b DENY  "Coach B's slots"                         qp "$CLIENT_A" COACH#coach-b SLOT# "$ALLOWED_SLOT"
  local bk
  bk=$(jq -nc --arg r "$run" --arg pk COACH#coach-a '{PK:{S:$pk}, SK:{S:("SLOT#2026-11-10#16:00#k7-"+$r)},
       bookingStatus:{S:"BOOKED"}, studentId:{S:"stu-a1"}, clientId:{S:"client-a"}}')
  check 022-7a ALLOW "Conditional booking into coach A"        ddb "$CLIENT_A" put-item --item "$bk" --condition-expression "attribute_not_exists(PK)"
  check 022-7b DENY  "Conditional booking into coach B"        ddb "$CLIENT_A" put-item --condition-expression "attribute_not_exists(PK)" \
                                                                 --item "$(jq -c '.PK.S = "COACH#coach-b"' <<<"$bk")"
  check 022-8  DENY  "Write to coach A with ReturnValues ALL_OLD" ddb "$CLIENT_A" put-item --item "$(key COACH#coach-a "TEST#022-8-$run")" --return-values ALL_OLD

  # Row 9 records an answer rather than passing or failing. A booking attempt on client B's
  # taken slot, first without and then with ReturnValuesOnConditionCheckFailure = ALL_OLD.
  # The first is the control: it must fail on the condition, which proves the write itself is
  # allowed, so any difference in the second comes from the ALL_OLD option alone.
  local taken out9 code9 dbg leak
  taken=$(key COACH#coach-a "SLOT#2026-11-03#16:30#s2")
  check 022-9a CONDFAIL "Control: book client B's taken slot, no return values" \
    ddb "$CLIENT_A" put-item --item "$taken" --condition-expression "attribute_not_exists(PK)"
  out9=$(ddb "$CLIENT_A" put-item --item "$taken" --condition-expression "attribute_not_exists(PK)" \
           --return-values-on-condition-check-failure ALL_OLD 2>&1)
  code9=$(grep -oE '\(([A-Za-z]+)\)' <<<"$out9" | head -1 | tr -d '()')
  printf '%-5s %-8s %s\n' INFO 022-9b "Same attempt with ALL_OLD on failure: error code ${code9:-none (the write succeeded)}" | tee -a "$RESULTS"
  case "$code9" in
    AccessDeniedException)
      leak="DENIED: with ALL_OLD the request is refused by IAM, so nothing can leak (the policy blocks it)" ;;
    ConditionalCheckFailedException)
      dbg=$(ddb "$CLIENT_A" put-item --item "$taken" --condition-expression "attribute_not_exists(PK)" \
              --return-values-on-condition-check-failure ALL_OLD --debug 2>&1)
      if grep -q "stu-b1" <<<"$dbg"; then leak="LEAKS: the failed write returned client B's booking, including studentId"
      else leak="DOES NOT LEAK: the failed write returned none of client B's booking"; fi ;;
    *) leak="UNEXPECTED: $(tr '\n' ' ' <<<"$out9" | head -c 300)" ;;
  esac
  printf '%-5s %-8s %s\n' INFO 022-9 "$leak" | tee -a "$RESULTS"

  check 022-10a DENY  "First session (clientId only): coach's slots" qp "$CLIENT_A_FIRST" COACH#coach-a SLOT# "$ALLOWED_SLOT"
  check 022-10b ALLOW "First session: own profile"             ddb "$CLIENT_A_FIRST" get-item --key "$(key CLIENT#client-a PROFILE)"
  check 022-11a ALLOW "code-lookup: code with allowed fields"  gp "$LOOKUP" CODE#DANA7K2Q CODE "coachId,coachFirstName,coachLastName"
  check 022-11b DENY  "code-lookup: code with createdAt"       gp "$LOOKUP" CODE#DANA7K2Q CODE "coachId,createdAt"
  check 022-11c DENY  "code-lookup: code, no projection"       ddb "$LOOKUP" get-item --key "$(key CODE#DANA7K2Q CODE)"
  check 022-11d DENY  "code-lookup: Query a code"              q "$LOOKUP" CODE#DANA7K2Q
  check 022-11e DENY  "code-lookup: coach's profile"           gp "$LOOKUP" COACH#coach-a PROFILE "firstName"
  check 022-11f DENY  "code-lookup: a family's profile"        ddb "$LOOKUP" get-item --key "$(key CLIENT#client-a PROFILE)"

  summary
}

got() { grep -E "^[A-Z]+ +$1 " "$RESULTS" | sed -E 's/.* got ([A-Z]+) .*/\1/'; }

summary() {
  local pass fail a b
  pass=$(grep -c '^PASS' "$RESULTS"); fail=$(grep -c '^FAIL' "$RESULTS")
  {
    echo
    echo "== Summary =="
    echo "${pass} passed, ${fail} failed."
    a=$(got 021-3a); b=$(got 021-3b)
    if   [ "$a" = ALLOW ] && [ "$b" = DENY ]; then echo "Blocker #4 (GSI3): the index IS locked to the coach. ADR-021 stands as written."
    elif [ "$a" = DENY ];                     then echo "Blocker #4 (GSI3): the policy refuses even the coach's own index query. Take GSI3 off coach-tenant (ADR-021 d7 fallback)."
    else                                           echo "Blocker #4 (GSI3): the index is NOT locked (coach B readable). Take GSI3 off coach-tenant (ADR-021 d7 fallback)."; fi
    a=$(got 022-1b); b=$(got 022-2b)
    if   [ "$a" = ALLOW ] && [ "$b" = DENY ]; then echo "Blocker #5 (GSI1): the index IS locked to the family. ADR-022 stands as written."
    elif [ "$a" = DENY ];                     then echo "Blocker #5 (GSI1): the policy refuses even the family's own index query. Use the CLIENT# booking copy (ADR-022 d9 fallback)."
    else                                           echo "Blocker #5 (GSI1): the index is NOT locked (client B readable). Use the CLIENT# booking copy (ADR-022 d9 fallback)."; fi
    grep '022-9' "$RESULTS" | tail -1 | sed 's/^/Row 9: /'
    [ "$fail" -gt 0 ] && echo "Any other FAIL is a finding: the policy does not do what the ADR says. See the runbook, step 7."
    echo "Results saved to ${RESULTS}"
  } | tee -a "$RESULTS"
}

case "${1:-}" in
  setup)    setup ;;
  seed)     seed ;;
  run)      run_tests ;;
  teardown) teardown ;;
  *) echo "usage: $0 setup | seed | run | teardown"; exit 1 ;;
esac
