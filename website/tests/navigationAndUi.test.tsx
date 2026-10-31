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

    expect(screen.getAllByText('VeilGuard').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Investigating Bounded Adversarial Perturbations/i);
    expect(screen.getByRole('button', { name: /Launch Browser Privacy Tools/i })).toBeInTheDocument();
  });

  it('navigates to Privacy Tools page and renders upload zone', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /Main Navigation/i });
    const toolsBtn = within(nav).getByRole('button', { name: /Privacy Tools/i });
    fireEvent.click(toolsBtn);

    expect(await screen.findByText(/Image Metadata Inspector & Sanitizer/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop your photo here, or click to browse/i)).toBeInTheDocument();
  });

  it('navigates to Research page and displays empirical benchmark tables', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /Main Navigation/i });
    const researchBtn = within(nav).getByRole('button', { name: /Research & Benchmarks/i });
    fireEvent.click(researchBtn);

    expect(await screen.findByText(/Research Methodology & Empirical Benchmarks/i)).toBeInTheDocument();
    expect(screen.getByText(/Empirical Perceptual Quality Benchmark/i)).toBeInTheDocument();
    expect(screen.getByText(/Transformation Robustness Benchmark/i)).toBeInTheDocument();
    expect(screen.getByText(/32.86 dB/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0.9964/i).length).toBeGreaterThan(0);
  });

  it('navigates to Download page and honestly displays no-release message when 0 releases exist', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /Main Navigation/i });
    const downloadBtn = within(nav).getByRole('button', { name: /^Download$/i });
    fireEvent.click(downloadBtn);

    expect(await screen.findByText(/No verified binary release published yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Quickstart: Developer & Research Source Setup/i)).toBeInTheDocument();
  });

  it('navigates to About page and displays roadmap and licensing', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: /Main Navigation/i });
    const aboutBtn = within(nav).getByRole('button', { name: /About & Roadmap/i });
    fireEvent.click(aboutBtn);

    expect(await screen.findByRole('heading', { level: 1, name: /About VeilGuard/i })).toBeInTheDocument();
    expect(screen.getByText(/Milestone 1: Local-First Core Architecture/i)).toBeInTheDocument();
    expect(screen.getByText(/Milestone 2: Research Integration & PGD Feature Disruption/i)).toBeInTheDocument();
    expect(screen.getByText(/Milestone 3: Automated Zero-Budget Publication & CI/i)).toBeInTheDocument();
    expect(screen.getAllByText(/MIT License/i).length).toBeGreaterThan(0);
  });

  it('renders 404 NotFound page when given an unrecognized hash route', async () => {
    window.location.hash = '#unknown-random-route';
    render(<App />);

    expect(await screen.findByText(/404 • Page Not Found/i)).toBeInTheDocument();
    expect(screen.getByText(/Resource Does Not Exist/i)).toBeInTheDocument();

    const returnBtn = screen.getByRole('button', { name: /Return to Home/i });
    fireEvent.click(returnBtn);

    expect(await screen.findByText(/Investigating Bounded Adversarial Perturbations/i)).toBeInTheDocument();
  });

  it('toggles architecture tabs on the Home page without errors', async () => {
    render(<App />);

    const ipcTab = screen.getByRole('button', { name: /JSON IPC Stdio Protocol/i });
    fireEvent.click(ipcTab);
    expect(screen.getByText(/run_perturbation/i)).toBeInTheDocument();

    const boundsTab = screen.getByRole('button', { name: /On-Disk \$L_\\infty\$ Verification/i });
    fireEvent.click(boundsTab);
    expect(screen.getByText(/Parametric Bound/i)).toBeInTheDocument();
  });
});
