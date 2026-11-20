import { startStack } from './stack'

/** 启动隔离后端（内嵌前端，mock 模型，临时 home），失败即终止整个测试运行。 */
export default async function globalSetup(): Promise<void> {
  await startStack()
}