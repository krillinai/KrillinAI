import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CreatorDashboard,
  getCreatorSkillPromptHint,
  type CreatorSkill
} from './CreatorDashboard.js';

describe('CreatorDashboard', () => {
  it('renders visual Skills without creator capability blocks', () => {
    const { container } = render(<CreatorDashboard onSelectSkill={vi.fn()} />);

    expect(screen.queryByRole('heading', { name: '点击进入对应 Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^视频翻译/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^动画生成/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^数字人/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: '创作模板分类' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')[0]).toHaveTextContent('推荐');
    expect(screen.getByRole('tab', { name: '推荐' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: '最近' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '创作模板' })).toBeInTheDocument();
    expect(container.querySelector('.creator-dashboard')).toHaveAttribute('data-template-count', '4');
    expect(screen.getAllByRole('button', { name: /使用.+模板/ })).toHaveLength(4);
    const recommendedSkills = screen.getAllByRole('button', { name: /使用.+模板/ });
    expect(recommendedSkills[1]).toHaveAccessibleName('使用视频下载模板');
    expect(recommendedSkills[1]?.querySelector('img'))
      .toHaveAttribute('src', '/dashboard/templates/video-download-cover.png');
    expect(recommendedSkills[2]).toHaveAccessibleName('使用封面生成模板');
    expect(recommendedSkills[2]?.querySelector('img'))
      .toHaveAttribute('src', '/dashboard/templates/peter-openclaw-cover.png');
    expect(recommendedSkills[3]).toHaveAccessibleName('使用图像生成模板');
    expect(recommendedSkills[3]?.querySelector('img'))
      .toHaveAttribute('src', '/dashboard/templates/image-generation-cover.png');
    expect(screen.queryByRole('button', { name: '使用火柴人动画模板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用数字人口播模板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用智能剪辑模板' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用多语言视频翻译模板' }))
      .toHaveAttribute('data-skill-id', 'video-translation-multilingual');
  });

  it('selects a Skill and exposes its prompt hint', () => {
    const onSelectSkill = vi.fn();
    render(<CreatorDashboard onSelectSkill={onSelectSkill} />);

    fireEvent.click(screen.getByRole('button', { name: '使用图像生成模板' }));
    expect(onSelectSkill).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'image-generation',
      title: '图像生成'
    }));
    const selectedSkill = onSelectSkill.mock.lastCall?.[0] as CreatorSkill;
    expect(getCreatorSkillPromptHint(selectedSkill, 'zh-CN'))
      .toBe('描述画面主体、风格、构图和使用场景');
    expect(screen.queryByRole('tab', { name: '最近' })).not.toBeInTheDocument();
  });

  it('exposes a structured interaction and an inactive prompt hint', () => {
    const onSelectSkill = vi.fn();
    render(<CreatorDashboard onSelectSkill={onSelectSkill} />);

    fireEvent.click(screen.getByRole('button', { name: '使用多语言视频翻译模板' }));

    expect(onSelectSkill).toHaveBeenCalledWith(expect.objectContaining({
      interaction: { type: 'workspace', workspace: 'video-translation' },
      promptHint: {
        zhCN: '上传视频，或者输入有效的视频链接',
        enUS: 'Upload a video or enter a valid video link'
      }
    }));
  });

  it('opens the retained workspaces from the recommended Skills', () => {
    const onSelectSkill = vi.fn();
    render(<CreatorDashboard onSelectSkill={onSelectSkill} />);

    fireEvent.click(screen.getByRole('button', { name: '使用视频下载模板' }));
    expect(onSelectSkill).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'video-download',
      interaction: { type: 'workspace', workspace: 'video-download' }
    }));

    fireEvent.click(screen.getByRole('button', { name: '使用封面生成模板' }));
    expect(onSelectSkill).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'cover-generation',
      interaction: { type: 'workspace', workspace: 'cover-generator' }
    }));

    fireEvent.click(screen.getByRole('button', { name: '使用图像生成模板' }));
    expect(onSelectSkill).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'image-generation',
      interaction: { type: 'workspace', workspace: 'image-generation' }
    }));
  });

  it('shows a different set of Skills for each category', () => {
    const onSelectSkill = vi.fn();
    render(<CreatorDashboard onSelectSkill={onSelectSkill} />);

    expect(screen.getByRole('button', { name: '使用多语言视频翻译模板' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '数字人' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '内容营销' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '视频创作' }));

    expect(screen.getByRole('tab', { name: '视频创作' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('button', { name: /使用.+模板/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '使用视频翻译模板' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '使用视频下载模板' }));
    expect(onSelectSkill).toHaveBeenCalledWith(expect.objectContaining({
      id: 'video-download-category',
      title: '视频下载'
    }));
  });
});
