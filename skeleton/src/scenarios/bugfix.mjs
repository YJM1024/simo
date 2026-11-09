/**
 * 本文件对应决策 D-10：场景包（可插拔场景）。
 *
 * 决策内容：
 *  - 一个场景 = {id, version, admissionRules, evidenceContract, workerPolicy, prompts}；
 *  - 内核不硬编码任何业务语义：换场景只换这个文件（或复制一份新场景包），
 *    准入规则 / 验收证据契约 / slot 上限 / 提示词全部由场景提供；
 *  - bugfix 是第一个参考场景：bug 反馈 -> 修复 -> 四类结构化证据 -> 人工评审。
 *
 * 它保证的不变量：
 *  - 场景包是纯数据（+ prompts 字符串），不 import 内核模块，不产生副作用；
 *  - evidenceContract.requirements 与验收门 D-09 的字段一一对应，不存在"场景说四项、
 *    验收门只查三项"的漂移（同一份对象同时喂给两者）。
 */

export const BUGFIX_EVIDENCE_CONTRACT = Object.freeze({
  id: 'bugfix/evidence/v1',
  description: 'bugfix 场景的四项结构化验收证据：缺任何一项都不能进入人工评审',
  requirements: Object.freeze([
    Object.freeze({ field: 'reproTest', label: '复现测试', kind: 'text', description: '能稳定复现问题的测试文件/用例路径' }),
    Object.freeze({ field: 'testPass', label: '回归测试通过', kind: 'boolean', description: '修复后相关测试全绿（必须为 true）' }),
    Object.freeze({ field: 'diffScope', label: '改动范围', kind: 'text', description: '改了哪些文件/模块，是否超出 bug 范围' }),
    Object.freeze({ field: 'rollback', label: '回滚方案', kind: 'text', description: '出问题时如何回滚' }),
  ]),
});

export const bugfixScenario = Object.freeze({
  id: 'bugfix',
  version: 'scenario/bugfix@1',
  admissionRules: Object.freeze({
    sourceWhitelist: Object.freeze(['slack', 'github']),
    denyBots: true,
    explicitKeywords: Object.freeze([
      '修一下',
      '帮我修',
      '帮忙修',
      '请修复',
      '修复一下',
      '看一下这个 bug',
      'fix',
      'fix it',
      'please fix',
    ]),
    issueSignals: Object.freeze([
      'bug',
      '报错',
      '错误',
      '异常',
      '崩溃',
      '失败',
      '500',
      '502',
      'crash',
      'error',
      '不工作',
      '没反应',
      '复现',
    ]),
    agentMentions: Object.freeze(['@agent', '@superagent', '@内核助手']),
  }),
  evidenceContract: BUGFIX_EVIDENCE_CONTRACT,
  workerPolicy: Object.freeze({
    maxWorkers: 2,
    humanSlots: 1,
    maxRounds: 2,
  }),
  prompts: Object.freeze({
    assessor:
      '你是需求评估器。判断这条消息是否是一个可执行的修复需求：accept=true 时给出简短 title；' +
      '不要臆造信息，不确定时给出 reason 并 accept=false。',
    worker:
      '你是修复工程师。执行一次修复 turn，并提交结构化 evidence：reproTest（复现测试）、' +
      'testPass（回归是否全绿）、diffScope（改动范围）、rollback（回滚方案）。' +
      '证据不全时不要声称完成；report.state 只能是 progress|waiting|ready|blocked|failed|dropped。',
    reviewer:
      '你是代码评审。只根据结构化 evidence 判断是否可以进入人工评审；approve=true/false + notes。',
  }),
});

export default bugfixScenario;
