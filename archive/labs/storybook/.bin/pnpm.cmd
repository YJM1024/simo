@echo off
rem Local pnpm shim for the Storybook spike (pnpm is not installed globally in this environment).
rem Keeps all work inside labs/storybook; do not add to PATH globally.
setlocal
set NODE_EXE=E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe
set PNPM_CJS=E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs
"%NODE_EXE%" "%PNPM_CJS%" %*
