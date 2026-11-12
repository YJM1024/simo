package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	coreagent "simo/internal/core/agent"
	coresession "simo/internal/core/session"
	"simo/internal/platform/httpserver"
)

func (m *Module) registerTeamHTTP(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sessions/{id}/team", m.handleSessionTeam)
	mux.HandleFunc("GET /api/teams/{id}", m.handleTeamGet)
	mux.HandleFunc("GET /api/teams/{id}/members", m.handleTeamMembers)
	mux.HandleFunc("GET /api/teams/{id}/messages", m.handleTeamMessages)
	mux.HandleFunc("GET /api/teams/{id}/deliverables", m.handleTeamDeliverables)
	mux.HandleFunc("GET /api/teams/{id}/triggers", m.handleTeamTriggers)
}

func (m *Module) teamForSession(ctx context.Context, sessionID string) (map[string]any, []map[string]any, error) {
	var teamID, name, lead string
	var statusValue string
	var createdAt, updatedAt int64
	err := m.store.QueryRow(ctx, `SELECT id,name,lead_session_id,status,created_at,updated_at FROM teams
		WHERE lead_session_id=? OR id IN (SELECT team_id FROM team_members WHERE session_id=?) LIMIT 1`,
		sessionID, sessionID).Scan(&teamID, &name, &lead, &statusValue, &createdAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, []map[string]any{}, nil
	}
	if err != nil {
		return nil, nil, err
	}
	members := m.teamMembers(ctx, teamID)
	return map[string]any{"id": teamID, "name": name, "leadSessionId": lead,
		"status": statusValue, "createdAt": createdAt, "updatedAt": updatedAt}, members, nil
}

func (m *Module) teamMembers(ctx context.Context, teamID string) []map[string]any {
	rows, err := m.store.Query(ctx, `SELECT m.id,m.session_id,m.role_key,m.role_type,m.agent_id,m.status,m.created_at,
		COALESCE(s.title,'') FROM team_members m LEFT JOIN sessions s ON s.id=m.session_id
		WHERE m.team_id=? ORDER BY m.created_at ASC`, teamID)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	out := make([]map[string]any, 0, 8)
	for rows.Next() {
		var id, sessionID, roleKey, roleType, agentID, statusValue, title string
		var createdAt int64
		if rows.Scan(&id, &sessionID, &roleKey, &roleType, &agentID, &statusValue, &createdAt, &title) == nil {
			name := title
			if strings.TrimSpace(name) == "" {
				if agent, ok := coreagent.Find(strings.TrimPrefix(agentID, "agent:")); ok {
					name = agent.Name
				}
			}
			out = append(out, map[string]any{"id": id, "sessionId": sessionID, "roleKey": roleKey,
				"roleType": roleType, "agentId": agentID, "name": name, "status": statusValue,
				"createdAt": createdAt})
		}
	}
	return out
}

func (m *Module) handleSessionTeam(w http.ResponseWriter, r *http.Request) {
	team, members, err := m.teamForSession(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取团队失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "team": team, "members": members})
}

func (m *Module) handleTeamGet(w http.ResponseWriter, r *http.Request) {
	teamID := strings.TrimSpace(r.PathValue("id"))
	var name, lead, statusValue string
	var templateID string
	var templateVersion int64
	var createdAt, updatedAt int64
	if err := m.store.QueryRow(r.Context(), `SELECT name,lead_session_id,status,created_at,updated_at,template_id,template_version
		FROM teams WHERE id=?`, teamID).
		Scan(&name, &lead, &statusValue, &createdAt, &updatedAt, &templateID, &templateVersion); err != nil {
		httpserver.WriteErrorCode(w, http.StatusNotFound, "team_not_found", "团队不存在")
		return
	}
	members := m.teamMembers(r.Context(), teamID)
	var template any
	if templateID != "" {
		template, _ = m.templateView(r.Context(), templateID)
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "team": map[string]any{
		"id": teamID, "name": name, "leadSessionId": lead, "status": statusValue,
		"templateId": templateID, "templateVersion": templateVersion,
		"createdAt": createdAt, "updatedAt": updatedAt}, "template": template, "members": members,
		"deliverables": m.teamDeliverables(r.Context(), teamID),
		"triggers":     m.teamTriggers(r.Context(), teamID)})
}

func (m *Module) handleTeamMembers(w http.ResponseWriter, r *http.Request) {
	teamID := strings.TrimSpace(r.PathValue("id"))
	members := m.teamMembers(r.Context(), teamID)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "members": members, "total": len(members)})
}

func (m *Module) handleTeamMessages(w http.ResponseWriter, r *http.Request) {
	teamID := strings.TrimSpace(r.PathValue("id"))
	rows, err := m.store.Query(r.Context(), `SELECT id,team_id,from_session_id,to_session_id,kind,
		payload_json,status,correlation_id,created_at,delivered_at FROM team_messages
		WHERE team_id=? ORDER BY created_at ASC LIMIT 200`, teamID)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取内部消息失败")
		return
	}
	defer rows.Close()
	out := make([]map[string]any, 0, 16)
	for rows.Next() {
		var id, tid, from, to, kind, payload, statusValue, correlation string
		var createdAt, deliveredAt int64
		if rows.Scan(&id, &tid, &from, &to, &kind, &payload, &statusValue, &correlation, &createdAt, &deliveredAt) == nil {
			out = append(out, map[string]any{"id": id, "teamId": tid, "fromSessionId": from,
				"toSessionId": to, "kind": kind, "payload": json.RawMessage(payload),
				"status": statusValue, "correlationId": correlation, "createdAt": createdAt,
				"deliveredAt": deliveredAt})
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "messages": out, "total": len(out)})
}

func (m *Module) createTeam(ctx context.Context, leadSessionID, name string, members []map[string]any) (map[string]any, []map[string]any, error) {
	leadSessionID = strings.TrimSpace(leadSessionID)
	if leadSessionID == "" {
		leadSessionID = defaultSessionID
	}
	if strings.TrimSpace(name) == "" {
		name = "团队"
	}
	now := time.Now().UnixMilli()
	teamID := newID("team")
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO teams(id,name,lead_session_id,status,created_at,updated_at)
			VALUES (?,?,?, 'active', ?, ?)`, teamID, name, leadSessionID, now, now)
		return err
	}); err != nil {
		return nil, nil, err
	}
	for _, member := range members {
		memberName := firstNonEmptyString(stringArg(member, "name"), stringArg(member, "title"), "成员")
		roleKey := firstNonEmptyString(stringArg(member, "roleKey"), stringArg(member, "role"), "member")
		agentID := firstNonEmptyString(stringArg(member, "agentId"), coreagent.DefaultID)
		child, err := m.sessions.Create(ctx, leadSessionID, memberName)
		if err != nil {
			continue
		}
		if admin, ok := m.sessions.(sessionActionAdmin); ok {
			_, _ = admin.SetOwner(ctx, child.ID, strings.TrimPrefix(agentID, "agent:"))
		}
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `INSERT INTO team_members(id,team_id,session_id,role_key,role_type,agent_id,status,created_at)
				VALUES (?,?,?,?, 'generic', ?, 'active', ?)`,
				newID("member"), teamID, child.ID, roleKey, "agent:"+strings.TrimPrefix(agentID, "agent:"), now)
			return err
		})
		m.emitInternal(ctx, "team.member.added", map[string]any{"teamId": teamID, "sessionId": child.ID, "agentId": agentID})
	}
	m.emitInternal(ctx, "team.created", map[string]any{"teamId": teamID, "leadSessionId": leadSessionID, "sessionId": leadSessionID})
	return map[string]any{"id": teamID, "name": name, "leadSessionId": leadSessionID, "status": "active", "createdAt": now, "updatedAt": now},
		m.teamMembers(ctx, teamID), nil
}

func (m *Module) sendTeamMessage(ctx context.Context, teamID, fromSessionID, toSessionID, content, idempotencyKey string) (map[string]any, error) {
	teamID = strings.TrimSpace(teamID)
	fromSessionID = strings.TrimSpace(fromSessionID)
	toSessionID = strings.TrimSpace(toSessionID)
	content = strings.TrimSpace(content)
	if teamID == "" || fromSessionID == "" || toSessionID == "" || content == "" {
		return nil, fmt.Errorf("teamId/from/to/content 不能为空")
	}
	var memberCount int
	_ = m.store.QueryRow(ctx, `SELECT COUNT(DISTINCT session_id) FROM team_members
		WHERE team_id=? AND session_id IN (?,?)`, teamID, fromSessionID, toSessionID).Scan(&memberCount)
	if memberCount < 2 {
		return nil, fmt.Errorf("内部消息仅允许团队成员之间发送")
	}
	if idempotencyKey == "" {
		idempotencyKey = "teammsg:" + teamID + ":" + fromSessionID + ":" + toSessionID + ":" + contentHashString(content)
	}
	now := time.Now().UnixMilli()
	messageID := newID("tmsg")
	payload, _ := json.Marshal(map[string]any{"content": content})
	inserted := false
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO team_messages(
			id,team_id,from_session_id,to_session_id,kind,payload_json,status,correlation_id,idempotency_key,created_at,delivered_at)
			VALUES (?,?,?,?, 'direct', ?, 'delivered', ?, ?, ?, ?)`,
			messageID, teamID, fromSessionID, toSessionID, string(payload), messageID, idempotencyKey, now, now)
		if err != nil {
			return err
		}
		affected, _ := result.RowsAffected()
		inserted = affected > 0
		return nil
	}); err != nil {
		return nil, err
	}
	var delivered int
	_ = m.store.QueryRow(ctx, `SELECT COUNT(*) FROM team_messages WHERE idempotency_key=?`, idempotencyKey).Scan(&delivered)
	if delivered == 0 {
		return nil, fmt.Errorf("发送内部消息失败")
	}
	// 幂等重放不再广播一次 delivered；内部消息不进用户主窗口。
	if inserted {
		m.emitInternal(ctx, "team.message.delivered", map[string]any{
			"teamId": teamID, "messageId": messageID, "fromSessionId": fromSessionID,
			"toSessionId": toSessionID, "sessionId": toSessionID,
		})
	}
	return map[string]any{"id": messageID, "teamId": teamID, "fromSessionId": fromSessionID,
		"toSessionId": toSessionID, "content": content, "status": "delivered", "createdAt": now}, nil
}

func contentHashString(text string) string {
	// 稳定短键即可；避免依赖 chat 外部的 hash 工具。
	var h uint64 = 1469598103934665603
	for _, b := range []byte(text) {
		h ^= uint64(b)
		h *= 1099511628211
	}
	return fmt.Sprintf("%x", h)
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func (m *Module) createMockTeam(ctx context.Context, leadSessionID string) string {
	team, members, err := m.createTeam(ctx, leadSessionID, "演示团队", []map[string]any{
		{"name": "研究员", "role": "researcher", "agentId": "researcher"},
		{"name": "工程师", "role": "builder", "agentId": "builder"},
	})
	if err != nil || len(members) < 2 {
		return "团队创建失败，请稍后重试。"
	}
	teamID, _ := team["id"].(string)
	fromSession, _ := members[0]["sessionId"].(string)
	toSession, _ := members[1]["sessionId"].(string)
	_, _ = m.sendTeamMessage(ctx, teamID, fromSession, toSession, "请确认交付物标准。", "")
	return "已创建演示团队并路由内部消息；成员可各自查看会话，主窗口只保留团队摘要。"
}

func (m *Module) upsertTeamTemplate(ctx context.Context, args map[string]any) (map[string]any, error) {
	name := firstNonEmptyString(stringArg(args, "name"), "团队模板")
	templateID := stringArg(args, "templateId")
	now := time.Now().UnixMilli()
	if templateID == "" {
		templateID = newID("team-tpl")
	}
	version := 1
	var existingVersion int
	if err := m.store.QueryRow(ctx, `SELECT version FROM team_templates WHERE id=?`, templateID).Scan(&existingVersion); err == nil {
		version = existingVersion + 1
	}
	inherits := stringArg(args, "inheritsFrom")
	if inherits != "" {
		var depth int
		_ = m.store.QueryRow(ctx, `SELECT COUNT(*) FROM team_templates WHERE id=?`, inherits).Scan(&depth)
		if depth == 0 {
			return nil, fmt.Errorf("父模板不存在")
		}
		if inherits == templateID {
			return nil, fmt.Errorf("模板继承环")
		}
	}
	roles := anyMapList(args["roles"])
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO team_templates(id,name,version,inherits_from,base_persona,status,created_at,updated_at)
			VALUES (?,?,?,?, 'simo','active',?,?)
			ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=excluded.version,inherits_from=excluded.inherits_from,updated_at=excluded.updated_at`,
			templateID, name, version, inherits, now, now)
		if err != nil {
			return err
		}
		_, _ = tx.ExecContext(ctx, `DELETE FROM team_template_roles WHERE template_id=?`, templateID)
		for index, role := range roles {
			roleKey := firstNonEmptyString(stringArg(role, "roleKey"), stringArg(role, "role"), fmt.Sprintf("role%d", index+1))
			roleType := firstNonEmptyString(stringArg(role, "roleType"), "generic")
			title := firstNonEmptyString(stringArg(role, "title"), stringArg(role, "name"), roleKey)
			agentID := firstNonEmptyString(stringArg(role, "agentId"), "")
			tools, _ := json.Marshal(role["tools"])
			inputs, _ := json.Marshal(role["inputs"])
			outputs, _ := json.Marshal(role["outputs"])
			if _, err := tx.ExecContext(ctx, `INSERT INTO team_template_roles(id,template_id,role_key,title,role_type,agent_id,
				persona_override,tools_json,model,responsibilities,inputs_json,outputs_json,inherits_from,order_index)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				newID("tplrole"), templateID, roleKey, title, roleType, agentID,
				stringArg(role, "personaOverride"), string(tools), stringArg(role, "model"),
				stringArg(role, "responsibilities"), string(inputs), string(outputs), stringArg(role, "inheritsFrom"), index); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	m.emitInternal(ctx, "team.template.applied", map[string]any{"templateId": templateID, "version": version,
		"sessionId": stringArg(args, "sessionId")})
	return m.templateView(ctx, templateID)
}

func (m *Module) templateView(ctx context.Context, templateID string) (map[string]any, error) {
	return m.templateViewDepth(ctx, templateID, 0)
}

func (m *Module) templateViewDepth(ctx context.Context, templateID string, depth int) (map[string]any, error) {
	if depth > 3 {
		return nil, fmt.Errorf("模板继承超过 3 层")
	}
	var id, name, inherits, basePersona, statusValue string
	var version int
	var createdAt, updatedAt int64
	if err := m.store.QueryRow(ctx, `SELECT id,name,version,inherits_from,base_persona,status,created_at,updated_at
		FROM team_templates WHERE id=?`, templateID).Scan(&id, &name, &version, &inherits, &basePersona, &statusValue, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	rows, err := m.store.Query(ctx, `SELECT role_key,title,role_type,agent_id,persona_override,tools_json,model,
		responsibilities,inputs_json,outputs_json,inherits_from,order_index FROM team_template_roles
		WHERE template_id=? ORDER BY order_index ASC`, templateID)
	roles := make([]map[string]any, 0, 8)
	if err == nil {
		for rows.Next() {
			var roleKey, title, roleType, agentID, persona, tools, model, responsibilities, inputs, outputs, inheritsRole string
			var orderIndex int
			if rows.Scan(&roleKey, &title, &roleType, &agentID, &persona, &tools, &model,
				&responsibilities, &inputs, &outputs, &inheritsRole, &orderIndex) == nil {
				roles = append(roles, map[string]any{"roleKey": roleKey, "title": title, "roleType": roleType,
					"agentId": agentID, "personaOverride": persona, "tools": json.RawMessage(tools), "model": model,
					"responsibilities": responsibilities, "inputs": json.RawMessage(inputs),
					"outputs": json.RawMessage(outputs), "inheritsFrom": inheritsRole, "orderIndex": orderIndex})
			}
		}
		_ = rows.Close()
	}
	return map[string]any{"id": id, "name": name, "version": version, "inheritsFrom": inherits,
		"basePersona": basePersona, "status": statusValue, "createdAt": createdAt,
		"updatedAt": updatedAt, "roles": m.mergedTemplateRoles(ctx, inherits, roles, depth)}, nil
}

func (m *Module) mergedTemplateRoles(ctx context.Context, inherits string, own []map[string]any, depth int) []map[string]any {
	ownKeys := map[string]bool{}
	for _, role := range own {
		ownKeys[stringArg(role, "roleKey")] = true
	}
	merged := append([]map[string]any{}, own...)
	if strings.TrimSpace(inherits) == "" {
		return merged
	}
	parent, err := m.templateViewDepth(ctx, inherits, depth+1)
	if err != nil {
		return merged
	}
	if parentRoles, ok := parent["roles"].([]map[string]any); ok {
		for _, role := range parentRoles {
			if ownKeys[stringArg(role, "roleKey")] {
				continue
			}
			role["inheritedFrom"] = inherits
			merged = append(merged, role)
		}
	}
	return merged
}

func (m *Module) createTeamFromTemplate(ctx context.Context, leadSessionID, templateID string) (map[string]any, []map[string]any, error) {
	template, err := m.templateView(ctx, templateID)
	if err != nil {
		return nil, nil, err
	}
	roles, _ := template["roles"].([]map[string]any)
	team, _, err := m.createTeam(ctx, leadSessionID, stringArg(template, "name"), nil)
	if err != nil {
		return nil, nil, err
	}
	teamID, _ := team["id"].(string)
	now := time.Now().UnixMilli()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE teams SET template_id=?, template_version=? WHERE id=?`,
			templateID, intArg(template, "version", 1), teamID)
		return err
	}); err != nil {
		return nil, nil, err
	}
	for _, role := range roles {
		roleKey := stringArg(role, "roleKey")
		title := firstNonEmptyString(stringArg(role, "title"), roleKey)
		roleType := firstNonEmptyString(stringArg(role, "roleType"), "generic")
		agentID := stringArg(role, "agentId")
		if agentID == "" {
			agentID = roleKey
		}
		if roleType == "template" {
			agentID = "agent:" + roleKey + "-" + strings.TrimPrefix(teamID, "team-")
		} else if !strings.HasPrefix(agentID, "agent:") {
			agentID = "agent:" + agentID
		}
		child, err := m.sessions.Create(ctx, leadSessionID, title)
		if err != nil {
			continue
		}
		if admin, ok := m.sessions.(sessionActionAdmin); ok {
			_, _ = admin.SetOwner(ctx, child.ID, strings.TrimPrefix(agentID, "agent:"))
		}
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			memberID := newID("member")
			if _, err := tx.ExecContext(ctx, `INSERT INTO team_members(id,team_id,session_id,role_key,role_type,agent_id,status,created_at)
				VALUES (?,?,?,?,?,?, 'active', ?)`, memberID, teamID, child.ID, roleKey, roleType, agentID, now); err != nil {
				return err
			}
			_, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO team_member_roles(team_id,member_id,template_id,role_key,persona_version)
				VALUES (?,?,?,?, 'v1')`, teamID, memberID, templateID, roleKey)
			return err
		})
		m.emitInternal(ctx, "team.member.added", map[string]any{"teamId": teamID, "sessionId": child.ID,
			"agentId": agentID, "roleType": roleType})
	}
	return team, m.teamMembers(ctx, teamID), nil
}

func (m *Module) setTeamOwner(ctx context.Context, teamID, sessionID, agentID string) error {
	agentID = strings.TrimPrefix(strings.TrimSpace(agentID), "agent:")
	var memberSession string
	if err := m.store.QueryRow(ctx, `SELECT session_id FROM team_members WHERE team_id=? AND session_id=?`,
		teamID, sessionID).Scan(&memberSession); err != nil {
		return fmt.Errorf("成员不存在")
	}
	if admin, ok := m.sessions.(sessionActionAdmin); ok {
		if _, err := admin.SetOwner(ctx, memberSession, agentID); err != nil {
			return err
		}
	}
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE team_members SET agent_id=? WHERE team_id=? AND session_id=?`,
			"agent:"+agentID, teamID, sessionID)
		return err
	})
	m.emitInternal(ctx, "team.owner.changed", map[string]any{"teamId": teamID, "sessionId": sessionID, "agentId": "agent:" + agentID})
	return nil
}

func (m *Module) createTeamTrigger(ctx context.Context, teamID, fromMember, toMember, content, idempotencyKey string) (map[string]any, error) {
	now := time.Now().UnixMilli()
	triggerID := newID("trigger")
	if idempotencyKey == "" {
		idempotencyKey = "trigger:" + teamID + ":" + fromMember + ":" + toMember + ":" + contentHashString(content)
	}
	action, _ := json.Marshal(map[string]any{"content": content})
	err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO team_triggers(id,team_id,from_member_id,to_member_id,on_event,
			condition_json,action_json,status,retry_count,max_retries,idempotency_key,created_at,updated_at)
			VALUES (?,?,?,?, 'deliverable_ready','{}',?,'active',0,2,?,?,?)`,
			triggerID, teamID, fromMember, toMember, string(action), idempotencyKey, now, now)
		return err
	})
	if err != nil {
		return nil, err
	}
	var actualID string
	_ = m.store.QueryRow(ctx, `SELECT id FROM team_triggers WHERE idempotency_key=?`, idempotencyKey).Scan(&actualID)
	return map[string]any{"id": actualID, "teamId": teamID, "fromMemberId": fromMember,
		"toMemberId": toMember, "status": "active", "maxRetries": 2}, nil
}

func (m *Module) fireTeamTrigger(ctx context.Context, triggerID, artifactID, summary string) (map[string]any, error) {
	var teamID, fromMember, toMember, actionJSON, statusValue string
	var retryCount, maxRetries int
	if err := m.store.QueryRow(ctx, `SELECT team_id,from_member_id,to_member_id,action_json,status,retry_count,max_retries
		FROM team_triggers WHERE id=?`, triggerID).Scan(&teamID, &fromMember, &toMember, &actionJSON, &statusValue, &retryCount, &maxRetries); err != nil {
		return nil, fmt.Errorf("触发器不存在")
	}
	if statusValue == "fired" {
		return map[string]any{"id": triggerID, "status": "fired", "idempotent": true}, nil
	}
	if retryCount >= maxRetries {
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `UPDATE team_triggers SET status='failed', updated_at=? WHERE id=?`, time.Now().UnixMilli(), triggerID)
			return err
		})
		return nil, fmt.Errorf("触发器重试已达上限")
	}
	var toSession string
	_ = m.store.QueryRow(ctx, `SELECT session_id FROM team_members WHERE id=? OR session_id=? LIMIT 1`, toMember, toMember).Scan(&toSession)
	now := time.Now().UnixMilli()
	deliverableID := newID("deliv")
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO team_deliverables(id,team_id,from_member_id,to_member_id,kind,
			artifact_id,ref_path,summary,status,created_at) VALUES (?,?,?,?, 'artifact', ?, '', ?, 'ready', ?)`,
			deliverableID, teamID, fromMember, toMember, artifactID, summary, now)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE team_triggers SET status='fired',retry_count=retry_count+1,updated_at=? WHERE id=?`, now, triggerID)
		return err
	}); err != nil {
		return nil, err
	}
	started := false
	startErr := ""
	if toSession != "" {
		if _, err := m.startTurnInternal(ctx, toSession, "团队触发："+firstNonEmptyString(summary, "上游交付物已就绪"), ClassRefine, nil, ""); err != nil {
			startErr = err.Error()
		} else {
			started = true
		}
	}
	m.emitInternal(ctx, "team.deliverable.ready", map[string]any{
		"teamId": teamID, "deliverableId": deliverableID, "artifactId": artifactID,
		"fromMemberId": fromMember, "toMemberId": toMember, "sessionId": toSession,
	})
	m.emitInternal(ctx, "team.trigger.fired", map[string]any{
		"triggerId": triggerID, "teamId": teamID, "deliverableId": deliverableID,
		"fromMemberId": fromMember, "toMemberId": toMember, "toSessionId": toSession,
		"sessionId": toSession, "started": started, "startError": startErr,
	})
	if !started && startErr != "" {
		m.emitInternal(ctx, "team.trigger.failed", map[string]any{
			"triggerId": triggerID, "teamId": teamID, "toSessionId": toSession,
			"sessionId": toSession, "reason": startErr,
		})
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `UPDATE team_triggers SET status='failed',updated_at=? WHERE id=?`, time.Now().UnixMilli(), triggerID)
			return err
		})
	}
	return map[string]any{"id": triggerID, "status": "fired", "deliverableId": deliverableID,
		"started": started, "idempotent": false}, nil
}

func (m *Module) handleTeamDeliverables(w http.ResponseWriter, r *http.Request) {
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true,
		"deliverables": m.teamDeliverables(r.Context(), strings.TrimSpace(r.PathValue("id")))})
}

func (m *Module) handleTeamTriggers(w http.ResponseWriter, r *http.Request) {
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true,
		"triggers": m.teamTriggers(r.Context(), strings.TrimSpace(r.PathValue("id")))})
}

func (m *Module) teamDeliverables(ctx context.Context, teamID string) []map[string]any {
	out := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(ctx, `SELECT id,from_member_id,to_member_id,kind,artifact_id,ref_path,summary,status,created_at
		FROM team_deliverables WHERE team_id=? ORDER BY created_at DESC LIMIT 100`, teamID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, from, to, kind, artifactID, refPath, summary, statusValue string
		var createdAt int64
		if rows.Scan(&id, &from, &to, &kind, &artifactID, &refPath, &summary, &statusValue, &createdAt) == nil {
			out = append(out, map[string]any{"id": id, "fromMemberId": from, "toMemberId": to,
				"kind": kind, "artifactId": artifactID, "refPath": refPath, "summary": summary,
				"status": statusValue, "createdAt": createdAt})
		}
	}
	return out
}

func (m *Module) teamTriggers(ctx context.Context, teamID string) []map[string]any {
	out := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(ctx, `SELECT id,from_member_id,to_member_id,on_event,status,retry_count,max_retries,idempotency_key,created_at
		FROM team_triggers WHERE team_id=? ORDER BY created_at DESC LIMIT 100`, teamID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, from, to, onEvent, statusValue, idempotencyKey string
		var retryCount, maxRetries int
		var createdAt int64
		if rows.Scan(&id, &from, &to, &onEvent, &statusValue, &retryCount, &maxRetries, &idempotencyKey, &createdAt) == nil {
			out = append(out, map[string]any{"id": id, "fromMemberId": from, "toMemberId": to,
				"onEvent": onEvent, "status": statusValue, "retryCount": retryCount,
				"maxRetries": maxRetries, "idempotencyKey": idempotencyKey, "createdAt": createdAt})
		}
	}
	return out
}

var _ coresession.Session
