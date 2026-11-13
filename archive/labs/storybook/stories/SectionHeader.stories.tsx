import type { Meta, StoryObj } from '@storybook/react-vite';
import { SectionHeader } from '../src/components/SectionHeader';
import { Button } from '../src/components/Button';

const meta = {
  title: 'Components/SectionHeader',
  component: SectionHeader,
  args: {
    title: '本周工作台',
    subtitle: '进度、任务与交付物。',
  },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithActions: Story = {
  render: (args) => (
    <SectionHeader
      {...args}
      actions={
        <>
          <Button variant="secondary" size="sm">导出</Button>
          <Button variant="primary" size="sm">打开任务</Button>
        </>
      }
    />
  ),
};

export const TitleOnly: Story = {
  args: { subtitle: undefined, title: '仅标题' },
};
