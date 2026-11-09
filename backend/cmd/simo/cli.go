package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var cliNamespaces = map[string]bool{
	"session": true, "agent": true, "chat": true, "task": true, "workflow": true,
	"schedule": true, "memory": true, "file": true, "permission": true, "ui": true,
	"config": true, "system": true, "actions": true,
}

func runCLI(args []string) int {
	baseURL := os.Getenv("SIMO_BASE_URL")
	if baseURL == "" {
		baseURL = os.Getenv("SIMO_BASE_URL")
	}
	if baseURL == "" {
		baseURL = "http://127.0.0.1:8787"
	}
	jsonOut, pretty, yes, dryRun := false, false, false, false
	bodyFile := ""
	var positional []string
	var argsMap = map[string]any{}
	for i := 0; i < len(args); i++ {
		token := args[i]
		switch {
		case token == "--json":
			jsonOut = true
		case token == "--pretty":
			pretty = true
		case token == "--yes" || token == "-y":
			yes = true
		case token == "--dry-run":
			dryRun = true
		case token == "--help" || token == "-h":
			printCLIUsage()
			return 0
		case token == "--":
			positional = append(positional, args[i+1:]...)
			i = len(args)
		case token == "--base-url":
			if i+1 >= len(args) {
				return cliUsageError("--base-url 缺少值")
			}
			i++
			baseURL = args[i]
		case token == "--body":
			if i+1 >= len(args) {
				return cliUsageError("--body 缺少值")
			}
			i++
			bodyFile = args[i]
		case strings.HasPrefix(token, "--"):
			key := strings.TrimPrefix(token, "--")
			value := ""
			if idx := strings.Index(key, "="); idx >= 0 {
				value = key[idx+1:]
				key = key[:idx]
			}
			key = strings.ReplaceAll(key, "-", "_")
			if value == "" {
				if i+1 >= len(args) || args[i+1] == "--" {
					return cliUsageError("--" + strings.ReplaceAll(key, "_", "-") + " 缺少值")
				}
				i++
				value = args[i]
			}
			argsMap[flagArgKey(key)] = value
		default:
			positional = append(positional, token)
		}
	}
	if jsonOut && pretty {
		return cliUsageError("--json 与 --pretty 互斥")
	}
	if len(positional) == 0 {
		printCLIUsage()
		return 2
	}
	namespace := positional[0]
	if namespace == "actions" {
		return cliActions(baseURL, positional[1:], jsonOut)
	}
	if !cliNamespaces[namespace] {
		return cliUsageError("未知命名空间: " + namespace)
	}
	actionName := ""
	positionalStart := 0
	if namespace == "ui" && len(positional) >= 2 {
		switch positional[1] {
		case "theme", "layout", "panel":
			actionName = positional[1] + "." + positional[2]
			positionalStart = 3
		default:
			actionName = positional[1]
			positionalStart = 2
		}
	} else if len(positional) >= 2 {
		actionName = positional[1]
		positionalStart = 2
	}
	actionName = strings.ReplaceAll(actionName, "-", "_")
	switch actionName {
	case "set_owner":
		actionName = "set-owner"
	case "run_now":
		actionName = "run-now"
	}
	fullName := namespace + "." + actionName
	if _, ok := argsMap["sessionId"]; ok {
		if _, hasID := argsMap["id"]; !hasID {
			argsMap["id"] = argsMap["sessionId"]
		}
	}
	if positionalStart > 0 && positionalStart < len(positional) {
		remaining := positional[positionalStart:]
		argsMap["_positional"] = remaining
		if len(remaining) == 1 {
			switch {
			case namespace == "ui" && actionName == "theme.set":
				argsMap["theme"] = remaining[0]
			case namespace == "ui" && actionName == "layout.set":
				argsMap["layout"] = remaining[0]
			case namespace == "ui" && actionName == "panel.toggle":
				argsMap["panel"] = remaining[0]
			case namespace == "ui" && actionName == "open":
				argsMap["page"] = remaining[0]
			default:
				argsMap["id"] = remaining[0]
			}
		}
	}
	if bodyFile != "" {
		raw, err := os.ReadFile(bodyFile)
		if err != nil {
			return cliError(1, "ACTION_TRANSPORT", "读取 --body 失败: "+err.Error())
		}
		bodyMap := map[string]any{}
		if err := json.Unmarshal(raw, &bodyMap); err != nil {
			return cliError(2, "ACTION_INVALID_ARGS", "body 不是合法 JSON")
		}
		for key, value := range bodyMap {
			argsMap[key] = value
		}
	}
	def, err := cliDescribe(baseURL, fullName)
	if err != nil {
		return cliError(1, "ACTION_TRANSPORT", err.Error())
	}
	if def == nil {
		return cliError(2, "UNKNOWN_ACTION", "未知动作: "+fullName)
	}
	if code := cliValidateArgs(def, argsMap); code != 0 {
		return code
	}
	risk, _ := def["risk"].(string)
	if risk == "" {
		risk = "R0"
	}
	if risk == "R4" || risk == "R5" {
		return cliError(4, "DENIED_R4", "破坏性动作不能由 --yes 跳过")
	}
	if dryRun {
		if jsonOut {
			payload := map[string]any{"ok": true, "data": map[string]any{
				"dryRun": true, "action": fullName, "risk": risk, "args": argsMap,
				"wouldDo": "将执行 " + fullName,
			}}
			raw, _ := json.Marshal(payload)
			_, _ = os.Stdout.Write(raw)
			_, _ = os.Stdout.Write([]byte("\n"))
		} else {
			fmt.Printf("dry-run: %s (risk=%s, args=%v)\n", fullName, risk, argsMap)
		}
		if risk >= "R3" {
			return 3
		}
		return 0
	}
	if risk == "R3" {
		sessionID, _ := argsMap["sessionId"].(string)
		if sessionID == "" {
			sessionID = "main"
		}
		if cliApprovalNever(baseURL, sessionID) {
			return cliError(4, "DENIED_NEVER", "never 策略拒绝该动作")
		}
	}
	_ = yes
	payload, _ := json.Marshal(argsMap)
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(baseURL, "/")+"/api/actions/"+fullName, bytes.NewReader(payload))
	if err != nil {
		return cliError(1, "ACTION_TRANSPORT", err.Error())
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return cliError(1, "ACTION_TRANSPORT", "服务不可达: "+err.Error())
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var envelope map[string]any
	_ = json.Unmarshal(raw, &envelope)
	if jsonOut {
		_, _ = os.Stdout.Write(raw)
		_, _ = os.Stdout.Write([]byte("\n"))
	} else {
		if data, ok := envelope["data"]; ok {
			prettyJSON(data)
		} else {
			prettyJSON(envelope)
		}
	}
	return cliHTTPExit(resp.StatusCode, envelope)
}

func cliActions(baseURL string, args []string, jsonOut bool) int {
	if len(args) == 0 {
		printCLIUsage()
		return 2
	}
	switch args[0] {
	case "list":
		raw, status, err := cliGet(baseURL, "/api/actions")
		if err != nil {
			return cliError(1, "ACTION_TRANSPORT", err.Error())
		}
		if status != 200 {
			return cliError(1, "ACTION_INTERNAL", string(raw))
		}
		_, _ = os.Stdout.Write(raw)
		_, _ = os.Stdout.Write([]byte("\n"))
		return 0
	case "describe":
		if len(args) < 2 {
			return cliUsageError("actions describe 缺少动作名")
		}
		raw, status, err := cliGet(baseURL, "/api/actions/"+args[1])
		if err != nil {
			return cliError(1, "ACTION_TRANSPORT", err.Error())
		}
		if status == 404 {
			return cliError(2, "UNKNOWN_ACTION", "未知动作")
		}
		_, _ = os.Stdout.Write(raw)
		_, _ = os.Stdout.Write([]byte("\n"))
		return 0
	default:
		return cliUsageError("actions 只支持 list/describe")
	}
}

func cliDescribe(baseURL, name string) (map[string]any, error) {
	raw, status, err := cliGet(baseURL, "/api/actions/"+name)
	if err != nil {
		return nil, err
	}
	if status == 404 {
		return nil, nil
	}
	var payload struct {
		Action map[string]any `json:"action"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	return payload.Action, nil
}

func cliGet(baseURL, path string) ([]byte, int, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(strings.TrimRight(baseURL, "/") + path)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return raw, resp.StatusCode, nil
}

func flagArgKey(key string) string {
	switch key {
	case "session":
		return "sessionId"
	case "agent":
		return "agentId"
	case "text":
		return "text"
	case "title":
		return "title"
	case "id":
		return "id"
	case "q":
		return "q"
	case "status":
		return "status"
	case "path":
		return "path"
	case "file":
		return "path"
	case "prompt":
		return "prompt"
	case "name":
		return "name"
	case "theme":
		return "theme"
	}
	return key
}

func cliValidateArgs(def map[string]any, args map[string]any) int {
	params, _ := def["params"].(map[string]any)
	properties := map[string]bool{"sessionId": true, "idempotencyKey": true, "dryRun": true,
		"sandbox_permissions": true, "justification": true, "_positional": true, "id": true,
		"agentId": true, "title": true, "text": true, "q": true, "status": true, "path": true,
		"prompt": true, "name": true, "plan": true, "approval": true, "sandbox": true,
		"mode": true, "policy": true, "theme": true, "layout": true, "panel": true, "page": true,
		"key": true, "value": true, "workflowTokenBudget": true, "approvalTtlMs": true}
	if rawProps, ok := params["properties"].(map[string]any); ok {
		for key := range rawProps {
			properties[key] = true
		}
	}
	for key := range args {
		if key == "_positional" {
			continue
		}
		if !properties[key] {
			return cliError(2, "ACTION_INVALID_ARGS", "未知参数: --"+key)
		}
	}
	if required, ok := params["required"].([]any); ok {
		for _, item := range required {
			key, _ := item.(string)
			if key == "" {
				continue
			}
			value, exists := args[key]
			if !exists || strings.TrimSpace(fmt.Sprint(value)) == "" {
				return cliError(2, "ACTION_INVALID_ARGS", "缺少必填参数: --"+key)
			}
		}
	}
	return 0
}

func cliApprovalNever(baseURL, sessionID string) bool {
	raw, status, err := cliGet(baseURL, "/api/permissions?sessionId="+sessionID)
	if err != nil || status != 200 {
		return false
	}
	var payload struct {
		Permissions struct {
			Approval string `json:"approval"`
		} `json:"permissions"`
	}
	if json.Unmarshal(raw, &payload) != nil {
		return false
	}
	return payload.Permissions.Approval == "never"
}

func cliHTTPExit(status int, envelope map[string]any) int {
	if status >= 200 && status < 300 {
		return 0
	}
	code := ""
	if errObj, ok := envelope["error"].(map[string]any); ok {
		code, _ = errObj["code"].(string)
	}
	switch status {
	case 400, 422:
		return 2
	case 401, 403:
		if code == "PERMISSION_DENIED" {
			return 5
		}
		return 4
	case 404:
		return 2
	case 409:
		if strings.Contains(code, "APPROVAL") {
			return 3
		}
		return 1
	default:
		return 1
	}
}

func cliHasJSON(args []string) bool {
	for _, arg := range args {
		if arg == "--json" {
			return true
		}
	}
	return false
}

func cliUsageError(message string) int {
	return cliError(2, "ACTION_INVALID_ARGS", message)
}

func cliError(exit int, code, message string) int {
	payload := map[string]any{"ok": false, "error": map[string]any{"code": code, "message": message}}
	raw, _ := json.Marshal(payload)
	_, _ = os.Stdout.Write(raw)
	_, _ = os.Stdout.Write([]byte("\n"))
	return exit
}

func prettyJSON(value any) {
	raw, _ := json.MarshalIndent(value, "", "  ")
	_, _ = os.Stdout.Write(raw)
	_, _ = os.Stdout.Write([]byte("\n"))
}

func printCLIUsage() {
	_, _ = os.Stderr.WriteString(`simo CLI（动作层）
  simo <namespace> <action> [--json|--pretty] [--yes] [--dry-run] [flags]
  simo actions list|describe <name>
  simo system health|version|stats|usage
  simo session list|create|rename|pin|owner.set ...
  全局参数: --base-url <url>（默认 http://127.0.0.1:8787；env SIMO_BASE_URL）
            --json/--pretty 互斥；--yes 仅 R0-R2；--dry-run 零副作用
命名空间: session agent chat task workflow schedule memory file permission ui config system
`)
}
