package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/coder/websocket"
)

// 契约 §3.2：单帧 JSON 上限 1 MiB；超限库会关闭连接。
const MaxWSMessageBytes int64 = 1 << 20

// WebSocket close codes（RFC 6455）。
const (
	CloseNormal        = 1000
	CloseGoingAway     = 1001
	CloseMessageTooBig = 1009
)

// WSConn 是平台对 coder/websocket 的薄封装，模块不直接依赖第三方库。
type WSConn struct {
	conn *websocket.Conn
}

// AcceptWS 升级 HTTP 为 WebSocket，并设置 1MiB 读上限。
func AcceptWS(w http.ResponseWriter, r *http.Request) (*WSConn, error) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{})
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(MaxWSMessageBytes)
	return &WSConn{conn: conn}, nil
}

// Read 读取一个文本帧；二进制帧视为协议错误。
func (c *WSConn) Read(ctx context.Context) ([]byte, error) {
	typ, data, err := c.conn.Read(ctx)
	if err != nil {
		return nil, err
	}
	if typ != websocket.MessageText {
		return nil, fmt.Errorf("只接受文本帧，收到 %v", typ)
	}
	return data, nil
}

// WriteJSON 以文本帧发送 JSON。
func (c *WSConn) WriteJSON(ctx context.Context, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("序列化 WS 帧失败: %w", err)
	}
	return c.conn.Write(ctx, websocket.MessageText, data)
}

// Ping 发送 WebSocket control ping（30s 心跳）。
func (c *WSConn) Ping(ctx context.Context) error { return c.conn.Ping(ctx) }

// Close 关闭连接。
func (c *WSConn) Close(code int, reason string) error {
	return c.conn.Close(websocket.StatusCode(code), reason)
}
