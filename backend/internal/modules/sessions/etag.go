package sessions

import (
	"crypto/sha256"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// listETag 计算会话列表响应的强验证器，形如 "sess-<16 位十六进制>"。
//
// 摘要只覆盖响应体里真正会出现的字段（会话元数据、每次现算的 hasUnread 与
// messageCount），并且先按 ID 排序，因此与 SQL 行序、服务实例和请求顺序无关：
// 同一份数据在任意实例上得到同一个 ETag；任意字段变化（包括 hasUnread 翻转或
// 消息增减）都会改变摘要，不会出现“内容变了但 ETag 未变”的 304 误判。
//
// hasUnread 与 messageCount 在调用本函数之前已现算并写入投影，本函数不保留任何
// 跨请求状态；304 分支与 200 分支基于同一次现算结果。
func listETag(list []sessionView) string {
	entries := make([]string, 0, len(list))
	for _, item := range list {
		entries = append(entries, strings.Join([]string{
			item.ID,
			item.ParentID,
			item.Title,
			strconv.FormatInt(item.CreatedAt, 10),
			strconv.FormatInt(item.Archived, 10),
			strconv.FormatBool(item.Pinned),
			item.OwnerAgentID,
			strconv.FormatBool(item.HasUnread),
			strconv.Itoa(item.MessageCount),
		}, "\x1f"))
	}
	sort.Strings(entries)
	sum := sha256.Sum256([]byte(strings.Join(entries, "\x1e")))
	return fmt.Sprintf(`"sess-%x"`, sum[:8])
}

// etagMatches 按 RFC 7232 判断 If-None-Match 是否命中当前表示。
//
// 支持 `*`、逗号分隔的多值以及 `W/` 弱标签前缀；空值、过期标签和不带引号的
// 裸值一律视为不命中，请求回落到 200 而不是构造错误响应。
func etagMatches(ifNoneMatch, current string) bool {
	if current == "" {
		return false
	}
	for _, raw := range strings.Split(ifNoneMatch, ",") {
		tag := strings.TrimSpace(raw)
		if tag == "*" {
			return true
		}
		if strings.TrimPrefix(tag, "W/") == current {
			return true
		}
	}
	return false
}
