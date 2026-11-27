# 框架已迁至独立仓

墨线框架（MOXIAN）正文自 2026-11-27 起由独立仓维护，主仓 simo 不再保存框架正文。本目录只留这一份指针，条文、模板、角色卡与门禁判据都不在这里。当前版本 `v2.0.0`。

| 项 | 值 |
|---|---|
| 仓库 | [YJM1024/moxian-framework](https://github.com/YJM1024/moxian-framework) |
| 克隆（SSH） | `git clone git@github.com:YJM1024/moxian-framework.git` |
| 克隆（HTTPS） | `git clone https://github.com/YJM1024/moxian-framework.git` |
| 仓内路径 | `docs/framework/`，与本仓迁出前的相对结构一致 |
| 旧版副本 | `docs/framework/archive/v1.7.3/` 与 `docs/framework/archive/v1.7.5/`，只读 |

获取方式是在本仓同级目录克隆，保持默认目录名 `moxian-framework`：

```
git clone git@github.com:YJM1024/moxian-framework.git ../moxian-framework
```

门禁脚本按环境变量 `SIMO_FRAMEWORK_ROOT` 找框架正文，变量指向框架仓根目录，默认取同级目录 `../moxian-framework`。变量未设置且同级目录也不存在时，脚本再找本仓子目录 `moxian-framework/`。脚本读的是 `$SIMO_FRAMEWORK_ROOT/docs/framework/` 下的文件，不在本仓恢复副本。

主仓内与框架有关的改动，例如规则修订、模板调整与门禁判据变更，一律提到独立仓，走独立仓的变更包与门禁；本仓的引用只保留链接与版本号。迁移前的完整副本按只读归档放在删除区 `E:\dsh_home\trash\pending-delete\framework-out-20261127\docs\framework\`，用于追溯，不再随本仓演进。
