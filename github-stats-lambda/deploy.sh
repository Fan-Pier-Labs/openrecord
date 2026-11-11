#!/usr/bin/env bash
# Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

#
# Deploy (or update) the openrecord-github-stats Lambda and its weekly schedule.
# Idempotent: re-running updates the code and leaves everything else in place.
#
# Usage:  AWS_PROFILE=fanpierlabs ./deploy.sh
#
set -euo pipefail

PROFILE="${AWS_PROFILE:-fanpierlabs}"
REGION="${AWS_REGION:-us-east-2}"
FN_NAME="openrecord-github-stats"
ROLE_NAME="openrecord-github-stats-role"
RULE_NAME="openrecord-github-stats-weekly"
# Mondays 14:00 UTC.
SCHEDULE="cron(0 14 ? * MON *)"
LOG_GROUP="/aws/lambda/$FN_NAME"

cd "$(dirname "$0")"
AWS=(aws --profile "$PROFILE" --region "$REGION")
ACCOUNT_ID="$("${AWS[@]}" sts get-caller-identity --query Account --output text)"
FN_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FN_NAME}"

echo "==> Ensuring IAM role $ROLE_NAME exists"
if ! "${AWS[@]}" iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  "${AWS[@]}" iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null
  "${AWS[@]}" iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "    created; waiting for IAM propagation..."
  sleep 10
fi
# A rate-limited run re-invokes itself to keep waiting (handler.py).
"${AWS[@]}" iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name invoke-self \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": \"lambda:InvokeFunction\",
      \"Resource\": \"$FN_ARN\"
    }]
  }" >/dev/null
ROLE_ARN="$("${AWS[@]}" iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"

# Created up front with no retention policy, so snapshots never expire.
echo "==> Ensuring log group $LOG_GROUP exists"
"${AWS[@]}" logs create-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true

echo "==> Packaging handler"
TMP_DIR="$(mktemp -d)"
TMP_ZIP="$TMP_DIR/handler.zip"
trap 'rm -rf "$TMP_DIR"' EXIT
zip -q -j "$TMP_ZIP" handler.py

echo "==> Deploying function $FN_NAME"
if "${AWS[@]}" lambda get-function --function-name "$FN_NAME" >/dev/null 2>&1; then
  "${AWS[@]}" lambda update-function-code \
    --function-name "$FN_NAME" \
    --zip-file "fileb://$TMP_ZIP" >/dev/null
else
  "${AWS[@]}" lambda create-function \
    --function-name "$FN_NAME" \
    --runtime python3.13 \
    --handler handler.handler \
    --role "$ROLE_ARN" \
    --timeout 900 \
    --memory-size 128 \
    --zip-file "fileb://$TMP_ZIP" >/dev/null
fi
"${AWS[@]}" lambda wait function-updated --function-name "$FN_NAME"

echo "==> Scheduling $RULE_NAME: $SCHEDULE"
RULE_ARN="$("${AWS[@]}" events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "$SCHEDULE" \
  --query RuleArn --output text)"
"${AWS[@]}" events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id=lambda,Arn=$FN_ARN" >/dev/null
"${AWS[@]}" lambda add-permission \
  --function-name "$FN_NAME" \
  --statement-id events-weekly \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "$RULE_ARN" >/dev/null 2>&1 || true

echo ""
echo "==> Done. Run it now with:"
echo "    aws --profile $PROFILE --region $REGION lambda invoke --function-name $FN_NAME --invocation-type Event /dev/null"
