# Docker 安装说明（Windows，安装到 E 盘）

> 当前环境（2026-11-08）无法由智能体直接安装：会话非管理员、WSL 未安装、shell 网络被沙箱限制。
> 以下脚本已备好，请**以管理员身份**运行一次。

## 一键安装

1. 开始菜单搜索 PowerShell → 右键 **以管理员身份运行**；
2. 执行：

```powershell
cd E:\dsh_home\workspaces\agent
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\docker-install.ps1
```

脚本会：
- 检查管理员权限，拒绝 C 盘目标；
- 启用 `VirtualMachinePlatform`（WSL2 后端需要）；
- 下载 Docker Desktop 安装包到 `E:\Docker\installer`；
- 静默安装到 `E:\Docker`，WSL 数据目录 `E:\Docker\data`；
- 提示注销/重启。

3. 注销或重启一次，启动 Docker Desktop；
4. 在 Docker Desktop → Settings → Resources → Advanced，确认 **Disk image location = `E:\Docker\data`**（若仍为 C 盘，手动改到该目录）；
5. 验证：

```powershell
docker version
docker run --rm hello-world
```

## 只装 Docker 不动 C 盘的原因

Docker Desktop 默认把镜像/容器写进 `C:\Users\<user>\AppData\Local\Docker\wsl`，C 盘会迅速占满。
本脚本通过 `--installation-dir` / `--wsl-default-data-root` 把程序与数据都放到 E 盘。

## 如果脚本失败

| 现象 | 处理 |
|---|---|
| 提示需要管理员 | 用管理员 PowerShell 重开 |
| `wsl --install` 失败 | Windows 版本需 ≥ 10 2004 / 11；先 `wsl --update` |
| 安装器退出码非 0 | 查看 `E:\Docker\installer` 下的日志；或手动运行安装器选 E 盘 |
| 虚拟化未开启 | BIOS 开启 VT-x/AMD-V，任务管理器→性能→虚拟化：已启用 |
| 数据仍在 C 盘 | Docker Desktop → Settings → Resources → Advanced 改 Disk image location |

## 容器运行（安装完成后）

```powershell
# 构建
deploy\docker-build.ps1
# 或
docker compose -f deploy\compose.yaml up -d --build
```

数据卷建议指向 E 盘，例如 compose 里：

```yaml
volumes:
  simo-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: E:/dsh_home/workspaces/agent/.docker-data
```
