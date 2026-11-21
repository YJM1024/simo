package chat

// P1-CONV 消息分类解析单元契约测试（AC-CONV-004-01）。
// 分类标记只认模型回复首行；非法/未知取值必须保守回落到 consultation，
// 且剥离后的正文不能残留标记行——这是 agent 消息 category 字段的唯一来源。

import "testing"

func TestParseCategoryMarkerTable(t *testing.T) {
	cases := []struct {
		name      string
		text      string
		wantFound bool
		wantCat   string
		wantRest  string
	}{
		{
			name:      "无标记返回原文",
			text:      "普通回复正文",
			wantFound: false,
			wantCat:   "",
			wantRest:  "普通回复正文",
		},
		{
			name:      "requirement 标记",
			text:      "@@CATEGORY: requirement\n需求正文",
			wantFound: true,
			wantCat:   CategoryRequirement,
			wantRest:  "需求正文",
		},
		{
			name:      "clarification 标记",
			text:      "@@CATEGORY: clarification\n需要澄清",
			wantFound: true,
			wantCat:   CategoryClarification,
			wantRest:  "需要澄清",
		},
		{
			name:      "progress 标记",
			text:      "@@CATEGORY: progress\n进行中",
			wantFound: true,
			wantCat:   CategoryProgress,
			wantRest:  "进行中",
		},
		{
			name:      "consultation 标记",
			text:      "@@CATEGORY: consultation\n咨询正文",
			wantFound: true,
			wantCat:   CategoryConsultation,
			wantRest:  "咨询正文",
		},
		{
			name:      "大写与多余空格归一化",
			text:      "@@CATEGORY:   PROGRESS  \n正文",
			wantFound: true,
			wantCat:   CategoryProgress,
			wantRest:  "正文",
		},
		{
			name:      "未知取值回落 consultation",
			text:      "@@CATEGORY: urgent\n正文",
			wantFound: true,
			wantCat:   CategoryConsultation,
			wantRest:  "正文",
		},
		{
			name:      "空取值回落 consultation",
			text:      "@@CATEGORY:\n正文",
			wantFound: true,
			wantCat:   CategoryConsultation,
			wantRest:  "正文",
		},
		{
			name:      "CRLF 行尾",
			text:      "@@CATEGORY: progress\r\n正文\r\n第二行",
			wantFound: true,
			wantCat:   CategoryProgress,
			wantRest:  "正文\r\n第二行",
		},
		{
			name:      "只有标记没有正文",
			text:      "@@CATEGORY: progress",
			wantFound: true,
			wantCat:   CategoryProgress,
			wantRest:  "",
		},
		{
			name:      "标记前有空格仍识别",
			text:      "  @@CATEGORY: progress\n正文",
			wantFound: true,
			wantCat:   CategoryProgress,
			wantRest:  "正文",
		},
		{
			name:      "标记不在首行不识别",
			text:      "正文\n@@CATEGORY: progress",
			wantFound: false,
			wantCat:   "",
			wantRest:  "正文\n@@CATEGORY: progress",
		},
		{
			name:      "行内出现标记文本不识别",
			text:      "说明 @@CATEGORY: progress 是标记",
			wantFound: false,
			wantCat:   "",
			wantRest:  "说明 @@CATEGORY: progress 是标记",
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			category, found, rest := parseCategoryMarker(testCase.text)
			if found != testCase.wantFound {
				t.Fatalf("found = %v, want %v", found, testCase.wantFound)
			}
			if category != testCase.wantCat {
				t.Fatalf("category = %q, want %q", category, testCase.wantCat)
			}
			if rest != testCase.wantRest {
				t.Fatalf("rest = %q, want %q", rest, testCase.wantRest)
			}
		})
	}
}

func TestCategoryFromFirstLineStripsHeader(t *testing.T) {
	cases := []struct {
		name     string
		text     string
		wantCat  string
		wantText string
	}{
		{
			name:     "无标记不改写正文",
			text:     "普通回复",
			wantCat:  "",
			wantText: "普通回复",
		},
		{
			name:     "剥离标记行与一个换行",
			text:     "@@CATEGORY: requirement\n需求正文\n第二段",
			wantCat:  CategoryRequirement,
			wantText: "需求正文\n第二段",
		},
		{
			name:     "标记后空行只剥离一个空行",
			text:     "@@CATEGORY: progress\n\n正文",
			wantCat:  CategoryProgress,
			wantText: "正文",
		},
		{
			name:     "CRLF 剥离后不留回车",
			text:     "@@CATEGORY: clarification\r\n澄清正文",
			wantCat:  CategoryClarification,
			wantText: "澄清正文",
		},
		{
			name:     "非法取值仍剥离标记行",
			text:     "@@CATEGORY: whatever\n正文",
			wantCat:  CategoryConsultation,
			wantText: "正文",
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			category, text, stripped := categoryFromFirstLine(testCase.text)
			if category != testCase.wantCat {
				t.Fatalf("category = %q, want %q", category, testCase.wantCat)
			}
			if text != testCase.wantText {
				t.Fatalf("text = %q, want %q", text, testCase.wantText)
			}
			if stripped != (testCase.wantCat != "") {
				t.Fatalf("stripped = %v, want %v", stripped, testCase.wantCat != "")
			}
		})
	}
}
