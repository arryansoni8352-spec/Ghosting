import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../src/App';

describe('Website UI & Navigation Quality Gates', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as any);
  });

  it('renders brand header, navigation items, and hero title on Home', () => {
    render(<App />);

    expect(screen.getAllByText('GHOSTING').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/The invisible layer of privacy for your/i);
    expect(screen.getByText(/Zero Network Calls/i)).toBeInTheDocument();
    expect(screen.getByText(/Exact GPS Removal/i)).toBeInTheDocument();
  });

  it('navigates to Privacy Tools page and renders upload zone', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /Main Navigation/i });
    const toolsBtn = within(nav).getByRole('button', { name: /Photo Privacy|Privacy Tools/i });
    fireEvent.click(toolsBtn);

    expect(await screen.findByText(/Image Metadata Inspector & Sanitizer/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop your photo here, or click to browse/i)).toBeInTheDocument();
  });

  it('navigates to Video Studio page and displays video suite', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /Main Navigation/i });
    const videoBtn = within(nav).getByRole('button', { name: /Video Studio/i });
    fireEvent.click(videoBtn);

    expect(await screen.findByText(/Inspect, sanitize & protect your videos locally/i)).toBeInTheDocument();
    expect(screen.getByText(/Drop your video here, or click to browse/i)).toBeInTheDocument();
  });

  it('renders prominent drag-and-drop upload zone on Home', () => {
    render(<App />);

    expect(screen.getByText(/Drop your photo here, or click to browse/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Select Photo/i).length).toBeGreaterThan(0);
  });

  it('navigates to About page and displays mission and architecture', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /Main Navigation/i });
    const aboutBtn = within(nav).getByRole('button', { name: /^About$/i });
    fireEvent.click(aboutBtn);

    expect(await screen.findByRole('heading', { level: 1, name: /About GHOSTING/i })).toBeInTheDocument();
    expect(screen.getByText(/Absolute Local Privacy/i)).toBeInTheDocument();
    expect(screen.getByText(/Full Metadata Eradication/i)).toBeInTheDocument();
    expect(screen.getByText(/Lossless Orientation Normalization/i)).toBeInTheDocument();
  });

  it('navigates to Security page and displays zero-exposure architecture', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /Main Navigation/i });
    const secBtn = within(nav).getByRole('button', { name: /^Security$/i });
    fireEvent.click(secBtn);

    expect(await screen.findByRole('heading', { level: 1, name: /Security Policy & Reporting/i })).toBeInTheDocument();
    expect(screen.getByText(/Zero-Exposure Architecture/i)).toBeInTheDocument();
  });

  it('renders 404 NotFound page when given an unrecognized hash route', async () => {
    window.location.hash = '#unknown-random-route';
    render(<App />);

    expect(await screen.findByText(/404 • Page Not Found/i)).toBeInTheDocument();
    expect(screen.getByText(/Resource Does Not Exist/i)).toBeInTheDocument();

    const returnBtn = screen.getByRole('button', { name: /Return to Home/i });
    fireEvent.click(returnBtn);

    expect(await screen.findByText(/The invisible layer of privacy for your/i)).toBeInTheDocument();
  });
});
