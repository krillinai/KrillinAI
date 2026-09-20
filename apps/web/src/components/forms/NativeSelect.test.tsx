import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import NativeSelect from './NativeSelect.js';

describe('NativeSelect', () => {
  it('preserves native labels, values, options, and change events', () => {
    const onChange = vi.fn();
    render(
      <label htmlFor="duration">Duration
        <NativeSelect id="duration" name="duration" className="duration-control" defaultValue="30" onChange={onChange}>
          <option value="30">30 seconds</option>
          <option value="60">60 seconds</option>
        </NativeSelect>
      </label>
    );

    const select = screen.getByRole('combobox', { name: 'Duration' });
    expect(select).toHaveValue('30');
    expect(select).toHaveAttribute('name', 'duration');
    expect(select).toHaveClass('duration-control', 'native-select-control');
    expect(select.parentElement?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.change(select, { target: { value: '60' } });
    expect(select).toHaveValue('60');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('preserves controlled values and disabled state', () => {
    render(
      <NativeSelect aria-label="Style" value="pencil" disabled onChange={vi.fn()}>
        <option value="pencil">Pencil</option>
      </NativeSelect>
    );
    expect(screen.getByRole('combobox', { name: 'Style' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveValue('pencil');
  });

  it('reserves text space and insets the noninteractive arrow from the right border', () => {
    const css = readFileSync('src/components/forms/native-select.css', 'utf8');
    expect(css).toContain('appearance: none;');
    expect(css).toContain('padding-inline-end: 40px;');
    expect(css).toContain('right: 12px;');
    expect(css).toContain('pointer-events: none;');
    expect(css).toContain('select:disabled + svg');
  });
});
