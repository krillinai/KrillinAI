import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Select from './NativeSelect.js';

const longOptions = Array.from({ length: 28 }, (_, index) => <option key={index} value={index}>{index === 27 ? 'Warm 温暖' : `Style ${index}`}</option>);

describe('shared Select, including NativeSelect compatibility', () => {
  it('uses a styled listbox and preserves labels, values, form data and real change events', () => {
    const onChange = vi.fn(event => {
      expect(event.target).toBeInstanceOf(HTMLSelectElement);
      expect(event.currentTarget.value).toBe('60');
    });
    render(<form aria-label="Settings"><label htmlFor="duration">Duration</label>
      <Select id="duration" name="duration" defaultValue="30" onChange={onChange}>
        <option value="30">30 seconds</option><option value="60">60 seconds</option>
      </Select></form>);
    const trigger = screen.getByRole('combobox', { name: 'Duration' });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveValue('30');
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: '30 seconds' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('option', { name: '60 seconds' }));
    expect(trigger).toHaveValue('60');
    expect(onChange).toHaveBeenCalledOnce();
    expect(new FormData(screen.getByRole('form') as HTMLFormElement).get('duration')).toBe('60');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports implicit labels and controlled values', () => {
    function Controlled() {
      const [value, setValue] = useState('first');
      return <label>Style<Select value={value} onChange={event => setValue(event.currentTarget.value)}>
        <option value="first">First</option><option value="second">Second</option>
      </Select></label>;
    }
    render(<Controlled />);
    const trigger = screen.getByRole('combobox', { name: 'Style' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Second' }));
    expect(trigger).toHaveValue('second');
  });

  it('does not open disabled controls or select disabled groups/options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Select aria-label="Style" disabled value="first" onChange={onChange}><option value="first">First</option></Select>);
    const trigger = screen.getByRole('combobox', { name: 'Style' });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    rerender(<Select aria-label="Style" value="first" onChange={onChange}>
      <option value="first">First</option><optgroup label="Unavailable" disabled><option value="second">Second</option></optgroup>
      <option value="hidden" hidden>Hidden</option><option value="last">Last</option>
    </Select>);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Second' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: 'Hidden' })).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledOnce();
    expect(trigger).toHaveValue('first');
  });

  it('supports arrows, Home/End, Escape and never submits the parent form', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={submit}><Select aria-label="Duration" defaultValue="a">
      <option value="a">Alpha</option><option value="b" disabled>Beta</option><option value="c">Charlie</option>
    </Select></form>);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    await user.keyboard('{Enter}{End}{Enter}');
    expect(trigger).toHaveValue('c');
    expect(submit).not.toHaveBeenCalled();
    await user.keyboard('{ArrowUp}{Home}{Escape}');
    expect(trigger).toHaveValue('c');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowDown}{Home}{Enter}');
    expect(trigger).toHaveValue('a');
  });

  it('searches long lists, handles empty results, and restores focus', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Voice style" defaultValue="0">{longOptions}</Select>);
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    const search = screen.getByRole('searchbox');
    expect(search).toHaveFocus();
    await user.type(search, 'warm');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.clear(search);
    await user.type(search, 'missing');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, '温暖{Enter}');
    expect(trigger).toHaveValue('27');
    expect(trigger).toHaveFocus();
  });

  it('closes on outside interaction, supports tabbing out of search, and closes when disabled', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<><Select aria-label="Style">{longOptions}</Select><button>Next</button></>);
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(trigger);
    rerender(<Select aria-label="Style" disabled>{longOptions}</Select>);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('resets form values and accepts updated options without firing a change', () => {
    const change = vi.fn();
    const { rerender } = render(<form aria-label="Settings"><Select aria-label="Style" name="style" defaultValue="a" onChange={change}>
      <option value="a">Alpha</option><option value="b">Beta</option>
    </Select><button type="reset">Reset</button></form>);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('combobox')).toHaveValue('a');
    expect(change).toHaveBeenCalledOnce();
    rerender(<Select aria-label="Style" value="b" onChange={change}><option value="b">Updated Beta</option></Select>);
    expect(screen.getByRole('combobox')).toHaveTextContent('Updated Beta');
    expect(change).toHaveBeenCalledOnce();
  });

  it('keeps nested dialogs open while interacting with a portaled filter', async () => {
    const user = userEvent.setup();
    const dismiss = vi.fn();
    render(<div role="dialog" aria-label="Voices" onKeyDown={event => { if (event.key === 'Escape') dismiss(); }}>
      <Select aria-label="Style">{longOptions}</Select>
    </div>);
    const outside = (event: Event) => { if (!screen.getByRole('dialog').contains(event.target as Node)) dismiss(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    try {
      await user.click(screen.getByRole('combobox'));
      await user.type(screen.getByRole('searchbox'), '温暖');
      await user.click(screen.getByRole('option', { name: 'Warm 温暖' }));
      expect(dismiss).not.toHaveBeenCalled();
      await user.click(screen.getByRole('combobox'));
      await user.keyboard('{Escape}');
      expect(dismiss).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    }
  });

  it('flips above a low trigger and keeps the list inside viewport edges', () => {
    render(<Select aria-label="Style"><option value="a">Alpha</option></Select>);
    const trigger = screen.getByRole('combobox');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 1000, right: 1040, top: 720, bottom: 760, width: 40, height: 40 } as DOMRect);
    fireEvent.click(trigger);
    const menu = screen.getByRole('listbox').parentElement!;
    expect(menu.style.transform).toBe('translateY(-100%)');
    expect(Number.parseFloat(menu.style.left) + Number.parseFloat(menu.style.width)).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(360);
  });
});
