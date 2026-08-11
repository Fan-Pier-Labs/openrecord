#!/usr/bin/env bash
#
# Deploy (or update) the openrecord-demo-ai Lambda + a public API Gateway HTTP
# API that fronts it. Idempotent: re-running updates the function code, the env
# vars, and the API config.
#
# This backs the public demo at https://openrecord.fanpierlabs.com/demo.html — it
# takes { system, messages } from the browser and proxies to Gemini. See
# `src/handler.mjs` for the abuse controls.
#
# Why API Gateway instead of a Lambda Function URL? Same reason as
# newsletter-lambda: this account blocks unauthenticated (auth-type NONE)
# Function URL access, so a public Function URL 403s even when configured
# correctly. API Gateway invokes the Lambda as apigateway.amazonaws.com.
#
# The Gemini key is read once at deploy time from the existing GEMINI_API_KEY
# secret and set as a function env var, so the Lambda itself needs no
# Secrets Manager permissions and no AWS SDK.
#
# Usage:  AWS_PROFILE=fanpierlabs ./deploy.sh
#
set -euo pipefail

PROFILE="${AWS_PROFILE:-fanpierlabs}"
REGION="${AWS_REGION:-us-east-2}"
FN_NAME="openrecord-demo-ai"
ROLE_NAME="openrecord-demo-ai-role"
API_NAME="openrecord-demo-ai-api"
RUNTIME="nodejs22.x"
HANDLER="handler.handler"
SECRET_NAME="${SECRET_NAME:-GEMINI_API_KEY}"
MODEL="${DEMO_MODEL:-gemini-2.5-flash}"

# CORS is wide open. It doesn't protect anything here (curl ignores it), and
# "*" lets the CloudFront-hosted demo and local checkouts both post.
ALLOW_ORIGINS='*'

cd "$(dirname "$0")"
AWS=(aws --profile "$PROFILE" --region "$REGION")
ACCOUNT_ID="$("${AWS[@]}" sts get-caller-identity --query Account --output text)"

echo "==> Reading $SECRET_NAME from Secrets Manager"
GEMINI_API_KEY="$("${AWS[@]}" secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" --query SecretString --output text)"
# The secret may be stored as a bare string or as {"GEMINI_API_KEY":"..."}.
if [[ "$GEMINI_API_KEY" == \{* ]]; then
  GEMINI_API_KEY="$(printf '%s' "$GEMINI_API_KEY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("GEMINI_API_KEY") or next(iter(d.values())))')"
fi
if [ -z "$GEMINI_API_KEY" ]; then
  echo "!! Could not read a Gemini key from secret $SECRET_NAME" >&2
  exit 1
fi

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
TMP_ZIP="$(mktemp -t openrecord-demo-ai-XXXX.zip)"
rm -f "$TMP_ZIP" # zip needs to create the archive itself, not append to an empty file
trap 'rm -f "$TMP_ZIP"' EXIT
# Lambda expects handler.mjs at the zip root (handler == "handler.handler").
( cd src && zip -q -j "$TMP_ZIP" handler.mjs )

echo "==> Deploying function $FN_NAME ($RUNTIME, model $MODEL)"
if "${AWS[@]}" lambda get-function --function-name "$FN_NAME" >/dev/null 2>&1; then
  "${AWS[@]}" lambda update-function-code \
    --function-name "$FN_NAME" \
    --zip-file "fileb://$TMP_ZIP" >/dev/null
  "${AWS[@]}" lambda wait function-updated --function-name "$FN_NAME"
  "${AWS[@]}" lambda update-function-configuration \
    --function-name "$FN_NAME" \
    --timeout 30 \
    --memory-size 256 \
    --environment "Variables={GEMINI_API_KEY=$GEMINI_API_KEY,DEMO_MODEL=$MODEL}" >/dev/null
else
  "${AWS[@]}" lambda create-function \
    --function-name "$FN_NAME" \
    --runtime "$RUNTIME" \
    --handler "$HANDLER" \
    --role "$ROLE_ARN" \
    --timeout 30 \
    --memory-size 256 \
    --environment "Variables={GEMINI_API_KEY=$GEMINI_API_KEY,DEMO_MODEL=$MODEL}" \
    --zip-file "fileb://$TMP_ZIP" >/dev/null
fi
"${AWS[@]}" lambda wait function-updated --function-name "$FN_NAME"
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
echo "==> Done. Demo AI endpoint:"
echo "    $API_ENDPOINT"
echo ""
echo "    If this changed, update DEFAULT_AI_ENDPOINT in"
echo "    openrecord-splash/demo/src/config.ts and backendUrl in"
echo "    expo-app/app.config.ts, then redeploy the splash site:"
echo "    cd ../openrecord-splash && ./deploy.sh"
