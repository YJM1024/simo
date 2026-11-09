// Package webui 内嵌构建好的前端静态资源。
//
// dist/ 目录由 `web` 项目的 `node build.mjs` 生成（esbuild + Tailwind v4 + tsc --noEmit），
// 然后 `go build` 会把整个前端打进单个二进制。
package webui

import "embed"

// Dist 是前端构建产物；开发期若尚未构建，dist/index.html 是占位页。
//
//go:embed all:dist
var Dist embed.FS
