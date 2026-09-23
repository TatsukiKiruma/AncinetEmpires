# V11 regression test runner.
#
# The confined environment denies process and pipe creation, so the plain
# `vitest.v11.config.mjs` configuration is used instead of `vite.config.ts`
# (which loads the React/Tailwind plugins and their esbuild service process).
#
#   pwsh -File v11/tools/run-tests.ps1                       # v11 regression contract
#   pwsh -File v11/tools/run-tests.ps1 tools/v11_replay_e2e.test.ts
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Targets = @('tools/v11_regression_contract.test.ts', 'tools/v11_replay_e2e.test.ts')
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Push-Location $repo
try {
    node --require ./v11/tools/core-spawn-shim.cjs `
         ./node_modules/vitest/vitest.mjs run `
         --configLoader runner `
         --config vitest.v11.config.mjs `
         @Targets
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}