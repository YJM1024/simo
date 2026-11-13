import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusDot } from '../src/components/StatusDot';

const meta = {
  title: 'Components/StatusDot',
  component: StatusDot,
  args: { kind: 'ok', label: '已连接', pulse: false },
  argTypes: {
    kind: { control: 'inline-radio', options: ['ok', 'warn', 'danger', 'idle'] },
  },
} satisfies Meta<typeof StatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ok: Story = {};

export const Warn: Story = {
  args: { kind: 'warn', label: '审批等待中' },
};

export const Danger: Story = {
  args: { kind: 'danger', label: '连接中断' },
};

export const IdlePulse: Story = {
  args: { kind: 'idle', label: '排队中', pulse: true },
};
