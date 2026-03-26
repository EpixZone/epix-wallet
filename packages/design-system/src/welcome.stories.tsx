import type { Meta, StoryObj } from "@storybook/react";

const Welcome = () => (
  <div style={{ color: "#fff", fontFamily: "Inter, sans-serif", padding: 40 }}>
    <h1>Keplr Design System</h1>
    <p>Foundation과 Component가 이곳에 추가됩니다.</p>
  </div>
);

const meta: Meta<typeof Welcome> = {
  title: "Welcome",
  component: Welcome,
};

export default meta;
type Story = StoryObj<typeof Welcome>;

export const Default: Story = {};
