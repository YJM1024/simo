import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../src/components/Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: '重试任务',
    variant: 'primary',
    size: 'md',
    disabled: false,
    loading: false,
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary', children: '查看详情' },
};

export const GhostSmall: Story = {
  args: { variant: 'ghost', size: 'sm', children: '取消' },
};

export const Disabled: Story = {
  args: { disabled: true, children: '不可用' },
};

export const Loading: Story = {
  args: { loading: true, children: '执行中' },
};
