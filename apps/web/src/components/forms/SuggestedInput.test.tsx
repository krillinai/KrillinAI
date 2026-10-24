import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SuggestedInput from './SuggestedInput.js';

describe('SuggestedInput', () => {
  it('allows arbitrary text and picking a suggestion through the shared listbox', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    function Field() {
      const [value, setValue] = useState('custom-model');
      return <SuggestedInput aria-label="Model" value={value} suggestions={['first-model', 'second-model']}
        onChange={next => { setValue(next); changed(next); }} />;
    }
    render(<Field />);
    const input = screen.getByRole('textbox', { name: 'Model' });
    expect(input).not.toHaveAttribute('list');
    await user.clear(input);
    await user.type(input, 'private-model');
    expect(input).toHaveValue('private-model');
    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.click(screen.getByRole('option', { name: 'second-model' }));
    expect(input).toHaveValue('second-model');
    expect(changed).toHaveBeenLastCalledWith('second-model');
  });

  it('keeps a normal input when no suggestions exist and respects disabled state', () => {
    const { rerender } = render(<SuggestedInput aria-label="Model" value="custom" suggestions={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    rerender(<SuggestedInput aria-label="Model" value="custom" suggestions={['first']} disabled onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
