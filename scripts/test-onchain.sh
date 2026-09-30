#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
program_id=ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck
program_so=programs/vesti-escrow/target/deploy/vesti_escrow.so
if [[ ! -f "$program_so" ]]; then
  echo "Build the program first: anchor build --ignore-keys --provider.cluster localnet" >&2
  exit 1
fi

ledger_dir=$(mktemp -d "${TMPDIR:-/tmp}/vesti-validator.XXXXXX")
rpc_port=${VESTI_TEST_RPC_PORT:-18899}
faucet_port=$((rpc_port + 3))
gossip_port=$((rpc_port + 2))
dynamic_port_min=$((rpc_port + 10))
dynamic_port_max=$((rpc_port + 80))
fixture_args=(--bind-address 127.0.0.1)
legacy_fixture_dir=""
if [[ ${VESTI_WEB_CHAIN_TEST:-0} != 1 ]]; then
  legacy_fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/vesti-legacy.XXXXXX")
  corepack pnpm exec tsx tests/onchain/generate-legacy-fixtures.mjs "$legacy_fixture_dir"
  fixture_args+=(--account-dir "$legacy_fixture_dir/accounts")
  export VESTI_LEGACY_FIXTURES="$legacy_fixture_dir/manifest.json"
fi
solana-test-validator --reset --ledger "$ledger_dir" --rpc-port "$rpc_port" \
  --ticks-per-slot "${VESTI_TEST_TICKS_PER_SLOT:-16}" --faucet-port "$faucet_port" --gossip-port "$gossip_port" \
  --dynamic-port-range "$dynamic_port_min-$dynamic_port_max" \
  --bpf-program "$program_id" "$program_so" \
  "${fixture_args[@]}" \
  >"$ledger_dir/validator.log" 2>&1 &
validator_pid=$!
cleanup() {
  kill "$validator_pid" 2>/dev/null || true
  wait "$validator_pid" 2>/dev/null || true
  if [[ -n "$legacy_fixture_dir" ]]; then rm -rf "$legacy_fixture_dir"; fi
  if [[ ${VESTI_KEEP_TEST_LEDGER:-0} == 1 ]]; then
    echo "Validator ledger and log: $ledger_dir"
  else
    rm -rf "$ledger_dir"
  fi
}
trap cleanup EXIT

export VESTI_TEST_RPC_URL="http://127.0.0.1:$rpc_port"
ready=0
for _ in {1..60}; do
  if ! kill -0 "$validator_pid" 2>/dev/null; then
    cat "$ledger_dir/validator.log" >&2
    exit 1
  fi
  if solana cluster-version --url "$VESTI_TEST_RPC_URL" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  cat "$ledger_dir/validator.log" >&2
  exit 1
fi

if [[ ${VESTI_WEB_CHAIN_TEST:-0} == 1 ]]; then
  corepack pnpm exec tsx tests/onchain/web-chain-workflow.ts
else
  corepack pnpm exec tsx tests/onchain/escrow-validator.mjs
fi
