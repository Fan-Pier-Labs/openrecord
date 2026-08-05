#!/usr/bin/env bash
#
# Deploy (or update) the newsletter-signup Lambda + a public API Gateway HTTP API
# that fronts it. Idempotent: re-running updates the function code and re-applies
# the API config.
#
# Why API Gateway instead of a Lambda Function URL?
#   This AWS account blocks unauthenticated (auth-type NONE) Lambda Function URL
#   access at the account level — a correctly-configured public Function URL still
#   returns 403 AccessDeniedException. API Gateway invokes the Lambda as the
#   authenticated apigateway.amazonaws.com principal, so the public ingress works
#   while the Lambda still just console.log()s each signup to CloudWatch.
#
# Usage:  ./deploy.sh
#
set -euo pipefail

PROFILE="${AWS_PROFILE:-fanpierlabs}"
REGION="${AWS_REGION:-us-east-2}"
FN_NAME="newsletter-signup"
ROLE_NAME="newsletter-lambda-role"
API_NAME="newsletter-signup-api"
RUNTIME="nodejs22.x"
HANDLER="handler.handler"

# CORS is wide open: this is a public newsletter sink, CORS doesn't protect it
# (curl/bots ignore it entirely), and "*" lets any origin (incl. local dev) post.
ALLOW_ORIGINS='*'

cd "$(dirname "$0")"
AWS=(aws --profile "$PROFILE" --region "$REGION")
ACCOUNT_ID="$("${AWS[@]}" sts get-caller-identity --query Account --output text)"

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
ROLE_ARN="$("${AWS[@]}" iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"

echo "==> Packaging handler"
TMP_ZIP="$(mktemp -t newsletter-lambda-XXXX.zip)"
rm -f "$TMP_ZIP" # zip needs to create the archive itself, not append to an empty file
trap 'rm -f "$TMP_ZIP"' EXIT
# Lambda expects handler.mjs at the zip root (handler == "handler.handler").
( cd src && zip -q -j "$TMP_ZIP" handler.mjs )

echo "==> Deploying function $FN_NAME ($RUNTIME)"
if "${AWS[@]}" lambda get-function --function-name "$FN_NAME" >/dev/null 2>&1; then
  "${AWS[@]}" lambda update-function-code \
    --function-name "$FN_NAME" \
    --zip-file "fileb://$TMP_ZIP" >/dev/null
else
  "${AWS[@]}" lambda create-function \
    --function-name "$FN_NAME" \
    --runtime "$RUNTIME" \
    --handler "$HANDLER" \
    --role "$ROLE_ARN" \
    --timeout 5 \
    --memory-size 128 \
    --zip-file "fileb://$TMP_ZIP" >/dev/null
fi
FN_ARN="$("${AWS[@]}" lambda get-function --function-name "$FN_NAME" --query 'Configuration.FunctionArn' --output text)"

echo "==> Ensuring HTTP API $API_NAME exists"
API_ID="$("${AWS[@]}" apigatewayv2 get-apis --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)"
if [ "$API_ID" = "None" ] || [ -z "$API_ID" ]; then
  # Quick-create: makes a $default catch-all route + integration to the Lambda
  # (payload format 2.0) and an auto-deploy $default stage.
  API_ID="$("${AWS[@]}" apigatewayv2 create-api \
    --name "$API_NAME" \
    --protocol-type HTTP \
    --target "$FN_ARN" \
    --query ApiId --output text)"
  echo "    created API $API_ID"
fi

echo "==> Setting CORS"
"${AWS[@]}" apigatewayv2 update-api \
  --api-id "$API_ID" \
  --cors-configuration "AllowOrigins=${ALLOW_ORIGINS},AllowMethods=*,AllowHeaders=*,MaxAge=86400" >/dev/null

echo "==> Granting API Gateway permission to invoke the Lambda"
"${AWS[@]}" lambda add-permission \
  --function-name "$FN_NAME" \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" >/dev/null 2>&1 || true

API_ENDPOINT="$("${AWS[@]}" apigatewayv2 get-api --api-id "$API_ID" --query ApiEndpoint --output text)"
echo ""
echo "==> Done. Newsletter endpoint:"
echo "    $API_ENDPOINT"
