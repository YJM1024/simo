package chat

import _ "embed"

// officeHelperScript 随二进制分发，运行时不依赖 cwd/scripts 目录（M12）。
//
//go:embed office_helper.py
var officeHelperScript []byte
