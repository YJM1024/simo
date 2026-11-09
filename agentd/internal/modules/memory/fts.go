package memory

import (
	"strings"
	"unicode/utf8"
)

// queryMatch 为 FTS5 trigram 构造查询：>=3 字符用原字符串短语命中。
// <3 字符返回空，由调用方回退 LIKE（m3-contract §4）。
func queryMatch(q string) string {
	q = strings.TrimSpace(q)
	if utf8.RuneCountInString(q) < 3 {
		return ""
	}
	return `"` + escapeFTS(q) + `"`
}

func escapeFTS(value string) string {
	return strings.ReplaceAll(value, `"`, `""`)
}
